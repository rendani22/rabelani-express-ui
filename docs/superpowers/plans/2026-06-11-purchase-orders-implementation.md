# Purchase Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement standalone purchase orders with inventory line items, then enforce cumulative remaining-quantity limits when creating orders from a PO number.

**Architecture:** Add first-class PO persistence in Supabase (`purchase_orders`, `purchase_order_items`, `purchase_order_item_allocations`) and wire a dedicated Angular PO service/UI around it. Extend order creation so PO mode auto-loads eligible PO items, supports subset selection, and submits allocation payload that is transactionally validated in the create-package edge function. PO status becomes derived from allocation completeness + linked package terminal statuses.

**Tech Stack:** Angular 21 standalone components + signals, Supabase Postgres migrations, Supabase Edge Functions (Deno TypeScript), Vitest unit tests.

---

## File Structure / Responsibility Map

- **Create:** `supabase/migrations/20260611120000_purchase_orders.sql`  
  Create PO tables, constraints, indexes, and helper SQL function/view for remaining quantities.
- **Modify:** `supabase/functions/create-package/index.ts`  
  Accept optional PO allocation payload, validate remaining quantities transactionally, write package + package_items + allocation rows atomically.
- **Create:** `src/app/features/purchase-orders/services/purchase-order-crud.service.ts`  
  Feature-local service for creating/loading standalone POs and resolving PO detail rows.
- **Modify:** `src/app/features/purchase-orders/services/purchase-orders.service.ts`  
  Move from inferred-by-packages to first-class PO query model; join linked package progress.
- **Modify:** `src/app/features/purchase-orders/purchase-orders.models.ts`  
  Add PO entity/item/allocation DTOs and status helpers.
- **Modify:** `src/app/features/purchase-orders/purchase-orders.ts`  
  Wire “Create PO” action and modal flow.
- **Modify:** `src/app/features/purchase-orders/purchase-orders.html`  
  Render ordered/allocated/remaining quantities and create action.
- **Create:** `src/app/shared/components/modals/create-purchase-order-modal/create-purchase-order-modal.component.ts`
- **Create:** `src/app/shared/components/modals/create-purchase-order-modal/create-purchase-order-modal.component.html`
- **Create:** `src/app/shared/components/modals/create-purchase-order-modal/create-purchase-order-modal.component.css`  
  New modal for standalone PO creation.
- **Modify:** `src/app/shared/components/modals/index.ts`  
  Export new create-purchase-order modal.
- **Modify:** `src/app/shared/components/modals/create-package-modal/create-package-modal.component.ts`  
  Add PO lookup mode, auto-fill selectable PO lines, enforce per-line remaining limits, submit PO allocations.
- **Modify:** `src/app/shared/components/modals/create-package-modal/create-package-modal.component.html`  
  Render PO item picker, remaining badges, and validation messages.
- **Modify:** `src/app/core/models/package.models.ts`  
  Extend create request types for PO allocation payload.
- **Modify:** `src/app/core/services/package.service.ts`  
  Add typed PO lookup helper for create-order modal.
- **Test Create:** `src/app/features/purchase-orders/services/purchase-orders.service.spec.ts`
- **Test Create:** `src/app/shared/components/modals/create-package-modal/create-package-modal.component.spec.ts`
- **Test Modify:** `src/app/features/orders/orders.spec.ts`  
  Validate integration points (modal open + refresh path) still work.

---

### Task 1: Add Supabase schema for first-class purchase orders

**Files:**
- Create: `supabase/migrations/20260611120000_purchase_orders.sql`

- [x] **Step 1: Write failing SQL assertions for expected tables/constraints**

```sql
-- Add at the end of the migration during authoring:
do $$
begin
  if to_regclass('public.purchase_orders') is null then
    raise exception 'purchase_orders table missing';
  end if;
  if to_regclass('public.purchase_order_items') is null then
    raise exception 'purchase_order_items table missing';
  end if;
  if to_regclass('public.purchase_order_item_allocations') is null then
    raise exception 'purchase_order_item_allocations table missing';
  end if;
end $$;
```

- [x] **Step 2: Run migration check to verify assertions fail before schema is added**

Run: `supabase db reset`  
Expected: FAIL with one of the `table missing` exceptions.

- [x] **Step 3: Write minimal migration schema + constraints**

```sql
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  status text not null default 'draft' check (status in ('draft','in_progress','completed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  ordered_quantity numeric not null check (ordered_quantity > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (purchase_order_id, inventory_item_id)
);

create table if not exists public.purchase_order_item_allocations (
  id uuid primary key default gen_random_uuid(),
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete cascade,
  package_item_id uuid not null references public.package_items(id) on delete cascade,
  allocated_quantity numeric not null check (allocated_quantity > 0),
  created_at timestamptz not null default timezone('utc', now())
);
```

- [x] **Step 4: Add helper view for ordered/allocated/remaining**

```sql
create or replace view public.purchase_order_item_balances as
select
  poi.id as purchase_order_item_id,
  poi.purchase_order_id,
  poi.inventory_item_id,
  poi.ordered_quantity,
  coalesce(sum(poa.allocated_quantity), 0) as allocated_quantity,
  poi.ordered_quantity - coalesce(sum(poa.allocated_quantity), 0) as remaining_quantity
from public.purchase_order_items poi
left join public.purchase_order_item_allocations poa
  on poa.purchase_order_item_id = poi.id
group by poi.id;
```

- [x] **Step 5: Re-run migration check**

Run: `supabase db reset`  
Expected: PASS; migration applies without errors.

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/20260611120000_purchase_orders.sql
git commit -m "feat: add purchase order schema and balances view"
```

---

### Task 2: Extend create-package edge function with PO allocation validation

**Files:**
- Modify: `supabase/functions/create-package/index.ts`

- [x] **Step 1: Write failing edge-function test case fixture inline**

```ts
// Add a local test payload block near existing request validation examples:
const poAllocationExample = {
  po_number: 'PO-1001',
  items: [{ quantity: 2, description: 'Item A', inventory_item_id: 'inv-1' }],
  po_allocations: [{ purchase_order_item_id: 'poi-1', item_index: 0, quantity: 2 }],
};
```

- [x] **Step 2: Run edge function unit checks**

Run: `npm test -- --watch=false`  
Expected: FAIL on new PO allocation validation path not implemented.

- [x] **Step 3: Add request typing and validation for `po_allocations`**

```ts
type PurchaseOrderAllocationRequest = {
  purchase_order_item_id: string;
  item_index: number;
  quantity: number;
};

function validatePoAllocations(
  allocations: PurchaseOrderAllocationRequest[] | undefined,
  itemCount: number,
): string | null {
  if (!allocations || allocations.length === 0) return null;
  for (const a of allocations) {
    if (!a.purchase_order_item_id || a.item_index < 0 || a.item_index >= itemCount || a.quantity <= 0) {
      return 'Invalid purchase order allocations payload';
    }
  }
  return null;
}
```

- [x] **Step 4: Enforce remaining quantity transactionally before insert**

```ts
// Inside the same transaction scope used for package/package_items inserts:
for (const allocation of poAllocations) {
  const { data: balanceRow, error: balanceError } = await supabase
    .from('purchase_order_item_balances')
    .select('remaining_quantity')
    .eq('purchase_order_item_id', allocation.purchase_order_item_id)
    .single();
  if (balanceError) throw new Error(balanceError.message);
  if ((balanceRow?.remaining_quantity ?? 0) < allocation.quantity) {
    throw new Error('Selected quantity exceeds remaining purchase order quantity');
  }
}
```

- [x] **Step 5: Persist allocation rows linked to created package items**

```ts
const allocationRows = poAllocations.map(a => ({
  purchase_order_item_id: a.purchase_order_item_id,
  package_item_id: createdPackageItems[a.item_index].id,
  allocated_quantity: a.quantity,
}));

const { error: allocError } = await supabase
  .from('purchase_order_item_allocations')
  .insert(allocationRows);
if (allocError) throw new Error(allocError.message);
```

- [x] **Step 6: Run tests**

Run: `npm test -- --watch=false`  
Expected: PASS with PO allocation validation covered.

- [x] **Step 7: Commit**

```bash
git add supabase/functions/create-package/index.ts
git commit -m "feat: enforce purchase-order allocations in create-package"
```

---

### Task 3: Add frontend PO models + service contracts

**Files:**
- Modify: `src/app/features/purchase-orders/purchase-orders.models.ts`
- Modify: `src/app/core/models/package.models.ts`
- Modify: `src/app/core/services/package.service.ts`

- [x] **Step 1: Write failing unit tests for PO model helpers**

```ts
// src/app/features/purchase-orders/services/purchase-orders.service.spec.ts
it('computes remaining quantity from ordered and allocated totals', () => {
  expect(computeRemainingQuantity(10, 4)).toBe(6);
});
```

- [x] **Step 2: Run targeted tests**

Run: `npm test -- --watch=false`  
Expected: FAIL with `computeRemainingQuantity` not defined.

- [x] **Step 3: Add PO item DTOs and quantity helper**

```ts
export interface PurchaseOrderItemBalance {
  readonly purchaseOrderItemId: string;
  readonly inventoryItemId: string;
  readonly orderedQuantity: number;
  readonly allocatedQuantity: number;
  readonly remainingQuantity: number;
}

export function computeRemainingQuantity(ordered: number, allocated: number): number {
  return Math.max(0, ordered - allocated);
}
```

- [x] **Step 4: Extend package creation types with PO allocation payload**

```ts
export interface PurchaseOrderAllocationRequest {
  readonly purchase_order_item_id: string;
  readonly item_index: number;
  readonly quantity: number;
}

export interface CreatePackageRequest {
  readonly receiver_email: string;
  readonly notes?: string;
  readonly status?: PackageStatus;
  readonly items?: readonly PackageItemRequest[];
  readonly delivery_location_id?: string;
  readonly po_number?: string;
  readonly po_allocations?: readonly PurchaseOrderAllocationRequest[];
}
```

- [x] **Step 5: Add PO lookup method in `PackageService`**

```ts
async getPurchaseOrderByNumber(poNumber: string): Promise<{
  success: boolean;
  data?: { poNumber: string; items: PurchaseOrderItemBalance[] };
  error?: string;
}> {
  const trimmed = poNumber.trim();
  if (!trimmed) return { success: false, error: 'PO number is required' };
  const { data, error } = await this.supabaseService.client
    .from('purchase_order_item_balances')
    .select('purchase_order_item_id,purchase_order_id,inventory_item_id,ordered_quantity,allocated_quantity,remaining_quantity,purchase_orders!inner(po_number)')
    .eq('purchase_orders.po_number', trimmed);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: {
      poNumber: trimmed,
      items: (data ?? []).map((r: any) => ({
        purchaseOrderItemId: r.purchase_order_item_id,
        inventoryItemId: r.inventory_item_id,
        orderedQuantity: Number(r.ordered_quantity),
        allocatedQuantity: Number(r.allocated_quantity),
        remainingQuantity: Number(r.remaining_quantity),
      })),
    },
  };
}
```

- [x] **Step 6: Re-run tests**

Run: `npm test -- --watch=false`  
Expected: PASS for model/service additions.

- [x] **Step 7: Commit**

```bash
git add src/app/features/purchase-orders/purchase-orders.models.ts src/app/core/models/package.models.ts src/app/core/services/package.service.ts src/app/features/purchase-orders/services/purchase-orders.service.spec.ts
git commit -m "feat: add purchase order frontend contracts and lookup"
```

---

### Task 4: Build standalone Create Purchase Order modal

**Files:**
- Create: `src/app/shared/components/modals/create-purchase-order-modal/create-purchase-order-modal.component.ts`
- Create: `src/app/shared/components/modals/create-purchase-order-modal/create-purchase-order-modal.component.html`
- Create: `src/app/shared/components/modals/create-purchase-order-modal/create-purchase-order-modal.component.css`
- Modify: `src/app/shared/components/modals/index.ts`

- [x] **Step 1: Write failing component test**

```ts
it('requires at least one PO line before submit', () => {
  component.form.controls.poNumber.setValue('PO-42');
  expect(component.form.valid).toBeFalse();
});
```

- [x] **Step 2: Run tests**

Run: `npm test -- --watch=false`  
Expected: FAIL because modal component and form do not exist.

- [x] **Step 3: Implement modal component with typed reactive form**

```ts
readonly form = this.fb.nonNullable.group({
  poNumber: ['', [Validators.required]],
  items: this.fb.array<FormGroup>([], [Validators.required, Validators.minLength(1)]),
});

addLine(): void {
  this.itemsArray.push(this.fb.nonNullable.group({
    inventoryItemId: ['', [Validators.required]],
    orderedQuantity: [1, [Validators.required, Validators.min(1)]],
  }));
}
```

- [x] **Step 4: Implement template UI and submit event**

```html
<form [formGroup]="form" (ngSubmit)="onSubmit()">
  <input formControlName="poNumber" placeholder="PO-12345" />
  <div formArrayName="items">
    @for (line of itemsArray.controls; track line; let i = $index) {
      <div [formGroupName]="i">
        <input formControlName="inventoryItemId" />
        <input type="number" formControlName="orderedQuantity" min="1" />
      </div>
    }
  </div>
  <button type="submit">Create PO</button>
</form>
```

- [x] **Step 5: Export modal in shared modals barrel**

```ts
export * from './create-purchase-order-modal/create-purchase-order-modal.component';
```

- [x] **Step 6: Run tests**

Run: `npm test -- --watch=false`  
Expected: PASS with new modal validation tests.

- [x] **Step 7: Commit**

```bash
git add src/app/shared/components/modals/create-purchase-order-modal src/app/shared/components/modals/index.ts
git commit -m "feat: add create purchase order modal"
```

---

### Task 5: Replace inferred purchase-order list with first-class PO data

**Files:**
- Create: `src/app/features/purchase-orders/services/purchase-order-crud.service.ts`
- Modify: `src/app/features/purchase-orders/services/purchase-orders.service.ts`
- Modify: `src/app/features/purchase-orders/purchase-orders.ts`
- Modify: `src/app/features/purchase-orders/purchase-orders.html`

- [x] **Step 1: Write failing service test for PO load source**

```ts
it('loads purchase orders from purchase_orders table instead of grouping packages by po_number', async () => {
  await service.load();
  expect(mockSupabase.from).toHaveBeenCalledWith('purchase_orders');
});
```

- [x] **Step 2: Run tests**

Run: `npm test -- --watch=false`  
Expected: FAIL (service still reads from `packages`).

- [x] **Step 3: Implement PO CRUD service**

```ts
async createPurchaseOrder(input: {
  poNumber: string;
  items: Array<{ inventoryItemId: string; orderedQuantity: number }>;
}): Promise<{ success: boolean; error?: string }> {
  const { data: po, error: poError } = await this.supabase.client
    .from('purchase_orders')
    .insert({ po_number: input.poNumber, status: 'draft' })
    .select('id')
    .single();
  if (poError) return { success: false, error: poError.message };
  const rows = input.items.map(item => ({
    purchase_order_id: po.id,
    inventory_item_id: item.inventoryItemId,
    ordered_quantity: item.orderedQuantity,
  }));
  const { error: itemError } = await this.supabase.client.from('purchase_order_items').insert(rows);
  return itemError ? { success: false, error: itemError.message } : { success: true };
}
```

- [x] **Step 4: Refactor PurchaseOrdersService load query**

```ts
const { data: orders, error } = await this.supabase.client
  .from('purchase_orders')
  .select(`
    id, po_number, status, created_at, updated_at,
    items:purchase_order_items(
      id, inventory_item_id, ordered_quantity,
      balances:purchase_order_item_balances(allocated_quantity, remaining_quantity)
    )
  `)
  .order('created_at', { ascending: false });
```

- [x] **Step 5: Wire Create PO action in component/template**

```ts
createPoModalOpen = signal(false);
onOpenCreatePo(): void { this.createPoModalOpen.set(true); }
onPurchaseOrderCreated(): void { this.createPoModalOpen.set(false); void this.service.load(); }
```

```html
<button type="button" (click)="onOpenCreatePo()">Create PO</button>
<app-create-purchase-order-modal
  [isOpen]="createPoModalOpen()"
  (closeModal)="createPoModalOpen.set(false)"
  (created)="onPurchaseOrderCreated()">
</app-create-purchase-order-modal>
```

- [x] **Step 6: Run tests**

Run: `npm test -- --watch=false`  
Expected: PASS; PO page uses first-class PO data and create action.

- [x] **Step 7: Commit**

```bash
git add src/app/features/purchase-orders/services/purchase-order-crud.service.ts src/app/features/purchase-orders/services/purchase-orders.service.ts src/app/features/purchase-orders/purchase-orders.ts src/app/features/purchase-orders/purchase-orders.html
git commit -m "feat: use standalone purchase orders in purchase-orders feature"
```

---

### Task 6: Add PO mode to create-order modal with subset + max remaining enforcement

**Files:**
- Modify: `src/app/shared/components/modals/create-package-modal/create-package-modal.component.ts`
- Modify: `src/app/shared/components/modals/create-package-modal/create-package-modal.component.html`

- [x] **Step 1: Write failing modal tests for PO quantity cap**

```ts
it('blocks selecting quantity above remaining for a PO line', async () => {
  component.form.controls.poNumber.setValue('PO-1001');
  await component.onPoLookup();
  component.itemsArray.at(0).get('quantity')?.setValue(99);
  expect(component.getItemError(0)).toContain('exceeds remaining');
});
```

- [x] **Step 2: Run tests**

Run: `npm test -- --watch=false`  
Expected: FAIL (PO mode does not exist yet).

- [x] **Step 3: Add PO lookup + line state to component**

```ts
readonly poLookupState = signal<'idle'|'loading'|'loaded'|'not_found'>('idle');
readonly poLines = signal<Array<{
  purchaseOrderItemId: string;
  inventoryItemId: string;
  remainingQuantity: number;
  selected: boolean;
}>>([]);

async onPoLookup(): Promise<void> {
  const po = this.form.controls.poNumber.value.trim();
  if (!po) return;
  this.poLookupState.set('loading');
  const result = await this.packageService.getPurchaseOrderByNumber(po);
  if (!result.success || !result.data || result.data.items.length === 0) {
    this.poLookupState.set('not_found');
    return;
  }
  this.poLines.set(result.data.items.map(i => ({
    purchaseOrderItemId: i.purchaseOrderItemId,
    inventoryItemId: i.inventoryItemId,
    remainingQuantity: i.remainingQuantity,
    selected: false,
  })));
  this.poLookupState.set('loaded');
}
```

- [x] **Step 4: Enforce quantity max per selected PO line + payload mapping**

```ts
const qtyControl = itemGroup.get('quantity');
qtyControl?.setValidators([
  Validators.required,
  Validators.min(1),
  Validators.max(selectedPoLine.remainingQuantity),
]);

const poAllocations = selectedLines.map((line, itemIndex) => ({
  purchase_order_item_id: line.purchaseOrderItemId,
  item_index: itemIndex,
  quantity: Number(this.itemsArray.at(itemIndex).get('quantity')?.value),
}));

return {
  ...baseRequest,
  po_allocations: poAllocations,
};
```

- [x] **Step 5: Update template to render PO line picker and remaining badges**

```html
@if (poLookupState() === 'loaded') {
  <div class="space-y-2">
    @for (line of poLines(); track line.purchaseOrderItemId) {
      <label>
        <input type="checkbox" [checked]="line.selected" (change)="togglePoLine(line.purchaseOrderItemId)" />
        Remaining: {{ line.remainingQuantity }}
      </label>
    }
  </div>
}
```

- [x] **Step 6: Run tests**

Run: `npm test -- --watch=false`  
Expected: PASS; over-quantity blocked and PO subset flow works.

- [x] **Step 7: Commit**

```bash
git add src/app/shared/components/modals/create-package-modal/create-package-modal.component.ts src/app/shared/components/modals/create-package-modal/create-package-modal.component.html src/app/shared/components/modals/create-package-modal/create-package-modal.component.spec.ts
git commit -m "feat: add purchase-order mode to create order modal"
```

---

### Task 7: Recompute and display PO completion/progress from linked orders

**Files:**
- Modify: `src/app/features/purchase-orders/purchase-orders.models.ts`
- Modify: `src/app/features/purchase-orders/services/purchase-orders.service.ts`
- Modify: `src/app/features/purchase-orders/purchase-orders.html`

- [x] **Step 1: Write failing status derivation tests**

```ts
it('returns completed only when remaining is zero and all linked orders are delivered/collected', () => {
  expect(derivePurchaseOrderStatusFromAllocations({
    remainingTotal: 0,
    packageStatuses: ['delivered', 'collected'],
  })).toBe('completed');
});
```

- [x] **Step 2: Run tests**

Run: `npm test -- --watch=false`  
Expected: FAIL because new status helper not implemented.

- [x] **Step 3: Implement status helper with completion rule**

```ts
export function derivePurchaseOrderStatusFromAllocations(input: {
  remainingTotal: number;
  packageStatuses: string[];
}): PurchaseOrderStatus {
  const allTerminal = input.packageStatuses.every(s => s === 'delivered' || s === 'collected');
  if (input.remainingTotal === 0 && allTerminal && input.packageStatuses.length > 0) return 'completed';
  if (input.packageStatuses.length === 0) return 'draft';
  return 'in_progress';
}
```

- [x] **Step 4: Surface ordered/allocated/remaining totals in service + template**

```ts
const remainingTotal = po.items.reduce((sum, line) => sum + line.remainingQuantity, 0);
const allocatedTotal = po.items.reduce((sum, line) => sum + line.allocatedQuantity, 0);
```

```html
<span>Ordered: {{ po.orderedTotal }}</span>
<span>Allocated: {{ po.allocatedTotal }}</span>
<span>Remaining: {{ po.remainingTotal }}</span>
```

- [x] **Step 5: Run tests**

Run: `npm test -- --watch=false`  
Expected: PASS; status and totals displayed correctly.

- [x] **Step 6: Commit**

```bash
git add src/app/features/purchase-orders/purchase-orders.models.ts src/app/features/purchase-orders/services/purchase-orders.service.ts src/app/features/purchase-orders/purchase-orders.html
git commit -m "feat: show purchase order allocation progress and completion"
```

---

### Task 8: Full regression pass and documentation update

**Files:**
- Modify: `src/app/features/orders/orders.spec.ts`
- Modify: `docs/superpowers/specs/2026-06-11-purchase-orders-design.md` (only if implementation-required clarifications differ)

- [x] **Step 1: Add failing integration assertion for Create Order modal with PO mode**

```ts
it('keeps Add Package flow available and refreshes table after successful PO-based creation', async () => {
  component.onAddPackage();
  expect(component.createPackageModalOpen).toBeTrue();
});
```

- [x] **Step 2: Run tests**

Run: `npm test -- --watch=false`  
Expected: FAIL if integration behavior regressed.

- [x] **Step 3: Apply minimal fixes for any regression**

```ts
onPackageCreated(packageData: Package): void {
  this.createPackageModalOpen = false;
  this.showQrCode(JSON.stringify(packageData));
  void this.loadPackages();
}
```

- [ ] **Step 4: Run full project validation**

Run: `npm test -- --watch=false && npm run build`  
Expected: PASS with successful test suite and production build.

- [ ] **Step 5: Commit final integration + test updates**

```bash
git add src/app/features/orders/orders.spec.ts docs/superpowers/specs/2026-06-11-purchase-orders-design.md
git commit -m "test: cover purchase order create-order integration"
```

---

## Self-Review Checklist (completed)

- Spec coverage: every approved spec section (schema, transactional validation, create-PO UI, create-order subset flow, completion logic, tests) is mapped to a dedicated task.
- Placeholder scan: no TODO/TBD placeholders or “similar to above” references remain.
- Type consistency: `po_allocations`, `purchase_order_item_id`, and remaining-quantity naming are consistent across migration, edge function, models, and modal tasks.


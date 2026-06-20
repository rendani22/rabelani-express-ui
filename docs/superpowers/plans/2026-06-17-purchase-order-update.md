# Purchase Order Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to update created purchase orders by editing `po_number` and existing line quantities, while blocking invalid updates (duplicate PO numbers, quantities below already allocated/used).

**Architecture:** Add an atomic Supabase RPC for PO updates, then expose it through `PurchaseOrderCrudService` and a new edit modal that plugs into the Purchase Orders page. Validation is duplicated at UI level for fast feedback and enforced in the RPC for data integrity. Edit access is restricted to first-class created POs with non-completed status.

**Tech Stack:** Angular standalone components + signals + reactive forms, Vitest, Supabase Postgres migrations/RPC, existing Purchase Orders feature services.

---

## File Structure

- Create: `supabase/migrations/20260617194000_update_purchase_order_with_items.sql`
  - Adds RPC to update PO header + quantities transactionally with guard validations.
- Modify: `src/app/features/purchase-orders/services/purchase-order-crud.service.ts`
  - Add typed read/update contracts and service methods for edit flow.
- Modify: `src/app/features/purchase-orders/services/purchase-order-crud.service.spec.ts`
  - Add TDD tests for new read/update methods and error paths.
- Create: `src/app/shared/components/modals/edit-purchase-order-modal/edit-purchase-order-modal.component.ts`
- Create: `src/app/shared/components/modals/edit-purchase-order-modal/edit-purchase-order-modal.component.html`
- Create: `src/app/shared/components/modals/edit-purchase-order-modal/edit-purchase-order-modal.component.css`
- Create: `src/app/shared/components/modals/edit-purchase-order-modal/edit-purchase-order-modal.component.spec.ts`
  - New edit modal with quantity floor validation from allocated/used amounts.
- Modify: `src/app/shared/components/modals/index.ts`
  - Export edit modal component/contracts.
- Modify: `src/app/features/purchase-orders/purchase-orders.ts`
  - Wire edit action visibility + modal state + submit flow.
- Modify: `src/app/features/purchase-orders/purchase-orders.html`
  - Add Edit button and modal usage.

### Task 1: Add Atomic SQL RPC for PO Updates

**Files:**
- Create: `supabase/migrations/20260617194000_update_purchase_order_with_items.sql`

- [ ] **Step 1: Write the failing SQL guard expectations in migration comments/test query notes**

```sql
-- Expected to fail:
-- 1) duplicate po_number update
-- 2) updating completed PO
-- 3) ordered_quantity < allocated/used quantity
```

- [ ] **Step 2: Run database migration check to confirm function does not yet exist**

Run:
```bash
supabase db diff --local
```
Expected: output does not include `update_purchase_order_with_items`.

- [ ] **Step 3: Implement RPC with validations and transactional updates**

```sql
CREATE OR REPLACE FUNCTION public.update_purchase_order_with_items(
  p_purchase_order_id uuid,
  p_po_number text,
  p_items jsonb
)
RETURNS TABLE(purchase_order_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_existing_id uuid;
  v_item jsonb;
  v_line_id uuid;
  v_ordered numeric;
  v_floor numeric;
BEGIN
  SELECT status INTO v_status FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'Completed purchase orders cannot be edited';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.purchase_orders
  WHERE po_number = trim(p_po_number) AND id <> p_purchase_order_id
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'A purchase order with this number already exists';
  END IF;

  UPDATE public.purchase_orders
  SET po_number = trim(p_po_number), updated_at = timezone('utc', now())
  WHERE id = p_purchase_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_id := (v_item->>'purchase_order_item_id')::uuid;
    v_ordered := (v_item->>'ordered_quantity')::numeric;

    SELECT COALESCE(SUM(poa.allocated_quantity), 0)
    INTO v_floor
    FROM public.purchase_order_item_allocations poa
    WHERE poa.purchase_order_item_id = v_line_id;

    IF v_ordered < v_floor THEN
      RAISE EXCEPTION 'Ordered quantity cannot be below allocated quantity for line %', v_line_id;
    END IF;

    UPDATE public.purchase_order_items
    SET ordered_quantity = v_ordered, updated_at = timezone('utc', now())
    WHERE id = v_line_id AND purchase_order_id = p_purchase_order_id;
  END LOOP;

  RETURN QUERY SELECT p_purchase_order_id;
END;
$$;
```

- [ ] **Step 4: Run migration verification**

Run:
```bash
supabase db diff --local
```
Expected: function present with no syntax errors in generated diff.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrationss/20260617194000_update_purchase_order_with_items.sql
git commit -m "feat: add atomic purchase-order update rpc"
```

### Task 2: Extend PurchaseOrderCrudService for Edit Flow

**Files:**
- Modify: `src/app/features/purchase-orders/services/purchase-order-crud.service.ts`
- Modify: `src/app/features/purchase-orders/services/purchase-order-crud.service.spec.ts`

- [ ] **Step 1: Write failing tests for load/update PO edit contracts**

```ts
it('loads editable PO payload for modal', async () => {
  const result = await service.getPurchaseOrderForEdit('po-id-1');
  expect(result.success).toBe(true);
});

it('returns duplicate error from update rpc', async () => {
  const result = await service.updatePurchaseOrder({
    purchaseOrderId: 'po-id-1',
    poNumber: 'PO-EXISTS',
    items: [{ purchaseOrderItemId: 'poi-1', orderedQuantity: 8 }],
  });
  expect(result.success).toBe(false);
});
```

- [ ] **Step 2: Run service tests to verify RED**

Run:
```bash
npx vitest run src/app/features/purchase-orders/services/purchase-order-crud.service.spec.ts
```
Expected: FAIL for missing `getPurchaseOrderForEdit` / `updatePurchaseOrder`.

- [ ] **Step 3: Implement minimal service methods and types**

```ts
export interface UpdatePurchaseOrderInput {
  readonly purchaseOrderId: string;
  readonly poNumber: string;
  readonly items: readonly { purchaseOrderItemId: string; orderedQuantity: number }[];
}

async updatePurchaseOrder(input: UpdatePurchaseOrderInput): Promise<PurchaseOrderCrudResult> {
  const { data, error } = await this.supabase.client.rpc('update_purchase_order_with_items', {
    p_purchase_order_id: input.purchaseOrderId,
    p_po_number: input.poNumber.trim(),
    p_items: input.items.map(i => ({
      purchase_order_item_id: i.purchaseOrderItemId,
      ordered_quantity: Number(i.orderedQuantity),
    })),
  }).single();
  if (error) return { success: false, error: error.message };
  return (data as { purchase_order_id?: string } | null)?.purchase_order_id
    ? { success: true }
    : { success: false, error: 'Failed to update purchase order' };
}
```

- [ ] **Step 4: Re-run service tests to verify GREEN**

Run:
```bash
npx vitest run src/app/features/purchase-orders/services/purchase-order-crud.service.spec.ts
```
Expected: PASS for new edit service tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/purchase-orders/services/purchase-order-crud.service.ts src/app/features/purchase-orders/services/purchase-order-crud.service.spec.ts
git commit -m "feat: add purchase-order edit service methods"
```

### Task 3: Build Edit Purchase Order Modal (TDD)

**Files:**
- Create: `src/app/shared/components/modals/edit-purchase-order-modal/edit-purchase-order-modal.component.ts`
- Create: `src/app/shared/components/modals/edit-purchase-order-modal/edit-purchase-order-modal.component.html`
- Create: `src/app/shared/components/modals/edit-purchase-order-modal/edit-purchase-order-modal.component.css`
- Create: `src/app/shared/components/modals/edit-purchase-order-modal/edit-purchase-order-modal.component.spec.ts`
- Modify: `src/app/shared/components/modals/index.ts`

- [ ] **Step 1: Write failing modal tests for quantity-floor and po-number validation**

```ts
it('blocks save when ordered quantity is below min allowed quantity', () => {
  component.setModel({
    poNumber: 'PO-1',
    items: [{ purchaseOrderItemId: 'poi-1', orderedQuantity: 5, minAllowedQuantity: 4 }],
  });
  component.form.controls.items.at(0).controls.orderedQuantity.setValue(3);
  expect(component.form.valid).toBe(false);
});

it('trims po number and emits update payload', () => {
  component.form.controls.poNumber.setValue('  PO-2  ');
  component.onSubmit();
  expect(emitted.poNumber).toBe('PO-2');
});
```

- [ ] **Step 2: Run modal spec to verify RED**

Run:
```bash
npx vitest run src/app/shared/components/modals/edit-purchase-order-modal/edit-purchase-order-modal.component.spec.ts
```
Expected: FAIL because modal component does not exist yet.

- [ ] **Step 3: Implement modal with reactive form and emit contract**

```ts
readonly form = this.fb.nonNullable.group({
  poNumber: this.fb.nonNullable.control('', [Validators.required]),
  items: this.fb.array<FormGroup>([]),
});

private lineGroup(line: EditPurchaseOrderLine): FormGroup {
  return this.fb.nonNullable.group({
    purchaseOrderItemId: [line.purchaseOrderItemId, [Validators.required]],
    orderedQuantity: [line.orderedQuantity, [Validators.required, Validators.min(line.minAllowedQuantity)]],
  });
}
```

- [ ] **Step 4: Export modal via shared modals barrel**

```ts
export * from './edit-purchase-order-modal/edit-purchase-order-modal.component';
```

- [ ] **Step 5: Re-run modal spec to verify GREEN**

Run:
```bash
npx vitest run src/app/shared/components/modals/edit-purchase-order-modal/edit-purchase-order-modal.component.spec.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/shared/components/modals/edit-purchase-order-modal src/app/shared/components/modals/index.ts
git commit -m "feat: add edit purchase-order modal with validations"
```

### Task 4: Wire Edit Flow into Purchase Orders Page

**Files:**
- Modify: `src/app/features/purchase-orders/purchase-orders.ts`
- Modify: `src/app/features/purchase-orders/purchase-orders.html`

- [ ] **Step 1: Write failing page-level tests for edit action visibility and save flow**

```ts
it('shows edit action only for created non-completed POs', () => {
  expect(component.canEdit(createdInProgressPo)).toBe(true);
  expect(component.canEdit(createdCompletedPo)).toBe(false);
  expect(component.canEdit(orderDerivedPo)).toBe(false);
});
```

- [ ] **Step 2: Run feature tests to verify RED**

Run:
```bash
npx vitest run src/app/features/purchase-orders/**/*.spec.ts
```
Expected: FAIL for missing edit wiring.

- [ ] **Step 3: Add modal state + handlers and visibility helper**

```ts
readonly editPoModalOpen = signal(false);
readonly editingPo = signal<PurchaseOrder | null>(null);

canEdit(po: PurchaseOrder): boolean {
  return po.source === 'purchase_order' && po.derivedStatus !== 'completed';
}
```

- [ ] **Step 4: Update template with Edit button + modal binding**

```html
@if (canEdit(po)) {
  <button type="button" (click)="onOpenEditPo(po)">Edit</button>
}
<app-edit-purchase-order-modal
  [isOpen]="editPoModalOpen()"
  (updated)="onPurchaseOrderUpdated($event)"
  (closeModal)="onCloseEditPo()" />
```

- [ ] **Step 5: Re-run feature tests to verify GREEN**

Run:
```bash
npx vitest run src/app/features/purchase-orders/**/*.spec.ts
```
Expected: PASS for new edit visibility/update tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/purchase-orders/purchase-orders.ts src/app/features/purchase-orders/purchase-orders.html
git commit -m "feat: wire purchase-order edit flow in page"
```

### Task 5: Final Verification and Integration Safety

**Files:**
- Modify (if needed): `src/app/features/purchase-orders/services/purchase-order-crud.service.spec.ts`
- Modify (if needed): `src/app/features/purchase-orders/purchase-orders.ts`
- Modify (if needed): `src/app/shared/components/modals/edit-purchase-order-modal/edit-purchase-order-modal.component.spec.ts`

- [ ] **Step 1: Add regression test for duplicate PO number error surfacing**

```ts
it('shows duplicate po-number message from service in modal submit flow', async () => {
  crudService.updatePurchaseOrder.mockResolvedValue({ success: false, error: 'A purchase order with this number already exists' });
  await component.onPurchaseOrderUpdated(payload);
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('already exists'));
});
```

- [ ] **Step 2: Run focused regression tests**

Run:
```bash
npx vitest run src/app/features/purchase-orders/services/purchase-order-crud.service.spec.ts src/app/shared/components/modals/edit-purchase-order-modal/edit-purchase-order-modal.component.spec.ts
```
Expected: PASS.

- [ ] **Step 3: Run broader PO feature suite**

Run:
```bash
npx vitest run src/app/features/purchase-orders/**/*.spec.ts src/app/shared/components/modals/create-purchase-order-modal/create-purchase-order-modal.component.spec.ts
```
Expected: PASS with no new PO regressions.

- [ ] **Step 4: Commit final stabilization updates**

```bash
git add src/app/features/purchase-orders src/app/shared/components/modals/edit-purchase-order-modal
git commit -m "test: add purchase-order edit regressions"
```


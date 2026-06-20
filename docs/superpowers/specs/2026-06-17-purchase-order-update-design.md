# Purchase Order Update Design

## Goal
Enable updating **created purchase orders** from the Purchase Orders page, with support for:
- editing `po_number`
- editing existing line `ordered_quantity`

Out of scope for this iteration:
- adding/removing PO lines
- editing order-derived (`source: order`) entries

## User-Approved Rules
1. Editable scope: **first-class created POs only**.
2. Status scope: **all statuses except completed**.
3. Duplicate handling: changing `po_number` to an existing one must be blocked with an explicit duplicate error.
4. Quantity safety: new line quantity must **not** be lower than already allocated/used quantity; save must be blocked with clear feedback.

## Architecture
### UI entry points
- Add an **Edit** action on Purchase Orders rows.
- Show Edit action only when:
  - `po.source === 'purchase_order'`
  - `po.derivedStatus !== 'completed'`

### Edit modal
- Add `EditPurchaseOrderModalComponent` under shared modals, aligned with existing create-PO modal patterns.
- Prefill with:
  - current `poNumber`
  - current PO lines (`inventoryItemId`, display name, ordered quantity)
  - per-line minimum allowed quantity (`minAllowedQuantity`) based on allocated/used quantity
- Editable fields:
  - `poNumber`
  - each line `orderedQuantity`

### Service layer
- Extend `PurchaseOrderCrudService` with:
  - `getPurchaseOrderForEdit(poNumber: string)` (or ID-based equivalent)
  - `updatePurchaseOrder(input)`
- Keep API contract typed with explicit success/error result unions.

### Database layer (atomic update)
- Add a new RPC (proposed): `update_purchase_order_with_items`.
- RPC responsibilities (single transaction):
  1. validate PO exists and is editable
  2. validate target `po_number` uniqueness when changed
  3. validate each updated line `ordered_quantity >= used_or_allocated_quantity`
  4. update PO header and lines
  5. return success payload (updated identifiers/timestamps)

## Data Flow
1. User clicks Edit.
2. Frontend requests editable PO payload.
3. Modal renders current values with line-level minimum constraints.
4. User saves.
5. Frontend sends update payload to CRUD service.
6. RPC validates + updates atomically.
7. On success: close modal, show success toast, refresh PO list.
8. On failure: keep modal open, show validation/server error.

## Validation and Error Handling
### Frontend validation
- `poNumber`: required + trimmed non-empty.
- `orderedQuantity`: required, numeric, `>= 1`, and `>= minAllowedQuantity`.

### Backend validation (authoritative)
- PO must be first-class created PO and not completed.
- New `po_number` must be unique.
- Quantity floor per line must not be violated.

### Error UX
- Duplicate number -> explicit duplicate message.
- Quantity below allocated/used -> explicit line/global validation message.
- Generic RPC failure -> toast/modal error without losing user edits.

## Testing Strategy
1. `PurchaseOrderCrudService` tests:
   - update payload mapping
   - success path
   - duplicate and validation error propagation
2. Edit modal tests:
   - rejects whitespace PO number
   - blocks quantities below min allowed
   - emits valid update request
3. Purchase Orders page tests:
   - Edit action visibility rules
   - success refresh flow
   - error display behavior
4. SQL/RPC validation checks:
   - guard clauses for non-editable status/source
   - quantity floor enforcement
   - duplicate `po_number` rejection

## Rollout Notes
- Behavior is additive; create-PO and order-creation flows remain unchanged.
- Existing completion/progress calculation remains unchanged by this feature.

# Purchase Orders as Standalone Planning Records

## 1. Goal

Enable users to create a purchase order (PO) first, with a list of inventory items and ordered quantities, then later create one or more delivery orders from that PO by entering its PO number.  
When creating an order from a PO, users may select only a subset of PO items, but each selected quantity must never exceed the remaining quantity on that PO item.

## 2. Scope

In scope:
- Standalone PO creation from the Purchase Orders page
- PO item lines linked to inventory items
- Order creation from PO number with subset selection
- Strict cumulative quantity enforcement across multiple orders
- PO progress and completion tracking tied to linked order statuses

Out of scope:
- Supplier invoicing/accounting workflows
- Non-inventory free-text PO lines
- Cross-PO order line mixing in PO mode

## 3. Domain Model

### 3.1 New tables

1. `purchase_orders`
   - `id` (uuid, pk)
   - `po_number` (text, unique, required)
   - `status` (text: `draft | in_progress | completed`)
   - `created_at`, `updated_at`

2. `purchase_order_items`
   - `id` (uuid, pk)
   - `purchase_order_id` (uuid, fk -> purchase_orders.id, required)
   - `inventory_item_id` (uuid, fk -> inventory_items.id, required)
   - `ordered_quantity` (numeric/int > 0, required)
   - Unique constraint on (`purchase_order_id`, `inventory_item_id`)

3. `purchase_order_item_allocations`
   - `id` (uuid, pk)
   - `purchase_order_item_id` (uuid, fk -> purchase_order_items.id, required)
   - `package_item_id` (uuid, fk -> package_items.id, required)
   - `allocated_quantity` (numeric/int > 0, required)

### 3.2 Derived quantity

For each PO item:
- `allocated_quantity_total = SUM(purchase_order_item_allocations.allocated_quantity)`
- `remaining_quantity = ordered_quantity - allocated_quantity_total`

Invariant:
- `0 <= allocated_quantity_total <= ordered_quantity`

### 3.3 PO completion semantics

A PO is `completed` only when both are true:
1. Every PO item has `remaining_quantity = 0`
2. All linked orders/packages created from those allocations are in terminal status (`delivered` or `collected`)

Otherwise:
- `draft`: PO exists with no active linked orders yet
- `in_progress`: partially allocated and/or allocations exist with non-terminal linked orders

## 4. Backend/API Design

### 4.1 Create PO

Add a PO creation endpoint/edge function:
- Input: `po_number`, `items[]` (`inventory_item_id`, `ordered_quantity`)
- Validation:
  - PO number required and unique
  - At least one item
  - Positive quantities
  - No duplicate inventory item lines
- Writes purchase order and items transactionally

### 4.2 Lookup PO by number

Add PO lookup endpoint used by the Create Order modal:
- Input: `po_number`
- Output:
  - PO metadata
  - PO items with `ordered`, `allocated`, `remaining`
  - linked order summary (for context/progress)

### 4.3 Create order from PO

Extend existing package creation flow with optional PO allocation payload:
- Input adds allocation rows per selected line:
  - `purchase_order_item_id`
  - `allocated_quantity`
- Server-side transactional checks:
  - each allocation > 0
  - each allocation <= current remaining (checked at commit time)
- Atomic write:
  - create package + package_items
  - create allocation rows linked to new `package_items`
  - fail whole transaction on over-allocation or inconsistency

### 4.4 Lifecycle updates

When linked order status changes, order item edits happen, or linked orders are deleted/cancelled:
- Recompute allocations/remaining quantities
- Recompute PO status with completion rule above

## 5. UI/UX Design

### 5.1 Purchase Orders page

Add primary action: **Create PO**.

### 5.2 Create PO modal

Fields:
- PO number
- Item list (inventory-backed only)
- Ordered quantity per item

Behavior:
- Add/remove item rows
- Prevent duplicate inventory item rows
- Require positive quantity
- Submit creates standalone PO record (no order created yet)

### 5.3 Create Order modal (PO mode)

When user enters a valid PO number:
1. Auto-load PO lines with remaining quantities
2. Enable selecting only desired subset for current delivery
3. Quantity input capped by remaining amount per selected line
4. Disallow adding non-PO items while PO mode is active

User feedback:
- Show `Remaining: X` per line
- Inline validation if user exceeds remaining
- Clear error when PO number is invalid/not found

## 6. Error Handling

- Over-allocation is a hard failure at API level with explicit message
- UI blocks obvious over-limit input, but backend remains authoritative
- If concurrent users consume quantities, the second conflicting request fails and prompts refresh

## 7. Testing Strategy

1. Unit tests
   - remaining quantity calculation
   - PO status derivation (draft/in_progress/completed)

2. Service/API tests
   - create PO validation rules
   - create order from PO with valid/invalid allocations
   - race-condition/parallel allocation guard behavior

3. UI tests
   - PO creation modal validations
   - Create Order PO auto-fill behavior
   - subset selection and quantity limits
   - invalid PO number and over-quantity messaging

4. Regression tests
   - existing non-PO order creation unchanged
   - existing package status flows still work

## 8. Migration and Rollout Notes

- Add new DB tables and constraints first
- Deploy PO endpoints/edge-function updates
- Release UI changes after backend support is live
- Keep backward compatibility: orders without PO allocations remain supported


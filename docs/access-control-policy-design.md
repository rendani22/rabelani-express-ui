# Access Control & Policy Management — Design

Status: agreed, not yet implemented. Produced from a grilling session on 2026-07-14.

## The problem

There is effectively no role-based access control today.

- 7 staff roles exist in the `staff_role` enum; only `admin` is ever checked.
- The only frontend gate is `isCurrentUserAdmin()` (`src/lib/api/staff.ts:33`), a literal `role === 'admin'`. `canDeleteOrders()` (`src/lib/api/packages.ts:115`) is a one-line alias of it.
- `<ProtectedRoute>` takes no role prop. All 13 staff routes sit under one `<StaffRoute>` that only separates staff from customers. The sidebar (`src/components/layout/nav-items.ts`) is a static list rendered to everyone.
- The RLS floor is `is_active_staff()` — any active staff member can read *and write* inventory, PODs, receiver contacts and delivery locations regardless of role.
- `manager`, `staff`, `viewer` are inert: checked nowhere, never offered in the user dialog.

## Decisions

| Question | Decision |
|---|---|
| Enforcement boundary | **Postgres.** Permissions live in DB tables; RLS, `SECURITY DEFINER` RPCs and edge functions all call one `has_permission()`. The UI reads the same permissions but hiding is cosmetic. |
| Policy model | **Roles + per-user overrides.** Role carries the default set; admin can grant/deny individual permissions on a specific user. |
| Scope | **Action-level only.** No per-company row scoping for staff in v1 — schema shaped so it can be added later. |
| Existing holes | **Fixed first**, as a prerequisite migration (Phase 0). |
| Granularity | **Feature × verb**, ~35 permissions. |
| Sensitive data | **Permission-gated RPCs.** `dashboard.exec.view` / `sla.export` checked inside the `SECURITY DEFINER` functions, which raise `42501` without them. |
| Admin role | **Hardcoded superuser.** Active admin ⇒ `has_permission()` returns true unconditionally. Checkboxes shown but locked. Last-admin protection: cannot deactivate or demote the final active admin. |
| Principals | **Staff only.** Customer portal (buyer/runner) keeps its existing row-level RLS, which is already correct. |
| Roles | **All 7 defined properly.** |
| Migration | **Behaviour-preserving**, with three deliberate deviations (below). |
| Denied UX | **Disabled + tooltip** ("You don't have permission for this — ask an admin"). Routes deep-linked without permission show the existing `ShieldX` no-access screen. |
| Override precedence | explicit user **deny** > explicit user **grant** > role default. Tri-state: grant / deny / inherit. |

## Schema

```
permissions          (key text PK, feature text, label text, description text, is_sensitive bool)
role_permissions     (role staff_role, permission_key text)          -- admin-editable
user_permissions     (user_id uuid, permission_key text, effect 'grant'|'deny')  -- override layer
```

```sql
create function public.has_permission(p_key text) returns boolean
  language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from staff_profiles sp
                 where sp.user_id = auth.uid() and sp.is_active and sp.role = 'admin')
      then true
    when exists (select 1 from user_permissions up
                 where up.user_id = auth.uid() and up.permission_key = p_key and up.effect = 'deny')
      then false
    when exists (select 1 from user_permissions up
                 where up.user_id = auth.uid() and up.permission_key = p_key and up.effect = 'grant')
      then exists (select 1 from staff_profiles sp where sp.user_id = auth.uid() and sp.is_active)
    else exists (select 1 from staff_profiles sp
                 join role_permissions rp on rp.role = sp.role
                 where sp.user_id = auth.uid() and sp.is_active and rp.permission_key = p_key)
  end;
$$;
```

`STABLE` + `SECURITY DEFINER` so Postgres caches the result per statement rather than re-evaluating per row — this sits inside RLS on `packages` and `package_items`, the hottest tables.

## Permission catalog (~35)

| Feature | Permissions |
|---|---|
| Orders | `orders.read` `orders.create` `orders.update` `orders.delete` `orders.restore` `orders.delete_hard` `orders.export` `orders.audit.view` |
| POD | `pod.view` `pod.export_bulk` |
| Inventory | `inventory.read` `inventory.create` `inventory.update` `inventory.delete` `inventory.restock` `inventory.export` |
| Purchase orders | `purchase_orders.read` `purchase_orders.create` `purchase_orders.update` |
| Customers | `customers.read` `customers.create` `customers.update` `customers.deactivate` `customers.invite` |
| Companies | `companies.create` `companies.delete` |
| Locations | `locations.read` `locations.create` `locations.update` `locations.delete` |
| Drivers | `drivers.read` `drivers.track` (live GPS) |
| Users | `users.read` `users.manage` |
| Email | `email_templates.read` `email_templates.edit` `email.send_test` |
| Dashboards | `dashboard.ops.view` `dashboard.exec.view` (revenue) |
| Reports | `sla.export` (bulk customer PII) |
| Policies | `policies.manage` |

## Default role matrix

`admin` bypasses everything (superuser). ⚠ marks a deliberate deviation from current behaviour.

| Permission | manager | warehouse | collection | driver | staff | viewer |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| orders.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| orders.create | ✓ | ✓ | – | – | ✓ | – |
| orders.update | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| orders.delete (soft) | ✓ | – | – | – | – | – |
| orders.restore | ✓ | – | – | – | – | – |
| orders.delete_hard | – | – | – | – | – | – |
| orders.export | ✓ | ✓ | – | – | ✓ | – |
| orders.audit.view | ✓ | – | – | – | – | – |
| pod.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pod.export_bulk | – | – | – | – | – | – |
| inventory.read | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| inventory.create | ✓ | ✓ | – | – | – | – |
| inventory.update | ✓ | ✓ | – | – | – | – |
| inventory.delete | ✓ | ⚠ – | – | – | – | – |
| inventory.restock | ✓ | ✓ | – | – | – | – |
| inventory.export | ✓ | ✓ | – | – | – | – |
| purchase_orders.read | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| purchase_orders.create | ✓ | ✓ | – | – | ✓ | – |
| purchase_orders.update | ✓ | ✓ | – | – | – | – |
| customers.read | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| customers.create | ✓ | ✓ | – | – | ✓ | – |
| customers.update | ✓ | ✓ | – | – | ✓ | – |
| customers.deactivate | ✓ | ✓ | – | – | – | – |
| customers.invite | ✓ | ✓ | – | – | – | – |
| companies.create | ✓ | ✓ | – | – | – | – |
| companies.delete | – | – | – | – | – | – |
| locations.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| locations.create | ✓ | ✓ | – | – | – | – |
| locations.update | ✓ | ✓ | – | – | – | – |
| locations.delete | ✓ | – | – | – | – | – |
| drivers.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| drivers.track | ✓ | ✓ | – | – | – | ⚠ – |
| users.read | ✓ | ✓ | ✓ | – | ✓ | – |
| users.manage | – | – | – | – | – | – |
| email_templates.read | ✓ | ✓ | – | – | ✓ | – |
| email_templates.edit | – | – | – | – | – | – |
| email.send_test | – | – | – | – | – | – |
| dashboard.ops.view | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| dashboard.exec.view | ✓ | ⚠ – | – | – | – | – |
| sla.export | ✓ | ⚠ – | – | – | – | – |
| policies.manage | – | – | – | – | – | – |

**Deliberate deviations from "behaviour-preserving":**
1. `warehouse` loses inventory delete / bulk-delete (deactivate covers the real need; delete loses movement history).
2. `warehouse` loses the Executive revenue dashboard and the SLA PII export. Today the Executive tab renders unconditionally (`src/pages/dashboard/index.tsx:103`) despite `executive-dashboard.ts:433` documenting it as admin-only — that is a bug, not a feature.
3. `manager` / `staff` / `viewer` are seeded by intent. Today they inherit full staff write access via `is_active_staff()`; assumed nobody holds these roles. The migration includes a guard that **fails loudly** if it finds a user with one.

## Phase 0 — hardening (prerequisite, ships before any policy work)

These are live holes today. A policy UI on top of them is theatre.

1. **`get_sla_breaches` / `get_executive_metrics` / `get_dashboard_metrics`** — `SECURITY DEFINER` with `GRANT EXECUTE TO authenticated` and no staff check. A logged-in *customer* can call them and pull every breaching order's receiver email + phone, and the whole revenue picture. Add permission checks; revoke from `anon`.
2. **`create_package_with_items_and_allocations`** — takes `p_created_by` as a parameter, never compares it to `auth.uid()`. Any authenticated user can forge authorship.
3. **`decrement_inventory_quantity`** — `SECURITY DEFINER`, bare `UPDATE`, no caller check.
4. **`allocate_purchase_order_item_allocations`** — validates payload shape only, no caller check.
5. **`TRUNCATE` granted to `anon` and `authenticated`** on every public table in the base migration — including `audit_logs`, which RLS otherwise makes immutable. Revoke.
6. **`pods` SELECT policy checks `role` but not `is_active`** — a deactivated staff member still reads every POD. Same omission on the admin write policies for `delivery_locations`, `receiver_profiles`, `staff_profiles`.
7. **Hard delete** (`deletePackage` / `deletePackages`, `packages.ts:1035,1057`) has no guard, unlike the soft-delete path.
8. **`delivery-photos` storage** — insert/update open to any authenticated user, select open to `anon`.
9. **`create-staff` edge function** checks `role === 'admin'` but not `is_active`.
10. **`/style-guide`** sits outside `<ProtectedRoute>`.

## Build status

All five phases are written. **No SQL has been executed** — Docker/Postgres were unavailable locally, so the migrations have not been replayed. Frontend builds and all tests pass.

| Phase | Artefact |
|---|---|
| 0 | `supabase/migrations/20260714190000_phase0_access_control_hardening.sql` + hard-delete guard, `create-staff` `is_active`, `/style-guide` behind auth |
| 1 | `supabase/migrations/20260714200000_phase1_policy_schema.sql` — tables, `has_permission()`, `my_permissions()`, seed, orphan-role guard, last-admin trigger |
| 2 | `supabase/migrations/20260714210000_phase2_enforce_permissions.sql` — RLS + RPC rewrite; 5 edge functions |
| 3 | `src/lib/api/permissions.ts`, `src/hooks/use-permissions.ts`, `src/components/dispatch/permission-button.tsx`, `src/components/permission-route.tsx`, permission-tagged nav |
| 4 | `src/pages/access-control/index.tsx` — Roles grid + People overrides, at `/access-control` |
| 5 | `supabase/migrations/20260714220000_phase5_policy_audit.sql` — policy changes → `audit_logs` |

### Deviations discovered during the build

- **Customers and delivery locations were admin-only in RLS** while the UI showed the buttons to everyone (so non-admins got an RLS error). Resolved in favour of the matrix: warehouse and manager can now create/edit both. This is a genuine loosening vs the database, and a fix vs the UI.
- **`package_items` DELETE** moves from admin-only to `orders.update`, matching the path the app actually takes (the item editor deletes through the service-role edge function, which never checked for admin).
- **`update-package` keeps a `driver`-only role fallback.** Scoped to that one role deliberately: a general fallback would make per-user denies unenforceable on that endpoint.
- **`driver-pickup` and `receive-at-collection`** are in `EDGE_FUNCTIONS` but do not exist in this repo — deployed out-of-tree, untouched, unaudited.

## Work order

- **Phase 0** — hardening migration. No behaviour change for legitimate users.
- **Phase 1** — policy schema, `has_permission()`, seed catalog + role defaults (with the guard for orphaned roles).
- **Phase 2** — rewrite RLS predicates and `SECURITY DEFINER` RPCs to call `has_permission()`. Edge functions swap their hardcoded role lists — **except `update-package` and `driver-pickup`, where the existing role check stays as an OR-fallback** so the driver mobile app in the field cannot break. Remove the fallback only once driver defaults are confirmed against the app.
- **Phase 3** — frontend. `useCurrentPrincipal` currently discards the staff role (`use-current-principal.ts:25`); it grows `role`, `permissions: Set<string>` and `can(key)`. Nav items and route guards take a `permission` field. Buttons render disabled + tooltip.
- **Phase 4** — admin Policies screen: roles tab (role × permission grid, `admin` column locked) and users tab (per-user tri-state overrides). Gated on `policies.manage`.
- **Phase 5** — audit. Policy changes written to `audit_logs`.

## Known consequences, accepted

- Action-level only: anyone with `orders.read` reads every company's orders. Fine while all staff are internal; revisit before onboarding a third-party contractor.
- A revoked user's cached UI may still show a button for a few minutes (react-query staleTime). The write fails at the DB. Correct, not a bug.

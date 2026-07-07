# Implementation Plan — Customer Portal (Buyers & Runners)

_Date: 2026-07-07 · Branch: `feat/customer-portal`_

## Implementation status

**Code complete** (frontend build passes):
- Phase 1 — `supabase/migrations/20260707130000_customer_portal_schema.sql` (companies, receiver_role, receiver_profiles cols, packages.receiver_id + backfill, auto-link trigger)
- Phase 2 — `supabase/migrations/20260707140000_customer_portal_rls.sql` (is_active_staff()/current_customer() helpers, 13 SELECT + ~9 write policies locked to staff, companies policies, `customer_packages` view). Also the notes split (`20260707120000`).
- Phase 3 — `supabase/functions/invite-customer/` + `customer_invited` template in `_shared/email-templates.ts` + `deploy:invite-customer` script. Sends a **single** branded email (via Resend) containing the set-password link from `generateLink`; Supabase's own invite email is not used. `RESEND_API_KEY` is therefore **required** (the invite fails without it).
- Phase 4 — `lib/api/customers.ts`, `lib/api/customer-packages.ts`, `hooks/use-my-packages.ts`, `hooks/use-current-principal.ts`, `components/role-routes.tsx`, `components/layout/customer-layout.tsx`, `pages/my-packages.tsx`, `pages/accept-invite.tsx`, role-aware routing + login redirect in `App.tsx`/`login.tsx`.
- Phase 5 — `pages/directory/companies.tsx` (manage companies + invite dialog) + nav/route.

**⚠️ Not done here — must run against your infra:**
1. **Apply the migrations** (`supabase db push` or your migration flow) — staging first.
2. **Deploy** `invite-customer` (`npm run deploy:invite-customer`); set `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `CUSTOMER_PORTAL_URL`.
3. **Run the Phase 2 verification** with real staff / Buyer / Runner JWTs (see Phase 6). Nothing here was executed against a live DB.
4. Optional: seed a `customer_invited` row in `email_templates` (falls back to in-code HTML otherwise).
5. Edge-function delivers one email itself via Resend, so **`RESEND_API_KEY` (and `EMAIL_FROM`) are required** — the invite returns an error without them. New users get an `invite` link; already-registered users fall back to a `recovery` link. Verify both link types redirect to `/accept-invite` on your Supabase version.

## Summary

Let customers log into the existing app on a **read-only shell** and see packages scoped by role, enforced in Postgres:

- **Buyer** → every package under their **company**.
- **Runner** → only packages where **they are the receiver**.

"Customer" = a `receiver_profiles` row (the Customers page already reads that table). Customers never touch `packages` directly; they read a locked-down **`customer_packages` view** exposing only reference, PO number, status, notes, items, dates.

### Decisions locked during grilling
| # | Decision |
|---|----------|
| Entity | Customer = `receiver_profiles`; gains `company_id`, `role`, `auth_user_id` |
| Package link | Real `receiver_id` FK on `packages` (not email string) |
| Invite | **One** branded Resend email from the edge function (Supabase sends nothing). `generateLink` mints the set-password link; the email carries it |
| Frontend | Same app, separate `<CustomerLayout>`, read-only "My Packages" |
| Exposed columns | po_number, status, **customer_notes**, items, created/updated — **nothing else**. The internal `reference` is NOT exposed; customers see orders grouped by PO. |
| (a) | One company + exactly one role per customer |
| (b) | Existing receivers are non-login until invited; old packages backfilled by email; unmatched → staff-only |
| (c) | Custom-email packages **auto-create a receiver** (no orphaned/invisible packages) |

### ⚠️ Confirm before building
- ~~**`notes` exposure**~~ ✅ **Done** (migration `20260707120000_add_package_customer_notes.sql`): `notes` stays internal, new `customer_notes` is the customer-facing field. The `create-package`/`update-package` edge functions and their receiver emails now use `customer_notes`; the create dialog and details panel edit both fields. The view below exposes `customer_notes`.
- **`packages` must NOT force RLS** (it doesn't today) — the customer view relies on the table owner bypassing RLS. If `FORCE ROW LEVEL SECURITY` is ever added to `packages`, the view breaks.

---

## Phase 1 — Schema (migration `2026070Txxxxxx_customer_portal_schema.sql`)

```sql
-- Companies -----------------------------------------------------------------
create table public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);
alter table public.companies enable row level security;

-- Customer role --------------------------------------------------------------
create type public.receiver_role as enum ('buyer', 'runner');

-- receiver_profiles = the "customer". role/company/auth are NULL until invited.
alter table public.receiver_profiles
  add column company_id   uuid references public.companies(id),
  add column role         public.receiver_role,
  add column auth_user_id uuid references auth.users(id) unique;

create index on public.receiver_profiles(company_id);
create index on public.receiver_profiles(auth_user_id);

-- Real package → receiver FK -------------------------------------------------
alter table public.packages
  add column receiver_id uuid references public.receiver_profiles(id);
create index on public.packages(receiver_id);

-- Backfill existing packages by case-insensitive email match (decision b).
update public.packages p
set    receiver_id = rp.id
from   public.receiver_profiles rp
where  lower(p.receiver_email) = lower(rp.email)
  and  p.receiver_id is null;
-- Rows left NULL (incl. historical custom-email packages) stay staff-only.
```

**Keep-create-flow-unchanged trigger** (satisfies decision c *and* your "process stays the same" requirement — the `create-package` edge function needs **no** change):

```sql
create or replace function public.set_package_receiver()
returns trigger
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if new.receiver_id is null and new.receiver_email is not null then
    select id into rid from public.receiver_profiles
      where lower(email) = lower(new.receiver_email) limit 1;
    if rid is null then                       -- custom-email path → auto-create
      insert into public.receiver_profiles (name, surname, email)
      values (split_part(new.receiver_email, '@', 1), '', lower(new.receiver_email))
      returning id into rid;
    end if;
    new.receiver_id := rid;
  end if;
  return new;
end $$;

create trigger trg_set_package_receiver
  before insert on public.packages
  for each row execute function public.set_package_receiver();
```

---

## Phase 2 — RLS + customer view (migration `..._customer_portal_rls.sql`)

> **Model:** customers get access **only** through the view, which runs as its owner (bypassing `packages`' staff-only RLS) and scopes rows itself via `auth.uid()`. We deliberately add **no** customer policy to `packages`, so `from('packages')` returns 0 rows for a customer.

```sql
-- Who is the logged-in customer? (STABLE, definer, pinned search_path)
create or replace function public.current_customer()
returns public.receiver_profiles
language sql stable security definer set search_path = public as $$
  select * from public.receiver_profiles
  where auth_user_id = auth.uid() and role is not null
  limit 1;
$$;

-- Customer-facing, column-minimal, self-scoping view -------------------------
create or replace view public.customer_packages
with (security_invoker = false) as        -- runs as owner; scopes via WHERE
select
  p.id,
  p.reference,
  p.po_number,
  p.status,
  p.customer_notes,
  p.created_at,
  p.updated_at,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'description', pi.description, 'quantity', pi.quantity)
             order by pi.created_at)
    from public.package_items pi
    where pi.package_id = p.id
  ), '[]'::jsonb) as items
from public.packages p
where p.deleted_at is null
  and exists (
    select 1 from public.receiver_profiles me
    where me.auth_user_id = auth.uid()
      and me.role is not null
      and (
        (me.role = 'runner' and p.receiver_id = me.id)
        or
        (me.role = 'buyer'  and p.receiver_id in (
           select r.id from public.receiver_profiles r
           where r.company_id = me.company_id))
      )
  );

revoke all on public.customer_packages from anon;
grant select on public.customer_packages to authenticated;

-- Customers may read ONLY their own receiver row (name/role/company for the UI).
create policy "Customer reads own profile"
  on public.receiver_profiles for select to authenticated
  using (auth_user_id = auth.uid());

-- Companies: a customer may read only their own company.
create policy "Customer reads own company"
  on public.companies for select to authenticated
  using (id = (select company_id from public.current_customer()));
```

**Blast-radius audit (you accepted #7).** A customer JWT can hit every table. Verify each has RLS that a customer fails, and add a deny/staff-only policy where missing. `packages` is already staff-only (`20260630130000`). Go table-by-table against `RLS-AUDIT.md`:

```sql
-- Verification query — run as a Buyer and a Runner JWT in staging:
--   select count(*) from <table>;   -- must be 0 for every staff-only table
-- Tables to confirm: package_items, pods, purchase_orders, purchase_order_items,
-- purchase_order_item_allocations, inventory_items, inventory_movements,
-- package_item_catalog, staff_profiles, drivers/driver_locations,
-- delivery_locations, email_templates, notifications, audit_logs,
-- package_status_history, receiver_contacts.
```

Standard staff-only policy template for any table missing one:

```sql
alter table public.<t> enable row level security;
create policy "Active staff only" on public.<t> for select to authenticated
using (exists (select 1 from public.staff_profiles sp
               where sp.user_id = auth.uid() and sp.is_active));
```

---

## Phase 3 — Invite edge function (`supabase/functions/invite-customer/`)

Model on `create-package` (service-role client, `_shared/email-templates.ts` + Resend). Input: `{ email, name, surname, company_id, role }`. Guard: caller must be active staff.

Ordered, idempotent steps:
1. `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: <APP_URL>/accept-invite })`. If the user already exists, fall back to `admin.generateLink({ type: 'invite'|'recovery' })`.
2. Upsert `receiver_profiles` matched on `lower(email)`: set `auth_user_id = user.id`, `role`, `company_id`, and name/surname.
3. Send role-specific welcome email via Resend using a new template key `customer_invited`, passing a `role_capabilities` variable:
   - Buyer: "You can view every package ordered under **{{company_name}}**."
   - Runner: "You can view the packages assigned to you."
4. If step 3 fails, return success for the account but flag `emailSent:false` (retriable — re-invoking is a no-op thanks to the upsert + generateLink fallback).

Add `'customer_invited'` to `EmailTemplateKey`, `FALLBACK_TEMPLATES`, and seed a `public.email_templates` row (editable from the Email Templates admin page).

Deploy: add an `npm run deploy:invite-customer` script mirroring the existing deploy scripts.

---

## Phase 4 — Frontend

| File | Responsibility |
|------|----------------|
| `src/lib/api/customer-packages.ts` | `fetchMyPackages()` → `supabase.from('customer_packages').select('*')` |
| `src/hooks/use-my-packages.ts` | TanStack Query wrapper (`queryKey: ['customer-packages']`) |
| `src/lib/api/companies.ts` | Company CRUD (staff) |
| `src/lib/auth.tsx` (extend) or `src/hooks/use-current-receiver.ts` | Resolve `{ role, company_id }` for `auth.uid()` from `receiver_profiles` (own-row policy) |
| `src/components/protected-route.tsx` (extend) | Role-aware: `<StaffRoute>` blocks customers; `<CustomerRoute>` blocks staff — **redirect**, don't just hide nav |
| `src/components/layout/customer-layout.tsx` | Minimal shell: brand + sign-out only. No staff sidebar, no command palette, no exec dashboard |
| `src/pages/my-packages.tsx` | Read-only list from `customer_packages` (reference, status stamp, items, PO, dates) |
| `src/pages/accept-invite.tsx` | Handle the invite link → set password → redirect to `/my-packages` |
| `src/App.tsx` | Add `/accept-invite` (public) and a customer branch (`/my-packages` under `<CustomerRoute>` + `<CustomerLayout>`); post-login redirect by role |

Login redirect: after `signIn`, look up the receiver role — staff → `/dashboard`, customer → `/my-packages`.

---

## Phase 5 — Admin UI (staff-side)

| File | Change |
|------|--------|
| `src/pages/directory/companies.tsx` (new) | Manage companies |
| `src/pages/directory/customers.tsx` + `user-dialog`/customer dialog | Add **Company** (select) + **Role** (Buyer/Runner) fields; add an **Invite** action calling `invite-customer` |
| Nav (`components/layout/nav-items.ts`) | Add "Companies" for staff |

---

## Phase 6 — Verification (do not skip Phase 2's)

1. **Buyer JWT**: sees all company packages via `customer_packages`; `select from packages/pods/purchase_orders` → 0 rows; cannot open `/inventory` (redirected).
2. **Runner JWT**: sees only own packages; nothing from another receiver in the same company.
3. **Cross-company**: Buyer in Company A sees nothing from Company B.
4. **Column check**: `customer_packages` has no financial/signature/allocation columns.
5. **Invite**: staff invites → account created + `auth_user_id` linked + role email received; accept-invite sets password; re-invite is idempotent.
6. **Custom-email create**: staff creates a package with a hand-typed email → receiver auto-created, `receiver_id` set, package visible to that runner.
7. **Backfill**: pre-existing packages resolve to the right receiver; unmatched remain staff-only.

---

## Build order (each independently shippable)

1. Phase 1 schema + trigger + backfill.
2. **Phase 2 RLS + view + blast-radius audit** ← highest risk; review carefully.
3. Phase 3 invite function + email template.
4. Phase 4 customer shell + My Packages + accept-invite.
5. Phase 5 admin company/role/invite UI.

**The one that can hurt you is Phase 2.** A single table left without a customer-failing policy leaks the whole database to a logged-in Runner. Verify with real Buyer/Runner JWTs in staging before shipping.

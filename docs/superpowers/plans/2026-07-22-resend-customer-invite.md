# Resend Customer Invite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show which customers never accepted their portal invite, and let staff re-send it in one click.

**Architecture:** Verification state lives in `auth.users`, which the browser cannot read. A single SECURITY DEFINER RPC (`customer_invite_status`) exposes two timestamps per customer, gated on the existing `customers.read` permission. A pure module turns those timestamps into a display state. The resend action reuses the existing `invite-customer` edge function unchanged — it is already idempotent and mints a fresh link.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Query v5, Supabase (Postgres + edge functions), Tailwind v4, shadcn/ui, lucide-react, sonner, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-resend-customer-invite-design.md`

## Global Constraints

- Branch from and target **`dev`**. `main` is the archived Angular app — never open PRs against it.
- **No React in `src/lib/api/`.** Those are plain async Supabase functions. Components/hooks wrap them in `useQuery`/`useMutation`.
- **Query keys are arrays.** This feature uses `['customer-invite-status']`.
- **All errors funnel through `reportError(err, fallback, ctx)`** from `@/lib/logger`, paired with `toast.error(...)` from `sonner`.
- **No new dependencies.** Everything needed is already installed.
- **Coverage is gated to 100%** (statements/branches/functions/lines) on the explicit allowlist in `vitest.config.ts`. Adding `src/lib/invite-status.ts` to that list means every branch in it must be covered or `npm run test:coverage` fails.
- **There is no typecheck script** — `npm run build` runs `tsc -b` then builds. That is the typecheck.
- Files are kebab-case `.ts`/`.tsx`. Merge Tailwind classes with `cn()` from `@/lib/utils`.
- Do **not** modify `supabase/functions/invite-customer/`. It already does the job.

## Deviations from the spec (deliberate)

1. **No `src/hooks/use-customer-invite-status.ts`.** `customers.tsx` already calls `useQuery` inline for `['receivers']` and `['companies']` (`src/pages/directory/customers.tsx:255-256`). A wrapper with no added logic would not match its neighbours. Files in `src/hooks/` here exist when there is real logic to hold.
2. **`lastSeenLabel` returns the complete phrase** (`"Last seen 3h ago"` / `"Never signed in"`) rather than a bare relative time. Returning bare time forces the component to prefix `"Last seen "`, which renders "Last seen Never signed in" in the edge case. Keeping assembly in the pure module means it is covered by tests.
3. **No settled "Sent" label on the resend control.** Spec §4 calls for the button to go disabled-in-flight then show a settled "Sent" label. Only the in-flight state was built; on success the button reverts to "Resend invite" (or disappears, if the invalidated status flips the card out of "pending"). The sonner success toast (`Invite re-sent to {email}.`) already confirms the send, so a settled label on the button would just repeat that confirmation in a second place.

---

### Task 1: The `customer_invite_status` RPC

Exposes invite/verification state from `auth.users` to staff, and nothing else.

**Files:**
- Create: `supabase/migrations/20260722120000_customer_invite_status.sql`

**Interfaces:**
- Consumes: `public.has_permission(TEXT)` (defined in `supabase/migrations/20260714200000_phase1_policy_schema.sql:78`), `public.receiver_profiles.auth_user_id`.
- Produces: RPC `customer_invite_status()` returning rows of `(receiver_id uuid, confirmed_at timestamptz, last_sign_in_at timestamptz)`. Task 2 calls it.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260722120000_customer_invite_status.sql`:

```sql
-- Customer invite / verification state for the staff directory.
--
-- Verification lives in auth.users (email_confirmed_at, last_sign_in_at), which
-- the browser cannot read and which receiver_profiles does not mirror. This
-- SECURITY DEFINER function is the one read path, and it returns timestamps
-- only -- no emails, no tokens, nothing that isn't already on the customer card.
--
-- email_confirmed_at IS NULL is not just a convenient proxy for "never accepted
-- the invite": it is the same predicate GoTrue itself uses in adminGenerateLink
-- to decide whether a re-invite is allowed or is a duplicate-email error. The
-- badge this drives and the auth server therefore cannot disagree.
--
-- The permission test sits in the WHERE clause on purpose. A caller without
-- customers.read gets zero rows rather than an error, so the directory degrades
-- to "no badges" instead of failing to render.

CREATE OR REPLACE FUNCTION public.customer_invite_status()
RETURNS TABLE (
  receiver_id uuid,
  confirmed_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, u.email_confirmed_at, u.last_sign_in_at
  FROM public.receiver_profiles r
  JOIN auth.users u ON u.id = r.auth_user_id
  WHERE r.auth_user_id IS NOT NULL
    AND public.has_permission('customers.read');
$$;

COMMENT ON FUNCTION public.customer_invite_status() IS
  'Staff-only. Per-customer auth verification state: confirmed_at NULL = invite never accepted. Returns zero rows without customers.read.';

GRANT EXECUTE ON FUNCTION public.customer_invite_status() TO authenticated;
```

- [ ] **Step 2: Verify the SQL parses**

Migrations here are applied by `supabase db push` or by `.github/workflows/db-migrate.yml` on push to `dev` — pushing app code does not apply them.

If Docker/colima is running:

Run: `supabase db reset`
Expected: completes without error, migration listed in the applied output.

If Docker is not available, skip to Step 3 and rely on the dev-project check there. Do **not** block on standing up Docker.

- [ ] **Step 3: Apply to the dev project and sanity-check**

Run: `npm run supabase:link-dev && npm run supabase:push`
Expected: `Finished supabase db push.`

Then, in the Supabase SQL editor for the dev project, confirm shape and gating:

```sql
SELECT * FROM public.customer_invite_status() LIMIT 5;
```

Expected: rows of `receiver_id | confirmed_at | last_sign_in_at`. At least one row should have a non-null `confirmed_at` (a customer who accepted). A customer who was invited and never clicked through has `confirmed_at = NULL`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260722120000_customer_invite_status.sql
git commit -m "feat(db): add customer_invite_status RPC for invite verification state"
```

---

### Task 2: API layer — read status, re-send invite

**Files:**
- Modify: `src/lib/api/customers.ts` (append; the file ends at line 102 with `inviteCustomer`)

**Interfaces:**
- Consumes: RPC `customer_invite_status()` from Task 1; existing `inviteCustomer(dto: InviteCustomerDto)` in the same file; `ReceiverProfile` from `@/lib/api/receivers`.
- Produces:
  - `interface CustomerInviteStatus { receiver_id: string; confirmed_at: string | null; last_sign_in_at: string | null }`
  - `listCustomerInviteStatus(): Promise<CustomerInviteStatus[]>`
  - `resendCustomerInvite(profile: ReceiverProfile): Promise<void>`

  Task 3 imports the `CustomerInviteStatus` type. Task 4 calls both functions.

- [ ] **Step 1: Add the import for `ReceiverProfile`**

At the top of `src/lib/api/customers.ts`, the first line is `import { supabase } from '@/lib/supabase'`. Add below it:

```ts
import type { ReceiverProfile } from '@/lib/api/receivers'
```

Type-only import, so this adds nothing to the bundle and cannot create a runtime cycle.

- [ ] **Step 2: Append the status read and the resend wrapper**

Append to the end of `src/lib/api/customers.ts`:

```ts
/** One customer's auth-side invite state, from the `customer_invite_status` RPC. */
export interface CustomerInviteStatus {
  receiver_id: string
  /** auth.users.email_confirmed_at — NULL until they accept the invite. */
  confirmed_at: string | null
  /** auth.users.last_sign_in_at — NULL if they have never had a session. */
  last_sign_in_at: string | null
}

/**
 * Invite/verification state for every customer with an auth account.
 *
 * Staff-only: the RPC filters on `customers.read` internally and returns zero
 * rows to a caller without it, so a permission gap shows up as missing badges
 * rather than as an error on the directory.
 */
export async function listCustomerInviteStatus(): Promise<CustomerInviteStatus[]> {
  const { data, error } = await supabase.rpc('customer_invite_status')
  if (error) throw error
  return (data ?? []) as CustomerInviteStatus[]
}

/**
 * Re-send a customer's portal invite.
 *
 * This is the same edge-function call as the original invite — `invite-customer`
 * is idempotent and mints a fresh link every time. It is named separately
 * because the intent at the call site is different, and because the caller has
 * a `ReceiverProfile` rather than a hand-filled form.
 *
 * For a customer who never accepted, Supabase issues a genuine *invite* link
 * (GoTrue rejects an invite only for an already-confirmed user), so this is not
 * a password-reset in disguise.
 */
export async function resendCustomerInvite(profile: ReceiverProfile): Promise<void> {
  if (!profile.role) throw new Error('This customer has no portal access to re-send.')
  if (!profile.company_id) throw new Error('This customer has no company assigned.')
  await inviteCustomer({
    email: profile.email,
    name: profile.name,
    surname: profile.surname,
    phone: profile.phone,
    company_id: profile.company_id,
    role: profile.role,
    buyer_id: profile.buyer_id ?? null,
  })
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: completes with no TypeScript errors and writes `dist/`.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/customers.ts
git commit -m "feat(api): read customer invite status and re-send an invite"
```

---

### Task 3: Pure display logic (TDD)

The only part of this feature with automated tests. `lib/api/` and pages are deliberately out of coverage scope; this module is where the decisions live so they can be tested.

**Files:**
- Create: `src/lib/invite-status.ts`
- Create: `src/lib/invite-status.test.ts`
- Modify: `vitest.config.ts` (the `coverage.include` array, lines 42-63)

**Interfaces:**
- Consumes: `CustomerInviteStatus` and `CustomerRole` from `@/lib/api/customers` (Task 2); `timeAgo` from `@/lib/format` (`src/lib/format.ts:30`).
- Produces:
  - `type InviteState = 'none' | 'pending' | 'active' | 'unknown'`
  - `inviteState(role: CustomerRole | null | undefined, status: CustomerInviteStatus | undefined): InviteState`
  - `lastSeenLabel(status: CustomerInviteStatus | undefined): string | null`

  Task 4 calls both.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/invite-status.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CustomerInviteStatus } from '@/lib/api/customers'
import { inviteState, lastSeenLabel } from '@/lib/invite-status'

/** A status row, overridable per test. */
function status(over: Partial<CustomerInviteStatus> = {}): CustomerInviteStatus {
  return {
    receiver_id: 'r1',
    confirmed_at: '2026-07-01T10:00:00.000Z',
    last_sign_in_at: '2026-07-02T10:00:00.000Z',
    ...over,
  }
}

describe('inviteState', () => {
  it('is "none" for a customer with no portal role', () => {
    expect(inviteState(null, status())).toBe('none')
    expect(inviteState(undefined, status())).toBe('none')
  })

  it('is "unknown" when no status row is available', () => {
    // The status query is still loading, failed, or the customer has no auth
    // user. We must not accuse an accepted customer of being pending.
    expect(inviteState('buyer', undefined)).toBe('unknown')
  })

  it('is "pending" when the invite was never confirmed', () => {
    expect(inviteState('buyer', status({ confirmed_at: null }))).toBe('pending')
  })

  it('is "active" once the invite is confirmed', () => {
    expect(inviteState('runner', status())).toBe('active')
  })
})

describe('lastSeenLabel', () => {
  it('is null with no status row', () => {
    expect(lastSeenLabel(undefined)).toBeNull()
  })

  it('is null for an unconfirmed customer', () => {
    // Pending customers get the resend action instead; a sign-in line would be
    // noise.
    expect(lastSeenLabel(status({ confirmed_at: null }))).toBeNull()
  })

  it('reads "Never signed in" when confirmed without a session', () => {
    expect(lastSeenLabel(status({ last_sign_in_at: null }))).toBe('Never signed in')
  })

  it('reports the relative time of the last session', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    expect(lastSeenLabel(status({ last_sign_in_at: threeHoursAgo }))).toBe('Last seen 3h ago')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/invite-status.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/invite-status"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/invite-status.ts`:

```ts
import { timeAgo } from '@/lib/format'
import type { CustomerInviteStatus, CustomerRole } from '@/lib/api/customers'

/**
 * What the directory should say about a customer's portal access.
 *
 * `unknown` is load-bearing, not a loading nicety: the status query is a
 * separate request from the customer list, and it can be in flight, fail, or
 * (before the migration is applied) 404. In every one of those cases we render
 * nothing rather than risk labelling an accepted customer "Invite pending".
 */
export type InviteState = 'none' | 'pending' | 'active' | 'unknown'

export function inviteState(
  role: CustomerRole | null | undefined,
  status: CustomerInviteStatus | undefined,
): InviteState {
  if (!role) return 'none'
  if (!status) return 'unknown'
  return status.confirmed_at ? 'active' : 'pending'
}

/**
 * The sign-in line for a customer card, or null when there is nothing honest to
 * say. Returns the finished phrase so the "never signed in" case cannot be
 * mangled into "Last seen Never signed in" at the call site.
 */
export function lastSeenLabel(status: CustomerInviteStatus | undefined): string | null {
  if (!status?.confirmed_at) return null
  return status.last_sign_in_at ? `Last seen ${timeAgo(status.last_sign_in_at)}` : 'Never signed in'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/invite-status.test.ts`
Expected: PASS — 8 tests across 2 suites.

- [ ] **Step 5: Add the module to the coverage allowlist**

In `vitest.config.ts`, inside `coverage.include`, add the new entry immediately after `'src/lib/driver-status.ts',`:

```ts
        'src/lib/driver-status.ts',
        'src/lib/invite-status.ts',
        'src/lib/package-timeline.ts',
```

- [ ] **Step 6: Verify full coverage holds**

Run: `npm run test:coverage`
Expected: PASS. `src/lib/invite-status.ts` reports 100% for statements, branches, functions and lines, and the run does not fail the configured thresholds.

If branches are below 100%, the missing case is almost certainly `status?.confirmed_at` — the `undefined` arm is covered by the "is null with no status row" test; do not add production code to satisfy coverage.

- [ ] **Step 7: Commit**

```bash
git add src/lib/invite-status.ts src/lib/invite-status.test.ts vitest.config.ts
git commit -m "feat(lib): derive customer invite state and last-seen label"
```

---

### Task 4: Directory UI — pending badge, resend action, last-seen line

**Files:**
- Modify: `src/pages/directory/customers.tsx`

**Interfaces:**
- Consumes: `listCustomerInviteStatus`, `resendCustomerInvite`, `CustomerInviteStatus` (Task 2); `inviteState`, `lastSeenLabel` (Task 3).
- Produces: no new exports.

- [ ] **Step 1: Extend the imports**

In `src/pages/directory/customers.tsx`:

Add `Clock`, `MailWarning` and `Send` to the existing `lucide-react` import on line 4, keeping the list alphabetical:

```ts
import { Building2, ChevronRight, Clock, Contact, Loader2, Mail, MailWarning, MoreVertical, Package as PackageIcon, Pencil, Phone, Plus, Search, Power, Send, Trash2, User, UserCheck, UserX, Users } from 'lucide-react'
```

Replace the `@/lib/api/customers` import on line 7 with:

```ts
import { createCompany, deleteCompany, listCompanies, listCustomerInviteStatus, resendCustomerInvite, CUSTOMER_ROLE_LABEL, type Company, type CustomerInviteStatus, type CustomerRole } from '@/lib/api/customers'
```

Add after the `formatDateShort` import on line 28:

```ts
import { inviteState, lastSeenLabel } from '@/lib/invite-status'
```

- [ ] **Step 2: Add the `PendingTag` component**

Insert directly after the `RoleTag` component (which ends at line 134, just before `function NewCompanyDialog`):

```tsx
/**
 * The invite was issued but never accepted — this customer still has no way
 * into the portal. Uses the same warning tone as the "No buyer assigned"
 * affordance below it, because it means the same kind of thing: someone needs
 * to do something about this row.
 */
function PendingTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-[3px] border border-warning/40 bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-warning">
      <MailWarning className="size-2.5 shrink-0" aria-hidden />
      Invite pending
    </span>
  )
}
```

- [ ] **Step 3: Widen the `CustomerCard` props**

Replace the `CustomerCard` signature and its opening lines (currently lines 170-180, from `function CustomerCard({ r, buyerName, ...` through `const { can } = usePermissions()`) with:

```tsx
function CustomerCard({ r, buyerName, status, resending, onEdit, onContacts, onToggle, onHistory, onResend }: {
  r: ReceiverProfile
  /** For end users: the name of the buyer who sees them, or null if nobody does. */
  buyerName: string | null
  /** Auth-side invite state, or undefined while unknown (loading/failed/no auth user). */
  status: CustomerInviteStatus | undefined
  /** True while this specific card's resend is in flight. */
  resending: boolean
  onEdit: () => void
  onContacts: () => void
  onToggle: () => void
  onHistory: () => void
  onResend: () => void
}) {
  const { can } = usePermissions()
  const state = inviteState(r.role, status)
  const lastSeen = lastSeenLabel(status)
```

- [ ] **Step 4: Show the pending tag beside the role tag**

Replace the role-tag block (currently lines 187-192):

```tsx
            <div className="flex flex-wrap items-center gap-1.5">
              {r.role
                ? <RoleTag role={r.role} />
                : <span className="text-[11px] text-muted-foreground/70">No portal access</span>}
              {state === 'pending' && <PendingTag />}
              {!r.is_active && <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Inactive</span>}
            </div>
```

(`flex-wrap` is added because the row can now carry three chips.)

- [ ] **Step 5: Add the resend action and last-seen line**

In the card body, immediately after the `r.role === 'runner' && (...)` block that ends on line 225 and before the closing `</div>` on line 226, insert:

```tsx
        {state === 'pending' ? (
          // The whole point of noticing a pending card is to act on it, so the
          // action sits on the card rather than behind the ⋯ menu — same
          // pattern as the "No buyer assigned" row above.
          <button
            type="button"
            onClick={onResend}
            disabled={resending || !can('customers.invite')}
            className="flex items-center gap-2 text-left text-warning transition-opacity hover:opacity-80 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:underline"
          >
            {resending
              ? <Loader2 className="size-3.5 shrink-0 animate-spin" />
              : <Send className="size-3.5 shrink-0" />}
            <span className="truncate">{resending ? 'Sending…' : 'Resend invite'}</span>
          </button>
        ) : lastSeen ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Clock className="size-3.5 shrink-0" /> <span className="truncate">{lastSeen}</span>
          </span>
        ) : null}
```

- [ ] **Step 6: Query the status and wire the mutation**

In `CustomersPage`, after the `companies` query (line 256), add:

```tsx
  // Separate from ['receivers'] on purpose: this crosses into auth.users via an
  // RPC, and a failure here must not take the directory down with it.
  const inviteStatus = useQuery({ queryKey: ['customer-invite-status'], queryFn: listCustomerInviteStatus })

  const statusById = useMemo(() => {
    const m = new Map<string, CustomerInviteStatus>()
    for (const s of inviteStatus.data ?? []) m.set(s.receiver_id, s)
    return m
  }, [inviteStatus.data])
```

Then, after the `toggle` mutation (which ends on line 341), add:

```tsx
  const resend = useMutation({
    mutationFn: (r: ReceiverProfile) => resendCustomerInvite(r),
    onSuccess: (_, r) => {
      toast.success(`Invite re-sent to ${r.email}.`)
      qc.invalidateQueries({ queryKey: ['customer-invite-status'] })
    },
    onError: (e) => toast.error(reportError(e, 'Could not re-send the invite.', { op: 'customers.resendInvite' })),
  })
```

- [ ] **Step 7: Pass the new props at the call site**

Replace the `<CustomerCard ... />` usage (lines 414-422) with:

```tsx
                      <CustomerCard
                        key={r.id}
                        r={r}
                        buyerName={buyerFor(r)}
                        status={statusById.get(r.id)}
                        resending={resend.isPending && resend.variables?.id === r.id}
                        onEdit={() => openCustomer(r, 'details')}
                        onContacts={() => openCustomer(r, 'contacts')}
                        onToggle={() => toggle.mutate(r)}
                        onHistory={() => setHistoryFor(r)}
                        onResend={() => resend.mutate(r)}
                      />
```

`resend.variables` is the profile passed to the most recent `mutate`, so the spinner lands on the card that was clicked rather than on every pending card.

- [ ] **Step 8: Typecheck and lint**

Run: `npm run build`
Expected: no TypeScript errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 9: Run the whole suite**

Run: `npm test`
Expected: all tests pass — this task adds no tests, and must break none.

- [ ] **Step 10: Verify in the running app**

Run: `npm run dev` and open `http://localhost:5173`, then sign in as staff and go to Directory → Customers.

Expected:
1. A customer who has accepted their invite shows a muted `Last seen …` line and **no** Resend action.
2. A customer invited but never accepted shows the amber **Invite pending** chip and a **Resend invite** action.
3. Clicking Resend shows `Sending…` on that card only, then a success toast reading `Invite re-sent to <email>.`
4. A customer with no portal access still reads "No portal access", with no chip and no sign-in line.
5. Signed in as a role without `customers.invite` (e.g. `viewer`), the Resend action is visibly disabled.

To create a pending customer for testing: invite a new customer to a test company using an email you control, and simply do not click the link.

- [ ] **Step 11: Commit**

```bash
git add src/pages/directory/customers.tsx
git commit -m "feat(customers): show pending invites and allow re-sending them"
```

---

## Self-review notes

Checked against the spec:

- §1 Data layer → Task 1.
- §2 Derived state (`inviteState`, `lastSeenLabel`, four states) → Task 3, with the `lastSeenLabel` return-shape deviation recorded above.
- §3 API + hook → Task 2, with the no-hook-file deviation recorded above.
- §4 UI (pending tag, inline resend, last-seen line, permission gate, toasts, invalidation, in-flight disable) → Task 4.
- §5 Testing (100% on the new pure module; api/page out of scope; build + lint) → Task 3 Steps 5-6, Task 4 Steps 8-9.
- Out-of-scope items (staff invites, server-side cooldown, bulk resend, directory-level count chip, invite-email expiry copy) have no tasks, as intended.

Type consistency: `CustomerInviteStatus` is defined once in Task 2 and imported by Tasks 3 and 4 with identical field names (`receiver_id`, `confirmed_at`, `last_sign_in_at`). `inviteState`/`lastSeenLabel` signatures match between Task 3's definition and Task 4's use.

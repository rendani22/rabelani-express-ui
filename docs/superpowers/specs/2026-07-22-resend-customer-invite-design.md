# Resend customer invite — design

**Date:** 2026-07-22
**Status:** Approved for planning

## Problem

Staff invite customers to the portal from Directory → Customers. The invite email
carries a Supabase auth link that expires (the project's email-OTP expiry), and
the link is single-use. When a customer lets it lapse, nothing in the UI shows
that they never got in, and there is no way to send them a fresh link short of
re-running the full "Add customer" flow.

Two gaps, then:

1. **Visibility** — staff cannot tell an accepted invite from an abandoned one.
2. **Action** — no affordance to re-send.

## Why this is mostly a read problem

The resend action itself is already built. `supabase/functions/invite-customer/`
is idempotent by design: it calls `admin.auth.admin.generateLink`, upserts the
`receiver_profiles` row, and sends one branded Resend email. Re-invoking it mints
a fresh link. Every field it needs is already on the `ReceiverProfile` row.

The missing piece is knowing *who* needs it. Verification state lives in
`auth.users` (`email_confirmed_at`, `last_sign_in_at`), which the browser cannot
read, and `receiver_profiles` carries no equivalent column.

## Verified upstream behaviour (GoTrue)

Checked against `supabase/auth` source before committing to this design, because
a wrong answer here would have changed it.

**`adminGenerateLink` rejects an invite only for a *confirmed* user:**

```go
if user != nil {
    if user.IsConfirmed() {
        return apierrors.NewUnprocessableEntityError(ErrorCodeEmailExists, DuplicateEmailMsg)
    }
}
```

So for an unconfirmed customer — exactly the population we are targeting —
`generateLink({type: 'invite'})` succeeds and issues a fresh invite link. The
`recovery` fallback at `invite-customer/index.ts:98` engages only for
already-confirmed users, i.e. a genuine password reset. **The resend path for a
pending customer never touches recovery.**

**And the fallback would be safe regardless.** `recoverVerify` confirms an
unconfirmed user rather than refusing them:

```go
if !user.IsConfirmed() {
    ...
    if terr = user.Confirm(tx); terr != nil { return terr }
}
```

**Corollary worth keeping:** `email_confirmed_at IS NULL` is not merely a
reasonable definition of "pending" — it is the same predicate GoTrue itself uses
to decide invite-vs-duplicate. Our badge and the auth server cannot disagree.

## Design

### 1. Data layer — one SECURITY DEFINER RPC

New migration, `<timestamp>_customer_invite_status.sql`:

```sql
CREATE OR REPLACE FUNCTION public.customer_invite_status()
RETURNS TABLE (receiver_id uuid, confirmed_at timestamptz, last_sign_in_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.id, u.email_confirmed_at, u.last_sign_in_at
  FROM public.receiver_profiles r
  JOIN auth.users u ON u.id = r.auth_user_id
  WHERE r.auth_user_id IS NOT NULL
    AND public.has_permission('customers.read');
$$;

GRANT EXECUTE ON FUNCTION public.customer_invite_status() TO authenticated;
```

Follows the established convention (`has_permission`, `my_permissions` in
`20260714200000_phase1_policy_schema.sql`): `LANGUAGE sql STABLE SECURITY
DEFINER SET search_path = public`, plus an explicit grant to `authenticated`.

- Returns timestamps only. No emails, no tokens, nothing not already on the card.
- The permission test sits in the `WHERE`, so an unauthorized caller gets **zero
  rows rather than an error** — the directory keeps working, minus badges.

### 2. Derived state — pure and testable

New `src/lib/invite-status.ts`, added to `vitest.config.ts` `coverage.include`
(and therefore held to the 100% branch gate).

```ts
export type InviteState = 'none' | 'pending' | 'active' | 'unknown'

export interface CustomerInviteStatus {
  receiver_id: string
  confirmed_at: string | null
  last_sign_in_at: string | null
}

export function inviteState(
  role: 'buyer' | 'runner' | null | undefined,
  status: CustomerInviteStatus | undefined,
): InviteState

export function lastSeenLabel(status: CustomerInviteStatus | undefined): string | null
```

`inviteState`:

| State     | Condition                                          | Renders as                |
| --------- | -------------------------------------------------- | ------------------------- |
| `none`    | no `role`                                          | today's "No portal access" |
| `pending` | role set, status row present, `confirmed_at` null  | "Invite pending" + Resend |
| `active`  | role set, `confirmed_at` set                       | last-seen line            |
| `unknown` | status query loading, failed, or no matching row   | nothing extra             |

`unknown` is the state that earns its keep: an in-flight or failed status query
must never render "Invite pending" against someone who accepted months ago.
Absence of evidence renders nothing.

`lastSeenLabel`: `null` when pending or unknown; `'Never signed in'` when
confirmed with no `last_sign_in_at`; otherwise `timeAgo(last_sign_in_at)`
(`src/lib/format.ts:30`). Keeping this in the pure module rather than as an
inline JSX ternary means the confirmed-but-never-signed-in edge case is covered
by a test instead of going unexercised.

### 3. API + hook

Per the repo's data rules (no React in `lib/api/`, hooks wrap it):

- `src/lib/api/customers.ts`
  - `listCustomerInviteStatus(): Promise<CustomerInviteStatus[]>` — `supabase.rpc('customer_invite_status')`.
  - `resendCustomerInvite(profile: ReceiverProfile): Promise<void>` — maps
    `ReceiverProfile → InviteCustomerDto` and delegates to the existing
    `inviteCustomer`. A named wrapper so the call site reads as intent, not as a
    re-invite.
- `src/hooks/use-customer-invite-status.ts` — `useQuery`, key `['customer-invite-status']`.

No new edge function. No change to `invite-customer`.

### 4. UI — `src/pages/directory/customers.tsx`

`CustomerCard`, when `inviteState` is `pending`:

- An **"Invite pending"** tag beside `RoleTag`, in the `text-warning` /
  `bg-warning/15` treatment already used on this page.
- An inline **Resend invite** action in the card body, mirroring the existing
  clickable "No buyer assigned" warning row (`customers.tsx:217-224`).

Inline rather than in the ⋯ menu: pending cards are rare, the action is the
entire reason for noticing one, and "something needs attention here → click it"
is already an established pattern on this exact component.

When `active`: a muted `Last seen …` line alongside the existing email/phone rows.

Mutation: gated on `customers.invite`, success toast naming the email, `reportError`
+ `toast.error` on failure, invalidates `['customer-invite-status']`.

Anti-spam stays minimal — disabled while in-flight, settled "Sent" label. A
server-side cooldown is YAGNI: `generateLink` is an admin call and is not subject
to GoTrue's `max_frequency`, but nobody is abusing this yet.

### 5. Testing

- `src/lib/invite-status.test.ts` — all four `inviteState` branches and all three
  `lastSeenLabel` branches, to the 100% gate.
- `lib/api/` and the page stay out of coverage scope, per existing policy.
- `npm run build` (typecheck) and `npm run lint` must pass.

## Out of scope

- Staff invites (`create-staff`) — same problem, different flow. Separate change.
- Server-side resend cooldown / rate limiting.
- Bulk "resend all pending".
- A directory-level pending count chip (considered; deferred as unnecessary until
  the per-card state proves insufficient).
- Putting a real expiry duration in the invite email copy. Currently "This link
  expires after a while" (`src/lib/email/seed-content.ts:114`); worth revisiting
  once the project's Email OTP Expiration is confirmed, but not part of this.

## Risks

- **`auth.users` read via SECURITY DEFINER.** Mitigated by returning only two
  timestamps and gating on `customers.read`.
- **Migration must be applied.** Until `db push` / the `db-migrate.yml` CI runs,
  `supabase.rpc('customer_invite_status')` 404s. The `unknown` state means the
  page degrades to today's behaviour rather than breaking — this is the reason
  `unknown` exists, not just a loading nicety.

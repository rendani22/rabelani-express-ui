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

/**
 * What, if anything, the customer card should show below the role/buyer rows:
 * a resend action, a last-seen line, or nothing. This is the one place that
 * decides between the two — the page should only render what comes back.
 *
 * A deactivated customer has no portal access (getCurrentCustomer requires
 * is_active), so a freshly minted invite link would be dead on arrival —
 * resend is withheld even though the "pending" chip elsewhere is still an
 * accurate description of their auth state. Last-seen only ever appears for a
 * confirmed, currently-active customer: a status row can outlive the access
 * it once described (role revoked, or a stale/failed refetch), and 'none'
 * should show nothing beyond "No portal access".
 */
export function inviteCardLine(
  role: CustomerRole | null | undefined,
  isActive: boolean,
  status: CustomerInviteStatus | undefined,
): { kind: 'resend' } | { kind: 'last-seen'; text: string } | null {
  const state = inviteState(role, status)
  if (state === 'pending') return isActive ? { kind: 'resend' } : null
  // `lastSeenLabel` is only ever null when `status.confirmed_at` is falsy, and
  // `state === 'active'` already guarantees it isn't — so this is never null
  // here, but the cast stays honest about `lastSeenLabel`'s own return type.
  if (state === 'active') return { kind: 'last-seen', text: lastSeenLabel(status) as string }
  return null
}

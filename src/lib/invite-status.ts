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

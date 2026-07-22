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

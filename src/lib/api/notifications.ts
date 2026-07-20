import { supabase } from '@/lib/supabase'

/**
 * An in-app notification row. RLS scopes every query below to the current user
 * (`auth.uid() = user_id`), so no explicit user filter is needed here — a user
 * only ever sees, updates, or deletes their own notifications. Rows are created
 * exclusively by the `notify_staff_on_package_change` trigger.
 */
export interface AppNotification {
  id: string
  /** package status that produced it, or null for non-package events */
  type: string | null
  /**
   * Canonical event key — every `type` value PLUS the exception events
   * ('reschedule', 'overdue', 'stuck') that don't map to a package status.
   * This is what user mutes are matched against.
   */
  event: string | null
  emoji: string
  title: string
  description: string
  reference: string | null
  package_id: string | null
  /** where clicking the notification should take the user */
  href: string
  read_at: string | null
  created_at: string
}

/** How many recent notifications the feed loads. */
export const NOTIFICATION_FEED_LIMIT = 30

const COLUMNS = 'id, type, event, emoji, title, description, reference, package_id, href, read_at, created_at'

/**
 * The event types a user can mute, in feed order. `value` matches
 * `notifications.event` and the `event_type` stored in notification_type_mutes.
 */
export interface NotificationEventType {
  value: string
  label: string
  hint: string
}

export const NOTIFICATION_EVENT_TYPES: NotificationEventType[] = [
  { value: 'pending', label: 'New package', hint: 'A package is created' },
  { value: 'notified', label: 'Receiver notified', hint: 'The receiver has been notified' },
  { value: 'in_transit', label: 'Picked up / in transit', hint: 'A driver picks up a package' },
  { value: 'ready_for_collection', label: 'Ready for collection', hint: 'A package reaches the collection point' },
  { value: 'delivered', label: 'Delivered', hint: 'A package is delivered' },
  { value: 'collected', label: 'Collected', hint: 'A package is collected' },
  { value: 'returned', label: 'Canceled / returned', hint: 'A package is canceled' },
  { value: 'reschedule', label: 'Reschedule requested', hint: 'A customer requests a new delivery time' },
  { value: 'overdue', label: 'Overdue', hint: 'A package is taking longer than expected' },
  { value: 'stuck', label: 'No movement', hint: "A package hasn't changed status in a while" },
]

/** Newest-first feed for the signed-in user. */
export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(NOTIFICATION_FEED_LIMIT)
  if (error) throw error
  return (data ?? []) as AppNotification[]
}

/** Accurate unread count (independent of the feed limit). */
export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

/** Mark a single notification read (no-op if already read). */
export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)
  if (error) throw error
}

/** Mark every unread notification read. */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  if (error) throw error
}

/** Permanently remove one notification. */
export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', id)
  if (error) throw error
}

/** Clear the whole inbox. RLS scopes the delete to the current user's rows;
 * the `id is not null` filter is a match-all guard (Supabase rejects filterless
 * deletes). */
export async function deleteAllNotifications(): Promise<void> {
  const { error } = await supabase.from('notifications').delete().not('id', 'is', null)
  if (error) throw error
}

// ============================================================================
// Preferences (opt-out mutes)
// ============================================================================

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('Not signed in')
  return id
}

/** Event types the current user has muted (subscribed to everything else). */
export async function fetchMutedEventTypes(): Promise<string[]> {
  const { data, error } = await supabase.from('notification_type_mutes').select('event_type')
  if (error) throw error
  return (data ?? []).map((r) => (r as { event_type: string }).event_type)
}

/** Mute (true) or unmute (false) a whole event type for the current user. */
export async function setEventTypeMuted(eventType: string, muted: boolean): Promise<void> {
  if (muted) {
    const user_id = await currentUserId()
    const { error } = await supabase
      .from('notification_type_mutes')
      .upsert({ user_id, event_type: eventType }, { onConflict: 'user_id,event_type' })
    if (error) throw error
  } else {
    const { error } = await supabase.from('notification_type_mutes').delete().eq('event_type', eventType)
    if (error) throw error
  }
}

/** Package ids the current user has muted. */
export async function fetchMutedPackageIds(): Promise<string[]> {
  const { data, error } = await supabase.from('notification_package_mutes').select('package_id')
  if (error) throw error
  return (data ?? []).map((r) => (r as { package_id: string }).package_id)
}

/** Mute (true) or unmute (false) a single package for the current user. */
export async function setPackageMuted(packageId: string, muted: boolean): Promise<void> {
  if (muted) {
    const user_id = await currentUserId()
    const { error } = await supabase
      .from('notification_package_mutes')
      .upsert({ user_id, package_id: packageId }, { onConflict: 'user_id,package_id' })
    if (error) throw error
  } else {
    const { error } = await supabase.from('notification_package_mutes').delete().eq('package_id', packageId)
    if (error) throw error
  }
}

// ============================================================================
// Thresholds (admin-tunable; drive the overdue/stuck sweep)
// ============================================================================

export interface NotificationThresholds {
  overdue_in_transit_hours: number
  overdue_ready_hours: number
  stuck_days: number
}

const THRESHOLD_COLUMNS = 'overdue_in_transit_hours, overdue_ready_hours, stuck_days'

/** The single-row overdue/stuck thresholds. */
export async function fetchNotificationThresholds(): Promise<NotificationThresholds> {
  const { data, error } = await supabase
    .from('notification_settings')
    .select(THRESHOLD_COLUMNS)
    .eq('id', true)
    .single()
  if (error) throw error
  return data as NotificationThresholds
}

/** Update the thresholds (admin only — enforced by RLS). */
export async function updateNotificationThresholds(dto: NotificationThresholds): Promise<void> {
  const { error } = await supabase
    .from('notification_settings')
    .update({ ...dto, updated_at: new Date().toISOString() })
    .eq('id', true)
  if (error) throw error
}

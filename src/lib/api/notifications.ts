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

const COLUMNS = 'id, type, emoji, title, description, reference, package_id, href, read_at, created_at'

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

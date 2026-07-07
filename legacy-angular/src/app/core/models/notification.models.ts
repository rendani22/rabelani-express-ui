/**
 * In-app notification models.
 *
 * Notifications are produced server-side (a row per active staff member is
 * created by a database trigger whenever a package is created or changes
 * status) and read/dismissed per user. See the `notifications` table migration.
 */

/** Raw notification row as stored in the `notifications` table. */
export interface NotificationRow {
  readonly id: string;
  readonly user_id: string;
  readonly type: string | null;
  readonly emoji: string;
  readonly title: string;
  readonly description: string;
  readonly reference: string | null;
  readonly package_id: string | null;
  readonly href: string;
  readonly read_at: string | null;
  readonly created_at: string;
}

/** Notification as consumed by the UI (camelCase, read-state aware). */
export interface AppNotification {
  readonly id: string;
  readonly emoji: string;
  readonly title: string;
  readonly description: string;
  readonly reference: string | null;
  readonly href: string;
  /** ISO timestamp the notification was created. */
  readonly createdAt: string;
  /** ISO timestamp the user read it, or `null` when still unread. */
  readonly readAt: string | null;
}

/** Maps a database row to the UI notification shape. */
export function mapNotificationRow(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    emoji: row.emoji,
    title: row.title,
    description: row.description,
    reference: row.reference,
    href: row.href ?? '/orders',
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

/** True when the notification has not yet been read. */
export function isUnread(notification: AppNotification): boolean {
  return notification.readAt === null;
}

/**
 * Formats an ISO timestamp into a compact relative label (e.g. "just now",
 * "5m ago", "3h ago", "2d ago"), falling back to a short date for older items.
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diffSeconds = Math.round((now - then) / 1000);

  // Future timestamps / clock skew read as "just now".
  if (diffSeconds < 45) return 'just now';

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

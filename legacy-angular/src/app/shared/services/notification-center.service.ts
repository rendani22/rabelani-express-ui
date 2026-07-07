import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import {
  AppNotification,
  NotificationRow,
  mapNotificationRow,
} from '../../core/models/notification.models';

/** Maximum number of notifications kept in the feed at once. */
const MAX_NOTIFICATIONS = 20;

const ROW_COLUMNS =
  'id, user_id, type, emoji, title, description, reference, package_id, href, read_at, created_at';

/**
 * Owns the in-app notification feed (the header bell).
 *
 * Notifications live in the `notifications` table — one row per recipient,
 * created server-side by a trigger. This service loads the current user's feed,
 * keeps it live over Supabase Realtime, and exposes read/dismiss mutations.
 * Read state is real, persisted state, so the unread badge reflects what the
 * user has actually seen (and stays cleared across reloads).
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationCenterService {
  private readonly supabaseService = inject(SupabaseService);

  /** Live realtime subscription for the signed-in user, if any. */
  private channel: RealtimeChannel | null = null;

  /** The user id the realtime channel is currently bound to. */
  private subscribedUserId: string | null = null;

  private readonly _notifications = signal<readonly AppNotification[]>([]);
  readonly notifications = this._notifications.asReadonly();

  private readonly _isLoading = signal(false);
  readonly isLoading = this._isLoading.asReadonly();

  /** Number of unread notifications in the feed. */
  readonly unreadCount = computed(
    () => this._notifications().filter(n => n.readAt === null).length
  );

  /** True when there is at least one unread notification. */
  readonly hasUnread = computed(() => this.unreadCount() > 0);

  constructor() {
    // Bind the feed to whoever is signed in. Re-runs on login/logout so the
    // feed is always scoped to the current user (or empty when signed out).
    effect(() => {
      const userId = this.supabaseService.currentUser()?.id ?? null;
      if (userId === this.subscribedUserId) return;

      this.subscribedUserId = userId;
      this.teardownChannel();

      if (userId) {
        void this.load();
        this.subscribe(userId);
      } else {
        this._notifications.set([]);
      }
    });
  }

  /** The signed-in user's id, or null when signed out. */
  private get userId(): string | null {
    return this.supabaseService.currentUser()?.id ?? null;
  }

  /**
   * Loads the current user's most recent notifications. Silently ignores
   * errors so the header always renders.
   */
  async load(): Promise<void> {
    const userId = this.userId;
    if (!userId) return;

    this._isLoading.set(true);
    try {
      const { data, error } = await this.supabaseService.client
        .from('notifications')
        .select(ROW_COLUMNS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(MAX_NOTIFICATIONS);

      if (error) {
        console.warn('[NotificationCenter] Failed to load notifications:', error.message);
        return;
      }

      this._notifications.set(((data as NotificationRow[]) ?? []).map(mapNotificationRow));
    } catch (err) {
      console.warn('[NotificationCenter] Unexpected error loading notifications:', err);
    } finally {
      this._isLoading.set(false);
    }
  }

  /** Marks a single notification as read (optimistically, then persists). */
  async markAsRead(id: string): Promise<void> {
    const target = this._notifications().find(n => n.id === id);
    if (!target || target.readAt !== null) return;

    const readAt = new Date().toISOString();
    this._notifications.update(list =>
      list.map(n => (n.id === id ? { ...n, readAt } : n))
    );

    const { error } = await this.supabaseService.client
      .from('notifications')
      .update({ read_at: readAt })
      .eq('id', id);

    if (error) {
      console.warn('[NotificationCenter] Failed to mark notification read:', error.message);
    }
  }

  /** Marks every unread notification as read. */
  async markAllAsRead(): Promise<void> {
    const userId = this.userId;
    if (!userId) return;
    if (!this._notifications().some(n => n.readAt === null)) return;

    const readAt = new Date().toISOString();
    this._notifications.update(list =>
      list.map(n => (n.readAt === null ? { ...n, readAt } : n))
    );

    const { error } = await this.supabaseService.client
      .from('notifications')
      .update({ read_at: readAt })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) {
      console.warn('[NotificationCenter] Failed to mark all read:', error.message);
    }
  }

  /** Permanently removes a single notification. Rolls back on failure. */
  async dismiss(id: string): Promise<void> {
    const previous = this._notifications();
    if (!previous.some(n => n.id === id)) return;

    this._notifications.set(previous.filter(n => n.id !== id));

    const { error } = await this.supabaseService.client
      .from('notifications')
      .delete()
      .eq('id', id);

    if (error) {
      console.warn('[NotificationCenter] Failed to dismiss notification:', error.message);
      this._notifications.set(previous);
    }
  }

  /** Permanently removes every notification for the user. Rolls back on failure. */
  async clearAll(): Promise<void> {
    const userId = this.userId;
    if (!userId) return;

    const previous = this._notifications();
    if (previous.length === 0) return;

    this._notifications.set([]);

    const { error } = await this.supabaseService.client
      .from('notifications')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.warn('[NotificationCenter] Failed to clear notifications:', error.message);
      this._notifications.set(previous);
    }
  }

  /** Tears down the realtime subscription and clears the feed (e.g. sign out). */
  dispose(): void {
    this.teardownChannel();
    this._notifications.set([]);
    this.subscribedUserId = null;
  }

  /** Subscribes to live inserts/updates/deletes for the given user. */
  private subscribe(userId: string): void {
    const filter = `user_id=eq.${userId}`;

    this.channel = this.supabaseService.client
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter },
        payload => this.handleInsert(payload.new as NotificationRow)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter },
        payload => this.handleUpdate(payload.new as NotificationRow)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications', filter },
        payload => this.handleDelete((payload.old as Partial<NotificationRow>)?.id)
      )
      .subscribe();
  }

  private handleInsert(row: NotificationRow | undefined): void {
    if (!row?.id) return;
    const incoming = mapNotificationRow(row);
    this._notifications.update(list => {
      if (list.some(n => n.id === incoming.id)) return list;
      return [incoming, ...list].slice(0, MAX_NOTIFICATIONS);
    });
  }

  private handleUpdate(row: NotificationRow | undefined): void {
    if (!row?.id) return;
    const updated = mapNotificationRow(row);
    this._notifications.update(list =>
      list.map(n => (n.id === updated.id ? updated : n))
    );
  }

  private handleDelete(id: string | undefined): void {
    if (!id) return;
    this._notifications.update(list => list.filter(n => n.id !== id));
  }

  private teardownChannel(): void {
    if (this.channel) {
      void this.supabaseService.client.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

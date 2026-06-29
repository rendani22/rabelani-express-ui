import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SupabaseService } from './supabase.service';
import { NotificationCenterService } from './notification-center.service';
import { NotificationRow } from '../../core/models/notification.models';

try {
  getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
} catch {
  // Already initialized by the Angular test runner.
}

/** Builds a fake notification row with sensible defaults. */
function row(over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n1',
    user_id: 'user-1',
    type: 'pending',
    emoji: '📦',
    title: 'New package created (PKG-1)',
    description: 'A new package has been created for a@b.com.',
    reference: 'PKG-1',
    package_id: 'p1',
    href: '/orders',
    read_at: null,
    created_at: '2026-06-29T10:00:00.000Z',
    ...over,
  };
}

describe('NotificationCenterService', () => {
  let service: NotificationCenterService;

  const currentUser = signal<{ id: string } | null>({ id: 'user-1' });

  // Result the next awaited query resolves to.
  let queryResult: { data?: unknown; error: unknown };
  const updatePayloads: unknown[] = [];
  let deleteCount = 0;

  // A chainable query builder that is also awaitable.
  function builder(): Record<string, unknown> {
    const b: Record<string, unknown> = {};
    const ret = () => b;
    b['select'] = vi.fn(ret);
    b['eq'] = vi.fn(ret);
    b['is'] = vi.fn(ret);
    b['order'] = vi.fn(ret);
    b['limit'] = vi.fn(ret);
    b['update'] = vi.fn((payload: unknown) => { updatePayloads.push(payload); return b; });
    b['delete'] = vi.fn(() => { deleteCount++; return b; });
    b['then'] = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(queryResult).then(resolve, reject);
    return b;
  }

  const from = vi.fn(() => builder());
  const channelStub: Record<string, unknown> = {};
  channelStub['on'] = vi.fn(() => channelStub);
  channelStub['subscribe'] = vi.fn(() => channelStub);
  const channel = vi.fn(() => channelStub);
  const removeChannel = vi.fn();

  beforeEach(() => {
    queryResult = { data: [], error: null };
    updatePayloads.length = 0;
    deleteCount = 0;
    from.mockClear();
    channel.mockClear();
    removeChannel.mockClear();
    currentUser.set({ id: 'user-1' });

    TestBed.configureTestingModule({
      providers: [
        NotificationCenterService,
        {
          provide: SupabaseService,
          useValue: {
            currentUser,
            client: { from, channel, removeChannel },
          },
        },
      ],
    });

    service = TestBed.inject(NotificationCenterService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads notifications and derives the unread count', async () => {
    queryResult = {
      data: [row({ id: 'n1' }), row({ id: 'n2', read_at: '2026-06-29T11:00:00.000Z' })],
      error: null,
    };

    await service.load();

    expect(service.notifications().length).toBe(2);
    expect(service.unreadCount()).toBe(1);
    expect(service.hasUnread()).toBe(true);
  });

  it('does not load when signed out', async () => {
    currentUser.set(null);
    from.mockClear();

    await service.load();

    expect(from).not.toHaveBeenCalled();
    expect(service.notifications().length).toBe(0);
  });

  it('marks a single notification as read optimistically', async () => {
    queryResult = { data: [row({ id: 'n1' })], error: null };
    await service.load();
    expect(service.unreadCount()).toBe(1);

    queryResult = { error: null };
    await service.markAsRead('n1');

    expect(service.notifications()[0].readAt).not.toBeNull();
    expect(service.unreadCount()).toBe(0);
    expect(updatePayloads.some(p => p && typeof p === 'object' && 'read_at' in p)).toBe(true);
  });

  it('marks all notifications as read', async () => {
    queryResult = { data: [row({ id: 'n1' }), row({ id: 'n2' })], error: null };
    await service.load();
    expect(service.unreadCount()).toBe(2);

    queryResult = { error: null };
    await service.markAllAsRead();

    expect(service.unreadCount()).toBe(0);
  });

  it('dismisses a notification optimistically', async () => {
    queryResult = { data: [row({ id: 'n1' }), row({ id: 'n2' })], error: null };
    await service.load();

    queryResult = { error: null };
    await service.dismiss('n1');

    expect(service.notifications().map(n => n.id)).toEqual(['n2']);
    expect(deleteCount).toBe(1);
  });

  it('rolls back a dismiss when the delete fails', async () => {
    queryResult = { data: [row({ id: 'n1' }), row({ id: 'n2' })], error: null };
    await service.load();

    queryResult = { error: { message: 'boom' } };
    await service.dismiss('n1');

    expect(service.notifications().map(n => n.id)).toEqual(['n1', 'n2']);
  });

  it('clears all notifications and tears down on dispose', async () => {
    queryResult = { data: [row({ id: 'n1' })], error: null };
    await service.load();

    queryResult = { error: null };
    await service.clearAll();
    expect(service.notifications().length).toBe(0);

    service.dispose();
    expect(service.notifications().length).toBe(0);
  });
});

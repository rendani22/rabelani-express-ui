import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
  deleteAllNotifications,
  deleteNotification,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/api/notifications'

const FEED_KEY = ['notifications', 'feed']
const UNREAD_KEY = ['notifications', 'unread-count']

/**
 * The signed-in user's notification feed + unread count, kept live via a
 * Supabase realtime subscription on their own rows. Exposes mutations for
 * per-item read, mark-all-read, and delete. Works for both staff and customers
 * (RLS scopes everything to the current account).
 */
export function useNotifications() {
  const { user } = useAuth()
  const qc = useQueryClient()

  const feed = useQuery({
    queryKey: FEED_KEY,
    queryFn: fetchNotifications,
    enabled: !!user,
  })

  const unread = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: fetchUnreadCount,
    enabled: !!user,
  })

  // Live updates: any insert/update/delete on my notifications refreshes both.
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: FEED_KEY })
          qc.invalidateQueries({ queryKey: UNREAD_KEY })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, qc])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: FEED_KEY })
    qc.invalidateQueries({ queryKey: UNREAD_KEY })
  }

  const markRead = useMutation({ mutationFn: markNotificationRead, onSuccess: invalidate })
  const markAllRead = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: invalidate })
  const remove = useMutation({ mutationFn: deleteNotification, onSuccess: invalidate })
  const removeAll = useMutation({ mutationFn: deleteAllNotifications, onSuccess: invalidate })

  return {
    items: feed.data ?? [],
    unreadCount: unread.data ?? 0,
    isLoading: feed.isLoading,
    isError: feed.isError,
    markRead,
    markAllRead,
    remove,
    removeAll,
  }
}

import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, CheckCheck, Inbox, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/format'
import { useNotifications } from '@/hooks/use-notifications'
import { SectionLabel, StatusStamp, TrackingNumber } from '@/components/dispatch'

/** Labels for exception events that have no package-status StatusStamp. */
const EVENT_LABELS: Record<string, string> = {
  reschedule: 'Reschedule',
  overdue: 'Overdue',
  stuck: 'No movement',
}
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * The notifications bell + inbox, in the Dispatch language: each notification is
 * a manifest/log line — the event flagged by its StatusStamp (color = status,
 * reserved tones), the waybill as a mono TrackingNumber token, a mono timestamp,
 * and unread marked by a cargo-orange left rule (a flagged line), not a wash.
 * Shared by the staff header and the customer portal; the feed is RLS-scoped and
 * kept live by `useNotifications`.
 */
export function NotificationsMenu() {
  const navigate = useNavigate()
  const { items, unreadCount, isLoading, markRead, markAllRead, removeAll, mutePackage } = useNotifications()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
          data-tour="notifications"
          className="relative"
        >
          <Bell className="size-[18px]" />
          {unreadCount > 0 && (
            <span className="mono absolute -right-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full border-2 border-background bg-primary px-[3px] text-[9px] font-bold leading-none text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[21rem] p-0">
        {/* stencil header — label + hi-vis count, mark-all action */}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <SectionLabel>Notifications</SectionLabel>
            {unreadCount > 0 && (
              <span className="mono inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="tear-line mx-3" aria-hidden />

        <div className="max-h-[24rem] overflow-y-auto py-1">
          {isLoading ? (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-12 text-center">
              <Inbox className="size-6 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">You&apos;re all caught up</p>
            </div>
          ) : (
            items.map((n) => {
              const unread = !n.read_at
              return (
                <DropdownMenuItem
                  key={n.id}
                  onSelect={() => {
                    if (unread) markRead.mutate(n.id)
                    // Deep-link to the specific order. Staff land on the order's
                    // details panel via /orders?id=<pkg>; derived from package_id so
                    // it works even for rows the trigger stored without the query.
                    const to =
                      n.package_id && n.href.startsWith('/orders')
                        ? `/orders?id=${n.package_id}`
                        : n.href
                    navigate(to)
                  }}
                  className={cn(
                    'group flex cursor-pointer flex-col items-stretch gap-1 border-l-2 px-3 py-2.5 focus:bg-accent/60',
                    unread ? 'border-primary' : 'border-transparent',
                  )}
                >
                  {/* metadata line: status stamp / event label · waybill · time · mute */}
                  <div className="flex items-center gap-2">
                    {n.type ? (
                      <StatusStamp status={n.type} className={cn(!unread && 'opacity-65')} />
                    ) : (
                      <SectionLabel className="text-[10px]">
                        {(n.event && EVENT_LABELS[n.event]) ?? 'Update'}
                      </SectionLabel>
                    )}
                    <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground">
                      {n.reference && (
                        <>
                          <TrackingNumber value={n.reference} className="text-[11px] text-muted-foreground" />
                          <span aria-hidden className="text-muted-foreground/40">
                            ·
                          </span>
                        </>
                      )}
                      <time className="mono">{timeAgo(n.created_at)}</time>
                      {n.package_id && (
                        <button
                          type="button"
                          aria-label="Mute notifications for this package"
                          title="Mute this package"
                          // Stop the row's select/navigate; just mute.
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            mutePackage.mutate(n.package_id as string)
                            toast.success('Muted notifications for this package.')
                          }}
                          className="ml-0.5 rounded p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                        >
                          <BellOff className="size-3.5" />
                        </button>
                      )}
                    </span>
                  </div>
                  {/* the event, in plain words */}
                  <p
                    className={cn(
                      'line-clamp-2 text-pretty text-[13px] leading-snug',
                      unread ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {n.description}
                  </p>
                </DropdownMenuItem>
              )
            })
          )}
        </div>

        {items.length > 0 && (
          <>
            <div className="tear-line mx-3" aria-hidden />
            <button
              type="button"
              onClick={() => removeAll.mutate()}
              disabled={removeAll.isPending}
              className="flex w-full items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              <Trash2 className="size-3.5" /> Clear all
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

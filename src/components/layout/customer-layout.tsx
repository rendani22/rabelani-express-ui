import { Outlet } from 'react-router-dom'
import { Logo } from '@/components/brand/logo'
import { ModeToggle } from '@/components/mode-toggle'
import { Separator } from '@/components/ui/separator'
import { NotificationsMenu } from './notifications-menu'
import { CustomerAccountMenu } from './customer-account-menu'

/**
 * Minimal shell for the customer portal — brand + theme toggle + account menu.
 * Deliberately excludes the staff sidebar, command palette, and dashboards.
 *
 * From `sm` up the shell is locked to the viewport and the page owns its own
 * scrolling, so a page can keep its controls fixed and scroll only its list.
 * On a phone the page scrolls normally: locking there would cost the ~90px the
 * browser address bar reclaims on scroll, on the screen that can least spare it.
 */
export function CustomerLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background sm:h-svh sm:min-h-0 sm:overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b px-5 py-3.5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-1.5">
          <NotificationsMenu />
          <ModeToggle />
          <Separator orientation="vertical" className="mx-1 h-6" />
          <CustomerAccountMenu />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-8 sm:min-h-0 sm:px-8 sm:pb-0">
        <Outlet />
      </main>
    </div>
  )
}

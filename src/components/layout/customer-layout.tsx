import { Outlet } from 'react-router-dom'
import { Logo } from '@/components/brand/logo'
import { ModeToggle } from '@/components/mode-toggle'
import { Separator } from '@/components/ui/separator'
import { NotificationsMenu } from './notifications-menu'
import { CustomerAccountMenu } from './customer-account-menu'

/**
 * Minimal shell for the customer portal — brand + theme toggle + account menu.
 * Deliberately excludes the staff sidebar, command palette, and dashboards.
 */
export function CustomerLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between border-b px-5 py-3.5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-1.5">
          <NotificationsMenu />
          <ModeToggle />
          <Separator orientation="vertical" className="mx-1 h-6" />
          <CustomerAccountMenu />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:px-8">
        <Outlet />
      </main>
    </div>
  )
}

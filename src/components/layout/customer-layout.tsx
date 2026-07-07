import { Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Logo } from '@/components/brand/logo'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'

/**
 * Minimal shell for the customer portal — brand + theme toggle + sign out only.
 * Deliberately excludes the staff sidebar, command palette, and dashboards.
 */
export function CustomerLayout() {
  const { signOut } = useAuth()
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between border-b px-5 py-3.5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-1.5">
          <ModeToggle />
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:px-8">
        <Outlet />
      </main>
    </div>
  )
}

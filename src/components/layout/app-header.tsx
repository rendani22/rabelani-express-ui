import { useLocation, useNavigate } from 'react-router-dom'
import { Compass, HelpCircle, LogOut, Mail, Menu, Search, Settings, X } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useUIStore } from '@/lib/ui-store'
import { tourIdForPath, useTourStore } from '@/lib/tour-store'
import { cn } from '@/lib/utils'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarContent } from './sidebar'
import { NotificationsMenu } from './notifications-menu'

const ENV_LABEL = 'INT'

function initials(email?: string | null) {
  if (!email) return '?'
  return email.slice(0, 2).toUpperCase()
}

export function AppHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signOut } = useAuth()
  const { mobileNavOpen, setMobileNavOpen, setCommandOpen } = useUIStore()
  const restartTour = useTourStore((s) => s.restart)
  const pageTourId = tourIdForPath(location.pathname)

  const name = user?.email?.split('@')[0] ?? 'Account'

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
      {/* mobile nav trigger */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </Button>
        <SheetContent side="left" className="w-[248px] overflow-visible p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {/* Close sits just outside the panel, on the scrim — keeps the header
              clear for the logo and lands where drawer close buttons are expected. */}
          <SheetClose className="absolute top-3 -right-12 flex size-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
            <X className="size-5" />
            <span className="sr-only">Close navigation</span>
          </SheetClose>
          <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      {ENV_LABEL && (
        <span className="hidden h-6 items-center rounded-full border border-warning/40 bg-warning/12 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-warning-foreground sm:inline-flex dark:text-warning">
          {ENV_LABEL}
        </span>
      )}

      {/* search trigger */}
      <button
        type="button"
        data-tour="global-search"
        onClick={() => setCommandOpen(true)}
        className={cn(
          'group ml-auto flex h-9 w-full max-w-xs items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted',
        )}
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="pointer-events-none hidden items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1">
        {/* notifications */}
        <NotificationsMenu />

        {/* help */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Help" data-tour="help-menu">
              <HelpCircle className="size-[18px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Need help?</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {pageTourId && (
              <DropdownMenuItem onSelect={() => restartTour(pageTourId)}>
                <Compass className="size-4" /> Take a tour of this page
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <a href="mailto:support@rabelani.co.za">
                <Mail className="size-4" /> Contact us
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ModeToggle />
      </div>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* user menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            data-tour="user-menu"
            className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                {initials(user?.email)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:block">
              {name}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="flex flex-col px-2 py-1.5">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate('/settings')}>
            <Settings className="size-4" /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={async () => {
              await signOut()
              navigate('/login', { replace: true })
            }}
          >
            <LogOut className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

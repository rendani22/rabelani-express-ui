import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/brand/logo'
import { SectionLabel } from '@/components/dispatch'
import { usePermissions } from '@/hooks/use-permissions'
import { SETTINGS_ITEM, visibleNavGroups, type NavItem } from './nav-items'

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sidebar-accent text-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* active accent bar */}
          <span
            aria-hidden
            className={cn(
              'absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0',
            )}
          />
          <Icon
            className={cn('size-[18px] shrink-0', isActive ? 'text-primary' : 'text-current')}
          />
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

/** Sidebar content — used directly on desktop and inside the mobile Sheet. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const SettingsIcon = SETTINGS_ITEM.icon
  const { can } = usePermissions()
  const groups = visibleNavGroups(can)
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-16 items-center px-5">
        <Logo showTagline={false} markClassName="size-8" />
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <SectionLabel className="px-2.5 pb-1">{group.label}</SectionLabel>
            {group.items.map((item) => (
              <NavRow key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t px-3 py-3">
        <NavLink
          to={SETTINGS_ITEM.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-accent text-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
            )
          }
        >
          {({ isActive }) => (
            <>
              <SettingsIcon
                className={cn('size-[18px] shrink-0', isActive ? 'text-primary' : 'text-current')}
              />
              {SETTINGS_ITEM.label}
            </>
          )}
        </NavLink>
      </div>
    </div>
  )
}

/** Sticky desktop sidebar column. */
export function DesktopSidebar() {
  return (
    <aside
      data-tour="sidebar"
      className="sticky top-0 hidden h-svh w-[248px] shrink-0 border-r lg:block"
    >
      <SidebarContent />
    </aside>
  )
}

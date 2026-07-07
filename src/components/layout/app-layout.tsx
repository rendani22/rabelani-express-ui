import { Outlet } from 'react-router-dom'
import { AppHeader } from './app-header'
import { DesktopSidebar } from './sidebar'
import { CommandPalette } from './command-palette'

export function AppLayout() {
  return (
    <div className="flex min-h-svh bg-background">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}

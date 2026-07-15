import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useUIStore } from '@/lib/ui-store'
import { usePermissions } from '@/hooks/use-permissions'
import { SETTINGS_ITEM, visibleNavGroups } from './nav-items'

export function CommandPalette() {
  const navigate = useNavigate()
  const { commandOpen, setCommandOpen, toggleCommand } = useUIStore()
  const { can } = usePermissions()
  // The palette is a navigation surface, so it hides what the sidebar hides —
  // otherwise ⌘K becomes a way to walk into pages that will just reject you.
  const groups = visibleNavGroups(can)

  // ⌘K / Ctrl-K to toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggleCommand()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [toggleCommand])

  function go(to: string) {
    setCommandOpen(false)
    navigate(to)
  }

  return (
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
      <CommandInput placeholder="Search pages, or type a command…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.to}
                  value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
                  onSelect={() => go(item.to)}
                >
                  <Icon className="text-muted-foreground" />
                  {item.label}
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Other">
          <CommandItem value="settings" onSelect={() => go(SETTINGS_ITEM.to)}>
            <SETTINGS_ITEM.icon className="text-muted-foreground" />
            Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

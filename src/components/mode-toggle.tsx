import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Toggle theme"
    >
      {/*
        Both icons stay at a visible scale — nothing pops in from scale(0). They
        cross-rotate and fade, and a touch of blur bridges the crossfade so the
        eye reads one icon turning into the other rather than two icons swapping.
      */}
      <Sun className="size-[18px] scale-100 rotate-0 opacity-100 blur-0 transition-[transform,opacity,filter] duration-200 ease-out dark:scale-75 dark:-rotate-90 dark:opacity-0 dark:blur-[2px]" />
      <Moon className="absolute size-[18px] scale-75 rotate-90 opacity-0 blur-[2px] transition-[transform,opacity,filter] duration-200 ease-out dark:scale-100 dark:rotate-0 dark:opacity-100 dark:blur-0" />
    </Button>
  )
}

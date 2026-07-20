import { useRef } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CatalogEntry, VarGroup } from '@/lib/email/catalog'

const GROUP_ORDER: VarGroup[] = ['This email', 'Contact & hours', 'Advanced']

/** Dropdown that inserts a `{{token}}` for a catalog value, grouped by area. */
export function InsertVariableMenu({
  catalog,
  onInsert,
  disabled,
}: {
  catalog: CatalogEntry[]
  onInsert: (token: string) => void
  disabled?: boolean
}) {
  if (catalog.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} className="h-7 gap-1 px-2 text-xs">
          <Plus className="size-3.5" /> Insert value
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
        {GROUP_ORDER.map((group) => {
          const entries = catalog.filter((c) => c.group === group)
          if (entries.length === 0) return null
          return (
            <div key={group}>
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">{group}</DropdownMenuLabel>
              {entries.map((e) => (
                <DropdownMenuItem
                  key={e.name}
                  onSelect={() => onInsert(`{{${e.name}}}`)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="text-sm font-medium">{e.label}</span>
                  <span className="text-[11px] text-muted-foreground">{e.description}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </div>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A labelled text input/textarea that supports inserting `{{tokens}}` at the
 * caret via a friendly menu. Tracks the last caret position so the value flows
 * up through `onChange` while inserts land where the user was typing.
 */
export function TokenField({
  label,
  value,
  onChange,
  catalog,
  multiline,
  rows = 3,
  placeholder,
  hint,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  catalog: CatalogEntry[]
  multiline?: boolean
  rows?: number
  placeholder?: string
  hint?: string
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const caret = useRef<number>(value.length)

  const remember = () => {
    const el = ref.current
    if (el) caret.current = el.selectionStart ?? el.value.length
  }

  const insert = (token: string) => {
    const pos = Math.min(caret.current, value.length)
    const next = value.slice(0, pos) + token + value.slice(pos)
    onChange(next)
    // Restore focus + place caret after the inserted token.
    requestAnimationFrame(() => {
      const el = ref.current
      if (el) {
        const newPos = pos + token.length
        el.focus()
        el.setSelectionRange(newPos, newPos)
        caret.current = newPos
      }
    })
  }

  const commonProps = {
    value,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onSelect: remember,
    onKeyUp: remember,
    onClick: remember,
    onBlur: remember,
  }

  return (
    <div className="flex flex-col gap-1.5">
      {(label || catalog.length > 0) && (
        <div className="flex items-center justify-between gap-2">
          {label ? <Label className="text-xs">{label}</Label> : <span />}
          <InsertVariableMenu catalog={catalog} onInsert={insert} />
        </div>
      )}
      {multiline ? (
        <Textarea ref={ref as React.Ref<HTMLTextAreaElement>} rows={rows} {...commonProps} />
      ) : (
        <Input ref={ref as React.Ref<HTMLInputElement>} {...commonProps} />
      )}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

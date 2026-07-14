import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import type { Block, BannerConfig } from '@/lib/email/blocks'
import { BLOCK_LABELS } from '@/lib/email/blocks'
import type { CatalogEntry } from '@/lib/email/catalog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TokenField } from './token-field'

const ALWAYS = '__always__'

/** A Select of catalog variables used for "only show when" conditions. */
export function ConditionSelect({
  catalog,
  value,
  onChange,
}: {
  catalog: CatalogEntry[]
  value: string | undefined
  onChange: (v: string | undefined) => void
}) {
  const options = catalog.filter((c) => c.kind === 'flag' || c.kind === 'scalar')
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">Only show when</Label>
      <Select value={value ?? ALWAYS} onValueChange={(v) => onChange(v === ALWAYS ? undefined : v)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALWAYS}>Always show</SelectItem>
          {options.map((c) => (
            <SelectItem key={c.name} value={c.name}>{c.label} has a value</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Editor for the coloured header band: title, colour, and gated sub-lines. */
export function BannerEditor({
  banner,
  catalog,
  onChange,
}: {
  banner: BannerConfig
  catalog: CatalogEntry[]
  onChange: (b: BannerConfig) => void
}) {
  const setLine = (i: number, text: string, showWhen: string | undefined) => {
    const lines = banner.lines.map((l, idx) => (idx === i ? { text, showWhen } : l))
    onChange({ ...banner, lines })
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Header band</span>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Colour</Label>
          <input type="color" value={banner.bg} onChange={(e) => onChange({ ...banner, bg: e.target.value })} className="h-7 w-10 cursor-pointer rounded border bg-transparent" aria-label="Header colour" />
        </div>
      </div>
      <TokenField label="Title" value={banner.title} onChange={(v) => onChange({ ...banner, title: v })} catalog={catalog} />
      {banner.lines.map((l, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-dashed p-2">
          <TokenField label={`Sub-line ${i + 1}`} value={l.text} onChange={(v) => setLine(i, v, l.showWhen)} catalog={catalog} />
          <div className="flex items-end gap-2">
            <div className="flex-1"><ConditionSelect catalog={catalog} value={l.showWhen} onChange={(v) => setLine(i, l.text, v)} /></div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove sub-line" className="text-muted-foreground hover:text-destructive" onClick={() => onChange({ ...banner, lines: banner.lines.filter((_, idx) => idx !== i) })}><Trash2 className="size-3.5" /></Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit gap-1 text-xs" onClick={() => onChange({ ...banner, lines: [...banner.lines, { text: '' }] })}>
        <Plus className="size-3.5" /> Add sub-line
      </Button>
    </div>
  )
}

/** Per-kind editor for a single block, with move/remove controls. */
export function BlockEditor({
  block,
  catalog,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  isFirst,
  isLast,
}: {
  block: Block
  catalog: CatalogEntry[]
  onChange: (b: Block) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const patch = (p: Partial<Block>) => onChange({ ...block, ...p } as Block)

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <GripVertical className="size-3.5 opacity-50" /> {BLOCK_LABELS[block.kind]}
        </span>
        <div className="flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" disabled={isFirst} onClick={onMoveUp}><ArrowUp className="size-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" disabled={isLast} onClick={onMoveDown}><ArrowDown className="size-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove" className="text-muted-foreground hover:text-destructive" onClick={onRemove}><Trash2 className="size-3.5" /></Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {block.kind === 'heading' && (
          <>
            <TokenField label="Heading text" value={block.text} onChange={(v) => patch({ text: v })} catalog={catalog} />
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Size</Label>
              <Select value={String(block.level)} onValueChange={(v) => patch({ level: Number(v) as 1 | 2 | 3 })}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Large</SelectItem>
                  <SelectItem value="2">Medium</SelectItem>
                  <SelectItem value="3">Small</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {block.kind === 'paragraph' && (
          <>
            <TokenField label="Text" value={block.text} onChange={(v) => patch({ text: v })} catalog={catalog} multiline hint="Wrap text in **double asterisks** to make it bold." />
            <ConditionSelect catalog={catalog} value={block.showWhen} onChange={(v) => patch({ showWhen: v })} />
          </>
        )}

        {block.kind === 'note' && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Label (bold lead-in)</Label>
              <Input value={block.label} onChange={(e) => patch({ label: e.target.value })} className="h-8 text-sm" />
            </div>
            <TokenField label="Text" value={block.text} onChange={(v) => patch({ text: v })} catalog={catalog} multiline />
            <ConditionSelect catalog={catalog} value={block.showWhen} onChange={(v) => patch({ showWhen: v })} />
          </>
        )}

        {block.kind === 'button' && (
          <>
            <TokenField label="Button text" value={block.label} onChange={(v) => patch({ label: v })} catalog={catalog} />
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Links to</Label>
              <Select value={block.hrefVar} onValueChange={(v) => patch({ hrefVar: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {catalog.filter((c) => c.kind === 'scalar').map((c) => (
                    <SelectItem key={c.name} value={c.name}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Colour</Label>
              <input type="color" value={block.bg} onChange={(e) => patch({ bg: e.target.value })} className="h-7 w-10 cursor-pointer rounded border bg-transparent" aria-label="Button colour" />
            </div>
          </>
        )}

        {block.kind === 'divider' && (
          <p className="text-xs text-muted-foreground">A horizontal divider line.</p>
        )}

        {block.kind === 'items_table' && (
          <>
            <TokenField label="Heading (optional)" value={block.heading ?? ''} onChange={(v) => patch({ heading: v })} catalog={catalog} />
            <p className="rounded-md bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
              Automatically lists the <span className="font-medium">{catalog.find((c) => c.name === block.source)?.label ?? block.source}</span> as a Qty / Description table.
            </p>
            <TokenField label="Text when there are no items (optional)" value={block.emptyText ?? ''} onChange={(v) => patch({ emptyText: v || undefined })} catalog={catalog} />
          </>
        )}

        {block.kind === 'html' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Advanced HTML</Label>
            <Textarea value={block.html} onChange={(e) => patch({ html: e.target.value })} rows={10} className="mono text-xs" />
            <p className="text-[11px] text-muted-foreground">Raw HTML. Only edit if you know what you're doing.</p>
          </div>
        )}
      </div>
    </div>
  )
}

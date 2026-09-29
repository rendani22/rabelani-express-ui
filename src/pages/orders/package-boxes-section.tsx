import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check, Loader2, Pencil, Plus, Printer, Share2, Trash2, X } from 'lucide-react'
import type { Package } from '@/lib/models/package'
import { isPackageEditable } from '@/lib/models/package'
import {
  allocateItems,
  buildBoxLabels,
  formatPackedDate,
  unboxedItems,
  type BoxContentLine,
  type PackageBox,
} from '@/lib/box-label'
import { printBoxLabels, shareBoxLabelImages } from '@/lib/box-label-render'
import { reportError } from '@/lib/logger'
import { usePermissions } from '@/hooks/use-permissions'
import {
  useDeletePackageBox,
  usePackageBoxes,
  usePackageLocationName,
  useSavePackageBox,
} from '@/hooks/use-package-boxes'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PermissionButton } from '@/components/dispatch/permission-button'

/**
 * Packs (UI wording; "boxes" in code and the database): split an order's items
 * across physical packs and print a label per pack (Labelife D520BT). Packs can be changed while the order is
 * draft / pending / notified; labels can be reprinted at any status.
 */
export function PackageBoxesSection({
  pkg,
  receiverName,
  open,
  focus = false,
}: {
  pkg: Package
  receiverName: string
  open: boolean
  /** Scroll into view once the panel has opened (PO card "Labels" shortcut). */
  focus?: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !focus) return
    // Wait out the sheet's slide-in so the scroll lands in the final layout.
    const t = setTimeout(() => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350)
    return () => clearTimeout(t)
  }, [open, focus, pkg.id])

  const { can } = usePermissions()
  const confirm = useConfirm()
  const boxes = usePackageBoxes(pkg.id, open)
  const location = usePackageLocationName(pkg.id, open)
  const save = useSavePackageBox(pkg.id)
  const remove = useDeletePackageBox(pkg.id)
  const [editing, setEditing] = useState<'new' | string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const items = pkg.items ?? []
  const list = boxes.data ?? []
  const packable = isPackageEditable(pkg) && can('orders.pack')
  const unboxed = unboxedItems(allocateItems(items, list))

  if (items.length === 0) return null

  const labelsFor = (subset: readonly PackageBox[]) =>
    buildBoxLabels(pkg, items, list, receiverName, location.data).filter((l) =>
      subset.some((b) => b.box_number === l.boxNumber),
    )

  async function print(subset: readonly PackageBox[], key: string) {
    // Open the tab inside the click so popup blockers allow it.
    const tab = window.open('', '_blank')
    setBusy(key)
    try {
      await printBoxLabels(labelsFor(subset), tab)
    } catch (e) {
      toast.error(reportError(e, 'Could not create the labels.', { op: 'boxes.print', packageId: pkg.id }))
    } finally {
      setBusy(null)
    }
  }

  async function share(subset: readonly PackageBox[], key: string) {
    setBusy(key)
    try {
      const result = await shareBoxLabelImages(labelsFor(subset))
      if (result === 'downloaded') toast.success('Label images downloaded — print them from the Labelife app.')
    } catch (e) {
      toast.error(reportError(e, 'Could not create the label images.', { op: 'boxes.share', packageId: pkg.id }))
    } finally {
      setBusy(null)
    }
  }

  const describeBox = (box: PackageBox) => {
    const units = box.items.reduce((n, l) => n + l.quantity, 0)
    return `${box.items.length} ${box.items.length === 1 ? 'line' : 'lines'} · ${units} ${units === 1 ? 'unit' : 'units'}`
  }
  const itemName = (id: string) => items.find((i) => i.id === id)?.description ?? 'Removed item'

  return (
    <div ref={rootRef} className="flex scroll-mt-4 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Packs ({list.length})
        </span>
        {list.length > 0 && (
          <div className="flex items-center gap-1">
            <PermissionButton
              permission="orders.print_labels"
              variant="outline"
              size="sm"
              onClick={() => print(list, 'all')}
              disabled={!!busy || location.isLoading}
            >
              {busy === 'all' ? <Loader2 className="animate-spin" /> : <Printer />} Print all
            </PermissionButton>
            <PermissionButton
              permission="orders.print_labels"
              variant="ghost"
              size="icon-sm"
              onClick={() => share(list, 'all-img')}
              disabled={!!busy || location.isLoading}
              aria-label="Send all labels to the Labelife app"
              title="Send to the Labelife app (phone)"
            >
              {busy === 'all-img' ? <Loader2 className="animate-spin" /> : <Share2 />}
            </PermissionButton>
          </div>
        )}
      </div>

      {boxes.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading packs…</p>
      ) : boxes.isError ? (
        <p className="text-sm text-destructive">Could not load packs.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border empty:hidden">
          {list.map((box) =>
            editing === box.id ? (
              <li key={box.id} className="p-2">
                <BoxEditor
                  title={`Pack ${box.box_number}`}
                  items={items}
                  boxes={list}
                  box={box}
                  saving={save.isPending}
                  onCancel={() => setEditing(null)}
                  onSave={(lines) => save.mutate({ lines, boxId: box.id }, { onSuccess: () => setEditing(null) })}
                />
              </li>
            ) : (
              <li key={box.id} className="flex flex-col gap-1.5 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    Pack {box.box_number} <span className="font-normal text-muted-foreground">of {list.length}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {describeBox(box)} · packed {formatPackedDate(box.packed_at)}
                  </span>
                  <div className="ml-auto flex items-center">
                    <PermissionButton
                      permission="orders.print_labels"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => print([box], box.id)}
                      disabled={!!busy || location.isLoading}
                      aria-label={`Print label for pack ${box.box_number}`}
                    >
                      {busy === box.id ? <Loader2 className="animate-spin" /> : <Printer />}
                    </PermissionButton>
                    <PermissionButton
                      permission="orders.print_labels"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => share([box], `${box.id}-img`)}
                      disabled={!!busy || location.isLoading}
                      aria-label={`Send pack ${box.box_number} label to the Labelife app`}
                    >
                      {busy === `${box.id}-img` ? <Loader2 className="animate-spin" /> : <Share2 />}
                    </PermissionButton>
                    {packable && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditing(box.id)}
                          disabled={editing !== null}
                          aria-label={`Edit pack ${box.box_number}`}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          disabled={remove.isPending}
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Remove pack ${box.box_number}?`,
                              description:
                                list.length > box.box_number
                                  ? 'Its items go back to unpacked, and the packs after it are renumbered — reprint their labels.'
                                  : 'Its items go back to unpacked.',
                              confirmText: 'Remove pack',
                              destructive: true,
                            })
                            if (ok) remove.mutate(box.id)
                          }}
                          aria-label={`Remove pack ${box.box_number}`}
                        >
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {box.items.map((l) => (
                    <li key={l.package_item_id} className="flex gap-2">
                      <span className="tabular w-10 shrink-0 text-right text-muted-foreground">{l.quantity} ×</span>
                      <span className="truncate">{itemName(l.package_item_id)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ),
          )}
        </ul>
      )}

      {editing === 'new' && (
        <BoxEditor
          title={`Pack ${list.length + 1}`}
          items={items}
          boxes={list}
          saving={save.isPending}
          onCancel={() => setEditing(null)}
          onSave={(lines) => save.mutate({ lines }, { onSuccess: () => setEditing(null) })}
        />
      )}

      {list.length > 0 && unboxed.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-md border border-warning/45 bg-warning/10 px-2.5 py-2 text-xs text-warning-foreground dark:text-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>
            Not packed yet: {unboxed.map((a) => `${a.unboxed} × ${a.item.description}`).join(', ')}
          </span>
        </p>
      )}

      {packable && editing === null && unboxed.length > 0 && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setEditing('new')}>
          <Plus /> {list.length === 0 ? 'Split into packs' : 'Add pack'}
        </Button>
      )}
      {list.length === 0 && !packable && (
        <p className="text-sm text-muted-foreground/60">Not split into packs.</p>
      )}
    </div>
  )
}

/**
 * Quantity per item for one box. A new box starts with everything still
 * unboxed — the common case is "this all fits in one pack" — and staff trim
 * down from there.
 */
function BoxEditor({
  title,
  items,
  boxes,
  box,
  saving,
  onCancel,
  onSave,
}: {
  title: string
  items: readonly NonNullable<Package['items']>[number][]
  boxes: readonly PackageBox[]
  box?: PackageBox
  saving: boolean
  onCancel: () => void
  onSave: (lines: BoxContentLine[]) => void
}) {
  const others = useMemo(() => allocateItems(items, boxes, box?.id), [items, boxes, box?.id])
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      others.map((a) => [
        a.item.id,
        box ? (box.items.find((l) => l.package_item_id === a.item.id)?.quantity ?? 0) : a.unboxed,
      ]),
    ),
  )
  const lines = others
    .map((a) => ({ package_item_id: a.item.id, quantity: qty[a.item.id] ?? 0 }))
    .filter((l) => l.quantity > 0)

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <span className="text-sm font-semibold">{title}</span>
      {others.map((a) => {
        // Available to this box = everything not already in another box.
        const max = a.unboxed
        return (
          <div key={a.item.id} className="flex items-center gap-2">
            <span className="flex-1 truncate text-sm">{a.item.description}</span>
            <span className="tabular shrink-0 text-xs text-muted-foreground">of {max}</span>
            <Input
              type="number"
              min={0}
              max={max}
              value={qty[a.item.id] ?? 0}
              disabled={max === 0}
              onChange={(e) => {
                const v = Math.min(max, Math.max(0, Math.floor(Number(e.target.value) || 0)))
                setQty((q) => ({ ...q, [a.item.id]: v }))
              }}
              className="w-20 text-center tabular"
              aria-label={`Quantity of ${a.item.description} in ${title.toLowerCase()}`}
            />
          </div>
        )
      })}
      <div className="flex justify-end gap-2 border-t pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X /> Cancel
        </Button>
        <PermissionButton
          permission="orders.pack"
          size="sm"
          onClick={() => onSave(lines)}
          disabled={lines.length === 0 || saving}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Check />} Save pack
        </PermissionButton>
      </div>
    </div>
  )
}

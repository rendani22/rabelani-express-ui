import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Loader2, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import type { Package, PackageItemRequest, PackageItemUpdate } from '@/lib/models/package'
import { getPoRestrictedInventoryIds, updatePackage } from '@/lib/api/packages'
import { listActiveInventoryItems } from '@/lib/api/inventory'
import { reportError } from '@/lib/logger'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'

interface Draft {
  id: string
  description: string
  quantity: number
  original: number
  deleted: boolean
}
interface NewRow {
  tempId: string
  /** present for inventory-linked adds; absent for free-text custom items */
  inventory_item_id?: string
  description: string
  quantity: number
}

let tempSeq = 0
const clampQty = (v: number | string) => Math.max(1, Math.floor(Number(v) || 1))

export function PackageItemsEditor({
  pkg,
  onCancel,
  onSaved,
}: {
  pkg: Package
  onCancel: () => void
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const itemIds = useMemo(() => (pkg.items ?? []).map((i) => i.id), [pkg.items])

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    (pkg.items ?? []).map((i) => ({
      id: i.id,
      description: i.description,
      quantity: i.quantity,
      original: i.quantity,
      deleted: false,
    })),
  )
  const [newRows, setNewRows] = useState<NewRow[]>([])

  const inventory = useQuery({ queryKey: ['inventory', 'active'], queryFn: listActiveInventoryItems })
  const poRestrict = useQuery({
    queryKey: ['po-restrict', pkg.id],
    queryFn: () => getPoRestrictedInventoryIds(itemIds, pkg.po_number),
  })

  const usedIds = useMemo(() => {
    const s = new Set<string>()
    // existing rows may carry an inventory_item_id
    for (const it of pkg.items ?? []) {
      const d = drafts.find((x) => x.id === it.id)
      if (it.inventory_item_id && d && !d.deleted) s.add(it.inventory_item_id)
    }
    for (const n of newRows) if (n.inventory_item_id) s.add(n.inventory_item_id)
    return s
  }, [drafts, newRows, pkg.items])

  const available = useMemo(() => {
    const poIds = poRestrict.data
    return (inventory.data ?? []).filter(
      (i) => !usedIds.has(i.id) && (poIds == null || poIds.has(i.id)),
    )
  }, [inventory.data, poRestrict.data, usedIds])

  const hasChanges =
    newRows.some((n) => n.inventory_item_id || n.description.trim()) ||
    drafts.some((d) => d.deleted || d.quantity !== d.original)

  const save = useMutation({
    mutationFn: () => {
      const updates: PackageItemUpdate[] = drafts
        .filter((d) => !d.deleted && d.quantity !== d.original)
        .map((d) => ({ id: d.id, quantity: d.quantity }))
      const deletes = drafts.filter((d) => d.deleted).map((d) => d.id)
      const creates: PackageItemRequest[] = newRows
        .filter((n) => (n.inventory_item_id || n.description.trim()) && Number.isInteger(n.quantity) && n.quantity >= 1)
        .map((n) => ({
          quantity: n.quantity,
          description: n.description.trim() || 'Item',
          ...(n.inventory_item_id ? { inventory_item_id: n.inventory_item_id } : {}),
        }))
      return updatePackage(pkg.id, { items: { updates, deletes, creates } })
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success('Package items updated.')
        qc.invalidateQueries({ queryKey: ['orders'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        qc.invalidateQueries({ queryKey: ['inventory'] })
        onSaved()
      } else {
        toast.error(reportError(res.error, 'Could not save the package items.', { op: 'orders.updateItems' }))
      }
    },
    onError: (e) => toast.error(reportError(e, 'Something went wrong while saving the package items.', { op: 'orders.updateItems' })),
  })

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      {/* existing items */}
      {drafts.map((d) => (
        <div key={d.id} className="flex items-center gap-2">
          <span className={cn('flex-1 truncate text-sm', d.deleted && 'text-muted-foreground line-through')}>
            {d.description}
          </span>
          <Input
            type="number"
            min={1}
            value={d.quantity}
            disabled={d.deleted}
            onChange={(e) =>
              setDrafts((rows) => rows.map((r) => (r.id === d.id ? { ...r, quantity: clampQty(e.target.value) } : r)))
            }
            className="w-20 text-center tabular"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(!d.deleted && 'text-destructive hover:text-destructive')}
            onClick={() => setDrafts((rows) => rows.map((r) => (r.id === d.id ? { ...r, deleted: !r.deleted } : r)))}
            aria-label={d.deleted ? 'Restore item' : 'Remove item'}
          >
            {d.deleted ? <RotateCcw /> : <Trash2 />}
          </Button>
        </div>
      ))}

      {/* new items */}
      {newRows.map((n) => (
        <div key={n.tempId} className="flex items-center gap-2">
          {n.inventory_item_id ? (
            <span className="flex-1 truncate text-sm">
              {n.description}
              <span className="ml-1.5 rounded bg-primary/10 px-1 text-[10px] font-semibold uppercase text-primary">new</span>
            </span>
          ) : (
            <Input
              placeholder="Item description"
              value={n.description}
              onChange={(e) =>
                setNewRows((rows) => rows.map((r) => (r.tempId === n.tempId ? { ...r, description: e.target.value } : r)))
              }
              className="flex-1"
            />
          )}
          <Input
            type="number"
            min={1}
            value={n.quantity}
            onChange={(e) =>
              setNewRows((rows) => rows.map((r) => (r.tempId === n.tempId ? { ...r, quantity: clampQty(e.target.value) } : r)))
            }
            className="w-20 text-center tabular"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setNewRows((rows) => rows.filter((r) => r.tempId !== n.tempId))}
            aria-label="Remove new item"
          >
            <X />
          </Button>
        </div>
      ))}

      {/* add: inventory-linked or free-text */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[180px] flex-1">
          <Combobox
            options={available.map((it) => ({
              value: it.id,
              label: it.name,
              hint: it.sku ?? undefined,
              keywords: [it.name, it.sku, it.category].filter(Boolean) as string[],
            }))}
            value=""
            onChange={(id) => {
              const inv = inventory.data?.find((i) => i.id === id)
              if (inv) setNewRows((rows) => [...rows, { tempId: `n-${++tempSeq}`, inventory_item_id: id, description: inv.name, quantity: 1 }])
            }}
            loading={inventory.isLoading || poRestrict.isLoading}
            placeholder={poRestrict.data ? 'Add PO item…' : 'Add from inventory…'}
            searchPlaceholder="Search inventory…"
            emptyText="No matching items."
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setNewRows((rows) => [...rows, { tempId: `n-${++tempSeq}`, description: '', quantity: 1 }])}
        >
          <Plus /> Custom item
        </Button>
      </div>

      {poRestrict.data && (
        <p className="text-xs text-muted-foreground">
          This order is linked to PO {pkg.po_number}; only items on that PO can be added.
        </p>
      )}

      <div className="flex justify-end gap-2 border-t pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={save.isPending}>
          <X /> Cancel
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={!hasChanges || save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save items
        </Button>
      </div>
    </div>
  )
}

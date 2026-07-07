import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Package as PackageIcon, Plus, Search, Trash2, X } from 'lucide-react'
import type {
  CreatePackageRequest,
  PackageItemRequest,
  PurchaseOrderAllocationRequest,
} from '@/lib/models/package'
import { PACKAGE_STATUS } from '@/lib/status'
import {
  createPackage,
  getPackageByPoNumber,
  getPurchaseOrderByNumber,
} from '@/lib/api/packages'
import { listActiveReceivers } from '@/lib/api/receivers'
import { listActiveDeliveryLocations } from '@/lib/api/delivery-locations'
import { deductStock, listActiveInventoryItems } from '@/lib/api/inventory'
import { logger, reportError } from '@/lib/logger'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'

interface FreeItem {
  key: string
  description: string
  quantity: number
  inventory_item_id?: string | null
}

interface PoLine {
  purchaseOrderItemId: string
  inventoryItemId: string
  remainingQuantity: number
  description: string
  included: boolean
  quantity: number
}

let keySeq = 0
const nextKey = () => `it-${++keySeq}`

export function CreatePackageDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()

  const receivers = useQuery({ queryKey: ['receivers', 'active'], queryFn: listActiveReceivers, enabled: open })
  const locations = useQuery({ queryKey: ['locations', 'active'], queryFn: listActiveDeliveryLocations, enabled: open })
  const inventory = useQuery({ queryKey: ['inventory', 'active'], queryFn: listActiveInventoryItems, enabled: open })

  const [receiverEmail, setReceiverEmail] = useState('')
  const [customEmail, setCustomEmail] = useState(false)
  const [locationId, setLocationId] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [asDraft, setAsDraft] = useState(false)
  const [items, setItems] = useState<FreeItem[]>([])
  const [poLines, setPoLines] = useState<PoLine[]>([])
  const [poState, setPoState] = useState<'idle' | 'loading' | 'loaded' | 'not_found'>('idle')
  const [dupAck, setDupAck] = useState(false)

  const invName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const it of inventory.data ?? []) m[it.id] = it.name
    return m
  }, [inventory.data])

  const reset = () => {
    setReceiverEmail(''); setCustomEmail(false); setLocationId(''); setPoNumber(''); setNotes('')
    setAsDraft(false); setItems([]); setPoLines([]); setPoState('idle'); setDupAck(false)
  }

  const lookupPo = useMutation({
    mutationFn: () => getPurchaseOrderByNumber(poNumber.trim()),
    onMutate: () => setPoState('loading'),
    onSuccess: (res) => {
      if (res.success && res.data.items.length) {
        const eligible = res.data.items
          .filter((i) => i.remainingQuantity > 0)
          .map<PoLine>((i) => ({
            purchaseOrderItemId: i.purchaseOrderItemId,
            inventoryItemId: i.inventoryItemId,
            remainingQuantity: i.remainingQuantity,
            description: invName[i.inventoryItemId] ?? 'PO item',
            included: false,
            quantity: i.remainingQuantity,
          }))
        setPoLines(eligible)
        setPoState('loaded')
      } else {
        setPoLines([])
        setPoState('not_found')
      }
    },
    onError: () => setPoState('not_found'),
  })

  const create = useMutation({
    mutationFn: async () => {
      const email = receiverEmail.trim().toLowerCase()
      const includedLines = poLines.filter((l) => l.included && l.quantity > 0)

      // items = free items (valid) + included PO lines
      const validFree = items.filter((i) => i.description.trim() && i.quantity > 0)
      const lineItems: FreeItem[] = includedLines.map((l) => ({
        key: l.purchaseOrderItemId,
        description: l.description,
        quantity: l.quantity,
        inventory_item_id: l.inventoryItemId,
      }))
      const allItems = [...validFree, ...lineItems]

      const reqItems: PackageItemRequest[] = allItems.map((i) => ({
        quantity: i.quantity,
        description: i.description.trim(),
        ...(i.inventory_item_id ? { inventory_item_id: i.inventory_item_id } : {}),
      }))

      // po_allocations reference item_index in the items array
      const po_allocations: PurchaseOrderAllocationRequest[] = includedLines.map((l) => ({
        purchase_order_item_id: l.purchaseOrderItemId,
        item_index: allItems.findIndex((it) => it.key === l.purchaseOrderItemId),
        quantity: l.quantity,
      }))

      const request: CreatePackageRequest = {
        receiver_email: email,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(poNumber.trim() ? { po_number: poNumber.trim() } : {}),
        ...(locationId ? { delivery_location_id: locationId } : {}),
        ...(reqItems.length ? { items: reqItems } : {}),
        ...(po_allocations.length ? { po_allocations } : {}),
        ...(asDraft ? { status: PACKAGE_STATUS.DRAFT } : {}),
      }

      // duplicate PO warning (non-blocking, requires ack)
      if (request.po_number && !dupAck) {
        const existing = await getPackageByPoNumber(request.po_number)
        if (existing.success && existing.data) {
          setDupAck(true)
          throw new Error(`An order with PO "${request.po_number}" already exists — submit again to create anyway.`)
        }
      }
      const res = await createPackage(request)

      // Deduct inventory stock for created items sourced from inventory, and log
      // a `package_deduct` movement. Parity with the old create-package modal —
      // the edge function stores `inventory_item_id` but does NOT decrement stock.
      // Non-fatal: a deduction failure must not fail the (already-created) package.
      if (res.success) {
        const deductions = allItems
          .filter((i) => i.inventory_item_id && i.quantity > 0)
          .map((i) => ({ inventoryItemId: i.inventory_item_id as string, quantity: i.quantity }))
        if (deductions.length > 0) {
          try {
            await deductStock(deductions, res.data.package.reference)
          } catch (e) {
            logger.error(e, { op: 'orders.createPackage.deductStock' })
            toast.warning('Package created, but inventory stock could not be updated. Please adjust it manually.')
          }
        }
      }
      return res
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success('Package created.')
        qc.invalidateQueries({ queryKey: ['orders'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        qc.invalidateQueries({ queryKey: ['inventory'] })
        reset()
        onOpenChange(false)
      } else {
        toast.error(reportError(res.error, 'Could not create the package.', { op: 'orders.createPackage' }))
      }
    },
    onError: (e) => toast.warning(reportError(e, 'Could not create the package.', { op: 'orders.createPackage' })),
  })

  const canSubmit =
    !!receiverEmail.trim() &&
    !!poNumber.trim() &&
    !!locationId &&
    (items.some((i) => i.description.trim() && i.quantity > 0) || poLines.some((l) => l.included))

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageIcon className="size-4 text-primary" /> New package
          </DialogTitle>
          <DialogDescription>Register a package and its contents for dispatch.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* receiver */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>
                Receiver <span className="text-destructive">*</span>
              </Label>
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => { setCustomEmail((c) => !c); setReceiverEmail('') }}
              >
                {customEmail ? 'Pick from list' : 'Enter new email'}
              </button>
            </div>
            {customEmail ? (
              <Input
                type="email"
                placeholder="receiver@example.com"
                value={receiverEmail}
                onChange={(e) => setReceiverEmail(e.target.value)}
              />
            ) : (
              <Combobox
                options={(receivers.data ?? []).map((r) => ({
                  value: r.email,
                  label: [r.name, r.surname].filter(Boolean).join(' ') || r.email,
                  hint: r.email,
                  keywords: [r.email, r.name, r.surname].filter(Boolean) as string[],
                }))}
                value={receiverEmail}
                onChange={setReceiverEmail}
                loading={receivers.isLoading}
                placeholder="Select a receiver"
                searchPlaceholder="Search receivers…"
                emptyText="No receivers found."
              />
            )}
          </div>

          {/* location + PO */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>
                Delivery location <span className="text-destructive">*</span>
              </Label>
              <Combobox
                options={(locations.data ?? []).map((l) => ({
                  value: l.id,
                  label: l.name,
                  hint: l.address,
                  keywords: [l.name, l.address].filter(Boolean) as string[],
                }))}
                value={locationId}
                onChange={setLocationId}
                loading={locations.isLoading}
                placeholder="Select"
                searchPlaceholder="Search locations…"
                emptyText="No locations found."
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>
                PO number <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  value={poNumber}
                  onChange={(e) => { setPoNumber(e.target.value); setPoState('idle'); setPoLines([]); setDupAck(false) }}
                  placeholder="PO-0000"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => poNumber.trim() && lookupPo.mutate()}
                  disabled={!poNumber.trim() || poState === 'loading'}
                  aria-label="Look up PO"
                >
                  {poState === 'loading' ? <Loader2 className="animate-spin" /> : <Search />}
                </Button>
              </div>
              {poState === 'not_found' && <p className="text-xs text-destructive">No PO found.</p>}
              {poState === 'loaded' && <p className="text-xs text-success">{poLines.length} eligible line(s).</p>}
            </div>
          </div>

          {/* PO lines */}
          {poLines.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                PO lines
              </span>
              {poLines.map((l, i) => (
                <div key={l.purchaseOrderItemId} className="flex items-center gap-3">
                  <Checkbox
                    checked={l.included}
                    onCheckedChange={(v) =>
                      setPoLines((ls) => ls.map((x, xi) => (xi === i ? { ...x, included: !!v } : x)))
                    }
                  />
                  <span className="flex-1 truncate text-sm">{l.description}</span>
                  <span className="text-xs text-muted-foreground">/ {l.remainingQuantity}</span>
                  <Input
                    type="number"
                    min={1}
                    max={l.remainingQuantity}
                    value={l.quantity}
                    disabled={!l.included}
                    onChange={(e) =>
                      setPoLines((ls) =>
                        ls.map((x, xi) => (xi === i ? { ...x, quantity: Math.min(l.remainingQuantity, Math.max(1, Number(e.target.value) || 1)) } : x)),
                      )
                    }
                    className="h-8 w-20 text-center tabular"
                  />
                </div>
              ))}
            </div>
          )}

          {/* free items */}
          <div className="flex flex-col gap-2">
            <Label>Items</Label>
            {items.map((it, i) => (
              <div key={it.key} className="flex items-center gap-2">
                <Input
                  placeholder="Item description"
                  value={it.description}
                  onChange={(e) =>
                    setItems((xs) => xs.map((x, xi) => (xi === i ? { ...x, description: e.target.value } : x)))
                  }
                />
                <Input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) =>
                    setItems((xs) => xs.map((x, xi) => (xi === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))
                  }
                  className="w-20 text-center tabular"
                />
                <Button variant="ghost" size="icon-sm" onClick={() => setItems((xs) => xs.filter((_, xi) => xi !== i))} aria-label="Remove">
                  <X />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-[220px]">
                <Combobox
                  options={(inventory.data ?? []).map((it) => ({
                    value: it.id,
                    label: it.name,
                    hint: it.sku ?? undefined,
                    keywords: [it.name, it.sku, it.category].filter(Boolean) as string[],
                  }))}
                  value=""
                  onChange={(v) => {
                    setItems((xs) => [...xs, { key: nextKey(), description: invName[v] ?? '', quantity: 1, inventory_item_id: v }])
                  }}
                  loading={inventory.isLoading}
                  placeholder="Add from inventory…"
                  searchPlaceholder="Search inventory…"
                  emptyText="No items found."
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems((xs) => [...xs, { key: nextKey(), description: '', quantity: 1 }])}
              >
                <Plus /> Custom item
              </Button>
            </div>
          </div>

          {/* notes */}
          <div className="flex flex-col gap-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={asDraft} onCheckedChange={(v) => setAsDraft(!!v)} />
            Save as draft (don&apos;t notify the receiver yet)
          </label>

          {dupAck && (
            <p className={cn('rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground dark:text-warning')}>
              A package with this PO already exists. Submit again to create anyway.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />}
            {asDraft ? 'Save draft' : 'Create package'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

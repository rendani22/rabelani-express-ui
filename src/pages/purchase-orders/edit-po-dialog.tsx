import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  getPurchaseOrderForEdit,
  getPurchaseOrderIdByNumber,
  updatePurchaseOrder,
} from '@/lib/api/purchase-orders'
import { listInventoryItems } from '@/lib/api/inventory'
import { listActiveReceivers } from '@/lib/api/receivers'
import { reportError } from '@/lib/logger'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PermissionButton } from '@/components/dispatch/permission-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Combobox } from '@/components/ui/combobox'
import { PoLineEditor, poLinesValid, type PoLine } from './po-line-editor'

/** Loads a PO's editable payload by number, then edits it. */
export function EditPoDialog({
  poNumber,
  open,
  onOpenChange,
}: {
  poNumber: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const inventory = useQuery({ queryKey: ['inventory'], queryFn: listInventoryItems, enabled: open })
  const receivers = useQuery({ queryKey: ['receivers', 'active'], queryFn: listActiveReceivers, enabled: open })

  const payload = useQuery({
    queryKey: ['po-edit', poNumber],
    enabled: open && !!poNumber,
    queryFn: async () => {
      const id = await getPurchaseOrderIdByNumber(poNumber!)
      if (!id) throw new Error('Purchase order not found.')
      const res = await getPurchaseOrderForEdit(id)
      if (!res.success) throw new Error(res.error)
      return res.data
    },
  })

  const [poNo, setPoNo] = useState('')
  const [receiverId, setReceiverId] = useState('')
  const [poValue, setPoValue] = useState('')
  const [poDate, setPoDate] = useState('')
  const [details, setDetails] = useState('')
  const [lines, setLines] = useState<PoLine[]>([])
  const [seeded, setSeeded] = useState(false)

  // Seed the form once the payload arrives.
  useEffect(() => {
    if (payload.data && !seeded) {
      const d = payload.data
      setPoNo(d.poNumber)
      setReceiverId(d.receiverId ?? '')
      setPoValue(d.poValue != null ? String(d.poValue) : '')
      setPoDate(d.poDate ?? '')
      setDetails(d.details ?? '')
      setLines(
        d.items.map((it, i) => ({
          key: `existing-${i}`,
          purchaseOrderItemId: it.purchaseOrderItemId,
          inventoryItemId: it.inventoryItemId,
          orderedQuantity: String(it.orderedQuantity),
          minAllowedQuantity: Math.max(1, it.minAllowedQuantity),
        })),
      )
      setSeeded(true)
    }
  }, [payload.data, seeded])

  // Reset seeding when dialog closes so it re-seeds next open.
  useEffect(() => {
    if (!open) setSeeded(false)
  }, [open])

  const receiverOptions = useMemo(
    () => (receivers.data ?? []).map((r) => ({ value: r.id, label: `${r.name} ${r.surname}`.trim(), keywords: [r.email], hint: r.email })),
    [receivers.data],
  )

  const valNum = Number(poValue)
  const valid =
    poNo.trim().length > 0 &&
    receiverId.length > 0 &&
    poValue.trim().length > 0 &&
    Number.isFinite(valNum) &&
    valNum >= 0 &&
    poDate.length > 0 &&
    poLinesValid(lines)

  const save = useMutation({
    mutationFn: async () => {
      const res = await updatePurchaseOrder({
        purchaseOrderId: payload.data!.purchaseOrderId,
        poNumber: poNo.trim(),
        items: lines.map((l) => ({
          purchaseOrderItemId: l.purchaseOrderItemId,
          inventoryItemId: l.inventoryItemId,
          orderedQuantity: Number(l.orderedQuantity),
        })),
        receiverId,
        poValue: valNum,
        poDate,
        details: details.trim() || null,
      })
      if (!res.success) throw new Error(res.error ?? 'Failed to update purchase order.')
    },
    onSuccess: () => {
      toast.success(`Purchase order ${poNo} updated.`)
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(reportError(e, 'Could not update the purchase order.', { op: 'po.update' })),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !(save.isPending && !o) && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit purchase order</DialogTitle>
          <DialogDescription>Update PO details and lines. Quantities can’t drop below what’s already allocated.</DialogDescription>
        </DialogHeader>

        {payload.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading purchase order…
          </div>
        ) : payload.isError ? (
          <div className="py-12 text-center text-sm text-destructive">
            {(payload.error as Error)?.message ?? 'Failed to load purchase order.'}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 py-3">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>PO number *</Label>
                  <Input value={poNo} onChange={(e) => setPoNo(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Customer *</Label>
                  <Combobox
                    options={receiverOptions}
                    value={receiverId}
                    onChange={setReceiverId}
                    placeholder={receivers.isLoading ? 'Loading…' : 'Select customer…'}
                    searchPlaceholder="Search customers…"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>PO value (ZAR) *</Label>
                  <Input type="number" min="0" step="0.01" value={poValue} onChange={(e) => setPoValue(e.target.value)} className="tabular" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>PO date *</Label>
                  <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className="tabular" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Details</Label>
                <Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} placeholder="Optional notes…" />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>PO lines *</Label>
                <PoLineEditor lines={lines} onChange={setLines} items={inventory.data ?? []} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
                Cancel
              </Button>
              <PermissionButton permission="purchase_orders.update" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
                {save.isPending && <Loader2 className="animate-spin" />}
                Save changes
              </PermissionButton>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

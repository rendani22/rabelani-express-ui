import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileText, Loader2, Upload, X } from 'lucide-react'
import { createPurchaseOrder, uploadPODocument } from '@/lib/api/purchase-orders'
import { logger, reportError } from '@/lib/logger'
import { listInventoryItems } from '@/lib/api/inventory'
import { listActiveReceivers } from '@/lib/api/receivers'
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
import { Combobox } from '@/components/ui/combobox'
import { PoLineEditor, newPoLine, poLinesValid, type PoLine } from './po-line-editor'

const todayIso = () => new Date().toISOString().slice(0, 10)

export function CreatePoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const inventory = useQuery({ queryKey: ['inventory'], queryFn: listInventoryItems, enabled: open })
  const receivers = useQuery({ queryKey: ['receivers', 'active'], queryFn: listActiveReceivers, enabled: open })

  const [poNumber, setPoNumber] = useState('')
  const [receiverId, setReceiverId] = useState('')
  const [poValue, setPoValue] = useState('')
  const [poDate, setPoDate] = useState(todayIso())
  const [details, setDetails] = useState('')
  const [lines, setLines] = useState<PoLine[]>([newPoLine()])
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    if (open) {
      setPoNumber('')
      setReceiverId('')
      setPoValue('')
      setPoDate(todayIso())
      setDetails('')
      setLines([newPoLine()])
      setFile(null)
    }
  }, [open])

  const receiverOptions = useMemo(
    () =>
      (receivers.data ?? []).map((r) => ({
        value: r.id,
        label: `${r.name} ${r.surname}`.trim(),
        keywords: [r.email],
        hint: r.email,
      })),
    [receivers.data],
  )

  const valNum = Number(poValue)
  const valid =
    poNumber.trim().length > 0 &&
    receiverId.length > 0 &&
    poValue.trim().length > 0 &&
    Number.isFinite(valNum) &&
    valNum >= 0 &&
    poDate.length > 0 &&
    poLinesValid(lines) &&
    !!file

  const save = useMutation({
    mutationFn: async () => {
      const res = await createPurchaseOrder({
        poNumber: poNumber.trim(),
        items: lines.map((l) => ({ inventoryItemId: l.inventoryItemId, orderedQuantity: Number(l.orderedQuantity) })),
        receiverId,
        poValue: valNum,
        poDate,
        details: details.trim() || null,
      })
      if (!res.success) throw new Error(res.error ?? 'Failed to create purchase order.')
      // Upload the PO document (best-effort — warn but don't fail the whole create)
      const upload = await uploadPODocument(res.purchaseOrderId!, file!)
      return { uploadFailed: !upload.success, uploadError: upload.error }
    },
    onSuccess: ({ uploadFailed, uploadError }) => {
      if (uploadFailed) {
        logger.error(uploadError ?? 'PO document upload failed', { op: 'po.create.upload' })
        toast.warning(`PO ${poNumber} created, but document upload failed: ${uploadError ?? 'unknown error'}`)
      } else {
        toast.success(`Purchase order ${poNumber} created.`)
      }
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(reportError(e, 'Could not create the purchase order.', { op: 'po.create' })),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !(save.isPending && !o) && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create purchase order</DialogTitle>
          <DialogDescription>Raise a PO for a customer and link the inventory it covers.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>PO number *</Label>
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-2026-0142" autoFocus />
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
              <Input
                type="number"
                min="0"
                step="0.01"
                value={poValue}
                onChange={(e) => setPoValue(e.target.value)}
                placeholder="0.00"
                className="tabular"
              />
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

          <div className="flex flex-col gap-1.5">
            <Label>PO document *</Label>
            {file ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <FileText className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate">{file.name}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setFile(null)} aria-label="Remove file">
                  <X />
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/40">
                <Upload className="size-4" />
                <span>Choose a file (PDF or image)…</span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            Create PO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

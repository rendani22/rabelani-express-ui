import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Box, Loader2, TrendingUp } from 'lucide-react'
import type { InventoryItem } from '@/lib/api/inventory'
import { restockInventoryItem } from '@/lib/api/inventory'
import { reportError } from '@/lib/logger'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PermissionButton } from '@/components/dispatch/permission-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function RestockDialog({
  item,
  open,
  onOpenChange,
}: {
  item: InventoryItem | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setQuantity('1')
      setNote('')
    }
  }, [open])

  const add = Number(quantity)
  const valid = Number.isFinite(add) && add >= 1
  const onHand = item?.quantity ?? 0
  const after = onHand + (valid ? add : 0)

  const restock = useMutation({
    mutationFn: () => restockInventoryItem(item!.id, add, note.trim() || null),
    onSuccess: () => {
      toast.success(`Added ${add} ${item!.unit} to "${item!.name}".`)
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['inventory-movements', item!.id] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(reportError(e, 'Could not add stock to this item.', { op: 'inventory.restock' })),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-success/12 text-success">
              <TrendingUp className="size-[18px]" />
            </span>
            <span className="flex flex-col">
              <span>Add stock</span>
              <span className="truncate text-xs font-normal text-muted-foreground">{item?.name}</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Box className="size-3.5" /> On hand
            </span>
            <span className="tabular font-semibold">
              {onHand.toLocaleString()} {item?.unit}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Quantity to add *</Label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="tabular"
              autoFocus
            />
            {!valid && quantity.length > 0 && (
              <span className="text-xs text-destructive">Must add at least 1.</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="tabular text-muted-foreground">{onHand.toLocaleString()}</span>
            <span className="text-muted-foreground/50">→</span>
            <span className="tabular font-semibold text-success">{after.toLocaleString()}</span>
            <span className="text-muted-foreground">{item?.unit}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. PO #4512 from Supplier X"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <PermissionButton permission="inventory.restock" onClick={() => restock.mutate()} disabled={!valid || restock.isPending}>
            {restock.isPending && <Loader2 className="animate-spin" />}
            Add stock
          </PermissionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

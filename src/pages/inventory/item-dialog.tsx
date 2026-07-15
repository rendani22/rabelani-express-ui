import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { CreateInventoryItemDto, InventoryItem, UpdateInventoryItemDto } from '@/lib/api/inventory'
import { createInventoryItem, updateInventoryItem } from '@/lib/api/inventory'
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

interface FormState {
  name: string
  sku: string
  category: string
  unit: string
  quantity: string
  low_stock_threshold: string
  unit_price: string
  description: string
}

const empty: FormState = {
  name: '',
  sku: '',
  category: '',
  unit: 'pieces',
  quantity: '0',
  low_stock_threshold: '10',
  unit_price: '',
  description: '',
}

export function ItemDialog({
  item,
  open,
  onOpenChange,
}: {
  item: InventoryItem | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(empty)

  useEffect(() => {
    if (!open) return
    setForm(
      item
        ? {
            name: item.name,
            sku: item.sku ?? '',
            category: item.category ?? '',
            unit: item.unit,
            quantity: String(item.quantity),
            low_stock_threshold: String(item.low_stock_threshold),
            unit_price: item.unit_price != null ? String(item.unit_price) : '',
            description: item.description ?? '',
          }
        : empty,
    )
  }, [open, item])

  const set =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  const nameValid = form.name.trim().length >= 2
  const qtyNum = Number(form.quantity)
  const thresholdNum = Number(form.low_stock_threshold)
  const valid =
    nameValid &&
    Number.isFinite(qtyNum) &&
    qtyNum >= 0 &&
    Number.isFinite(thresholdNum) &&
    thresholdNum >= 0 &&
    form.unit.trim().length > 0

  const save = useMutation({
    mutationFn: () => {
      const base = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        category: form.category.trim() || null,
        unit: form.unit.trim(),
        quantity: qtyNum,
        low_stock_threshold: thresholdNum,
        unit_price: form.unit_price.trim() ? Number(form.unit_price) : null,
        description: form.description.trim() || null,
      }
      return item
        ? updateInventoryItem(item.id, base as UpdateInventoryItemDto)
        : createInventoryItem(base as CreateInventoryItemDto)
    },
    onSuccess: (saved) => {
      toast.success(item ? `"${saved.name}" updated.` : `"${saved.name}" added to inventory.`)
      qc.invalidateQueries({ queryKey: ['inventory'] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(reportError(e, 'Could not save the item.', { op: 'inventory.save' })),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit item' : 'New inventory item'}</DialogTitle>
          <DialogDescription>
            {item ? 'Update the details for this stock item.' : 'Add a stock item to the catalogue.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Name *</Label>
            <Input value={form.name} onChange={set('name')} placeholder="e.g. Bubble wrap roll" autoFocus />
            {!nameValid && form.name.length > 0 && (
              <span className="text-xs text-destructive">Must be at least 2 characters.</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>SKU</Label>
            <Input value={form.sku} onChange={set('sku')} placeholder="BW-500" className="mono" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Input value={form.category} onChange={set('category')} placeholder="Packaging" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Unit *</Label>
            <Input value={form.unit} onChange={set('unit')} placeholder="pieces" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Unit price (ZAR)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.unit_price}
              onChange={set('unit_price')}
              placeholder="0.00"
              className="tabular"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Quantity on hand *</Label>
            <Input type="number" min="0" value={form.quantity} onChange={set('quantity')} className="tabular" />
            {item && (
              <span className="text-xs text-muted-foreground">
                Changing this logs a stock movement.
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Low-stock alert at *</Label>
            <Input
              type="number"
              min="0"
              value={form.low_stock_threshold}
              onChange={set('low_stock_threshold')}
              className="tabular"
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={set('description')} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <PermissionButton
            permission={item ? 'inventory.update' : 'inventory.create'}
            onClick={() => save.mutate()}
            disabled={!valid || save.isPending}
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            {item ? 'Save changes' : 'Add item'}
          </PermissionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

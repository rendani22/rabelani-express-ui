import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { DeliveryLocation } from '@/lib/api/delivery-locations'
import { createDeliveryLocation, updateDeliveryLocation } from '@/lib/api/delivery-locations'
import { reportError } from '@/lib/logger'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const empty = { name: '', description: '', address: '', latitude: '', longitude: '' }

export function LocationDialog({
  location,
  open,
  onOpenChange,
}: {
  location: DeliveryLocation | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState(empty)

  useEffect(() => {
    if (open) {
      setForm(
        location
          ? {
              name: location.name ?? '',
              description: location.description ?? '',
              address: location.address ?? '',
              latitude: location.latitude?.toString() ?? '',
              longitude: location.longitude?.toString() ?? '',
            }
          : empty,
      )
    }
  }, [open, location])

  const save = useMutation({
    mutationFn: () => {
      const dto = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        address: form.address.trim() || undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
      }
      return location ? updateDeliveryLocation(location.id, dto) : createDeliveryLocation(dto)
    },
    onSuccess: () => {
      toast.success(location ? 'Location updated.' : 'Location added.')
      qc.invalidateQueries({ queryKey: ['locations'] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(reportError(e, 'Could not save the location.', { op: 'locations.save' })),
  })

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{location ? 'Edit location' : 'New location'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Name *</Label>
            <Input value={form.name} onChange={set('name')} placeholder="Polokwane depot" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={set('description')} rows={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Address</Label>
            <Input value={form.address} onChange={set('address')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Latitude</Label>
              <Input type="number" value={form.latitude} onChange={set('latitude')} className="tabular" placeholder="-23.90" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Longitude</Label>
              <Input type="number" value={form.longitude} onChange={set('longitude')} className="tabular" placeholder="29.47" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {location ? 'Save' : 'Add location'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

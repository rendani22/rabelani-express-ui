import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createStaff } from '@/lib/api/staff'
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
import { Combobox } from '@/components/ui/combobox'

// Vehicle types offered when creating a driver. Stored on the profile's
// `department` column as `Vehicle: <type>` to match the original Angular
// `DriverService.createDriver()` behaviour.
const VEHICLE_TYPES = ['motorcycle', 'car', 'van', 'truck'] as const
type VehicleType = (typeof VEHICLE_TYPES)[number]
const DEFAULT_VEHICLE: VehicleType = 'car'
const vehicleLabel = (v: string) => v.charAt(0).toUpperCase() + v.slice(1)

const EMPTY: {
  full_name: string
  email: string
  password: string
  phone: string
  vehicle_type: VehicleType
} = {
  full_name: '',
  email: '',
  password: '',
  phone: '',
  vehicle_type: DEFAULT_VEHICLE,
}

export function AddDriverDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ ...EMPTY })

  useEffect(() => {
    if (open) setForm({ ...EMPTY })
  }, [open])

  const save = useMutation({
    mutationFn: () =>
      createStaff({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        full_name: form.full_name.trim(),
        role: 'driver',
        phone: form.phone.trim() || undefined,
        department: `Vehicle: ${form.vehicle_type}`,
      }),
    onSuccess: () => {
      toast.success(`Driver "${form.full_name.trim()}" created.`)
      qc.invalidateQueries({ queryKey: ['drivers'] })
      qc.invalidateQueries({ queryKey: ['staff'] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(reportError(e, 'Could not create the driver.', { op: 'drivers.create' })),
  })

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  const canSubmit = form.full_name.trim() && form.email.trim() && form.password.length >= 6

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New driver</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Full name *</Label>
            <Input value={form.full_name} onChange={set('full_name')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={set('email')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Password *</Label>
            <Input type="password" value={form.password} onChange={set('password')} placeholder="≥ 6 chars" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={set('phone')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Vehicle</Label>
            <Combobox
              options={VEHICLE_TYPES.map((v) => ({ value: v, label: vehicleLabel(v) }))}
              value={form.vehicle_type}
              onChange={(v) => setForm((f) => ({ ...f, vehicle_type: v as VehicleType }))}
              searchPlaceholder="Search vehicle…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <PermissionButton permission="users.manage" onClick={() => save.mutate()} disabled={!canSubmit || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            Create driver
          </PermissionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

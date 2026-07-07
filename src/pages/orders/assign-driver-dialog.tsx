import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Truck } from 'lucide-react'
import type { Package } from '@/lib/models/package'
import { PACKAGE_STATUS } from '@/lib/status'
import { updatePackage } from '@/lib/api/packages'
import { listDrivers } from '@/lib/api/drivers'
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
import { Combobox } from '@/components/ui/combobox'
import { TrackingNumber } from '@/components/dispatch'

export function AssignDriverDialog({
  pkg,
  open,
  onOpenChange,
  onDone,
}: {
  pkg: Package | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onDone?: () => void
}) {
  const qc = useQueryClient()
  const [driverId, setDriverId] = useState('')

  const drivers = useQuery({ queryKey: ['drivers'], queryFn: listDrivers, enabled: open })

  const assign = useMutation({
    mutationFn: async () => {
      const driver = drivers.data?.find((d) => d.user_id === driverId)
      const res = await updatePackage(pkg!.id, {
        status: PACKAGE_STATUS.IN_TRANSIT,
        driver_user_id: driverId,
      })
      return { res, driverName: driver?.full_name ?? driver?.name ?? 'driver' }
    },
    onSuccess: ({ res, driverName }) => {
      if (res.success) {
        toast.success(`${pkg?.reference} assigned to ${driverName} and marked in transit.`)
        qc.invalidateQueries({ queryKey: ['orders'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        onOpenChange(false)
        onDone?.()
        setDriverId('')
      } else {
        toast.error(reportError(res.error, 'Could not assign the driver.', { op: 'orders.assignDriver' }))
      }
    },
    onError: (e) => toast.error(reportError(e, 'Something went wrong while assigning the driver.', { op: 'orders.assignDriver' })),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-4 text-primary" /> Assign driver & dispatch
          </DialogTitle>
          <DialogDescription>
            {pkg && (
              <span className="inline-flex items-center gap-2">
                Dispatch <TrackingNumber value={pkg.reference} /> — this marks it in transit.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Combobox
            options={(drivers.data ?? []).map((d) => ({
              value: d.user_id,
              label: d.full_name || [d.name, d.surname].filter(Boolean).join(' ') || d.email,
              hint: d.email,
              keywords: [d.full_name, d.name, d.surname, d.email].filter(Boolean) as string[],
            }))}
            value={driverId}
            onChange={setDriverId}
            loading={drivers.isLoading}
            placeholder="Select a driver"
            searchPlaceholder="Search drivers…"
            emptyText="No drivers found."
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => assign.mutate()} disabled={!driverId || assign.isPending}>
            {assign.isPending && <Loader2 className="animate-spin" />}
            Dispatch package
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

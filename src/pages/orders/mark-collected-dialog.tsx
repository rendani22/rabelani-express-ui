import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, ShieldCheck } from 'lucide-react'
import type { MarkCollectedPayload, Package, PodParty, PodRecord } from '@/lib/models/package'
import { PACKAGE_STATUS } from '@/lib/status'
import { updatePackage } from '@/lib/api/packages'
import { getCurrentStaffProfile } from '@/lib/api/staff'
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
import { SignaturePad, type SignaturePadHandle } from '@/components/dispatch/signature-pad'
import { TrackingNumber } from '@/components/dispatch'

interface PartyForm {
  name: string
  employee_number: string
  phone: string
}

const emptyParty: PartyForm = { name: '', employee_number: '', phone: '' }

/** Convert a Blob to a raw base64 string (no `data:` prefix) for the POD email attachment. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result).replace(/^data:.*;base64,/, ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function PartyFields({
  legend,
  value,
  onChange,
  sigRef,
}: {
  legend: string
  value: PartyForm
  onChange: (v: PartyForm) => void
  sigRef: React.Ref<SignaturePadHandle>
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {legend}
      </legend>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Full name</Label>
          <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Employee no.</Label>
          <Input
            value={value.employee_number}
            onChange={(e) => onChange({ ...value, employee_number: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Phone</Label>
          <Input value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
        </div>
      </div>
      <SignaturePad ref={sigRef} label="Signature" />
    </fieldset>
  )
}

export function MarkCollectedDialog({
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
  const [receiver, setReceiver] = useState<PartyForm>(emptyParty)
  const [witness, setWitness] = useState<PartyForm>(emptyParty)
  const receiverSig = useRef<SignaturePadHandle>(null)
  const witnessSig = useRef<SignaturePadHandle>(null)

  const submit = useMutation({
    mutationFn: async () => {
      const rSig = receiverSig.current?.toDataURL()
      const wSig = witnessSig.current?.toDataURL()
      if (!receiver.name.trim() || !witness.name.trim() || !rSig || !wSig) {
        throw new Error('validation')
      }

      const staff = await getCurrentStaffProfile()
      const hasDeliveryPhoto = /delivery photo/i.test(pkg!.notes ?? '')
      const completion_status: 'Delivered' | 'Collected' =
        hasDeliveryPhoto || staff?.role === 'driver' ? 'Delivered' : 'Collected'

      const toParty = (p: PartyForm, sig: string): PodParty => ({
        name: p.name.trim(),
        employee_number: p.employee_number.trim(),
        phone: p.phone.trim(),
        signature_data_url: sig,
      })

      const collected_at = new Date().toISOString()

      // Render the signed POD to a PDF client-side and attach it to the payload
      // so the completion email carries the proof-of-delivery document. This is
      // best-effort: if PDF generation fails, we still mark the package
      // collected — the receiver just gets the email without the attachment.
      let pdf_base64: string | undefined
      let pdf_filename: string | undefined
      try {
        const { generatePodPdfBlob } = await import('@/lib/pod-pdf')
        const podRecord: PodRecord = {
          id: '',
          package_id: pkg!.id,
          pod_reference: null,
          is_locked: false,
          locked_at: null,
          receiver_name: receiver.name.trim(),
          receiver_employee_number: receiver.employee_number.trim(),
          receiver_phone: receiver.phone.trim(),
          receiver_signature: rSig,
          witness_name: witness.name.trim(),
          witness_employee_number: witness.employee_number.trim(),
          witness_phone: witness.phone.trim(),
          witness_signature: wSig,
          completed_at: collected_at,
          completed_by: null,
          staff_name: (staff as { full_name?: string } | null)?.full_name ?? null,
          completion_status,
        }
        const blob = await generatePodPdfBlob(pkg!, podRecord)
        pdf_base64 = await blobToBase64(blob)
        pdf_filename = `POD-${pkg!.reference}${pkg!.po_number ? `-${pkg!.po_number}` : ''}.pdf`
      } catch (e) {
        logger.warn(e, { op: 'orders.markCollected.pdf', reference: pkg!.reference })
      }

      const pod: MarkCollectedPayload = {
        receiver: toParty(receiver, rSig),
        witness: toParty(witness, wSig),
        collected_at,
        completion_status,
        ...(pdf_base64 ? { pdf_base64, pdf_filename } : {}),
      }
      return updatePackage(pkg!.id, { status: PACKAGE_STATUS.COLLECTED, pod })
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`${pkg?.reference} marked as collected.`)
        qc.invalidateQueries({ queryKey: ['orders'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        onOpenChange(false)
        onDone?.()
        setReceiver(emptyParty)
        setWitness(emptyParty)
      } else {
        toast.error(reportError(res.error, 'Could not mark the order as collected.', { op: 'orders.markCollected' }))
      }
    },
    onError: (e) => {
      if ((e as Error).message === 'validation') {
        toast.error('Both parties need a name and a signature.')
      } else {
        toast.error(reportError(e, 'Something went wrong while marking the order as collected.', { op: 'orders.markCollected' }))
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-success" /> Proof of delivery
          </DialogTitle>
          <DialogDescription>
            {pkg && (
              <span className="inline-flex items-center gap-2">
                Capture collection for <TrackingNumber value={pkg.reference} />.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <PartyFields legend="Receiver" value={receiver} onChange={setReceiver} sigRef={receiverSig} />
          <PartyFields legend="Witness" value={witness} onChange={setWitness} sigRef={witnessSig} />
          <p className="text-xs text-muted-foreground">
            On confirmation, the receiver is emailed a completion notice with the signed POD document
            attached as a PDF.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending && <Loader2 className="animate-spin" />}
            Confirm collection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

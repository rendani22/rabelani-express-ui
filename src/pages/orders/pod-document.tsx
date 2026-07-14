import { useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import podLogo from '@/assets/rabelani-mm-logo.png'
import type { Package, PodRecord } from '@/lib/models/package'
import { PACKAGE_STATUS } from '@/lib/status'
import { statusMeta } from '@/lib/status'
import { formatDateTime, parseNotes } from '@/lib/format'
import { logger } from '@/lib/logger'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

function completionStatus(pkg: Package, pod: PodRecord): string {
  if (/delivery photo/i.test(pkg.notes ?? '')) return 'Delivered'
  if (pod.completion_status) return pod.completion_status
  return pkg.status === PACKAGE_STATUS.RETURNED ? 'Canceled' : statusMeta(pkg.status).label
}

function poReferenceDisplay(pkg: Package, pod: PodRecord): string {
  const po = pkg.po_number
  const ref = pkg.reference
  if (po && ref) return `${po} · ${ref}`
  if (po) return `Purchase Order ${po}`
  if (ref) return `Reference ${ref}`
  return pod.pod_reference ?? '—'
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-gray-100 pb-1">
      <dt className="text-gray-500">{label}</dt>
      <dd className={mono ? 'font-mono font-semibold' : 'font-semibold'}>{value}</dd>
    </div>
  )
}

function Party({
  role,
  name,
  employee,
  phone,
  signature,
}: {
  role: string
  name: string | null
  employee: string | null
  phone: string | null
  signature: string | null
}) {
  return (
    <div className="rounded-md border border-gray-300 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{role}</h3>
      <dl className="mb-4 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Name</dt>
          <dd className="text-right font-medium">{name || '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Employee #</dt>
          <dd className="text-right font-mono">{employee || '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Phone</dt>
          <dd className="text-right font-mono">{phone || '—'}</dd>
        </div>
      </dl>
      <div className="border-t border-gray-200 pt-3">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">Signature</p>
        <div className="flex h-24 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50">
          {signature ? (
            <img src={signature} alt={`${role} signature`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs italic text-gray-400">No signature on file</span>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Full proof-of-delivery document — always light (print-friendly), matching the
 * original downloadable POD. Wrap in a print scope to save as PDF.
 */
export function PodDocument({ pkg, pod }: { pkg: Package; pod: PodRecord }) {
  const { photoUrls, text: notesText } = parseNotes(pkg.notes)
  const total = (pkg.items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0)

  return (
    <article className="pod-print bg-white p-8 text-gray-900 sm:p-10">
      {/* header */}
      <header className="mb-6 flex items-start justify-between border-b-2 border-gray-900 pb-5">
        <div>
          {/* Bundled, not hot-linked: html2canvas rasterises the DOM, so a same-origin
              asset keeps the canvas untainted and the PDF renderable offline. */}
          <img src={podLogo} alt="Rabelani MM Trading Enterprise" className="mb-3 h-12 w-auto" />
          <h1 className="text-3xl font-bold tracking-tight">PROOF OF DELIVERY</h1>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-gray-500">Purchase Order · Reference</p>
          <p className="font-mono text-sm font-semibold">{poReferenceDisplay(pkg, pod)}</p>
          {pod.is_locked && (
            <span className="mt-2 inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Locked
            </span>
          )}
        </div>
      </header>

      {/* order details */}
      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Order Details</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Row label="Reference" value={pkg.reference} mono />
          <Row label="Purchase Order #" value={pkg.po_number || '—'} mono />
          <Row label="Status" value={completionStatus(pkg, pod)} />
          <Row label="Created" value={formatDateTime(pkg.created_at)} />
          <Row label="Completed" value={formatDateTime(pod.completed_at)} />
          {pod.staff_name && (
            <Row
              label={completionStatus(pkg, pod) === 'Delivered' ? 'Delivered By' : 'Assisted By'}
              value={pod.staff_name}
            />
          )}
          <div className="col-span-2 flex justify-between border-b border-gray-100 pb-1">
            <dt className="text-gray-500">Receiver Email</dt>
            <dd>{pkg.receiver_email}</dd>
          </div>
          {(notesText || photoUrls.length > 0) && (
            <div className="col-span-2 pt-2">
              <dt className="mb-1 text-gray-500">Notes</dt>
              {notesText && <dd className="whitespace-pre-wrap text-sm text-gray-800">{notesText}</dd>}
              {photoUrls.length > 0 && (
                <dd className="mt-2">
                  <div className="mb-1 text-xs text-gray-500">
                    Delivery Photo{photoUrls.length > 1 ? 's' : ''}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {photoUrls.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt="Delivery"
                        className="max-h-[200px] max-w-[200px] rounded border border-gray-300 object-cover"
                      />
                    ))}
                  </div>
                </dd>
              )}
            </div>
          )}
        </dl>
      </section>

      {/* items */}
      {pkg.items && pkg.items.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Items ({pkg.items.length})
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="border border-gray-300 px-3 py-2 font-semibold">Description</th>
                <th className="w-24 border border-gray-300 px-3 py-2 text-right font-semibold">Qty</th>
              </tr>
            </thead>
            <tbody>
              {pkg.items.map((item) => (
                <tr key={item.id}>
                  <td className="border border-gray-300 px-3 py-2">{item.description}</td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-mono">{item.quantity}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="border border-gray-300 px-3 py-2 text-right">Total</td>
                <td className="border border-gray-300 px-3 py-2 text-right font-mono">{total}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {/* parties */}
      <section className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Party
          role="Receiver"
          name={pod.receiver_name}
          employee={pod.receiver_employee_number}
          phone={pod.receiver_phone}
          signature={pod.receiver_signature}
        />
        <Party
          role="Witness"
          name={pod.witness_name}
          employee={pod.witness_employee_number}
          phone={pod.witness_phone}
          signature={pod.witness_signature}
        />
      </section>

      {/* footer */}
      <footer className="mt-10 border-t border-gray-300 pt-4 text-xs text-gray-500">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>
            Generated {formatDateTime(pod.completed_at)}
            {pod.locked_at ? ` · Locked ${formatDateTime(pod.locked_at)}` : ''}
          </p>
          <p className="font-mono">{poReferenceDisplay(pkg, pod)}</p>
        </div>
        <p className="mt-2 italic">
          This document confirms receipt of the goods listed above by the named receiver in the
          presence of the named witness. Signatures are stored as captured at the time of collection.
        </p>
      </footer>
    </article>
  )
}

/** View + download the full POD document as a real PDF file. */
export function PodDocumentDialog({
  pkg,
  pod,
  open,
  onOpenChange,
}: {
  pkg: Package
  pod: PodRecord | null | undefined
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const docRef = useRef<HTMLDivElement>(null)
  const [generating, setGenerating] = useState(false)

  async function download() {
    if (!docRef.current || !pod) return
    setGenerating(true)
    try {
      const { nodeToPdfBlob } = await import('@/lib/pod-pdf')
      const blob = await nodeToPdfBlob(docRef.current)
      const filename = `POD-${pkg.reference}${pkg.po_number ? `-${pkg.po_number}` : ''}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      logger.error(e, { op: 'pod.generatePdf', reference: pkg.reference })
      toast.error('Could not generate the POD PDF. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b p-4">
          <DialogTitle>Proof of delivery</DialogTitle>
          <Button size="sm" onClick={download} disabled={!pod || generating} className="mr-8">
            {generating ? <Loader2 className="animate-spin" /> : <Download />} Download PDF
          </Button>
        </DialogHeader>
        {pod ? (
          <div ref={docRef}>
            <PodDocument pkg={pkg} pod={pod} />
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No proof-of-delivery record found for this order.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

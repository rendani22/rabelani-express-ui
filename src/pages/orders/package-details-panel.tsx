import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarClock, Check, ChevronDown, Copy, FileText, ImageIcon, Loader2, Lock, Pencil, QrCode, Trash2, X } from 'lucide-react'
import type { Package, PackageStatus } from '@/lib/models/package'
import { isPackageEditable } from '@/lib/models/package'
import { PACKAGE_STATUS } from '@/lib/status'
import { displayStatusMeta, statusMeta } from '@/lib/status'
import {
  deletePackageWithInventoryReturn,
  getPackageAuditLog,
  getPackageLockStatus,
  getPodForPackage,
  receiveAtCollection,
  updatePackage,
} from '@/lib/api/packages'
import { getStaffNamesByIds } from '@/lib/api/staff'
import { usePermissions } from '@/hooks/use-permissions'
import { reportError } from '@/lib/logger'
import { auditStatusChange, formatAuditAction } from '@/lib/audit-log'
import { cn } from '@/lib/utils'
import { packageRouteStops } from '@/lib/package-timeline'
import { formatDateTime, nameFromEmail, parseNotes } from '@/lib/format'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Combobox } from '@/components/ui/combobox'
import { RouteTimeline, StatusStamp, TrackingNumber } from '@/components/dispatch'
import { PermissionButton } from '@/components/dispatch/permission-button'
import { ReceiverAvatar } from '@/components/dispatch/receiver-avatar'
import { AssignDriverDialog } from './assign-driver-dialog'
import { MarkCollectedDialog } from './mark-collected-dialog'
import { PodDocumentDialog } from './pod-document'
import { PackageItemsEditor } from './package-items-editor'

/**
 * Manual status changes are deliberately limited: an operator may only move a
 * package to Draft or Notified (to correct/re-notify), and to In Transit — and
 * only from Notified (which routes through driver assignment). Forward progress
 * otherwise happens via the primary action button.
 */
function allowedStatusTargets(current: PackageStatus): PackageStatus[] {
  // Terminal states can't be changed.
  if (
    current === PACKAGE_STATUS.COLLECTED ||
    current === PACKAGE_STATUS.DELIVERED ||
    current === PACKAGE_STATUS.RETURNED
  ) {
    return []
  }
  const targets: PackageStatus[] = []
  if (current !== PACKAGE_STATUS.DRAFT) targets.push(PACKAGE_STATUS.DRAFT)
  if (current !== PACKAGE_STATUS.NOTIFIED) targets.push(PACKAGE_STATUS.NOTIFIED)
  if (current === PACKAGE_STATUS.NOTIFIED) targets.push(PACKAGE_STATUS.IN_TRANSIT)
  return targets
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function SignatureBlock({
  role,
  name,
  signature,
}: {
  role: string
  name: string | null
  signature: string | null
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">{role}</span>
      <span className="text-sm text-muted-foreground">{name || '—'}</span>
      {signature && (
        <img
          src={signature}
          alt={`${role} signature`}
          className="h-16 w-full rounded-md border bg-white object-contain"
        />
      )}
    </div>
  )
}

export function PackageDetailsPanel({
  pkg,
  receiverName,
  open,
  onOpenChange,
}: {
  pkg: Package | null
  receiverName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [qrOpen, setQrOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [collectOpen, setCollectOpen] = useState(false)
  const [podOpen, setPodOpen] = useState(false)
  const [editingItems, setEditingItems] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)

  // local mirror so in-panel edits reflect immediately
  const [status, setStatus] = useState<PackageStatus | undefined>(pkg?.status)
  const [notes, setNotes] = useState(pkg?.notes ?? '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [customerNotes, setCustomerNotes] = useState(pkg?.customer_notes ?? '')
  const [editingCustomerNotes, setEditingCustomerNotes] = useState(false)
  const [customerNotesDraft, setCustomerNotesDraft] = useState('')

  useEffect(() => {
    setStatus(pkg?.status)
    setNotes(pkg?.notes ?? '')
    setEditingNotes(false)
    setCustomerNotes(pkg?.customer_notes ?? '')
    setEditingCustomerNotes(false)
    setEditingItems(false)
    setAuditOpen(false)
  }, [pkg?.id, pkg?.status, pkg?.notes, pkg?.customer_notes])

  const { can } = usePermissions()
  const canDelete = can('orders.delete')
  const canUpdate = can('orders.update')
  const lock = useQuery({
    queryKey: ['pod-lock', pkg?.id],
    queryFn: () => getPackageLockStatus(pkg!.id),
    enabled: !!pkg && open,
  })
  const isDone = status === PACKAGE_STATUS.COLLECTED || status === PACKAGE_STATUS.DELIVERED
  const pod = useQuery({
    queryKey: ['pod-record', pkg?.id],
    queryFn: () => getPodForPackage(pkg!.id),
    enabled: !!pkg && open && isDone,
  })

  // Audit log, lazily loaded when the section is first expanded.
  const canViewAudit = can('orders.audit.view')
  const audit = useQuery({
    queryKey: ['package-audit', pkg?.id],
    queryFn: () => getPackageAuditLog(pkg!.id),
    enabled: !!pkg && open && auditOpen && canViewAudit,
  })
  const actorIds = useMemo(
    () => [...new Set((audit.data ?? []).map((e) => e.performed_by).filter((v): v is string => !!v))],
    [audit.data],
  )
  const actors = useQuery({
    queryKey: ['staff-names', actorIds],
    queryFn: () => getStaffNamesByIds(actorIds),
    enabled: actorIds.length > 0,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const advance = useMutation({
    mutationFn: async (p: Package) => {
      if (status === PACKAGE_STATUS.DRAFT) return updatePackage(p.id, { status: PACKAGE_STATUS.NOTIFIED })
      if (status === PACKAGE_STATUS.IN_TRANSIT) return receiveAtCollection(p.id)
      return { success: false, error: 'unsupported' } as const
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success('Package status updated.')
        setStatus((s) => (s === PACKAGE_STATUS.DRAFT ? PACKAGE_STATUS.NOTIFIED : PACKAGE_STATUS.READY_FOR_COLLECTION))
        invalidate()
      } else {
        toast.error(reportError(res.error, 'Could not update the package status.', { op: 'orders.updateStatus' }))
      }
    },
    onError: (e) => toast.error(reportError(e, 'Something went wrong while updating the status.', { op: 'orders.updateStatus' })),
  })

  const setStatusMut = useMutation({
    mutationFn: (target: PackageStatus) => updatePackage(pkg!.id, { status: target }),
    onSuccess: (res, target) => {
      if (res.success) {
        setStatus(target)
        toast.success(`Status set to ${statusMeta(target).label}.`)
        invalidate()
      } else {
        toast.error(reportError(res.error, 'Could not change the package status.', { op: 'orders.setStatus' }))
      }
    },
    onError: (e) => toast.error(reportError(e, 'Something went wrong while changing the status.', { op: 'orders.setStatus' })),
  })

  const notesMut = useMutation({
    mutationFn: (value: string) => updatePackage(pkg!.id, { notes: value }),
    onSuccess: (res, value) => {
      if (res.success) {
        setNotes(value)
        setEditingNotes(false)
        toast.success('Notes updated.')
        invalidate()
      } else {
        toast.error(reportError(res.error, 'Could not update the notes.', { op: 'orders.updateNotes' }))
      }
    },
    onError: (e) => toast.error(reportError(e, 'Something went wrong while updating the notes.', { op: 'orders.updateNotes' })),
  })

  const customerNotesMut = useMutation({
    mutationFn: (value: string) => updatePackage(pkg!.id, { customer_notes: value }),
    onSuccess: (res, value) => {
      if (res.success) {
        setCustomerNotes(value)
        setEditingCustomerNotes(false)
        toast.success('Customer notes updated.')
        invalidate()
      } else {
        toast.error(reportError(res.error, 'Could not update the customer notes.', { op: 'orders.updateCustomerNotes' }))
      }
    },
    onError: (e) => toast.error(reportError(e, 'Something went wrong while updating the customer notes.', { op: 'orders.updateCustomerNotes' })),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deletePackageWithInventoryReturn(id),
    onSuccess: (res) => {
      if (res.success) {
        toast.success('Order deleted.')
        invalidate()
        onOpenChange(false)
      } else {
        toast.error(reportError(res.error, 'Could not delete the order.', { op: 'orders.delete' }))
      }
    },
  })

  if (!pkg || !status) return null

  const name = receiverName || nameFromEmail(pkg.receiver_email)
  const stops = packageRouteStops({ ...pkg, status })
  const isLocked = lock.data?.isLocked
  const { photoUrls, text: notesText } = parseNotes(notes)
  const statusTargets = allowedStatusTargets(status)

  function changeStatus(target: PackageStatus) {
    if (target === PACKAGE_STATUS.COLLECTED) setCollectOpen(true)
    else if (target === PACKAGE_STATUS.IN_TRANSIT) setAssignOpen(true)
    else setStatusMut.mutate(target)
  }

  // context-aware primary action
  let primary: { label: string; run: () => void } | null = null
  switch (status) {
    case PACKAGE_STATUS.DRAFT:
      primary = { label: 'Notify receiver', run: () => advance.mutate(pkg) }
      break
    case PACKAGE_STATUS.PENDING:
    case PACKAGE_STATUS.NOTIFIED:
      primary = { label: 'Assign driver & dispatch', run: () => setAssignOpen(true) }
      break
    case PACKAGE_STATUS.IN_TRANSIT:
      primary = { label: 'Receive at collection point', run: () => advance.mutate(pkg) }
      break
    case PACKAGE_STATUS.READY_FOR_COLLECTION:
      primary = { label: 'Mark collected (proof of delivery)', run: () => setCollectOpen(true) }
      break
  }

  const qrData = JSON.stringify({
    reference: pkg.reference,
    id: pkg.id,
    status,
    receiver: pkg.receiver_email,
  })

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md" showCloseButton={false}>
          <SheetHeader className="border-b p-5">
            <div className="flex items-center gap-3">
              <TrackingNumber value={pkg.reference} copyable className="text-base" />
              <div className="ml-auto flex items-center gap-2">
                <StatusStamp status={status} label={displayStatusMeta({ status, notes }).label} />
                <SheetClose className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <X className="size-4" />
                  <span className="sr-only">Close</span>
                </SheetClose>
              </div>
            </div>
            {pkg.reschedule_requested && (
              <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-[3px] border border-warning/45 bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-warning-foreground dark:text-warning">
                <CalendarClock className="size-3" /> Reschedule requested — see notes
              </span>
            )}
            <SheetTitle className="sr-only">Package {pkg.reference}</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-6 p-5">
            {/* primary action */}
            {primary && (
              <PermissionButton permission="orders.update" onClick={primary.run} disabled={advance.isPending} className="w-full" size="lg">
                {advance.isPending && <Loader2 className="animate-spin" />}
                {primary.label}
              </PermissionButton>
            )}

            {/* manual status change (hidden once the POD is finalized) */}
            {!isLocked && statusTargets.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionLabel>Change status</SectionLabel>
                <Combobox
                  options={statusTargets.map((s) => ({ value: s, label: statusMeta(s).label }))}
                  value=""
                  onChange={(v) => changeStatus(v as PackageStatus)}
                  disabled={setStatusMut.isPending || !canUpdate}
                  placeholder={setStatusMut.isPending ? 'Updating…' : 'Set a different status…'}
                  searchPlaceholder="Search status…"
                />
              </div>
            )}

            {/* receiver */}
            <div className="flex items-center gap-3">
              <ReceiverAvatar name={name} className="size-10" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{pkg.receiver_email}</span>
              </div>
            </div>

            <Separator />

            {/* fields */}
            <div className="grid grid-cols-2 gap-5">
              <Field label="PO Number">
                {pkg.po_number ? <span className="mono text-[0.8125rem]">{pkg.po_number}</span> : <span className="text-muted-foreground">—</span>}
              </Field>
              <Field label="Created">{formatDateTime(pkg.created_at)}</Field>
              <Field label="Last updated">{formatDateTime(pkg.updated_at ?? pkg.created_at)}</Field>
              <Field label="Items">{pkg.items?.length ?? 0}</Field>
            </div>

            {/* internal notes (editable) — staff only, never shown to customers */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <SectionLabel>Internal notes</SectionLabel>
                {!editingNotes && isPackageEditable({ status }) && canUpdate && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => { setNotesDraft(notes); setEditingNotes(true) }}
                  >
                    <Pencil className="size-3" /> Edit
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div className="flex flex-col gap-2">
                  <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3} />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)} disabled={notesMut.isPending}>
                      <X /> Cancel
                    </Button>
                    <Button size="sm" onClick={() => notesMut.mutate(notesDraft)} disabled={notesMut.isPending}>
                      {notesMut.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save
                    </Button>
                  </div>
                </div>
              ) : notesText ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{notesText}</p>
              ) : (
                <p className="text-sm text-muted-foreground/60">No notes.</p>
              )}
            </div>

            {/* customer notes (editable) — surfaced to the customer in emails and the portal */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <SectionLabel>Customer notes</SectionLabel>
                {!editingCustomerNotes && isPackageEditable({ status }) && canUpdate && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => { setCustomerNotesDraft(customerNotes); setEditingCustomerNotes(true) }}
                  >
                    <Pencil className="size-3" /> Edit
                  </button>
                )}
              </div>
              {editingCustomerNotes ? (
                <div className="flex flex-col gap-2">
                  <Textarea value={customerNotesDraft} onChange={(e) => setCustomerNotesDraft(e.target.value)} rows={3} placeholder="Visible to the customer…" />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingCustomerNotes(false)} disabled={customerNotesMut.isPending}>
                      <X /> Cancel
                    </Button>
                    <Button size="sm" onClick={() => customerNotesMut.mutate(customerNotesDraft)} disabled={customerNotesMut.isPending}>
                      {customerNotesMut.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save
                    </Button>
                  </div>
                </div>
              ) : customerNotes ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{customerNotes}</p>
              ) : (
                <p className="text-sm text-muted-foreground/60">No customer notes.</p>
              )}
            </div>

            {/* delivery photos */}
            {photoUrls.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionLabel>
                  Delivery photo{photoUrls.length > 1 ? 's' : ''}
                </SectionLabel>
                <div className="grid grid-cols-3 gap-2">
                  {photoUrls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                      title="Open delivery photo"
                    >
                      <img src={url} alt="Delivery" className="size-full object-cover transition-transform group-hover:scale-105" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* POD record */}
            {(pod.data || isLocked) && (
              <div className="flex flex-col gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-success">
                  <Lock className="size-4" /> Proof of delivery
                  {pod.data?.completion_status && (
                    <span className="ml-auto rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold">
                      {pod.data.completion_status}
                    </span>
                  )}
                </div>
                {(pod.data?.pod_reference || lock.data?.podReference) && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Reference</span>
                    <span className="mono">{pod.data?.pod_reference || lock.data?.podReference}</span>
                  </div>
                )}
                {(pod.data?.completed_at || lock.data?.lockedAt) && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Signed</span>
                    <span>{formatDateTime(pod.data?.completed_at || lock.data?.lockedAt)}</span>
                  </div>
                )}
                {pod.data && (
                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <SignatureBlock role="Receiver" name={pod.data.receiver_name} signature={pod.data.receiver_signature} />
                    <SignatureBlock role="Witness" name={pod.data.witness_name} signature={pod.data.witness_signature} />
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {pod.data && (
                    <PermissionButton permission="pod.view" variant="outline" size="sm" onClick={() => setPodOpen(true)}>
                      <FileText /> View / print POD
                    </PermissionButton>
                  )}
                  {lock.data?.pdfUrl && can('pod.view') && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={lock.data.pdfUrl} target="_blank" rel="noreferrer">
                        <ImageIcon /> Stored PDF
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )}

            <Separator />

            {/* items */}
            {((pkg.items && pkg.items.length > 0) || isPackageEditable({ status })) && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <SectionLabel>Items ({pkg.items?.length ?? 0})</SectionLabel>
                  {isPackageEditable({ status }) && !editingItems && canUpdate && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => setEditingItems(true)}
                    >
                      <Pencil className="size-3" /> Edit
                    </button>
                  )}
                </div>
                {editingItems ? (
                  <PackageItemsEditor
                    pkg={pkg}
                    onCancel={() => setEditingItems(false)}
                    onSaved={() => {
                      setEditingItems(false)
                      onOpenChange(false)
                    }}
                  />
                ) : pkg.items && pkg.items.length > 0 ? (
                  <ul className="flex flex-col divide-y rounded-md border">
                    {pkg.items.map((it) => (
                      <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <span className="truncate">{it.description}</span>
                        <span className="tabular shrink-0 text-muted-foreground">×{it.quantity}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground/60">No items.</p>
                )}
              </div>
            )}

            {/* chain of custody */}
            <div className="flex flex-col gap-3">
              <SectionLabel>Chain of custody</SectionLabel>
              <RouteTimeline stops={stops} />
            </div>

            {/* audit log */}
            {canViewAudit && (
              <>
                <Separator />
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setAuditOpen((v) => !v)}
                    aria-expanded={auditOpen}
                    className="flex items-center justify-between text-left"
                  >
                    <span className="inline-flex items-center gap-2">
                      <SectionLabel>Audit log</SectionLabel>
                      <span className="rounded-full border border-warning/45 bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning-foreground dark:text-warning">
                        Admin
                      </span>
                    </span>
                    <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', auditOpen && 'rotate-180')} />
                  </button>

                  {auditOpen &&
                    (audit.isLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : audit.data && audit.data.length > 0 ? (
                      <ol className="relative ml-1.5 flex flex-col gap-4 border-l pl-4">
                        {audit.data.map((entry) => {
                          const change = auditStatusChange(entry)
                          const actor = entry.performed_by ? actors.data?.[entry.performed_by] : null
                          return (
                            <li key={entry.id} className="relative">
                              <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-background bg-muted-foreground/50" />
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="text-sm font-medium">{formatAuditAction(entry.action)}</p>
                                <time className="shrink-0 text-[11px] text-muted-foreground">{formatDateTime(entry.created_at)}</time>
                              </div>
                              {change && <p className="text-xs text-muted-foreground">{change}</p>}
                              <p className="text-xs text-muted-foreground">
                                {entry.performed_by ? actor ?? '…' : <span className="italic">System</span>}
                              </p>
                            </li>
                          )
                        })}
                      </ol>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">No audit entries.</p>
                    ))}
                </div>
              </>
            )}

            <Separator />

            {/* utility actions */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
                <QrCode /> QR label
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(pkg.reference)}>
                <Copy /> Copy ref
              </Button>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={remove.isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Delete order?',
                      description: `Order ${pkg.reference} will be removed and its stock returned to inventory. You can restore it from Deleted orders.`,
                      confirmText: 'Delete order',
                      destructive: true,
                    })
                    if (ok) remove.mutate(pkg.id)
                  }}
                >
                  {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* QR dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Package QR label</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="rounded-lg bg-white p-4">
              <QRCodeSVG value={qrData} size={200} />
            </div>
            <TrackingNumber value={pkg.reference} />
            <p className="text-center text-xs text-muted-foreground">Scan to view package details</p>
          </div>
        </DialogContent>
      </Dialog>

      <AssignDriverDialog pkg={pkg} open={assignOpen} onOpenChange={setAssignOpen} onDone={() => onOpenChange(false)} />
      <MarkCollectedDialog pkg={pkg} open={collectOpen} onOpenChange={setCollectOpen} onDone={() => onOpenChange(false)} />
      <PodDocumentDialog pkg={pkg} pod={pod.data} open={podOpen} onOpenChange={setPodOpen} />
    </>
  )
}

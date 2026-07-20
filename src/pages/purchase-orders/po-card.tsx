import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowRight,
  Box,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Coins,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  Package as PackageIcon,
  Pencil,
  ShoppingCart,
  User,
} from 'lucide-react'
import type { PurchaseOrder } from '@/lib/api/purchase-orders'
import { computeInventoryProgress } from '@/lib/api/purchase-orders'
import { downloadPodsZip } from '@/lib/api/pod-export'
import { reportError } from '@/lib/logger'
import { formatZar } from '@/lib/inventory-movements'
import { formatDateShort } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { PermissionButton } from '@/components/dispatch/permission-button'
import { StatusStamp, TrackingNumber } from '@/components/dispatch'
import { cn } from '@/lib/utils'
import {
  deliveredValue,
  deliveredValueBarClass,
  deliveredValueLabel,
  deliveredValuePercent,
  deliveredValueTextClass,
  deliveredValueTone,
  formatPoDate,
  podEligiblePackages,
  poStatusMeta,
  showCompletion,
} from './po-display'

function SummaryTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof User
  label: string
  value: string
  sub?: string
  tone?: 'success'
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border bg-muted/30 p-3', tone === 'success' && 'border-success/30 bg-success/8')}>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground', tone === 'success' && 'bg-success/12 text-success')}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn('truncate text-sm font-semibold', tone === 'success' && 'tabular text-success')}>{value}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

export function PoCard({ po, onEdit }: { po: PurchaseOrder; onEdit: (poNumber: string) => void }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const status = poStatusMeta(po.derivedStatus)
  const progress = computeInventoryProgress(po.inventoryRefs)
  const dTone = deliveredValueTone(po)
  const podCount = podEligiblePackages(po).length
  const completionBar =
    po.completionPercentage === 100 ? 'bg-success' : po.completionPercentage > 0 ? 'bg-primary' : 'bg-muted-foreground/40'

  const goToOrders = (search: string) => navigate(`/orders?search=${encodeURIComponent(search)}`)
  const openOrder = (id: string) => navigate(`/orders?id=${id}`)
  const openItem = (ref: PurchaseOrder['inventoryRefs'][number]) =>
    navigate(`/inventory?id=${encodeURIComponent(ref.inventoryItemId)}`)

  const downloadPods = async () => {
    const pkgs = podEligiblePackages(po)
    if (pkgs.length === 0 || downloading) return
    setDownloading(true)
    try {
      const res = await downloadPodsZip([...pkgs], `pods-${po.poNumber}.zip`)
      if (res.zipped === 0) {
        toast.error('No proof-of-delivery records were found for these orders.')
      } else {
        toast.success(
          `Downloaded ${res.zipped} POD${res.zipped === 1 ? '' : 's'} for ${po.poNumber}` +
            (res.skipped > 0 ? ` (${res.skipped} without a POD record skipped).` : '.'),
        )
      }
    } catch (e) {
      toast.error(reportError(e, 'Could not download the PODs.', { op: 'pod.bulkDownload' }))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-sm">
      {/* header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="size-[18px]" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">{po.poNumber}</span>
            <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', status.tone)}>
              {status.label}
            </span>
            {po.source === 'order' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/45 bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning-foreground dark:text-warning">
                <ShoppingCart className="size-2.5" /> From order
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {po.receiverName && (
              <span className="flex items-center gap-1">
                <User className="size-3" /> {po.receiverName}
              </span>
            )}
            {po.poValue !== null && (
              <span className="flex items-center gap-1 font-semibold text-success">
                <Coins className="size-3" /> {formatZar(po.poValue)}
              </span>
            )}
            {po.poDate && (
              <span className="flex items-center gap-1">
                <Calendar className="size-3" /> {formatPoDate(po.poDate)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <ShoppingCart className="size-3" /> {po.packages.length} {po.packages.length === 1 ? 'order' : 'orders'}
            </span>
            {po.inventoryRefs.length > 0 && (
              <span className="flex items-center gap-1">
                <Box className="size-3" /> {po.inventoryRefs.length} {po.inventoryRefs.length === 1 ? 'item' : 'items'}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="size-3" /> {formatDateShort(po.createdAt)}
            </span>
          </div>
          {showCompletion(po) && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full transition-[width] duration-300 ease-out', completionBar)} style={{ width: `${po.completionPercentage}%` }} />
              </div>
              <span className="tabular shrink-0 text-xs text-muted-foreground">
                {po.completionPercentage}% {po.source === 'purchase_order' ? 'allocated' : 'complete'}
              </span>
            </div>
          )}
        </div>

        <div className="hidden max-w-xs flex-wrap justify-end gap-1 sm:flex">
          {po.packages.slice(0, 6).map((pkg) => (
            <StatusStamp key={pkg.id} status={pkg.status} />
          ))}
          {po.packages.length > 6 && (
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              +{po.packages.length - 6}
            </span>
          )}
        </div>

        <ChevronDown className={cn('size-[18px] shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </button>

      {/* expanded */}
      {expanded && (
        <div className="border-t px-5 pb-5 pt-4">
          {po.source === 'purchase_order' && (
            <div className="mb-6 flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryTile icon={User} label="Customer" value={po.receiverName ?? '—'} sub={po.receiverEmail ?? undefined} />
                <SummaryTile icon={Coins} label="PO value" value={formatZar(po.poValue)} tone="success" />
                <SummaryTile icon={Calendar} label="PO date" value={formatPoDate(po.poDate)} />
              </div>

              {po.poValue !== null && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <Coins className="size-3" /> Value delivered
                    </span>
                    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', deliveredValueTextClass(dTone))}>
                      {dTone === 'full' ? <Check className="size-3" /> : <Clock className="size-3" />}
                      {deliveredValueLabel(po)}
                    </span>
                  </div>
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className={cn('tabular text-base font-bold', deliveredValueTextClass(dTone))}>{formatZar(deliveredValue(po))}</span>
                    <span className="text-xs text-muted-foreground">of {formatZar(po.poValue)}</span>
                    <span className={cn('tabular ml-auto text-xs font-semibold', deliveredValueTextClass(dTone))}>{deliveredValuePercent(po)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full transition-[width] duration-300 ease-out', deliveredValueBarClass(dTone))} style={{ width: `${deliveredValuePercent(po)}%` }} />
                  </div>
                </div>
              )}

              {po.details && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">Details</p>
                  <p className="whitespace-pre-line text-sm">{po.details}</p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* linked orders */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <ShoppingCart className="size-3.5 text-muted-foreground" /> Linked orders
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{po.packages.length}</span>
                </h4>
                {po.packages.length > 0 && (
                  <button className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => goToOrders(po.poNumber)}>
                    View all <ArrowRight className="size-3" />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {po.packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => openOrder(pkg.id)}
                    title={`Open order ${pkg.reference}`}
                    className="group flex w-full items-center gap-3 rounded-lg border bg-muted/30 p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                      <PackageIcon className="size-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <TrackingNumber value={pkg.reference} />
                        <StatusStamp status={pkg.status} />
                      </div>
                      <span className="truncate text-xs text-muted-foreground">{pkg.receiver_email}</span>
                    </div>
                    <ExternalLink className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>

            {/* linked inventory */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Box className="size-3.5 text-muted-foreground" /> Linked inventory
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{po.inventoryRefs.length}</span>
                </h4>
                {po.inventoryRefs.length > 0 && (
                  <button className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => navigate('/inventory')}>
                    Inventory <ArrowRight className="size-3" />
                  </button>
                )}
              </div>
              {po.inventoryRefs.length === 0 ? (
                <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-8 text-center">
                  <Box className="size-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">No inventory linked to this PO</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {po.inventoryRefs.map((ref) => (
                    <button
                      key={ref.inventoryItemId}
                      type="button"
                      onClick={() => openItem(ref)}
                      title={ref.item ? `Open ${ref.item.name} in Inventory` : 'Open in Inventory'}
                      className="group flex w-full items-center gap-3 rounded-lg border bg-muted/30 p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                        <Box className="size-3" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{ref.item?.name ?? 'Unknown item'}</span>
                          {ref.item?.sku && <span className="mono text-xs text-muted-foreground">{ref.item.sku}</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>Ordered <strong className="tabular text-foreground">{ref.orderedQuantity}</strong></span>
                          <span>·</span>
                          <span>Allocated <strong className="tabular text-foreground">{ref.allocatedQuantity}</strong></span>
                          <span>·</span>
                          <span>Remaining <strong className="tabular text-foreground">{ref.remainingQuantity}</strong></span>
                        </div>
                      </div>
                      <ExternalLink className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* footer */}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
            <span>PO <strong className="text-foreground">{po.poNumber}</strong></span>
            <span>·</span>
            <span>Created <strong className="text-foreground">{formatDateShort(po.createdAt)}</strong></span>
            <span>·</span>
            <span>Updated <strong className="text-foreground">{formatDateShort(po.updatedAt)}</strong></span>
            <span>·</span>
            <span>{po.totalItems} item{po.totalItems === 1 ? '' : 's'} total</span>

            {showCompletion(po) && (
              <>
                <span>·</span>
                {po.source === 'purchase_order' ? (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded bg-chart-2/12 px-1.5 py-0.5 text-chart-2">
                      <Check className="size-2.5" /> {progress.allocatedQuantity} allocated
                    </span>
                    {progress.remainingQuantity > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-warning-foreground dark:text-warning">
                        <Clock className="size-2.5" /> {progress.remainingQuantity} remaining
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {po.orderBreakdown.terminal > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-success/12 px-1.5 py-0.5 text-success">
                        <Check className="size-2.5" /> {po.orderBreakdown.terminal} completed
                      </span>
                    )}
                    {po.orderBreakdown.active > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-chart-2/12 px-1.5 py-0.5 text-chart-2">
                        <Clock className="size-2.5" /> {po.orderBreakdown.active} active
                      </span>
                    )}
                    {po.orderBreakdown.draft > 0 && (
                      <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5">{po.orderBreakdown.draft} draft</span>
                    )}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn('block h-full rounded-full', po.completionPercentage === 100 ? 'bg-success' : 'bg-primary')}
                      style={{ width: `${po.completionPercentage}%` }}
                    />
                  </span>
                  <strong className="tabular text-foreground">{po.completionPercentage}%</strong>
                </span>
              </>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {po.documentUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={po.documentUrl} target="_blank" rel="noopener noreferrer">
                    <FileText /> Document
                  </a>
                </Button>
              )}
              {po.packages.length > 0 && (
                <PermissionButton
                  permission="pod.export_bulk"
                  variant="outline"
                  size="sm"
                  onClick={downloadPods}
                  disabled={podCount === 0 || downloading}
                  title={podCount > 0 ? 'Download all completed-order PODs as a ZIP' : 'Available once an order in this PO is completed'}
                >
                  {downloading ? <Loader2 className="animate-spin" /> : <FileDown />}
                  PODs{podCount > 0 ? ` (${podCount})` : ''}
                </PermissionButton>
              )}
              {po.source === 'purchase_order' && (
                <PermissionButton permission="purchase_orders.update" variant="outline" size="sm" onClick={() => onEdit(po.poNumber)}>
                  <Pencil /> Edit
                </PermissionButton>
              )}
              <Button size="sm" onClick={() => goToOrders(po.poNumber)}>
                <ExternalLink /> Open in Orders
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

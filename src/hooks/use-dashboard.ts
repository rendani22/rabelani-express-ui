import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchOperationsDashboard, fetchSlaBreaches } from '@/lib/api/operations-dashboard'
import { fetchExecutiveDashboard } from '@/lib/api/executive-dashboard'
import { listCompanies } from '@/lib/api/customers'
import { downloadCsv, slugify, toCsv, yyyymmdd } from '@/lib/csv'
import { reportError } from '@/lib/logger'

/** `companyId` scopes every package/revenue metric to that company; null = whole network. */
export function useOperationsDashboard(companyId?: string | null) {
  return useQuery({
    queryKey: ['dashboard', 'operations', companyId ?? 'all'],
    queryFn: () => fetchOperationsDashboard(undefined, companyId),
  })
}

/** CSV column order for the SLA breach export. */
const SLA_COLUMNS = [
  'reference',
  'status',
  'hoursStuck',
  'thresholdHours',
  'hoursOverdue',
  'receiverName',
  'receiverEmail',
  'receiverPhone',
  'createdAt',
  'updatedAt',
] as const

/**
 * Download every breaching order as CSV. The list is fetched on click rather
 * than with the dashboard, so the (unbounded) full set never rides along in the
 * dashboard payload.
 */
export function useDownloadSlaBreaches(companyId?: string | null, companyName?: string | null) {
  return useMutation({
    mutationFn: () => fetchSlaBreaches(companyId),
    onSuccess: (breaches) => {
      if (!breaches.length) {
        toast.info('No SLA breaches to export.')
        return
      }
      const rows = breaches.map((b) => ({
        reference: b.reference,
        status: b.statusLabel,
        hoursStuck: b.hoursStuck,
        thresholdHours: b.thresholdHours,
        hoursOverdue: b.hoursOverdue,
        receiverName: b.receiverName ?? '',
        receiverEmail: b.receiverEmail,
        receiverPhone: b.receiverPhone ?? '',
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      }))
      // Encode the scope in the name so a company export and a network-wide one
      // are never mistaken for each other on disk.
      const scope = companyName ? slugify(companyName) : 'all-companies'
      downloadCsv(`sla-breaches-${scope}-${yyyymmdd()}.csv`, toCsv(rows, SLA_COLUMNS))
      toast.success(`Exported ${breaches.length} SLA ${breaches.length === 1 ? 'breach' : 'breaches'}.`)
    },
    onError: (err) => toast.error(reportError(err, "Couldn't export the SLA breaches.")),
  })
}

export function useExecutiveDashboard(companyId?: string | null) {
  return useQuery({
    queryKey: ['dashboard', 'executive', companyId ?? 'all'],
    queryFn: () => fetchExecutiveDashboard(undefined, companyId),
  })
}

/** Companies for the dashboard company filter (and anywhere a company picker is needed). */
export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: listCompanies,
    staleTime: 5 * 60_000,
  })
}

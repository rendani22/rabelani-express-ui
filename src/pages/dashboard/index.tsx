import { useMemo, useState } from 'react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Skeleton } from '@/components/ui/skeleton'
import { useCompanies, useOperationsDashboard } from '@/hooks/use-dashboard'
import { usePermissions } from '@/hooks/use-permissions'
import { useAutoTour } from '@/hooks/use-auto-tour'
import { OperationsDashboard } from './operations-dashboard'
import { ExecutiveDashboard } from './executive-dashboard'
import { SignalsDashboard } from './signals-dashboard'

const ALL_COMPANIES = 'all'

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-12">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-lg lg:col-span-8" />
      <Skeleton className="h-72 rounded-lg lg:col-span-4" />
      <Skeleton className="h-72 rounded-lg lg:col-span-8" />
      <Skeleton className="h-72 rounded-lg lg:col-span-4" />
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
      <AlertCircle className="size-6 text-destructive" />
      <p className="text-sm font-medium">Couldn&apos;t load the dashboard</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw /> Retry
      </Button>
    </div>
  )
}

export function DashboardPage() {
  useAutoTour('dashboard')
  const [company, setCompany] = useState<string>(ALL_COMPANIES)
  const companyId = company === ALL_COMPANIES ? null : company
  const companyScoped = companyId !== null

  const companies = useCompanies()
  const ops = useOperationsDashboard(companyId)
  const { can } = usePermissions()
  const canViewExec = can('dashboard.exec.view')
  const canViewSignals = can('dashboard.signals.view')

  // Controlled only so Refresh knows which view to reload; Operations stays the
  // landing tab.
  const [tab, setTab] = useState('operations')

  /*
    Refresh acts on the tab you are looking at. Each view owns its own query, so
    this invalidates by key prefix rather than calling the one refetch it used
    to — which silently reloaded Operations whatever you were reading.
  */
  const queryClient = useQueryClient()
  const refreshing = useIsFetching({ queryKey: ['dashboard', tab] }) > 0
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['dashboard', tab] })

  const companyOptions = useMemo(
    () => [
      { value: ALL_COMPANIES, label: 'All companies' },
      ...(companies.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [companies.data],
  )

  const companyName = useMemo(
    () => (companyId ? ((companies.data ?? []).find((c) => c.id === companyId)?.name ?? null) : null),
    [companies.data, companyId],
  )

  return (
    <PageBody>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description={
          companyScoped
            ? 'Orders and revenue for the selected company. Network-wide resources (drivers, inventory) are hidden.'
            : 'Live operational picture of the dispatch network.'
        }
        tourId="dashboard-title"
        actions={
          <>
            <div className="w-[210px]">
              <Combobox
                options={companyOptions}
                value={company}
                onChange={setCompany}
                placeholder="All companies"
                searchPlaceholder="Filter companies…"
              />
            </div>
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={refreshing ? 'animate-spin' : ''} /> Refresh
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          {/* Revenue. The RPC behind it now rejects callers without the
              permission, so showing the tab would only produce a 42501. */}
          {canViewExec && <TabsTrigger value="executive">Executive</TabsTrigger>}
          {/* Perfect Order Rate and the levers under it. Same treatment as
              Executive: the RPC rejects callers without the permission. */}
          {canViewSignals && <TabsTrigger value="signals">Signals</TabsTrigger>}
        </TabsList>

        <TabsContent value="operations">
          {ops.isLoading ? (
            <DashboardSkeleton />
          ) : ops.isError ? (
            <ErrorState message={(ops.error as Error)?.message ?? 'Unknown error'} onRetry={() => ops.refetch()} />
          ) : ops.data ? (
            <OperationsDashboard
              data={ops.data}
              companyId={companyId}
              companyName={companyName}
              companyScoped={companyScoped}
            />
          ) : null}
        </TabsContent>

        {canViewExec && (
          <TabsContent value="executive">
            <ExecutiveDashboard companyId={companyId} />
          </TabsContent>
        )}

        {canViewSignals && (
          <TabsContent value="signals">
            <SignalsDashboard companyId={companyId} />
          </TabsContent>
        )}
      </Tabs>
    </PageBody>
  )
}

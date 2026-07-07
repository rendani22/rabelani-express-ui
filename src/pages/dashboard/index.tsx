import { AlertCircle, RefreshCw } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useOperationsDashboard } from '@/hooks/use-dashboard'
import { OperationsDashboard } from './operations-dashboard'
import { ExecutiveDashboard } from './executive-dashboard'

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
  const ops = useOperationsDashboard()

  return (
    <PageBody>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Live operational picture of the dispatch network."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => ops.refetch()}
            disabled={ops.isFetching}
          >
            <RefreshCw className={ops.isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />

      <Tabs defaultValue="operations" className="gap-6">
        <TabsList>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="executive">Executive</TabsTrigger>
        </TabsList>

        <TabsContent value="operations">
          {ops.isLoading ? (
            <DashboardSkeleton />
          ) : ops.isError ? (
            <ErrorState message={(ops.error as Error)?.message ?? 'Unknown error'} onRetry={() => ops.refetch()} />
          ) : ops.data ? (
            <OperationsDashboard data={ops.data} />
          ) : null}
        </TabsContent>

        <TabsContent value="executive">
          <ExecutiveDashboard />
        </TabsContent>
      </Tabs>
    </PageBody>
  )
}

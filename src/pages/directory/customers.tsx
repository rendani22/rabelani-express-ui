import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Contact, Mail, MoreVertical, Package as PackageIcon, Pencil, Phone, Power, Search, Users } from 'lucide-react'
import type { ReceiverProfile } from '@/lib/api/receivers'
import { deactivateReceiver, listReceivers, reactivateReceiver } from '@/lib/api/receivers'
import { fetchPackagesByReceiver } from '@/lib/api/orders'
import { reportError } from '@/lib/logger'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusStamp, TrackingNumber } from '@/components/dispatch'
import { ReceiverAvatar } from '@/components/dispatch/receiver-avatar'
import { formatDateShort } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CustomerDialog, ManageContactsDialog } from './customer-dialogs'

function HistoryPanel({ customer, open, onOpenChange }: { customer: ReceiverProfile | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const packages = useQuery({
    queryKey: ['receiver-packages', customer?.email],
    queryFn: () => fetchPackagesByReceiver(customer!.email),
    enabled: !!customer && open,
  })
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5">
          <SheetTitle>Package history</SheetTitle>
          {customer && <p className="text-sm text-muted-foreground">{customer.name} {customer.surname}</p>}
        </SheetHeader>
        <div className="flex flex-col">
          {packages.isLoading ? (
            <div className="p-5"><Skeleton className="h-40 w-full" /></div>
          ) : packages.data && packages.data.length > 0 ? (
            <>
              <ul className="flex flex-col divide-y">
                {packages.data.map((pkg) => (
                  <li key={pkg.id} className="flex items-start justify-between gap-3 px-5 py-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <TrackingNumber value={pkg.reference} />
                      <span className="text-xs text-muted-foreground">{formatDateShort(pkg.created_at)}</span>
                      {pkg.notes && <span className="truncate text-xs italic text-muted-foreground/80">{pkg.notes}</span>}
                    </div>
                    <StatusStamp status={pkg.status} />
                  </li>
                ))}
              </ul>
              <div className="border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
                {packages.data.length} package{packages.data.length !== 1 ? 's' : ''} total
              </div>
            </>
          ) : (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-medium">No packages found</p>
              <p className="mt-1 text-sm text-muted-foreground">This customer has no package history yet.</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function CustomersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ReceiverProfile | null>(null)
  const [contactsFor, setContactsFor] = useState<ReceiverProfile | null>(null)
  const [historyFor, setHistoryFor] = useState<ReceiverProfile | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['receivers'], queryFn: listReceivers })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = data ?? []
    if (!q) return rows
    return rows.filter(
      (r) =>
        `${r.name} ${r.surname}`.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.phone ?? '').toLowerCase().includes(q),
    )
  }, [data, search])

  const toggle = useMutation({
    mutationFn: (r: ReceiverProfile) => (r.is_active ? deactivateReceiver(r.id) : reactivateReceiver(r.id)),
    onSuccess: (_, r) => { toast.success(r.is_active ? 'Customer deactivated.' : 'Customer reactivated.'); qc.invalidateQueries({ queryKey: ['receivers'] }) },
    onError: (e) => toast.error(reportError(e, 'Could not update the customer.', { op: 'customers.toggle' })),
  })

  return (
    <PageBody>
      <PageHeader
        eyebrow="Directory"
        title="Customers"
        description="Receiver profiles, contacts, and package history."
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>
            <Users className="size-4" /> Add customer
          </Button>
        }
      />

      <div className="relative min-w-0 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r) => (
            <div key={r.id} className={cn('flex flex-col gap-3 rounded-lg border bg-card p-4', !r.is_active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <ReceiverAvatar name={`${r.name} ${r.surname}`} className="size-10" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{r.name} {r.surname}</span>
                    {!r.is_active && <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Inactive</span>}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Actions"><MoreVertical /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => { setEditing(r); setDialogOpen(true) }}><Pencil /> Edit</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setContactsFor(r)}><Contact /> Manage contacts</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => toggle.mutate(r)}><Power /> {r.is_active ? 'Deactivate' : 'Reactivate'}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground"><Mail className="size-3.5" /> <span className="truncate">{r.email}</span></span>
                {r.phone && <span className="flex items-center gap-2 text-muted-foreground"><Phone className="size-3.5" /> {r.phone}</span>}
              </div>
              <Button variant="outline" size="sm" className="mt-1" onClick={() => setHistoryFor(r)}>
                <PackageIcon /> Package history
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Users className="size-5" /></span>
          <p className="text-sm font-medium">{search ? 'No customers match' : 'No customers yet'}</p>
        </div>
      )}

      <CustomerDialog customer={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
      <ManageContactsDialog customer={contactsFor} open={!!contactsFor} onOpenChange={(o) => !o && setContactsFor(null)} />
      <HistoryPanel customer={historyFor} open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)} />
    </PageBody>
  )
}

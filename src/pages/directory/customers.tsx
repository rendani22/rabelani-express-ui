import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building2, Contact, Loader2, Mail, MoreVertical, Package as PackageIcon, Pencil, Phone, Plus, Search, Power, UserPlus, Users } from 'lucide-react'
import type { ReceiverProfile } from '@/lib/api/receivers'
import { deactivateReceiver, listReceivers, reactivateReceiver } from '@/lib/api/receivers'
import { createCompany, inviteCustomer, listCompanies, type CustomerRole } from '@/lib/api/customers'
import { fetchPackagesByReceiver } from '@/lib/api/orders'
import { reportError } from '@/lib/logger'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusStamp, TrackingNumber, SectionLabel } from '@/components/dispatch'
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UNASSIGNED = '__unassigned__'

/** Buyer/Runner role chip on a customer card. */
function RoleBadge({ role }: { role: CustomerRole }) {
  return (
    <Badge variant="secondary" className="capitalize">{role}</Badge>
  )
}

function NewCompanyDialog() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: () => createCompany(name),
    onSuccess: () => { toast.success('Company added.'); qc.invalidateQueries({ queryKey: ['companies'] }); setOpen(false); setName('') },
    onError: (e) => toast.error(reportError(e, 'Could not add the company.', { op: 'companies.create' })),
  })
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setName('') }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Building2 className="size-4" /> New company</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a company</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate() }}>
          <Label htmlFor="company-name">Company name</Label>
          <Input id="company-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <DialogFooter className="mt-2">
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : <Plus className="size-4" />} Add company
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function InviteCustomerDialog() {
  const qc = useQueryClient()
  const companies = useQuery({ queryKey: ['companies'], queryFn: listCompanies })
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [email, setEmail] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [role, setRole] = useState<CustomerRole>('buyer')
  const reset = () => { setName(''); setSurname(''); setEmail(''); setCompanyId(''); setRole('buyer') }

  const invite = useMutation({
    mutationFn: () => inviteCustomer({ email: email.trim(), name: name.trim(), surname: surname.trim(), company_id: companyId, role }),
    onSuccess: () => { toast.success('Invite sent.'); qc.invalidateQueries({ queryKey: ['receivers'] }); setOpen(false); reset() },
    onError: (e) => toast.error(reportError(e, 'Could not send the invite.', { op: 'customers.invite' })),
  })
  const valid = name.trim() && EMAIL_RE.test(email.trim()) && companyId && role

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="size-4" /> Invite customer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite a customer</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2"><Label htmlFor="inv-name">First name</Label><Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="inv-surname">Surname</Label><Input id="inv-surname" value={surname} onChange={(e) => setSurname(e.target.value)} /></div>
          </div>
          <div className="flex flex-col gap-2"><Label htmlFor="inv-email">Email</Label><Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" /></div>
          <div className="flex flex-col gap-2">
            <Label>Company</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder={companies.isLoading ? 'Loading…' : 'Select a company'} /></SelectTrigger>
              <SelectContent>{(companies.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as CustomerRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="buyer">Buyer — sees all packages for the company</SelectItem>
                <SelectItem value="runner">Runner — sees only packages assigned to them</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => invite.mutate()} disabled={!valid || invite.isPending}>
            {invite.isPending ? <Loader2 className="animate-spin" /> : <UserPlus className="size-4" />} Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A single customer card. */
function CustomerCard({ r, onEdit, onContacts, onToggle, onHistory }: {
  r: ReceiverProfile
  onEdit: () => void
  onContacts: () => void
  onToggle: () => void
  onHistory: () => void
}) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-lg border bg-card p-4', !r.is_active && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <ReceiverAvatar name={`${r.name} ${r.surname}`} className="size-10" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-semibold">{r.name} {r.surname}</span>
            <div className="flex items-center gap-1.5">
              {r.role && <RoleBadge role={r.role} />}
              {!r.is_active && <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Inactive</span>}
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Actions"><MoreVertical /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuItem onSelect={onContacts}><Contact /> Manage contacts</DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggle}><Power /> {r.is_active ? 'Deactivate' : 'Reactivate'}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground"><Mail className="size-3.5" /> <span className="truncate">{r.email}</span></span>
        {r.phone && <span className="flex items-center gap-2 text-muted-foreground"><Phone className="size-3.5" /> {r.phone}</span>}
      </div>
      <Button variant="outline" size="sm" className="mt-1" onClick={onHistory}>
        <PackageIcon /> Package history
      </Button>
    </div>
  )
}

export function CustomersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ReceiverProfile | null>(null)
  const [contactsFor, setContactsFor] = useState<ReceiverProfile | null>(null)
  const [historyFor, setHistoryFor] = useState<ReceiverProfile | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['receivers'], queryFn: listReceivers })
  const companies = useQuery({ queryKey: ['companies'], queryFn: listCompanies })

  const companyName = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of companies.data ?? []) m.set(c.id, c.name)
    return m
  }, [companies.data])

  // Search filter first, then group by company.
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

  // Groups keyed by company id (or UNASSIGNED), ordered: companies A–Z, then Unassigned.
  const groups = useMemo(() => {
    const byKey = new Map<string, ReceiverProfile[]>()
    for (const r of filtered) {
      const key = r.company_id ?? UNASSIGNED
      const list = byKey.get(key) ?? []
      list.push(r)
      byKey.set(key, list)
    }
    const companyGroups = [...byKey.entries()]
      .filter(([k]) => k !== UNASSIGNED)
      .map(([id, customers]) => ({ id, name: companyName.get(id) ?? 'Unknown company', customers }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const unassigned = byKey.get(UNASSIGNED)
    return unassigned && unassigned.length
      ? [...companyGroups, { id: UNASSIGNED, name: 'Unassigned', customers: unassigned }]
      : companyGroups
  }, [filtered, companyName])

  const visibleGroups = companyFilter === 'all' ? groups : groups.filter((g) => g.id === companyFilter)

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
        description="Companies, their Buyers and Runners, contacts, and package history."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <NewCompanyDialog />
            <Button variant="outline" size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>
              <Users className="size-4" /> Add customer
            </Button>
            <InviteCustomerDialog />
          </div>
        }
      />

      <div className="relative min-w-0 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Company filter chips */}
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip label="All" count={filtered.length} active={companyFilter === 'all'} onClick={() => setCompanyFilter('all')} />
          {groups.map((g) => (
            <FilterChip key={g.id} label={g.name} count={g.customers.length} active={companyFilter === g.id} onClick={() => setCompanyFilter(g.id)} />
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      ) : visibleGroups.length > 0 ? (
        <div className="flex flex-col gap-8">
          {visibleGroups.map((g) => (
            <section key={g.id} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <SectionLabel>{g.name}</SectionLabel>
                <span className="text-xs tabular-nums text-muted-foreground">{g.customers.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.customers.map((r) => (
                  <CustomerCard
                    key={r.id}
                    r={r}
                    onEdit={() => { setEditing(r); setDialogOpen(true) }}
                    onContacts={() => setContactsFor(r)}
                    onToggle={() => toggle.mutate(r)}
                    onHistory={() => setHistoryFor(r)}
                  />
                ))}
              </div>
            </section>
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

/** Company filter chip — subtle primary tint when active. */
function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'text-primary' : 'text-muted-foreground/70')}>{count}</span>
    </button>
  )
}

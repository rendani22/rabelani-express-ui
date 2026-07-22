import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building2, ChevronRight, Contact, Loader2, Mail, MoreVertical, Package as PackageIcon, Pencil, Phone, Plus, Search, Power, Send, Trash2, User, UserCheck, UserX, Users } from 'lucide-react'
import type { ReceiverProfile } from '@/lib/api/receivers'
import { deactivateReceiver, listReceivers, reactivateReceiver } from '@/lib/api/receivers'
import { createCompany, deleteCompany, listCompanies, listCustomerInviteStatus, resendCustomerInvite, CUSTOMER_ROLE_LABEL, type Company, type CustomerInviteStatus, type CustomerRole } from '@/lib/api/customers'
import { fetchPackagesByReceivers } from '@/lib/api/orders'
import { reportError } from '@/lib/logger'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { PermissionButton } from '@/components/dispatch/permission-button'
import { usePermissions } from '@/hooks/use-permissions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusStamp, TrackingNumber } from '@/components/dispatch'
import { ReceiverAvatar } from '@/components/dispatch/receiver-avatar'
import { formatDateShort } from '@/lib/format'
import { inviteCardLine, inviteState } from '@/lib/invite-status'
import { cn } from '@/lib/utils'
import { CustomerDialog, type CustomerDialogTab } from './customer-dialogs'

/**
 * One customer's package history, scoped exactly as the customer portal scopes
 * it: an end user's own parcels, and for a buyer their own plus every parcel of
 * the end users assigned to them (`endUsers`). Staff answering "where is my
 * order?" then see the same list the caller is looking at.
 */
function HistoryPanel({ customer, endUsers, open, onOpenChange }: {
  customer: ReceiverProfile | null
  /** End users whose parcels this customer can see. Empty unless they're a buyer. */
  endUsers: ReceiverProfile[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const scope = useMemo(
    () => (customer ? [customer.id, ...endUsers.map((u) => u.id)] : []),
    [customer, endUsers],
  )
  const endUserName = useMemo(
    () => new Map(endUsers.map((u) => [u.id, `${u.name} ${u.surname}`.trim()])),
    [endUsers],
  )
  const packages = useQuery({
    queryKey: ['receiver-packages', scope],
    queryFn: () => fetchPackagesByReceivers(scope),
    enabled: !!customer && open,
  })
  const ownCount = packages.data?.filter((p) => p.receiver_id === customer?.id).length ?? 0
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5">
          <SheetTitle>Package history</SheetTitle>
          {customer && <p className="text-sm text-muted-foreground">{customer.name} {customer.surname}</p>}
          {endUsers.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Their portal view: their own orders, plus those of {endUsers.length} end user{endUsers.length !== 1 ? 's' : ''} assigned to them.
            </p>
          )}
        </SheetHeader>
        <div className="flex flex-col">
          {packages.isLoading ? (
            <div className="p-5"><Skeleton className="h-40 w-full" /></div>
          ) : packages.data && packages.data.length > 0 ? (
            <>
              <ul className="flex flex-col divide-y">
                {packages.data.map((pkg) => {
                  // Only a buyer ever sees a parcel that isn't theirs — name whose
                  // it is, the same way the portal labels a mixed list.
                  const owner = pkg.receiver_id && pkg.receiver_id !== customer?.id
                    ? endUserName.get(pkg.receiver_id) ?? null
                    : null
                  return (
                    <li key={pkg.id} className="flex items-start justify-between gap-3 px-5 py-4">
                      <div className="flex min-w-0 flex-col gap-1">
                        <TrackingNumber value={pkg.reference} />
                        <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                          {/* Customers identify orders by PO, not by our reference. */}
                          {pkg.po_number && <span className="mono">PO {pkg.po_number}</span>}
                          <span>{formatDateShort(pkg.created_at)}</span>
                        </span>
                        {owner && (
                          <span className="flex items-center gap-1 text-xs text-foreground/70">
                            <User className="size-3 shrink-0" /> <span className="truncate">{owner}</span>
                          </span>
                        )}
                        {pkg.notes && <span className="truncate text-xs italic text-muted-foreground/80">{pkg.notes}</span>}
                      </div>
                      <StatusStamp status={pkg.status} />
                    </li>
                  )
                })}
              </ul>
              <div className="border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
                {packages.data.length} package{packages.data.length !== 1 ? 's' : ''} total
                {endUsers.length > 0 && ` · ${ownCount} their own, ${packages.data.length - ownCount} for their end users`}
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

const UNASSIGNED = '__unassigned__'

/** Stable empty list, so a customer with no end users keeps a stable query key. */
const NO_END_USERS: ReceiverProfile[] = []

/**
 * Buyer/End user role as a small stamp tag (echoes StatusStamp), implies portal
 * access. Goes amber when the invite was issued but never accepted, so one chip
 * carries both facts instead of the row growing a second one.
 *
 * Colour alone is not an accessible signal, so the pending state also ships a
 * `title` for pointer users and visually-hidden text for screen readers.
 */
function RoleTag({ role, pending }: { role: CustomerRole; pending?: boolean }) {
  return (
    <span
      title={pending ? 'Invite pending. This customer has not accepted their invite yet.' : undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.08em]',
        pending
          ? 'border-warning/50 bg-warning/10 text-warning'
          : 'border-border bg-muted text-muted-foreground',
      )}
    >
      <span className="size-1 rounded-full bg-current opacity-60" aria-hidden />
      {CUSTOMER_ROLE_LABEL[role]}
      {pending && <span className="sr-only">, invite pending</span>}
    </span>
  )
}

function NewCompanyDialog({ companies }: { companies: Company[] }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const trimmed = name.trim()
  const isDuplicate = trimmed !== '' && companies.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())
  const create = useMutation({
    mutationFn: () => createCompany(name),
    onSuccess: () => { toast.success('Company added.'); qc.invalidateQueries({ queryKey: ['companies'] }); setOpen(false); setName('') },
    onError: (e) => toast.error(reportError(e, 'Could not add the company.', { op: 'companies.create' })),
  })
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setName('') }}>
      <DialogTrigger asChild>
        <PermissionButton permission="companies.create" variant="outline" size="sm"><Building2 className="size-4" /> New company</PermissionButton>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a company</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (trimmed && !isDuplicate) create.mutate() }}>
          <Label htmlFor="company-name">Company name</Label>
          <Input id="company-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-invalid={isDuplicate} />
          {isDuplicate && <p className="text-xs text-destructive">A company with this name already exists.</p>}
          <DialogFooter className="mt-2">
            <PermissionButton permission="companies.create" type="submit" disabled={!trimmed || isDuplicate || create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : <Plus className="size-4" />} Add company
            </PermissionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A single customer card. */
function CustomerCard({ r, buyerName, status, resending, onEdit, onContacts, onToggle, onHistory, onResend }: {
  r: ReceiverProfile
  /** For end users: the name of the buyer who sees them, or null if nobody does. */
  buyerName: string | null
  /** Auth-side invite state, or undefined while unknown (loading/failed/no auth user). */
  status: CustomerInviteStatus | undefined
  /** True while this specific card's resend is in flight. */
  resending: boolean
  onEdit: () => void
  onContacts: () => void
  onToggle: () => void
  onHistory: () => void
  onResend: () => void
}) {
  const { can } = usePermissions()
  const state = inviteState(r.role, status)
  const cardLine = inviteCardLine(r.role, r.is_active, status)
  const showResend = cardLine?.kind === 'resend'
  return (
    <div className={cn('group flex flex-col rounded-lg border bg-card transition-colors hover:border-foreground/15', !r.is_active && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <ReceiverAvatar name={`${r.name} ${r.surname}`} className="size-10" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="truncate font-semibold leading-none">{r.name} {r.surname}</span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {r.role
                ? <RoleTag role={r.role} pending={state === 'pending'} />
                : <span className="text-[11px] text-muted-foreground/70">No portal access</span>}
              {!r.is_active && <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Inactive</span>}
              {/* Reference info, not an action — it rides the chip row rather than
                  spending a body row of its own on every healthy card. */}
              {cardLine?.kind === 'last-seen' && (
                <span className="text-[11px] text-muted-foreground/70">{cardLine.text}</span>
              )}
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Actions" className="-mr-1 text-muted-foreground"><MoreVertical /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Only for an outstanding invite — there is nothing to re-send to a
                customer who already accepted, and a deactivated one would get a
                link that cannot sign them in. */}
            {showResend && (
              <DropdownMenuItem onSelect={onResend} disabled={resending || !can('customers.invite')}>
                {resending ? <Loader2 className="animate-spin" /> : <Send />}
                {resending ? 'Sending…' : 'Resend invite'}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onEdit} disabled={!can('customers.update')}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuItem onSelect={onContacts} disabled={!can('customers.update')}><Contact /> Manage contacts</DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggle} disabled={!can('customers.deactivate')}><Power /> {r.is_active ? 'Deactivate' : 'Reactivate'}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col gap-1.5 px-4 pb-3.5 text-[13px]">
        <span className="flex items-center gap-2 text-muted-foreground"><Mail className="size-3.5 shrink-0" /> <span className="truncate">{r.email}</span></span>
        {r.phone && <span className="flex items-center gap-2 text-muted-foreground"><Phone className="size-3.5 shrink-0" /> <span className="mono">{r.phone}</span></span>}
        {r.role === 'runner' && (
          buyerName ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <UserCheck className="size-3.5 shrink-0" /> <span className="truncate">{buyerName}</span>
            </span>
          ) : (
            // An end user with no buyer is a valid state, but nobody can see
            // their packages — say so rather than letting it pass unnoticed.
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-2 text-left text-warning transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:underline"
            >
              <UserX className="size-3.5 shrink-0" /> <span className="truncate">No buyer assigned</span>
            </button>
          )
        )}
      </div>
      <div className="tear-line" />
      <button
        type="button"
        onClick={onHistory}
        className="flex items-center justify-between px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
      >
        <span className="flex items-center gap-2"><PackageIcon className="size-3.5" /> Package history</span>
        <ChevronRight className="size-4 opacity-40 transition-transform duration-150 ease-out group-hover-fine:translate-x-0.5" />
      </button>
    </div>
  )
}

export function CustomersPage() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ReceiverProfile | null>(null)
  const [editTab, setEditTab] = useState<CustomerDialogTab>('details')
  const [historyFor, setHistoryFor] = useState<ReceiverProfile | null>(null)
  const [companyToRemove, setCompanyToRemove] = useState<{ id: string; name: string } | null>(null)

  const openCustomer = (r: ReceiverProfile | null, tab: CustomerDialogTab = 'details') => {
    setEditing(r); setEditTab(tab); setDialogOpen(true)
  }

  const { data, isLoading } = useQuery({ queryKey: ['receivers'], queryFn: listReceivers })
  const companies = useQuery({ queryKey: ['companies'], queryFn: listCompanies })

  // Separate from ['receivers'] on purpose: this crosses into auth.users via an
  // RPC, and a failure here must not take the directory down with it.
  const inviteStatus = useQuery({ queryKey: ['customer-invite-status'], queryFn: listCustomerInviteStatus })

  const statusById = useMemo(() => {
    const m = new Map<string, CustomerInviteStatus>()
    for (const s of inviteStatus.data ?? []) m.set(s.receiver_id, s)
    return m
  }, [inviteStatus.data])

  const companyName = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of companies.data ?? []) m.set(c.id, c.name)
    return m
  }, [companies.data])

  // An end user's packages are only visible to a buyer who is still an active
  // buyer — so a demoted or deactivated buyer leaves them effectively unassigned.
  // Mirror the `customer_packages` view's test rather than just checking buyer_id.
  const buyerName = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of data ?? []) {
      if (r.role === 'buyer' && r.is_active) m.set(r.id, `${r.name} ${r.surname}`.trim())
    }
    return m
  }, [data])

  const buyerFor = (r: ReceiverProfile) => (r.buyer_id ? buyerName.get(r.buyer_id) ?? null : null)

  // The other side of the same relationship: which end users each buyer can see.
  // Deactivated end users stay in the list — the buyer keeps their history.
  const endUsersOf = useMemo(() => {
    const m = new Map<string, ReceiverProfile[]>()
    for (const r of data ?? []) {
      if (r.role !== 'runner' || !r.buyer_id) continue
      const list = m.get(r.buyer_id) ?? []
      list.push(r)
      m.set(r.buyer_id, list)
    }
    return m
  }, [data])

  // A demoted or deactivated buyer has no portal view to mirror, so their
  // history narrows back to their own parcels — same test as `buyerName`.
  const historyEndUsers =
    historyFor && historyFor.role === 'buyer' && historyFor.is_active
      ? endUsersOf.get(historyFor.id) ?? NO_END_USERS
      : NO_END_USERS

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
    // Seed an (empty) group for every known company so companies show up in the
    // directory even before any customer is assigned to them. Skipped while
    // searching so empty companies don't clutter search results.
    if (!search.trim()) {
      for (const c of companies.data ?? []) byKey.set(c.id, [])
    }
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
  }, [filtered, companyName, companies.data, search])

  const visibleGroups = companyFilter === 'all' ? groups : groups.filter((g) => g.id === companyFilter)

  const toggle = useMutation({
    mutationFn: (r: ReceiverProfile) => (r.is_active ? deactivateReceiver(r.id) : reactivateReceiver(r.id)),
    onSuccess: (_, r) => { toast.success(r.is_active ? 'Customer deactivated.' : 'Customer reactivated.'); qc.invalidateQueries({ queryKey: ['receivers'] }) },
    onError: (e) => toast.error(reportError(e, 'Could not update the customer.', { op: 'customers.toggle' })),
  })

  const resend = useMutation({
    mutationFn: (r: ReceiverProfile) => resendCustomerInvite(r),
    onSuccess: (_, r) => {
      toast.success(`Invite re-sent to ${r.email}.`)
      qc.invalidateQueries({ queryKey: ['customer-invite-status'] })
    },
    onError: (e) => toast.error(reportError(e, 'Could not re-send the invite.', { op: 'customers.resendInvite' })),
  })

  const removeCompany = useMutation({
    mutationFn: (id: string) => deleteCompany(id),
    onSuccess: () => {
      toast.success('Company removed.')
      qc.invalidateQueries({ queryKey: ['companies'] })
      setCompanyToRemove(null)
      if (companyToRemove && companyFilter === companyToRemove.id) setCompanyFilter('all')
    },
    onError: (e) => toast.error(reportError(e, 'Could not remove the company.', { op: 'companies.delete' })),
  })

  return (
    <PageBody>
      <PageHeader
        eyebrow="Directory"
        title="Customers"
        description="Companies, their Buyers and End users, contacts, and package history."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <NewCompanyDialog companies={companies.data ?? []} />
            <PermissionButton permission="customers.create" size="sm" onClick={() => openCustomer(null)}>
              <Users className="size-4" /> Add customer
            </PermissionButton>
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
          {visibleGroups.map((g) => {
            const buyers = g.customers.filter((c) => c.role === 'buyer').length
            const endUsers = g.customers.filter((c) => c.role === 'runner').length
            const noBuyer = g.customers.filter((c) => c.role === 'runner' && !buyerFor(c)).length
            const breakdown = [buyers && `${buyers} buyer${buyers > 1 ? 's' : ''}`, endUsers && `${endUsers} end user${endUsers > 1 ? 's' : ''}`].filter(Boolean).join(' · ')
            return (
              <section key={g.id} className="flex flex-col gap-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-6 items-center justify-center rounded-[4px] border bg-muted text-muted-foreground">
                    {g.id === UNASSIGNED ? <Users className="size-3.5" /> : <Building2 className="size-3.5" />}
                  </span>
                  <h2 className="text-sm font-semibold tracking-tight">{g.name}</h2>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{g.customers.length}</span>
                  {noBuyer > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                      <UserX className="size-3" /> {noBuyer} without a buyer
                    </span>
                  )}
                  {breakdown && <span className="ml-auto text-[11px] text-muted-foreground">{breakdown}</span>}
                </div>
                {g.customers.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {g.customers.map((r) => (
                      <CustomerCard
                        key={r.id}
                        r={r}
                        buyerName={buyerFor(r)}
                        status={statusById.get(r.id)}
                        resending={resend.isPending && resend.variables?.id === r.id}
                        onEdit={() => openCustomer(r, 'details')}
                        onContacts={() => openCustomer(r, 'contacts')}
                        onToggle={() => toggle.mutate(r)}
                        onHistory={() => setHistoryFor(r)}
                        onResend={() => resend.mutate(r)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    <p>
                      No customers assigned yet.{' '}
                      {can('customers.create') && (
                        <button
                          type="button"
                          onClick={() => openCustomer(null)}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Add one
                        </button>
                      )}
                    </p>
                    {g.id !== UNASSIGNED && (
                      <PermissionButton
                        permission="companies.delete"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setCompanyToRemove({ id: g.id, name: g.name })}
                      >
                        <Trash2 className="size-4" /> Remove company
                      </PermissionButton>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Users className="size-5" /></span>
          <p className="text-sm font-medium">{search ? 'No customers match' : 'No customers yet'}</p>
        </div>
      )}

      <CustomerDialog customer={editing} open={dialogOpen} onOpenChange={setDialogOpen} initialTab={editTab} />
      <HistoryPanel
        customer={historyFor}
        endUsers={historyEndUsers}
        open={!!historyFor}
        onOpenChange={(o) => !o && setHistoryFor(null)}
      />
      <ConfirmDialog
        open={!!companyToRemove}
        onOpenChange={(o) => { if (!o && !removeCompany.isPending) setCompanyToRemove(null) }}
        title="Remove company?"
        description={companyToRemove ? `“${companyToRemove.name}” will be removed. This can't be undone.` : undefined}
        confirmLabel="Remove company"
        destructive
        loading={removeCompany.isPending}
        onConfirm={() => companyToRemove && removeCompany.mutate(companyToRemove.id)}
      />
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

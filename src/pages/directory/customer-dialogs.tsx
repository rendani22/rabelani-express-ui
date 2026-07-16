import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, UserPlus } from 'lucide-react'
import type { ReceiverProfile } from '@/lib/api/receivers'
import {
  createReceiver,
  createReceiverContact,
  deleteReceiverContact,
  listReceiverContacts,
  listReceivers,
  updateReceiver,
  type UpdateReceiverProfileDto,
} from '@/lib/api/receivers'
import { inviteCustomer, listCompanies, type CustomerRole } from '@/lib/api/customers'
import { reportError } from '@/lib/logger'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PermissionButton } from '@/components/dispatch/permission-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { ReceiverAvatar } from '@/components/dispatch/receiver-avatar'

const emptyForm = { name: '', surname: '', email: '', phone: '' }
const NO_COMPANY = '__none__'
const NO_BUYER = '__no_buyer__'

/** Basic email shape: something@something.tld */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** South African phone: 10 local digits (0XXXXXXXXX) or +27 followed by 9 digits. */
const PHONE_RE = /^(?:\+27\d{9}|0\d{9})$/
/** Strip spaces/dashes/parens before validating a phone number. */
const normalizePhone = (v: string) => v.replace(/[\s\-()]/g, '')

export type CustomerDialogTab = 'details' | 'contacts'

export function CustomerDialog({
  customer,
  open,
  onOpenChange,
  initialTab = 'details',
}: {
  customer: ReceiverProfile | null
  open: boolean
  onOpenChange: (o: boolean) => void
  initialTab?: CustomerDialogTab
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [companyId, setCompanyId] = useState<string>(NO_COMPANY)
  const [invite, setInvite] = useState(false)
  const [role, setRole] = useState<CustomerRole>('buyer')
  const [buyerId, setBuyerId] = useState<string>(NO_BUYER)
  const [tab, setTab] = useState<CustomerDialogTab>('details')

  const companies = useQuery({ queryKey: ['companies'], queryFn: listCompanies, enabled: open })
  const receivers = useQuery({ queryKey: ['receivers'], queryFn: listReceivers, enabled: open })

  useEffect(() => {
    if (open) {
      setForm(
        customer
          ? { name: customer.name ?? '', surname: customer.surname ?? '', email: customer.email ?? '', phone: customer.phone ?? '' }
          : emptyForm,
      )
      setCompanyId(customer?.company_id ?? NO_COMPANY)
      setInvite(!!customer?.role)
      setRole(customer?.role ?? 'buyer')
      setBuyerId(customer?.buyer_id ?? NO_BUYER)
      setTab(customer ? initialTab : 'details')
    }
  }, [open, customer, initialTab])

  // Only an active buyer in the selected company can be assigned, and nobody can
  // be their own buyer. This is the only place the rule is enforced — there is
  // no DB constraint behind it.
  const buyerOptions = useMemo(
    () =>
      (receivers.data ?? []).filter(
        (r) => r.role === 'buyer' && r.is_active && r.company_id === companyId && r.id !== customer?.id,
      ),
    [receivers.data, companyId, customer?.id],
  )

  // Derived, not an effect: switching company invalidates a buyer picked for the
  // old one, and a stale-state reset would race the receivers query and wipe a
  // saved assignment on open.
  const buyerValid = buyerId !== NO_BUYER && buyerOptions.some((b) => b.id === buyerId)
  const selectedBuyer = buyerValid ? buyerId : NO_BUYER

  // First-time grant only — editing a customer who already has access never re-invites.
  const willInvite = invite && !customer?.role

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim(), surname = form.surname.trim()
      const email = form.email.trim().toLowerCase()
      const phone = form.phone.trim()
      const company_id = companyId === NO_COMPANY ? null : companyId
      // Only an end user with portal access has a buyer.
      const buyer_id = invite && role === 'runner' && buyerValid ? buyerId : null
      if (willInvite) {
        await inviteCustomer({ email, name, surname, phone: phone || undefined, company_id: company_id as string, role, buyer_id })
      } else if (customer) {
        // Pass null (not undefined) when the field is cleared so the phone is
        // actually removed — undefined would be dropped from the update payload.
        const dto: UpdateReceiverProfileDto = { name, surname, email, phone: phone || null, company_id, buyer_id }
        // Existing portal customer: mirror the switch. Keep/update the role while
        // access is on, or revoke it (role → null) when the admin turns it off.
        if (customer.role) dto.role = invite ? role : null
        await updateReceiver(customer.id, dto)
      } else {
        await createReceiver({ name, surname, email, phone: phone || undefined, company_id })
      }
    },
    onSuccess: () => {
      toast.success(willInvite ? 'Invite sent.' : customer ? 'Customer updated.' : 'Customer added.')
      qc.invalidateQueries({ queryKey: ['receivers'] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(reportError(e, 'Could not save the customer.', { op: 'customers.save' })),
  })

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const emailValid = EMAIL_RE.test(form.email.trim())
  const phoneValid = form.phone.trim() === '' || PHONE_RE.test(normalizePhone(form.phone))
  // Only surface an error once the user has typed something invalid.
  const emailError = form.email.trim() !== '' && !emailValid
  const phoneError = form.phone.trim() !== '' && !phoneValid

  const baseValid = form.name.trim() && form.surname.trim() && emailValid && phoneValid
  // Hold off while the buyers are still loading: buyer_id is resolved against
  // that list, so saving early would clear an assignment the admin never touched.
  const buyersPending = invite && role === 'runner' && receivers.isLoading
  const canSubmit = !!baseValid && (!invite || companyId !== NO_COMPANY) && !buyersPending && !save.isPending
  const isEdit = !!customer

  const detailsForm = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>First name *</Label>
          <Input value={form.name} onChange={set('name')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Surname *</Label>
          <Input value={form.surname} onChange={set('surname')} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Email *</Label>
        <Input
          type="email"
          value={form.email}
          onChange={set('email')}
          aria-invalid={emailError}
        />
        {emailError && <p className="text-xs text-destructive">Enter a valid email address.</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Phone</Label>
        <Input
          value={form.phone}
          onChange={set('phone')}
          className="mono"
          placeholder="0XXXXXXXXX or +27XXXXXXXXX"
          aria-invalid={phoneError}
        />
        {phoneError && <p className="text-xs text-destructive">Enter 10 digits (0…) or +27 followed by 9 digits.</p>}
      </div>

      <div className="tear-line" />

      <div className="flex flex-col gap-1.5">
        <Label>Company</Label>
        <Select value={companyId} onValueChange={setCompanyId}>
          <SelectTrigger><SelectValue placeholder={companies.isLoading ? 'Loading…' : 'Select a company'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_COMPANY}>Unassigned</SelectItem>
            {(companies.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Portal access — inset panel */}
      <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-3.5">
        <label className="flex items-start justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <UserPlus className="size-3.5 text-muted-foreground" /> Portal access
            </span>
            <span className="text-xs text-muted-foreground">
              {customer?.role
                ? 'This customer can sign in to view their packages.'
                : 'Emails an invite to sign in and view their packages.'}
            </span>
          </span>
          <Switch checked={invite} onCheckedChange={setInvite} />
        </label>

        {invite && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Role *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as CustomerRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buyer">Buyer — sees packages of their assigned end users</SelectItem>
                  <SelectItem value="runner">End user — sees only packages assigned to them</SelectItem>
                </SelectContent>
              </Select>
              {companyId === NO_COMPANY && (
                <p className="text-xs text-muted-foreground">Select a company above to grant portal access.</p>
              )}
            </div>

            {role === 'runner' && companyId !== NO_COMPANY && (
              <div className="flex flex-col gap-1.5">
                <Label>Buyer</Label>
                <Select value={selectedBuyer} onValueChange={setBuyerId} disabled={receivers.isLoading || buyerOptions.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={receivers.isLoading ? 'Loading…' : 'No buyer'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_BUYER}>No buyer</SelectItem>
                    {buyerOptions.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name} {b.surname}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {receivers.isLoading
                    ? 'Loading buyers…'
                    : buyerOptions.length === 0
                      ? 'This company has no active buyer yet. Without one, only this end user sees their packages.'
                      : !buyerValid
                        ? 'No buyer will see this end user’s packages.'
                        : 'This buyer will see all of this end user’s packages, past and future.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // When the invite is on but no company is picked, explain why the action is
  // blocked right next to the button — instead of leaving it silently disabled.
  const inviteNeedsCompany = invite && companyId === NO_COMPANY
  const savePermission = willInvite ? 'customers.invite' : isEdit ? 'customers.update' : 'customers.create'
  const detailsFooter = (
    <DialogFooter className="flex-col items-stretch gap-2 border-t p-4 sm:flex-row sm:items-center sm:justify-end">
      {inviteNeedsCompany && (
        <p className="mr-auto text-xs text-muted-foreground">
          Pick a company to send an invite, or turn off portal access to just save the customer.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <PermissionButton permission={savePermission} onClick={() => save.mutate()} disabled={!canSubmit}>
          {save.isPending && <Loader2 className="animate-spin" />}
          {willInvite ? 'Send invite' : customer ? 'Save' : 'Add customer'}
        </PermissionButton>
      </div>
    </DialogFooter>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="p-5 pb-4 text-left">
          {isEdit ? (
            <div className="flex items-center gap-3">
              <ReceiverAvatar name={`${customer.name} ${customer.surname}`} className="size-10" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <DialogTitle className="truncate text-base leading-none">{customer.name} {customer.surname}</DialogTitle>
                <span className="truncate text-xs text-muted-foreground">{customer.email}</span>
              </div>
            </div>
          ) : (
            <DialogTitle>New customer</DialogTitle>
          )}
        </DialogHeader>

        {isEdit ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as CustomerDialogTab)} className="gap-0">
            <div className="px-5">
              <TabsList className="w-full">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="details" className="p-5 pt-4">{detailsForm}</TabsContent>
            <TabsContent value="contacts" className="p-5 pt-4">
              <ContactsTab customer={customer} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="p-5 pt-0">{detailsForm}</div>
        )}

        {tab === 'details' ? detailsFooter : (
          <DialogFooter className="border-t p-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Alternative contacts for a receiver — add/remove, self-saving. */
function ContactsTab({ customer }: { customer: ReceiverProfile }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const contacts = useQuery({
    queryKey: ['receiver-contacts', customer.id],
    queryFn: () => listReceiverContacts(customer.id),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['receiver-contacts', customer.id] })

  const add = useMutation({
    mutationFn: () => createReceiverContact({ receiver_id: customer.id, name: name.trim(), phone: phone.trim() }),
    onSuccess: () => { toast.success('Contact added.'); setName(''); setPhone(''); refresh() },
    onError: (e) => toast.error(reportError(e, 'Could not add the contact.', { op: 'customers.contact.add' })),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteReceiverContact(id),
    onSuccess: () => { toast.success('Contact removed.'); refresh() },
    onError: (e) => toast.error(reportError(e, 'Could not remove the contact.', { op: 'customers.contact.remove' })),
  })

  return (
    <div className="flex flex-col gap-4">
      {contacts.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}
        </div>
      ) : contacts.data && contacts.data.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {contacts.data.map((c) => (
            <li key={c.id} className="group flex items-center gap-3 rounded-md border bg-card px-3 py-2">
              <ReceiverAvatar name={c.name} className="size-8" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium leading-tight">{c.name}</span>
                <span className="mono truncate text-xs text-muted-foreground">{c.phone}</span>
              </div>
              <PermissionButton
                permission="customers.update"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${c.name}`}
                className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                disabled={remove.isPending}
                onClick={() => remove.mutate(c.id)}
              >
                <Trash2 />
              </PermissionButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          No alternative contacts yet.
        </p>
      )}

      <div className="tear-line" />

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); if (name.trim() && phone.trim()) add.mutate() }}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label className="text-xs">Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27…" className="mono" />
        </div>
        <PermissionButton permission="customers.update" type="submit" size="icon" disabled={!name.trim() || !phone.trim() || add.isPending} aria-label="Add contact">
          {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
        </PermissionButton>
      </form>
    </div>
  )
}

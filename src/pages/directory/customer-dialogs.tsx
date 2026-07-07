import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import type { ReceiverProfile } from '@/lib/api/receivers'
import {
  createReceiver,
  createReceiverContact,
  deleteReceiverContact,
  listReceiverContacts,
  updateReceiver,
} from '@/lib/api/receivers'
import { inviteCustomer, listCompanies, type CustomerRole } from '@/lib/api/customers'
import { reportError } from '@/lib/logger'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const emptyForm = { name: '', surname: '', email: '', phone: '' }

export function CustomerDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: ReceiverProfile | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  // Portal-invite options (add mode only).
  const [invite, setInvite] = useState(false)
  const [companyId, setCompanyId] = useState('')
  const [role, setRole] = useState<CustomerRole>('buyer')

  const companies = useQuery({ queryKey: ['companies'], queryFn: listCompanies, enabled: open && !customer && invite })

  useEffect(() => {
    if (open) {
      setForm(
        customer
          ? { name: customer.name ?? '', surname: customer.surname ?? '', email: customer.email ?? '', phone: customer.phone ?? '' }
          : emptyForm,
      )
      setInvite(false)
      setCompanyId('')
      setRole('buyer')
    }
  }, [open, customer])

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim(), surname = form.surname.trim()
      const email = form.email.trim().toLowerCase(), phone = form.phone.trim() || undefined
      if (customer) { await updateReceiver(customer.id, { name, surname, email, phone }); return }
      // Add mode: invite (creates the receiver + portal access + email) or plain add.
      if (invite) { await inviteCustomer({ email, name, surname, phone, company_id: companyId, role }); return }
      await createReceiver({ name, surname, email, phone })
    },
    onSuccess: () => {
      toast.success(customer ? 'Customer updated.' : invite ? 'Invite sent.' : 'Customer added.')
      qc.invalidateQueries({ queryKey: ['receivers'] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(reportError(e, 'Could not save the customer.', { op: 'customers.save' })),
  })

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const baseValid = form.name.trim() && form.surname.trim() && form.email.trim()
  const canSubmit = !!baseValid && (!invite || !!companyId) && !save.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{customer ? 'Edit customer' : 'New customer'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>First name *</Label>
            <Input value={form.name} onChange={set('name')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Surname *</Label>
            <Input value={form.surname} onChange={set('surname')} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={set('email')} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={set('phone')} />
          </div>

          {/* Portal access — add mode only */}
          {!customer && (
            <div className="col-span-2 flex flex-col gap-4 rounded-lg border bg-muted/30 p-3.5">
              <label className="flex items-start justify-between gap-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Give portal access</span>
                  <span className="text-xs text-muted-foreground">Emails an invite to sign in and view their packages.</span>
                </span>
                <Switch checked={invite} onCheckedChange={setInvite} />
              </label>

              {invite && (
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Company *</Label>
                    <Select value={companyId} onValueChange={setCompanyId}>
                      <SelectTrigger><SelectValue placeholder={companies.isLoading ? 'Loading…' : 'Select a company'} /></SelectTrigger>
                      <SelectContent>{(companies.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Role *</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as CustomerRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buyer">Buyer — sees all packages for the company</SelectItem>
                        <SelectItem value="runner">Runner — sees only packages assigned to them</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!canSubmit}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {customer ? 'Save' : invite ? 'Send invite' : 'Add customer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ManageContactsDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: ReceiverProfile | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const contacts = useQuery({
    queryKey: ['receiver-contacts', customer?.id],
    queryFn: () => listReceiverContacts(customer!.id),
    enabled: !!customer && open,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['receiver-contacts', customer?.id] })

  const add = useMutation({
    mutationFn: () => createReceiverContact({ receiver_id: customer!.id, name: name.trim(), phone: phone.trim() }),
    onSuccess: () => { toast.success('Contact added.'); setName(''); setPhone(''); refresh() },
    onError: (e) => toast.error(reportError(e, 'Could not add the contact.', { op: 'customers.contact.add' })),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteReceiverContact(id),
    onSuccess: () => { toast.success('Contact removed.'); refresh() },
    onError: (e) => toast.error(reportError(e, 'Could not remove the contact.', { op: 'customers.contact.remove' })),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alternative contacts</DialogTitle>
          <DialogDescription>
            {customer ? `${customer.name} ${customer.surname}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {contacts.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : contacts.data && contacts.data.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-md border">
              {contacts.data.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <span className="mono truncate text-xs text-muted-foreground">{c.phone}</span>
                  </div>
                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(c.id)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">No alternative contacts yet.</p>
          )}

          <div className="flex items-end gap-2 border-t pt-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name" />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27…" />
            </div>
            <Button size="icon" disabled={!name.trim() || !phone.trim() || add.isPending} onClick={() => add.mutate()} aria-label="Add contact">
              {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

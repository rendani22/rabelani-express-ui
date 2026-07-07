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

  useEffect(() => {
    if (open) {
      setForm(
        customer
          ? { name: customer.name ?? '', surname: customer.surname ?? '', email: customer.email ?? '', phone: customer.phone ?? '' }
          : emptyForm,
      )
    }
  }, [open, customer])

  const save = useMutation({
    mutationFn: () => {
      const dto = { name: form.name.trim(), surname: form.surname.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim() || undefined }
      return customer ? updateReceiver(customer.id, dto) : createReceiver(dto)
    },
    onSuccess: () => {
      toast.success(customer ? 'Customer updated.' : 'Customer added.')
      qc.invalidateQueries({ queryKey: ['receivers'] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(reportError(e, 'Could not save the customer.', { op: 'customers.save' })),
  })

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name.trim() || !form.surname.trim() || !form.email.trim() || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {customer ? 'Save' : 'Add customer'}
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

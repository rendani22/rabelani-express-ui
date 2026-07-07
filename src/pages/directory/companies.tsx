import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building2, Loader2, Plus, UserPlus } from 'lucide-react'
import {
  createCompany,
  inviteCustomer,
  listCompanies,
  type CustomerRole,
} from '@/lib/api/customers'
import { reportError } from '@/lib/logger'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
    onSuccess: () => {
      toast.success('Invite sent.')
      qc.invalidateQueries({ queryKey: ['receivers'] })
      setOpen(false)
      reset()
    },
    onError: (e) => toast.error(reportError(e, 'Could not send the invite.', { op: 'customers.invite' })),
  })

  const valid = name.trim() && EMAIL_RE.test(email.trim()) && companyId && role

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger asChild>
        <Button><UserPlus className="size-4" /> Invite customer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite a customer</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="inv-name">First name</Label>
              <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="inv-surname">Surname</Label>
              <Input id="inv-surname" value={surname} onChange={(e) => setSurname(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inv-email">Email</Label>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Company</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder={companies.isLoading ? 'Loading…' : 'Select a company'} /></SelectTrigger>
              <SelectContent>
                {(companies.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
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
            {invite.isPending ? <Loader2 className="animate-spin" /> : <UserPlus className="size-4" />}
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CompaniesPage() {
  const qc = useQueryClient()
  const companies = useQuery({ queryKey: ['companies'], queryFn: listCompanies })
  const [newName, setNewName] = useState('')

  const create = useMutation({
    mutationFn: () => createCompany(newName),
    onSuccess: () => {
      toast.success('Company added.')
      qc.invalidateQueries({ queryKey: ['companies'] })
      setNewName('')
    },
    onError: (e) => toast.error(reportError(e, 'Could not add the company.', { op: 'companies.create' })),
  })

  return (
    <PageBody>
      <PageHeader
        eyebrow="Directory"
        title="Companies"
        description="Group customers by company, then invite Buyers and Runners to the portal."
        actions={<InviteCustomerDialog />}
      />

      <Card className="flex flex-col gap-3 p-5">
        <Label htmlFor="new-company">Add a company</Label>
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create.mutate() }}
        >
          <Input id="new-company" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Company name" />
          <Button type="submit" disabled={!newName.trim() || create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <Plus className="size-4" />} Add
          </Button>
        </form>
      </Card>

      {companies.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : companies.data && companies.data.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {companies.data.map((c) => (
            <li key={c.id}>
              <Card className="flex items-center gap-3 p-4">
                <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Building2 className="size-4" />
                </div>
                <span className="font-medium">{c.name}</span>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="p-10 text-center text-sm text-muted-foreground">No companies yet.</Card>
      )}
    </PageBody>
  )
}

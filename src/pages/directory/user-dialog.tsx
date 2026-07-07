import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { StaffProfileRow } from '@/lib/api/drivers'
import type { StaffRole } from '@/lib/api/staff'
import { createStaff, updateStaff } from '@/lib/api/staff'
import { reportError } from '@/lib/logger'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'

const ROLES: StaffRole[] = ['admin', 'manager', 'driver', 'collection', 'staff', 'viewer']
const roleLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1)

export function UserDialog({
  user,
  open,
  onOpenChange,
}: {
  user: StaffProfileRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const isEdit = !!user
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'staff', phone: '', department: '' })

  useEffect(() => {
    if (open) {
      setForm(
        user
          ? { full_name: user.full_name ?? '', email: user.email ?? '', password: '', role: user.role ?? 'staff', phone: user.phone ?? '', department: user.department ?? '' }
          : { full_name: '', email: '', password: '', role: 'staff', phone: '', department: '' },
      )
    }
  }, [open, user])

  const save = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return updateStaff(user!.id, {
          full_name: form.full_name.trim(),
          role: form.role as StaffRole,
          phone: form.phone.trim() || undefined,
          department: form.department.trim() || undefined,
        })
      }
      return createStaff({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        full_name: form.full_name.trim(),
        role: form.role as StaffRole,
        phone: form.phone.trim() || undefined,
        department: form.department.trim() || undefined,
      })
    },
    onSuccess: () => {
      toast.success(isEdit ? 'User updated.' : 'User created.')
      qc.invalidateQueries({ queryKey: ['staff'] })
      qc.invalidateQueries({ queryKey: ['drivers'] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(reportError(e, 'Could not save the user.', { op: 'users.save' })),
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const canSubmit = form.full_name.trim() && (isEdit || (form.email.trim() && form.password.length >= 6))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit user' : 'New user'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Full name *</Label>
            <Input value={form.full_name} onChange={set('full_name')} />
          </div>
          {!isEdit && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={set('email')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Password *</Label>
                <Input type="password" value={form.password} onChange={set('password')} placeholder="≥ 6 chars" />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <Combobox
              options={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
              value={form.role}
              onChange={(v) => setForm((f) => ({ ...f, role: v }))}
              searchPlaceholder="Search role…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Department</Label>
            <Input value={form.department} onChange={set('department')} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={set('phone')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!canSubmit || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {isEdit ? 'Save' : 'Create user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

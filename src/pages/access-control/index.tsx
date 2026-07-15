import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info, Lock, Search, ShieldAlert } from 'lucide-react'
import { listStaffProfiles, type StaffProfileRow } from '@/lib/api/drivers'
import {
  resolveEffectivePermissions,
  type OverrideEffect,
  type Permission,
  type PermissionKey,
} from '@/lib/api/permissions'
import type { StaffRole } from '@/lib/api/staff'
import {
  usePermissionCatalog,
  useRolePermissions,
  useSetRolePermission,
  useSetUserPermission,
  useUserPermissions,
} from '@/hooks/use-permissions'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Roles shown as columns. `admin` is deliberately first, and deliberately
 * read-only: has_permission() short-circuits to true for any active admin, so
 * its checkboxes describe reality rather than controlling it. Making them
 * editable would let someone tick away their own escape hatch.
 */
const ROLES: StaffRole[] = [
  'admin',
  'manager',
  'warehouse',
  'collection',
  'driver',
  'staff',
  'viewer',
]

function SensitiveMark({ permission }: { permission: Permission }) {
  if (!permission.is_sensitive) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="ml-1.5 inline-flex align-middle text-warning">
          <ShieldAlert className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Sensitive: money, bulk customer data, destructive actions, or privilege.
      </TooltipContent>
    </Tooltip>
  )
}

function PermissionLabel({ permission }: { permission: Permission }) {
  return (
    <div className="flex flex-col gap-0.5 py-1">
      <span className="text-sm font-medium">
        {permission.label}
        <SensitiveMark permission={permission} />
      </span>
      <span className="text-xs text-muted-foreground">{permission.description}</span>
      <code className="text-[10.5px] text-muted-foreground/70">{permission.key}</code>
    </div>
  )
}

/** Roles tab: the permission × role grid. */
function RolesGrid() {
  const catalog = usePermissionCatalog()
  const rolePerms = useRolePermissions()
  const setRolePerm = useSetRolePermission()

  const held = useMemo(() => {
    const set = new Set<string>()
    for (const rp of rolePerms.data ?? []) set.add(`${rp.role}:${rp.permission_key}`)
    return set
  }, [rolePerms.data])

  if (catalog.isLoading || rolePerms.isLoading) {
    return <Skeleton className="h-96 rounded-lg" />
  }

  const grouped = new Map<string, Permission[]>()
  for (const p of catalog.data ?? []) {
    const list = grouped.get(p.feature) ?? []
    list.push(p)
    grouped.set(p.feature, list)
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          These are the defaults every member of a role inherits. Admins always have
          everything — that&apos;s what stops a mis-click from locking everyone out of
          this screen — so the admin column is fixed. To vary one person from their
          role, use the <strong>People</strong> tab.
        </span>
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur">
            <tr>
              <th className="w-[38%] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Permission
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {role}
                  {role === 'admin' && (
                    <Lock className="ml-1 inline size-3 align-middle opacity-60" />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...grouped.entries()].map(([feature, permissions]) => (
              <Fragment key={feature}>
                <tr className="border-t bg-muted/25">
                  <td
                    colSpan={ROLES.length + 1}
                    className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    {feature}
                  </td>
                </tr>
                {permissions.map((p) => (
                  <tr key={p.key} className="border-t">
                    <td className="px-4">
                      <PermissionLabel permission={p} />
                    </td>
                    {ROLES.map((role) => {
                      const isAdmin = role === 'admin'
                      const checked = isAdmin || held.has(`${role}:${p.key}`)
                      return (
                        <td key={role} className="px-3 text-center">
                          <Checkbox
                            checked={checked}
                            disabled={isAdmin || setRolePerm.isPending}
                            aria-label={`${p.label} for ${role}`}
                            onCheckedChange={(next) =>
                              setRolePerm.mutate({
                                role,
                                key: p.key,
                                enabled: next === true,
                              })
                            }
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const EFFECTS: { value: OverrideEffect | 'inherit'; label: string; hint: string }[] = [
  { value: 'inherit', label: 'Inherit', hint: 'Follow the role default' },
  { value: 'grant', label: 'Grant', hint: 'Allow, even if the role does not' },
  { value: 'deny', label: 'Deny', hint: 'Block, even if the role allows it' },
]

/** People tab: per-user overrides on top of the role. */
function UserOverrides() {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const staff = useQuery({ queryKey: ['staff'], queryFn: listStaffProfiles })
  const catalog = usePermissionCatalog()
  const rolePerms = useRolePermissions()
  const setUserPerm = useSetUserPermission()

  const users = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = (staff.data ?? []).filter((u) => u.is_active)
    if (!q) return rows
    return rows.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.role ?? '').toLowerCase().includes(q)
    )
  }, [staff.data, search])

  const selected: StaffProfileRow | null =
    users.find((u) => u.user_id === selectedId) ?? null

  const overrides = useUserPermissions(selected?.user_id)

  const effective = useMemo(() => {
    if (!selected) return new Set<PermissionKey>()
    return resolveEffectivePermissions(
      selected.role as StaffRole,
      rolePerms.data ?? [],
      overrides.data ?? []
    )
  }, [selected, rolePerms.data, overrides.data])

  const overrideFor = useMemo(() => {
    const map = new Map<PermissionKey, OverrideEffect>()
    for (const o of overrides.data ?? []) map.set(o.permission_key, o.effect)
    return map
  }, [overrides.data])

  if (staff.isLoading || catalog.isLoading) {
    return <Skeleton className="h-96 rounded-lg" />
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find someone…"
            className="pl-8"
          />
        </div>
        <div className="flex max-h-[560px] flex-col overflow-y-auto rounded-lg border">
          {users.map((u) => (
            <button
              key={u.user_id}
              type="button"
              onClick={() => setSelectedId(u.user_id)}
              className={cn(
                'flex flex-col items-start gap-0.5 border-b px-3 py-2.5 text-left transition-colors last:border-b-0',
                selectedId === u.user_id ? 'bg-muted' : 'hover:bg-muted/50'
              )}
            >
              <span className="text-sm font-medium">{u.full_name}</span>
              <span className="text-xs text-muted-foreground">{u.role}</span>
            </button>
          ))}
          {users.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nobody matches that.
            </p>
          )}
        </div>
      </div>

      {!selected ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed py-24 text-sm text-muted-foreground">
          Pick someone to see and change what they can do.
        </div>
      ) : selected.role === 'admin' ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-24 text-center">
          <Lock className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium">{selected.full_name} is an admin</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Admins have every permission unconditionally, and overrides don&apos;t
            apply to them. To restrict this person, change their role first.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>{selected.full_name}</strong> inherits the{' '}
              <strong>{selected.role}</strong> role. Anything left on{' '}
              <em>Inherit</em> follows that role — so changing the role later
              carries them along. Grant and Deny pin a single permission for this
              person only, and <em>Deny always wins</em>.
            </span>
          </p>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Permission
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Setting
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {(catalog.data ?? []).map((p) => {
                  const current = overrideFor.get(p.key) ?? 'inherit'
                  const allowed = effective.has(p.key)
                  return (
                    <tr key={p.key} className="border-t">
                      <td className="px-4">
                        <PermissionLabel permission={p} />
                      </td>
                      <td className="px-4 py-2">
                        <div className="inline-flex rounded-md border p-0.5">
                          {EFFECTS.map((e) => (
                            <Tooltip key={e.value}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  disabled={setUserPerm.isPending}
                                  onClick={() =>
                                    setUserPerm.mutate({
                                      userId: selected.user_id,
                                      key: p.key,
                                      effect: e.value,
                                    })
                                  }
                                  className={cn(
                                    'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                                    current === e.value
                                      ? e.value === 'deny'
                                        ? 'bg-destructive text-white'
                                        : e.value === 'grant'
                                          ? 'bg-primary text-primary-foreground'
                                          : 'bg-muted text-foreground'
                                      : 'text-muted-foreground hover:bg-muted/60'
                                  )}
                                >
                                  {e.label}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>{e.hint}</TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 text-center">
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]',
                            allowed
                              ? 'border-success/40 bg-success/10 text-success'
                              : 'border-border bg-muted text-muted-foreground'
                          )}
                        >
                          {allowed ? 'Can' : 'Cannot'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export function AccessControlPage() {
  return (
    <PageBody>
      <PageHeader
        title="Access control"
        description="What each role can do, and how any one person differs from their role."
      />
      <Tabs defaultValue="roles" className="mt-6">
        <TabsList>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
        </TabsList>
        <TabsContent value="roles" className="mt-6">
          <RolesGrid />
        </TabsContent>
        <TabsContent value="people" className="mt-6">
          <UserOverrides />
        </TabsContent>
      </Tabs>
    </PageBody>
  )
}

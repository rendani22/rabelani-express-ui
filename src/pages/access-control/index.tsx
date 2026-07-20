import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info, Lock, ShieldAlert } from 'lucide-react'
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
import { SectionLabel } from '@/components/dispatch'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
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

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  warehouse: 'Warehouse',
  collection: 'Collection',
  driver: 'Driver',
  staff: 'Staff',
  viewer: 'Viewer',
}

/** Row hover, shared by both grids: 40 rows of checkboxes need a row to track along. */
const ROW_HOVER = 'transition-colors hover:bg-muted/40'

function SensitiveMark({ permission }: { permission: Permission }) {
  if (!permission.is_sensitive) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Amber is a surface colour, not an ink one: on warm paper `text-warning`
            measures 1.8:1, under even the 3:1 bar for a meaningful icon. Same
            per-theme flip the StatusStamp `wait` tone already uses. */}
        <span className="ml-1.5 inline-flex align-middle text-warning-foreground dark:text-warning">
          <ShieldAlert className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Sensitive: money, bulk customer data, destructive actions, or privilege.
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The raw key (`orders.delete`) is the label in machine form — showing both says
 * the same thing twice, on every row of a 40-row matrix. It stays on `title` for
 * whoever is matching a permission against a support ticket.
 */
function PermissionLabel({ permission }: { permission: Permission }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5" title={permission.key}>
      <span className="text-sm font-medium">
        {permission.label}
        <SensitiveMark permission={permission} />
      </span>
      {permission.description && (
        <span className="text-xs text-muted-foreground">{permission.description}</span>
      )}
    </div>
  )
}

/** The table header treatment shared by both grids — the convention orders and inventory set. */
const TH = 'px-4 py-2.5 font-medium'
const THEAD_ROW =
  'border-b bg-muted text-left text-[11px] uppercase tracking-wider text-muted-foreground'

/**
 * Sticky applied to the cells rather than the `<thead>`: under `border-collapse`
 * a sticky thead is unevenly supported. `bg-muted` is opaque on purpose — rows
 * scroll underneath it — and if an engine drops the collapsed border mid-scroll,
 * the tint step still separates the header, which is the elevation mechanism the
 * system uses anyway.
 */
const TH_STICKY = 'sticky top-0 z-10 bg-muted'

/** Skeleton rows inside the real table shell, so the grid doesn't jump on arrival. */
function SkeletonRows({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t">
          <td colSpan={cols} className="px-4 py-3">
            <Skeleton className="h-9 w-full" />
          </td>
        </tr>
      ))}
    </>
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

  const loading = catalog.isLoading || rolePerms.isLoading

  const grouped = new Map<string, Permission[]>()
  for (const p of catalog.data ?? []) {
    const list = grouped.get(p.feature) ?? []
    list.push(p)
    grouped.set(p.feature, list)
  }

  return (
    // No preamble: the page header says what the grid is, and the admin column's
    // lock explains itself on hover. A paragraph restating both is just a paragraph.
    <div className="flex flex-col gap-6">
      {/* Bounded height so the header has something to stick to: a 40-row × 7-role
          matrix is unreadable once the column names scroll away. */}
      <div className="max-h-[min(70vh,40rem)] overflow-auto rounded-lg border">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className={THEAD_ROW}>
              <th className={cn(TH, TH_STICKY, 'w-[38%]')}>Permission</th>
              {ROLES.map((role) => (
                <th key={role} className={cn(TH, TH_STICKY, 'px-3 text-center')}>
                  {ROLE_LABEL[role]}
                  {role === 'admin' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="ml-1 inline-flex align-middle">
                          <Lock className="size-3 opacity-60" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Admins always have everything. This column can&apos;t be changed.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows rows={8} cols={ROLES.length + 1} />
            ) : (
              [...grouped.entries()].map(([feature, permissions]) => (
                <Fragment key={feature}>
                  <tr className="border-t bg-muted/25">
                    <td colSpan={ROLES.length + 1} className="px-4 py-1.5">
                      <SectionLabel>{feature}</SectionLabel>
                    </td>
                  </tr>
                  {permissions.map((p) => (
                    <tr key={p.key} className={cn('border-t', ROW_HOVER)}>
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
                              disabled={isAdmin}
                              aria-label={`${p.label} for ${ROLE_LABEL[role]}`}
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
              ))
            )}
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

/**
 * Selected states for the override control. Cargo orange is deliberately absent:
 * it marks the action to take, and an override is a state, not an action — an
 * orange Grant on 40 rows would cost the accent its meaning. Grant is a solid ink
 * stamp; Deny borrows Returned Red, which already means blocked. Only deviations
 * from the role fill in, so a red row is rare enough to read as a signal.
 *
 * Deny sets its label in `text-background` — the canvas reversed out of the red —
 * rather than `text-destructive-foreground`, which measures 3.8:1 on dark-mode
 * destructive and fails AA at this size. The canvas passes both themes (4.7 light,
 * 4.8 dark) and matches how the system already flips warning ink per theme.
 */
const EFFECT_SELECTED: Record<OverrideEffect | 'inherit', string> = {
  inherit: 'bg-background text-foreground',
  grant: 'bg-foreground text-background',
  deny: 'bg-destructive text-background',
}

/**
 * The resolved answer, as a rectangular tag echoing the StatusStamp — not a pill,
 * and not green: green means delivered, and a permission is not a package. Ink
 * weight and the word carry it, with the tick as the second, non-colour signal.
 */
function ResultTag({ allowed }: { allowed: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[3px] border px-1.5 py-0.5 text-[10.5px] font-bold uppercase leading-none tracking-[0.09em]',
        allowed
          ? 'border-foreground/25 bg-foreground/[0.07] text-foreground'
          : 'border-border bg-muted text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'size-1 rounded-full',
          allowed ? 'bg-current opacity-70' : 'bg-current opacity-30'
        )}
        aria-hidden
      />
      {allowed ? 'Can' : 'Cannot'}
    </span>
  )
}

function OverrideRow({
  permission,
  current,
  allowed,
  personName,
  onChange,
}: {
  permission: Permission
  current: OverrideEffect | 'inherit'
  allowed: boolean
  personName: string
  onChange: (effect: OverrideEffect | 'inherit') => void
}) {
  return (
    <tr className={cn('border-t', ROW_HOVER)}>
      <td className="px-4">
        <PermissionLabel permission={permission} />
      </td>
      <td className="px-4 py-2">
        {/* Segmented control: the track/raised-selection vocabulary the TabsList
            already establishes. */}
        <div
          role="radiogroup"
          aria-label={`${permission.label} for ${personName}`}
          className="inline-flex rounded-md bg-muted p-[3px]"
        >
          {EFFECTS.map((e) => {
            const isCurrent = current === e.value
            return (
              <Tooltip key={e.value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isCurrent}
                    onClick={() => onChange(e.value)}
                    className={cn(
                      'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      isCurrent
                        ? EFFECT_SELECTED[e.value]
                        : 'text-foreground/70 hover:text-foreground'
                    )}
                  >
                    {e.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{e.hint}</TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </td>
      <td className="px-4 text-center">
        <ResultTag allowed={allowed} />
      </td>
    </tr>
  )
}

/** People tab: per-user overrides on top of the role. */
function UserOverrides() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const staff = useQuery({ queryKey: ['staff'], queryFn: listStaffProfiles })
  const catalog = usePermissionCatalog()
  const rolePerms = useRolePermissions()
  const setUserPerm = useSetUserPermission()

  const users = useMemo(
    () => (staff.data ?? []).filter((u) => u.is_active),
    [staff.data]
  )

  const options = useMemo(
    () =>
      users.map((u) => ({
        value: u.user_id,
        label: u.full_name,
        hint: ROLE_LABEL[u.role as StaffRole] ?? u.role ?? undefined,
        keywords: [u.email, u.role ?? ''],
      })),
    [users]
  )

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

  // The table only exists once someone is picked, so that's what gates the
  // skeleton. Waiting on the overrides matters: rendering early would show every
  // row as Inherit before the real settings land, which on this screen is a lie
  // rather than a flash. The catalog is usually already cached by the Roles tab,
  // but not if this tab is reached first.
  const loadingTable = !!selected && (overrides.isLoading || catalog.isLoading)

  return (
    <div className="flex flex-col gap-6">
      <Combobox
        options={options}
        value={selectedId ?? ''}
        onChange={setSelectedId}
        loading={staff.isLoading}
        placeholder="Pick someone…"
        searchPlaceholder="Find by name, email, or role…"
        emptyText="Nobody matches that."
        className="w-full max-w-xs"
      />

      {!selected ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed py-24 text-sm text-muted-foreground">
          Pick someone to see and change what they can do.
        </div>
      ) : selected.role === 'admin' ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-24 text-center">
          <Lock className="size-5 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">{selected.full_name} is an admin</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Admins have every permission unconditionally, and overrides don&apos;t
            apply to them. To restrict this person, change their role first.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* What Inherit, Grant, and Deny each mean is on the buttons' own
              tooltips, so this says only the part nothing else can: which role is
              underneath, and the precedence rule that decides ties. */}
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="max-w-[75ch]">
              Inherits{' '}
              <strong className="font-medium text-foreground">
                {ROLE_LABEL[selected.role as StaffRole] ?? selected.role}
              </strong>
              , and follows it wherever the setting is left on Inherit.{' '}
              <strong className="font-medium text-foreground">Deny always wins.</strong>
            </span>
          </p>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className={THEAD_ROW}>
                  <th className={TH}>Permission</th>
                  <th className={TH}>Setting</th>
                  <th className={cn(TH, 'text-center')}>Result</th>
                </tr>
              </thead>
              <tbody>
                {loadingTable ? (
                  <SkeletonRows rows={8} cols={3} />
                ) : (
                  (catalog.data ?? []).map((p) => (
                    <OverrideRow
                      key={p.key}
                      permission={p}
                      current={overrideFor.get(p.key) ?? 'inherit'}
                      allowed={effective.has(p.key)}
                      personName={selected.full_name}
                      onChange={(effect) =>
                        setUserPerm.mutate({
                          userId: selected.user_id,
                          key: p.key,
                          effect,
                        })
                      }
                    />
                  ))
                )}
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

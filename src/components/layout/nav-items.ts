import {
  Boxes,
  ClipboardList,
  Contact,
  LayoutDashboard,
  type LucideIcon,
  Mail,
  MapPin,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserCog,
} from 'lucide-react'
import type { PermissionKey } from '@/lib/api/permissions'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  keywords?: string[]
  /**
   * Permission required to see this destination. Items the user cannot reach are
   * hidden outright — a driver's sidebar should show a driver's app, not a wall
   * of pages that reject them. (Actions *inside* a page they can see are
   * disabled-with-a-tooltip instead; see PermissionButton.)
   *
   * Undefined means "everyone" — only Settings, which is local preferences.
   */
  permission?: PermissionKey
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/** Primary navigation, grouped for spatial rhythm. Settings is pinned separately. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, keywords: ['home', 'overview'], permission: 'dashboard.ops.view' },
      { label: 'Global PO', to: '/purchase-orders', icon: ClipboardList, keywords: ['purchase orders'], permission: 'purchase_orders.read' },
      { label: 'Orders', to: '/orders', icon: ShoppingCart, keywords: ['packages', 'parcels', 'waybills'], permission: 'orders.read' },
      { label: 'Inventory', to: '/inventory', icon: Boxes, keywords: ['stock', 'items', 'movements'], permission: 'inventory.read' },
      { label: 'Drivers', to: '/drivers', icon: Truck, keywords: ['fleet', 'map', 'couriers'], permission: 'drivers.read' },
    ],
  },
  {
    label: 'Directory',
    items: [
      { label: 'Customers', to: '/customers', icon: Contact, keywords: ['receivers', 'clients', 'companies', 'buyers', 'end users', 'runners', 'portal', 'invite'], permission: 'customers.read' },
      { label: 'Users', to: '/user-management', icon: UserCog, keywords: ['staff', 'team', 'admins'], permission: 'users.read' },
      { label: 'Locations', to: '/delivery-locations', icon: MapPin, keywords: ['depots', 'collection points'], permission: 'locations.read' },
      { label: 'Templates', to: '/email-templates', icon: Mail, keywords: ['email', 'messages'], permission: 'email_templates.read' },
      { label: 'Access control', to: '/access-control', icon: ShieldCheck, keywords: ['permissions', 'policies', 'roles'], permission: 'policies.manage' },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = { label: 'Settings', to: '/settings', icon: Settings }

export const ALL_NAV_ITEMS: NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  SETTINGS_ITEM,
]

/** Filter nav down to what this user can actually open. */
export function visibleNavGroups(
  can: (key: PermissionKey) => boolean
): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((group) => group.items.length > 0)
}

export function visibleNavItems(can: (key: PermissionKey) => boolean): NavItem[] {
  return ALL_NAV_ITEMS.filter((item) => !item.permission || can(item.permission))
}

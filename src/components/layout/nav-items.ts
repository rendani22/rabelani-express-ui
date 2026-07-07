import {
  Boxes,
  ClipboardList,
  Contact,
  LayoutDashboard,
  type LucideIcon,
  Mail,
  MapPin,
  Settings,
  ShoppingCart,
  Truck,
  UserCog,
} from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  keywords?: string[]
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
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, keywords: ['home', 'overview'] },
      { label: 'Global PO', to: '/purchase-orders', icon: ClipboardList, keywords: ['purchase orders'] },
      { label: 'Orders', to: '/orders', icon: ShoppingCart, keywords: ['packages', 'parcels', 'waybills'] },
      { label: 'Inventory', to: '/inventory', icon: Boxes, keywords: ['stock', 'items', 'movements'] },
      { label: 'Drivers', to: '/drivers', icon: Truck, keywords: ['fleet', 'map', 'couriers'] },
    ],
  },
  {
    label: 'Directory',
    items: [
      { label: 'Customers', to: '/customers', icon: Contact, keywords: ['receivers', 'clients', 'companies', 'buyers', 'runners', 'portal', 'invite'] },
      { label: 'Users', to: '/user-management', icon: UserCog, keywords: ['staff', 'team', 'admins'] },
      { label: 'Locations', to: '/delivery-locations', icon: MapPin, keywords: ['depots', 'collection points'] },
      { label: 'Templates', to: '/email-templates', icon: Mail, keywords: ['email', 'messages'] },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = { label: 'Settings', to: '/settings', icon: Settings }

export const ALL_NAV_ITEMS: NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  SETTINGS_ITEM,
]

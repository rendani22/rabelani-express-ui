import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/components/protected-route'
import { StaffRoute, CustomerRoute, HomeRedirect } from '@/components/role-routes'
import { AppLayout } from '@/components/layout/app-layout'
import { CustomerLayout } from '@/components/layout/customer-layout'
import { Welcome } from '@/pages/welcome'
import { Login } from '@/pages/login'
import { AcceptInvite } from '@/pages/accept-invite'
import { ResetPassword } from '@/pages/reset-password'
import { MyPackagesPage } from '@/pages/my-packages'
import { DashboardPage } from '@/pages/dashboard'
import { OrdersPage } from '@/pages/orders'
import { CompletedOrdersPage } from '@/pages/orders/completed-orders'
import { DeletedOrdersPage } from '@/pages/orders/deleted-orders'
import { BulkPodDownloadsPage } from '@/pages/pods/bulk-pod-downloads'
import { InventoryPage } from '@/pages/inventory'
import { RecentMovementsPage } from '@/pages/inventory/recent-movements'
import { PurchaseOrdersPage } from '@/pages/purchase-orders'
import { DriversPage } from '@/pages/drivers'
import { CustomersPage } from '@/pages/directory/customers'
import { UsersPage } from '@/pages/directory/users'
import { LocationsPage } from '@/pages/directory/locations'
import { EmailTemplatesPage } from '@/pages/directory/email-templates'
import { SettingsPage } from '@/pages/settings'
import { AccessControlPage } from '@/pages/access-control'
import { StyleGuide } from '@/pages/style-guide'
import { PermissionRoute } from '@/components/permission-route'

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/login" element={<Login />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute />}>
        {/* Staff console */}
        <Route element={<StaffRoute />}>
          <Route path="/style-guide" element={<StyleGuide />} />
          {/*
            Each staff page is gated on the permission that makes it useful.
            Settings is ungated — it's local preferences, not data.
            Deep-linking without the permission renders an explanatory screen
            rather than redirecting, so a shared link explains itself.
          */}
          <Route element={<AppLayout />}>
            <Route element={<PermissionRoute permission="dashboard.ops.view" what="The dashboard" />}>
              <Route path="/dashboard" element={<DashboardPage />} />
            </Route>
            <Route element={<PermissionRoute permission="purchase_orders.read" what="Purchase orders" />}>
              <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
            </Route>
            <Route element={<PermissionRoute permission="orders.read" what="Orders" />}>
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/completed" element={<CompletedOrdersPage />} />
            </Route>
            <Route element={<PermissionRoute permission="orders.restore" what="The recycle bin" />}>
              <Route path="/orders/deleted" element={<DeletedOrdersPage />} />
            </Route>
            <Route element={<PermissionRoute permission="pod.export_bulk" what="Bulk POD downloads" />}>
              <Route path="/pods/bulk-downloads" element={<BulkPodDownloadsPage />} />
            </Route>
            <Route element={<PermissionRoute permission="inventory.read" what="Inventory" />}>
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/inventory/movements" element={<RecentMovementsPage />} />
            </Route>
            <Route element={<PermissionRoute permission="drivers.read" what="Drivers" />}>
              <Route path="/drivers" element={<DriversPage />} />
            </Route>
            <Route element={<PermissionRoute permission="customers.read" what="Customers" />}>
              <Route path="/customers" element={<CustomersPage />} />
            </Route>
            <Route element={<PermissionRoute permission="users.read" what="User management" />}>
              <Route path="/user-management" element={<UsersPage />} />
            </Route>
            <Route element={<PermissionRoute permission="locations.read" what="Delivery locations" />}>
              <Route path="/delivery-locations" element={<LocationsPage />} />
            </Route>
            <Route element={<PermissionRoute permission="email_templates.read" what="Email templates" />}>
              <Route path="/email-templates" element={<EmailTemplatesPage />} />
            </Route>
            <Route element={<PermissionRoute permission="policies.manage" what="Access control" />}>
              <Route path="/access-control" element={<AccessControlPage />} />
            </Route>
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* Customer portal */}
        <Route element={<CustomerRoute />}>
          <Route element={<CustomerLayout />}>
            <Route path="/my-packages" element={<MyPackagesPage />} />
          </Route>
        </Route>

        {/* Route to the right home for the principal */}
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
  )
}

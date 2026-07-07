import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/components/protected-route'
import { StaffRoute, CustomerRoute, HomeRedirect } from '@/components/role-routes'
import { AppLayout } from '@/components/layout/app-layout'
import { CustomerLayout } from '@/components/layout/customer-layout'
import { Login } from '@/pages/login'
import { AcceptInvite } from '@/pages/accept-invite'
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
import { StyleGuide } from '@/pages/style-guide'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/style-guide" element={<StyleGuide />} />

      <Route element={<ProtectedRoute />}>
        {/* Staff console */}
        <Route element={<StaffRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/completed" element={<CompletedOrdersPage />} />
            <Route path="/orders/deleted" element={<DeletedOrdersPage />} />
            <Route path="/pods/bulk-downloads" element={<BulkPodDownloadsPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/inventory/movements" element={<RecentMovementsPage />} />
            <Route path="/drivers" element={<DriversPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/user-management" element={<UsersPage />} />
            <Route path="/delivery-locations" element={<LocationsPage />} />
            <Route path="/email-templates" element={<EmailTemplatesPage />} />
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

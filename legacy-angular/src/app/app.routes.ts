import { Routes } from '@angular/router';
import { authGuard } from './core';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then(m => m.LoginComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard),
    canActivate: [authGuard],
  },
  {
    path: 'orders',
    loadComponent: () => import('./features/orders/orders').then(m => m.OrdersComponent),
    canActivate: [authGuard],
  },
  {
    path: 'pods/bulk-downloads',
    loadComponent: () => import('./features/pods/bulk-pod-downloads').then(m => m.BulkPodDownloadsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'orders/completed',
    loadComponent: () => import('./features/orders/completed-orders/completed-orders.component').then(m => m.CompletedOrdersComponent),
    canActivate: [authGuard],
  },
  {
    path: 'orders/deleted',
    loadComponent: () =>
      import('./features/orders/deleted-orders/deleted-orders.component').then(
        m => m.DeletedOrdersComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'drivers',
    loadComponent: () => import('./features/drivers/drivers').then(m => m.DriversComponent),
    canActivate: [authGuard],
  },
  {
    path: 'user-management',
    loadComponent: () => import('./features/user-management/user-management').then(m => m.UserManagementComponent),
    canActivate: [authGuard],
  },
  {
    path: 'customers',
    loadComponent: () => import('./features/customer-management/customer-management').then(m => m.CustomerManagementComponent),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings').then(m => m.SettingsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'inventory',
    loadComponent: () => import('./features/inventory/inventory').then(m => m.InventoryComponent),
    canActivate: [authGuard],
  },
  {
    path: 'inventory/movements',
    loadComponent: () =>
      import('./features/inventory/recent-movements/recent-movements').then(
        m => m.RecentMovementsComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'delivery-locations',
    loadComponent: () => import('./features/delivery-locations/delivery-locations').then(m => m.DeliveryLocationsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'email-templates',
    loadComponent: () => import('./features/email-templates/email-templates').then(m => m.EmailTemplatesComponent),
    canActivate: [authGuard],
  },
  {
    path: 'purchase-orders',
    loadComponent: () => import('./features/purchase-orders/purchase-orders').then(m => m.PurchaseOrdersComponent),
    canActivate: [authGuard],
  },
];

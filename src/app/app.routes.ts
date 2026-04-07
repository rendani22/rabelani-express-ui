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
    path: 'delivery-locations',
    loadComponent: () => import('./features/delivery-locations/delivery-locations').then(m => m.DeliveryLocationsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'email-templates',
    loadComponent: () => import('./features/email-templates/email-templates').then(m => m.EmailTemplatesComponent),
    canActivate: [authGuard],
  },
];

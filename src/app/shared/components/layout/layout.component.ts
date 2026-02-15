import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SidebarComponent, NavItem } from '../sidebar';
import { HeaderComponent } from '../header';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarComponent, HeaderComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent {
  navItems: NavItem[] = [
    { icon: 'layout-dashboard', label: 'Dashboard', active: true, routerLink: '/dashboard' },
    { icon: 'shopping-cart', label: 'Orders', active: false, routerLink: '/orders' },
    { icon: 'orders', label: 'Inventory', active: false, routerLink: '/inventory' },
    { icon: 'truck', label: 'Drivers', active: false, routerLink: '/drivers' },
    { icon: 'users', label: 'Customers', active: false, routerLink: '/customers' },
    { icon: 'settings', label: 'Settings', active: false, routerLink: '/settings' },
    { icon: 'log-out', label: 'Logout', active: false, routerLink: '/logout' }
  ];
}


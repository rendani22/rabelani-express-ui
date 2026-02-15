import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
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
  private readonly router = inject(Router);

  sidebarOpen = false;

  /** Current active route path */
  private readonly currentRoute = signal(this.router.url);

  /** Base nav items configuration */
  private readonly baseNavItems: NavItem[] = [
    { icon: 'layout-dashboard', label: 'Dashboard', routerLink: '/dashboard' },
    { icon: 'shopping-cart', label: 'Orders', routerLink: '/orders' },
    { icon: 'orders', label: 'Inventory', routerLink: '/inventory' },
    { icon: 'truck', label: 'Drivers', routerLink: '/drivers' },
    { icon: 'users', label: 'Customers', routerLink: '/customers' },
    { icon: 'users', label: 'Users', routerLink: '/user-management' },
    { icon: 'settings', label: 'Settings', routerLink: '/settings' },
  ];

  /** Nav items with active state computed from current route */
  readonly navItems = computed<NavItem[]>(() => {
    const currentPath = this.currentRoute();
    return this.baseNavItems.map(item => ({
      ...item,
      active: item.routerLink ? currentPath.startsWith(item.routerLink) : false
    }));
  });

  constructor() {
    // Listen to route changes and update current route
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => {
        this.currentRoute.set(event.urlAfterRedirects);
      });
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }
}


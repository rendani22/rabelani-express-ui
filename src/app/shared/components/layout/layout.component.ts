import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { NavbarComponent } from '../navbar/navbar.component';
import { NavItem } from '../nav-item/nav-item.component';
import {HeaderComponent} from '../header/header.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarComponent, HeaderComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent {
  navItems: NavItem[] = [
    { icon: 'grid', label: 'Dashboard', active: true, routerLink: '/dashboard' },
    { icon: 'shopping-cart', label: 'Orders', active: false, routerLink: '/orders' },
    { icon: 'box', label: 'Inventory', active: false, routerLink: '/inventory' },
    { icon: 'truck', label: 'Drivers', active: false, routerLink: '/drivers' },
    { icon: 'users', label: 'Customers', active: false, routerLink: '/customers' },
    { icon: 'settings', label: 'Settings', active: false, routerLink: '/settings' },
    { icon: 'log-out', label: 'Logout', active: false, routerLink: '/logout' }
  ];
}


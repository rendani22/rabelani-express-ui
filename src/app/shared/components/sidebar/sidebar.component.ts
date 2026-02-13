import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavItemComponent, NavItem } from '../nav-item/nav-item.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, NavItemComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent {
  @Input() logoText = 'LogiTrack';
  @Input() navLabel = 'Admin tools';
  @Input() navItems: NavItem[] = [];
}

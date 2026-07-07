import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavItemComponent } from '../nav-item';
import { NavItem } from './sidebar.models';

/**
 * SidebarComponent provides a navigation sidebar with logo, nav items, and optional promo section.
 *
 * @example
 * <app-sidebar
 *   logoText="MyApp"
 *   navLabel="Navigation"
 *   [navItems]="navItems"
 *   promoPrice="$99"
 *   promoPeriod="/mo"
 *   promoText="Upgrade to Pro!"
 *   promoButtonText="Get Started">
 * </app-sidebar>
 */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, NavItemComponent],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent {
  /** Text to display in the logo section */
  @Input() logoText = 'Rabelani Express';

  /** Label for the navigation section */
  @Input() navLabel = '';

  /** Array of navigation items to display */
  @Input() navItems: NavItem[] = [];

  /** Emits when a nav item is clicked */
  @Output() navItemClick = new EventEmitter<NavItem>();

  /** Emits when the close button is clicked (mobile) */
  @Output() closeSidebar = new EventEmitter<void>();


  /**
   * Handles navigation item click events
   * @param item The clicked navigation item
   */
  onNavItemClick(item: NavItem): void {
    if (item.onClick) {
      item.onClick();
    }
    this.navItemClick.emit(item);
  }

  /**
   * Handles close sidebar button click (mobile)
   */
  onCloseSidebar(): void {
    this.closeSidebar.emit();
  }
}



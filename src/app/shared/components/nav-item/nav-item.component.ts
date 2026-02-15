import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerHome,
  tablerUsers,
  tablerSettings,
  tablerPackage,
  tablerTruck,
  tablerChartBar,
  tablerCalendar,
  tablerMail,
  tablerFile,
  tablerFolder,
  tablerHelp,
  tablerCircle,
  tablerLayoutDashboard,
  tablerShoppingCart,
  tablerLogout,
  tablerBox,
} from '@ng-icons/tabler-icons';

/**
 * NavItemComponent displays a navigation item with an icon and label.
 * Supports both router navigation and custom click handlers.
 *
 * @example
 * <app-nav-item
 *   icon="home"
 *   label="Dashboard"
 *   [active]="true"
 *   routerLink="/dashboard"
 *   (itemClick)="onNavItemClick()">
 * </app-nav-item>
 */
@Component({
  selector: 'app-nav-item',
  standalone: true,
  imports: [CommonModule, RouterModule, NgIcon],
  viewProviders: [
    provideIcons({
      tablerHome,
      tablerUsers,
      tablerSettings,
      tablerPackage,
      tablerTruck,
      tablerChartBar,
      tablerCalendar,
      tablerMail,
      tablerFile,
      tablerFolder,
      tablerHelp,
      tablerCircle,
      tablerLayoutDashboard,
      tablerShoppingCart,
      tablerLogout,
      tablerBox,
    }),
  ],
  templateUrl: './nav-item.component.html',
  styleUrls: ['./nav-item.component.scss'],
})
export class NavItemComponent {
  /** Icon identifier for the navigation item */
  @Input() icon = '';

  /** Display label for the navigation item */
  @Input() label = '';

  /** Whether the navigation item is currently active */
  @Input() active = false;

  /** Optional router link for navigation */
  @Input() routerLink: string | null = null;

  /** Emits when the navigation item is clicked */
  @Output() readonly itemClick = new EventEmitter<void>();

  /** Map of simple icon names to Tabler icon names */
  private readonly iconMap: Record<string, string> = {
    home: 'tablerHome',
    users: 'tablerUsers',
    settings: 'tablerSettings',
    package: 'tablerPackage',
    truck: 'tablerTruck',
    chart: 'tablerChartBar',
    calendar: 'tablerCalendar',
    mail: 'tablerMail',
    file: 'tablerFile',
    folder: 'tablerFolder',
    help: 'tablerHelp',
    'layout-dashboard': 'tablerLayoutDashboard',
    'shopping-cart': 'tablerShoppingCart',
    'log-out': 'tablerLogout',
    orders: 'tablerBox',
  };

  /** Get the Tabler icon name for the current icon */
  get tablerIcon(): string {
    return this.iconMap[this.icon] || 'tablerCircle';
  }

  /**
   * Handles click events on the navigation item
   */
  onItemClick(): void {
    this.itemClick.emit();
  }
}


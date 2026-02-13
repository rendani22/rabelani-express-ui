import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../../core';
import { HeaderService } from './header.service';
import {
  HelpLink,
  HeaderNotification,
  RecentPage,
  RecentSearch,
  UserMenuItem,
} from './header.models';
import {
  DEFAULT_HELP_LINKS,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_RECENT_PAGES,
  DEFAULT_RECENT_SEARCHES,
  DEFAULT_USER_MENU_ITEMS,
  DEFAULT_USER_ROLE,
} from './header.constants';

/**
 * Header component providing navigation controls, search, notifications,
 * user menu, and theme toggle functionality.
 *
 * @example
 * <app-header
 *   [(sidebarOpen)]="sidebarOpen"
 *   [notifications]="customNotifications">
 * </app-header>
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
})
export class HeaderComponent {
  private readonly headerService = inject(HeaderService);
  private readonly themeService = inject(ThemeService);

  // Sidebar state
  @Input() sidebarOpen = false;
  @Output() readonly sidebarOpenChange = new EventEmitter<boolean>();

  // User role
  @Input() userRole = DEFAULT_USER_ROLE;

  // Configurable data inputs
  @Input() recentSearches: readonly RecentSearch[] = DEFAULT_RECENT_SEARCHES;
  @Input() recentPages: readonly RecentPage[] = DEFAULT_RECENT_PAGES;
  @Input() notifications: readonly HeaderNotification[] = DEFAULT_NOTIFICATIONS;
  @Input() helpLinks: readonly HelpLink[] = DEFAULT_HELP_LINKS;
  @Input() userMenuItems: readonly UserMenuItem[] = DEFAULT_USER_MENU_ITEMS;

  // Computed properties from service
  readonly userName = this.headerService.userName;
  readonly userEmail = this.headerService.userEmail;
  readonly userAvatarSrc = this.headerService.userAvatarSrc;

  // Dropdown state from service
  readonly searchOpen = this.headerService.isSearchOpen;
  readonly notificationsOpen = this.headerService.isNotificationsOpen;
  readonly infoOpen = this.headerService.isInfoOpen;
  readonly userDropdownOpen = this.headerService.isUserDropdownOpen;

  // Theme state from service
  readonly darkMode = this.themeService.isDarkMode;

  // Search query binding
  searchQuery = '';

  // Sidebar methods
  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    this.sidebarOpenChange.emit(this.sidebarOpen);
  }

  // Search methods
  openSearch(): void {
    this.headerService.openDropdown('search');
  }

  closeSearch(): void {
    this.searchQuery = '';
    this.headerService.closeDropdown('search');
  }

  onSearchSubmit(event: Event): void {
    event.preventDefault();
    this.headerService.performSearch(this.searchQuery);
    this.searchQuery = '';
  }

  // Dropdown toggle methods
  toggleNotifications(): void {
    this.headerService.toggleDropdown('notifications');
  }

  toggleInfo(): void {
    this.headerService.toggleDropdown('info');
  }

  toggleUserDropdown(): void {
    this.headerService.toggleDropdown('user');
  }

  closeAllDropdowns(): void {
    this.headerService.closeAllDropdowns();
  }

  // Theme methods
  toggleDarkMode(): void {
    this.themeService.toggleTheme();
  }

  // User menu methods
  onUserMenuClick(item: UserMenuItem): void {
    if (item.text === 'Sign Out') {
      this.handleSignOut();
      return;
    }
    this.headerService.closeAllDropdowns();
  }

  async handleSignOut(): Promise<void> {
    await this.headerService.signOut();
  }
}

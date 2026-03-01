import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerMenu2,
  tablerZoom,
  tablerBell,
  tablerInfoCircle,
  tablerSun,
  tablerMoon,
  tablerChevronDown,
  tablerSettings,
  tablerLogout,
  tablerFile,
  tablerClock,
  tablerSend,
  tablerBook,
  tablerHeadset,
} from '@ng-icons/tabler-icons';
import { ThemeService } from '../../../core';
import { HeaderService } from './header.service';
import { HelpLink, HeaderNotification, RecentPage, RecentSearch } from './header.models';
import {
  DEFAULT_HELP_LINKS,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_RECENT_PAGES,
  DEFAULT_RECENT_SEARCHES,
} from './header.constants';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIcon],
  viewProviders: [
    provideIcons({
      tablerMenu2, tablerZoom, tablerBell, tablerInfoCircle,
      tablerSun, tablerMoon, tablerChevronDown,
      tablerSettings, tablerLogout,
      tablerFile, tablerClock, tablerSend, tablerBook, tablerHeadset,
    }),
  ],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
})
export class HeaderComponent {
  private readonly headerService = inject(HeaderService);
  private readonly themeService = inject(ThemeService);

  @Input() sidebarOpen = false;
  @Output() readonly sidebarOpenChange = new EventEmitter<boolean>();

  @Input() recentSearches: readonly RecentSearch[] = DEFAULT_RECENT_SEARCHES;
  @Input() recentPages: readonly RecentPage[] = DEFAULT_RECENT_PAGES;
  @Input() notifications: readonly HeaderNotification[] = DEFAULT_NOTIFICATIONS;
  @Input() helpLinks: readonly HelpLink[] = DEFAULT_HELP_LINKS;

  readonly userName = this.headerService.userName;
  readonly userEmail = this.headerService.userEmail;
  readonly userAvatarSrc = this.headerService.userAvatarSrc;

  readonly searchOpen = this.headerService.isSearchOpen;
  readonly notificationsOpen = this.headerService.isNotificationsOpen;
  readonly infoOpen = this.headerService.isInfoOpen;
  readonly userDropdownOpen = this.headerService.isUserDropdownOpen;

  readonly darkMode = this.themeService.isDarkMode;

  searchQuery = '';

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    this.sidebarOpenChange.emit(this.sidebarOpen);
  }

  openSearch(): void { this.headerService.openDropdown('search'); }

  closeSearch(): void {
    this.searchQuery = '';
    this.headerService.closeDropdown('search');
  }

  onSearchSubmit(event: Event): void {
    event.preventDefault();
    this.headerService.performSearch(this.searchQuery);
    this.searchQuery = '';
  }

  toggleNotifications(): void { this.headerService.toggleDropdown('notifications'); }
  toggleInfo(): void { this.headerService.toggleDropdown('info'); }
  toggleUserDropdown(): void { this.headerService.toggleDropdown('user'); }
  closeAllDropdowns(): void { this.headerService.closeAllDropdowns(); }
  toggleDarkMode(): void { this.themeService.toggleTheme(); }

  onSettings(event: Event): void {
    event.stopPropagation();
    this.headerService.closeAllDropdowns();
    // TODO: navigate to settings
  }

  async onSignOut(event: Event): Promise<void> {
    console.log('Signing out user...');
    event.stopPropagation();
    await this.headerService.signOut();
  }
}

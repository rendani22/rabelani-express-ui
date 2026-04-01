import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerMenu2,
  tablerBell,
  tablerInfoCircle,
  tablerSun,
  tablerMoon,
  tablerChevronDown,
  tablerSettings,
  tablerLogout,
  tablerSend,
  tablerBook,
  tablerHeadset,
} from '@ng-icons/tabler-icons';
import { ThemeService } from '../../../core';
import { HeaderService } from './header.service';
import { HelpLink, HeaderNotification } from './header.models';
import {
  DEFAULT_HELP_LINKS,
  DEFAULT_NOTIFICATIONS,
} from './header.constants';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, NgIcon],
  viewProviders: [
    provideIcons({
      tablerMenu2, tablerBell, tablerInfoCircle,
      tablerSun, tablerMoon, tablerChevronDown,
      tablerSettings, tablerLogout,
      tablerSend, tablerBook, tablerHeadset,
    }),
  ],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
})
export class HeaderComponent {
  private readonly headerService = inject(HeaderService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);

  @Input() sidebarOpen = false;
  @Output() readonly sidebarOpenChange = new EventEmitter<boolean>();

  @Input() notifications: readonly HeaderNotification[] = DEFAULT_NOTIFICATIONS;
  @Input() helpLinks: readonly HelpLink[] = DEFAULT_HELP_LINKS;

  readonly userName = this.headerService.userName;
  readonly userEmail = this.headerService.userEmail;
  readonly userAvatarSrc = this.headerService.userAvatarSrc;

  readonly notificationsOpen = this.headerService.isNotificationsOpen;
  readonly infoOpen = this.headerService.isInfoOpen;
  readonly userDropdownOpen = this.headerService.isUserDropdownOpen;

  readonly darkMode = this.themeService.isDarkMode;


  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    this.sidebarOpenChange.emit(this.sidebarOpen);
  }


  toggleNotifications(): void { this.headerService.toggleDropdown('notifications'); }
  toggleInfo(): void { this.headerService.toggleDropdown('info'); }
  toggleUserDropdown(): void { this.headerService.toggleDropdown('user'); }
  closeAllDropdowns(): void { this.headerService.closeAllDropdowns(); }
  toggleDarkMode(): void { this.themeService.toggleTheme(); }

  onSettings(event: Event): void {
    event.stopPropagation();
    this.headerService.closeAllDropdowns();
    this.router.navigate(['/settings']);
  }

  async onSignOut(event: Event): Promise<void> {
    console.log('Signing out user...');
    event.stopPropagation();
    await this.headerService.signOut();
  }
}

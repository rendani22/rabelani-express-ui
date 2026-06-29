import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
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
  tablerHelp,
  tablerX,
  tablerChecks,
} from '@ng-icons/tabler-icons';
import { ThemeService, AppNotification, formatRelativeTime } from '../../../core';
import { throwTestError } from '../../../core/utils/sentry.utils';
import { SupabaseService } from '../../services/supabase.service';
import { NotificationCenterService } from '../../services/notification-center.service';
import { environment } from '../../../../environments/environment';
import { HeaderService } from './header.service';
import { HelpLink } from './header.models';
import { DEFAULT_HELP_LINKS } from './header.constants';
import { DocsModalComponent } from '../modals/docs-modal/docs-modal.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, NgIcon, DocsModalComponent],
  viewProviders: [
    provideIcons({
      tablerMenu2, tablerBell, tablerInfoCircle,
      tablerSun, tablerMoon, tablerChevronDown,
      tablerSettings, tablerLogout,
      tablerSend, tablerBook, tablerHelp,
      tablerX, tablerChecks,
    }),
  ],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
})
export class HeaderComponent {
  private readonly headerService = inject(HeaderService);
  private readonly notificationCenter = inject(NotificationCenterService);
  private readonly themeService = inject(ThemeService);
  private readonly supabaseService = inject(SupabaseService);
  private readonly router = inject(Router);

  @Input() sidebarOpen = false;
  @Output() readonly sidebarOpenChange = new EventEmitter<boolean>();

  @Input() helpLinks: readonly HelpLink[] = DEFAULT_HELP_LINKS;

  readonly userName = this.headerService.userName;
  readonly userEmail = this.headerService.userEmail;
  readonly userAvatarSrc = this.headerService.userAvatarSrc;

  readonly notificationsOpen = this.headerService.isNotificationsOpen;
  readonly infoOpen = this.headerService.isInfoOpen;
  readonly userDropdownOpen = this.headerService.isUserDropdownOpen;

  readonly darkMode = this.themeService.isDarkMode;

  /** Per-user notification feed (header bell) */
  readonly notifications = this.notificationCenter.notifications;
  readonly unreadCount = this.notificationCenter.unreadCount;
  readonly hasUnread = this.notificationCenter.hasUnread;
  readonly notificationsLoading = this.notificationCenter.isLoading;

  /** Controls the documentation modal */
  readonly docsOpen = signal(false);

  readonly isDev = !environment.production;
  readonly appEnvironment = environment.appEnvironment;
  readonly environmentBadge = this.getEnvironmentBadge();

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    this.sidebarOpenChange.emit(this.sidebarOpen);
  }

  toggleNotifications(): void { this.headerService.toggleDropdown('notifications'); }
  toggleInfo(): void { this.headerService.toggleDropdown('info'); }
  toggleUserDropdown(): void { this.headerService.toggleDropdown('user'); }
  closeAllDropdowns(): void { this.headerService.closeAllDropdowns(); }
  toggleDarkMode(): void { this.themeService.toggleTheme(); }

  // Helper used by a small test button in the header to trigger a thrown error
  // This bubbles to Angular's global ErrorHandler (and Sentry integration) for testing.
  testSentry(): never {
    return throwTestError();
  }

  private getEnvironmentBadge(): string | null {
    switch (environment.appEnvironment) {
      case 'local':
        return 'LOCAL';
      case 'int':
        return 'INT';
      default:
        return null;
    }
  }

  // Calls the create-package Edge Function with malformed JSON to trigger a
  // server-side error that should be captured by the Edge Function Sentry
  // reporting added in the backend. Only available in development mode.
  async testEdgeSentry(): Promise<void> {
    try {
      const { data } = await this.supabaseService.client.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        alert('No active session / access token available to authenticate the test request.');
        return;
      }

      const functionsUrl = environment.supabase.functionsUrl;
      const url = `${functionsUrl}/create-package`;

      // Intentionally send malformed JSON so the edge function's req.json() throws
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: '{"receiver_email":"sentry-test@example.com"' // missing closing brace
      });

      const text = await res.text();
      // Provide quick feedback to the user — the server should return 500 and Sentry should capture the error.
      alert(`Edge function responded: ${res.status}\n\n${text}`);
    } catch (e) {
      console.error('Edge Sentry test failed:', e);
      alert('Edge Sentry test failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  openDocs(event: Event): void {
    event.preventDefault();
    this.headerService.closeAllDropdowns();
    this.docsOpen.set(true);
  }

  closeDocs(): void {
    this.docsOpen.set(false);
  }

  onSettings(event: Event): void {
    event.stopPropagation();
    this.headerService.closeAllDropdowns();
    this.router.navigate(['/settings']);
  }

  /** Relative "time ago" label for a notification. */
  notificationTime(notification: AppNotification): string {
    return formatRelativeTime(notification.createdAt);
  }

  /** ngFor identity — keep DOM rows stable as the feed updates. */
  trackNotification(_index: number, notification: AppNotification): string {
    return notification.id;
  }

  onNotificationClick(event: Event, notification: AppNotification): void {
    event.preventDefault();
    void this.notificationCenter.markAsRead(notification.id);
    this.headerService.closeAllDropdowns();
    void this.router.navigateByUrl(notification.href);
  }

  /** Dismiss (delete) a single notification without navigating. */
  onDismissNotification(event: Event, notification: AppNotification): void {
    event.preventDefault();
    event.stopPropagation();
    void this.notificationCenter.dismiss(notification.id);
  }

  onMarkAllRead(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    void this.notificationCenter.markAllAsRead();
  }

  onViewAllOrders(event: Event): void {
    event.preventDefault();
    void this.notificationCenter.markAllAsRead();
    this.headerService.closeAllDropdowns();
    void this.router.navigate(['/orders']);
  }

  async onSignOut(event: Event): Promise<void> {
    console.log('Signing out user...');
    event.stopPropagation();
    await this.headerService.signOut();
  }
}

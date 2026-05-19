import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerSun,
  tablerMoon,
  tablerRefresh,
  tablerAdjustments,
  tablerPackage,
  tablerTruck,
  tablerUser,
  tablerInfoCircle,
  tablerTrash,
  tablerCheck,
  tablerLogout,
  tablerDeviceFloppy,
  tablerHelp,
  tablerRoute,
} from '@ng-icons/tabler-icons';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { ThemeService, PACKAGE_STATUS } from '../../core';
import { SettingsService, AppSettings, DefaultOrdersFilter, DefaultDriversView } from '../../core';
import { AuthService } from '../../core';
import { OnboardingTourService } from '../../core';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { APP_VERSION } from '../../../environments/version';

/**
 * SettingsComponent - Application settings and preferences page.
 *
 * Sections:
 * - Appearance: light/dark theme
 * - Data & Refresh: auto-refresh toggle and interval
 * - Orders: default status filter
 * - Drivers: default view mode
 * - Display: compact mode
 * - Account: current user info + sign out
 * - About: app info + reset settings
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, LayoutComponent, NgIcon, ConfirmDialogComponent],
  viewProviders: [
    provideIcons({
      tablerSun,
      tablerMoon,
      tablerRefresh,
      tablerAdjustments,
      tablerPackage,
      tablerTruck,
      tablerUser,
      tablerInfoCircle,
      tablerTrash,
      tablerCheck,
      tablerLogout,
      tablerDeviceFloppy,
      tablerHelp,
      tablerRoute,
    }),
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class SettingsComponent {
  private readonly themeService = inject(ThemeService);
  private readonly settingsService = inject(SettingsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly onboardingTour = inject(OnboardingTourService);

  // Theme
  readonly isDarkMode = this.themeService.isDarkMode;
  readonly currentTheme = this.themeService.currentTheme;

  // Settings
  readonly settings = this.settingsService.settings;

  // Account
  readonly currentUser = this.authService.currentUser;
  readonly userEmail = computed(() => this.currentUser()?.email ?? '');

  // Save confirmation
  readonly saved = signal(false);

  // App version (semver derived at build time from Conventional Commits)
  readonly appVersion = APP_VERSION;
  readonly commitDateFormatted = computed(() => {
    const iso = this.appVersion.commitDate;
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  });

  // Confirm reset dialog
  readonly confirmResetOpen = signal(false);

  // Local draft of settings (two-way bound in template)
  autoRefreshEnabled = this.settingsService.autoRefreshEnabled();
  autoRefreshInterval = this.settingsService.autoRefreshInterval();
  defaultOrdersFilter = this.settingsService.defaultOrdersFilter() as string;
  defaultDriversView = this.settingsService.defaultDriversView() as string;
  compactMode = this.settingsService.compactMode();

  readonly refreshIntervalOptions: { label: string; value: number }[] = [
    { label: '15 seconds', value: 15 },
    { label: '30 seconds', value: 30 },
    { label: '1 minute', value: 60 },
    { label: '2 minutes', value: 120 },
  ];

  readonly orderFilterOptions: { label: string; value: DefaultOrdersFilter }[] = [
    { label: 'All Orders', value: 'all' },
    { label: 'Draft', value: PACKAGE_STATUS.DRAFT },
    { label: 'Pending', value: PACKAGE_STATUS.PENDING },
    { label: 'Notified', value: PACKAGE_STATUS.NOTIFIED },
    { label: 'In Transit', value: PACKAGE_STATUS.IN_TRANSIT },
    { label: 'Ready for Collection', value: PACKAGE_STATUS.READY_FOR_COLLECTION },
    { label: 'Collected', value: PACKAGE_STATUS.COLLECTED },
    { label: 'Delivered', value: PACKAGE_STATUS.DELIVERED },
    { label: 'Canceled', value: PACKAGE_STATUS.RETURNED },
  ];

  onThemeChange(theme: 'light' | 'dark'): void {
    this.themeService.setTheme(theme);
  }

  onSaveSettings(): void {
    this.settingsService.updateSettings({
      autoRefreshEnabled: this.autoRefreshEnabled,
      autoRefreshInterval: this.autoRefreshInterval,
      defaultOrdersFilter: this.defaultOrdersFilter as DefaultOrdersFilter,
      defaultDriversView: this.defaultDriversView as DefaultDriversView,
      compactMode: this.compactMode,
    });

    // Show save confirmation briefly
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2500);
  }

  onResetDefaults(): void {
    this.confirmResetOpen.set(true);
  }

  onConfirmReset(): void {
    this.confirmResetOpen.set(false);
    this.settingsService.resetToDefaults();
    // Re-sync local draft from service
    this.autoRefreshEnabled = this.settingsService.autoRefreshEnabled();
    this.autoRefreshInterval = this.settingsService.autoRefreshInterval();
    this.defaultOrdersFilter = this.settingsService.defaultOrdersFilter();
    this.defaultDriversView = this.settingsService.defaultDriversView();
    this.compactMode = this.settingsService.compactMode();
  }

  onCancelReset(): void {
    this.confirmResetOpen.set(false);
  }

  async onSignOut(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigate(['/login']);
  }

  /** Re-launch the dashboard onboarding tour from step 0. */
  onRestartTour(): void {
    // Navigate to the dashboard first so all tour anchors exist in the DOM.
    this.router.navigate(['/dashboard']).then(() => {
      // Give the dashboard a moment to mount before starting the tour.
      setTimeout(() => this.onboardingTour.restart('dashboard'), 400);
    });
  }

  /** Re-launch the orders page onboarding tour from step 0. */
  onRestartOrdersTour(): void {
    this.router.navigate(['/orders']).then(() => {
      setTimeout(() => this.onboardingTour.restart('orders'), 500);
    });
  }
}

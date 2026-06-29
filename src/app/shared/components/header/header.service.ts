import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core';
import { NotificationCenterService } from '../../services/notification-center.service';
import {
  AvatarConfig,
  DEFAULT_AVATAR_CONFIG,
  DropdownType,
  GUEST_AVATAR_CONFIG,
  HeaderDropdownState,
  INITIAL_DROPDOWN_STATE,
} from './header.models';

/**
 * Base URL for UI Avatars service
 */
const UI_AVATARS_BASE_URL = 'https://ui-avatars.com/api/';

/**
 * Service responsible for header component state management and business logic.
 *
 * The notification feed itself lives in {@link NotificationCenterService}; this
 * service only owns the header chrome (dropdown state, user/avatar) and wires
 * the notifications dropdown to a refresh.
 */
@Injectable({
  providedIn: 'root',
})
export class HeaderService {
  private readonly authService = inject(AuthService);
  private readonly notificationCenter = inject(NotificationCenterService);

  /** Internal dropdown state signal */
  private readonly dropdownState = signal<HeaderDropdownState>(INITIAL_DROPDOWN_STATE);

  // Computed state accessors
  readonly isNotificationsOpen = computed(() => this.dropdownState().notifications);
  readonly isInfoOpen = computed(() => this.dropdownState().info);
  readonly isUserDropdownOpen = computed(() => this.dropdownState().user);
  readonly isAnyDropdownOpen = computed(() =>
    Object.values(this.dropdownState()).some(Boolean)
  );

  // User-related computed properties
  readonly currentUser = this.authService.currentUser;

  readonly userEmail = computed(() => {
    const user = this.currentUser();
    return user?.email ?? 'Guest User';
  });

  readonly userName = computed(() => {
    const user = this.currentUser();
    if (!user?.email) return 'Guest User';
    return this.extractNameFromEmail(user.email);
  });

  readonly userAvatarSrc = computed(() => {
    const user = this.currentUser();
    if (!user?.email) {
      return this.generateAvatarUrl(GUEST_AVATAR_CONFIG);
    }

    return this.generateAvatarUrl({
      ...DEFAULT_AVATAR_CONFIG,
      name: this.extractNameFromEmail(user.email),
    });
  });

  /**
   * Signing out tears down the notification feed and its realtime subscription.
   */
  async signOut(): Promise<void> {
    this.closeAllDropdowns();
    this.notificationCenter.dispose();
    await this.authService.signOut();
  }

  /**
   * Opens a specific dropdown and closes all others.
   * Also refreshes notifications when the notifications panel is opened.
   */
  openDropdown(type: DropdownType): void {
    this.dropdownState.set({
      ...INITIAL_DROPDOWN_STATE,
      [type]: true,
    });

    if (type === 'notifications') {
      void this.notificationCenter.load();
    }
  }

  /**
   * Closes a specific dropdown
   */
  closeDropdown(type: DropdownType): void {
    this.dropdownState.update(state => ({
      ...state,
      [type]: false,
    }));
  }

  /**
   * Toggles a specific dropdown
   */
  toggleDropdown(type: DropdownType): void {
    const isCurrentlyOpen = this.dropdownState()[type];

    if (isCurrentlyOpen) {
      this.closeDropdown(type);
    } else {
      this.openDropdown(type);
    }
  }

  /**
   * Closes all dropdowns
   */
  closeAllDropdowns(): void {
    this.dropdownState.set(INITIAL_DROPDOWN_STATE);
  }

  /**
   * Extracts a display name from an email address
   */
  private extractNameFromEmail(email: string): string {
    const localPart = email.split('@')[0] ?? '';
    return localPart || 'User';
  }

  /**
   * Generates a UI Avatars URL from configuration
   */
  private generateAvatarUrl(config: AvatarConfig): string {
    const params = new URLSearchParams({
      name: config.name,
      background: config.background,
      color: config.color,
      size: String(config.size),
    });

    return `${UI_AVATARS_BASE_URL}?${params.toString()}`;
  }
}


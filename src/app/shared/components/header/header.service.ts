import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core';
import { SupabaseService } from '../../services/supabase.service';
import { Package, PACKAGE_STATUS } from '../../../core/models/package.models';
import {
  AvatarConfig,
  DEFAULT_AVATAR_CONFIG,
  DropdownType,
  GUEST_AVATAR_CONFIG,
  HeaderDropdownState,
  HeaderNotification,
  INITIAL_DROPDOWN_STATE,
} from './header.models';

/**
 * Base URL for UI Avatars service
 */
const UI_AVATARS_BASE_URL = 'https://ui-avatars.com/api/';

/** Maximum number of notifications to load */
const MAX_NOTIFICATIONS = 10;

/**
 * Maps a package status to a notification emoji
 */
function statusEmoji(status: string): string {
  switch (status) {
    case PACKAGE_STATUS.PENDING:    return '📦';
    case PACKAGE_STATUS.NOTIFIED:   return '🔔';
    case PACKAGE_STATUS.IN_TRANSIT: return '🚚';
    case PACKAGE_STATUS.READY_FOR_COLLECTION: return '📬';
    case PACKAGE_STATUS.DELIVERED:  return '✅';
    case PACKAGE_STATUS.COLLECTED:  return '✅';
    default:                        return '📦';
  }
}

/**
 * Maps a package status to a human-readable notification title
 */
function statusTitle(status: string, reference: string): string {
  switch (status) {
    case PACKAGE_STATUS.PENDING:    return `New package created (${reference})`;
    case PACKAGE_STATUS.NOTIFIED:   return `Receiver notified (${reference})`;
    case PACKAGE_STATUS.IN_TRANSIT: return `Package picked up – in transit (${reference})`;
    case PACKAGE_STATUS.READY_FOR_COLLECTION: return `Ready for collection (${reference})`;
    case PACKAGE_STATUS.DELIVERED:  return `Package delivered (${reference})`;
    case PACKAGE_STATUS.COLLECTED:  return `Package collected (${reference})`;
    default:                        return `Package updated (${reference})`;
  }
}

/**
 * Maps a package status to a notification description
 */
function statusDescription(status: string, email: string): string {
  switch (status) {
    case PACKAGE_STATUS.PENDING:    return `A new package has been created for ${email}.`;
    case PACKAGE_STATUS.NOTIFIED:   return `The receiver (${email}) has been notified.`;
    case PACKAGE_STATUS.IN_TRANSIT: return `A driver has picked up the package for ${email}.`;
    case PACKAGE_STATUS.READY_FOR_COLLECTION: return `The package for ${email} has arrived at the collection point.`;
    case PACKAGE_STATUS.DELIVERED:  return `Package successfully delivered to ${email}.`;
    case PACKAGE_STATUS.COLLECTED:  return `Package collected by ${email}.`;
    default:                        return `Package status updated for ${email}.`;
  }
}

/**
 * Formats an ISO date string into a readable short date (e.g. "Jan 5, 2024")
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Converts a Package record into a HeaderNotification
 */
function packageToNotification(pkg: Package): HeaderNotification {
  return {
    emoji: statusEmoji(pkg.status),
    title: statusTitle(pkg.status, pkg.reference),
    description: statusDescription(pkg.status, pkg.receiver_email),
    date: formatDate(pkg.updated_at ?? pkg.created_at),
    href: '/orders',
  };
}

/**
 * Service responsible for header component state management and business logic
 */
@Injectable({
  providedIn: 'root',
})
export class HeaderService {
  private readonly authService = inject(AuthService);
  private readonly supabaseService = inject(SupabaseService);

  /** Internal dropdown state signal */
  private readonly dropdownState = signal<HeaderDropdownState>(INITIAL_DROPDOWN_STATE);

  /** Dynamic notifications loaded from the database */
  private readonly _notifications = signal<readonly HeaderNotification[]>([]);
  readonly notifications = this._notifications.asReadonly();

  /** True when there are notifications to display */
  readonly hasNotifications = computed(() => this._notifications().length > 0);

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
   * Loads the most recent package activity from Supabase and maps them to
   * header notifications.  Silently ignores errors so the header always renders.
   */
  async loadNotifications(): Promise<void> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('packages')
        .select('id, reference, receiver_email, status, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(MAX_NOTIFICATIONS);

      if (error) {
        console.warn('[HeaderService] Failed to load notifications:', error.message);
        return;
      }

      if (!data) return;

      const notifications = (data as Package[]).map(packageToNotification);
      this._notifications.set(notifications);
    } catch (err) {
      console.warn('[HeaderService] Unexpected error loading notifications:', err);
    }
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
      void this.loadNotifications();
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
   * Handles user sign out
   */
  async signOut(): Promise<void> {
    this.closeAllDropdowns();
    await this.authService.signOut();
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


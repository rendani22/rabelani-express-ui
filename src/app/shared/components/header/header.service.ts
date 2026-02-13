import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core';
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
 * Service responsible for header component state management and business logic
 */
@Injectable({
  providedIn: 'root',
})
export class HeaderService {
  private readonly authService = inject(AuthService);

  /** Internal dropdown state signal */
  private readonly dropdownState = signal<HeaderDropdownState>(INITIAL_DROPDOWN_STATE);

  /** Search query signal */
  private readonly _searchQuery = signal<string>('');

  // Computed state accessors
  readonly isSearchOpen = computed(() => this.dropdownState().search);
  readonly isNotificationsOpen = computed(() => this.dropdownState().notifications);
  readonly isInfoOpen = computed(() => this.dropdownState().info);
  readonly isUserDropdownOpen = computed(() => this.dropdownState().user);
  readonly isAnyDropdownOpen = computed(() =>
    Object.values(this.dropdownState()).some(Boolean)
  );
  readonly searchQuery = computed(() => this._searchQuery());

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
   * Opens a specific dropdown and closes all others
   */
  openDropdown(type: DropdownType): void {
    this.dropdownState.set({
      ...INITIAL_DROPDOWN_STATE,
      [type]: true,
    });
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
   * Updates the search query
   */
  setSearchQuery(query: string): void {
    this._searchQuery.set(query);
  }

  /**
   * Clears the search query and closes search modal
   */
  clearSearch(): void {
    this._searchQuery.set('');
    this.closeDropdown('search');
  }

  /**
   * Performs a search operation
   */
  performSearch(query: string): void {
    // TODO: Implement actual search logic
    console.log('Searching for:', query);
    this.clearSearch();
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



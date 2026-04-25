import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerMail,
  tablerEdit,
  tablerDotsVertical,
  tablerTrash,
  tablerEye,
  tablerUserCheck,
  tablerUserX,
  tablerPhone,
  tablerMapPin,
  tablerBriefcase
} from '@ng-icons/tabler-icons';
import { User, UserCardMenuOption, UserCardAction } from './user-card.interface';
import { ClickOutsideDirective } from './directives/click-outside.directive';
import { dropdownAnimation } from './animations/user-card.animations';

/**
 * UserCardComponent
 *
 * A reusable user card component that displays user information with actions.
 * Follows Angular best practices including:
 * - OnPush change detection for better performance
 * - Proper TypeScript typing
 * - Input/Output event handling
 * - Standalone component (Angular 14+)
 * - Accessibility features (ARIA labels, keyboard navigation)
 *
 * @example
 * <app-user-card
 *   [user]="userData"
 *   [menuOptions]="menuOptions"
 *   (actionClick)="handleAction($event)"
 * ></app-user-card>
 */
@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [CommonModule, ClickOutsideDirective, NgIcon],
  templateUrl: './user-card.component.html',
  styleUrls: ['./user-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [dropdownAnimation],
  viewProviders: [
    provideIcons({
      tablerMail,
      tablerEdit,
      tablerDotsVertical,
      tablerTrash,
      tablerEye,
      tablerUserCheck,
      tablerUserX,
      tablerPhone,
      tablerMapPin,
      tablerBriefcase
    })
  ]
})
export class UserCardComponent {
  /**
   * User data to display in the card
   */
  @Input({ required: true }) user!: User;

  /**
   * Custom menu options for the dropdown menu
   */
  @Input() menuOptions: UserCardMenuOption[] = [
    { label: 'Option 1', action: 'option1' },
    { label: 'Option 2', action: 'option2' },
    { label: 'Remove', action: 'remove', isDanger: true }
  ];

  /**
   * Enable/disable send email action
   */
  @Input() showSendEmail = true;

  /**
   * Enable/disable edit profile action
   */
  @Input() showEditProfile = true;

  /**
   * Event emitted when any action is clicked
   */
  @Output() actionClick = new EventEmitter<UserCardAction>();

  /**
   * Event emitted when the user card is clicked
   */
  @Output() cardClick = new EventEmitter<User>();

  /**
   * Track dropdown menu state
   */
  isMenuOpen = false;

  /**
   * Handle send email action
   */
  onSendEmail(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.actionClick.emit({
      userId: this.user.id,
      actionType: 'sendEmail'
    });
  }

  /**
   * Handle edit profile action
   */
  onEditProfile(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.actionClick.emit({
      userId: this.user.id,
      actionType: 'editProfile'
    });
  }

  /**
   * Handle menu option selection
   */
  onMenuOptionClick(option: UserCardMenuOption, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.isMenuOpen = false;
    this.actionClick.emit({
      userId: this.user.id,
      actionType: 'menuOption',
      menuOption: option.action
    });
  }

  /**
   * Toggle dropdown menu
   */
  toggleMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.isMenuOpen = !this.isMenuOpen;
  }

  /**
   * Close dropdown menu
   */
  closeMenu(): void {
    this.isMenuOpen = false;
  }

  /**
   * Handle user card click
   */
  onCardClick(): void {
    this.cardClick.emit(this.user);
  }

  /**
   * Handle keyboard navigation for menu
   */
  onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeMenu();
    }
  }

  /**
   * Track by function for menu options
   */
  trackByAction(index: number, item: UserCardMenuOption): string {
    return item.action;
  }

  /**
   * Tailwind classes for the decorative top banner. Uses a role-aware gradient
   * so different role types feel visually distinct.
   */
  get bannerGradientClass(): string {
    const role = (this.user?.role || '').toLowerCase();
    switch (role) {
      case 'admin':
        return 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500';
      case 'manager':
        return 'bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500';
      case 'driver':
        return 'bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500';
      case 'viewer':
        return 'bg-gradient-to-r from-slate-400 via-slate-500 to-gray-600';
      case 'staff':
      default:
        return 'bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500';
    }
  }

  /**
   * Tailwind classes for the role pill badge (color-coded per role).
   */
  get roleBadgeClass(): string {
    const role = (this.user?.role || '').toLowerCase();
    switch (role) {
      case 'admin':
        return 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30';
      case 'manager':
        return 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30';
      case 'driver':
        return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30';
      case 'viewer':
        return 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/30';
      case 'staff':
      default:
        return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30';
    }
  }
}




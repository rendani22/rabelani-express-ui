import { Component, output, ChangeDetectionStrategy, signal, input } from '@angular/core';
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
import { dropdownAnimation } from './animations/user-card.animations';

/**
 * UserCardComponent
 *
 * A reusable user card component that displays user information with actions.
 * Uses signal-based inputs and a backdrop overlay for outside-click handling
 * (works correctly with OnPush + zoneless change detection).
 */
@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [CommonModule, NgIcon],
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
  /** User data to display in the card */
  readonly user = input.required<User>();

  /** Custom menu options for the dropdown menu */
  readonly menuOptions = input<UserCardMenuOption[]>([
    { label: 'Option 1', action: 'option1' },
    { label: 'Option 2', action: 'option2' },
    { label: 'Remove', action: 'remove', isDanger: true }
  ]);

  /** Enable/disable send email action */
  readonly showSendEmail = input(true);

  /** Enable/disable edit profile action */
  readonly showEditProfile = input(true);

  /** Event emitted when any action is clicked */
  readonly actionClick = output<UserCardAction>();

  /** Event emitted when the user card is clicked */
  readonly cardClick = output<User>();

  /** Track dropdown menu state */
  readonly isMenuOpen = signal(false);

  onSendEmail(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.actionClick.emit({
      userId: this.user().id,
      actionType: 'sendEmail'
    });
  }

  onEditProfile(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.actionClick.emit({
      userId: this.user().id,
      actionType: 'editProfile'
    });
  }

  onMenuOptionClick(option: UserCardMenuOption, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.isMenuOpen.set(false);
    this.actionClick.emit({
      userId: this.user().id,
      actionType: 'menuOption',
      menuOption: option.action
    });
  }

  toggleMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.isMenuOpen.update((v) => !v);
  }

  closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  /** Close menu when the transparent backdrop is clicked. */
  onBackdropClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu();
  }

  onCardClick(): void {
    this.cardClick.emit(this.user());
  }

  onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeMenu();
    }
  }

  /** Tailwind classes for the decorative top banner. */
  get bannerGradientClass(): string {
    const role = (this.user()?.role || '').toLowerCase();
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

  /** Tailwind classes for the role pill badge. */
  get roleBadgeClass(): string {
    const role = (this.user()?.role || '').toLowerCase();
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

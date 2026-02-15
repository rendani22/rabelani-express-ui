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
  tablerMapPin
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
      tablerMapPin
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
}




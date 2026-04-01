import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { ReceiverService, ReceiverProfile } from '../../core';
import { UserCardComponent, User, UserCardAction, UserCardMenuOption } from '../../shared/components/user-card';
import { AddCustomerModalComponent } from '../../shared/components/modals';

/**
 * CustomerManagementComponent handles the display and management of receiver profiles.
 */
@Component({
  selector: 'app-customer-management',
  standalone: true,
  imports: [CommonModule, LayoutComponent, UserCardComponent, AddCustomerModalComponent],
  templateUrl: './customer-management.html',
  styleUrl: './customer-management.css'
})
export class CustomerManagementComponent implements OnInit {
  private readonly receiverService = inject(ReceiverService);

  /** Modal state for adding new customer */
  readonly addCustomerModalOpen = signal(false);

  /** List of receiver profiles */
  readonly receiverList = this.receiverService.receiverList;

  /** Loading state */
  readonly loading = this.receiverService.loading;

  /** Error state */
  readonly error = this.receiverService.error;

  /** Search query for filtering customers */
  readonly searchQuery = signal('');

  /** Menu options for active customer cards */
  readonly menuOptions: UserCardMenuOption[] = [
    { label: 'Send Email', action: 'sendEmail' },
    { label: 'Deactivate', action: 'deactivate', isDanger: true }
  ];

  /** Menu options for inactive customer cards */
  readonly inactiveMenuOptions: UserCardMenuOption[] = [
    { label: 'Send Email', action: 'sendEmail' },
    { label: 'Reactivate', action: 'reactivate' }
  ];

  /** Filtered receiver list based on search query */
  readonly filteredReceivers = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const receivers = this.receiverList();

    if (!query) return receivers;

    return receivers.filter(r =>
      r.name.toLowerCase().includes(query) ||
      r.surname.toLowerCase().includes(query) ||
      r.email.toLowerCase().includes(query) ||
      r.employee_number.toLowerCase().includes(query)
    );
  });

  ngOnInit(): void {
    this.loadReceivers();
  }

  /**
   * Load all receiver profiles.
   */
  async loadReceivers(): Promise<void> {
    await this.receiverService.loadAllReceivers();
  }

  /**
   * Handle search input change.
   */
  onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  /**
   * Map ReceiverProfile to User interface for card display.
   */
  mapReceiverToUser(receiver: ReceiverProfile): User {
    const fullName = `${receiver.name} ${receiver.surname}`;
    return {
      id: receiver.id,
      name: fullName,
      avatar: this.generateAvatarUrl(fullName),
      country: receiver.employee_number,
      countryFlag: receiver.is_active ? '✅' : '⛔',
      bio: `${receiver.email}${receiver.phone ? ' • ' + receiver.phone : ''}${receiver.is_active ? '' : ' • Inactive'}`
    };
  }

  /**
   * Get the original ReceiverProfile by ID.
   */
  getReceiverById(id: string | number): ReceiverProfile | undefined {
    return this.filteredReceivers().find(r => r.id === id);
  }

  /**
   * Get menu options based on receiver active status.
   */
  getMenuOptions(receiver: ReceiverProfile): UserCardMenuOption[] {
    return receiver.is_active ? this.menuOptions : this.inactiveMenuOptions;
  }

  /**
   * Handle user card action events.
   */
  async onCardAction(action: UserCardAction): Promise<void> {
    const receiver = this.getReceiverById(action.userId);
    if (!receiver) return;

    switch (action.actionType) {
      case 'sendEmail':
        window.location.href = `mailto:${receiver.email}`;
        break;
      case 'menuOption':
        await this.handleMenuOption(action.menuOption, receiver);
        break;
    }
  }

  /**
   * Handle menu option selection.
   */
  private async handleMenuOption(option: string | undefined, receiver: ReceiverProfile): Promise<void> {
    switch (option) {
      case 'sendEmail':
        window.location.href = `mailto:${receiver.email}`;
        break;
      case 'deactivate':
        await this.onDeactivate(receiver);
        break;
      case 'reactivate':
        await this.onReactivate(receiver);
        break;
    }
  }

  /**
   * Deactivate a receiver profile.
   */
  async onDeactivate(receiver: ReceiverProfile): Promise<void> {
    if (confirm(`Are you sure you want to deactivate ${receiver.name} ${receiver.surname}?`)) {
      await this.receiverService.deactivateReceiver(receiver.id);
    }
  }

  /**
   * Reactivate a receiver profile.
   */
  async onReactivate(receiver: ReceiverProfile): Promise<void> {
    await this.receiverService.reactivateReceiver(receiver.id);
  }

  /**
   * Open the add customer modal.
   */
  onAddCustomer(): void {
    this.addCustomerModalOpen.set(true);
  }

  /**
   * Close the add customer modal.
   */
  onCloseAddCustomerModal(): void {
    this.addCustomerModalOpen.set(false);
  }

  /**
   * Handle customer created event.
   */
  onCustomerCreated(_receiver: ReceiverProfile): void {
    // List auto-refreshes via the service
  }

  /**
   * Generate avatar URL from name.
   */
  private generateAvatarUrl(name: string): string {
    const encodedName = encodeURIComponent(name);
    return `https://ui-avatars.com/api/?name=${encodedName}&background=8b5cf6&color=fff&size=128`;
  }

  /**
   * Track by function for @for.
   */
  trackByReceiverId(index: number, receiver: ReceiverProfile): string {
    return receiver.id;
  }
}

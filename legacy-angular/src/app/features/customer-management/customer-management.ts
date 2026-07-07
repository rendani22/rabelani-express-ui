import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { ReceiverService, ReceiverProfile, Package, PACKAGE_STATUS } from '../../core';
import { UserCardComponent, User, UserCardAction, UserCardMenuOption } from '../../shared/components/user-card';
import { AddCustomerModalComponent, EditCustomerModalComponent, ManageContactsModalComponent } from '../../shared/components/modals';
import { ToastService } from '../../shared/components/toast/toast.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { SupabaseService } from '../../shared/services/supabase.service';

/**
 * CustomerManagementComponent handles the display and management of receiver profiles.
 */
@Component({
  selector: 'app-customer-management',
  standalone: true,
  imports: [CommonModule, LayoutComponent, UserCardComponent, AddCustomerModalComponent, EditCustomerModalComponent, ManageContactsModalComponent, ConfirmDialogComponent],
  templateUrl: './customer-management.html',
  styleUrl: './customer-management.css'
})
export class CustomerManagementComponent implements OnInit {
  private readonly receiverService = inject(ReceiverService);
  private readonly toastService = inject(ToastService);
  private readonly supabaseService = inject(SupabaseService);

  /** Modal state for adding new customer */
  readonly addCustomerModalOpen = signal(false);

  /** Modal state for managing alternative contacts */
  readonly manageContactsModalOpen = signal(false);
  readonly contactsReceiver = signal<ReceiverProfile | null>(null);

  /** Modal state for editing a customer */
  readonly editCustomerModalOpen = signal(false);
  readonly editingReceiver = signal<ReceiverProfile | null>(null);

  /** Confirmation dialog for deactivation */
  readonly confirmDeactivateOpen = signal(false);
  readonly receiverPendingDeactivation = signal<ReceiverProfile | null>(null);

  /** Computed deactivation message for confirm dialog */
  readonly deactivateReceiverMessage = computed(() => {
    const r = this.receiverPendingDeactivation();
    return r
      ? `Are you sure you want to deactivate ${r.name} ${r.surname}? They will no longer be able to receive packages.`
      : 'Are you sure you want to deactivate this customer?';
  });

  /** Package history panel */
  readonly historyPanelOpen = signal(false);
  readonly selectedReceiver = signal<ReceiverProfile | null>(null);
  readonly receiverPackages = signal<Package[]>([]);
  readonly loadingPackages = signal(false);

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
    { label: 'View Packages', action: 'viewPackages' },
    { label: 'Edit Details', action: 'editDetails' },
    { label: 'Manage Contacts', action: 'manageContacts' },
    { label: 'Send Email', action: 'sendEmail' },
    { label: 'Deactivate', action: 'deactivate', isDanger: true }
  ];

  /** Menu options for inactive customer cards */
  readonly inactiveMenuOptions: UserCardMenuOption[] = [
    { label: 'Edit Details', action: 'editDetails' },
    { label: 'Manage Contacts', action: 'manageContacts' },
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
      r.email.toLowerCase().includes(query)
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
      country: receiver.is_active ? 'Active' : 'Inactive',
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
      case 'viewPackages':
        await this.onViewPackages(receiver);
        break;
      case 'editDetails':
        this.onEditCustomer(receiver);
        break;
      case 'manageContacts':
        this.onManageContacts(receiver);
        break;
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
   * Open the package history panel for a receiver.
   */
  async onViewPackages(receiver: ReceiverProfile): Promise<void> {
    this.selectedReceiver.set(receiver);
    this.historyPanelOpen.set(true);
    await this.loadReceiverPackages(receiver.email);
  }

  /**
   * Load all packages for a given receiver email.
   */
  private async loadReceiverPackages(email: string): Promise<void> {
    this.loadingPackages.set(true);
    try {
      const { data } = await this.supabaseService.client
        .from('packages')
        .select('*')
        .eq('receiver_email', email)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      this.receiverPackages.set((data ?? []) as Package[]);
    } catch {
      this.receiverPackages.set([]);
    } finally {
      this.loadingPackages.set(false);
    }
  }

  /**
   * Close the package history panel.
   */
  onCloseHistoryPanel(): void {
    this.historyPanelOpen.set(false);
    this.selectedReceiver.set(null);
    this.receiverPackages.set([]);
  }

  /**
   * Get a human-readable status label.
   */
  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      [PACKAGE_STATUS.PENDING]: 'Pending',
      [PACKAGE_STATUS.NOTIFIED]: 'Notified',
      [PACKAGE_STATUS.IN_TRANSIT]: 'In Transit',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'Ready',
      [PACKAGE_STATUS.DELIVERED]: 'Delivered',
      [PACKAGE_STATUS.COLLECTED]: 'Collected',
      [PACKAGE_STATUS.RETURNED]: 'Canceled',
    };
    return labels[status] ?? status;
  }

  /**
   * Get a badge colour class for a package status.
   */
  getStatusBadgeClass(status: string): string {
    const classes: Record<string, string> = {
      [PACKAGE_STATUS.PENDING]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-400',
      [PACKAGE_STATUS.NOTIFIED]: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400',
      [PACKAGE_STATUS.IN_TRANSIT]: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-400',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-400',
      [PACKAGE_STATUS.DELIVERED]: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400',
      [PACKAGE_STATUS.COLLECTED]: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400',
      [PACKAGE_STATUS.RETURNED]: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-400',
    };
    return classes[status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  }

  /**
   * Format a date string for display.
   */
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  /**
   * Deactivate a receiver profile.
   */
  async onDeactivate(receiver: ReceiverProfile): Promise<void> {
    this.receiverPendingDeactivation.set(receiver);
    this.confirmDeactivateOpen.set(true);
  }

  async onConfirmDeactivate(): Promise<void> {
    this.confirmDeactivateOpen.set(false);
    const receiver = this.receiverPendingDeactivation();
    this.receiverPendingDeactivation.set(null);
    if (!receiver) return;
    await this.receiverService.deactivateReceiver(receiver.id);
    this.toastService.success(`Customer "${receiver.name} ${receiver.surname}" has been deactivated.`);
  }

  onCancelDeactivate(): void {
    this.confirmDeactivateOpen.set(false);
    this.receiverPendingDeactivation.set(null);
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
   * Open the manage-contacts modal for the given receiver.
   */
  onManageContacts(receiver: ReceiverProfile): void {
    this.contactsReceiver.set(receiver);
    this.manageContactsModalOpen.set(true);
  }

  /**
   * Close the manage-contacts modal.
   */
  onCloseManageContactsModal(): void {
    this.manageContactsModalOpen.set(false);
    this.contactsReceiver.set(null);
  }

  /**
   * Handle customer created event.
   */
  onCustomerCreated(_receiver: ReceiverProfile): void {
    // List auto-refreshes via the service
  }

  /**
   * Open the edit customer modal for the given receiver.
   */
  onEditCustomer(receiver: ReceiverProfile): void {
    this.editingReceiver.set(receiver);
    this.editCustomerModalOpen.set(true);
  }

  /**
   * Close the edit customer modal.
   */
  onCloseEditCustomerModal(): void {
    this.editCustomerModalOpen.set(false);
    this.editingReceiver.set(null);
  }

  /**
   * Handle customer updated event.
   */
  onCustomerUpdated(receiver: ReceiverProfile): void {
    this.toastService.success(`Customer "${receiver.name} ${receiver.surname}" updated successfully.`);
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

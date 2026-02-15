import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { StaffService, StaffProfile } from '../../core';
import { UserCardComponent, User, UserCardAction, UserCardMenuOption } from '../../shared/components/user-card';
import { AddUserModalComponent, EditUserModalComponent } from '../../shared/components/modals';

/**
 * UserManagementComponent handles the display and management of staff users.
 * Only accessible to admin users.
 */
@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, LayoutComponent, UserCardComponent, AddUserModalComponent, EditUserModalComponent],
  templateUrl: './user-management.html',
  styleUrl: './user-management.css'
})
export class UserManagementComponent implements OnInit {
  private readonly staffService = inject(StaffService);

  /** Modal state for adding new user */
  readonly addUserModalOpen = signal(false);

  /** Modal state for editing user */
  readonly editUserModalOpen = signal(false);

  /** Staff profile being edited */
  readonly staffToEdit = signal<StaffProfile | null>(null);

  /** List of staff profiles */
  readonly staffList = this.staffService.staffList;

  /** Loading state */
  readonly loading = this.staffService.loading;

  /** Error state */
  readonly error = this.staffService.error;

  /** Whether current user is admin */
  readonly isAdmin = this.staffService.isAdmin;

  /** Search query for filtering staff */
  readonly searchQuery = signal('');

  /** Menu options for user cards */
  readonly menuOptions: UserCardMenuOption[] = [
    { label: 'View Profile', action: 'viewProfile' },
    { label: 'Edit', action: 'edit' },
    { label: 'Deactivate', action: 'deactivate', isDanger: true }
  ];

  /** Menu options for inactive users */
  readonly inactiveMenuOptions: UserCardMenuOption[] = [
    { label: 'View Profile', action: 'viewProfile' },
    { label: 'Reactivate', action: 'reactivate' }
  ];

  /** Filtered staff list based on search query */
  readonly filteredStaff = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const staff = this.staffList();

    if (!query) return staff;

    return staff.filter(s =>
      s.full_name.toLowerCase().includes(query) ||
      s.email.toLowerCase().includes(query) ||
      s.role.toLowerCase().includes(query)
    );
  });

  /** Map filtered staff to User card format */
  readonly userCards = computed(() => {
    return this.filteredStaff().map(staff => this.mapStaffToUser(staff));
  });

  ngOnInit(): void {
    this.loadStaff();
  }

  /**
   * Load all staff profiles
   */
  async loadStaff(): Promise<void> {
    await this.staffService.loadAllStaff();
  }

  /**
   * Handle search input change
   */
  onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  /**
   * Map StaffProfile to User interface for card display
   */
  mapStaffToUser(staff: StaffProfile): User {
    return {
      id: staff.id,
      name: staff.full_name,
      avatar: staff.avatar_url || this.generateAvatarUrl(staff.full_name),
      country: staff.department || 'Staff',
      countryFlag: this.getRoleEmoji(staff.role),
      bio: `${staff.email} • ${staff.role}${staff.is_active ? '' : ' • Inactive'}`
    };
  }

  /**
   * Get the original StaffProfile by user ID
   */
  getStaffById(userId: string | number): StaffProfile | undefined {
    return this.filteredStaff().find(s => s.id === userId);
  }

  /**
   * Get menu options based on staff status
   */
  getMenuOptions(staff: StaffProfile): UserCardMenuOption[] {
    return staff.is_active ? this.menuOptions : this.inactiveMenuOptions;
  }

  /**
   * Handle user card action events
   */
  async onCardAction(action: UserCardAction): Promise<void> {
    const staff = this.getStaffById(action.userId);
    if (!staff) return;

    switch (action.actionType) {
      case 'editProfile':
        this.onEditUser(staff);
        break;
      case 'sendEmail':
        window.location.href = `mailto:${staff.email}`;
        break;
      case 'menuOption':
        await this.handleMenuOption(action.menuOption, staff);
        break;
    }
  }

  /**
   * Handle menu option selection
   */
  private async handleMenuOption(option: string | undefined, staff: StaffProfile): Promise<void> {
    switch (option) {
      case 'viewProfile':
        console.log('View profile:', staff);
        break;
      case 'edit':
        this.onEditUser(staff);
        break;
      case 'deactivate':
        await this.onDeactivate(staff);
        break;
      case 'reactivate':
        await this.onReactivate(staff);
        break;
    }
  }

  /**
   * Handle card click
   */
  onCardClick(user: User): void {
    const staff = this.getStaffById(user.id);
    if (staff) {
      console.log('Card clicked:', staff);
    }
  }

  /**
   * Deactivate a staff member
   */
  async onDeactivate(staff: StaffProfile): Promise<void> {
    if (confirm(`Are you sure you want to deactivate ${staff.full_name}?`)) {
      await this.staffService.deactivateStaff(staff.id);
    }
  }

  /**
   * Reactivate a staff member
   */
  async onReactivate(staff: StaffProfile): Promise<void> {
    await this.staffService.reactivateStaff(staff.id);
  }

  /**
   * Open the add user modal
   */
  onAddUser(): void {
    this.addUserModalOpen.set(true);
  }

  /**
   * Close the add user modal
   */
  onCloseAddUserModal(): void {
    this.addUserModalOpen.set(false);
  }

  /**
   * Open the edit user modal
   */
  onEditUser(staff: StaffProfile): void {
    this.staffToEdit.set(staff);
    this.editUserModalOpen.set(true);
  }

  /**
   * Close the edit user modal
   */
  onCloseEditUserModal(): void {
    this.editUserModalOpen.set(false);
    this.staffToEdit.set(null);
  }

  /**
   * Handle user updated event
   */
  onUserUpdated(staff: StaffProfile): void {
    console.log('User updated:', staff);
    // List will auto-refresh via the service
  }

  /**
   * Handle user created event
   */
  onUserCreated(staff: StaffProfile): void {
    console.log('User created:', staff);
    // List will auto-refresh via the service
  }

  /**
   * Generate avatar URL from name
   */
  private generateAvatarUrl(name: string): string {
    const encodedName = encodeURIComponent(name);
    return `https://ui-avatars.com/api/?name=${encodedName}&background=8b5cf6&color=fff&size=128`;
  }

  /**
   * Get role emoji for display
   */
  private getRoleEmoji(role: string): string {
    const roleEmojis: Record<string, string> = {
      admin: '👑',
      manager: '📊',
      staff: '👤',
      viewer: '👁️'
    };
    return roleEmojis[role] || '👤';
  }

  /**
   * Track by function for ngFor
   */
  trackByStaffId(index: number, staff: StaffProfile): string {
    return staff.id;
  }
}



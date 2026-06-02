import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { UserManagementComponent } from './user-management';
import { StaffProfile, StaffRole, StaffService } from '../../core';
import { ToastService } from '../../shared/components/toast/toast.service';
import { User, UserCardAction } from '../../shared/components/user-card';

describe('UserManagementComponent', () => {
  let component: UserManagementComponent;
  let fixture: ComponentFixture<UserManagementComponent>;

  const mockStaffProfiles: StaffProfile[] = [
    {
      id: '1',
      user_id: 'user-1',
      email: 'admin@example.com',
      full_name: 'Admin User',
      role: 'admin' as StaffRole,
      is_active: true,
      department: 'Management',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    {
      id: '2',
      user_id: 'user-2',
      email: 'staff@example.com',
      full_name: 'Staff Member',
      role: 'staff' as StaffRole,
      is_active: true,
      department: 'Engineering',
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    },
    {
      id: '3',
      user_id: 'user-3',
      email: 'inactive@example.com',
      full_name: 'Inactive User',
      role: 'viewer' as StaffRole,
      is_active: false,
      created_at: '2024-01-03T00:00:00Z',
      updated_at: '2024-01-03T00:00:00Z',
    },
  ];

  const staffServiceMock = {
    staffList: signal<StaffProfile[]>([]),
    loading: signal(false),
    error: signal<string | null>(null),
    isAdmin: computed(() => true),
    loadAllStaff: vi.fn().mockResolvedValue(mockStaffProfiles),
    deactivateStaff: vi.fn().mockResolvedValue({ success: true, error: null }),
    reactivateStaff: vi.fn().mockResolvedValue({ success: true, error: null }),
    createStaff: vi.fn().mockResolvedValue({ profile: mockStaffProfiles[0], error: null }),
  };

  const toastServiceMock = {
    success: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    staffServiceMock.staffList.set(mockStaffProfiles);

    await TestBed.configureTestingModule({
      imports: [UserManagementComponent],
      providers: [
        { provide: StaffService, useValue: staffServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserManagementComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should expose the initial UI state', () => {
    expect(component.addUserModalOpen()).toBe(false);
    expect(component.editUserModalOpen()).toBe(false);
    expect(component.confirmDeactivateOpen()).toBe(false);
    expect(component.deactivateStaffMessage()).toBe('Are you sure you want to deactivate this user?');
  });

  it('should load staff on init', async () => {
    await component.ngOnInit();

    expect(staffServiceMock.loadAllStaff).toHaveBeenCalled();
  });

  it('should update the search query and filter staff', () => {
    component.onSearchChange({ target: { value: 'admin' } } as unknown as Event);

    expect(component.searchQuery()).toBe('admin');
    expect(component.filteredStaff()).toHaveLength(1);
    expect(component.filteredStaff()[0].full_name).toBe('Admin User');
  });

  it('should map a staff profile to a user card', () => {
    const user = component.mapStaffToUser(mockStaffProfiles[0]);

    expect(user).toMatchObject({
      id: '1',
      name: 'Admin User',
      country: 'Management',
      role: 'admin',
      email: 'admin@example.com',
      isActive: true,
    });
    expect(user.countryFlag).toBe('👑');
    expect(user.avatar).toContain('ui-avatars.com');
  });

  it('should fallback to the default department and role emoji', () => {
    const user = component.mapStaffToUser({
      ...mockStaffProfiles[2],
      role: 'unknown' as StaffRole,
      department: undefined,
    });

    expect(user.country).toBe('Staff');
    expect(user.countryFlag).toBe('👤');
    expect(user.bio).toContain('Inactive');
  });

  it('should return the correct menu options for active and inactive staff', () => {
    expect(component.getMenuOptions(mockStaffProfiles[0])).toBe(component.menuOptions);
    expect(component.getMenuOptions(mockStaffProfiles[2])).toBe(component.inactiveMenuOptions);
  });

  it('should open and close the add and edit modals', () => {
    component.onAddUser();
    expect(component.addUserModalOpen()).toBe(true);

    component.onCloseAddUserModal();
    expect(component.addUserModalOpen()).toBe(false);

    component.onEditUser(mockStaffProfiles[0]);
    expect(component.editUserModalOpen()).toBe(true);
    expect(component.staffToEdit()).toBe(mockStaffProfiles[0]);

    component.onCloseEditUserModal();
    expect(component.editUserModalOpen()).toBe(false);
    expect(component.staffToEdit()).toBeNull();
  });

  it('should resolve users by id from the filtered list', () => {
    component.searchQuery.set('staff');

    expect(component.getStaffById('2')?.full_name).toBe('Staff Member');
    expect(component.getStaffById('1')).toBeUndefined();
  });

  it('should send email actions through window.location', async () => {
    const originalLocation = window.location;
    const hrefSpy = vi.fn();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        get href() {
          return '';
        },
        set href(value: string) {
          hrefSpy(value);
        },
      },
    });

    await component.onCardAction({ userId: '1', actionType: 'sendEmail' });

    expect(hrefSpy).toHaveBeenCalledWith('mailto:admin@example.com');

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('should open the edit modal for edit profile actions', async () => {
    await component.onCardAction({ userId: '1', actionType: 'editProfile' });

    expect(component.editUserModalOpen()).toBe(true);
    expect(component.staffToEdit()?.id).toBe('1');
  });

  it('should no-op when the user for a card action is missing', async () => {
    await component.onCardAction({ userId: 'missing', actionType: 'editProfile' });

    expect(component.editUserModalOpen()).toBe(false);
    expect(staffServiceMock.reactivateStaff).not.toHaveBeenCalled();
  });

  it('should open the deactivate confirmation for the matching menu option', async () => {
    const action: UserCardAction = { userId: '1', actionType: 'menuOption', menuOption: 'deactivate' };

    await component.onCardAction(action);

    expect(component.confirmDeactivateOpen()).toBe(true);
    expect(component.staffPendingDeactivation()?.id).toBe('1');
    expect(component.deactivateStaffMessage()).toContain('Admin User');
  });

  it('should reactivate inactive staff from the menu action', async () => {
    const action: UserCardAction = { userId: '3', actionType: 'menuOption', menuOption: 'reactivate' };

    await component.onCardAction(action);

    expect(staffServiceMock.reactivateStaff).toHaveBeenCalledWith('3');
  });

  it('should confirm and complete staff deactivation', async () => {
    component.onDeactivate(mockStaffProfiles[0]);

    await component.onConfirmDeactivate();

    expect(staffServiceMock.deactivateStaff).toHaveBeenCalledWith('1');
    expect(toastServiceMock.success).toHaveBeenCalledWith('User "Admin User" has been deactivated.');
    expect(component.confirmDeactivateOpen()).toBe(false);
    expect(component.staffPendingDeactivation()).toBeNull();
  });

  it('should cancel a pending deactivation', () => {
    component.onDeactivate(mockStaffProfiles[0]);

    component.onCancelDeactivate();

    expect(component.confirmDeactivateOpen()).toBe(false);
    expect(component.staffPendingDeactivation()).toBeNull();
  });

  it('should expose computed user cards and track ids', () => {
    const userCards = component.userCards();

    expect(userCards).toHaveLength(3);
    expect(userCards[0].name).toBe('Admin User');
    expect(component.trackByStaffId(0, mockStaffProfiles[1])).toBe('2');
  });

  it('should log user updates and creations', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    component.onUserUpdated(mockStaffProfiles[0]);
    component.onUserCreated(mockStaffProfiles[1]);
    component.onCardClick({ id: '1' } as User);

    expect(consoleSpy).toHaveBeenCalledWith('User updated:', mockStaffProfiles[0]);
    expect(consoleSpy).toHaveBeenCalledWith('User created:', mockStaffProfiles[1]);
    expect(consoleSpy).toHaveBeenCalledTimes(2);
  });
});

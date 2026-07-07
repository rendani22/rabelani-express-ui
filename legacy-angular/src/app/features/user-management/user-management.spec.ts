import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { vi } from 'vitest';

import { UserManagementComponent } from './user-management';
import { StaffService, StaffProfile, StaffRole } from '../../core';
import { User, UserCardAction } from '../../shared/components/user-card';
import { ToastService } from '../../shared/components/toast/toast.service';

describe('UserManagementComponent', () => {
  let component: UserManagementComponent;
  let fixture: ComponentFixture<UserManagementComponent>;
  let staffServiceMock: {
    staffList: ReturnType<typeof signal<StaffProfile[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    isAdmin: ReturnType<typeof computed<boolean>>;
    loadAllStaff: ReturnType<typeof vi.fn>;
    deactivateStaff: ReturnType<typeof vi.fn>;
    reactivateStaff: ReturnType<typeof vi.fn>;
    createStaff: ReturnType<typeof vi.fn>;
  };
  let toastServiceMock: {
    success: ReturnType<typeof vi.fn>;
  };

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
      updated_at: '2024-01-01T00:00:00Z'
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
      updated_at: '2024-01-02T00:00:00Z'
    },
    {
      id: '3',
      user_id: 'user-3',
      email: 'inactive@example.com',
      full_name: 'Inactive User',
      role: 'viewer' as StaffRole,
      is_active: false,
      created_at: '2024-01-03T00:00:00Z',
      updated_at: '2024-01-03T00:00:00Z'
    }
  ];

  beforeEach(async () => {
    const staffListSignal = signal<StaffProfile[]>([]);
    const loadingSignal = signal(false);
    const errorSignal = signal<string | null>(null);

    staffServiceMock = {
      staffList: staffListSignal,
      loading: loadingSignal,
      error: errorSignal,
      isAdmin: computed(() => true),
      loadAllStaff: vi.fn().mockResolvedValue(mockStaffProfiles),
      deactivateStaff: vi.fn().mockResolvedValue({ success: true, error: null }),
      reactivateStaff: vi.fn().mockResolvedValue({ success: true, error: null }),
      createStaff: vi.fn().mockResolvedValue({ profile: mockStaffProfiles[0], error: null })
    };
    toastServiceMock = {
      success: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [UserManagementComponent],
      providers: [
        { provide: StaffService, useValue: staffServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(UserManagementComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initial State', () => {
    it('should have addUserModalOpen set to false initially', () => {
      expect(component.addUserModalOpen()).toBe(false);
    });

    it('should have empty search query initially', () => {
      expect(component.searchQuery()).toBe('');
    });

    it('should have menu options defined', () => {
      expect(component.menuOptions.length).toBe(3);
      expect(component.menuOptions[0].action).toBe('viewProfile');
      expect(component.menuOptions[1].action).toBe('edit');
      expect(component.menuOptions[2].action).toBe('deactivate');
      expect(component.menuOptions[2].isDanger).toBe(true);
    });

    it('should have inactive menu options defined', () => {
      expect(component.inactiveMenuOptions.length).toBe(2);
      expect(component.inactiveMenuOptions[0].action).toBe('viewProfile');
      expect(component.inactiveMenuOptions[1].action).toBe('reactivate');
    });
  });

  describe('ngOnInit', () => {
    it('should load staff on init', async () => {
      await component.ngOnInit();
      expect(staffServiceMock.loadAllStaff).toHaveBeenCalled();
    });
  });

  describe('loadStaff', () => {
    it('should call staffService.loadAllStaff', async () => {
      await component.loadStaff();
      expect(staffServiceMock.loadAllStaff).toHaveBeenCalled();
    });
  });

  describe('Search Functionality', () => {
    beforeEach(() => {
      staffServiceMock.staffList.set(mockStaffProfiles);
    });

    it('should update search query on input change', () => {
      const event = { target: { value: 'admin' } } as unknown as Event;
      component.onSearchChange(event);
      expect(component.searchQuery()).toBe('admin');
    });

    it('should filter staff by name', () => {
      component.searchQuery.set('admin');
      const filtered = component.filteredStaff();
      expect(filtered.length).toBe(1);
      expect(filtered[0].full_name).toBe('Admin User');
    });

    it('should filter staff by email', () => {
      component.searchQuery.set('staff@');
      const filtered = component.filteredStaff();
      expect(filtered.length).toBe(1);
      expect(filtered[0].email).toBe('staff@example.com');
    });

    it('should filter staff by role', () => {
      component.searchQuery.set('viewer');
      const filtered = component.filteredStaff();
      expect(filtered.length).toBe(1);
      expect(filtered[0].role).toBe('viewer');
    });

    it('should return all staff when search query is empty', () => {
      component.searchQuery.set('');
      const filtered = component.filteredStaff();
      expect(filtered.length).toBe(3);
    });

    it('should be case insensitive', () => {
      component.searchQuery.set('ADMIN');
      const filtered = component.filteredStaff();
      expect(filtered.length).toBe(1);
      expect(filtered[0].full_name).toBe('Admin User');
    });
  });

  describe('mapStaffToUser', () => {
    it('should map StaffProfile to User interface correctly', () => {
      const staff = mockStaffProfiles[0];
      const user = component.mapStaffToUser(staff);

      expect(user.id).toBe(staff.id);
      expect(user.name).toBe(staff.full_name);
      expect(user.country).toBe(staff.department);
      expect(user.bio).toContain(staff.email);
      expect(user.bio).toContain(staff.role);
    });

    it('should use default department when not provided', () => {
      const staffWithoutDept: StaffProfile = {
        ...mockStaffProfiles[0],
        department: undefined
      };
      const user = component.mapStaffToUser(staffWithoutDept);
      expect(user.country).toBe('Staff');
    });

    it('should show inactive status in bio for inactive users', () => {
      const inactiveStaff = mockStaffProfiles[2];
      const user = component.mapStaffToUser(inactiveStaff);
      expect(user.bio).toContain('Inactive');
    });

    it('should not show inactive status for active users', () => {
      const activeStaff = mockStaffProfiles[0];
      const user = component.mapStaffToUser(activeStaff);
      expect(user.bio).not.toContain('Inactive');
    });

    it('should generate avatar URL when avatar_url is not provided', () => {
      const staffWithoutAvatar: StaffProfile = {
        ...mockStaffProfiles[0],
        avatar_url: undefined
      };
      const user = component.mapStaffToUser(staffWithoutAvatar);
      expect(user.avatar).toContain('ui-avatars.com');
      expect(user.avatar).toContain(encodeURIComponent(staffWithoutAvatar.full_name));
    });

    it('should use provided avatar_url when available', () => {
      const staffWithAvatar: StaffProfile = {
        ...mockStaffProfiles[0],
        avatar_url: 'https://example.com/avatar.jpg'
      };
      const user = component.mapStaffToUser(staffWithAvatar);
      expect(user.avatar).toBe('https://example.com/avatar.jpg');
    });

    it('should return correct role emoji', () => {
      const adminUser = component.mapStaffToUser(mockStaffProfiles[0]);
      expect(adminUser.countryFlag).toBe('👑');

      const staffUser = component.mapStaffToUser(mockStaffProfiles[1]);
      expect(staffUser.countryFlag).toBe('👤');

      const viewerUser = component.mapStaffToUser(mockStaffProfiles[2]);
      expect(viewerUser.countryFlag).toBe('👁️');
    });
  });

  describe('getStaffById', () => {
    beforeEach(() => {
      staffServiceMock.staffList.set(mockStaffProfiles);
    });

    it('should return staff profile by ID', () => {
      const staff = component.getStaffById('1');
      expect(staff).toBeDefined();
      expect(staff?.full_name).toBe('Admin User');
    });

    it('should return undefined for non-existent ID', () => {
      const staff = component.getStaffById('non-existent');
      expect(staff).toBeUndefined();
    });
  });

  describe('getMenuOptions', () => {
    it('should return active menu options for active staff', () => {
      const activeStaff = mockStaffProfiles[0];
      const options = component.getMenuOptions(activeStaff);
      expect(options).toBe(component.menuOptions);
      expect(options.some(o => o.action === 'deactivate')).toBe(true);
    });

    it('should return inactive menu options for inactive staff', () => {
      const inactiveStaff = mockStaffProfiles[2];
      const options = component.getMenuOptions(inactiveStaff);
      expect(options).toBe(component.inactiveMenuOptions);
      expect(options.some(o => o.action === 'reactivate')).toBe(true);
    });
  });

  describe('Modal Operations', () => {
    it('should open add user modal when onAddUser is called', () => {
      expect(component.addUserModalOpen()).toBe(false);
      component.onAddUser();
      expect(component.addUserModalOpen()).toBe(true);
    });

    it('should close add user modal when onCloseAddUserModal is called', () => {
      component.addUserModalOpen.set(true);
      component.onCloseAddUserModal();
      expect(component.addUserModalOpen()).toBe(false);
    });
  });

  describe('onUserCreated', () => {
    it('should log the created user', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const newStaff = mockStaffProfiles[0];

      component.onUserCreated(newStaff);

      expect(consoleSpy).toHaveBeenCalledWith('User created:', newStaff);
      consoleSpy.mockRestore();
    });
  });

  describe('onCardClick', () => {
    beforeEach(() => {
      staffServiceMock.staffList.set(mockStaffProfiles);
    });

    it('should allow card click for valid user without side effects', () => {
      const user: User = {
        id: '1',
        name: 'Admin User',
        avatar: 'https://example.com/avatar.jpg',
        country: 'Management',
        countryFlag: '👑',
        bio: 'admin@example.com • admin'
      };

      component.onCardClick(user);

      expect(staffServiceMock.deactivateStaff).not.toHaveBeenCalled();
      expect(staffServiceMock.reactivateStaff).not.toHaveBeenCalled();
    });

    it('should not log anything for invalid user', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const user: User = {
        id: 'non-existent',
        name: 'Unknown',
        avatar: '',
        country: '',
        countryFlag: '',
        bio: ''
      };

      component.onCardClick(user);

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('onCardAction', () => {
    beforeEach(() => {
      staffServiceMock.staffList.set(mockStaffProfiles);
    });

    it('should open email client for sendEmail action', async () => {
      // Mock window.location.href assignment
      const originalHref = Object.getOwnPropertyDescriptor(window, 'location');
      const hrefMock = vi.fn();

      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          get href() { return ''; },
          set href(val: string) { hrefMock(val); }
        },
        writable: true
      });

      const action: UserCardAction = {
        userId: '1',
        actionType: 'sendEmail'
      };

      await component.onCardAction(action);

      expect(hrefMock).toHaveBeenCalledWith('mailto:admin@example.com');

      // Restore
      if (originalHref) {
        Object.defineProperty(window, 'location', originalHref);
      }
    });

    it('should open edit modal for editProfile action', async () => {
      const action: UserCardAction = {
        userId: '1',
        actionType: 'editProfile'
      };

      await component.onCardAction(action);

      expect(component.editUserModalOpen()).toBe(true);
      expect(component.staffToEdit()?.id).toBe('1');
    });

    it('should do nothing for non-existent user', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const action: UserCardAction = {
        userId: 'non-existent',
        actionType: 'editProfile'
      };

      await component.onCardAction(action);

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Deactivate/Reactivate Staff', () => {
    beforeEach(() => {
      staffServiceMock.staffList.set(mockStaffProfiles);
    });

    it('should open confirmation dialog when deactivating', async () => {
      const staff = mockStaffProfiles[0];

      await component.onDeactivate(staff);

      expect(component.confirmDeactivateOpen()).toBe(true);
      expect(component.staffPendingDeactivation()?.id).toBe(staff.id);
      expect(staffServiceMock.deactivateStaff).not.toHaveBeenCalled();
    });

    it('should deactivate staff on confirmation', async () => {
      const staff = mockStaffProfiles[0];
      await component.onDeactivate(staff);
      await component.onConfirmDeactivate();

      expect(staffServiceMock.deactivateStaff).toHaveBeenCalledWith(staff.id);
      expect(component.confirmDeactivateOpen()).toBe(false);
      expect(component.staffPendingDeactivation()).toBeNull();
      expect(toastServiceMock.success).toHaveBeenCalled();
    });

    it('should clear pending deactivation when cancelled', async () => {
      const staff = mockStaffProfiles[0];
      await component.onDeactivate(staff);
      component.onCancelDeactivate();
      expect(staffServiceMock.deactivateStaff).not.toHaveBeenCalled();
      expect(component.confirmDeactivateOpen()).toBe(false);
      expect(component.staffPendingDeactivation()).toBeNull();
    });

    it('should call reactivateStaff', async () => {
      const staff = mockStaffProfiles[2];

      await component.onReactivate(staff);

      expect(staffServiceMock.reactivateStaff).toHaveBeenCalledWith(staff.id);
    });
  });

  describe('Menu Option Handling', () => {
    beforeEach(() => {
      staffServiceMock.staffList.set(mockStaffProfiles);
    });

    it('should handle viewProfile menu option', async () => {
      const action: UserCardAction = {
        userId: '1',
        actionType: 'menuOption',
        menuOption: 'viewProfile'
      };
      await component.onCardAction(action);

      expect(component.editUserModalOpen()).toBe(false);
      expect(staffServiceMock.deactivateStaff).not.toHaveBeenCalled();
    });

    it('should handle edit menu option', async () => {
      const action: UserCardAction = {
        userId: '1',
        actionType: 'menuOption',
        menuOption: 'edit'
      };
      await component.onCardAction(action);

      expect(component.editUserModalOpen()).toBe(true);
      expect(component.staffToEdit()?.id).toBe('1');
    });

    it('should handle deactivate menu option', async () => {
      const action: UserCardAction = {
        userId: '1',
        actionType: 'menuOption',
        menuOption: 'deactivate'
      };

      await component.onCardAction(action);

      expect(component.confirmDeactivateOpen()).toBe(true);
      expect(component.staffPendingDeactivation()?.id).toBe('1');
      expect(staffServiceMock.deactivateStaff).not.toHaveBeenCalled();
    });

    it('should handle reactivate menu option', async () => {
      const action: UserCardAction = {
        userId: '3',
        actionType: 'menuOption',
        menuOption: 'reactivate'
      };

      await component.onCardAction(action);

      expect(staffServiceMock.reactivateStaff).toHaveBeenCalledWith('3');
    });
  });

  describe('trackByStaffId', () => {
    it('should return staff id', () => {
      const staff = mockStaffProfiles[0];
      const result = component.trackByStaffId(0, staff);
      expect(result).toBe(staff.id);
    });
  });

  describe('userCards computed', () => {
    beforeEach(() => {
      staffServiceMock.staffList.set(mockStaffProfiles);
    });

    it('should map all filtered staff to User format', () => {
      const userCards = component.userCards();
      expect(userCards.length).toBe(3);
      expect(userCards[0].name).toBe('Admin User');
      expect(userCards[1].name).toBe('Staff Member');
      expect(userCards[2].name).toBe('Inactive User');
    });

    it('should update when search query changes', () => {
      component.searchQuery.set('admin');
      const userCards = component.userCards();
      expect(userCards.length).toBe(1);
      expect(userCards[0].name).toBe('Admin User');
    });
  });
});

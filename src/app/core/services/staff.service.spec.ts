import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';

import { StaffService } from './staff.service';
import { SupabaseService } from '../../shared/services/supabase.service';
import type { StaffProfile, StaffRole } from '../models/staff-profile.model';

const makeProfile = (overrides: Partial<StaffProfile> = {}): StaffProfile => ({
  id: 'staff-1',
  user_id: 'user-1',
  email: 'staff@example.com',
  full_name: 'Test User',
  role: 'staff',
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

describe('StaffService', () => {
  let service: StaffService;
  let supabaseServiceMock: {
    currentUser: ReturnType<typeof signal<null>>;
    isInitialized: ReturnType<typeof signal<boolean>>;
    client: {
      from: ReturnType<typeof vi.fn>;
      functions: { invoke: ReturnType<typeof vi.fn> };
    };
  };

  const buildQueryChain = (result: { data: unknown; error: unknown }) => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'order', 'single', 'update', 'in'];
    methods.forEach(m => {
      chain[m] = vi.fn().mockReturnValue(chain);
    });
    (chain['single'] as ReturnType<typeof vi.fn>).mockResolvedValue(result);
    (chain['order'] as ReturnType<typeof vi.fn>).mockResolvedValue(result);
    return chain;
  };

  beforeEach(() => {
    supabaseServiceMock = {
      currentUser: signal(null),
      isInitialized: signal(false),
      client: {
        from: vi.fn(),
        functions: { invoke: vi.fn() },
      },
    };

    TestBed.configureTestingModule({
      providers: [
        StaffService,
        { provide: SupabaseService, useValue: supabaseServiceMock },
      ],
    });

    service = TestBed.inject(StaffService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  describe('Initial state', () => {
    it('should have null currentProfile initially', () => {
      expect(service.currentProfile()).toBeNull();
    });

    it('should have empty staffList initially', () => {
      expect(service.staffList()).toEqual([]);
    });

    it('should have loading as false initially', () => {
      expect(service.loading()).toBe(false);
    });

    it('should have null error initially', () => {
      expect(service.error()).toBeNull();
    });
  });

  describe('isAdmin computed', () => {
    it('should return true when current profile role is admin', () => {
      service.currentProfile.set(makeProfile({ role: 'admin' }));
      expect(service.isAdmin()).toBe(true);
    });

    it('should return false when current profile role is staff', () => {
      service.currentProfile.set(makeProfile({ role: 'staff' }));
      expect(service.isAdmin()).toBe(false);
    });

    it('should return false when current profile role is driver', () => {
      service.currentProfile.set(makeProfile({ role: 'driver' }));
      expect(service.isAdmin()).toBe(false);
    });

    it('should return false when there is no current profile', () => {
      service.currentProfile.set(null);
      expect(service.isAdmin()).toBe(false);
    });
  });

  describe('isDriver computed', () => {
    it('should return true when current profile role is driver', () => {
      service.currentProfile.set(makeProfile({ role: 'driver' }));
      expect(service.isDriver()).toBe(true);
    });

    it('should return false when current profile role is admin', () => {
      service.currentProfile.set(makeProfile({ role: 'admin' }));
      expect(service.isDriver()).toBe(false);
    });

    it('should return false when there is no current profile', () => {
      service.currentProfile.set(null);
      expect(service.isDriver()).toBe(false);
    });
  });

  describe('canPickupPackages computed', () => {
    it('should return true when role is driver', () => {
      service.currentProfile.set(makeProfile({ role: 'driver' }));
      expect(service.canPickupPackages()).toBe(true);
    });

    it('should return true when role is admin', () => {
      service.currentProfile.set(makeProfile({ role: 'admin' }));
      expect(service.canPickupPackages()).toBe(true);
    });

    it('should return false when role is staff', () => {
      service.currentProfile.set(makeProfile({ role: 'staff' }));
      expect(service.canPickupPackages()).toBe(false);
    });

    it('should return false when role is manager', () => {
      service.currentProfile.set(makeProfile({ role: 'manager' }));
      expect(service.canPickupPackages()).toBe(false);
    });

    it('should return false when role is viewer', () => {
      service.currentProfile.set(makeProfile({ role: 'viewer' }));
      expect(service.canPickupPackages()).toBe(false);
    });

    it('should return false when there is no current profile', () => {
      service.currentProfile.set(null);
      expect(service.canPickupPackages()).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should return true when profile has the matching role', () => {
      service.currentProfile.set(makeProfile({ role: 'admin' }));
      expect(service.hasRole('admin')).toBe(true);
    });

    it('should return false when profile has a different role', () => {
      service.currentProfile.set(makeProfile({ role: 'staff' }));
      expect(service.hasRole('admin')).toBe(false);
    });

    it('should return false when there is no current profile', () => {
      service.currentProfile.set(null);
      expect(service.hasRole('admin' as StaffRole)).toBe(false);
    });

    it('should correctly identify driver role', () => {
      service.currentProfile.set(makeProfile({ role: 'driver' }));
      expect(service.hasRole('driver')).toBe(true);
      expect(service.hasRole('staff')).toBe(false);
    });
  });

  describe('loadCurrentProfile', () => {
    it('should return null when no current user', async () => {
      supabaseServiceMock.currentUser.set(null);
      const result = await service.loadCurrentProfile();
      expect(result).toBeNull();
    });

    it('should set and return profile on success', async () => {
      const mockProfile = makeProfile({ role: 'admin' });
      supabaseServiceMock.currentUser.set({ id: 'user-1' } as any);

      const chain = buildQueryChain({ data: mockProfile, error: null });
      supabaseServiceMock.client.from.mockReturnValue(chain);

      const result = await service.loadCurrentProfile();

      expect(result).toEqual(mockProfile);
      expect(service.currentProfile()).toEqual(mockProfile);
    });

    it('should set null and return null when profile not found (PGRST116)', async () => {
      supabaseServiceMock.currentUser.set({ id: 'user-1' } as any);

      const chain = buildQueryChain({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
      supabaseServiceMock.client.from.mockReturnValue(chain);

      const result = await service.loadCurrentProfile();

      expect(result).toBeNull();
      expect(service.currentProfile()).toBeNull();
    });

    it('should set error and return null on other database errors', async () => {
      supabaseServiceMock.currentUser.set({ id: 'user-1' } as any);

      const chain = buildQueryChain({ data: null, error: { code: 'OTHER', message: 'DB error' } });
      supabaseServiceMock.client.from.mockReturnValue(chain);

      const result = await service.loadCurrentProfile();

      expect(result).toBeNull();
      expect(service.error()).toBe('DB error');
    });

    it('should set loading to false after completion', async () => {
      supabaseServiceMock.currentUser.set({ id: 'user-1' } as any);

      const chain = buildQueryChain({ data: makeProfile(), error: null });
      supabaseServiceMock.client.from.mockReturnValue(chain);

      await service.loadCurrentProfile();

      expect(service.loading()).toBe(false);
    });
  });

  describe('createStaff', () => {
    it('should return error when user is not admin', async () => {
      service.currentProfile.set(makeProfile({ role: 'staff' }));

      const result = await service.createStaff({
        email: 'new@example.com',
        password: 'pass123',
        full_name: 'New User',
        role: 'staff',
      });

      expect(result.profile).toBeNull();
      expect(result.error).toBe('Only admins can create staff profiles');
    });

    it('should call edge function when user is admin', async () => {
      service.currentProfile.set(makeProfile({ role: 'admin' }));
      const newProfile = makeProfile({ id: 'new-staff', email: 'new@example.com' });

      supabaseServiceMock.client.functions.invoke.mockResolvedValue({
        data: { profile: newProfile },
        error: null,
      });

      // Mock loadAllStaff
      const chain = buildQueryChain({ data: [], error: null });
      supabaseServiceMock.client.from.mockReturnValue(chain);

      const result = await service.createStaff({
        email: 'new@example.com',
        password: 'pass123',
        full_name: 'New User',
        role: 'staff',
      });

      expect(supabaseServiceMock.client.functions.invoke).toHaveBeenCalledWith('create-staff', expect.any(Object));
      expect(result.profile).toEqual(newProfile);
      expect(result.error).toBeNull();
    });

    it('should return error when edge function fails', async () => {
      service.currentProfile.set(makeProfile({ role: 'admin' }));

      supabaseServiceMock.client.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: 'Edge function error' },
      });

      const result = await service.createStaff({
        email: 'new@example.com',
        password: 'pass123',
        full_name: 'New User',
        role: 'staff',
      });

      expect(result.profile).toBeNull();
      expect(result.error).toBe('Edge function error');
    });
  });

  describe('deactivateStaff', () => {
    it('should call updateStaff with is_active: false', async () => {
      service.currentProfile.set(makeProfile({ role: 'admin' }));
      const updatedProfile = makeProfile({ is_active: false });

      const chain = buildQueryChain({ data: updatedProfile, error: null });
      supabaseServiceMock.client.from.mockReturnValue(chain);

      const result = await service.deactivateStaff('staff-1');

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should return success: false when not admin', async () => {
      service.currentProfile.set(makeProfile({ role: 'staff' }));

      const result = await service.deactivateStaff('staff-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Only admins can update staff profiles');
    });
  });

  describe('reactivateStaff', () => {
    it('should call updateStaff with is_active: true', async () => {
      service.currentProfile.set(makeProfile({ role: 'admin' }));
      const updatedProfile = makeProfile({ is_active: true });

      const chain = buildQueryChain({ data: updatedProfile, error: null });
      supabaseServiceMock.client.from.mockReturnValue(chain);

      const result = await service.reactivateStaff('staff-1');

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });
  });

  describe('getStaffById', () => {
    it('should return the staff profile when found', async () => {
      const mockProfile = makeProfile();
      const chain = buildQueryChain({ data: mockProfile, error: null });
      supabaseServiceMock.client.from.mockReturnValue(chain);

      const result = await service.getStaffById('staff-1');

      expect(result.profile).toEqual(mockProfile);
      expect(result.error).toBeNull();
    });

    it('should return null profile with error when not found', async () => {
      const chain = buildQueryChain({ data: null, error: { message: 'Not found' } });
      supabaseServiceMock.client.from.mockReturnValue(chain);

      const result = await service.getStaffById('non-existent');

      expect(result.profile).toBeNull();
      expect(result.error).toBe('Not found');
    });

    it('should set loading to false after completion', async () => {
      const chain = buildQueryChain({ data: makeProfile(), error: null });
      supabaseServiceMock.client.from.mockReturnValue(chain);

      await service.getStaffById('staff-1');

      expect(service.loading()).toBe(false);
    });
  });
});

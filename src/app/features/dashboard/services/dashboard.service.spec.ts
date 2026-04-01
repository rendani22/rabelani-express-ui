import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';

import { DashboardService } from './dashboard.service';
import { PackageService } from '../../../core';
import { PACKAGE_STATUS } from '../../../core/models/package.models';
import type { Package } from '../../../core/models/package.models';

const makePackage = (overrides: Partial<Package> = {}): Package => ({
  id: 'pkg-1',
  reference: 'REF-001',
  receiver_email: 'test@example.com',
  notes: null,
  status: PACKAGE_STATUS.PENDING,
  created_at: new Date().toISOString(),
  ...overrides,
});

describe('DashboardService', () => {
  let service: DashboardService;
  let packagesSignal: ReturnType<typeof signal<readonly Package[]>>;
  let packageServiceMock: {
    loadPackages: ReturnType<typeof vi.fn>;
    packages: ReturnType<typeof signal<readonly Package[]>>;
  };

  beforeEach(() => {
    packagesSignal = signal<readonly Package[]>([]);
    packageServiceMock = {
      loadPackages: vi.fn().mockResolvedValue({ success: true, data: [] }),
      packages: packagesSignal,
    };

    TestBed.configureTestingModule({
      providers: [
        DashboardService,
        { provide: PackageService, useValue: packageServiceMock },
      ],
    });

    service = TestBed.inject(DashboardService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  describe('Initial state', () => {
    it('should have isLoading as false initially', () => {
      expect(service.isLoading()).toBe(false);
    });

    it('should have zero stats initially', () => {
      const stats = service.stats();
      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.inTransit).toBe(0);
      expect(stats.completed).toBe(0);
    });

    it('should have empty status distribution initially', () => {
      expect(service.statusDistribution()).toEqual([]);
    });

    it('should have empty recent activity initially', () => {
      expect(service.recentActivity()).toEqual([]);
    });

    it('should return 0 for completionRate when no packages', () => {
      expect(service.completionRate()).toBe(0);
    });

    it('should return 0 for pendingRate when no packages', () => {
      expect(service.pendingRate()).toBe(0);
    });
  });

  describe('loadDashboardData', () => {
    it('should call packageService.loadPackages', async () => {
      await service.loadDashboardData();
      expect(packageServiceMock.loadPackages).toHaveBeenCalled();
    });

    it('should set isLoading to false after loading', async () => {
      await service.loadDashboardData();
      expect(service.isLoading()).toBe(false);
    });

    it('should set isLoading to false even when loadPackages throws', async () => {
      packageServiceMock.loadPackages.mockRejectedValue(new Error('Network error'));
      try {
        await service.loadDashboardData();
      } catch {
        // The error propagates since the service has no catch block, only finally
      }
      expect(service.isLoading()).toBe(false);
    });

    it('should calculate total package count', async () => {
      packagesSignal.set([makePackage(), makePackage({ id: 'pkg-2', reference: 'REF-002' })]);
      await service.loadDashboardData();
      expect(service.stats().total).toBe(2);
    });

    it('should count pending packages (pending status)', async () => {
      packagesSignal.set([makePackage({ status: PACKAGE_STATUS.PENDING })]);
      await service.loadDashboardData();
      expect(service.stats().pending).toBe(1);
    });

    it('should count pending packages (notified status)', async () => {
      packagesSignal.set([makePackage({ status: PACKAGE_STATUS.NOTIFIED })]);
      await service.loadDashboardData();
      expect(service.stats().pending).toBe(1);
    });

    it('should count in-transit packages', async () => {
      packagesSignal.set([makePackage({ status: PACKAGE_STATUS.IN_TRANSIT })]);
      await service.loadDashboardData();
      expect(service.stats().inTransit).toBe(1);
    });

    it('should count ready-for-collection packages', async () => {
      packagesSignal.set([makePackage({ status: PACKAGE_STATUS.READY_FOR_COLLECTION })]);
      await service.loadDashboardData();
      expect(service.stats().readyForCollection).toBe(1);
    });

    it('should count delivered packages as completed', async () => {
      packagesSignal.set([makePackage({ status: PACKAGE_STATUS.DELIVERED })]);
      await service.loadDashboardData();
      expect(service.stats().completed).toBe(1);
    });

    it('should count collected packages as completed', async () => {
      packagesSignal.set([makePackage({ status: PACKAGE_STATUS.COLLECTED })]);
      await service.loadDashboardData();
      expect(service.stats().completed).toBe(1);
    });

    it('should count packages created today', async () => {
      const today = new Date();
      today.setHours(1, 0, 0, 0);
      packagesSignal.set([makePackage({ created_at: today.toISOString() })]);
      await service.loadDashboardData();
      expect(service.stats().todayCount).toBe(1);
    });

    it('should calculate status distribution without zero-value entries', async () => {
      packagesSignal.set([
        makePackage({ status: PACKAGE_STATUS.PENDING }),
        makePackage({ id: 'pkg-2', status: PACKAGE_STATUS.IN_TRANSIT }),
      ]);
      await service.loadDashboardData();
      const distribution = service.statusDistribution();
      expect(distribution.length).toBeGreaterThan(0);
      const pendingItem = distribution.find(d => d.status === PACKAGE_STATUS.PENDING);
      expect(pendingItem?.value).toBe(1);
    });

    it('should calculate weekly time series with 7 data points', async () => {
      await service.loadDashboardData();
      expect(service.weeklyTimeSeries().length).toBe(7);
    });

    it('should limit recent activity to latest 10 packages', async () => {
      const packages = Array.from({ length: 15 }, (_, i) =>
        makePackage({ id: `pkg-${i}`, reference: `REF-${i.toString().padStart(3, '0')}` })
      );
      packagesSignal.set(packages);
      await service.loadDashboardData();
      expect(service.recentActivity().length).toBe(10);
    });

    it('should include reference and receiver email in recent activity', async () => {
      packagesSignal.set([makePackage({ reference: 'REF-999', receiver_email: 'user@test.com' })]);
      await service.loadDashboardData();
      const activity = service.recentActivity()[0];
      expect(activity.reference).toBe('REF-999');
      expect(activity.receiverEmail).toBe('user@test.com');
    });
  });

  describe('completionRate', () => {
    it('should return 0 when there are no packages', async () => {
      packagesSignal.set([]);
      await service.loadDashboardData();
      expect(service.completionRate()).toBe(0);
    });

    it('should return 50 when half the packages are completed', async () => {
      packagesSignal.set([
        makePackage({ status: PACKAGE_STATUS.PENDING }),
        makePackage({ id: 'pkg-2', status: PACKAGE_STATUS.DELIVERED }),
      ]);
      await service.loadDashboardData();
      expect(service.completionRate()).toBe(50);
    });

    it('should return 100 when all packages are completed', async () => {
      packagesSignal.set([
        makePackage({ status: PACKAGE_STATUS.DELIVERED }),
        makePackage({ id: 'pkg-2', status: PACKAGE_STATUS.COLLECTED }),
      ]);
      await service.loadDashboardData();
      expect(service.completionRate()).toBe(100);
    });

    it('should round the completion rate', async () => {
      packagesSignal.set([
        makePackage({ status: PACKAGE_STATUS.DELIVERED }),
        makePackage({ id: 'pkg-2', status: PACKAGE_STATUS.PENDING }),
        makePackage({ id: 'pkg-3', status: PACKAGE_STATUS.PENDING }),
      ]);
      await service.loadDashboardData();
      // 1/3 * 100 = 33.33... → rounds to 33
      expect(service.completionRate()).toBe(33);
    });
  });

  describe('pendingRate', () => {
    it('should return 0 when there are no packages', async () => {
      packagesSignal.set([]);
      await service.loadDashboardData();
      expect(service.pendingRate()).toBe(0);
    });

    it('should return 50 when half the packages are pending', async () => {
      packagesSignal.set([
        makePackage({ status: PACKAGE_STATUS.PENDING }),
        makePackage({ id: 'pkg-2', status: PACKAGE_STATUS.DELIVERED }),
      ]);
      await service.loadDashboardData();
      expect(service.pendingRate()).toBe(50);
    });

    it('should return 100 when all packages are pending', async () => {
      packagesSignal.set([
        makePackage({ status: PACKAGE_STATUS.PENDING }),
        makePackage({ id: 'pkg-2', status: PACKAGE_STATUS.NOTIFIED }),
      ]);
      await service.loadDashboardData();
      expect(service.pendingRate()).toBe(100);
    });
  });
});

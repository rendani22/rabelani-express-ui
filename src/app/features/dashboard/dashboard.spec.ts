import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { Dashboard } from './dashboard';
import { FilterOption } from '../../core/models/models';
import { Package, PACKAGE_STATUS } from '../../core';
import { DashboardService, PackageActivity } from './services/dashboard.service';

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;
  let router: Router;
  let dashboardServiceMock: {
    isLoading: ReturnType<typeof signal<boolean>>;
    stats: ReturnType<typeof signal<any>>;
    statusDistribution: ReturnType<typeof signal<any[]>>;
    weeklyTimeSeries: ReturnType<typeof signal<any[]>>;
    recentActivity: ReturnType<typeof signal<any[]>>;
    loadDashboardData: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    dashboardServiceMock = {
      isLoading: signal(false),
      stats: signal({ total: 0, pending: 0, inTransit: 0, readyForCollection: 0, completed: 0, todayCount: 0, weeklyCount: 0, monthlyCount: 0 }),
      statusDistribution: signal([]),
      weeklyTimeSeries: signal([]),
      recentActivity: signal([]),
      loadDashboardData: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        { provide: DashboardService, useValue: dashboardServiceMock },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initial State', () => {
    it('should have createPackageModalOpen set to false initially', () => {
      expect(component.createPackageModalOpen).toBe(false);
    });

    it('should expose isLoading from dashboard service', () => {
      expect(component.isLoading).toBe(dashboardServiceMock.isLoading);
    });

    it('should expose stats from dashboard service', () => {
      expect(component.stats).toBe(dashboardServiceMock.stats);
    });
  });

  describe('ngOnInit', () => {
    it('should call loadDashboardData on init', async () => {
      await component.ngOnInit();
      expect(dashboardServiceMock.loadDashboardData).toHaveBeenCalled();
    });
  });

  describe('statItems getter', () => {
    it('should return four stat items', () => {
      expect(component.statItems.length).toBe(4);
    });

    it('should include total, pending, inTransit, completed stat items', () => {
      const labels = component.statItems.map(s => s.label);
      expect(labels).toContain('Total Packages');
      expect(labels).toContain('Pending');
      expect(labels).toContain('In Transit');
      expect(labels).toContain('Completed');
    });

    it('should reflect stats signal values', () => {
      dashboardServiceMock.stats.set({ total: 10, pending: 3, inTransit: 2, readyForCollection: 1, completed: 4, todayCount: 5, weeklyCount: 8, monthlyCount: 10 });
      const items = component.statItems;
      expect(items.find(s => s.label === 'Total Packages')?.value).toBe(10);
      expect(items.find(s => s.label === 'Pending')?.value).toBe(3);
      expect(items.find(s => s.label === 'In Transit')?.value).toBe(2);
      expect(items.find(s => s.label === 'Completed')?.value).toBe(4);
    });
  });

  describe('onFilterApply', () => {
    it('should log filters when onFilterApply is called', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const filters: FilterOption[] = [
        { label: 'Option 1', checked: true },
        { label: 'Option 2', checked: false },
      ];

      component.onFilterApply(filters);

      expect(consoleSpy).toHaveBeenCalledWith('Filters applied:', filters);
      consoleSpy.mockRestore();
    });

    it('should call loadDashboardData on filter apply', () => {
      component.onFilterApply([]);
      expect(dashboardServiceMock.loadDashboardData).toHaveBeenCalled();
    });
  });

  describe('Modal Operations', () => {
    it('should open create package modal when onAddView is called', () => {
      expect(component.createPackageModalOpen).toBe(false);

      component.onAddView();

      expect(component.createPackageModalOpen).toBe(true);
    });

    it('should close create package modal when onCloseCreatePackageModal is called', () => {
      component.createPackageModalOpen = true;

      component.onCloseCreatePackageModal();

      expect(component.createPackageModalOpen).toBe(false);
    });
  });

  describe('onPackageCreated', () => {
    it('should log the created package', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const mockPackage: Package = {
        id: 'pkg-123',
        reference: 'REF-001',
        receiver_email: 'test@example.com',
        notes: 'Test notes',
        status: PACKAGE_STATUS.PENDING,
        created_at: '2026-02-14T10:00:00Z',
        items: [],
      };

      await component.onPackageCreated(mockPackage);

      expect(consoleSpy).toHaveBeenCalledWith('Package created:', mockPackage);
      consoleSpy.mockRestore();
    });

    it('should reload dashboard data after package creation', async () => {
      const mockPackage: Package = {
        id: 'pkg-123',
        reference: 'REF-001',
        receiver_email: 'test@example.com',
        notes: null,
        status: PACKAGE_STATUS.PENDING,
        created_at: '2026-02-14T10:00:00Z',
      };

      await component.onPackageCreated(mockPackage);

      expect(dashboardServiceMock.loadDashboardData).toHaveBeenCalled();
    });
  });

  describe('onPackageClick', () => {
    it('should navigate to orders with package id', () => {
      const navigateSpy = vi.spyOn(router, 'navigate');
      const activity: PackageActivity = {
        id: 'pkg-1',
        reference: 'REF-001',
        receiverEmail: 'test@example.com',
        status: PACKAGE_STATUS.PENDING,
        statusLabel: 'Pending',
        createdAt: new Date(),
        timeAgo: '5m ago',
      };

      component.onPackageClick(activity);

      expect(navigateSpy).toHaveBeenCalledWith(['/orders'], { queryParams: { id: 'pkg-1' } });
    });
  });

  describe('onViewAllPackages', () => {
    it('should navigate to orders page', () => {
      const navigateSpy = vi.spyOn(router, 'navigate');
      component.onViewAllPackages();
      expect(navigateSpy).toHaveBeenCalledWith(['/orders']);
    });
  });

  describe('Template Rendering', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should render the app-layout component', () => {
      const layoutElement = fixture.debugElement.query(By.css('app-layout'));
      expect(layoutElement).toBeTruthy();
    });

    it('should render the dashboard actions component', () => {
      const actionsElement = fixture.debugElement.query(By.css('app-dashboard-actions'));
      expect(actionsElement).toBeTruthy();
    });

    it('should render the package stats card', () => {
      const statsCard = fixture.debugElement.query(By.css('app-package-stats-card'));
      expect(statsCard).toBeTruthy();
    });

    it('should render the packages trend card', () => {
      const trendCard = fixture.debugElement.query(By.css('app-packages-trend-card'));
      expect(trendCard).toBeTruthy();
    });

    it('should render the package status chart', () => {
      const statusChart = fixture.debugElement.query(By.css('app-package-status-chart'));
      expect(statusChart).toBeTruthy();
    });

    it('should render the recent packages card', () => {
      const recentCard = fixture.debugElement.query(By.css('app-recent-packages-card'));
      expect(recentCard).toBeTruthy();
    });

    it('should render the delivery performance card', () => {
      const perfCard = fixture.debugElement.query(By.css('app-delivery-performance-card'));
      expect(perfCard).toBeTruthy();
    });

    it('should render create package modal', () => {
      const createPackageModal = fixture.debugElement.query(By.css('app-create-package-modal'));
      expect(createPackageModal).toBeTruthy();
    });
  });
});

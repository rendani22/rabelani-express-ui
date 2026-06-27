import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { Dashboard } from './dashboard';
import { FilterOption } from '../../core/models/models';
import { OnboardingTourService, Package, PACKAGE_STATUS } from '../../core';
import { DashboardService } from './services/dashboard.service';

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;
  let router: Router;
  let navigateSpy: ReturnType<typeof vi.spyOn>;

  const mockDashboardService = {
    isLoading: signal(false).asReadonly(),
    stats: signal({
      total: 10,
      pending: 2,
      inTransit: 3,
      readyForCollection: 1,
      completed: 4,
      returned: 0,
      todayCount: 2,
      weeklyCount: 5,
      monthlyCount: 10,
    }).asReadonly(),
    statusDistribution: signal([]).asReadonly(),
    weeklyTimeSeries: signal([]).asReadonly(),
    monthlyTimeSeries: signal([]).asReadonly(),
    driverStats: signal({
      total: 3,
      active: 2,
      onDelivery: 1,
      packagesInTransit: 3,
      totalPackages: 10,
      drivers: [],
    }).asReadonly(),
    podStats: signal({
      total: 4,
      withPdf: 3,
      locked: 1,
      today: 1,
      thisWeek: 2,
    }).asReadonly(),
    locationDistribution: signal([]).asReadonly(),
    topReceivers: signal([]).asReadonly(),
    driverPerformance: signal([]).asReadonly(),
    lifecycleMetrics: signal({
      avgCreateToPickupHours: null,
      avgPickupToReceiveHours: null,
      avgReceiveToCollectHours: null,
      avgTotalCycleHours: null,
      completedSampleSize: 0,
    }).asReadonly(),
    stuckPackages: signal([]).asReadonly(),
    inventoryHealth: signal({
      totalItems: 0,
      activeItems: 0,
      lowStock: 0,
      outOfStock: 0,
      totalQuantity: 0,
      totalValue: 0,
      topLowStock: [],
    }).asReadonly(),
    topShippedItems: signal([]).asReadonly(),
    hourlyHeatmap: signal({
      counts: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
      max: 0,
      total: 0,
    }).asReadonly(),
    loadDashboardData: vi.fn().mockResolvedValue(undefined),
  };

  const mockOnboardingTourService = {
    start: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        { provide: DashboardService, useValue: mockDashboardService },
        { provide: OnboardingTourService, useValue: mockOnboardingTourService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize create package modal as closed', () => {
    expect(component.createPackageModalOpen).toBe(false);
  });

  it('should compute eight stat items from dashboard signals', () => {
    expect(component.statItems).toHaveLength(8);
    expect(component.statItems[0]).toMatchObject({ label: 'Total Packages', value: 10 });
    expect(component.statItems[6]).toMatchObject({ label: 'Active Drivers', value: 2 });
    expect(component.statItems[7]).toMatchObject({ label: 'PODs Signed', value: 4 });
  });

  it('should load dashboard data and start dashboard tour on init', async () => {
    vi.useFakeTimers();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockDashboardService.loadDashboardData).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(600);
    expect(mockOnboardingTourService.start).toHaveBeenCalledWith('dashboard');
    vi.useRealTimers();
  });

  it('should reload data and log when filters are applied', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const filters: FilterOption[] = [
      { label: 'Option 1', checked: true },
      { label: 'Option 2', checked: false },
    ];

    component.onFilterApply(filters);

    expect(consoleSpy).toHaveBeenCalledWith('Filters applied:', filters);
    expect(mockDashboardService.loadDashboardData).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should open and close the create package modal', () => {
    component.onAddView();
    expect(component.createPackageModalOpen).toBe(true);

    component.onCloseCreatePackageModal();
    expect(component.createPackageModalOpen).toBe(false);
  });

  it('should refresh dashboard data when a package is created', async () => {
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
    expect(mockDashboardService.loadDashboardData).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should navigate to orders with the selected stuck package id', () => {
    component.onStuckPackageClick({
      id: 'pkg-321',
      reference: 'REF-321',
      status: PACKAGE_STATUS.PENDING,
      statusLabel: 'Pending',
      hoursStuck: 30,
      thresholdHours: 24,
      receiverEmail: 'receiver@example.com',
    });

    expect(navigateSpy).toHaveBeenCalledWith(['/orders'], { queryParams: { id: 'pkg-321' } });
  });

  it('should navigate to inventory from inventory CTA', () => {
    component.onViewInventory();
    expect(navigateSpy).toHaveBeenCalledWith(['/inventory'], { queryParams: undefined });
  });

  it('should render the primary dashboard containers', () => {
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-layout'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('app-dashboard-actions'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('app-package-stats-card'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('app-create-package-modal'))).toBeTruthy();
  });
});

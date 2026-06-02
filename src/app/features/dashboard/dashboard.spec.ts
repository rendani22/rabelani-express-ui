import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';

import { Dashboard } from './dashboard';
import { DashboardService } from './services/dashboard.service';
import { OnboardingTourService, PACKAGE_STATUS, Package } from '../../core';

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;

  const dashboardServiceMock = {
    isLoading: signal(false),
    stats: signal({
      total: 42,
      pending: 5,
      inTransit: 6,
      readyForCollection: 7,
      completed: 20,
      todayCount: 4,
      weeklyCount: 18,
      monthlyCount: 30,
      returned: 2,
    }),
    statusDistribution: signal([{ label: 'Pending', value: 5 }]),
    weeklyTimeSeries: signal([{ label: 'Mon', value: 2 }]),
    monthlyTimeSeries: signal([{ label: 'Week 1', value: 8 }]),
    driverStats: signal({ active: 3, total: 4, packagesInTransit: 6 }),
    podStats: signal({ total: 12, withPdf: 9 }),
    locationDistribution: signal([{ label: 'Polokwane', value: 8 }]),
    topReceivers: signal([{ name: 'Acme', count: 6 }]),
    driverPerformance: signal([{ name: 'Driver A', deliveries: 4 }]),
    lifecycleMetrics: signal([{ label: 'Avg Transit', value: '2 days' }]),
    stuckPackages: signal([{ id: 'pkg-1', reference: 'REF-001' }]),
    inventoryHealth: signal({ inStock: 12, lowStock: 1, outOfStock: 0 }),
    topShippedItems: signal([{ name: 'Box', quantity: 12 }]),
    hourlyHeatmap: signal([{ day: 'Mon', hour: 8, value: 2 }]),
    loadDashboardData: vi.fn().mockResolvedValue(undefined),
  };

  const routerMock = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  const onboardingTourMock = {
    start: vi.fn(),
  };

  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        { provide: DashboardService, useValue: dashboardServiceMock },
        { provide: Router, useValue: routerMock },
        { provide: OnboardingTourService, useValue: onboardingTourMock },
      ],
    })
      .overrideComponent(Dashboard, {
        set: { template: '' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should build stat items from the dashboard signals', () => {
    expect(component.statItems).toEqual([
      { label: 'Total Packages', value: 42, icon: 'package', color: 'violet' },
      { label: 'Pending', value: 5, icon: 'clock', color: 'amber' },
      { label: 'In Transit', value: 6, icon: 'truck', color: 'blue' },
      { label: 'Ready to Collect', value: 7, icon: 'inbox', color: 'purple' },
      { label: 'Completed', value: 20, icon: 'check', color: 'green' },
      { label: 'Today', value: 4, icon: 'calendar', color: 'teal', subtitle: '18 this week' },
      { label: 'Active Drivers', value: 3, icon: 'users', color: 'indigo', subtitle: '4 total' },
      { label: 'PODs Signed', value: 12, icon: 'document', color: 'rose', subtitle: '9 with PDF' },
    ]);
  });

  it('should load dashboard data and start onboarding on init', async () => {
    vi.useFakeTimers();

    await component.ngOnInit();

    expect(dashboardServiceMock.loadDashboardData).toHaveBeenCalledWith();

    vi.advanceTimersByTime(600);

    expect(onboardingTourMock.start).toHaveBeenCalledWith('dashboard');
  });

  it('should reload data when the date range changes', () => {
    const range = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-31T00:00:00Z') };

    component.onDateChange(range);

    expect(dashboardServiceMock.loadDashboardData).toHaveBeenCalledWith(range);
  });

  it('should log reload failures for date changes', async () => {
    const error = new Error('reload failed');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    dashboardServiceMock.loadDashboardData.mockRejectedValueOnce(error);

    component.onDateChange({ start: new Date('2026-02-01T00:00:00Z') });
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleSpy).toHaveBeenCalledWith('[Dashboard] Failed to reload data for date range:', error);
  });

  it('should log filters and reload data when filters are applied', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const filters = [{ label: 'Pending', checked: true }];

    component.onFilterApply(filters);

    expect(consoleSpy).toHaveBeenCalledWith('Filters applied:', filters);
    expect(dashboardServiceMock.loadDashboardData).toHaveBeenCalledWith();
  });

  it('should open and close the create package modal', () => {
    component.onAddView();
    expect(component.createPackageModalOpen).toBe(true);

    component.onCloseCreatePackageModal();
    expect(component.createPackageModalOpen).toBe(false);
  });

  it('should reload data after a package is created', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const pkg = {
      id: 'pkg-1',
      reference: 'REF-001',
      receiver_email: 'receiver@example.com',
      status: PACKAGE_STATUS.PENDING,
      created_at: '2026-01-01T00:00:00Z',
      notes: null,
      items: [],
    } as Package;

    await component.onPackageCreated(pkg);

    expect(consoleSpy).toHaveBeenCalledWith('Package created:', pkg);
    expect(dashboardServiceMock.loadDashboardData).toHaveBeenCalledTimes(1);
  });

  it('should navigate to the selected stuck package', () => {
    component.onStuckPackageClick({ id: 'pkg-42', reference: 'REF-042' } as never);

    expect(routerMock.navigate).toHaveBeenCalledWith(['/orders'], { queryParams: { id: 'pkg-42' } });
  });

  it('should navigate to inventory', () => {
    component.onViewInventory();

    expect(routerMock.navigate).toHaveBeenCalledWith(['/inventory']);
  });
});

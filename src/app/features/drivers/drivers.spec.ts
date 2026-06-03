import { signal, computed } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { DriversComponent } from './drivers';
import { DriverService, StaffService, SettingsService, DriverProfile, PACKAGE_STATUS } from '../../core';
import { ToastService } from '../../shared/components/toast/toast.service';

const mockDriver: DriverProfile = {
  id: 'drv-1',
  user_id: 'user-1',
  email: 'driver@example.com',
  full_name: 'John Driver',
  role: 'driver',
  is_active: true,
  is_available: true,
  phone: '0821234567',
  current_location: {
    id: 'loc-1',
    driver_id: 'drv-1',
    user_id: 'user-1',
    latitude: -25.7,
    longitude: 28.2,
    updated_at: new Date().toISOString(),
  },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockOfflineDriver: DriverProfile = {
  ...mockDriver,
  id: 'drv-2',
  full_name: 'Jane Offline',
  email: 'jane@example.com',
  current_location: undefined,
  is_available: false,
};

describe('DriversComponent', () => {
  let component: DriversComponent;
  let fixture: ComponentFixture<DriversComponent>;

  const driversSignal = signal<DriverProfile[]>([mockDriver, mockOfflineDriver]);

  const driverServiceMock = {
    drivers: driversSignal,
    loading: signal(false),
    error: signal<string | null>(null),
    selectedDriver: signal<DriverProfile | null>(null),
    selectedDriverPackages: signal<any[]>([]),
    mapMarkers: computed(() => []),
    availableDriversCount: computed(() => 1),
    onDeliveryCount: computed(() => 0),
    loadDrivers: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    selectDriver: vi.fn().mockResolvedValue(undefined),
  };

  const staffServiceMock = {
    isAdmin: computed(() => true),
    deactivateStaff: vi.fn().mockResolvedValue({ success: true, error: null }),
  };

  const settingsServiceMock = {
    defaultDriversView: vi.fn().mockReturnValue('list'),
    autoRefreshEnabled: vi.fn().mockReturnValue(false),
    autoRefreshIntervalMs: vi.fn().mockReturnValue(30000),
  };

  const toastServiceMock = {
    success: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    driversSignal.set([mockDriver, mockOfflineDriver]);
    driverServiceMock.selectedDriver.set(null);

    await TestBed.configureTestingModule({
      imports: [DriversComponent],
      providers: [
        { provide: DriverService, useValue: driverServiceMock },
        { provide: StaffService, useValue: staffServiceMock },
        { provide: SettingsService, useValue: settingsServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
      ],
    })
      .overrideComponent(DriversComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(DriversComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load drivers on init', async () => {
    await component.ngOnInit();
    expect(driverServiceMock.loadDrivers).toHaveBeenCalled();
  });

  it('should expose all drivers initially', () => {
    expect(component.filteredDrivers()).toHaveLength(2);
  });

  it('should filter drivers by search query', () => {
    component.onSearchChange({ target: { value: 'john' } } as unknown as Event);
    expect(component.filteredDrivers()).toHaveLength(1);
    expect(component.filteredDrivers()[0].full_name).toBe('John Driver');
  });

  it('should filter drivers by email', () => {
    component.onSearchChange({ target: { value: 'jane@' } } as unknown as Event);
    expect(component.filteredDrivers()).toHaveLength(1);
    expect(component.filteredDrivers()[0].full_name).toBe('Jane Offline');
  });

  it('should return all drivers when search is empty', () => {
    component.onSearchChange({ target: { value: '' } } as unknown as Event);
    expect(component.filteredDrivers()).toHaveLength(2);
  });

  it('should toggle view mode between map and list', () => {
    const initial = component.viewMode();
    component.toggleViewMode();
    expect(component.viewMode()).not.toBe(initial);
    component.toggleViewMode();
    expect(component.viewMode()).toBe(initial);
  });

  it('should map a driver to User interface', () => {
    const user = component.mapDriverToUser(mockDriver);
    expect(user.id).toBe('drv-1');
    expect(user.name).toBe('John Driver');
    expect(user.bio).toContain('driver@example.com');
    expect(user.bio).toContain('0821234567');
  });

  it('should show Available status for active driver with recent location', () => {
    const user = component.mapDriverToUser(mockDriver);
    expect(user.country).toBe('Available');
    expect(user.countryFlag).toBe('🟢');
  });

  it('should show No Location status for active driver without location', () => {
    const user = component.mapDriverToUser(mockOfflineDriver);
    expect(user.country).toBe('No Location');
  });

  it('should show Inactive for deactivated driver', () => {
    const user = component.mapDriverToUser({ ...mockDriver, is_active: false });
    expect(user.country).toBe('Inactive');
    expect(user.countryFlag).toBe('⚫');
  });

  it('should compute stats from drivers', () => {
    const stats = component.stats();
    expect(stats.total).toBe(2);
    expect(stats.available).toBe(1);
  });

  it('should open and close the add driver modal', () => {
    component.onAddDriver();
    expect(component.addDriverModalOpen()).toBe(true);

    component.onCloseAddDriverModal();
    expect(component.addDriverModalOpen()).toBe(false);
  });

  it('should open and close the edit driver modal', () => {
    component.onEditDriver(mockDriver);
    expect(component.editDriverModalOpen()).toBe(true);
    expect(component.driverToEdit()).toBe(mockDriver);

    component.onCloseEditDriverModal();
    expect(component.editDriverModalOpen()).toBe(false);
    expect(component.driverToEdit()).toBeNull();
  });

  it('should open deactivate confirmation dialog', async () => {
    await component.onDeactivateDriver(mockDriver);
    expect(component.confirmDeactivateOpen()).toBe(true);
    expect(component.driverPendingDeactivation()).toBe(mockDriver);
    expect(component.deactivateDriverMessage()).toContain('John Driver');
  });

  it('should confirm deactivation and show toast', async () => {
    await component.onDeactivateDriver(mockDriver);
    await component.onConfirmDeactivate();
    expect(staffServiceMock.deactivateStaff).toHaveBeenCalledWith('drv-1');
    expect(toastServiceMock.success).toHaveBeenCalledWith(expect.stringContaining('John Driver'));
    expect(component.confirmDeactivateOpen()).toBe(false);
  });

  it('should cancel deactivation', async () => {
    await component.onDeactivateDriver(mockDriver);
    component.onCancelDeactivate();
    expect(component.confirmDeactivateOpen()).toBe(false);
    expect(component.driverPendingDeactivation()).toBeNull();
    expect(staffServiceMock.deactivateStaff).not.toHaveBeenCalled();
  });

  it('should close driver details panel', () => {
    component.onCloseDriverDetails();
    expect(driverServiceMock.selectDriver).toHaveBeenCalledWith(null);
  });

  it('should reload after driver creation', async () => {
    await component.onDriverCreated(mockDriver);
    expect(toastServiceMock.success).toHaveBeenCalledWith(expect.stringContaining('John Driver'));
    expect(driverServiceMock.loadDrivers).toHaveBeenCalled();
  });

  it('should reload after driver update', async () => {
    await component.onDriverUpdated(mockDriver);
    expect(toastServiceMock.success).toHaveBeenCalledWith(expect.stringContaining('John Driver'));
    expect(driverServiceMock.loadDrivers).toHaveBeenCalled();
  });

  it('should handle viewOnMap menu option', async () => {
    await component.onCardAction({ userId: 'drv-1', actionType: 'menuOption', menuOption: 'viewOnMap' });
    expect(component.viewMode()).toBe('map');
    expect(driverServiceMock.selectDriver).toHaveBeenCalledWith(mockDriver);
  });

  it('should handle viewPackages menu option', async () => {
    await component.onCardAction({ userId: 'drv-1', actionType: 'menuOption', menuOption: 'viewPackages' });
    expect(driverServiceMock.selectDriver).toHaveBeenCalledWith(mockDriver);
  });

  it('should handle edit menu option', async () => {
    await component.onCardAction({ userId: 'drv-1', actionType: 'menuOption', menuOption: 'edit' });
    expect(component.editDriverModalOpen()).toBe(true);
  });

  it('should handle deactivate menu option', async () => {
    await component.onCardAction({ userId: 'drv-1', actionType: 'menuOption', menuOption: 'deactivate' });
    expect(component.confirmDeactivateOpen()).toBe(true);
  });

  it('should no-op when driver is not found in card action', async () => {
    await component.onCardAction({ userId: 'missing', actionType: 'menuOption', menuOption: 'deactivate' });
    expect(component.confirmDeactivateOpen()).toBe(false);
  });

  it('should return package status labels', () => {
    expect(component.getPackageStatusLabel(PACKAGE_STATUS.IN_TRANSIT)).toBe('In Transit');
    expect(component.getPackageStatusLabel(PACKAGE_STATUS.DELIVERED)).toBe('Delivered');
    expect(component.getPackageStatusLabel('unknown')).toBe('unknown');
  });

  it('should track drivers and packages by id', () => {
    expect(component.trackByDriverId(0, mockDriver)).toBe('drv-1');
    const pkg = { id: 'pkg-1' } as any;
    expect(component.trackByPackageId(0, pkg)).toBe('pkg-1');
  });

  it('should generate an avatar URL from name', () => {
    const url = component.generateAvatarUrl('Test Name');
    expect(url).toContain('ui-avatars.com');
    expect(url).toContain('Test%20Name');
  });
});

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { DeliveryLocationsComponent } from './delivery-locations';
import { DeliveryLocationService, DeliveryLocation } from '../../core';
import { ToastService } from '../../shared/components/toast/toast.service';
import { ConfirmService } from '../../shared/components/confirm-dialog';

const mockLocation: DeliveryLocation = {
  id: 'loc-1',
  name: 'Warehouse A',
  description: 'Main warehouse',
  address: '1 Main Street',
  notes: 'Ring bell',
  latitude: -25.7461,
  longitude: 28.1881,
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockInactiveLocation: DeliveryLocation = {
  ...mockLocation,
  id: 'loc-2',
  name: 'Old Depot',
  description: 'Inactive site',
  address: '5 River Road',
  notes: '',
  is_active: false,
};

describe('DeliveryLocationsComponent', () => {
  let component: DeliveryLocationsComponent;
  let fixture: ComponentFixture<DeliveryLocationsComponent>;

  const locationsSignal = signal<DeliveryLocation[]>([mockLocation, mockInactiveLocation]);

  const locationServiceMock = {
    locations: locationsSignal,
    loading: signal(false),
    loadLocations: vi.fn().mockResolvedValue(undefined),
    createLocation: vi.fn().mockResolvedValue({ error: null, location: { ...mockLocation, name: 'New Point' } }),
    updateLocation: vi.fn().mockResolvedValue({ error: null, location: mockLocation }),
    deactivateLocation: vi.fn().mockResolvedValue({ error: null }),
    reactivateLocation: vi.fn().mockResolvedValue({ error: null }),
    deleteLocation: vi.fn().mockResolvedValue({ error: null }),
  };

  const toastServiceMock = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  };

  const confirmServiceMock = {
    confirm: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    locationsSignal.set([mockLocation, mockInactiveLocation]);

    await TestBed.configureTestingModule({
      imports: [DeliveryLocationsComponent],
      providers: [
        { provide: DeliveryLocationService, useValue: locationServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
      ],
    })
      .overrideComponent(DeliveryLocationsComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(DeliveryLocationsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load locations on init', async () => {
    await component.ngOnInit();
    expect(locationServiceMock.loadLocations).toHaveBeenCalled();
  });

  it('should expose all locations initially', () => {
    expect(component.filteredLocations()).toHaveLength(2);
  });

  it('should filter locations by search query (name)', () => {
    component.onSearchChange({ target: { value: 'Warehouse' } } as unknown as Event);
    expect(component.filteredLocations()).toHaveLength(1);
    expect(component.filteredLocations()[0].name).toBe('Warehouse A');
  });

  it('should filter locations by address', () => {
    component.onSearchChange({ target: { value: 'Main Street' } } as unknown as Event);
    expect(component.filteredLocations()).toHaveLength(1);
  });

  it('should show add form and hide editing id', () => {
    component.onShowAddForm();
    expect(component.showAddForm()).toBe(true);
    expect(component.editingId()).toBeNull();
  });

  it('should populate editForm when starting edit', () => {
    component.onStartEdit(mockLocation);
    expect(component.editingId()).toBe('loc-1');
    expect(component.editForm.value.name).toBe('Warehouse A');
    expect(component.editForm.value.address).toBe('1 Main Street');
    expect(component.showAddForm()).toBe(false);
  });

  it('should cancel edit and clear form', async () => {
    component.onStartEdit(mockLocation);
    await component.onCancelEdit();
    expect(component.editingId()).toBeNull();
  });

  it('should not submit add form when invalid', async () => {
    component.onShowAddForm();
    await component.onSubmitAdd();
    expect(locationServiceMock.createLocation).not.toHaveBeenCalled();
  });

  it('should create a location with valid add form', async () => {
    component.onShowAddForm();
    component.addForm.patchValue({
      name: 'New Point',
      description: 'A delivery point',
      address: '5 Oak Ave',
      notes: '',
      latitude: null,
      longitude: null,
    });

    await component.onSubmitAdd();
    expect(locationServiceMock.createLocation).toHaveBeenCalled();
    expect(toastServiceMock.success).toHaveBeenCalledWith(expect.stringContaining('New Point'));
    expect(component.showAddForm()).toBe(false);
  });

  it('should show error toast when create fails', async () => {
    locationServiceMock.createLocation.mockResolvedValueOnce({ error: 'Server error', location: null });
    component.onShowAddForm();
    component.addForm.patchValue({
      name: 'Fail Point',
      description: 'desc',
      address: 'addr',
      notes: '',
      latitude: null,
      longitude: null,
    });

    await component.onSubmitAdd();
    expect(toastServiceMock.error).toHaveBeenCalledWith('Server error');
  });

  it('should warn when only one geo coordinate is provided', async () => {
    component.onShowAddForm();
    component.addForm.patchValue({
      name: 'Partial Geo',
      description: 'desc',
      address: 'addr',
      notes: '',
      latitude: -25.0 as unknown as null,
      longitude: null,
    });

    await component.onSubmitAdd();
    expect(toastServiceMock.warning).toHaveBeenCalled();
    expect(locationServiceMock.createLocation).not.toHaveBeenCalled();
  });

  it('should update a location with valid edit form', async () => {
    component.onStartEdit(mockLocation);
    component.editForm.patchValue({ name: 'Warehouse A Updated' });

    await component.onSubmitEdit(mockLocation);
    expect(locationServiceMock.updateLocation).toHaveBeenCalledWith('loc-1', expect.any(Object));
    expect(toastServiceMock.success).toHaveBeenCalled();
  });

  it('should deactivate an active location', async () => {
    await component.onToggleActive(mockLocation);
    expect(locationServiceMock.deactivateLocation).toHaveBeenCalledWith('loc-1');
    expect(toastServiceMock.success).toHaveBeenCalledWith(expect.stringContaining('deactivated'));
  });

  it('should reactivate an inactive location', async () => {
    await component.onToggleActive(mockInactiveLocation);
    expect(locationServiceMock.reactivateLocation).toHaveBeenCalledWith('loc-2');
    expect(toastServiceMock.success).toHaveBeenCalledWith(expect.stringContaining('reactivated'));
  });

  it('should open delete confirmation and confirm delete', async () => {
    component.onDeleteRequest(mockLocation);
    expect(component.confirmDeleteOpen()).toBe(true);
    expect(component.locationPendingDelete()).toBe(mockLocation);

    await component.onConfirmDelete();
    expect(locationServiceMock.deleteLocation).toHaveBeenCalledWith('loc-1');
    expect(toastServiceMock.success).toHaveBeenCalledWith(expect.stringContaining('deleted'));
    expect(component.confirmDeleteOpen()).toBe(false);
  });

  it('should cancel delete', () => {
    component.onDeleteRequest(mockLocation);
    component.onCancelDelete();
    expect(component.confirmDeleteOpen()).toBe(false);
    expect(component.locationPendingDelete()).toBeNull();
    expect(locationServiceMock.deleteLocation).not.toHaveBeenCalled();
  });

  it('should call loadLocations on refresh', async () => {
    await component.onRefresh();
    expect(locationServiceMock.loadLocations).toHaveBeenCalled();
  });

  it('should return no field error when field is untouched', () => {
    expect(component.getAddFieldError('name')).toBeNull();
  });

  it('should return required error message after touching an empty field', () => {
    component.addForm.get('name')!.markAsTouched();
    expect(component.getAddFieldError('name')).toBe('This field is required.');
  });

  it('should track locations by id', () => {
    expect(component.trackById(0, mockLocation)).toBe('loc-1');
  });
});

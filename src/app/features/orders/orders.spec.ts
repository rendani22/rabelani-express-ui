import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';

import { OrdersComponent } from './orders';
import {
  OnboardingTourService,
  PACKAGE_STATUS,
  Package,
  PackageService,
  SettingsService,
  StaffService,
} from '../../core';
import { ToastService } from '../../shared/components/toast/toast.service';
import { SupabaseService } from '../../shared/services/supabase.service';
import { Transaction } from '../../shared/components/transaction/transaction-table/transaction-table.component';

describe('OrdersComponent', () => {
  let component: OrdersComponent;
  let fixture: ComponentFixture<OrdersComponent>;

  const packagesSignal = signal<Package[]>([]);
  const totalCountSignal = signal<number | null>(null);

  const packageServiceMock = {
    loadPackages: vi.fn().mockResolvedValue(undefined),
    packages: packagesSignal,
    isLoading: signal(false),
    error: signal<string | null>(null),
    totalCount: totalCountSignal,
    canDeleteOrders: signal(false),
    updatePackage: vi.fn().mockResolvedValue({ success: true }),
    receiveAtCollection: vi.fn().mockResolvedValue({ success: true }),
    deletePackages: vi.fn().mockResolvedValue({ success: true, deleted: 2 }),
    deletePackageWithInventoryReturn: vi.fn().mockResolvedValue({ success: true, returnedItems: 0 }),
  };

  const staffServiceMock = {
    currentProfile: vi.fn().mockReturnValue(null),
    loadCurrentProfile: vi.fn().mockResolvedValue({ full_name: 'Admin User', role: 'admin' }),
  };

  const settingsServiceMock = {
    defaultOrdersFilter: vi.fn().mockReturnValue('all'),
  };

  const toastServiceMock = {
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  };

  const supabaseServiceMock = {
    client: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }),
    },
  };

  const onboardingTourMock = {
    start: vi.fn(),
  };

  const routerMock = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  const samplePackage = {
    id: 'pkg-1',
    reference: 'REF-001',
    po_number: 'PO-001',
    receiver_email: 'receiver@example.com',
    notes: 'Handle with care',
    status: PACKAGE_STATUS.PENDING,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-02T10:00:00Z',
    items: [],
  } as Package;

  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    packagesSignal.set([]);
    totalCountSignal.set(null);

    await TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [
        { provide: PackageService, useValue: packageServiceMock },
        { provide: StaffService, useValue: staffServiceMock },
        { provide: SettingsService, useValue: settingsServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: SupabaseService, useValue: supabaseServiceMock },
        { provide: OnboardingTourService, useValue: onboardingTourMock },
        { provide: Router, useValue: routerMock },
      ],
    })
      .overrideComponent(OrdersComponent, {
        set: { template: '' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(OrdersComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load packages and start onboarding on init', async () => {
    vi.useFakeTimers();

    await component.ngOnInit();

    expect(packageServiceMock.loadPackages).toHaveBeenCalledWith({ page: 1, pageSize: 10 });

    vi.advanceTimersByTime(700);

    expect(onboardingTourMock.start).toHaveBeenCalledWith('orders');
  });

  it('should reload using the current search term and status filter', async () => {
    await component.onSearch(' receiver ');
    expect(packageServiceMock.loadPackages).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, search: 'receiver' });

    await component.onStatusFilterChange(PACKAGE_STATUS.PENDING);
    expect(packageServiceMock.loadPackages).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 10,
      status: PACKAGE_STATUS.PENDING,
      search: 'receiver',
    });
  });

  it('should toggle sorting for the same field and reset pagination', () => {
    component.currentPage.set(3);

    component.onSortChange({ field: 'lastUpdated' });
    expect(component.sortDirection()).toBe('asc');
    expect(component.currentPage()).toBe(1);

    component.onSortChange({ field: 'paymentDate' });
    expect(component.sortField()).toBe('paymentDate');
    expect(component.sortDirection()).toBe('desc');
  });

  it('should open and close the create package modal', () => {
    component.onAddPackage();
    expect(component.createPackageModalOpen).toBe(true);

    component.onCloseCreatePackageModal();
    expect(component.createPackageModalOpen).toBe(false);
  });

  it('should notify and reload after package creation', async () => {
    await component.onPackageCreated(samplePackage);

    expect(toastServiceMock.success).toHaveBeenCalledWith('Package REF-001 created successfully!');
    expect(component.createPackageModalOpen).toBe(false);
    expect(packageServiceMock.loadPackages).toHaveBeenCalled();
  });

  it('should open the details panel for a duplicate package', () => {
    component.createPackageModalOpen = true;

    component.onViewDuplicatePackage(samplePackage);

    expect(component.createPackageModalOpen).toBe(false);
    expect(component.selectedPackage()).toBe(samplePackage);
    expect(component.detailsPanelOpen()).toBe(true);
    expect(toastServiceMock.info).toHaveBeenCalledWith('Showing existing order REF-001 with the same PO number.');
  });

  it('should select a transaction package and open the details panel', () => {
    packagesSignal.set([samplePackage]);
    const transaction = { id: samplePackage.id } as Transaction;

    component.onTransactionSelected(transaction);

    expect(component.selectedPackage()).toBe(samplePackage);
    expect(component.detailsPanelOpen()).toBe(true);
  });

  it('should close the details panel and clear the selected package', () => {
    component.selectedPackage.set(samplePackage);
    component.detailsPanelOpen.set(true);

    component.onCloseDetailsPanel();

    expect(component.selectedPackage()).toBeNull();
    expect(component.detailsPanelOpen()).toBe(false);
  });

  it('should update draft packages directly', async () => {
    const draftPackage = { ...samplePackage, status: PACKAGE_STATUS.DRAFT } as Package;
    component.selectedPackage.set(draftPackage);
    component.detailsPanelOpen.set(true);

    await component.onUpdatePackageStatus(draftPackage);

    expect(packageServiceMock.updatePackage).toHaveBeenCalledWith(draftPackage.id, { status: PACKAGE_STATUS.NOTIFIED });
    expect(toastServiceMock.success).toHaveBeenCalledWith('Package REF-001 status updated to Notified.');
    expect(component.detailsPanelOpen()).toBe(false);
  });

  it('should open the assign-driver modal for pending packages', async () => {
    await component.onUpdatePackageStatus(samplePackage);

    expect(component.assignDriverModalOpen()).toBe(true);
    expect(component.packageAwaitingDriver()).toBe(samplePackage);
    expect(packageServiceMock.updatePackage).not.toHaveBeenCalled();
  });

  it('should open the mark-collected modal for ready packages', async () => {
    const readyPackage = { ...samplePackage, status: PACKAGE_STATUS.READY_FOR_COLLECTION } as Package;

    await component.onUpdatePackageStatus(readyPackage);

    expect(component.markCollectedModalOpen()).toBe(true);
    expect(component.packageAwaitingCollection()).toBe(readyPackage);
  });

  it('should keep the mark-collected modal open while submitting', () => {
    component.markCollectedModalOpen.set(true);
    component.packageAwaitingCollection.set(samplePackage);
    component.isSubmittingCollection.set(true);

    component.onCloseMarkCollectedModal();

    expect(component.markCollectedModalOpen()).toBe(true);
    expect(component.packageAwaitingCollection()).toBe(samplePackage);
  });

  it('should close the assign-driver modal when idle', () => {
    component.assignDriverModalOpen.set(true);
    component.packageAwaitingDriver.set(samplePackage);

    component.onCloseAssignDriverModal();

    expect(component.assignDriverModalOpen()).toBe(false);
    expect(component.packageAwaitingDriver()).toBeNull();
  });

  it('should update the selected ids on selection change', () => {
    const selection = new Set(['pkg-1', 'pkg-2']);

    component.onSelectionChanged(selection);

    expect(component.selectedIds()).toEqual(selection);
  });

  it('should delete selected packages, clear the selection, and reload', async () => {
    component.selectedIds.set(new Set(['pkg-1', 'pkg-2']));

    await component.onDeletePackages(['pkg-1', 'pkg-2']);

    expect(packageServiceMock.deletePackages).toHaveBeenCalledWith(['pkg-1', 'pkg-2']);
    expect(toastServiceMock.success).toHaveBeenCalledWith('2 packages deleted successfully.');
    expect(component.selectedIds().size).toBe(0);
    expect(packageServiceMock.loadPackages).toHaveBeenCalled();
  });

  it('should show and close the QR code modal', () => {
    component.showQrCode(samplePackage);

    expect(component.qrCodeModalOpen()).toBe(true);
    expect(component.qrCodeData()).toContain('REF-001');

    component.closeQrCodeModal();

    expect(component.qrCodeModalOpen()).toBe(false);
    expect(component.qrCodeData()).toBe('');
  });

  it('should clamp pagination requests to the last page', async () => {
    totalCountSignal.set(25);

    await component.goToPage(9);

    expect(component.currentPage()).toBe(3);
    expect(packageServiceMock.loadPackages).toHaveBeenCalledWith({ page: 3, pageSize: 10 });
  });
});

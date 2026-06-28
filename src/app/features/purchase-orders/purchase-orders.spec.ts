import { TestBed, getTestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PurchaseOrdersComponent } from './purchase-orders';
import { PurchaseOrdersService } from './services/purchase-orders.service';
import { PurchaseOrderCrudService } from './services/purchase-order-crud.service';
import { ToastService } from '../../shared/components/toast';
import { PodExportService } from '../pods/services/pod-export.service';
import { FileSaveService } from '../../shared/services/file-save.service';
import { PACKAGE_STATUS } from '../../core';
import type { PackageStatus } from '../../core';
import type { PurchaseOrder } from './purchase-orders.models';
import type { PurchaseOrderEditFormValue, UpdatePurchaseOrderRequest } from '../../shared/components/modals';

function makePo(poNumber: string, statuses: readonly PackageStatus[]): PurchaseOrder {
  return {
    poNumber,
    packages: statuses.map((status, i) => ({ id: `${poNumber}-pkg-${i}`, status })),
  } as unknown as PurchaseOrder;
}

try {
  getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
} catch {
  // Already initialized by Angular test runner.
}

describe('PurchaseOrdersComponent', () => {
  let component: PurchaseOrdersComponent;

  const purchaseOrdersServiceMock = {
    isLoading: signal(false),
    error: signal<string | null>(null),
    stats: signal(null),
    filteredPurchaseOrders: signal([]),
    load: vi.fn().mockResolvedValue(undefined),
    setSearch: vi.fn(),
    setStatusFilter: vi.fn(),
  };

  const purchaseOrderCrudMock = {
    updatePurchaseOrder: vi.fn(),
  };

  const toastServiceMock = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  };

  const routerMock = {
    navigate: vi.fn(),
  };

  const podExportMock = {
    createExportJob: vi.fn(),
    getJob: vi.fn(),
  };

  const fileSaveMock = {
    saveBlob: vi.fn().mockResolvedValue(undefined),
  };

  const selectedPo: PurchaseOrderEditFormValue = {
    purchaseOrderId: 'po-1',
    poNumber: 'PO-001',
    receiverId: 'rec-1',
    poValue: 1500,
    poDate: '2026-06-28',
    details: 'PO notes',
    items: [
      {
        purchaseOrderItemId: 'poi-1',
        inventoryItemId: 'inv-1',
        orderedQuantity: 5,
        minAllowedQuantity: 0,
      },
    ],
  };

  const updateRequest: UpdatePurchaseOrderRequest = {
    purchaseOrderId: 'po-1',
    poNumber: 'PO-001',
    receiverId: 'rec-1',
    poValue: 1500,
    poDate: '2026-06-28',
    details: 'PO notes',
    items: [
      {
        purchaseOrderItemId: 'poi-1',
        orderedQuantity: 6,
      },
    ],
  };

  beforeEach(async () => {
    purchaseOrdersServiceMock.load.mockResolvedValue(undefined);
    purchaseOrderCrudMock.updatePurchaseOrder.mockReset();
    toastServiceMock.success.mockReset();
    toastServiceMock.error.mockReset();
    podExportMock.createExportJob.mockReset();
    podExportMock.getJob.mockReset();
    fileSaveMock.saveBlob.mockReset().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        { provide: ToastService, useValue: toastServiceMock },
        { provide: Router, useValue: routerMock },
        { provide: PurchaseOrdersService, useValue: purchaseOrdersServiceMock },
        { provide: PurchaseOrderCrudService, useValue: purchaseOrderCrudMock },
        { provide: PodExportService, useValue: podExportMock },
        { provide: FileSaveService, useValue: fileSaveMock },
      ],
    });

    component = TestBed.runInInjectionContext(() => new PurchaseOrdersComponent());
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('keeps modal open when user closes while update is active', () => {
    component.editPoModalOpen.set(true);
    component.selectedPoForEdit.set(selectedPo);
    component.isUpdatingPo.set(true);

    component.onCloseEditPo();

    expect(component.editPoModalOpen()).toBe(true);
    expect(component.selectedPoForEdit()).toEqual(selectedPo);
  });

  it('closes and clears edit modal after successful update', async () => {
    component.editPoModalOpen.set(true);
    component.selectedPoForEdit.set(selectedPo);
    purchaseOrderCrudMock.updatePurchaseOrder.mockResolvedValue({ success: true });

    await component.onPurchaseOrderUpdated(updateRequest);

    expect(component.editPoModalOpen()).toBe(false);
    expect(component.selectedPoForEdit()).toBeNull();
    expect(component.isUpdatingPo()).toBe(false);
    expect(toastServiceMock.success).toHaveBeenCalledWith(
      'Purchase order PO-001 updated successfully.'
    );
  });

  it('surfaces duplicate po number error and keeps edit modal state on update failure', async () => {
    component.editPoModalOpen.set(true);
    component.selectedPoForEdit.set(selectedPo);
    purchaseOrderCrudMock.updatePurchaseOrder.mockResolvedValue({
      success: false,
      error: 'A purchase order with this number already exists',
    });

    await component.onPurchaseOrderUpdated(updateRequest);

    expect(toastServiceMock.error).toHaveBeenCalledWith(
      'A purchase order with this number already exists'
    );
    expect(component.editPoModalOpen()).toBe(true);
    expect(component.selectedPoForEdit()).toEqual(selectedPo);
    expect(component.isUpdatingPo()).toBe(false);
  });

  // ── Bulk POD download ─────────────────────────────────────────────────────

  it('counts only delivered/collected orders as POD-eligible', () => {
    const po = makePo('PO-001', [
      PACKAGE_STATUS.DELIVERED,
      PACKAGE_STATUS.COLLECTED,
      PACKAGE_STATUS.PENDING,
      PACKAGE_STATUS.DRAFT,
      PACKAGE_STATUS.RETURNED,
    ]);

    expect(component.completedPodCount(po)).toBe(2);
  });

  it('enables bulk POD download when at least one order is completed', () => {
    expect(component.canBulkDownloadPods(makePo('PO-A', []))).toBe(false);
    expect(component.canBulkDownloadPods(makePo('PO-B', [PACKAGE_STATUS.PENDING]))).toBe(false);
    expect(component.canBulkDownloadPods(makePo('PO-C', [PACKAGE_STATUS.COLLECTED]))).toBe(true);
    expect(
      component.canBulkDownloadPods(makePo('PO-D', [PACKAGE_STATUS.COLLECTED, PACKAGE_STATUS.DELIVERED]))
    ).toBe(true);
  });

  it('does nothing when bulk download is not eligible', async () => {
    await component.onBulkDownloadPods(makePo('PO-E', [PACKAGE_STATUS.PENDING]));

    expect(podExportMock.createExportJob).not.toHaveBeenCalled();
    expect(fileSaveMock.saveBlob).not.toHaveBeenCalled();
  });

  it('zips PODs for completed orders and saves the blob', async () => {
    const blob = new Blob(['zip'], { type: 'application/zip' });
    podExportMock.createExportJob.mockReturnValue('job-1');
    podExportMock.getJob.mockReturnValue({
      progress: signal(100),
      status: signal('complete'),
      promise: Promise.resolve({ success: true, blob }),
    });

    const po = makePo('PO-005', [
      PACKAGE_STATUS.COLLECTED,
      PACKAGE_STATUS.DELIVERED,
      PACKAGE_STATUS.PENDING,
    ]);

    await component.onBulkDownloadPods(po);

    expect(podExportMock.createExportJob).toHaveBeenCalledWith(
      ['PO-005-pkg-0', 'PO-005-pkg-1'],
      { merge: false }
    );
    expect(fileSaveMock.saveBlob).toHaveBeenCalledWith(blob, { suggestedName: 'pods-PO-005.zip' });
    expect(toastServiceMock.success).toHaveBeenCalledWith('Downloaded 2 PODs for PO-005.');
    expect(component.downloadingPodsPoNumber()).toBeNull();
  });

  it('surfaces an error and clears downloading state when the export fails', async () => {
    podExportMock.createExportJob.mockReturnValue('job-2');
    podExportMock.getJob.mockReturnValue({
      progress: signal(0),
      status: signal('failed'),
      promise: Promise.resolve({ success: false, error: 'Export failed' }),
    });

    const po = makePo('PO-006', [PACKAGE_STATUS.COLLECTED, PACKAGE_STATUS.COLLECTED]);

    await component.onBulkDownloadPods(po);

    expect(fileSaveMock.saveBlob).not.toHaveBeenCalled();
    expect(toastServiceMock.error).toHaveBeenCalledWith('Export failed');
    expect(component.downloadingPodsPoNumber()).toBeNull();
  });
});

import { TestBed, getTestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PurchaseOrdersComponent } from './purchase-orders';
import { PurchaseOrdersService } from './services/purchase-orders.service';
import { PurchaseOrderCrudService } from './services/purchase-order-crud.service';
import { ToastService } from '../../shared/components/toast';
import type { PurchaseOrderEditFormValue, UpdatePurchaseOrderRequest } from '../../shared/components/modals';

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

  const selectedPo: PurchaseOrderEditFormValue = {
    purchaseOrderId: 'po-1',
    poNumber: 'PO-001',
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

    TestBed.configureTestingModule({
      providers: [
        { provide: ToastService, useValue: toastServiceMock },
        { provide: Router, useValue: routerMock },
        { provide: PurchaseOrdersService, useValue: purchaseOrdersServiceMock },
        { provide: PurchaseOrderCrudService, useValue: purchaseOrderCrudMock },
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
});

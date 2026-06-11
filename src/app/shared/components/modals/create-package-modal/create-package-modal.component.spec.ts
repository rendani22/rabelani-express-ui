import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CreatePackageModalComponent } from './create-package-modal.component';
import {
  DeliveryLocationService,
  InventoryService,
  PackageService,
  ReceiverService,
} from '../../../../core';
import { ToastService } from '../../toast/toast.service';
import { ConfirmService } from '../../confirm-dialog';

describe('CreatePackageModalComponent', () => {
  let fixture: ComponentFixture<CreatePackageModalComponent>;
  let component: CreatePackageModalComponent;

  const packageServiceMock = {
    isLoading: signal(false),
    getPurchaseOrderByNumber: vi.fn(),
    getPackageByPoNumber: vi.fn(),
    createPackage: vi.fn(),
  };

  const receiverServiceMock = {
    loading: signal(false),
    receiverList: signal([]),
    loadAllReceivers: vi.fn(),
  };

  const deliveryLocationServiceMock = {
    loading: signal(false),
    locations: signal([]),
    loadLocations: vi.fn(),
  };

  const inventoryServiceMock = {
    loading: signal(false),
    activeItems: signal([
      {
        id: 'inv-1',
        name: 'Laptop',
        sku: 'LP-001',
        quantity: 10,
        unit: 'pcs',
        min_quantity: 1,
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]),
    loadItems: vi.fn(),
    deductStock: vi.fn(),
  };

  const toastServiceMock = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  };

  const confirmServiceMock = {
    open: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    packageServiceMock.getPurchaseOrderByNumber.mockResolvedValue({
      success: true,
      data: {
        poNumber: 'PO-1001',
        items: [
          {
            purchaseOrderItemId: 'poi-1',
            purchaseOrderId: 'po-1',
            inventoryItemId: 'inv-1',
            orderedQuantity: 10,
            allocatedQuantity: 4,
            remainingQuantity: 6,
          },
        ],
      },
    });
    packageServiceMock.getPackageByPoNumber.mockResolvedValue({
      success: false,
      error: 'Not found',
    });
    packageServiceMock.createPackage.mockResolvedValue({
      success: false,
      error: 'boom',
    });

    await TestBed.configureTestingModule({
      imports: [CreatePackageModalComponent],
      providers: [
        { provide: PackageService, useValue: packageServiceMock },
        { provide: ReceiverService, useValue: receiverServiceMock },
        { provide: DeliveryLocationService, useValue: deliveryLocationServiceMock },
        { provide: InventoryService, useValue: inventoryServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreatePackageModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('blocks selecting quantity above remaining for a PO line', async () => {
    component.form.controls.poNumber.setValue('PO-1001');
    await component.onPoLookup();
    component.onPoLineSelectionChange('poi-1', true);

    const qtyControl = component.itemsArray.at(0).get('quantity');
    qtyControl?.setValue(99);
    qtyControl?.markAsTouched();
    qtyControl?.updateValueAndValidity();

    expect(component.getItemError(0)).toContain('exceeds remaining');
    expect(qtyControl?.hasError('max')).toBe(true);
  });

  it('maps selected PO lines to po_allocations payload', async () => {
    component.form.controls.receiverEmail.setValue('receiver@example.com');
    component.form.controls.deliveryLocationId.setValue('loc-1');
    component.form.controls.poNumber.setValue('PO-1001');

    await component.onPoLookup();
    component.onPoLineSelectionChange('poi-1', true);
    component.itemsArray.at(0).get('quantity')?.setValue(3);

    await component.onSubmit();

    expect(packageServiceMock.createPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        po_number: 'PO-1001',
        po_allocations: [
          {
            purchase_order_item_id: 'poi-1',
            item_index: 0,
            quantity: 3,
          },
        ],
      }),
    );
  });

  it('keeps non-PO item creation flow unchanged', async () => {
    component.form.controls.receiverEmail.setValue('receiver@example.com');
    component.form.controls.deliveryLocationId.setValue('loc-1');
    component.form.controls.poNumber.setValue('PO-NON-PO');

    component.addItem();
    const row = component.itemsArray.at(0);
    row.get('description')?.setValue('Manual item');
    row.get('quantity')?.setValue(2);

    await component.onSubmit();

    const request = packageServiceMock.createPackage.mock.calls[0][0];
    expect(request.items).toEqual([
      {
        quantity: 2,
        description: 'Manual item',
      },
    ]);
    expect(request.po_allocations).toBeUndefined();
  });

  it('ignores stale PO lookup responses after poNumber changes', async () => {
    let resolveLookup: ((value: Awaited<ReturnType<PackageService['getPurchaseOrderByNumber']>>) => void) | null = null;
    packageServiceMock.getPurchaseOrderByNumber.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        }),
    );

    component.form.controls.poNumber.setValue('PO-1001');
    const lookupPromise = component.onPoLookup();
    component.form.controls.poNumber.setValue('PO-2002');

    resolveLookup?.({
      success: true,
      data: {
        poNumber: 'PO-1001',
        items: [
          {
            purchaseOrderItemId: 'poi-1',
            purchaseOrderId: 'po-1',
            inventoryItemId: 'inv-1',
            orderedQuantity: 10,
            allocatedQuantity: 4,
            remainingQuantity: 6,
          },
        ],
      },
    });

    await lookupPromise;

    expect(component.poLookupState()).toBe('idle');
    expect(component.poLines()).toEqual([]);
  });
});

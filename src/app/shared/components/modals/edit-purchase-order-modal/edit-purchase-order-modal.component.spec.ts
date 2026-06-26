import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { FormBuilder } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EditPurchaseOrderModalComponent,
  PurchaseOrderEditFormValue,
} from './edit-purchase-order-modal.component';

try {
  getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
} catch {
  // Already initialized by Angular test runner.
}

describe('EditPurchaseOrderModalComponent', () => {
  let component: EditPurchaseOrderModalComponent;

  const editModel: PurchaseOrderEditFormValue = {
    purchaseOrderId: 'po-1',
    poNumber: ' PO-2001 ',
    items: [
      {
        purchaseOrderItemId: 'poi-1',
        inventoryItemId: 'inv-1',
        orderedQuantity: 8,
        minAllowedQuantity: 5,
      },
      {
        purchaseOrderItemId: 'poi-2',
        inventoryItemId: 'inv-2',
        orderedQuantity: 3,
        minAllowedQuantity: 1,
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FormBuilder],
    });

    component = TestBed.runInInjectionContext(() => new EditPurchaseOrderModalComponent());
    (component as unknown as { purchaseOrder: () => PurchaseOrderEditFormValue }).purchaseOrder = () =>
      editModel;
    (
      component as unknown as {
        prefillForm: (purchaseOrder: PurchaseOrderEditFormValue) => void;
      }
    ).prefillForm(editModel);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('blocks submit when ordered quantity is below minAllowedQuantity', async () => {
    const updatedSpy = vi.spyOn(component.updated, 'emit');
    component.itemsArray.at(0).controls.orderedQuantity.setValue(4);

    await component.onSubmit();

    expect(component.itemsArray.at(0).controls.orderedQuantity.errors?.['minAllowedQuantity']).toBeTruthy();
    expect(component.form.invalid).toBe(true);
    expect(updatedSpy).not.toHaveBeenCalled();
  });

  it('trims poNumber and emits normalized payload', async () => {
    const updatedSpy = vi.spyOn(component.updated, 'emit');
    component.form.controls.poNumber.setValue('  PO-2002  ');

    await component.onSubmit();

    expect(updatedSpy).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      poNumber: 'PO-2002',
      items: [
        { purchaseOrderItemId: 'poi-1', orderedQuantity: 8 },
        { purchaseOrderItemId: 'poi-2', orderedQuantity: 3 },
      ],
    });
  });

  it('does not emit when form is invalid', async () => {
    const updatedSpy = vi.spyOn(component.updated, 'emit');
    component.form.controls.poNumber.setValue('   ');

    await component.onSubmit();

    expect(component.form.invalid).toBe(true);
    expect(updatedSpy).not.toHaveBeenCalled();
  });

  it('prefills poNumber and existing lines from input model', () => {
    expect(component.form.controls.poNumber.value).toBe(' PO-2001 ');
    expect(component.itemsArray.length).toBe(2);
    expect(component.itemsArray.at(0).controls.purchaseOrderItemId.value).toBe('poi-1');
    expect(component.itemsArray.at(0).controls.orderedQuantity.value).toBe(8);
  });
});

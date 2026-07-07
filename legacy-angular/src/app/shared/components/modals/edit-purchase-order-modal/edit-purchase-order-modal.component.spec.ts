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
    receiverId: 'rec-1',
    poValue: 2500.5,
    poDate: '2026-06-28',
    details: 'PO notes',
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
        { purchaseOrderItemId: 'poi-1', inventoryItemId: 'inv-1', orderedQuantity: 8 },
        { purchaseOrderItemId: 'poi-2', inventoryItemId: 'inv-2', orderedQuantity: 3 },
      ],
      receiverId: 'rec-1',
      poValue: 2500.5,
      poDate: '2026-06-28',
      details: 'PO notes',
    });
  });

  it('does not emit when form is invalid', async () => {
    const updatedSpy = vi.spyOn(component.updated, 'emit');
    component.form.controls.poNumber.setValue('   ');

    await component.onSubmit();

    expect(component.form.invalid).toBe(true);
    expect(updatedSpy).not.toHaveBeenCalled();
  });

  it('adds a new line and emits it alongside existing lines', async () => {
    const updatedSpy = vi.spyOn(component.updated, 'emit');

    component.addLine();
    expect(component.itemsArray.length).toBe(3);
    expect(component.isNewLine(2)).toBe(true);

    component.selectInventoryItem('inv-9', 2);
    component.itemsArray.at(2).controls.orderedQuantity.setValue(4);

    await component.onSubmit();

    expect(updatedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          { purchaseOrderItemId: 'poi-1', inventoryItemId: 'inv-1', orderedQuantity: 8 },
          { purchaseOrderItemId: 'poi-2', inventoryItemId: 'inv-2', orderedQuantity: 3 },
          { purchaseOrderItemId: '', inventoryItemId: 'inv-9', orderedQuantity: 4 },
        ],
      })
    );
  });

  it('blocks submit when a newly added line has no inventory item selected', async () => {
    const updatedSpy = vi.spyOn(component.updated, 'emit');

    component.addLine();
    await component.onSubmit();

    expect(component.form.invalid).toBe(true);
    expect(updatedSpy).not.toHaveBeenCalled();
  });

  it('only removes newly added lines, never existing ones', () => {
    component.removeLine(0);
    expect(component.itemsArray.length).toBe(2);

    component.addLine();
    expect(component.itemsArray.length).toBe(3);
    component.removeLine(2);
    expect(component.itemsArray.length).toBe(2);
  });

  it('prefills poNumber and existing lines from input model', () => {
    expect(component.form.controls.poNumber.value).toBe(' PO-2001 ');
    expect(component.itemsArray.length).toBe(2);
    expect(component.itemsArray.at(0).controls.purchaseOrderItemId.value).toBe('poi-1');
    expect(component.itemsArray.at(0).controls.orderedQuantity.value).toBe(8);
  });
});

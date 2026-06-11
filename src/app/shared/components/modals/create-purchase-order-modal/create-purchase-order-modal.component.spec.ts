import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CreatePurchaseOrderModalComponent } from './create-purchase-order-modal.component';

describe('CreatePurchaseOrderModalComponent', () => {
  let component: CreatePurchaseOrderModalComponent;
  let fixture: ComponentFixture<CreatePurchaseOrderModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreatePurchaseOrderModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CreatePurchaseOrderModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('requires at least one PO line before submit', () => {
    component.itemsArray.clear();
    component.form.controls.poNumber.setValue('PO-42');

    expect(component.form.valid).toBe(false);
    expect(component.form.controls.items.errors?.['minlength']).toBeTruthy();
  });

  it('adds and removes lines', () => {
    const initialCount = component.itemsArray.length;

    component.addLine();
    expect(component.itemsArray.length).toBe(initialCount + 1);

    component.removeLine(0);
    expect(component.itemsArray.length).toBe(initialCount);
  });

  it('validates ordered quantity minimum', () => {
    const line = component.itemsArray.at(0);
    line.controls.inventoryItemId.setValue('inv-1');
    line.controls.orderedQuantity.setValue(0);

    expect(line.controls.orderedQuantity.errors?.['min']).toBeTruthy();
    expect(component.form.valid).toBe(false);
  });

  it('emits created payload on valid submit', async () => {
    const createdSpy = vi.spyOn(component.created, 'emit');

    component.form.controls.poNumber.setValue('PO-123');
    const line = component.itemsArray.at(0);
    line.controls.inventoryItemId.setValue('inv-1');
    line.controls.orderedQuantity.setValue(2);

    await component.onSubmit();

    expect(createdSpy).toHaveBeenCalledWith({
      poNumber: 'PO-123',
      items: [{ inventoryItemId: 'inv-1', orderedQuantity: 2 }],
    });
  });
});

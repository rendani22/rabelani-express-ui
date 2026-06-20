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

  it('starts with no PO lines so min-length validation is enforced', () => {
    expect(component.itemsArray.length).toBe(0);
    expect(component.form.controls.items.errors?.['minlength']).toBeTruthy();
  });

  it('requires at least one PO line before submit', () => {
    component.itemsArray.clear();
    component.form.controls.poNumber.setValue('PO-42');

    expect(component.form.valid).toBe(false);
    expect(component.form.controls.items.errors?.['minlength']).toBeTruthy();
  });

  it('treats whitespace-only poNumber as invalid', () => {
    component.form.controls.poNumber.setValue('   ');
    component.addLine();
    const line = component.itemsArray.at(0);
    line.controls.inventoryItemId.setValue('inv-1');
    line.controls.orderedQuantity.setValue(1);

    expect(component.form.valid).toBe(false);
    expect(component.form.controls.poNumber.errors?.['required']).toBeTruthy();
  });

  it('treats whitespace-only inventoryItemId as invalid', () => {
    component.form.controls.poNumber.setValue('PO-123');
    component.addLine();
    const line = component.itemsArray.at(0);
    line.controls.inventoryItemId.setValue('   ');
    line.controls.orderedQuantity.setValue(1);

    expect(component.form.valid).toBe(false);
    expect(line.controls.inventoryItemId.errors?.['required']).toBeTruthy();
  });

  it('adds and removes lines', () => {
    const initialCount = component.itemsArray.length;

    component.addLine();
    expect(component.itemsArray.length).toBe(initialCount + 1);

    component.removeLine(0);
    expect(component.itemsArray.length).toBe(initialCount);
  });

  it('validates ordered quantity minimum', () => {
    component.addLine();
    const line = component.itemsArray.at(0);
    line.controls.inventoryItemId.setValue('inv-1');
    line.controls.orderedQuantity.setValue(0);

    expect(line.controls.orderedQuantity.errors?.['min']).toBeTruthy();
    expect(component.form.valid).toBe(false);
  });

  it('emits created payload on valid submit', async () => {
    const createdSpy = vi.spyOn(component.created, 'emit');

    component.form.controls.poNumber.setValue('PO-123');
    component.addLine();
    const line = component.itemsArray.at(0);
    line.controls.inventoryItemId.setValue('inv-1');
    line.controls.orderedQuantity.setValue(2);

    await component.onSubmit();

    expect(createdSpy).toHaveBeenCalledWith({
      poNumber: 'PO-123',
      items: [{ inventoryItemId: 'inv-1', orderedQuantity: 2 }],
    });
  });

  it('keeps lines empty after close reset', () => {
    component.addLine();
    expect(component.itemsArray.length).toBe(1);

    component.onClose();

    expect(component.itemsArray.length).toBe(0);
  });

  it('binds create button to the form submit flow', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form');
    const submitButton = fixture.nativeElement.querySelector('button[type="submit"]');

    expect(form).toBeTruthy();
    expect(submitButton).toBeTruthy();
    expect(submitButton.closest('form') === form || submitButton.getAttribute('form') === form.id).toBe(true);
  });
});

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { AddUserModalComponent } from './add-user-modal.component';
import { StaffProfile, StaffRole, StaffService } from '../../../../core';
import { ConfirmService } from '../../confirm-dialog';

describe('AddUserModalComponent', () => {
  let component: AddUserModalComponent;
  let fixture: ComponentFixture<AddUserModalComponent>;

  const mockCreatedStaff: StaffProfile = {
    id: '1',
    user_id: 'user-1',
    email: 'newuser@example.com',
    full_name: 'New User',
    role: 'staff' as StaffRole,
    is_active: true,
    department: 'Engineering',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  const staffServiceMock = {
    loading: signal(false),
    createStaff: vi.fn().mockResolvedValue({ profile: mockCreatedStaff, error: null }),
  };

  const confirmServiceMock = {
    confirmDiscard: vi.fn().mockResolvedValue(true),
  };

  const fillValidForm = () => {
    component.form.patchValue({
      full_name: 'New User',
      email: 'newuser@example.com',
      password: 'password123',
      role: 'staff',
      phone: '+27123456789',
      department: 'Engineering',
    });
  };

  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [AddUserModalComponent],
      providers: [
        { provide: StaffService, useValue: staffServiceMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddUserModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the form and ui state', () => {
    expect(component.form.getRawValue()).toEqual({
      full_name: '',
      email: '',
      password: '',
      role: 'staff',
      phone: '',
      department: '',
    });
    expect(component.roles.map(role => role.value)).toEqual(['admin', 'manager', 'staff', 'viewer']);
    expect(component.isSubmitting()).toBe(false);
    expect(component.errorMessage()).toBeNull();
    expect(component.successMessage()).toBeNull();
  });

  it('should validate form fields and field-level errors', () => {
    component.form.controls.full_name.markAsTouched();
    component.form.controls.email.setValue('invalid-email');
    component.form.controls.email.markAsTouched();
    component.form.controls.password.setValue('short');
    component.form.controls.password.markAsTouched();

    expect(component.getFieldError('full_name')).toBe('Full name is required');
    expect(component.getFieldError('email')).toBe('Please enter a valid email address');
    expect(component.getFieldError('password')).toBe('Must be at least 8 characters');
    expect(component.getFieldError('department')).toBeNull();
  });

  it('should reject invalid submissions', async () => {
    await component.onSubmit();

    expect(staffServiceMock.createStaff).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBe('Please fix the errors in the form');
    expect(component.form.controls.full_name.touched).toBe(true);
    expect(component.form.controls.email.touched).toBe(true);
    expect(component.form.controls.password.touched).toBe(true);
  });

  it('should submit the normalized payload and emit the created user', async () => {
    fillValidForm();
    const createdSpy = vi.spyOn(component.userCreated, 'emit');

    await component.onSubmit();

    expect(staffServiceMock.createStaff).toHaveBeenCalledWith({
      email: 'newuser@example.com',
      password: 'password123',
      full_name: 'New User',
      role: 'staff',
      phone: '+27123456789',
      department: 'Engineering',
    });
    expect(component.successMessage()).toBe('User "New User" created successfully!');
    expect(component.errorMessage()).toBeNull();
    expect(createdSpy).toHaveBeenCalledWith(mockCreatedStaff);
    expect(component.isSubmitting()).toBe(false);
  });

  it('should omit empty optional fields from the submission dto', async () => {
    component.form.patchValue({
      full_name: 'New User',
      email: 'newuser@example.com',
      password: 'password123',
      role: 'staff',
      phone: '',
      department: '',
    });

    await component.onSubmit();

    expect(staffServiceMock.createStaff).toHaveBeenCalledWith({
      email: 'newuser@example.com',
      password: 'password123',
      full_name: 'New User',
      role: 'staff',
      phone: undefined,
      department: undefined,
    });
  });

  it('should show service errors without closing', async () => {
    fillValidForm();
    staffServiceMock.createStaff.mockResolvedValueOnce({ profile: null, error: 'User already exists' });
    const closeSpy = vi.spyOn(component.closeModal, 'emit');

    await component.onSubmit();

    expect(component.errorMessage()).toBe('User already exists');
    expect(component.successMessage()).toBeNull();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('should auto-close after a successful submission', async () => {
    vi.useFakeTimers();
    fillValidForm();
    const closeSpy = vi.spyOn(component.closeModal, 'emit');

    await component.onSubmit();
    await vi.advanceTimersByTimeAsync(2000);

    expect(closeSpy).toHaveBeenCalled();
    expect(component.form.getRawValue()).toEqual({
      full_name: '',
      email: '',
      password: '',
      role: 'staff',
      phone: '',
      department: '',
    });
    expect(component.successMessage()).toBeNull();
  });

  it('should close immediately when the form is pristine', async () => {
    const closeSpy = vi.spyOn(component.closeModal, 'emit');

    await component.onClose();

    expect(confirmServiceMock.confirmDiscard).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('should request confirmation when closing a dirty form', async () => {
    component.form.controls.full_name.setValue('Draft User');
    const closeSpy = vi.spyOn(component.closeModal, 'emit');

    await component.onClose();

    expect(confirmServiceMock.confirmDiscard).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('should keep the modal open when discard confirmation is rejected', async () => {
    component.form.controls.full_name.setValue('Draft User');
    confirmServiceMock.confirmDiscard.mockResolvedValueOnce(false);
    const closeSpy = vi.spyOn(component.closeModal, 'emit');

    await component.onClose();

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('should close without prompting when already successful', async () => {
    component.successMessage.set('Created!');
    component.form.controls.full_name.setValue('Draft User');
    const closeSpy = vi.spyOn(component.closeModal, 'emit');

    await component.onClose();

    expect(confirmServiceMock.confirmDiscard).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('should not close while submitting', async () => {
    component.isSubmitting.set(true);
    const closeSpy = vi.spyOn(component.closeModal, 'emit');

    await component.onClose();

    expect(closeSpy).not.toHaveBeenCalled();
  });
});

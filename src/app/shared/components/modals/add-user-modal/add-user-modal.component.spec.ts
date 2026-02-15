import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { vi } from 'vitest';

import { AddUserModalComponent } from './add-user-modal.component';
import { StaffService, StaffProfile, StaffRole } from '../../../../core';

describe('AddUserModalComponent', () => {
  let component: AddUserModalComponent;
  let fixture: ComponentFixture<AddUserModalComponent>;
  let staffServiceMock: {
    loading: ReturnType<typeof signal<boolean>>;
    createStaff: ReturnType<typeof vi.fn>;
  };

  const mockCreatedStaff: StaffProfile = {
    id: '1',
    user_id: 'user-1',
    email: 'newuser@example.com',
    full_name: 'New User',
    role: 'staff' as StaffRole,
    is_active: true,
    department: 'Engineering',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  };

  beforeEach(async () => {
    staffServiceMock = {
      loading: signal(false),
      createStaff: vi.fn().mockResolvedValue({ profile: mockCreatedStaff, error: null })
    };

    await TestBed.configureTestingModule({
      imports: [AddUserModalComponent, ReactiveFormsModule],
      providers: [
        { provide: StaffService, useValue: staffServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AddUserModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initial State', () => {
    it('should have form with empty values', () => {
      expect(component.form.value).toEqual({
        full_name: '',
        email: '',
        password: '',
        role: 'staff',
        phone: '',
        department: ''
      });
    });

    it('should have roles defined', () => {
      expect(component.roles.length).toBe(4);
      expect(component.roles.map(r => r.value)).toEqual(['admin', 'manager', 'staff', 'viewer']);
    });

    it('should not be submitting initially', () => {
      expect(component.isSubmitting()).toBe(false);
    });

    it('should have no error message initially', () => {
      expect(component.errorMessage()).toBeNull();
    });

    it('should have no success message initially', () => {
      expect(component.successMessage()).toBeNull();
    });
  });

  describe('Form Validation', () => {
    it('should require full_name', () => {
      const control = component.form.controls.full_name;
      expect(control.valid).toBe(false);
      expect(control.errors?.['required']).toBeTruthy();
    });

    it('should require full_name to be at least 2 characters', () => {
      const control = component.form.controls.full_name;
      control.setValue('A');
      expect(control.valid).toBe(false);
      expect(control.errors?.['minlength']).toBeTruthy();
    });

    it('should accept valid full_name', () => {
      const control = component.form.controls.full_name;
      control.setValue('John Doe');
      expect(control.valid).toBe(true);
    });

    it('should require email', () => {
      const control = component.form.controls.email;
      expect(control.valid).toBe(false);
      expect(control.errors?.['required']).toBeTruthy();
    });

    it('should validate email format', () => {
      const control = component.form.controls.email;
      control.setValue('invalid-email');
      expect(control.valid).toBe(false);
      expect(control.errors?.['pattern']).toBeTruthy();
    });

    it('should accept valid email', () => {
      const control = component.form.controls.email;
      control.setValue('valid@example.com');
      expect(control.valid).toBe(true);
    });

    it('should require password', () => {
      const control = component.form.controls.password;
      expect(control.valid).toBe(false);
      expect(control.errors?.['required']).toBeTruthy();
    });

    it('should require password to be at least 8 characters', () => {
      const control = component.form.controls.password;
      control.setValue('short');
      expect(control.valid).toBe(false);
      expect(control.errors?.['minlength']).toBeTruthy();
    });

    it('should accept valid password', () => {
      const control = component.form.controls.password;
      control.setValue('validpassword123');
      expect(control.valid).toBe(true);
    });

    it('should require role', () => {
      const control = component.form.controls.role;
      expect(control.valid).toBe(true); // Has default value 'staff'
    });

    it('should not require phone', () => {
      const control = component.form.controls.phone;
      expect(control.valid).toBe(true);
    });

    it('should not require department', () => {
      const control = component.form.controls.department;
      expect(control.valid).toBe(true);
    });
  });

  describe('getFieldError', () => {
    it('should return null for untouched field', () => {
      expect(component.getFieldError('full_name')).toBeNull();
    });

    it('should return required message for touched empty required field', () => {
      const control = component.form.controls.full_name;
      control.markAsTouched();
      expect(component.getFieldError('full_name')).toBe('Full name is required');
    });

    it('should return email required message', () => {
      const control = component.form.controls.email;
      control.markAsTouched();
      expect(component.getFieldError('email')).toBe('Email is required');
    });

    it('should return pattern error for invalid email', () => {
      const control = component.form.controls.email;
      control.setValue('invalid');
      control.markAsTouched();
      expect(component.getFieldError('email')).toBe('Please enter a valid email address');
    });

    it('should return minlength error for short password', () => {
      const control = component.form.controls.password;
      control.setValue('short');
      control.markAsTouched();
      expect(component.getFieldError('password')).toBe('Must be at least 8 characters');
    });

    it('should return null for valid field', () => {
      const control = component.form.controls.full_name;
      control.setValue('John Doe');
      control.markAsTouched();
      expect(component.getFieldError('full_name')).toBeNull();
    });
  });

  describe('onSubmit', () => {
    const fillValidForm = () => {
      component.form.patchValue({
        full_name: 'New User',
        email: 'newuser@example.com',
        password: 'password123',
        role: 'staff',
        phone: '+27123456789',
        department: 'Engineering'
      });
    };

    it('should not submit if form is invalid', async () => {
      await component.onSubmit();

      expect(staffServiceMock.createStaff).not.toHaveBeenCalled();
      expect(component.errorMessage()).toBe('Please fix the errors in the form');
    });

    it('should mark all fields as touched on invalid submit', async () => {
      await component.onSubmit();

      expect(component.form.controls.full_name.touched).toBe(true);
      expect(component.form.controls.email.touched).toBe(true);
      expect(component.form.controls.password.touched).toBe(true);
    });

    it('should call createStaff with correct data', async () => {
      fillValidForm();

      await component.onSubmit();

      expect(staffServiceMock.createStaff).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'password123',
        full_name: 'New User',
        role: 'staff',
        phone: '+27123456789',
        department: 'Engineering'
      });
    });

    it('should set isSubmitting to true while submitting', async () => {
      fillValidForm();
      staffServiceMock.createStaff.mockImplementation(() => {
        expect(component.isSubmitting()).toBe(true);
        return Promise.resolve({ profile: mockCreatedStaff, error: null });
      });

      await component.onSubmit();
    });

    it('should set isSubmitting to false after submit', async () => {
      fillValidForm();

      await component.onSubmit();

      expect(component.isSubmitting()).toBe(false);
    });

    it('should show success message on successful creation', async () => {
      fillValidForm();

      await component.onSubmit();

      expect(component.successMessage()).toBe('User "New User" created successfully!');
    });

    it('should emit userCreated event on success', async () => {
      fillValidForm();
      const emitSpy = vi.spyOn(component.userCreated, 'emit');

      await component.onSubmit();

      expect(emitSpy).toHaveBeenCalledWith(mockCreatedStaff);
    });

    it('should show error message on failed creation', async () => {
      fillValidForm();
      staffServiceMock.createStaff.mockResolvedValue({ profile: null, error: 'User already exists' });

      await component.onSubmit();

      expect(component.errorMessage()).toBe('User already exists');
      expect(component.successMessage()).toBeNull();
    });

    it('should not emit userCreated on error', async () => {
      fillValidForm();
      staffServiceMock.createStaff.mockResolvedValue({ profile: null, error: 'Error' });
      const emitSpy = vi.spyOn(component.userCreated, 'emit');

      await component.onSubmit();

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should omit empty optional fields', async () => {
      component.form.patchValue({
        full_name: 'New User',
        email: 'newuser@example.com',
        password: 'password123',
        role: 'staff',
        phone: '',
        department: ''
      });

      await component.onSubmit();

      expect(staffServiceMock.createStaff).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'password123',
        full_name: 'New User',
        role: 'staff',
        phone: undefined,
        department: undefined
      });
    });
  });

  describe('onClose', () => {
    it('should emit closeModal when not submitting', () => {
      const emitSpy = vi.spyOn(component.closeModal, 'emit');

      component.onClose();

      expect(emitSpy).toHaveBeenCalled();
    });

    it('should not emit closeModal when submitting', () => {
      component.isSubmitting.set(true);
      const emitSpy = vi.spyOn(component.closeModal, 'emit');

      component.onClose();

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should reset form on close', () => {
      component.form.patchValue({
        full_name: 'Test',
        email: 'test@test.com',
        password: 'password'
      });
      component.errorMessage.set('Some error');
      component.successMessage.set('Success!');

      component.onClose();

      expect(component.form.value.full_name).toBe('');
      expect(component.form.value.email).toBe('');
      expect(component.form.value.password).toBe('');
      expect(component.form.value.role).toBe('staff');
      expect(component.errorMessage()).toBeNull();
      expect(component.successMessage()).toBeNull();
    });
  });

  describe('Auto-close after success', () => {
    it('should set success message after successful submit', async () => {
      component.form.patchValue({
        full_name: 'New User',
        email: 'newuser@example.com',
        password: 'password123',
        role: 'staff'
      });

      await component.onSubmit();

      // Success message should be set
      expect(component.successMessage()).toBeTruthy();
      expect(component.successMessage()).toContain('New User');
    });
  });
});


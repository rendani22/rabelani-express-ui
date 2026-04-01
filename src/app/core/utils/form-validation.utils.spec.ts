import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FormValidationUtils } from './form-validation.utils';

describe('FormValidationUtils', () => {
  describe('getErrorMessage', () => {
    it('should return null when control is null', () => {
      expect(FormValidationUtils.getErrorMessage(null, 'email')).toBeNull();
    });

    it('should return null when control is untouched', () => {
      const control = new FormControl('', Validators.required);
      expect(FormValidationUtils.getErrorMessage(control, 'email')).toBeNull();
    });

    it('should return null when touched control has no errors', () => {
      const control = new FormControl('valid@example.com', Validators.email);
      control.markAsTouched();
      expect(FormValidationUtils.getErrorMessage(control, 'email')).toBeNull();
    });

    it('should return required error message for email field', () => {
      const control = new FormControl('', Validators.required);
      control.markAsTouched();
      expect(FormValidationUtils.getErrorMessage(control, 'email')).toBe('Email is required');
    });

    it('should return email error message for invalid email', () => {
      const control = new FormControl('not-an-email', Validators.email);
      control.markAsTouched();
      expect(FormValidationUtils.getErrorMessage(control, 'email')).toBe('Please enter a valid email address');
    });

    it('should return required error message for password field', () => {
      const control = new FormControl('', Validators.required);
      control.markAsTouched();
      expect(FormValidationUtils.getErrorMessage(control, 'password')).toBe('Password is required');
    });

    it('should return minlength error with required length for password', () => {
      const control = new FormControl('ab', Validators.minLength(6));
      control.markAsTouched();
      expect(FormValidationUtils.getErrorMessage(control, 'password')).toBe('Password must be at least 6 characters');
    });

    it('should return minlength message for email with minlength error', () => {
      const control = new FormControl('a@b', Validators.minLength(8));
      control.markAsTouched();
      expect(FormValidationUtils.getErrorMessage(control, 'email')).toBe('Email must be at least 8 characters');
    });

    it('should return "Invalid field" for unknown field name', () => {
      const control = new FormControl('', Validators.required);
      control.markAsTouched();
      expect(FormValidationUtils.getErrorMessage(control, 'unknownField')).toBe('Invalid field');
    });

    it('should return "Invalid value" for unmapped error type on known field', () => {
      const control = new FormControl('');
      control.markAsTouched();
      control.setErrors({ customError: true });
      expect(FormValidationUtils.getErrorMessage(control, 'email')).toBe('Invalid value');
    });
  });

  describe('isInvalid', () => {
    it('should return false for null control', () => {
      expect(FormValidationUtils.isInvalid(null)).toBe(false);
    });

    it('should return false for invalid but untouched control', () => {
      const control = new FormControl('', Validators.required);
      expect(FormValidationUtils.isInvalid(control)).toBe(false);
    });

    it('should return false for valid touched control', () => {
      const control = new FormControl('valid@example.com', Validators.email);
      control.markAsTouched();
      expect(FormValidationUtils.isInvalid(control)).toBe(false);
    });

    it('should return true for invalid touched control', () => {
      const control = new FormControl('', Validators.required);
      control.markAsTouched();
      expect(FormValidationUtils.isInvalid(control)).toBe(true);
    });

    it('should return true when control has email error and is touched', () => {
      const control = new FormControl('not-an-email', Validators.email);
      control.markAsTouched();
      expect(FormValidationUtils.isInvalid(control)).toBe(true);
    });
  });

  describe('markAllAsTouched', () => {
    it('should call markAllAsTouched on the provided form', () => {
      const mockForm = { markAllAsTouched: () => {} };
      const spy = vi.spyOn(mockForm, 'markAllAsTouched');

      FormValidationUtils.markAllAsTouched(mockForm);

      expect(spy).toHaveBeenCalled();
    });

    it('should mark all controls in a FormGroup as touched', () => {
      const form = new FormGroup({
        email: new FormControl(''),
        password: new FormControl(''),
      });

      expect(form.controls.email.touched).toBe(false);
      expect(form.controls.password.touched).toBe(false);

      FormValidationUtils.markAllAsTouched(form);

      expect(form.controls.email.touched).toBe(true);
      expect(form.controls.password.touched).toBe(true);
    });
  });
});

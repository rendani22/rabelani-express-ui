import { AbstractControl } from '@angular/forms';
import { VALIDATION_MESSAGES, ValidationErrorType } from '../models/auth.models';

/**
 * Utility class for form validation operations
 */
export class FormValidationUtils {
  /**
   * Get the first validation error message for a form control
   */
  static getErrorMessage(
    control: AbstractControl | null,
    fieldName: string
  ): string | null {
    if (!control?.touched || !control?.errors) {
      return null;
    }

    const fieldMessages = VALIDATION_MESSAGES[fieldName];
    if (!fieldMessages) {
      return 'Invalid field';
    }

    const errorKeys = Object.keys(control.errors) as ValidationErrorType[];
    const firstError = errorKeys[0];

    if (firstError === 'minlength') {
      const { requiredLength } = control.errors['minlength'];
      return `${this.capitalize(fieldName)} must be at least ${requiredLength} characters`;
    }

    return fieldMessages[firstError] ?? 'Invalid value';
  }

  /**
   * Check if a form control has errors and has been touched
   */
  static isInvalid(control: AbstractControl | null): boolean {
    return control ? control.invalid && control.touched : false;
  }

  /**
   * Mark all controls in a form group as touched
   */
  static markAllAsTouched(form: { markAllAsTouched: () => void }): void {
    form.markAllAsTouched();
  }

  private static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}



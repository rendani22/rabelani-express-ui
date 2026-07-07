import { Component, inject, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  AuthService,
  ThemeService,
  FormValidationUtils,
  LoginCredentials,
} from '../../core';

/** Form controls interface for type-safe form access */
interface LoginFormControls {
  email: FormControl<string>;
  password: FormControl<string>;
}

/** Form field names for validation */
type LoginFormField = keyof LoginFormControls;

/** Password validation constants */
const PASSWORD_MIN_LENGTH = 6;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'login-host' },
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);

  /** Login form group with typed controls */
  readonly loginForm: FormGroup<LoginFormControls> = this.createForm();

  /** Loading state from auth service */
  readonly isLoading = this.authService.isLoading;

  /** Authentication error message */
  readonly authError = signal<string | null>(null);

  /** Password visibility toggle state */
  showPassword = false;

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.themeService.initializeTheme();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handle form submission
   */
  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      FormValidationUtils.markAllAsTouched(this.loginForm);
      return;
    }

    // Clear previous auth errors
    this.authError.set(null);

    const credentials: LoginCredentials = this.loginForm.getRawValue();
    const result = await this.authService.signIn(credentials);

    if (result.success) {
      await this.authService.navigateAfterLogin();
    } else {
      this.authError.set(result.error ?? 'Login failed. Please try again.');
    }
  }

  /**
   * Toggle password field visibility
   */
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  /**
   * Get validation error message for a field
   */
  getFieldError(fieldName: LoginFormField): string | null {
    return FormValidationUtils.getErrorMessage(
      this.loginForm.get(fieldName),
      fieldName
    );
  }

  /**
   * Check if a field has validation errors
   */
  isFieldInvalid(fieldName: LoginFormField): boolean {
    return FormValidationUtils.isInvalid(this.loginForm.get(fieldName));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  private createForm(): FormGroup<LoginFormControls> {
    return this.fb.nonNullable.group({
      email: ['', [Validators.required, Validators.email]],
      password: [
        '',
        [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)],
      ],
    });
  }
}

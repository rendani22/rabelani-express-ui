import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoginComponent } from './login';
import { AuthService } from '../../core';
import { ThemeService } from '../../core';
import { signal } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { vi } from 'vitest';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  // Define mock types explicitly or use 'any' if types are tricky with manual mocks
  let authServiceMock: { signIn: any; navigateAfterLogin: any; isLoading: any };
  let themeServiceMock: { initializeTheme: any };

  beforeEach(async () => {
    // Create mocks using vi.fn()
    authServiceMock = {
      signIn: vi.fn(),
      navigateAfterLogin: vi.fn(),
      isLoading: signal(false)
    };

    themeServiceMock = {
      initializeTheme: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, NoopAnimationsModule],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: ThemeService, useValue: themeServiceMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParams: {} } }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize theme on startup', () => {
    expect(themeServiceMock.initializeTheme).toHaveBeenCalled();
  });

  it('should have invalid form initially', () => {
    expect(component.loginForm.valid).toBe(false);
  });

  it('should validate email format', () => {
    const emailControl = component.loginForm.controls.email;

    emailControl.setValue('invalid-email');
    expect(emailControl.valid).toBe(false);
    expect(emailControl.errors?.['email']).toBeTruthy();

    emailControl.setValue('valid@example.com');
    expect(emailControl.valid).toBe(true);
  });

  it('should validate password length', () => {
    const passwordControl = component.loginForm.controls.password;

    passwordControl.setValue('12345'); // Less than 6 chars
    expect(passwordControl.valid).toBe(false);
    expect(passwordControl.errors?.['minlength']).toBeTruthy();

    passwordControl.setValue('123456'); // Exactly 6 chars
    expect(passwordControl.valid).toBe(true);
  });

  it('should toggle password visibility', () => {
    expect(component.showPassword).toBe(false);

    component.togglePasswordVisibility();
    expect(component.showPassword).toBe(true);

    component.togglePasswordVisibility();
    expect(component.showPassword).toBe(false);
  });

  describe('onSubmit', () => {
    it('should mark form as touched if invalid', async () => {
      expect(component.loginForm.touched).toBe(false);

      await component.onSubmit();

      expect(component.loginForm.touched).toBe(true);
      expect(authServiceMock.signIn).not.toHaveBeenCalled();
    });

    it('should call signIn when form is valid', async () => {
      component.loginForm.setValue({
        email: 'test@example.com',
        password: 'password123'
      });

      authServiceMock.signIn.mockResolvedValue({ success: true });
      authServiceMock.navigateAfterLogin.mockResolvedValue();

      await component.onSubmit();

      expect(authServiceMock.signIn).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
    });

    it('should navigate on successful login', async () => {
      component.loginForm.setValue({
        email: 'test@example.com',
        password: 'password123'
      });

      authServiceMock.signIn.mockResolvedValue({ success: true });
      authServiceMock.navigateAfterLogin.mockResolvedValue();

      await component.onSubmit();

      expect(authServiceMock.navigateAfterLogin).toHaveBeenCalled();
      expect(component.authError()).toBeNull();
    });

    it('should set error message on failed login', async () => {
      component.loginForm.setValue({
        email: 'test@example.com',
        password: 'wrongpassword'
      });

      const errorMessage = 'Invalid credentials';
      authServiceMock.signIn.mockResolvedValue({
        success: false,
        error: errorMessage
      });

      await component.onSubmit();

      expect(authServiceMock.navigateAfterLogin).not.toHaveBeenCalled();
      expect(component.authError()).toBe(errorMessage);
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { vi } from 'vitest';

import { AuthService } from './auth.service';
import { SupabaseService } from '../../shared/services/supabase.service';

describe('AuthService', () => {
  let service: AuthService;
  let supabaseServiceMock: {
    signIn: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
    resetPassword: ReturnType<typeof vi.fn>;
    currentUser: ReturnType<typeof signal<null>>;
    isAuthenticated: ReturnType<typeof signal<boolean>>;
    isInitialized: ReturnType<typeof signal<boolean>>;
    isLoading: ReturnType<typeof signal<boolean>>;
  };
  let routerMock: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    supabaseServiceMock = {
      signIn: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
      currentUser: signal(null),
      isAuthenticated: signal(false),
      isInitialized: signal(false),
      isLoading: signal(false),
    };
    routerMock = { navigate: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: supabaseServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  describe('Delegated signal properties', () => {
    it('should expose isAuthenticated from SupabaseService', () => {
      expect(service.isAuthenticated).toBe(supabaseServiceMock.isAuthenticated);
    });

    it('should expose isInitialized from SupabaseService', () => {
      expect(service.isInitialized).toBe(supabaseServiceMock.isInitialized);
    });

    it('should expose currentUser from SupabaseService', () => {
      expect(service.currentUser).toBe(supabaseServiceMock.currentUser);
    });

    it('should expose isLoading from SupabaseService', () => {
      expect(service.isLoading).toBe(supabaseServiceMock.isLoading);
    });
  });

  describe('signIn', () => {
    it('should call supabaseService.signIn with email and password', async () => {
      supabaseServiceMock.signIn.mockResolvedValue({ success: true, user: null });

      await service.signIn({ email: 'test@example.com', password: 'password123' });

      expect(supabaseServiceMock.signIn).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should return success: true on successful sign-in', async () => {
      supabaseServiceMock.signIn.mockResolvedValue({ success: true, user: null });

      const result = await service.signIn({ email: 'test@example.com', password: 'password123' });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return success: false with error on failed sign-in', async () => {
      supabaseServiceMock.signIn.mockResolvedValue({ success: false, error: 'Invalid credentials' });

      const result = await service.signIn({ email: 'bad@example.com', password: 'wrong' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });

    it('should propagate error message from supabase response', async () => {
      const errorMsg = 'Email not confirmed';
      supabaseServiceMock.signIn.mockResolvedValue({ success: false, error: errorMsg });

      const result = await service.signIn({ email: 'test@example.com', password: 'pass' });

      expect(result.error).toBe(errorMsg);
    });
  });

  describe('signOut', () => {
    it('should call supabaseService.signOut', async () => {
      supabaseServiceMock.signOut.mockResolvedValue({ success: true });

      await service.signOut();

      expect(supabaseServiceMock.signOut).toHaveBeenCalled();
    });

    it('should return success: true on successful sign-out', async () => {
      supabaseServiceMock.signOut.mockResolvedValue({ success: true });

      const result = await service.signOut();

      expect(result.success).toBe(true);
    });

    it('should return success: false with error on failed sign-out', async () => {
      supabaseServiceMock.signOut.mockResolvedValue({ success: false, error: 'Sign out failed' });

      const result = await service.signOut();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sign out failed');
    });
  });

  describe('resetPassword', () => {
    it('should call supabaseService.resetPassword with the email', async () => {
      supabaseServiceMock.resetPassword.mockResolvedValue({ success: true });

      await service.resetPassword('user@example.com');

      expect(supabaseServiceMock.resetPassword).toHaveBeenCalledWith('user@example.com');
    });

    it('should return success: true on successful reset', async () => {
      supabaseServiceMock.resetPassword.mockResolvedValue({ success: true });

      const result = await service.resetPassword('user@example.com');

      expect(result.success).toBe(true);
    });

    it('should return success: false with error on failed reset', async () => {
      supabaseServiceMock.resetPassword.mockResolvedValue({ success: false, error: 'User not found' });

      const result = await service.resetPassword('nouser@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('navigateAfterLogin', () => {
    it('should navigate to /dashboard by default', async () => {
      await service.navigateAfterLogin();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('should navigate to a custom destination when provided', async () => {
      await service.navigateAfterLogin('/orders');
      expect(routerMock.navigate).toHaveBeenCalledWith(['/orders']);
    });
  });

  describe('navigateToLogin', () => {
    it('should navigate to /login', async () => {
      await service.navigateToLogin();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/login']);
    });
  });
});

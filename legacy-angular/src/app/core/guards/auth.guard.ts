import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { filter, switchMap, take } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { SupabaseService } from '../../shared/services/supabase.service';

/**
 * Guard that prevents unauthenticated access to routes.
 * Redirects to /login if user is not authenticated.
 * Also blocks users with the `driver` role — they are signed out and
 * redirected to the login page.
 * Waits for auth initialization before deciding.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const supabaseService = inject(SupabaseService);
  const router = inject(Router);

  return toObservable(authService.isInitialized).pipe(
    filter((isInitialized): isInitialized is boolean => isInitialized === true),
    take(1),
    switchMap(async () => {
      if (!authService.isAuthenticated()) {
        return router.createUrlTree(['/login']);
      }

      const userId = supabaseService.currentUser()?.id;
      if (!userId) {
        return router.createUrlTree(['/login']);
      }

      // Block drivers from accessing the dashboard.
      const { data } = await supabaseService.client
        .from('staff_profiles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (data?.role === 'driver') {
        await supabaseService.signOut();
        return router.createUrlTree(['/login']);
      }

      return true;
    }),
  );
};



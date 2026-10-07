import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** The start page ("/" and any unknown address): the Login page, unless a valid session exists — then the user's own home screen. */
export const rootRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.parseUrl('/login');
  return router.parseUrl(auth.isSuperAdmin() ? '/super-admin/dashboard' : auth.homeRoute());
};

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    // A Super Admin only has the platform area; tenant screens would show another business's (or no) data.
    if (auth.isSuperAdmin()) {
      router.navigate(['/super-admin/dashboard']);
      return false;
    }
    return true;
  }

  router.navigate(['/login']);
  return false;
};

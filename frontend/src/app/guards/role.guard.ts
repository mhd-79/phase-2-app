import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAdmin()) {
    return true;
  }

  // Non-admins (e.g. Cashiers) are redirected to POS billing
  router.navigate(['/pos']);
  return false;
};

/** Pages of a module: the user needs the Admin's Allow for at least one of the modules, otherwise they go to their first allowed screen. */
export const moduleGuard = (...modules: string[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (modules.some(m => auth.can(m))) {
    return true;
  }
  const home = auth.homeRoute();
  router.navigate([home]);
  return false;
};

/** Phase 2 pages: Phase 1 admins are sent back to the Phase 1 home (POS billing). */
export const phase2Guard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.hasPhase2()) {
    return true;
  }

  router.navigate(['/pos']);
  return false;
};

/** Super Admin pages: anyone else is sent back to their own home. */
export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isSuperAdmin()) {
    return true;
  }

  router.navigate([auth.isAuthenticated() ? '/pos' : '/login']);
  return false;
};

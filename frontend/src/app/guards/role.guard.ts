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

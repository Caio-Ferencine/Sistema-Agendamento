import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.authenticated() || router.createUrlTree(['/login']);
};

export function roleGuard(tipo: 'cliente' | 'profissional'): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.ready;
    const profile = auth.profile();
    if (!profile) return router.createUrlTree(['/login']);
    return profile.tipo === tipo || router.createUrlTree([`/${profile.tipo}`]);
  };
}

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  const profile = auth.profile();
  return !profile || router.createUrlTree([`/${profile.tipo}`]);
};

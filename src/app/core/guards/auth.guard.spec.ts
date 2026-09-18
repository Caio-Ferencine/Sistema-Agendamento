import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { Profile } from '../../models/entities';
import { AuthService } from '../auth/auth.service';
import { authGuard, guestGuard, roleGuard } from './auth.guard';

describe('authentication route guards', () => {
  const profile = signal<Profile | null>(null);
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;
  let router: Router;

  beforeEach(() => {
    profile.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { ready: Promise.resolve(), profile, authenticated: () => profile() !== null },
        },
      ],
    });
    router = TestBed.inject(Router);
  });

  it('redirects visitors to login', async () => {
    const result = await TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(result).toEqual(router.createUrlTree(['/login']));
  });

  it('prevents a client from entering a professional route', async () => {
    profile.set({ id: 'customer-id', tipo: 'cliente' } as Profile);
    const result = await TestBed.runInInjectionContext(() =>
      roleGuard('profissional')(route, state),
    );
    expect(result).toEqual(router.createUrlTree(['/cliente']));
  });

  it('allows a professional into their own dashboard', async () => {
    profile.set({ id: 'professional-id', tipo: 'profissional' } as Profile);
    const result = await TestBed.runInInjectionContext(() =>
      roleGuard('profissional')(route, state),
    );
    expect(result).toBe(true);
  });

  it('redirects authenticated users away from login to the correct dashboard', async () => {
    profile.set({ id: 'professional-id', tipo: 'profissional' } as Profile);
    const result = await TestBed.runInInjectionContext(() => guestGuard(route, state));
    expect(result).toEqual(router.createUrlTree(['/profissional']));
  });
});

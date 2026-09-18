import { TestBed } from '@angular/core/testing';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { Profile } from '../../models/entities';
import { Supabase } from '../services/supabase';
import { AuthService } from './auth.service';

describe('AuthService security and session lifecycle', () => {
  const profile: Profile = {
    id: 'customer-id',
    nome: 'Ana',
    telefone: null,
    tipo: 'cliente',
    fuso_horario: 'America/Sao_Paulo',
    created_at: '',
    updated_at: '',
  };
  const session = {
    access_token: 'test',
    refresh_token: 'test',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: profile.id, user_metadata: { tipo: 'profissional' } },
  } as unknown as Session;
  let authCallback: (event: AuthChangeEvent, session: Session | null) => void;
  let select: ReturnType<typeof vi.fn>;
  let maybeSingle: ReturnType<typeof vi.fn>;
  let signUp: ReturnType<typeof vi.fn>;
  let unsubscribe: ReturnType<typeof vi.fn>;
  let service: AuthService;

  beforeEach(() => {
    maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null });
    select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) });
    signUp = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    unsubscribe = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Supabase,
          useValue: {
            client: {
              from: vi.fn().mockReturnValue({ select }),
              auth: {
                onAuthStateChange: vi.fn().mockImplementation((callback) => {
                  authCallback = callback;
                  return { data: { subscription: { unsubscribe } } };
                }),
                getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
                signUp,
                signOut: vi.fn().mockResolvedValue({ error: null }),
              },
            },
          },
        },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  it('uses the database profile role instead of user-controlled metadata', async () => {
    await service.ready;
    expect(service.profile()?.tipo).toBe('cliente');
    expect(service.authenticated()).toBe(true);
    expect(service.loading()).toBe(false);
  });

  it('does not send a role in public registration metadata', async () => {
    const result = await service.signUp({
      nome: ' Ana ',
      email: ' ana@example.com ',
      password: 'example-password',
      telefone: '',
    });
    expect(result.requiresEmailConfirmation).toBe(true);
    expect(signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'example-password',
      options: {
        data: { nome: 'Ana', telefone: null },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  });

  it('clears access immediately when another tab signs out', async () => {
    await service.ready;
    authCallback('SIGNED_OUT', null);
    expect(service.session()).toBeNull();
    expect(service.profile()).toBeNull();
    expect(service.authenticated()).toBe(false);
  });

  it('never restores a profile from an in-flight query after logout', async () => {
    await service.ready;
    let resolveQuery!: (value: { data: Profile; error: null }) => void;
    maybeSingle.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
    );
    const refresh = service.refreshProfile();
    await Promise.resolve();
    await service.signOut();
    resolveQuery({ data: profile, error: null });
    await refresh;
    expect(service.profile()).toBeNull();
    expect(service.authenticated()).toBe(false);
  });

  it('denies access if the profile cannot be loaded', async () => {
    await service.ready;
    maybeSingle.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'private internal database details' },
    });
    await expect(service.refreshProfile()).rejects.toBeTruthy();
    expect(service.authenticated()).toBe(false);
    expect(service.profileError()).not.toContain('private internal');
  });

  it('unsubscribes the auth listener on teardown', async () => {
    await service.ready;
    service.ngOnDestroy();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Session, Subscription } from '@supabase/supabase-js';
import { Profile } from '../../models/entities';
import { AppError, errorMessage } from '../services/error-message';
import { Supabase } from '../services/supabase';

export interface RegistrationInput {
  nome: string;
  email: string;
  password: string;
  telefone?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly client = inject(Supabase).client;
  private readonly sessionState = signal<Session | null>(null);
  private readonly profileState = signal<Profile | null>(null);
  private readonly loadingState = signal(true);
  private readonly profileErrorState = signal<string | null>(null);
  private readonly subscription: Subscription;
  private profileRequest: { id: string; promise: Promise<void> } | null = null;
  private destroyed = false;

  readonly session = this.sessionState.asReadonly();
  readonly profile = this.profileState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly profileError = this.profileErrorState.asReadonly();
  readonly authenticated = computed(() => this.session() !== null && this.profile() !== null);
  readonly ready: Promise<void>;

  constructor() {
    this.subscription = this.client.auth.onAuthStateChange((_event, session) => {
      this.acceptSession(session);
      // Supabase holds its auth lock during this callback. Profile queries must run later.
      if (session && !this.profile()) {
        setTimeout(() => {
          if (!this.destroyed && this.session()?.user.id === session.user.id) {
            void this.loadProfile(session.user.id).catch(() => undefined);
          }
        }, 0);
      }
    }).data.subscription;
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      this.acceptSession(data.session);
      if (data.session) await this.loadProfile(data.session.user.id);
    } catch (error) {
      this.profileErrorState.set(errorMessage(error));
    } finally {
      this.loadingState.set(false);
    }
  }

  private acceptSession(session: Session | null): void {
    if (session?.user.id !== this.session()?.user.id) {
      this.profileState.set(null);
      this.profileErrorState.set(null);
      this.profileRequest = null;
    }
    this.sessionState.set(session);
  }

  private async loadProfile(id: string): Promise<void> {
    if (this.profileRequest?.id === id) return this.profileRequest.promise;
    const promise = (async () => {
      try {
        const { data, error } = await this.client
          .from('profiles')
          .select('id,nome,telefone,tipo,fuso_horario,created_at,updated_at')
          .eq('id', id)
          .maybeSingle();
        if (error) throw error;
        if (!data || !['cliente', 'profissional'].includes(data.tipo)) {
          throw new AppError(
            'Seu perfil ainda não está disponível. Tente novamente ou entre em contato com o responsável pelo sistema.',
          );
        }
        if (this.session()?.user.id === id && !this.destroyed) {
          this.profileState.set(data as Profile);
          this.profileErrorState.set(null);
        }
      } catch (error) {
        if (this.session()?.user.id === id && !this.destroyed) {
          this.profileState.set(null);
          this.profileErrorState.set(errorMessage(error));
        }
        throw error;
      }
    })();
    this.profileRequest = { id, promise };
    try {
      await promise;
    } finally {
      if (this.profileRequest?.promise === promise) this.profileRequest = null;
    }
  }

  async refreshProfile(): Promise<void> {
    await this.ready;
    const userId = this.session()?.user.id;
    if (!userId) throw new AppError('Entre na sua conta para continuar.');
    await this.loadProfile(userId);
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.ready;
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    this.acceptSession(data.session);
    await this.loadProfile(data.user.id);
  }

  async signUp(input: RegistrationInput): Promise<{ requiresEmailConfirmation: boolean }> {
    await this.ready;
    const { data, error } = await this.client.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: { nome: input.nome.trim(), telefone: input.telefone?.trim() || null },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
    if (data.session) {
      this.acceptSession(data.session);
      await this.loadProfile(data.session.user.id);
    }
    return { requiresEmailConfirmation: !data.session };
  }

  async resendConfirmation(email: string): Promise<void> {
    const { error } = await this.client.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    await this.ready;
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    this.acceptSession(null);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.subscription.unsubscribe();
  }
}

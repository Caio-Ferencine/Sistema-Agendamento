import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/services/error-message';

@Component({
  selector: 'app-auth-callback-page',
  imports: [RouterLink],
  template: `
    <main class="callback-layout">
      <section class="card callback-card">
        <span class="brand-mark" aria-hidden="true">a.</span>
        <p class="eyebrow">CONFIRMAÇÃO DE CONTA</p>
        @if (error()) {
          <h1>Não foi possível concluir</h1>
          <div class="alert alert-error" role="alert">{{ error() }}</div>
          <a class="btn btn-primary" routerLink="/login">Ir para o login</a>
        } @else {
          <h1>Validando seu acesso…</h1>
          <p class="muted" role="status">Aguarde enquanto preparamos sua agenda.</p>
        }
      </section>
    </main>
  `,
  styleUrl: './auth.css',
})
export class AuthCallbackPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly error = signal('');

  async ngOnInit(): Promise<void> {
    try {
      await this.auth.ready;
      const profile = this.auth.profile();
      if (profile) {
        await this.router.navigateByUrl(`/${profile.tipo}`, { replaceUrl: true });
      } else {
        this.error.set(
          this.auth.profileError() ??
            'O link expirou ou não pôde ser validado. Abra-o no mesmo navegador do cadastro, ou entre para solicitar uma nova confirmação.',
        );
      }
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}

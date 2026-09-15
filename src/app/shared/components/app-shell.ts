import { Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/services/error-message';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="app-layout">
      <aside class="sidebar">
        <a class="brand" [routerLink]="home()"
          ><span class="brand-mark" aria-hidden="true">a<span>•</span></span> agenda<span
            class="brand-dot"
            >.</span
          ></a
        >
        <div class="workspace-label">
          {{ auth.profile()?.tipo === 'profissional' ? 'ESPAÇO DO PROFISSIONAL' : 'SEU ESPAÇO' }}
        </div>
        <nav aria-label="Navegação principal">
          <a
            [routerLink]="home()"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: true }"
            ><span aria-hidden="true">▦</span> Visão geral</a
          >
          @if (auth.profile()?.tipo === 'cliente') {
            <a routerLink="/cliente/agendar" routerLinkActive="active"
              ><span aria-hidden="true">＋</span> Novo agendamento</a
            >
            <a routerLink="/cliente/agendamentos" routerLinkActive="active"
              ><span aria-hidden="true">▤</span> Meus agendamentos</a
            >
          } @else {
            <a routerLink="/profissional/agenda" routerLinkActive="active"
              ><span aria-hidden="true">▤</span> Minha agenda</a
            >
            <a routerLink="/profissional/servicos" routerLinkActive="active"
              ><span aria-hidden="true">◇</span> Serviços</a
            >
            <a routerLink="/profissional/disponibilidade" routerLinkActive="active"
              ><span aria-hidden="true">◷</span> Disponibilidade</a
            >
            <a routerLink="/profissional/bloqueios" routerLinkActive="active"
              ><span aria-hidden="true">⊘</span> Bloqueios</a
            >
          }
        </nav>
        <div class="sidebar-note">
          <span aria-hidden="true">✳</span><strong>Mais tempo para o que importa.</strong>
          <p>Sua rotina organizada, um horário de cada vez.</p>
        </div>
        <div class="sidebar-footer"><span class="online-dot"></span> Seu tempo, bem cuidado</div>
      </aside>
      <div class="workspace">
        <header class="topbar">
          <span class="topbar-context"
            >Agendamentos <span>/</span>
            {{ auth.profile()?.tipo === 'profissional' ? 'Profissional' : 'Cliente' }}</span
          >
          <div class="account">
            <span class="avatar">{{ auth.profile()?.nome?.charAt(0)?.toUpperCase() }}</span>
            <div>
              <strong>{{ auth.profile()?.nome }}</strong
              ><small>{{
                auth.profile()?.tipo === 'profissional' ? 'Conta profissional' : 'Conta pessoal'
              }}</small>
            </div>
            <button type="button" class="logout" [disabled]="leaving()" (click)="logout()">
              {{ leaving() ? 'Saindo…' : 'Sair' }}
            </button>
          </div>
        </header>
        <main id="main-content" class="main-content">
          @if (error()) {
            <p class="alert alert-error" role="alert">{{ error() }}</p>
          }
          <router-outlet />
        </main>
        <footer class="workspace-footer">
          agenda. <span>Organize seu tempo. Cuide de você.</span>
        </footer>
      </div>
    </div>
  `,
})
export class AppShell {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly leaving = signal(false);
  readonly error = signal('');
  constructor() {
    effect(() => {
      if (!this.auth.loading() && !this.auth.session()) void this.router.navigateByUrl('/login');
    });
  }
  home(): string {
    return this.auth.profile()?.tipo === 'profissional' ? '/profissional' : '/cliente';
  }
  async logout(): Promise<void> {
    this.leaving.set(true);
    this.error.set('');
    try {
      await this.auth.signOut();
      await this.router.navigateByUrl('/login');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.leaving.set(false);
    }
  }
}

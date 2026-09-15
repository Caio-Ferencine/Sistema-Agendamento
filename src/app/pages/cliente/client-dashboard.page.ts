import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SchedulingService } from '../../core/services/scheduling.service';
import { errorMessage } from '../../core/services/error-message';
import { Appointment } from '../../models/entities';
import { formatDateTime } from '../../shared/utils/date-time';

@Component({
  selector: 'app-client-dashboard',
  imports: [RouterLink],
  template: `
    <div class="page-header">
      <div>
        <p class="eyebrow">TUDO NO SEU TEMPO</p>
        <h1>Olá, {{ firstName() }} <span class="greeting-dot">✳</span></h1>
        <p class="muted">Um lugar para organizar seus próximos momentos.</p>
      </div>
      <a class="btn btn-primary" routerLink="/cliente/agendar">＋ Novo agendamento</a>
    </div>
    <section class="welcome-banner">
      <div>
        <span class="banner-tag">SUA ROTINA, MAIS LEVE</span>
        <h2>O próximo horário<br />é para você.</h2>
        <p>
          Escolha um serviço, encontre o melhor momento<br class="desktop-only" />
          e deixe o resto organizado por aqui.
        </p>
        <a class="btn btn-light" routerLink="/cliente/agendar"
          >Encontrar um horário <span aria-hidden="true">↗</span></a
        >
      </div>
      <div class="calendar-art" aria-hidden="true">
        <div class="art-orbit"></div>
        <div class="art-calendar">
          <div class="art-calendar-top">SEU PRÓXIMO MOMENTO <span>•••</span></div>
          <div class="art-week">
            <span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span>
          </div>
          <div class="art-days">
            <span>12</span><span>13</span><span class="art-selected">14</span><span>15</span
            ><span>16</span>
          </div>
          <div class="art-event">
            <span>✓</span>
            <div>Tempo reservado<small>Para cuidar de você</small></div>
          </div>
        </div>
        <div class="art-chip">✓ &nbsp; Tudo no seu tempo</div>
      </div>
    </section>
    @if (error()) {
      <div class="alert alert-error" role="alert">
        {{ error() }} <button class="text-button" (click)="load()">Tentar novamente</button>
      </div>
    }
    <div class="stat-grid">
      <div class="stat-card">
        <span class="stat-symbol mint">◷</span>
        <div>
          <p>Próximos agendamentos</p>
          <strong>{{ loading() ? '—' : upcoming().length }}</strong>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-symbol lavender">✓</span>
        <div>
          <p>Atendimentos concluídos</p>
          <strong>{{ loading() ? '—' : completed() }}</strong>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-symbol peach">◇</span>
        <div>
          <p>Profissionais disponíveis</p>
          <strong>{{ loading() ? '—' : professionals() }}</strong>
        </div>
      </div>
    </div>
    <section class="section-block">
      <div class="section-heading">
        <div>
          <h2>Seu próximo agendamento</h2>
          <p class="muted">Tudo o que você precisa saber, em um só lugar.</p>
        </div>
        <a routerLink="/cliente/agendamentos" class="text-link"
          >Ver todos <span aria-hidden="true">→</span></a
        >
      </div>
      @if (loading()) {
        <div class="card empty-state" role="status">Carregando seus agendamentos…</div>
      } @else if (next(); as item) {
        <article class="card next-appointment">
          <div class="appointment-icon" aria-hidden="true">◷</div>
          <div class="appointment-main">
            <span class="badge">Agendado</span>
            <h3>{{ item.servico_nome }}</h3>
            <p class="muted">Com {{ item.profissional_nome }}</p>
            <p class="appointment-date">{{ formatDateTime(item.inicio, item.fuso_horario) }}</p>
            <small class="muted">Fuso: {{ item.fuso_horario }}</small>
          </div>
          <a routerLink="/cliente/agendamentos" class="btn btn-secondary">Ver detalhes →</a>
        </article>
      } @else {
        <div class="card empty-state">
          <span class="empty-icon" aria-hidden="true">▦</span>
          <h3>Seu próximo momento começa aqui</h3>
          <p>
            Você ainda não tem agendamentos futuros.<br />Explore os serviços e escolha um horário
            para você.
          </p>
          <a class="btn btn-primary" routerLink="/cliente/agendar">Agendar meu primeiro horário</a>
        </div>
      }
    </section>
    <div class="help-strip">
      <span class="help-icon" aria-hidden="true">i</span>
      <div>
        <strong>Os planos mudaram? Tudo bem.</strong>
        <p>Você pode cancelar em Meus agendamentos. O horário é liberado automaticamente.</p>
      </div>
    </div>
  `,
})
export class ClientDashboardPage {
  private readonly auth = inject(AuthService);
  private readonly api = inject(SchedulingService);
  readonly appointments = signal<Appointment[]>([]);
  readonly professionals = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly firstName = computed(() => this.auth.profile()?.nome.split(' ')[0] || 'bem-vindo');
  readonly upcoming = computed(() =>
    this.appointments()
      .filter((item) => item.status === 'agendado' && Date.parse(item.fim) > Date.now())
      .sort((a, b) => a.inicio.localeCompare(b.inicio)),
  );
  readonly next = computed(() => this.upcoming()[0]);
  readonly completed = computed(
    () => this.appointments().filter((item) => item.status === 'concluido').length,
  );
  readonly formatDateTime = formatDateTime;
  constructor() {
    void this.load();
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [appointments, professionals] = await Promise.all([
        this.api.listAppointments(),
        this.api.listProfessionals(),
      ]);
      this.appointments.set(appointments);
      this.professionals.set(professionals.length);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SchedulingService } from '../../core/services/scheduling.service';
import { errorMessage } from '../../core/services/error-message';
import { Appointment } from '../../models/entities';
import { dateInZone, formatDateTime, todayInZone } from '../../shared/utils/date-time';

@Component({
  selector: 'app-professional-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">Seu espaço de trabalho</p>
        <h1>Olá, {{ firstName() }}.</h1>
        <p class="muted">Uma agenda organizada começa por aqui.</p>
      </div>
      <a class="btn btn-primary" routerLink="/profissional/agenda"
        >Ver minha agenda <span aria-hidden="true">↗</span></a
      >
    </header>
    @if (error()) {
      <div class="alert alert-error" role="alert">
        {{ error() }} <button class="btn btn-secondary" (click)="load()">Tentar novamente</button>
      </div>
    }
    @if (loading()) {
      <p class="muted" role="status">Carregando seu painel…</p>
    } @else {
      <section class="stat-grid" aria-label="Resumo da agenda">
        <article class="stat-card">
          <span class="muted">Atendimentos hoje</span><strong>{{ todayCount() }}</strong
          ><span>Agendados ou concluídos</span>
        </article>
        <article class="stat-card">
          <span class="muted">Próximos agendamentos</span><strong>{{ upcoming().length }}</strong
          ><span>Horários confirmados</span>
        </article>
        <article class="stat-card">
          <span class="muted">Serviços ativos</span><strong>{{ activeServices() }}</strong
          ><a routerLink="/profissional/servicos">Gerenciar serviços →</a>
        </article>
      </section>
      <div class="dashboard-grid">
        <section class="card stack">
          <div class="section-title">
            <div>
              <p class="eyebrow">A seguir</p>
              <h2>Próximos atendimentos</h2>
            </div>
            <a routerLink="/profissional/agenda">Ver todos</a>
          </div>
          @for (appointment of upcoming().slice(0, 5); track appointment.id) {
            <article class="upcoming-item">
              <div class="avatar" aria-hidden="true">
                {{ appointment.cliente_nome.slice(0, 1).toUpperCase() }}
              </div>
              <div>
                <h3>{{ appointment.cliente_nome }}</h3>
                <p class="muted">{{ appointment.servico_nome }}</p>
                <p>{{ dateLabel(appointment.inicio) }}</p>
              </div>
              <span class="badge">Agendado</span>
            </article>
          } @empty {
            <div class="empty-state">
              <h3>Sua agenda está livre</h3>
              <p>Configure seus serviços e horários de trabalho para receber agendamentos.</p>
              <a class="btn btn-secondary" routerLink="/profissional/disponibilidade"
                >Configurar disponibilidade</a
              >
            </div>
          }
        </section>
        <aside class="stack">
          <section class="card stack">
            <p class="eyebrow">Tudo no seu ritmo</p>
            <h2>Prepare sua agenda</h2>
            <p class="muted">
              Seus horários livres são calculados automaticamente a partir dos serviços, dias de
              trabalho e bloqueios.
            </p>
            <a class="quick-link" routerLink="/profissional/servicos"
              ><span
                ><strong>Serviços</strong><small>Preço e duração de cada atendimento</small></span
              ><span aria-hidden="true">→</span></a
            ><a class="quick-link" routerLink="/profissional/disponibilidade"
              ><span
                ><strong>Disponibilidade</strong><small>Dias de trabalho e intervalos</small></span
              ><span aria-hidden="true">→</span></a
            ><a class="quick-link" routerLink="/profissional/bloqueios"
              ><span><strong>Bloqueios</strong><small>Compromissos, folgas e férias</small></span
              ><span aria-hidden="true">→</span></a
            >
          </section>
          <p class="muted timezone-note">
            Os horários da sua agenda seguem o fuso {{ timeZone() }}.
          </p>
        </aside>
      </div>
    }
  `,
  styles: `
    .dashboard-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.6fr) minmax(260px, 1fr);
      gap: 1.5rem;
      margin-top: 1.5rem;
      align-items: start;
    }
    .section-title,
    .upcoming-item,
    .quick-link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .section-title h2 {
      margin: 0;
    }
    .upcoming-item {
      justify-content: flex-start;
      padding: 1.2rem 0;
      border-top: 1px solid var(--border, #e5ebe7);
    }
    .upcoming-item h3,
    .upcoming-item p {
      margin: 0 0 0.3rem;
    }
    .upcoming-item .badge {
      margin-left: auto;
    }
    .avatar {
      display: grid;
      place-items: center;
      flex: 0 0 44px;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #edf3e9;
      color: #315a41;
      font-weight: 700;
    }
    .quick-link {
      padding: 1rem 0;
      border-top: 1px solid var(--border, #e5ebe7);
      text-decoration: none;
      color: inherit;
    }
    .quick-link small {
      display: block;
      color: var(--muted, #68756b);
      margin-top: 0.35rem;
      line-height: 1.4;
    }
    .timezone-note {
      font-size: 0.8rem;
      padding: 0 0.5rem;
    }
    @media (max-width: 850px) {
      .dashboard-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 480px) {
      .upcoming-item {
        flex-wrap: wrap;
      }
      .upcoming-item .badge {
        margin-left: 60px;
      }
      .section-title {
        align-items: flex-start;
      }
    }
  `,
})
export class ProfessionalDashboardPage {
  readonly auth = inject(AuthService);
  private readonly scheduling = inject(SchedulingService);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly appointments = signal<Appointment[]>([]);
  readonly activeServices = signal(0);
  readonly timeZone = computed(() => this.auth.profile()?.fuso_horario ?? 'America/Sao_Paulo');
  readonly firstName = computed(() => this.auth.profile()?.nome.split(' ')[0] ?? 'profissional');
  readonly upcoming = computed(() =>
    this.appointments()
      .filter((item) => item.status === 'agendado' && new Date(item.fim).getTime() > Date.now())
      .sort((a, b) => a.inicio.localeCompare(b.inicio)),
  );
  readonly todayCount = computed(() => {
    const today = todayInZone(this.timeZone());
    return this.appointments().filter(
      (item) =>
        (item.status === 'agendado' || item.status === 'concluido') &&
        dateInZone(item.inicio, this.timeZone()) === today,
    ).length;
  });
  constructor() {
    void this.load();
  }
  dateLabel(value: string): string {
    return formatDateTime(value, this.timeZone());
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.ready;
      const profile = this.auth.profile();
      if (!profile) return;
      const [appointments, services] = await Promise.all([
        this.scheduling.listAppointments(),
        this.scheduling.listServices(profile.id),
      ]);
      this.appointments.set(appointments);
      this.activeServices.set(services.length);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}

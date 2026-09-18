import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SchedulingService } from '../../core/services/scheduling.service';
import { errorMessage } from '../../core/services/error-message';
import { Appointment, STATUS_LABELS } from '../../models/entities';
import { formatDateTime } from '../../shared/utils/date-time';

@Component({
  selector: 'app-client-appointments',
  imports: [RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <p class="eyebrow">SUA ROTINA ORGANIZADA</p>
        <h1>Meus agendamentos</h1>
        <p class="muted">Acompanhe os próximos horários e seu histórico.</p>
      </div>
      <a class="btn btn-primary" routerLink="/cliente/agendar">＋ Novo agendamento</a>
    </div>
    @if (error()) {
      <div class="alert alert-error" role="alert">{{ error() }}</div>
    }
    @if (success()) {
      <div class="alert alert-success" role="status">{{ success() }}</div>
    }
    <div class="list-toolbar">
      <div class="filter-tabs" aria-label="Filtrar agendamentos">
        <button
          [class.active]="filter() === 'upcoming'"
          [attr.aria-pressed]="filter() === 'upcoming'"
          (click)="filter.set('upcoming')"
        >
          Próximos</button
        ><button
          [class.active]="filter() === 'past'"
          [attr.aria-pressed]="filter() === 'past'"
          (click)="filter.set('past')"
        >
          Anteriores</button
        ><button
          [class.active]="filter() === 'cancelled'"
          [attr.aria-pressed]="filter() === 'cancelled'"
          (click)="filter.set('cancelled')"
        >
          Cancelados
        </button>
      </div>
      <button class="btn btn-secondary" [disabled]="loading() || !!busy()" (click)="load()">
        ↻ Atualizar
      </button>
    </div>
    @if (loading()) {
      <div class="card empty-state" role="status">Carregando seus agendamentos…</div>
    } @else {
      <div class="stack">
        @for (item of visible(); track item.id) {
          <article class="card appointment-card">
            <div class="appointment-row">
              <div class="appointment-icon" aria-hidden="true">◷</div>
              <div class="appointment-main">
                <div class="appointment-title">
                  <h3>{{ item.servico_nome }}</h3>
                  <span
                    class="badge"
                    [class.badge-cancelled]="item.status.startsWith('cancelado')"
                    [class.badge-completed]="item.status === 'concluido'"
                    >{{ labels[item.status] }}</span
                  >
                </div>
                <p class="muted">Com {{ item.profissional_nome }}</p>
                <p class="appointment-date">{{ formatDateTime(item.inicio, item.fuso_horario) }}</p>
                <small class="muted"
                  >Até {{ formatDateTime(item.fim, item.fuso_horario) }} ·
                  {{ item.fuso_horario }}</small
                >
                @if (item.cancelado_em) {
                  <p class="cancellation-note">
                    Cancelado em {{ formatDateTime(item.cancelado_em, item.fuso_horario)
                    }}{{ item.motivo_cancelamento ? ' · ' + item.motivo_cancelamento : '' }}
                  </p>
                }
              </div>
              @if (canCancel(item)) {
                <button
                  class="btn btn-danger-outline"
                  [disabled]="!!busy()"
                  (click)="askCancel(item.id)"
                >
                  Cancelar
                </button>
              }
            </div>
            @if (cancelId() === item.id) {
              <form class="cancel-panel" (ngSubmit)="cancel(item)">
                <strong>Cancelar este agendamento?</strong>
                <p>
                  O horário será liberado para outras pessoas. O registro continuará no seu
                  histórico.
                </p>
                <label class="field"
                  >Motivo <span class="muted">(opcional)</span
                  ><input
                    name="reason"
                    [(ngModel)]="reason"
                    maxlength="500"
                    placeholder="Se quiser, conte o motivo"
                /></label>
                <div class="toolbar">
                  <button type="submit" class="btn btn-danger" [disabled]="!!busy()">
                    {{ busy() === item.id ? 'Cancelando…' : 'Confirmar cancelamento' }}</button
                  ><button
                    type="button"
                    class="btn btn-secondary"
                    [disabled]="!!busy()"
                    (click)="cancelId.set(null)"
                  >
                    Manter agendamento
                  </button>
                </div>
              </form>
            }
          </article>
        } @empty {
          <div class="card empty-state">
            <span class="empty-icon" aria-hidden="true">▤</span>
            <h3>
              {{ error() ? 'Não foi possível carregar sua agenda' : 'Nenhum agendamento por aqui' }}
            </h3>
            <p>
              {{
                error()
                  ? 'Use Atualizar para tentar novamente.'
                  : 'Os agendamentos desta categoria aparecerão aqui.'
              }}
            </p>
            @if (!error()) {
              <a class="btn btn-secondary" routerLink="/cliente/agendar">Explorar horários</a>
            }
          </div>
        }
      </div>
    }
  `,
})
export class ClientAppointmentsPage {
  private readonly api = inject(SchedulingService);
  readonly appointments = signal<Appointment[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly success = signal('');
  readonly busy = signal<string | null>(null);
  readonly filter = signal<'upcoming' | 'past' | 'cancelled'>('upcoming');
  readonly cancelId = signal<string | null>(null);
  reason = '';
  readonly labels = STATUS_LABELS;
  readonly formatDateTime = formatDateTime;
  readonly visible = computed(() =>
    this.appointments()
      .filter((item) => {
        if (this.filter() === 'cancelled') return item.status.startsWith('cancelado');
        if (this.filter() === 'upcoming')
          return item.status === 'agendado' && Date.parse(item.fim) > Date.now();
        return (
          item.status === 'concluido' ||
          (item.status === 'agendado' && Date.parse(item.fim) <= Date.now())
        );
      })
      .sort((a, b) =>
        this.filter() === 'upcoming'
          ? a.inicio.localeCompare(b.inicio)
          : b.inicio.localeCompare(a.inicio),
      ),
  );
  constructor() {
    void this.load();
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.appointments.set(await this.api.listAppointments());
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
  askCancel(id: string): void {
    this.cancelId.set(id);
    this.reason = '';
    this.success.set('');
  }
  canCancel(item: Appointment): boolean {
    return item.status === 'agendado' && Date.parse(item.inicio) > Date.now();
  }
  async cancel(item: Appointment): Promise<void> {
    if (this.busy()) return;
    if (!this.canCancel(item)) {
      this.cancelId.set(null);
      this.error.set('Só é possível cancelar antes do início do atendimento. Atualize sua agenda.');
      return;
    }
    this.busy.set(item.id);
    this.error.set('');
    this.success.set('');
    try {
      await this.api.cancelAppointment(item.id, this.reason);
      this.cancelId.set(null);
      this.success.set('Agendamento cancelado. O horário está disponível novamente.');
      await this.load();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(null);
    }
  }
}

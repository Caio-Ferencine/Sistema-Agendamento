import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SchedulingService } from '../../core/services/scheduling.service';
import { errorMessage } from '../../core/services/error-message';
import { Appointment } from '../../models/entities';
import { dateInZone, formatDateTime, formatTime, todayInZone } from '../../shared/utils/date-time';

type AgendaPeriod = 'upcoming' | 'history' | 'all';
type AgendaAction = { appointment: Appointment; kind: 'cancel' | 'complete' };

@Component({
  selector: 'app-professional-agenda',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">Seus atendimentos</p>
        <h1>Minha agenda</h1>
        <p class="muted">Acompanhe seus clientes e gerencie cada atendimento.</p>
      </div>
      <a class="btn btn-secondary" routerLink="/profissional/bloqueios">Bloquear período</a>
    </header>
    @if (error()) {
      <div class="alert alert-error" role="alert">{{ error() }}</div>
    }
    @if (success()) {
      <div class="alert alert-success" role="status">{{ success() }}</div>
    }
    <section class="card filters">
      <div class="period-tabs" role="group" aria-label="Período da agenda">
        <button
          class="period-tab"
          [class.selected]="period() === 'upcoming'"
          [attr.aria-pressed]="period() === 'upcoming'"
          (click)="period.set('upcoming')"
        >
          Próximos</button
        ><button
          class="period-tab"
          [class.selected]="period() === 'history'"
          [attr.aria-pressed]="period() === 'history'"
          (click)="period.set('history')"
        >
          Histórico</button
        ><button
          class="period-tab"
          [class.selected]="period() === 'all'"
          [attr.aria-pressed]="period() === 'all'"
          (click)="period.set('all')"
        >
          Todos
        </button>
      </div>
      <div class="date-filter">
        <label for="agenda-date">Data</label
        ><input
          id="agenda-date"
          type="date"
          [value]="selectedDate()"
          (input)="setDate($event)"
        /><button class="btn btn-secondary" (click)="showToday()">Hoje</button>
        @if (selectedDate()) {
          <button class="clear-button" (click)="selectedDate.set('')">Limpar</button>
        }
      </div>
      <button
        class="btn btn-secondary refresh-button"
        (click)="load()"
        [disabled]="loading() || saving()"
      >
        Atualizar
      </button>
    </section>
    <p class="muted timezone-note">
      Horários no fuso {{ timeZone() }} · {{ filtered().length }}
      {{ filtered().length === 1 ? 'agendamento' : 'agendamentos' }}
    </p>
    @if (loading()) {
      <p class="muted" role="status">Carregando sua agenda…</p>
    } @else {
      <section class="agenda-list" aria-label="Lista de agendamentos">
        @for (appointment of filtered(); track appointment.id) {
          <article class="card appointment">
            <div class="appointment-time">
              <strong>{{ timeLabel(appointment.inicio) }}</strong
              ><span>até {{ timeLabel(appointment.fim) }}</span
              ><small>{{ dayLabel(appointment.inicio) }}</small>
            </div>
            <div class="appointment-main">
              <div class="appointment-heading">
                <h2>{{ appointment.servico_nome }}</h2>
                <span
                  class="badge"
                  [class.cancelled]="appointment.status.startsWith('cancelado')"
                  [class.completed]="appointment.status === 'concluido'"
                  >{{ statusLabel(appointment.status) }}</span
                >
              </div>
              <p class="client-name">{{ appointment.cliente_nome }}</p>
              <p class="muted client-phone">
                {{ appointment.cliente_telefone || 'Cliente sem telefone informado' }}
              </p>
              @if (appointment.motivo_cancelamento) {
                <p class="cancellation-reason">Motivo: {{ appointment.motivo_cancelamento }}</p>
              }
              @if (appointment.cancelado_em) {
                <p class="muted cancellation-date">
                  Cancelado em {{ dateLabel(appointment.cancelado_em) }}
                </p>
              }
            </div>
            <div class="appointment-actions">
              @if (appointment.status === 'agendado') {
                @if (canComplete(appointment)) {
                  <button
                    class="btn btn-primary"
                    (click)="chooseAction(appointment, 'complete')"
                    [disabled]="saving()"
                  >
                    Concluir
                  </button>
                }
                @if (canCancel(appointment)) {
                  <button
                    class="btn btn-secondary"
                    (click)="chooseAction(appointment, 'cancel')"
                    [disabled]="saving()"
                  >
                    Cancelar
                  </button>
                }
              }
            </div>
          </article>
          @if (action()?.appointment?.id === appointment.id) {
            <section
              class="card action-panel"
              [attr.aria-label]="
                action()?.kind === 'cancel' ? 'Confirmar cancelamento' : 'Concluir atendimento'
              "
            >
              <h3>
                {{
                  action()?.kind === 'cancel'
                    ? 'Cancelar este agendamento?'
                    : 'Marcar atendimento como concluído?'
                }}
              </h3>
              <p class="muted">
                {{ appointment.cliente_nome }} · {{ dateLabel(appointment.inicio) }}
              </p>
              <form [formGroup]="actionForm" (ngSubmit)="confirmAction()" class="stack">
                @if (action()?.kind === 'cancel') {
                  <p>
                    O cancelamento ficará no histórico e o horário será liberado para novos
                    agendamentos.
                  </p>
                  <div class="field">
                    <label for="cancel-reason"
                      >Motivo do cancelamento <span class="muted">(opcional)</span></label
                    ><textarea
                      id="cancel-reason"
                      formControlName="motivo"
                      maxlength="500"
                      rows="2"
                      placeholder="Informe um motivo para o cliente."
                    ></textarea>
                    @if (actionForm.controls.motivo.invalid && actionForm.controls.motivo.touched) {
                      <small class="field-error">Use no máximo 500 caracteres.</small>
                    }
                  </div>
                } @else {
                  <p>
                    Confirme que o atendimento foi realizado. A conclusão ficará registrada no
                    histórico.
                  </p>
                }
                <div class="toolbar">
                  <button
                    class="btn"
                    [class.btn-danger]="action()?.kind === 'cancel'"
                    [class.btn-primary]="action()?.kind === 'complete'"
                    type="submit"
                    [disabled]="saving()"
                  >
                    {{
                      saving()
                        ? 'Salvando…'
                        : action()?.kind === 'cancel'
                          ? 'Confirmar cancelamento'
                          : 'Confirmar conclusão'
                    }}</button
                  ><button
                    class="btn btn-secondary"
                    type="button"
                    (click)="action.set(null)"
                    [disabled]="saving()"
                  >
                    Voltar
                  </button>
                </div>
              </form>
            </section>
          }
        } @empty {
          <section class="card empty-state">
            <h2>Nenhum agendamento por aqui</h2>
            <p>
              {{
                selectedDate()
                  ? 'Não há atendimentos para esta data e filtro. Tente outra data ou limpe o filtro.'
                  : 'Seus atendimentos aparecerão aqui assim que um cliente reservar um horário.'
              }}
            </p>
            <a class="btn btn-secondary" routerLink="/profissional/disponibilidade"
              >Ver disponibilidade</a
            >
          </section>
        }
      </section>
    }
  `,
  styles: `
    .filters {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      flex-wrap: wrap;
      padding: 1rem 1.25rem;
    }
    .period-tabs {
      display: flex;
      padding: 0.25rem;
      background: #f3f6f4;
      border-radius: 9px;
      gap: 0.15rem;
    }
    .period-tab {
      border: 0;
      background: transparent;
      padding: 0.6rem 0.85rem;
      border-radius: 6px;
      font: inherit;
      font-size: 0.9rem;
      color: var(--muted, #63746a);
      cursor: pointer;
    }
    .period-tab.selected {
      background: white;
      color: #17675b;
      box-shadow: 0 1px 5px #142c2012;
      font-weight: 600;
    }
    .date-filter {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      flex-wrap: wrap;
      font-size: 0.9rem;
    }
    .date-filter input {
      width: auto;
      max-width: 100%;
    }
    .refresh-button {
      margin-left: auto;
    }
    .clear-button {
      border: 0;
      background: none;
      color: #17675b;
      text-decoration: underline;
      font: inherit;
      cursor: pointer;
    }
    .timezone-note {
      font-size: 0.85rem;
      margin: 1.25rem 0;
    }
    .agenda-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .appointment {
      display: grid;
      grid-template-columns: 110px minmax(0, 1fr) auto;
      gap: 1.5rem;
      align-items: center;
    }
    .appointment-time {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding-right: 1.25rem;
      border-right: 1px solid var(--border, #e5ebe9);
    }
    .appointment-time strong {
      font-size: 1.6rem;
      letter-spacing: -0.06rem;
    }
    .appointment-time span,
    .appointment-time small {
      color: var(--muted, #68766e);
      font-size: 0.8rem;
    }
    .appointment-time small {
      margin-top: 0.5rem;
      font-weight: 600;
    }
    .appointment-heading {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      flex-wrap: wrap;
    }
    .appointment-heading h2 {
      font-size: 1.05rem;
      margin: 0;
      overflow-wrap: anywhere;
    }
    .client-name {
      margin: 0.55rem 0 0.2rem;
      font-weight: 500;
    }
    .client-phone {
      margin: 0;
      font-size: 0.85rem;
    }
    .appointment-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .cancelled {
      background: #fbeeea;
      color: #9a4a3b;
    }
    .completed {
      background: #edf2fb;
      color: #496588;
    }
    .cancellation-reason {
      font-size: 0.85rem;
      color: #945143;
      margin: 0.75rem 0 0;
      overflow-wrap: anywhere;
    }
    .cancellation-date {
      font-size: 0.8rem;
      margin: 0.4rem 0 0;
    }
    .action-panel {
      margin-top: -0.5rem;
      background: #fcfbf7;
      border-color: #ddd6c6;
    }
    .action-panel h3 {
      margin: 0;
    }
    .action-panel p {
      line-height: 1.6;
    }
    .action-panel .field {
      max-width: 700px;
    }
    .field-error {
      color: #aa3333;
    }
    @media (max-width: 850px) {
      .appointment {
        grid-template-columns: 90px minmax(0, 1fr);
        gap: 1rem;
      }
      .appointment-actions {
        grid-column: 2;
      }
      .appointment-time {
        padding-right: 0.75rem;
      }
      .refresh-button {
        margin-left: 0;
      }
    }
    @media (max-width: 450px) {
      .filters {
        padding: 1rem;
        gap: 1rem;
      }
      .period-tabs {
        width: 100%;
      }
      .period-tab {
        flex: 1;
        padding: 0.6rem 0.5rem;
      }
      .appointment {
        grid-template-columns: 1fr;
      }
      .appointment-time {
        border: 0;
        padding: 0;
        flex-direction: row;
        align-items: baseline;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .appointment-time small {
        margin: 0 0 0 auto;
      }
      .appointment-actions {
        grid-column: 1;
      }
    }
  `,
})
export class ProfessionalAgendaPage {
  private readonly auth = inject(AuthService);
  private readonly scheduling = inject(SchedulingService);
  private readonly fb = inject(FormBuilder);
  readonly appointments = signal<Appointment[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly period = signal<AgendaPeriod>('upcoming');
  readonly selectedDate = signal('');
  readonly action = signal<AgendaAction | null>(null);
  readonly timeZone = computed(() => this.auth.profile()?.fuso_horario ?? 'America/Sao_Paulo');
  readonly actionForm = this.fb.nonNullable.group({ motivo: ['', Validators.maxLength(500)] });
  readonly filtered = computed(() => {
    const now = Date.now();
    return this.appointments()
      .filter((appointment) => {
        const upcoming =
          appointment.status === 'agendado' && new Date(appointment.fim).getTime() > now;
        if (this.period() === 'upcoming' && !upcoming) return false;
        if (this.period() === 'history' && upcoming) return false;
        return (
          !this.selectedDate() ||
          dateInZone(appointment.inicio, this.timeZone()) === this.selectedDate()
        );
      })
      .sort((a, b) =>
        this.period() === 'history'
          ? b.inicio.localeCompare(a.inicio)
          : a.inicio.localeCompare(b.inicio),
      );
  });
  constructor() {
    void this.load();
  }
  dateLabel(value: string): string {
    return formatDateTime(value, this.timeZone());
  }
  timeLabel(value: string): string {
    return formatTime(value, this.timeZone());
  }
  dayLabel(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: this.timeZone(),
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }
  setDate(event: Event): void {
    this.selectedDate.set((event.target as HTMLInputElement).value);
  }
  showToday(): void {
    this.period.set('all');
    this.selectedDate.set(todayInZone(this.timeZone()));
  }
  canComplete(appointment: Appointment): boolean {
    return appointment.status === 'agendado' && new Date(appointment.fim).getTime() <= Date.now();
  }
  canCancel(appointment: Appointment): boolean {
    return appointment.status === 'agendado' && new Date(appointment.inicio).getTime() > Date.now();
  }
  statusLabel(status: Appointment['status']): string {
    return {
      agendado: 'Agendado',
      cancelado_cliente: 'Cancelado pelo cliente',
      cancelado_profissional: 'Cancelado por você',
      concluido: 'Concluído',
    }[status];
  }
  chooseAction(appointment: Appointment, kind: AgendaAction['kind']): void {
    this.action.set({ appointment, kind });
    this.actionForm.reset({ motivo: '' });
    this.error.set('');
    this.success.set('');
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.ready;
      this.appointments.set(await this.scheduling.listAppointments());
      this.action.set(null);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
  async confirmAction(): Promise<void> {
    this.actionForm.markAllAsTouched();
    const action = this.action();
    if (!action || this.saving() || this.actionForm.invalid) return;
    if (action.kind === 'cancel' && !this.canCancel(action.appointment)) {
      this.action.set(null);
      this.error.set(
        'Este atendimento já começou e não pode mais ser cancelado. Atualize a agenda.',
      );
      return;
    }
    if (action.kind === 'complete' && !this.canComplete(action.appointment)) {
      this.error.set('Aguarde o horário final do atendimento para registrar a conclusão.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      if (action.kind === 'cancel')
        await this.scheduling.cancelAppointment(
          action.appointment.id,
          this.actionForm.controls.motivo.value.trim() || undefined,
        );
      else await this.scheduling.completeAppointment(action.appointment.id);
      this.action.set(null);
      this.appointments.set(await this.scheduling.listAppointments());
      this.success.set(
        action.kind === 'cancel'
          ? 'Agendamento cancelado. O horário foi liberado e o cancelamento ficou no histórico.'
          : 'Atendimento concluído com sucesso.',
      );
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { SchedulingService } from '../../core/services/scheduling.service';
import { errorMessage } from '../../core/services/error-message';
import { Availability } from '../../models/entities';

function orderedHours(control: AbstractControl): ValidationErrors | null {
  const start = control.get('hora_inicio')?.value as string;
  const end = control.get('hora_fim')?.value as string;
  return start && end && start >= end ? { hoursOrder: true } : null;
}

@Component({
  selector: 'app-professional-availability',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">Sua rotina</p>
        <h1>Disponibilidade</h1>
        <p class="muted">
          Defina seus dias e horários de trabalho. Os horários livres são gerados automaticamente.
        </p>
      </div>
    </header>
    @if (error()) {
      <div class="alert alert-error" role="alert">{{ error() }}</div>
    }
    @if (success()) {
      <div class="alert alert-success" role="status">{{ success() }}</div>
    }
    <div class="availability-layout">
      <section class="card stack weekly-schedule">
        <div>
          <h2>Semana de trabalho</h2>
          <p class="muted">Fuso horário: {{ timeZone() }}</p>
        </div>
        @if (loading()) {
          <p role="status" class="muted">Carregando sua disponibilidade…</p>
        } @else {
          @for (day of weekDays; track day.value) {
            <article class="day-row">
              <div class="day-title">
                <span class="day-dot" [class.is-active]="ranges(day.value).length > 0"></span>
                <h3>{{ day.label }}</h3>
              </div>
              <div class="day-ranges">
                @for (range of ranges(day.value); track range.id) {
                  <div class="range-row">
                    <span class="time-range"
                      >{{ range.hora_inicio.slice(0, 5) }} – {{ range.hora_fim.slice(0, 5) }}</span
                    >
                    <div class="range-actions">
                      <button
                        class="text-button"
                        (click)="edit(range)"
                        [disabled]="saving()"
                        [attr.aria-label]="
                          'Editar faixa de ' + day.label + ' às ' + range.hora_inicio.slice(0, 5)
                        "
                      >
                        Editar</button
                      ><button
                        class="text-button danger-text"
                        (click)="removingId.set(range.id)"
                        [disabled]="saving()"
                        [attr.aria-label]="
                          'Remover faixa de ' + day.label + ' às ' + range.hora_inicio.slice(0, 5)
                        "
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                  @if (removingId() === range.id) {
                    <div class="remove-confirm">
                      <p>Remover esta faixa da sua semana de trabalho?</p>
                      <div class="toolbar">
                        <button
                          class="btn btn-danger"
                          (click)="remove(range.id)"
                          [disabled]="saving()"
                        >
                          {{ saving() ? 'Removendo…' : 'Sim, remover' }}</button
                        ><button
                          class="btn btn-secondary"
                          (click)="removingId.set(null)"
                          [disabled]="saving()"
                        >
                          Manter
                        </button>
                      </div>
                    </div>
                  }
                } @empty {
                  <span class="muted day-off">Sem atendimento</span>
                }
                <button
                  class="text-button add-range"
                  (click)="newRange(day.value)"
                  [disabled]="saving()"
                >
                  + Adicionar faixa
                </button>
              </div>
            </article>
          }
        }
      </section>
      <aside class="stack">
        <section class="card stack editor">
          <div>
            <p class="eyebrow">Horário de atendimento</p>
            <h2>{{ editingId() ? 'Editar faixa' : 'Adicionar faixa' }}</h2>
          </div>
          <form [formGroup]="form" (ngSubmit)="save()" class="stack">
            <div class="field">
              <label for="availability-day">Dia da semana</label
              ><select id="availability-day" formControlName="dia_semana">
                @for (day of weekDays; track day.value) {
                  <option [ngValue]="day.value">{{ day.label }}</option>
                }
              </select>
            </div>
            <div class="form-grid">
              <div class="field">
                <label for="availability-start">Início</label
                ><input
                  id="availability-start"
                  type="time"
                  formControlName="hora_inicio"
                  required
                />
                @if (form.controls.hora_inicio.invalid && form.controls.hora_inicio.touched) {
                  <small class="field-error">Informe o horário inicial.</small>
                }
              </div>
              <div class="field">
                <label for="availability-end">Fim</label
                ><input id="availability-end" type="time" formControlName="hora_fim" required />
                @if (form.controls.hora_fim.invalid && form.controls.hora_fim.touched) {
                  <small class="field-error">Informe o horário final.</small>
                }
              </div>
            </div>
            @if (form.hasError('hoursOrder') && form.touched) {
              <p class="field-error" role="alert">O horário final deve ser posterior ao inicial.</p>
            }
            <div class="toolbar">
              <button class="btn btn-primary" type="submit" [disabled]="saving()">
                {{
                  saving() ? 'Salvando…' : editingId() ? 'Salvar alteração' : 'Adicionar horário'
                }}
              </button>
              @if (editingId()) {
                <button
                  class="btn btn-secondary"
                  type="button"
                  (click)="newRange()"
                  [disabled]="saving()"
                >
                  Cancelar edição
                </button>
              }
            </div>
          </form>
        </section>
        <section class="card guidance">
          <h3>Como definir intervalos</h3>
          <p class="muted">
            Para uma pausa de almoço entre 12h e 13h, cadastre duas faixas no mesmo dia:
            <strong>09:00–12:00</strong> e <strong>13:00–18:00</strong>.
          </p>
          <p class="muted">
            Um serviço só será oferecido se couber por inteiro em uma faixa. Compromissos e férias
            podem ser definidos em Bloqueios.
          </p>
          <p class="muted">Alterar sua rotina não cancela os agendamentos já confirmados.</p>
        </section>
      </aside>
    </div>
  `,
  styles: `
    .availability-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(300px, 1fr);
      gap: 1.5rem;
      align-items: start;
    }
    .day-row {
      display: grid;
      grid-template-columns: 145px 1fr;
      gap: 1rem;
      padding: 1.25rem 0;
      border-top: 1px solid var(--border, #e5ebe9);
    }
    .day-title {
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
    }
    .day-title h3 {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.5;
    }
    .day-dot {
      flex: 0 0 7px;
      width: 7px;
      height: 7px;
      margin-top: 0.5rem;
      border-radius: 50%;
      background: #c8d0cb;
    }
    .day-dot.is-active {
      background: #218b71;
    }
    .day-ranges {
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
    }
    .range-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .time-range {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      font-weight: 500;
    }
    .range-actions {
      display: flex;
      gap: 0.75rem;
    }
    .text-button {
      padding: 0;
      background: none;
      border: 0;
      color: #17675b;
      cursor: pointer;
      text-align: left;
      font: inherit;
      font-size: 0.85rem;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .text-button:disabled {
      opacity: 0.5;
      cursor: wait;
    }
    .danger-text {
      color: #a53939;
    }
    .add-range {
      align-self: flex-start;
      font-size: 0.8rem;
      text-decoration: none;
    }
    .day-off {
      font-size: 0.9rem;
    }
    .guidance h3 {
      margin-top: 0;
    }
    .guidance p {
      line-height: 1.7;
      font-size: 0.875rem;
    }
    .remove-confirm {
      padding: 1rem;
      background: #fff3ef;
      border-radius: 10px;
    }
    .remove-confirm p {
      margin: 0 0 0.75rem;
      font-size: 0.9rem;
    }
    .field-error {
      color: #aa3333;
      font-size: 0.85rem;
    }
    @media (max-width: 1000px) {
      .availability-layout {
        grid-template-columns: 1fr;
      }
      .availability-layout > aside {
        grid-template-columns: 1fr 1fr;
        display: grid;
      }
    }
    @media (max-width: 650px) {
      .availability-layout > aside {
        grid-template-columns: 1fr;
      }
      .day-row {
        grid-template-columns: 1fr;
        gap: 0.75rem;
      }
      .day-ranges {
        padding-left: 1rem;
      }
    }
  `,
})
export class AvailabilityPage {
  private readonly auth = inject(AuthService);
  private readonly scheduling = inject(SchedulingService);
  private readonly fb = inject(FormBuilder);
  readonly availability = signal<Availability[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly editingId = signal<string | undefined>(undefined);
  readonly removingId = signal<string | null>(null);
  readonly timeZone = computed(() => this.auth.profile()?.fuso_horario ?? 'America/Sao_Paulo');
  readonly weekDays = [
    { value: 1, label: 'Segunda-feira' },
    { value: 2, label: 'Terça-feira' },
    { value: 3, label: 'Quarta-feira' },
    { value: 4, label: 'Quinta-feira' },
    { value: 5, label: 'Sexta-feira' },
    { value: 6, label: 'Sábado' },
    { value: 0, label: 'Domingo' },
  ];
  readonly form = this.fb.nonNullable.group(
    {
      dia_semana: [1, [Validators.required, Validators.min(0), Validators.max(6)]],
      hora_inicio: ['09:00', Validators.required],
      hora_fim: ['18:00', Validators.required],
    },
    { validators: orderedHours },
  );
  constructor() {
    void this.load();
  }
  ranges(day: number): Availability[] {
    return this.availability()
      .filter((range) => range.dia_semana === day)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.ready;
      const profile = this.auth.profile();
      if (profile) this.availability.set(await this.scheduling.listAvailability(profile.id));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
  newRange(day = this.form.controls.dia_semana.value): void {
    this.editingId.set(undefined);
    this.form.reset({ dia_semana: day, hora_inicio: '09:00', hora_fim: '18:00' });
    this.error.set('');
    this.success.set('');
  }
  edit(range: Availability): void {
    this.editingId.set(range.id);
    this.form.reset({
      dia_semana: range.dia_semana,
      hora_inicio: range.hora_inicio.slice(0, 5),
      hora_fim: range.hora_fim.slice(0, 5),
    });
    this.error.set('');
    this.success.set('');
  }
  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const profile = this.auth.profile();
    if (!profile) return;
    const value = this.form.getRawValue();
    if (
      this.availability().some(
        (range) =>
          range.id !== this.editingId() &&
          range.dia_semana === value.dia_semana &&
          range.hora_inicio.slice(0, 5) < value.hora_fim &&
          range.hora_fim.slice(0, 5) > value.hora_inicio,
      )
    ) {
      this.error.set(
        'Esta faixa se sobrepõe a um horário já cadastrado para o mesmo dia. Edite a faixa existente ou escolha outro intervalo.',
      );
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      await this.scheduling.saveAvailability(
        { profissional_id: profile.id, ...value },
        this.editingId(),
      );
      this.availability.set(await this.scheduling.listAvailability(profile.id));
      this.newRange();
      this.success.set('Horário de trabalho salvo. A disponibilidade foi atualizada.');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
  async remove(id: string): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      await this.scheduling.deleteAvailability(id);
      this.availability.update((items) => items.filter((item) => item.id !== id));
      if (this.editingId() === id) this.newRange();
      this.removingId.set(null);
      this.success.set('Faixa removida. Os agendamentos existentes foram preservados.');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}

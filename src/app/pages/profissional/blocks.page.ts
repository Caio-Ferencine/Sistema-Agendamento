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
import { Block } from '../../models/entities';
import { formatDateTime, localDateTimeToIso, todayInZone } from '../../shared/utils/date-time';

function orderedDates(control: AbstractControl): ValidationErrors | null {
  const start = control.get('inicio')?.value as string;
  const end = control.get('fim')?.value as string;
  const allDay = control.get('diaInteiro')?.value as boolean;
  return start && end && (allDay ? start > end : start >= end) ? { datesOrder: true } : null;
}

@Component({
  selector: 'app-professional-blocks',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">Tempo para você</p>
        <h1>Bloqueios</h1>
        <p class="muted">Reserve períodos para compromissos, folgas ou férias.</p>
      </div>
    </header>
    @if (error()) {
      <div class="alert alert-error" role="alert">{{ error() }}</div>
    }
    @if (success()) {
      <div class="alert alert-success" role="status">{{ success() }}</div>
    }
    <div class="blocks-layout">
      <section class="stack">
        <div class="toolbar">
          <button
            class="btn"
            [class.btn-primary]="!showHistory()"
            [class.btn-secondary]="showHistory()"
            (click)="showHistory.set(false)"
          >
            Atuais e futuros</button
          ><button
            class="btn"
            [class.btn-primary]="showHistory()"
            [class.btn-secondary]="!showHistory()"
            (click)="showHistory.set(true)"
          >
            Anteriores
          </button>
        </div>
        @if (loading()) {
          <p class="muted" role="status">Carregando seus bloqueios…</p>
        } @else {
          @for (block of visibleBlocks(); track block.id) {
            <article class="card block-card">
              <div class="block-head">
                <span class="block-symbol" aria-hidden="true">⊘</span>
                <div>
                  <h2>{{ block.motivo || 'Indisponível' }}</h2>
                  <p class="muted">
                    {{ dateLabel(block.inicio) }}<br /><span aria-hidden="true">↳ </span>até
                    {{ dateLabel(block.fim) }}
                  </p>
                </div>
              </div>
              <div class="toolbar">
                <button class="btn btn-secondary" (click)="edit(block)" [disabled]="saving()">
                  Editar período</button
                ><button
                  class="btn btn-secondary"
                  (click)="removingId.set(block.id)"
                  [disabled]="saving()"
                >
                  Remover bloqueio
                </button>
              </div>
              @if (removingId() === block.id) {
                <div class="remove-confirm">
                  <p>
                    Remover este bloqueio? Os horários poderão receber novos agendamentos, conforme
                    sua disponibilidade.
                  </p>
                  <div class="toolbar">
                    <button class="btn btn-danger" (click)="remove(block.id)" [disabled]="saving()">
                      {{ saving() ? 'Removendo…' : 'Confirmar remoção' }}</button
                    ><button
                      class="btn btn-secondary"
                      (click)="removingId.set(null)"
                      [disabled]="saving()"
                    >
                      Manter bloqueio
                    </button>
                  </div>
                </div>
              }
            </article>
          } @empty {
            <section class="card empty-state">
              <h2>
                {{ showHistory() ? 'Nenhum bloqueio anterior' : 'Nenhum bloqueio neste período' }}
              </h2>
              <p>
                Seus horários seguem a rotina semanal. Adicione um bloqueio quando precisar se
                ausentar.
              </p>
            </section>
          }
        }
      </section>
      <aside class="card stack">
        <div>
          <p class="eyebrow">Uma pausa na agenda</p>
          <h2>{{ editingId() ? 'Editar bloqueio' : 'Novo bloqueio' }}</h2>
          <p class="muted">Horários no fuso {{ timeZone() }}.</p>
        </div>
        <form [formGroup]="form" (ngSubmit)="save()" class="stack">
          <div class="field">
            <label for="block-reason">Motivo <span class="muted">(opcional)</span></label
            ><input
              id="block-reason"
              formControlName="motivo"
              maxlength="300"
              placeholder="Ex.: Férias, compromisso pessoal"
            /><small class="muted">Visível apenas para você.</small>
          </div>
          <label class="checkbox-label"
            ><input type="checkbox" formControlName="diaInteiro" (change)="changeMode()" /> Bloquear
            dia inteiro ou vários dias</label
          >
          <div class="field">
            <label for="block-start">{{
              form.controls.diaInteiro.value ? 'Primeiro dia' : 'Início do bloqueio'
            }}</label
            ><input
              id="block-start"
              [type]="form.controls.diaInteiro.value ? 'date' : 'datetime-local'"
              formControlName="inicio"
              required
            />
            @if (form.controls.inicio.invalid && form.controls.inicio.touched) {
              <small class="field-error">Informe uma data inicial válida.</small>
            }
          </div>
          <div class="field">
            <label for="block-end">{{
              form.controls.diaInteiro.value ? 'Último dia (inclusive)' : 'Fim do bloqueio'
            }}</label
            ><input
              id="block-end"
              [type]="form.controls.diaInteiro.value ? 'date' : 'datetime-local'"
              formControlName="fim"
              required
            />
            @if (form.controls.fim.invalid && form.controls.fim.touched) {
              <small class="field-error">Informe uma data final válida.</small>
            }
          </div>
          @if (form.hasError('datesOrder') && form.touched) {
            <p class="field-error" role="alert">
              {{
                form.controls.diaInteiro.value
                  ? 'O último dia não pode ser anterior ao primeiro.'
                  : 'O fim do bloqueio deve ser posterior ao início.'
              }}
            </p>
          }
          <div class="toolbar">
            <button class="btn btn-primary" type="submit" [disabled]="saving()">
              {{ saving() ? 'Salvando…' : 'Salvar bloqueio' }}
            </button>
            @if (editingId()) {
              <button
                class="btn btn-secondary"
                type="button"
                (click)="reset()"
                [disabled]="saving()"
              >
                Cancelar edição
              </button>
            }
          </div>
          <p class="muted note">
            Se houver um atendimento confirmado neste período, resolva o agendamento na sua agenda
            antes de criar o bloqueio.
          </p>
        </form>
      </aside>
    </div>
  `,
  styles: `
    .blocks-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(300px, 1fr);
      gap: 1.5rem;
      align-items: start;
    }
    .block-head {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
      margin-bottom: 1rem;
    }
    .block-symbol {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
      border-radius: 12px;
      background: #fff1e7;
      color: #99632d;
      font-size: 1.7rem;
    }
    .block-head h2 {
      font-size: 1.1rem;
      margin: 0 0 0.5rem;
      overflow-wrap: anywhere;
    }
    .block-head p {
      margin: 0;
      line-height: 1.8;
      font-size: 0.9rem;
    }
    .remove-confirm {
      margin-top: 1rem;
      padding: 1rem;
      background: #fff3ef;
      border-radius: 10px;
    }
    .remove-confirm p {
      margin: 0 0 0.75rem;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .checkbox-label {
      display: flex;
      gap: 0.6rem;
      align-items: center;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .checkbox-label input {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }
    .note {
      font-size: 0.85rem;
      line-height: 1.65;
    }
    .field-error {
      color: #aa3333;
      font-size: 0.85rem;
    }
    @media (max-width: 850px) {
      .blocks-layout {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class BlocksPage {
  private readonly auth = inject(AuthService);
  private readonly scheduling = inject(SchedulingService);
  private readonly fb = inject(FormBuilder);
  readonly blocks = signal<Block[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly showHistory = signal(false);
  readonly editingId = signal<string | undefined>(undefined);
  readonly removingId = signal<string | null>(null);
  readonly timeZone = computed(() => this.auth.profile()?.fuso_horario ?? 'America/Sao_Paulo');
  readonly visibleBlocks = computed(() =>
    this.blocks()
      .filter((block) =>
        this.showHistory()
          ? new Date(block.fim).getTime() <= Date.now()
          : new Date(block.fim).getTime() > Date.now(),
      )
      .sort((a, b) =>
        this.showHistory() ? b.inicio.localeCompare(a.inicio) : a.inicio.localeCompare(b.inicio),
      ),
  );
  readonly form = this.fb.nonNullable.group(
    {
      motivo: ['', Validators.maxLength(300)],
      diaInteiro: [false],
      inicio: ['', Validators.required],
      fim: ['', Validators.required],
    },
    { validators: orderedDates },
  );
  constructor() {
    this.reset();
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
      if (profile) {
        this.blocks.set(await this.scheduling.listBlocks(profile.id));
        this.reset();
      }
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
  reset(): void {
    const today = todayInZone(this.timeZone());
    this.form.reset({
      motivo: '',
      diaInteiro: false,
      inicio: today + 'T09:00',
      fim: today + 'T10:00',
    });
    this.editingId.set(undefined);
  }
  changeMode(): void {
    const value = this.form.getRawValue();
    const today = todayInZone(this.timeZone());
    this.form.patchValue({
      inicio: (value.inicio.slice(0, 10) || today) + (value.diaInteiro ? '' : 'T09:00'),
      fim: (value.fim.slice(0, 10) || today) + (value.diaInteiro ? '' : 'T18:00'),
    });
  }
  edit(block: Block): void {
    this.editingId.set(block.id);
    this.form.reset({
      motivo: block.motivo ?? '',
      diaInteiro: false,
      inicio: this.localInput(block.inicio),
      fim: this.localInput(block.fim),
    });
    this.error.set('');
    this.success.set('');
  }
  private localInput(value: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(value));
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
  }
  private followingDate(value: string): string {
    const date = new Date(value + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const profile = this.auth.profile();
    if (!profile) return;
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      const value = this.form.getRawValue();
      const inicio = localDateTimeToIso(
        value.diaInteiro ? value.inicio + 'T00:00' : value.inicio,
        this.timeZone(),
      );
      const fim = localDateTimeToIso(
        value.diaInteiro ? this.followingDate(value.fim) + 'T00:00' : value.fim,
        this.timeZone(),
      );
      if (new Date(fim).getTime() <= Date.now()) {
        this.error.set('Escolha um período que ainda não tenha terminado.');
        return;
      }
      await this.scheduling.saveBlock(
        { profissional_id: profile.id, inicio, fim, motivo: value.motivo.trim() || 'Indisponível' },
        this.editingId(),
      );
      this.blocks.set(await this.scheduling.listBlocks(profile.id));
      this.reset();
      this.success.set('Bloqueio salvo. O período não será oferecido para novos agendamentos.');
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
      await this.scheduling.deleteBlock(id);
      this.blocks.update((items) => items.filter((item) => item.id !== id));
      if (this.editingId() === id) this.reset();
      this.removingId.set(null);
      this.success.set('Bloqueio removido. Os horários livres foram atualizados.');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}

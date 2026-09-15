import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SchedulingService } from '../../core/services/scheduling.service';
import { errorMessage } from '../../core/services/error-message';
import { AppointmentRecord, Professional, Service, TimeSlot } from '../../models/entities';
import { formatDateTime, formatTime, todayInZone } from '../../shared/utils/date-time';

registerLocaleData(localePt);

@Component({
  selector: 'app-booking',
  imports: [FormsModule, CurrencyPipe, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <p class="eyebrow">UM MOMENTO PARA VOCÊ</p>
        <h1>Novo agendamento</h1>
        <p class="muted">Encontre o serviço e o horário que combinam com sua rotina.</p>
      </div>
      <a class="text-link" routerLink="/cliente">← Voltar ao início</a>
    </div>
    @if (receipt()) {
      <section class="card booking-success" role="status">
        <div class="success-icon">✓</div>
        <p class="eyebrow">ESTÁ TUDO CERTO</p>
        <h2>Seu horário está reservado!</h2>
        <p class="muted">O agendamento já aparece na sua agenda.</p>
        <div class="booking-summary">
          <h3>{{ selectedService()?.nome }}</h3>
          <p>Com {{ selectedProfessional()?.nome }}</p>
          <strong>{{ formatDateTime(receipt()!.inicio, zone()) }}</strong
          ><small>Fuso: {{ zone() }}</small>
        </div>
        <div class="toolbar">
          <a class="btn btn-primary" routerLink="/cliente/agendamentos">Ver meus agendamentos</a
          ><button class="btn btn-secondary" (click)="restart()">Fazer outro agendamento</button>
        </div>
      </section>
    } @else {
      <ol class="booking-steps" aria-label="Etapas do agendamento">
        @for (label of steps; track label; let i = $index) {
          <li
            [class.current]="step() === i + 1"
            [class.done]="step() > i + 1"
            [attr.aria-current]="step() === i + 1 ? 'step' : null"
          >
            <span>{{ step() > i + 1 ? '✓' : i + 1 }}</span
            >{{ label }}
          </li>
        }
      </ol>
      @if (error()) {
        <div class="alert alert-error" role="alert">{{ error() }}</div>
      }
      @if (loadingCatalog()) {
        <div class="card empty-state" role="status">Buscando profissionais e serviços…</div>
      } @else if (!professionals().length || !services().length) {
        <div class="card empty-state">
          <h2>
            {{ error() ? 'Não foi possível carregar os serviços' : 'Novos horários em breve' }}
          </h2>
          <p>
            {{
              error()
                ? 'Tente novamente para consultar os profissionais.'
                : 'Assim que os profissionais disponibilizarem seus serviços, eles aparecerão aqui.'
            }}
          </p>
          <button class="btn btn-secondary" (click)="loadCatalog()">Atualizar serviços</button>
        </div>
      } @else {
        <div class="booking-layout">
          <section class="card booking-content">
            @if (step() === 1) {
              <div class="section-heading">
                <div>
                  <h2>Escolha seu serviço</h2>
                  <p class="muted">Primeiro, com quem você quer agendar?</p>
                </div>
                <span class="step-caption">ETAPA 01</span>
              </div>
              <label class="field"
                >Profissional<select
                  [ngModel]="professionalId()"
                  (ngModelChange)="chooseProfessional($event)"
                >
                  <option value="">Selecione um profissional</option>
                  @for (professional of professionals(); track professional.id) {
                    <option [value]="professional.id">{{ professional.nome }}</option>
                  }
                </select></label
              >
              @if (professionalId()) {
                <div class="service-options">
                  @for (service of filteredServices(); track service.id) {
                    <button
                      type="button"
                      class="service-option"
                      [class.selected]="serviceId() === service.id"
                      [attr.aria-pressed]="serviceId() === service.id"
                      (click)="chooseService(service.id)"
                    >
                      <span class="service-option-icon" aria-hidden="true">◇</span
                      ><span
                        ><strong>{{ service.nome }}</strong
                        ><small>{{
                          service.descricao || 'Atendimento com horário reservado.'
                        }}</small
                        ><span class="service-meta"
                          >◷ {{ service.duracao_minutos }} min <span>•</span>
                          {{
                            service.preco === null
                              ? 'Valor a combinar'
                              : (service.preco | currency: 'BRL')
                          }}</span
                        ></span
                      ><span class="selection-dot" aria-hidden="true"></span>
                    </button>
                  } @empty {
                    <p class="muted">Este profissional ainda não tem serviços ativos.</p>
                  }
                </div>
              }
              <div class="step-actions">
                <span class="muted">Escolha um serviço para continuar.</span
                ><button
                  class="btn btn-primary"
                  [disabled]="!selectedService()"
                  (click)="step.set(2)"
                >
                  Escolher data →
                </button>
              </div>
            }
            @if (step() === 2) {
              <div class="section-heading">
                <div>
                  <h2>Qual é o melhor dia?</h2>
                  <p class="muted">Os horários consideram a duração completa do serviço.</p>
                </div>
                <span class="step-caption">ETAPA 02</span>
              </div>
              <label class="field date-field"
                >Data do atendimento<input
                  type="date"
                  [min]="minDate()"
                  [max]="maxDate()"
                  [ngModel]="date()"
                  (ngModelChange)="changeDate($event)"
                  required
              /></label>
              <div class="info-panel">
                <strong>Horário local do profissional</strong>
                <p>Fuso: {{ zone() }}. A disponibilidade é consultada em tempo real.</p>
              </div>
              <div class="step-actions">
                <button class="btn btn-secondary" (click)="step.set(1)">← Voltar</button
                ><button
                  class="btn btn-primary"
                  [disabled]="!validDate() || loadingSlots()"
                  (click)="findSlots()"
                >
                  {{ loadingSlots() ? 'Consultando…' : 'Ver horários disponíveis →' }}
                </button>
              </div>
            }
            @if (step() === 3) {
              <div class="section-heading">
                <div>
                  <h2>Escolha seu horário</h2>
                  <p class="muted">
                    {{ selectedService()?.duracao_minutos }} minutos reservados para você.
                  </p>
                </div>
                <button class="text-button" [disabled]="loadingSlots()" (click)="findSlots()">
                  Atualizar
                </button>
              </div>
              @if (loadingSlots()) {
                <p role="status">Atualizando horários…</p>
              } @else {
                <div class="time-slots">
                  @for (slot of slots(); track slot.inicio) {
                    <button
                      class="time-slot"
                      [class.selected]="selectedSlot()?.inicio === slot.inicio"
                      [attr.aria-pressed]="selectedSlot()?.inicio === slot.inicio"
                      (click)="selectedSlot.set(slot)"
                    >
                      {{ formatTime(slot.inicio, zone()) }}
                    </button>
                  } @empty {
                    <div class="empty-state">
                      <span class="empty-icon" aria-hidden="true">◷</span>
                      <h3>Nenhum horário livre neste dia</h3>
                      <p>Experimente outra data para encontrar um horário.</p>
                    </div>
                  }
                </div>
              }
              <p class="muted small">Um horário fica reservado somente após a confirmação.</p>
              <div class="step-actions">
                <button class="btn btn-secondary" (click)="step.set(2)">← Alterar data</button
                ><button
                  class="btn btn-primary"
                  [disabled]="!selectedSlot() || loadingSlots()"
                  (click)="step.set(4)"
                >
                  Revisar agendamento →
                </button>
              </div>
            }
            @if (step() === 4) {
              <div class="section-heading">
                <div>
                  <h2>Podemos confirmar?</h2>
                  <p class="muted">Confira os detalhes do seu agendamento.</p>
                </div>
                <span class="step-caption">ETAPA 04</span>
              </div>
              <dl class="review-list">
                <div>
                  <dt>Serviço</dt>
                  <dd>{{ selectedService()?.nome }}</dd>
                </div>
                <div>
                  <dt>Profissional</dt>
                  <dd>{{ selectedProfessional()?.nome }}</dd>
                </div>
                <div>
                  <dt>Data e hora</dt>
                  <dd>{{ formatDateTime(selectedSlot()!.inicio, zone()) }}</dd>
                </div>
                <div>
                  <dt>Duração</dt>
                  <dd>{{ selectedService()?.duracao_minutos }} minutos</dd>
                </div>
                <div>
                  <dt>Valor</dt>
                  <dd>
                    {{
                      selectedService()?.preco === null
                        ? 'A combinar com o profissional'
                        : (selectedService()?.preco | currency: 'BRL')
                    }}
                  </dd>
                </div>
              </dl>
              <p class="info-panel">
                Se precisar mudar seus planos, cancele em Meus agendamentos. O pagamento, quando
                aplicável, é combinado diretamente com o profissional.
              </p>
              <div class="step-actions">
                <button class="btn btn-secondary" [disabled]="saving()" (click)="step.set(3)">
                  ← Voltar</button
                ><button class="btn btn-primary" [disabled]="saving()" (click)="confirm()">
                  {{ saving() ? 'Confirmando…' : '✓ Confirmar agendamento' }}
                </button>
              </div>
            }
          </section>
          <aside class="card reservation-preview">
            <p class="eyebrow">SEU AGENDAMENTO</p>
            <div class="preview-icon" aria-hidden="true">◇</div>
            <h3>{{ selectedService()?.nome || 'Seu próximo momento' }}</h3>
            <p class="muted">
              {{ selectedProfessional()?.nome || 'Escolha um profissional para começar' }}
            </p>
            @if (selectedService(); as service) {
              <div class="preview-detail">
                <span>Duração</span><strong>{{ service.duracao_minutos }} min</strong>
              </div>
              <div class="preview-detail">
                <span>Valor</span
                ><strong>{{
                  service.preco === null ? 'A combinar' : (service.preco | currency: 'BRL')
                }}</strong>
              </div>
            }
            @if (selectedSlot(); as slot) {
              <div class="preview-date">◷ {{ formatDateTime(slot.inicio, zone()) }}</div>
            }
            <div class="preview-footer">✓ &nbsp; Disponibilidade verificada na confirmação</div>
          </aside>
        </div>
      }
    }
  `,
})
export class BookingPage {
  private readonly api = inject(SchedulingService);
  readonly steps = ['Serviço', 'Data', 'Horário', 'Confirmação'];
  readonly professionals = signal<Professional[]>([]);
  readonly services = signal<Service[]>([]);
  readonly professionalId = signal('');
  readonly serviceId = signal('');
  readonly date = signal('');
  readonly selectedSlot = signal<TimeSlot | null>(null);
  readonly slots = signal<TimeSlot[]>([]);
  readonly step = signal(1);
  readonly loadingCatalog = signal(true);
  readonly loadingSlots = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly receipt = signal<AppointmentRecord | null>(null);
  private requestVersion = 0;
  readonly selectedProfessional = computed(() =>
    this.professionals().find((item) => item.id === this.professionalId()),
  );
  readonly selectedService = computed(() =>
    this.services().find((item) => item.id === this.serviceId()),
  );
  readonly filteredServices = computed(() =>
    this.services().filter((item) => item.profissional_id === this.professionalId()),
  );
  readonly zone = computed(() => this.selectedProfessional()?.fuso_horario || 'America/Sao_Paulo');
  readonly minDate = computed(() => todayInZone(this.zone()));
  readonly maxDate = computed(() => {
    const day = new Date(this.minDate() + 'T12:00:00Z');
    day.setUTCDate(day.getUTCDate() + 365);
    return day.toISOString().slice(0, 10);
  });
  readonly validDate = computed(
    () =>
      /^\d{4}-\d{2}-\d{2}$/.test(this.date()) &&
      this.date() >= this.minDate() &&
      this.date() <= this.maxDate(),
  );
  readonly formatDateTime = formatDateTime;
  readonly formatTime = formatTime;
  constructor() {
    void this.loadCatalog();
  }
  async loadCatalog(): Promise<void> {
    this.loadingCatalog.set(true);
    this.error.set('');
    try {
      const [professionals, services] = await Promise.all([
        this.api.listProfessionals(),
        this.api.listServices(),
      ]);
      this.professionals.set(professionals);
      this.services.set(services);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loadingCatalog.set(false);
    }
  }
  chooseProfessional(id: string): void {
    this.professionalId.set(id);
    this.serviceId.set('');
    this.resetSlots();
    this.date.set('');
  }
  chooseService(id: string): void {
    this.serviceId.set(id);
    this.resetSlots();
  }
  changeDate(value: string): void {
    this.date.set(value);
    this.resetSlots();
  }
  private resetSlots(): void {
    this.requestVersion++;
    this.selectedSlot.set(null);
    this.slots.set([]);
    this.error.set('');
  }
  async findSlots(): Promise<void> {
    if (!this.validDate() || !this.selectedService()) return;
    const request = ++this.requestVersion;
    this.selectedSlot.set(null);
    this.error.set('');
    this.loadingSlots.set(true);
    try {
      const slots = await this.api.availableSlots(
        this.professionalId(),
        this.serviceId(),
        this.date(),
      );
      if (request === this.requestVersion) {
        this.slots.set(slots);
        this.step.set(3);
      }
    } catch (error) {
      if (request === this.requestVersion) this.error.set(errorMessage(error));
    } finally {
      this.loadingSlots.set(false);
    }
  }
  async confirm(): Promise<void> {
    const slot = this.selectedSlot();
    if (!slot || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      this.receipt.set(
        await this.api.createAppointment(
          this.serviceId(),
          slot.inicio,
          this.selectedService()!.updated_at,
        ),
      );
    } catch (error) {
      const message = errorMessage(error);
      await this.loadCatalog();
      if (this.selectedService()) {
        await this.findSlots();
        this.step.set(3);
      } else {
        this.resetSlots();
        this.step.set(1);
      }
      this.error.set(message);
    } finally {
      this.saving.set(false);
    }
  }
  restart(): void {
    this.receipt.set(null);
    this.step.set(1);
    this.chooseProfessional('');
    void this.loadCatalog();
  }
}

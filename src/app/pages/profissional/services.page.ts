import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { SchedulingService } from '../../core/services/scheduling.service';
import { errorMessage } from '../../core/services/error-message';
import { Service } from '../../models/entities';

@Component({
  selector: 'app-professional-services',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">Seu catálogo</p>
        <h1>Serviços</h1>
        <p class="muted">Defina o que você oferece e o tempo necessário para cada atendimento.</p>
      </div>
      <button class="btn btn-primary" (click)="openNew()" [disabled]="saving()">
        + Novo serviço
      </button>
    </header>
    @if (error()) {
      <div class="alert alert-error" role="alert">{{ error() }}</div>
    }
    @if (success()) {
      <div class="alert alert-success" role="status">{{ success() }}</div>
    }
    @if (editing()) {
      <section class="card service-editor">
        <h2>{{ editingId() ? 'Editar serviço' : 'Novo serviço' }}</h2>
        <form [formGroup]="form" (ngSubmit)="save()" class="stack">
          <div class="field">
            <label for="service-name">Nome do serviço</label
            ><input
              id="service-name"
              formControlName="nome"
              maxlength="120"
              placeholder="Ex.: Consulta inicial"
              autocomplete="off"
            />
            @if (invalid('nome')) {
              <small class="field-error">Informe um nome entre 2 e 120 caracteres.</small>
            }
          </div>
          <div class="field">
            <label for="service-description">Descrição <span class="muted">(opcional)</span></label
            ><textarea
              id="service-description"
              formControlName="descricao"
              rows="3"
              maxlength="1000"
              placeholder="O que está incluído neste atendimento?"
            ></textarea>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="service-duration">Duração em minutos</label
              ><input
                id="service-duration"
                type="number"
                formControlName="duracao_minutos"
                min="5"
                max="480"
                step="1"
              />
              @if (invalid('duracao_minutos')) {
                <small class="field-error">Use um número inteiro entre 5 e 480 minutos.</small>
              }
            </div>
            <div class="field">
              <label for="service-price">Preço em R$ <span class="muted">(opcional)</span></label
              ><input
                id="service-price"
                type="number"
                formControlName="preco"
                min="0"
                max="999999.99"
                step="0.01"
                placeholder="Sob consulta"
              />
              @if (invalid('preco')) {
                <small class="field-error">Informe um preço válido maior ou igual a zero.</small>
              }
            </div>
          </div>
          <label class="checkbox-label"
            ><input type="checkbox" formControlName="ativo" /> Disponível para novos
            agendamentos</label
          >
          <p class="muted hint">
            Alterações de preço e duração valem para novos agendamentos. O histórico é preservado.
          </p>
          <div class="toolbar">
            <button class="btn btn-primary" type="submit" [disabled]="saving()">
              {{ saving() ? 'Salvando…' : 'Salvar serviço' }}</button
            ><button
              class="btn btn-secondary"
              type="button"
              (click)="closeEditor()"
              [disabled]="saving()"
            >
              Cancelar edição
            </button>
          </div>
        </form>
      </section>
    }
    @if (loading()) {
      <p role="status" class="muted">Carregando seus serviços…</p>
    } @else {
      <div class="services-grid">
        @for (service of services(); track service.id) {
          <article class="card service-card" [class.inactive]="!service.ativo">
            <div class="service-top">
              <span class="service-icon" aria-hidden="true">✦</span
              ><span class="badge" [class.inactive-badge]="!service.ativo">{{
                service.ativo ? 'Ativo' : 'Inativo'
              }}</span>
            </div>
            <h2>{{ service.nome }}</h2>
            <p class="muted description">
              {{ service.descricao || 'Atendimento com horário reservado.' }}
            </p>
            <div class="service-meta">
              <span>{{ service.duracao_minutos }} min</span
              ><strong>{{ priceLabel(service.preco) }}</strong>
            </div>
            <div class="service-actions">
              <button class="btn btn-secondary" (click)="edit(service)" [disabled]="saving()">
                Editar</button
              ><button class="btn btn-secondary" (click)="toggle(service)" [disabled]="saving()">
                {{ service.ativo ? 'Desativar' : 'Ativar' }}
              </button>
            </div>
          </article>
        } @empty {
          <section class="card empty-state">
            <h2>Seu primeiro serviço começa aqui</h2>
            <p>Adicione um nome e uma duração para que clientes possam reservar um horário.</p>
            <button class="btn btn-primary" (click)="openNew()">Cadastrar serviço</button>
          </section>
        }
      </div>
    }
  `,
  styles: `
    .service-editor {
      margin-bottom: 1.5rem;
      max-width: 800px;
    }
    .services-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      gap: 1.25rem;
    }
    .service-card {
      display: flex;
      flex-direction: column;
    }
    .service-top,
    .service-meta,
    .service-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
    }
    .service-icon {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: #edf3e9;
      color: #48754e;
      font-size: 1.4rem;
    }
    .service-card h2 {
      margin: 1.1rem 0 0.4rem;
      font-size: 1.15rem;
      word-break: break-word;
    }
    .description {
      flex: 1;
      white-space: pre-line;
      word-break: break-word;
    }
    .service-meta {
      border-top: 1px solid var(--border, #e5ebe7);
      padding: 1.1rem 0;
    }
    .service-meta span {
      font-size: 0.9rem;
      color: var(--muted, #68756b);
    }
    .service-actions {
      justify-content: flex-start;
    }
    .inactive {
      background: #f7f8f6;
    }
    .inactive-badge {
      background: #e7e9e5;
      color: #647064;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.7rem;
    }
    .checkbox-label input {
      width: 18px;
      height: 18px;
    }
    .hint {
      font-size: 0.85rem;
      margin: 0;
    }
    .field-error {
      color: #aa3333;
    }
    .services-grid > .empty-state {
      grid-column: 1/-1;
    }
  `,
})
export class ServicesPage {
  private readonly auth = inject(AuthService);
  private readonly scheduling = inject(SchedulingService);
  private readonly fb = inject(FormBuilder);
  readonly services = signal<Service[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly editing = signal(false);
  readonly editingId = signal<string | undefined>(undefined);
  readonly form = this.fb.group({
    nome: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(120),
      Validators.pattern(/.*\S.*/),
    ]),
    descricao: this.fb.nonNullable.control('', Validators.maxLength(1000)),
    duracao_minutos: this.fb.nonNullable.control(30, [
      Validators.required,
      Validators.min(5),
      Validators.max(480),
      Validators.pattern(/^\d+$/),
    ]),
    preco: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(999999.99),
      Validators.pattern(/^\d+(\.\d{1,2})?$/),
    ]),
    ativo: this.fb.nonNullable.control(true),
  });
  constructor() {
    void this.load();
  }
  priceLabel(value: number | null): string {
    return value === null
      ? 'Sob consulta'
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }
  invalid(name: 'nome' | 'duracao_minutos' | 'preco'): boolean {
    const field = this.form.controls[name];
    return field.invalid && field.touched;
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.ready;
      const profile = this.auth.profile();
      if (profile) this.services.set(await this.scheduling.listServices(profile.id, true));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
  openNew(): void {
    this.form.reset({ nome: '', descricao: '', duracao_minutos: 30, preco: null, ativo: true });
    this.editingId.set(undefined);
    this.editing.set(true);
    this.error.set('');
    this.success.set('');
  }
  edit(service: Service): void {
    this.form.reset({
      nome: service.nome,
      descricao: service.descricao ?? '',
      duracao_minutos: service.duracao_minutos,
      preco: service.preco,
      ativo: service.ativo,
    });
    this.editingId.set(service.id);
    this.editing.set(true);
    this.error.set('');
    this.success.set('');
  }
  closeEditor(): void {
    this.editing.set(false);
    this.editingId.set(undefined);
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
      await this.scheduling.saveService(
        {
          profissional_id: profile.id,
          nome: value.nome.trim(),
          descricao: value.descricao.trim() || null,
          duracao_minutos: value.duracao_minutos,
          preco: value.preco,
          ativo: value.ativo,
        },
        this.editingId(),
      );
      this.closeEditor();
      this.services.set(await this.scheduling.listServices(profile.id, true));
      this.success.set('Serviço salvo com sucesso.');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
  async toggle(service: Service): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      await this.scheduling.toggleService(service.id, !service.ativo);
      this.services.update((items) =>
        items.map((item) => (item.id === service.id ? { ...item, ativo: !item.ativo } : item)),
      );
      this.success.set(
        service.ativo
          ? 'Serviço desativado. Agendamentos existentes foram preservados.'
          : 'Serviço ativado para novos agendamentos.',
      );
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}

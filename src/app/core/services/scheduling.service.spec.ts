import { TestBed } from '@angular/core/testing';
import { AvailabilityInput, BlockInput, ServiceInput } from '../../models/entities';
import { SchedulingService } from './scheduling.service';
import { Supabase } from './supabase';

describe('SchedulingService respects column-level database permissions', () => {
  let service: SchedulingService;
  let update: ReturnType<typeof vi.fn>;
  let insert: ReturnType<typeof vi.fn>;
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    insert = vi.fn().mockResolvedValue({ error: null });
    rpc = vi.fn().mockResolvedValue({
      data: { id: 'appointment', inicio: '2026-10-20T12:00:00Z' },
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Supabase,
          useValue: {
            client: { from: vi.fn().mockReturnValue({ update, insert }), rpc },
          },
        },
      ],
    });
    service = TestBed.inject(SchedulingService);
  });

  it('omits immutable ownership when editing a service', async () => {
    const input: ServiceInput = {
      profissional_id: 'professional',
      nome: 'Consulta',
      descricao: null,
      duracao_minutos: 60,
      preco: 100,
      ativo: true,
    };
    await service.saveService(input, 'service');
    expect(update).toHaveBeenCalledWith({
      nome: 'Consulta',
      descricao: null,
      duracao_minutos: 60,
      preco: 100,
      ativo: true,
    });
    expect(input.profissional_id).toBe('professional');
  });

  it('omits immutable ownership when editing an availability window', async () => {
    const input: AvailabilityInput = {
      profissional_id: 'professional',
      dia_semana: 1,
      hora_inicio: '08:00',
      hora_fim: '12:00',
    };
    await service.saveAvailability(input, 'window');
    expect(update).toHaveBeenCalledWith({ dia_semana: 1, hora_inicio: '08:00', hora_fim: '12:00' });
  });

  it('omits immutable ownership when editing a block', async () => {
    const input: BlockInput = {
      profissional_id: 'professional',
      inicio: '2026-10-20T12:00:00Z',
      fim: '2026-10-20T13:00:00Z',
      motivo: 'Compromisso',
    };
    await service.saveBlock(input, 'block');
    expect(update).toHaveBeenCalledWith({
      inicio: input.inicio,
      fim: input.fim,
      motivo: input.motivo,
    });
  });

  it('includes ownership for insert, where the database requires it', async () => {
    const input: AvailabilityInput = {
      profissional_id: 'professional',
      dia_semana: 1,
      hora_inicio: '08:00',
      hora_fim: '12:00',
    };
    await service.saveAvailability(input);
    expect(insert).toHaveBeenCalledWith(input);
    expect(update).not.toHaveBeenCalled();
  });

  it('sends only service and instant for booking; the server owns user, duration and status', async () => {
    await service.createAppointment('service', '2026-10-20T12:00:00Z', '2026-10-19T12:00:00Z');
    expect(rpc).toHaveBeenCalledWith('criar_agendamento', {
      p_servico_id: 'service',
      p_inicio: '2026-10-20T12:00:00Z',
      p_servico_atualizado_em: '2026-10-19T12:00:00Z',
    });
  });
});

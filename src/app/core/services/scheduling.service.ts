import { inject, Injectable } from '@angular/core';
import { Supabase } from './supabase';
import {
  Appointment,
  AppointmentRecord,
  Availability,
  AvailabilityInput,
  Block,
  BlockInput,
  Professional,
  Service,
  ServiceInput,
  TimeSlot,
} from '../../models/entities';

/** Data access only. PostgreSQL is the authority for authorization and scheduling. */
@Injectable({ providedIn: 'root' })
export class SchedulingService {
  private readonly db = inject(Supabase).client;

  async listProfessionals(): Promise<Professional[]> {
    const { data, error } = await this.db.rpc('listar_profissionais');
    if (error) throw error;
    return data ?? [];
  }
  async listServices(professionalId?: string, includeInactive = false): Promise<Service[]> {
    let query = this.db.from('servicos').select('*').order('nome');
    if (professionalId) query = query.eq('profissional_id', professionalId);
    if (!includeInactive) query = query.eq('ativo', true);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }
  async saveService(input: ServiceInput, id?: string): Promise<void> {
    const { profissional_id: _owner, ...changes } = input;
    const { error } = await (id
      ? this.db.from('servicos').update(changes).eq('id', id)
      : this.db.from('servicos').insert(input));
    if (error) throw error;
  }
  async toggleService(id: string, ativo: boolean): Promise<void> {
    const { error } = await this.db.from('servicos').update({ ativo }).eq('id', id);
    if (error) throw error;
  }
  async listAvailability(professionalId: string): Promise<Availability[]> {
    const { data, error } = await this.db
      .from('disponibilidade')
      .select('*')
      .eq('profissional_id', professionalId)
      .order('dia_semana')
      .order('hora_inicio');
    if (error) throw error;
    return data ?? [];
  }
  async saveAvailability(input: AvailabilityInput, id?: string): Promise<void> {
    const { profissional_id: _owner, ...changes } = input;
    const { error } = await (id
      ? this.db.from('disponibilidade').update(changes).eq('id', id)
      : this.db.from('disponibilidade').insert(input));
    if (error) throw error;
  }
  async deleteAvailability(id: string): Promise<void> {
    const { error } = await this.db.from('disponibilidade').delete().eq('id', id);
    if (error) throw error;
  }
  async listBlocks(professionalId: string): Promise<Block[]> {
    const { data, error } = await this.db
      .from('bloqueios')
      .select('*')
      .eq('profissional_id', professionalId)
      .order('inicio');
    if (error) throw error;
    return data ?? [];
  }
  async saveBlock(input: BlockInput, id?: string): Promise<void> {
    const { profissional_id: _owner, ...changes } = input;
    const { error } = await (id
      ? this.db.from('bloqueios').update(changes).eq('id', id)
      : this.db.from('bloqueios').insert(input));
    if (error) throw error;
  }
  async deleteBlock(id: string): Promise<void> {
    const { error } = await this.db.from('bloqueios').delete().eq('id', id);
    if (error) throw error;
  }
  async availableSlots(
    professionalId: string,
    serviceId: string,
    date: string,
  ): Promise<TimeSlot[]> {
    const { data, error } = await this.db.rpc('horarios_disponiveis', {
      p_profissional_id: professionalId,
      p_servico_id: serviceId,
      p_data: date,
    });
    if (error) throw error;
    return data ?? [];
  }
  async listAppointments(from?: string, to?: string): Promise<Appointment[]> {
    const { data, error } = await this.db.rpc('listar_agendamentos', {
      p_inicio: from ?? null,
      p_fim: to ?? null,
    });
    if (error) throw error;
    return data ?? [];
  }
  async createAppointment(
    serviceId: string,
    start: string,
    serviceUpdatedAt: string,
  ): Promise<AppointmentRecord> {
    const { data, error } = await this.db.rpc('criar_agendamento', {
      p_servico_id: serviceId,
      p_inicio: start,
      p_servico_atualizado_em: serviceUpdatedAt,
    });
    if (error) throw error;
    return data;
  }
  async cancelAppointment(id: string, reason?: string): Promise<AppointmentRecord> {
    const { data, error } = await this.db.rpc('cancelar_agendamento', {
      p_agendamento_id: id,
      p_motivo: reason?.trim() || null,
    });
    if (error) throw error;
    return data;
  }
  async completeAppointment(id: string): Promise<AppointmentRecord> {
    const { data, error } = await this.db.rpc('concluir_agendamento', { p_agendamento_id: id });
    if (error) throw error;
    return data;
  }
}

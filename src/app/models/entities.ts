export type UserRole = 'cliente' | 'profissional';
export type AppointmentStatus =
  'agendado' | 'cancelado_cliente' | 'cancelado_profissional' | 'concluido';
export interface AuditFields {
  created_at: string;
  updated_at: string;
}
export interface Profile extends AuditFields {
  id: string;
  nome: string;
  telefone: string | null;
  tipo: UserRole;
  fuso_horario: string;
}
export interface Professional {
  id: string;
  nome: string;
  fuso_horario: string;
}
export interface Service extends AuditFields {
  id: string;
  profissional_id: string;
  nome: string;
  descricao: string | null;
  duracao_minutos: number;
  preco: number | null;
  ativo: boolean;
}
export type ServiceInput = Omit<Service, 'id' | keyof AuditFields>;
export interface Availability extends AuditFields {
  id: string;
  profissional_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
}
export type AvailabilityInput = Omit<Availability, 'id' | keyof AuditFields>;
export interface Block extends AuditFields {
  id: string;
  profissional_id: string;
  inicio: string;
  fim: string;
  motivo: string;
}
export type BlockInput = Omit<Block, 'id' | keyof AuditFields>;
export interface TimeSlot {
  inicio: string;
  fim: string;
}
/** Stored appointment returned by create/cancel/complete RPCs. */
export interface AppointmentRecord extends AuditFields, TimeSlot {
  id: string;
  cliente_id: string;
  profissional_id: string;
  servico_id: string;
  preco_agendado: number | null;
  status: AppointmentStatus;
  motivo_cancelamento: string | null;
  cancelado_em: string | null;
  cancelado_por: string | null;
}
/** Participant-only projection returned by listar_agendamentos. */
export interface Appointment extends AppointmentRecord {
  servico_nome: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  profissional_nome: string;
  fuso_horario: string;
}
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  agendado: 'Agendado',
  cancelado_cliente: 'Cancelado pelo cliente',
  cancelado_profissional: 'Cancelado pelo profissional',
  concluido: 'Concluído',
};

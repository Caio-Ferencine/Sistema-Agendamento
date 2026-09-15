-- MVP Agenda. Execute as the project's database owner, in filename order.
begin;

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create schema if not exists app_private;
revoke all on schema app_private from public, anon;

create type public.tipo_usuario as enum ('cliente', 'profissional');
create type public.status_agendamento as enum
  ('agendado', 'cancelado_cliente', 'cancelado_profissional', 'concluido');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  telefone text check (telefone is null or (char_length(telefone) between 8 and 25 and telefone ~ '^[0-9+() .-]+$')),
  tipo public.tipo_usuario not null default 'cliente',
  fuso_horario text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.profiles(id) on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  descricao text check (descricao is null or char_length(descricao) <= 1500),
  duracao_minutos integer not null check (duracao_minutos between 5 and 480),
  preco numeric(10,2) check (preco is null or preco >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, profissional_id)
);

-- Multiple windows per weekday express breaks without manually creating slots.
create table public.disponibilidade (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.profiles(id) on delete restrict,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora_inicio time without time zone not null,
  hora_fim time without time zone not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hora_inicio < hora_fim),
  check (extract(second from hora_inicio) = 0 and extract(second from hora_fim) = 0),
  constraint disponibilidade_sem_sobreposicao exclude using gist (
    profissional_id extensions.gist_uuid_ops with =,
    dia_semana extensions.gist_int2_ops with =,
    (int4range(extract(epoch from hora_inicio)::integer, extract(epoch from hora_fim)::integer, '[)')) with &&
  )
);

create table public.bloqueios (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.profiles(id) on delete restrict,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text not null default '' check (char_length(motivo) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (inicio < fim),
  check (isfinite(inicio) and isfinite(fim))
);

create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.profiles(id) on delete restrict,
  profissional_id uuid not null references public.profiles(id) on delete restrict,
  servico_id uuid not null,
  -- Price at confirmation is historical data; later service edits cannot rewrite it.
  preco_agendado numeric(10,2) check (preco_agendado is null or preco_agendado >= 0),
  inicio timestamptz not null,
  fim timestamptz not null,
  status public.status_agendamento not null default 'agendado',
  motivo_cancelamento text check (motivo_cancelamento is null or char_length(motivo_cancelamento) <= 500),
  cancelado_em timestamptz,
  cancelado_por uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (servico_id, profissional_id) references public.servicos(id, profissional_id) on delete restrict,
  check (cliente_id <> profissional_id),
  check (inicio < fim and fim - inicio between interval '5 minutes' and interval '480 minutes'),
  check (isfinite(inicio) and isfinite(fim)),
  check (
    (status in ('cancelado_cliente', 'cancelado_profissional') and cancelado_em is not null and cancelado_por is not null)
    or (status in ('agendado', 'concluido') and cancelado_em is null and cancelado_por is null and motivo_cancelamento is null)
  ),
  -- [) allows an appointment to begin exactly when the preceding one finishes.
  -- Cancelled rows stay in history and immediately stop reserving the interval.
  constraint agendamentos_sem_conflito exclude using gist (
    profissional_id extensions.gist_uuid_ops with =,
    tstzrange(inicio, fim, '[)') with &&
  ) where (status = 'agendado')
);

create table public.agendamento_eventos (
  id bigint generated always as identity primary key,
  agendamento_id uuid not null references public.agendamentos(id) on delete restrict,
  status_anterior public.status_agendamento,
  status_novo public.status_agendamento not null,
  alterado_por uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index profiles_tipo_idx on public.profiles(tipo);
create index servicos_profissional_idx on public.servicos(profissional_id, ativo);
create index disponibilidade_profissional_dia_idx on public.disponibilidade(profissional_id, dia_semana);
create index bloqueios_periodo_idx on public.bloqueios using gist
  (profissional_id extensions.gist_uuid_ops, tstzrange(inicio, fim, '[)'));
create index agendamentos_cliente_inicio_idx on public.agendamentos(cliente_id, inicio desc);
create index agendamentos_profissional_inicio_idx on public.agendamentos(profissional_id, inicio);
create index agendamentos_servico_profissional_idx on public.agendamentos(servico_id, profissional_id);
create index agendamentos_cancelado_por_idx on public.agendamentos(cancelado_por) where cancelado_por is not null;
create index agendamento_eventos_agendamento_idx on public.agendamento_eventos(agendamento_id, created_at);
create index agendamento_eventos_autor_idx on public.agendamento_eventos(alterado_por);

-- Tables are closed from the moment they exist, before policies are installed.
alter table public.profiles enable row level security;
alter table public.servicos enable row level security;
alter table public.disponibilidade enable row level security;
alter table public.bloqueios enable row level security;
alter table public.agendamentos enable row level security;
alter table public.agendamento_eventos enable row level security;
revoke all on public.profiles, public.servicos, public.disponibilidade,
  public.bloqueios, public.agendamentos, public.agendamento_eventos from public, anon, authenticated;

commit;

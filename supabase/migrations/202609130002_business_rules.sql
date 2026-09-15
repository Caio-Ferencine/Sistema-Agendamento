begin;

create function app_private.updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := old.created_at;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create function app_private.validar_perfil() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.fuso_horario) then
    raise exception using errcode = 'PT422', message = 'INVALID_TIMEZONE';
  end if;
  return new;
end;
$$;

create function app_private.criar_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_nome text;
  v_telefone text;
begin
  v_nome := left(btrim(coalesce(new.raw_user_meta_data ->> 'nome', 'Cliente')), 120);
  if char_length(v_nome) < 2 then v_nome := 'Cliente'; end if;
  v_telefone := nullif(btrim(new.raw_user_meta_data ->> 'telefone'), '');
  if v_telefone is not null and (char_length(v_telefone) not between 8 and 25 or v_telefone !~ '^[0-9+() .-]+$') then
    v_telefone := null;
  end if;
  -- Never trust a role sent in signUp/user_metadata.
  insert into public.profiles(id, nome, telefone, tipo) values (new.id, v_nome, v_telefone, 'cliente');
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function app_private.criar_perfil();
create trigger profiles_validate before insert or update on public.profiles
for each row execute function app_private.validar_perfil();
create trigger profiles_updated before update on public.profiles
for each row execute function app_private.updated_at();

-- Existing Auth accounts receive a client profile without trusting metadata roles.
insert into public.profiles(id, nome, tipo)
select id, case when char_length(btrim(coalesce(raw_user_meta_data ->> 'nome', ''))) >= 2
  then left(btrim(raw_user_meta_data ->> 'nome'), 120) else 'Cliente' end, 'cliente'
from auth.users on conflict (id) do nothing;

-- Only the database owner can execute this administrative provisioning operation.
create function app_private.promover_profissional(p_usuario_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set tipo = 'profissional' where id = p_usuario_id;
  if not found then raise exception using errcode = 'PT404', message = 'PROFILE_NOT_FOUND'; end if;
end;
$$;

create function app_private.eh_profissional(p_usuario_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = p_usuario_id and tipo = 'profissional');
$$;

create function app_private.travar_agenda(p_profissional_id uuid) returns void
language sql volatile set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_profissional_id::text, 73421));
$$;

create function app_private.validar_recurso_profissional() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_profissional_id uuid;
begin
  if tg_op = 'DELETE' then v_profissional_id := old.profissional_id;
  else v_profissional_id := new.profissional_id; end if;
  if tg_op = 'UPDATE' and (new.profissional_id <> old.profissional_id or new.id <> old.id) then
    raise exception using errcode = 'PT403', message = 'IMMUTABLE_OWNER';
  end if;
  if not app_private.eh_profissional(v_profissional_id) then
    raise exception using errcode = 'PT403', message = 'PROFESSIONAL_REQUIRED';
  end if;
  perform app_private.travar_agenda(v_profissional_id);
  if tg_table_name = 'bloqueios' and tg_op <> 'DELETE' then
    if exists (select 1 from public.agendamentos a where a.profissional_id = v_profissional_id
      and a.status = 'agendado' and tstzrange(a.inicio, a.fim, '[)') && tstzrange(new.inicio, new.fim, '[)')) then
      raise exception using errcode = 'PT409', message = 'BLOCK_OVERLAPS_APPOINTMENT';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger servicos_validate before insert or update or delete on public.servicos
for each row execute function app_private.validar_recurso_profissional();
create trigger disponibilidade_validate before insert or update or delete on public.disponibilidade
for each row execute function app_private.validar_recurso_profissional();
create trigger bloqueios_validate before insert or update or delete on public.bloqueios
for each row execute function app_private.validar_recurso_profissional();
create trigger servicos_updated before update on public.servicos for each row execute function app_private.updated_at();
create trigger disponibilidade_updated before update on public.disponibilidade for each row execute function app_private.updated_at();
create trigger bloqueios_updated before update on public.bloqueios for each row execute function app_private.updated_at();
create trigger agendamentos_updated before update on public.agendamentos for each row execute function app_private.updated_at();

-- The same calculation is used for browsing and for validating the final booking.
-- It operates in the professional's timezone and returns UTC instants.
create function app_private.calcular_horarios(p_profissional_id uuid, p_servico_id uuid, p_data date)
returns table (inicio timestamptz, fim timestamptz)
language sql stable security definer set search_path = '' as $$
  with contexto as (
    select s.duracao_minutos, p.fuso_horario
    from public.servicos s join public.profiles p on p.id = s.profissional_id
    where s.id = p_servico_id and s.profissional_id = p_profissional_id and s.ativo and p.tipo = 'profissional'
  ), candidatos as (
    select slot as inicio, slot + make_interval(mins => c.duracao_minutos) as fim
    from contexto c
    join public.disponibilidade d on d.profissional_id = p_profissional_id
      and d.dia_semana = extract(dow from p_data)::smallint
    cross join lateral generate_series(
      (p_data + d.hora_inicio) at time zone c.fuso_horario,
      ((p_data + d.hora_fim) at time zone c.fuso_horario) - make_interval(mins => c.duracao_minutos),
      interval '15 minutes'
    ) slot
    where p_data >= (statement_timestamp() at time zone c.fuso_horario)::date
      and p_data <= (statement_timestamp() at time zone c.fuso_horario)::date + 365
  )
  select distinct c.inicio, c.fim from candidatos c
  where c.inicio > statement_timestamp()
    and not exists (select 1 from public.bloqueios b where b.profissional_id = p_profissional_id
      and tstzrange(b.inicio, b.fim, '[)') && tstzrange(c.inicio, c.fim, '[)'))
    and not exists (select 1 from public.agendamentos a where a.profissional_id = p_profissional_id
      and a.status = 'agendado' and tstzrange(a.inicio, a.fim, '[)') && tstzrange(c.inicio, c.fim, '[)'))
  order by c.inicio;
$$;

create function app_private.listar_profissionais()
returns table (id uuid, nome text, fuso_horario text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode = 'PT401', message = 'AUTH_REQUIRED'; end if;
  return query select p.id, p.nome, p.fuso_horario from public.profiles p
    where p.tipo = 'profissional' order by p.nome;
end;
$$;

create function app_private.listar_agendamentos(p_inicio timestamptz default null, p_fim timestamptz default null)
returns table (
  id uuid, cliente_id uuid, profissional_id uuid, servico_id uuid, preco_agendado numeric,
  inicio timestamptz, fim timestamptz, status public.status_agendamento,
  motivo_cancelamento text, cancelado_em timestamptz, cancelado_por uuid,
  created_at timestamptz, updated_at timestamptz, servico_nome text,
  cliente_nome text, cliente_telefone text, profissional_nome text, fuso_horario text
)
language plpgsql stable security definer set search_path = '' as $$
declare v_usuario uuid := auth.uid();
begin
  if v_usuario is null then raise exception using errcode = 'PT401', message = 'AUTH_REQUIRED'; end if;
  if (p_inicio is not null and not isfinite(p_inicio)) or (p_fim is not null and not isfinite(p_fim))
    or (p_inicio is not null and p_fim is not null and p_inicio >= p_fim) then
    raise exception using errcode = 'PT422', message = 'INVALID_DATE_RANGE';
  end if;
  return query select a.id, a.cliente_id, a.profissional_id, a.servico_id, a.preco_agendado,
    a.inicio, a.fim, a.status, a.motivo_cancelamento, a.cancelado_em, a.cancelado_por,
    a.created_at, a.updated_at, s.nome, c.nome,
    case when a.profissional_id = v_usuario then c.telefone else null end,
    p.nome, p.fuso_horario
  from public.agendamentos a
  join public.servicos s on s.id = a.servico_id
  join public.profiles c on c.id = a.cliente_id
  join public.profiles p on p.id = a.profissional_id
  where (a.cliente_id = v_usuario or a.profissional_id = v_usuario)
    and (p_inicio is null or a.fim > p_inicio) and (p_fim is null or a.inicio < p_fim)
  order by a.inicio desc;
end;
$$;

create function app_private.horarios_disponiveis(p_profissional_id uuid, p_servico_id uuid, p_data date)
returns table (inicio timestamptz, fim timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode = 'PT401', message = 'AUTH_REQUIRED'; end if;
  if p_data is null or not isfinite(p_data) or p_profissional_id is null or p_servico_id is null then
    raise exception using errcode = 'PT422', message = 'INVALID_DATE_OR_SERVICE';
  end if;
  return query select h.inicio, h.fim from app_private.calcular_horarios(p_profissional_id, p_servico_id, p_data) h;
end;
$$;

create function app_private.criar_agendamento(p_servico_id uuid, p_inicio timestamptz, p_servico_atualizado_em timestamptz default null)
returns public.agendamentos
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
  v_servico public.servicos;
  v_fuso text;
  v_fim timestamptz;
  v_agendamento public.agendamentos;
begin
  if v_usuario is null then raise exception using errcode = 'PT401', message = 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where id = v_usuario and tipo = 'cliente') then
    raise exception using errcode = 'PT403', message = 'CLIENT_REQUIRED';
  end if;
  if p_inicio is null or not isfinite(p_inicio) or p_inicio <= clock_timestamp() then
    raise exception using errcode = 'PT422', message = 'PAST_OR_INVALID_TIME';
  end if;
  select * into v_servico from public.servicos where id = p_servico_id and ativo;
  if not found then raise exception using errcode = 'PT404', message = 'SERVICE_NOT_FOUND'; end if;
  perform app_private.travar_agenda(v_servico.profissional_id);
  -- Read again after acquiring the lock: service edits share this same lock.
  select * into v_servico from public.servicos where id = p_servico_id and ativo;
  if not found then raise exception using errcode = 'PT404', message = 'SERVICE_NOT_FOUND'; end if;
  if p_servico_atualizado_em is not null and p_servico_atualizado_em <> v_servico.updated_at then
    raise exception using errcode = 'PT409', message = 'SERVICE_CHANGED';
  end if;
  select fuso_horario into v_fuso from public.profiles where id = v_servico.profissional_id;
  select h.fim into v_fim from app_private.calcular_horarios(
    v_servico.profissional_id, p_servico_id, (p_inicio at time zone v_fuso)::date
  ) h where h.inicio = p_inicio;
  if v_fim is null then raise exception using errcode = 'PT409', message = 'SLOT_UNAVAILABLE'; end if;
  -- Recheck wall time after waiting for concurrent work.
  if p_inicio <= clock_timestamp() then raise exception using errcode = 'PT422', message = 'PAST_OR_INVALID_TIME'; end if;
  insert into public.agendamentos(cliente_id, profissional_id, servico_id, preco_agendado, inicio, fim)
  values(v_usuario, v_servico.profissional_id, v_servico.id, v_servico.preco, p_inicio, v_fim) returning * into v_agendamento;
  return v_agendamento;
exception when exclusion_violation then
  raise exception using errcode = 'PT409', message = 'SLOT_UNAVAILABLE';
end;
$$;

create function app_private.cancelar_agendamento(p_agendamento_id uuid, p_motivo text default null)
returns public.agendamentos
language plpgsql volatile security definer set search_path = '' as $$
declare v_usuario uuid := auth.uid(); v_agendamento public.agendamentos;
begin
  if v_usuario is null then raise exception using errcode = 'PT401', message = 'AUTH_REQUIRED'; end if;
  if p_motivo is not null and char_length(p_motivo) > 500 then
    raise exception using errcode = 'PT422', message = 'INVALID_CANCELLATION_REASON';
  end if;
  select * into v_agendamento from public.agendamentos where id = p_agendamento_id
    and (cliente_id = v_usuario or profissional_id = v_usuario);
  if not found then raise exception using errcode = 'PT404', message = 'APPOINTMENT_NOT_FOUND'; end if;
  perform app_private.travar_agenda(v_agendamento.profissional_id);
  select * into v_agendamento from public.agendamentos where id = p_agendamento_id for update;
  if v_agendamento.status in ('cancelado_cliente', 'cancelado_profissional') then return v_agendamento; end if;
  if v_agendamento.status <> 'agendado' then
    raise exception using errcode = 'PT409', message = 'APPOINTMENT_ALREADY_FINISHED';
  end if;
  if v_agendamento.inicio <= clock_timestamp() then
    raise exception using errcode = 'PT422', message = 'CANCELLATION_AFTER_START';
  end if;
  update public.agendamentos set
    status = case when cliente_id = v_usuario then 'cancelado_cliente'::public.status_agendamento
      else 'cancelado_profissional'::public.status_agendamento end,
    cancelado_em = clock_timestamp(), cancelado_por = v_usuario,
    motivo_cancelamento = nullif(btrim(p_motivo), '')
  where id = p_agendamento_id returning * into v_agendamento;
  return v_agendamento;
end;
$$;

create function app_private.concluir_agendamento(p_agendamento_id uuid)
returns public.agendamentos
language plpgsql volatile security definer set search_path = '' as $$
declare v_usuario uuid := auth.uid(); v_agendamento public.agendamentos;
begin
  if v_usuario is null then raise exception using errcode = 'PT401', message = 'AUTH_REQUIRED'; end if;
  select * into v_agendamento from public.agendamentos where id = p_agendamento_id and profissional_id = v_usuario;
  if not found then raise exception using errcode = 'PT404', message = 'APPOINTMENT_NOT_FOUND'; end if;
  perform app_private.travar_agenda(v_agendamento.profissional_id);
  select * into v_agendamento from public.agendamentos where id = p_agendamento_id for update;
  if v_agendamento.status = 'concluido' then return v_agendamento; end if;
  if v_agendamento.status <> 'agendado' then
    raise exception using errcode = 'PT409', message = 'APPOINTMENT_CANCELLED';
  end if;
  if v_agendamento.fim > clock_timestamp() then
    raise exception using errcode = 'PT422', message = 'APPOINTMENT_NOT_FINISHED';
  end if;
  update public.agendamentos set status = 'concluido' where id = p_agendamento_id returning * into v_agendamento;
  return v_agendamento;
end;
$$;

create function app_private.registrar_evento_agendamento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.agendamento_eventos(agendamento_id, status_novo, alterado_por)
    values(new.id, new.status, coalesce(auth.uid(), new.cliente_id));
  elsif old.status <> new.status then
    insert into public.agendamento_eventos(agendamento_id, status_anterior, status_novo, alterado_por)
    values(new.id, old.status, new.status, coalesce(auth.uid(), new.cancelado_por, new.profissional_id));
  end if;
  return new;
end;
$$;
create trigger agendamentos_audit after insert or update on public.agendamentos
for each row execute function app_private.registrar_evento_agendamento();

create function public.listar_profissionais() returns table (id uuid, nome text, fuso_horario text)
language sql stable security invoker set search_path = '' as $$ select * from app_private.listar_profissionais(); $$;
create function public.listar_agendamentos(p_inicio timestamptz default null, p_fim timestamptz default null)
returns table (
  id uuid, cliente_id uuid, profissional_id uuid, servico_id uuid, preco_agendado numeric,
  inicio timestamptz, fim timestamptz, status public.status_agendamento,
  motivo_cancelamento text, cancelado_em timestamptz, cancelado_por uuid,
  created_at timestamptz, updated_at timestamptz, servico_nome text,
  cliente_nome text, cliente_telefone text, profissional_nome text, fuso_horario text
)
language sql stable security invoker set search_path = '' as $$
  select * from app_private.listar_agendamentos(p_inicio, p_fim);
$$;
create function public.horarios_disponiveis(p_profissional_id uuid, p_servico_id uuid, p_data date)
returns table (inicio timestamptz, fim timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from app_private.horarios_disponiveis(p_profissional_id, p_servico_id, p_data);
$$;
create function public.criar_agendamento(p_servico_id uuid, p_inicio timestamptz, p_servico_atualizado_em timestamptz default null) returns public.agendamentos
language sql volatile security invoker set search_path = '' as $$ select app_private.criar_agendamento(p_servico_id, p_inicio, p_servico_atualizado_em); $$;
create function public.cancelar_agendamento(p_agendamento_id uuid, p_motivo text default null) returns public.agendamentos
language sql volatile security invoker set search_path = '' as $$ select app_private.cancelar_agendamento(p_agendamento_id, p_motivo); $$;
create function public.concluir_agendamento(p_agendamento_id uuid) returns public.agendamentos
language sql volatile security invoker set search_path = '' as $$ select app_private.concluir_agendamento(p_agendamento_id); $$;

-- New PostgreSQL functions otherwise default to EXECUTE granted to PUBLIC.
revoke all on all functions in schema app_private from public, anon, authenticated;
revoke all on function public.listar_profissionais(),
  public.listar_agendamentos(timestamptz, timestamptz),
  public.horarios_disponiveis(uuid, uuid, date), public.criar_agendamento(uuid, timestamptz, timestamptz),
  public.cancelar_agendamento(uuid, text), public.concluir_agendamento(uuid) from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.eh_profissional(uuid), app_private.listar_profissionais(),
  app_private.listar_agendamentos(timestamptz, timestamptz),
  app_private.horarios_disponiveis(uuid, uuid, date), app_private.criar_agendamento(uuid, timestamptz, timestamptz),
  app_private.cancelar_agendamento(uuid, text), app_private.concluir_agendamento(uuid) to authenticated;
grant execute on function public.listar_profissionais(), public.horarios_disponiveis(uuid, uuid, date),
  public.listar_agendamentos(timestamptz, timestamptz),
  public.criar_agendamento(uuid, timestamptz, timestamptz), public.cancelar_agendamento(uuid, text),
  public.concluir_agendamento(uuid) to authenticated;

commit;

-- Run against a disposable migrated database. All fixture data is rolled back.
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert_true(p_condition boolean, p_label text) returns void
language plpgsql as $$ begin
  if p_condition is distinct from true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end; $$;
create function pg_temp.assert_error(p_sql text, p_code text, p_label text) returns void
language plpgsql as $$ declare v_code text; begin
  begin execute p_sql;
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate;
    if v_code = p_code then raise notice 'PASS: %', p_label; return; end if;
    raise exception 'FAIL: %, expected SQLSTATE %, got %', p_label, p_code, v_code;
  end;
  raise exception 'FAIL: %, command unexpectedly succeeded', p_label;
end; $$;

insert into auth.users(id, email, raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111','client1@example.test','{"nome":"Cliente Um","telefone":"11999990001","tipo":"profissional"}'),
 ('22222222-2222-4222-8222-222222222222','client2@example.test','{"nome":"Cliente Dois","telefone":"11999990002"}'),
 ('33333333-3333-4333-8333-333333333333','pro1@example.test','{"nome":"Profissional Um","telefone":"11999990003"}'),
 ('44444444-4444-4444-8444-444444444444','pro2@example.test','{"nome":"Profissional Dois"}');
select pg_temp.assert_true((select tipo = 'cliente' from public.profiles where id='11111111-1111-4111-8111-111111111111'), 'signup cannot choose professional role');
select app_private.promover_profissional('33333333-3333-4333-8333-333333333333');
select app_private.promover_profissional('44444444-4444-4444-8444-444444444444');

insert into public.servicos(id, profissional_id, nome, duracao_minutos, preco) values
 ('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333','Atendimento 60',60,100),
 ('66666666-6666-4666-8666-666666666666','33333333-3333-4333-8333-333333333333','Atendimento 30',30,null),
 ('77777777-7777-4777-8777-777777777777','44444444-4444-4444-8444-444444444444','Outro profissional',30,50);
insert into public.disponibilidade(profissional_id,dia_semana,hora_inicio,hora_fim)
select '33333333-3333-4333-8333-333333333333'::uuid, d, '09:00'::time, '12:00'::time from generate_series(0,6) d
union all select '33333333-3333-4333-8333-333333333333'::uuid, d, '13:00'::time, '17:00'::time from generate_series(0,6) d;
insert into public.bloqueios(profissional_id,inicio,fim,motivo) values
 ('33333333-3333-4333-8333-333333333333', ((current_timestamp at time zone 'America/Sao_Paulo')::date + 1 + time '14:00') at time zone 'America/Sao_Paulo',
 ((current_timestamp at time zone 'America/Sao_Paulo')::date + 1 + time '15:00') at time zone 'America/Sao_Paulo', 'Compromisso privado');

set local role anon;
select pg_temp.assert_error('select * from public.profiles', '42501', 'anonymous cannot read profiles');
select pg_temp.assert_error('select * from public.listar_profissionais()', '42501', 'anonymous cannot execute catalogue RPC');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'client sees only own profile');
select pg_temp.assert_true((select count(*) = 2 from public.listar_profissionais()), 'catalogue lists professionals');
select pg_temp.assert_true((select count(*) = 0 from public.disponibilidade), 'client cannot inspect raw availability');
select pg_temp.assert_true((select count(*) = 0 from public.bloqueios), 'client cannot inspect private blocks');
select pg_temp.assert_error('update public.profiles set tipo = ''profissional''', '42501', 'client cannot update role');
select pg_temp.assert_error('select app_private.promover_profissional(''11111111-1111-4111-8111-111111111111'')', '42501', 'client cannot call provisioning function');
select pg_temp.assert_error('insert into public.disponibilidade(profissional_id,dia_semana,hora_inicio,hora_fim) values(''33333333-3333-4333-8333-333333333333'',0,''18:00'',''19:00'')', '42501', 'client cannot manage another schedule');
select pg_temp.assert_error('insert into public.servicos(profissional_id,nome,duracao_minutos) values(''11111111-1111-4111-8111-111111111111'',''Fake service'',30)', 'PT403', 'client cannot create own professional service');
select pg_temp.assert_error('select public.criar_agendamento(''55555555-5555-4555-8555-555555555555'',now()-interval ''1 day'')','PT422','past appointments rejected');
select pg_temp.assert_error('select public.horarios_disponiveis(''33333333-3333-4333-8333-333333333333'',''55555555-5555-4555-8555-555555555555'',null)','PT422','invalid dates rejected');
select pg_temp.assert_true((select count(*) > 0 from public.horarios_disponiveis('33333333-3333-4333-8333-333333333333','55555555-5555-4555-8555-555555555555',(current_timestamp at time zone 'America/Sao_Paulo')::date+1)), 'available slots generated from weekly windows');
select pg_temp.assert_true(not exists(select 1 from public.horarios_disponiveis('33333333-3333-4333-8333-333333333333','55555555-5555-4555-8555-555555555555',(current_timestamp at time zone 'America/Sao_Paulo')::date+1)
 where (inicio at time zone 'America/Sao_Paulo')::time in ('11:30','12:00','13:15','14:00')), 'duration, lunch and specific block remove unavailable slots');
select public.criar_agendamento('55555555-5555-4555-8555-555555555555', ((current_timestamp at time zone 'America/Sao_Paulo')::date + 1 + time '09:00') at time zone 'America/Sao_Paulo');
select pg_temp.assert_true((select count(*)=1 from public.agendamentos), 'client can create appointment');
select pg_temp.assert_true((select preco_agendado=100 and fim-inicio=interval '60 minutes' from public.agendamentos), 'price and duration recorded at confirmation');
select pg_temp.assert_error('select public.criar_agendamento(''66666666-6666-4666-8666-666666666666'', ((current_timestamp at time zone ''America/Sao_Paulo'')::date + 1 + time ''09:15'') at time zone ''America/Sao_Paulo'')','PT409','overlapping service of different duration rejected');
select pg_temp.assert_true((select cliente_telefone is null from public.listar_agendamentos()), 'RPC does not send phone to client');
select pg_temp.assert_error('select public.criar_agendamento(''66666666-6666-4666-8666-666666666666'', ((current_timestamp at time zone ''America/Sao_Paulo'')::date + 1 + time ''11:00'') at time zone ''America/Sao_Paulo'', ''2000-01-01''::timestamptz)','PT409','changed service must be reviewed again before confirmation');
select pg_temp.assert_error('update public.agendamentos set status=''concluido''', '42501', 'direct status and time mutation denied');
select pg_temp.assert_error('delete from public.agendamentos','42501','appointments cannot be deleted');

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select pg_temp.assert_true((select count(*)=0 from public.agendamentos), 'other client cannot see appointments');
select pg_temp.assert_true((select count(*)=0 from public.listar_agendamentos()), 'RPC enforces participant scope');
reset role;
select set_config('test.appointment_id',(select id::text from public.agendamentos limit 1),true);
set local role authenticated;
select pg_temp.assert_error('select public.cancelar_agendamento(current_setting(''test.appointment_id'')::uuid)','PT404','guessed appointment ID cannot cancel another client');
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select pg_temp.assert_true((select count(*)=0 from public.agendamentos), 'other professional cannot see appointments');
with changed as (update public.servicos set nome='Hacked' where id='55555555-5555-4555-8555-555555555555' returning id)
select pg_temp.assert_true(count(*)=0, 'professional cannot edit someone else service') from changed;

select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select pg_temp.assert_true((select count(*)=1 from public.agendamentos), 'professional sees own appointments');
select pg_temp.assert_true((select cliente_telefone='11999990001' from public.listar_agendamentos()), 'professional sees basic booked client contact');
select pg_temp.assert_error('select public.concluir_agendamento(current_setting(''test.appointment_id'')::uuid)','PT422','cannot complete before appointment ends');
select pg_temp.assert_error('insert into public.bloqueios(profissional_id,inicio,fim) select profissional_id,inicio,fim from public.agendamentos','PT409','block cannot displace an active appointment');
select pg_temp.assert_error('insert into public.disponibilidade(profissional_id,dia_semana,hora_inicio,hora_fim) values(''33333333-3333-4333-8333-333333333333'',0,''10:00'',''11:00'')','23P01','weekly windows cannot overlap');
update public.servicos set preco=150, duracao_minutos=90 where id='55555555-5555-4555-8555-555555555555';
select pg_temp.assert_true((select preco_agendado=100 and fim-inicio=interval '60 minutes' from public.agendamentos), 'service edits preserve appointment history');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.cancelar_agendamento(current_setting('test.appointment_id')::uuid,'Mudança de planos');
select pg_temp.assert_true((select status='cancelado_cliente' and cancelado_por='11111111-1111-4111-8111-111111111111' and motivo_cancelamento='Mudança de planos' from public.agendamentos),'client cancellation records author, reason and status');
select pg_temp.assert_true((select count(*)=2 from public.agendamento_eventos), 'immutable history includes creation and cancellation');
select pg_temp.assert_true(exists(select 1 from public.horarios_disponiveis('33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666',(current_timestamp at time zone 'America/Sao_Paulo')::date+1)
 where (inicio at time zone 'America/Sao_Paulo')::time='09:00'), 'cancelled slot immediately becomes available');
select public.cancelar_agendamento(current_setting('test.appointment_id')::uuid,'Retry');
select pg_temp.assert_true((select count(*)=2 from public.agendamento_eventos), 'cancellation is idempotent and preserves first reason');
select public.criar_agendamento('66666666-6666-4666-8666-666666666666', ((current_timestamp at time zone 'America/Sao_Paulo')::date + 1 + time '09:00') at time zone 'America/Sao_Paulo');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select public.cancelar_agendamento(id,'Indisponibilidade') from public.agendamentos where status='agendado';
select pg_temp.assert_true(exists(select 1 from public.agendamentos where status='cancelado_profissional'), 'professional cancellation has distinct status');
reset role;
-- Historical fixtures are inserted by the trusted test database owner.
insert into public.agendamentos(cliente_id,profissional_id,servico_id,inicio,fim)
values('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666',now()-interval '2 days',now()-interval '2 days'+interval '30 minutes');
set local role authenticated;
select public.concluir_agendamento(id) from public.agendamentos where status='agendado';
select pg_temp.assert_true(exists(select 1 from public.agendamentos where status='concluido'),'professional completes ended appointment');
select pg_temp.assert_error('select public.cancelar_agendamento(id) from public.agendamentos where status=''concluido''','PT409','completed appointment cannot be cancelled');
reset role;
rollback;

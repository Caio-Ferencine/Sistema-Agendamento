begin;

-- Profile role, owner and timezone are not writable through the Data API.
grant select on public.profiles to authenticated;
grant update (nome, telefone) on public.profiles to authenticated;
create policy profiles_ler_proprio_ou_cliente_agendado on public.profiles
for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from public.agendamentos a
    where a.cliente_id = profiles.id and a.profissional_id = (select auth.uid())
  )
);
create policy profiles_atualizar_proprio on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.servicos to authenticated;
grant insert (profissional_id, nome, descricao, duracao_minutos, preco, ativo) on public.servicos to authenticated;
grant update (nome, descricao, duracao_minutos, preco, ativo) on public.servicos to authenticated;
create policy servicos_ler_catalogo_ou_historico on public.servicos
for select to authenticated using (
  ativo or profissional_id = (select auth.uid()) or exists (
    select 1 from public.agendamentos a where a.servico_id = servicos.id and a.cliente_id = (select auth.uid())
  )
);
create policy servicos_inserir_proprio on public.servicos for insert to authenticated
with check (profissional_id = (select auth.uid()) and app_private.eh_profissional((select auth.uid())));
create policy servicos_atualizar_proprio on public.servicos for update to authenticated
using (profissional_id = (select auth.uid()) and app_private.eh_profissional((select auth.uid())))
with check (profissional_id = (select auth.uid()) and app_private.eh_profissional((select auth.uid())));

grant select, delete on public.disponibilidade to authenticated;
grant insert (profissional_id, dia_semana, hora_inicio, hora_fim) on public.disponibilidade to authenticated;
grant update (dia_semana, hora_inicio, hora_fim) on public.disponibilidade to authenticated;
create policy disponibilidade_ler_propria on public.disponibilidade for select to authenticated
using (profissional_id = (select auth.uid()) and app_private.eh_profissional((select auth.uid())));
create policy disponibilidade_inserir_propria on public.disponibilidade for insert to authenticated
with check (profissional_id = (select auth.uid()) and app_private.eh_profissional((select auth.uid())));
create policy disponibilidade_atualizar_propria on public.disponibilidade for update to authenticated
using (profissional_id = (select auth.uid()) and app_private.eh_profissional((select auth.uid())))
with check (profissional_id = (select auth.uid()) and app_private.eh_profissional((select auth.uid())));
create policy disponibilidade_excluir_propria on public.disponibilidade for delete to authenticated
using (profissional_id = (select auth.uid()) and app_private.eh_profissional((select auth.uid())));

grant select, delete on public.bloqueios to authenticated;
grant insert (profissional_id, inicio, fim, motivo) on public.bloqueios to authenticated;
grant update (inicio, fim, motivo) on public.bloqueios to authenticated;
create policy bloqueios_ler_proprios on public.bloqueios for select to authenticated
using (profissional_id = (select auth.uid()) and app_private.eh_profissional((select auth.uid())));
create policy bloqueios_inserir_proprios on public.bloqueios for insert to authenticated
with check (profissional_id = (select auth.uid()) and app_private.eh_profissional((select auth.uid())));
create policy bloqueios_atualizar_proprios on public.bloqueios for update to authenticated
using (profissional_id = (select auth.uid()) and app_private.eh_profissional((select auth.uid())))
with check (profissional_id = (select auth.uid()) and app_private.eh_profissional((select auth.uid())));
create policy bloqueios_excluir_proprios on public.bloqueios for delete to authenticated
using (profissional_id = (select auth.uid()) and app_private.eh_profissional((select auth.uid())));

-- Only RPCs may mutate appointments; neither side can forge owner, time or status.
grant select on public.agendamentos, public.agendamento_eventos to authenticated;
create policy agendamentos_ler_participantes on public.agendamentos for select to authenticated
using (cliente_id = (select auth.uid()) or profissional_id = (select auth.uid()));
create policy agendamento_eventos_ler_participantes on public.agendamento_eventos for select to authenticated
using (exists (select 1 from public.agendamentos a where a.id = agendamento_eventos.agendamento_id
  and (a.cliente_id = (select auth.uid()) or a.profissional_id = (select auth.uid()))));

commit;

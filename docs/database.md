# Banco de dados e segurança

As migrations estão em `supabase/migrations`. Nenhuma foi aplicada ao projeto Supabase remoto automaticamente. Elas foram verificadas em PostgreSQL 18.4 real, em um cluster local isolado com a extensão `btree_gist`.

## Instalação no Supabase

No SQL Editor do projeto Supabase já configurado no Angular, execute **uma vez e nesta ordem**, usando a conta administrativa do projeto:

1. `202609130001_schema.sql`: enums, tabelas, constraints, índices e RLS inicialmente fechado.
2. `202609130002_business_rules.sql`: integração Auth, funções de negócio, catálogo, histórico e permissões de RPC.
3. `202609130003_rls.sql`: grants por coluna e policies dos participantes.

As migrations são transacionais e reproduzem uma instalação limpa. Uma migration já aplicada não deve ser colada novamente; use uma nova migration para alterações posteriores. Não removem configurações existentes do Angular. Se houver tabelas homônimas de outro sistema no Supabase, revise os conflitos antes de aplicar; nenhum `DROP` destrutivo é usado nas migrations.

No painel Supabase, mantenha o schema `app_private` fora de **Exposed schemas**. O schema `public` contém somente wrappers de RPC `SECURITY INVOKER`; as operações privilegiadas ficam em funções `SECURITY DEFINER` de `app_private`, com `search_path = ''`, qualificação explícita de objetos e autorização interna. Nenhuma RPC deste MVP é executável por `anon`.

Configure em Authentication a Site URL do Angular, por exemplo `http://localhost:4200`, e as URLs de redirecionamento dos ambientes publicados. Se a confirmação de email estiver habilitada, o usuário precisa confirmar a conta antes de entrar. A aplicação usa somente a Publishable Key pública e o token do próprio usuário; jamais inclua `service_role`, secret key ou senha de banco no Angular.

## Contas e profissionais

Supabase Auth armazena as credenciais. O trigger `on_auth_user_created` insere um perfil público relacionado a `auth.users`. Contas Auth existentes também recebem perfil pela migration. Todo cadastro cria um **cliente**, mesmo que alguém envie `tipo: profissional` no metadata. O frontend pode atualizar somente `nome` e `telefone` de seu próprio perfil.

Para provisionar um profissional, crie/confirme uma conta normalmente, copie o UUID de Authentication → Users e execute **no SQL Editor administrativo**:

```sql
select app_private.promover_profissional('UUID-DO-USUARIO'::uuid);
```

A função não é executável por usuários da aplicação. Após a promoção, saia e entre novamente para carregar o novo painel. O profissional cadastra seus serviços e faixas semanais; a agenda é calculada sem sementes ou horários fictícios.

## Modelo

| Tabela                | Responsabilidade e relacionamentos                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`            | PK `id` → `auth.users.id`; nome, telefone, tipo, fuso e auditoria.                                                                                                                       |
| `servicos`            | N:1 profissional → `profiles`; duração, preço opcional, ativo; serviços são desativados, não excluídos.                                                                                  |
| `disponibilidade`     | N:1 profissional; dia de semana 0–6 e faixa local início/fim. Várias faixas no mesmo dia representam almoço e pausas.                                                                    |
| `bloqueios`           | N:1 profissional; intervalo absoluto início/fim e motivo privado, incluindo dias inteiros/férias.                                                                                        |
| `agendamentos`        | N:1 cliente e profissional → `profiles`; FK composta `(servico_id, profissional_id)` impede reservar serviço de outro profissional; início/fim, preço confirmado, status e cancelamento. |
| `agendamento_eventos` | N:1 agendamento; criação e mudanças de status com autor e momento, sem escrita pela Data API.                                                                                            |

Todas as tabelas possuem `created_at`; entidades mutáveis possuem `updated_at` atualizado no banco. FKs usam `ON DELETE RESTRICT` para preservar histórico. O preço confirmado é um snapshot intencional; a duração histórica está representada por `fim - inicio`. Alterar preço/duração do serviço não reescreve reservas existentes.

## Disponibilidade e concorrência

- O fuso padrão é `America/Sao_Paulo`, validado contra `pg_timezone_names` e sem alteração pelo frontend. Datas de trabalho são locais; agendamentos/bloqueios são armazenados em `timestamptz`.
- A grade é de 15 minutos a partir do início de cada faixa. A duração do serviço pode ser de 5 a 480 minutos e precisa caber integralmente na faixa.
- A consulta recebe uma data e considera faixas semanais, duração, bloqueios e agendamentos `agendado`. O horizonte do MVP é de hoje até 365 dias no fuso do profissional. Horários passados nunca são retornados.
- Uma função central calcula disponibilidade tanto para consulta quanto para confirmação. A reserva é validada novamente no banco no momento da escrita.
- Um advisory lock transacional por profissional serializa criação/cancelamento de reserva e edição de serviços, faixas e bloqueios. Após esperar o lock, a reserva relê serviço e disponibilidade antes de inserir.
- A constraint de exclusão GiST `agendamentos_sem_conflito` protege diretamente a tabela contra sobreposição de intervalos ativos, inclusive em inserções concorrentes. Intervalos são `[início,fim)`, permitindo reservas consecutivas.
- Faixas semanais sobrepostas são rejeitadas por outra exclusão GiST. Bloqueios que cobrem reservas ativas são rejeitados; cancele a reserva antes de bloquear aquele período.
- Alterar/desativar um serviço ou editar a disponibilidade afeta novas reservas; agendamentos existentes permanecem preservados.
- Cancelar registra status, autor, instante e motivo e libera o intervalo imediatamente, sem excluir a reserva. Repetir o cancelamento preserva o primeiro registro e não duplica evento.
- Apenas reservas futuras podem ser canceladas. Apenas o profissional relacionado pode concluir uma reserva, depois do fim; estados cancelados/concluídos não voltam a `agendado`.

## RLS e grants

| Recurso                   | Cliente                                              | Profissional                                                            |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Perfis                    | Lê/edita somente o próprio nome/telefone.            | Próprio perfil e leitura dos clientes relacionados a seus agendamentos. |
| Catálogo de profissionais | RPC retorna somente ID, nome e fuso.                 | Mesmo catálogo.                                                         |
| Serviços                  | Lê ativos e serviços do próprio histórico.           | Cria/edita somente próprios serviços.                                   |
| Disponibilidade           | Sem acesso à tabela; consulta somente slots por RPC. | CRUD próprio.                                                           |
| Bloqueios                 | Sem acesso a dados/motivos privados.                 | CRUD próprio.                                                           |
| Agendamentos              | Leitura própria e criação/cancelamento por RPC.      | Leitura relacionada e cancelamento/conclusão por RPC.                   |
| Eventos                   | Leitura das próprias reservas.                       | Leitura das reservas relacionadas.                                      |

IDs de propriedade e auditoria não são atualizáveis pela Data API. `agendamentos` e `agendamento_eventos` não têm grants/policies de INSERT/UPDATE/DELETE para usuários autenticados. As funções derivam `cliente_id` do JWT e o profissional do serviço; não aceitam um ID arbitrário de cliente na criação. `listar_agendamentos` autoriza o participante antes do join e entrega telefone do cliente somente ao profissional da reserva.

## Contrato das RPCs

| RPC                    | Parâmetros                                                                                | Retorno                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listar_profissionais` | nenhum                                                                                    | `{id,nome,fuso_horario}[]`                                                                                                                                                   |
| `horarios_disponiveis` | `p_profissional_id uuid`, `p_servico_id uuid`, `p_data date`                              | `{inicio,fim}[]`, instantes UTC                                                                                                                                              |
| `criar_agendamento`    | `p_servico_id uuid`, `p_inicio timestamptz`, `p_servico_atualizado_em timestamptz = null` | linha de `agendamentos`; a aplicação envia a versão do serviço para rejeitar confirmação desatualizada                                                                       |
| `cancelar_agendamento` | `p_agendamento_id uuid`, `p_motivo text = null`                                           | linha de `agendamentos`                                                                                                                                                      |
| `concluir_agendamento` | `p_agendamento_id uuid`                                                                   | linha de `agendamentos`                                                                                                                                                      |
| `listar_agendamentos`  | `p_inicio timestamptz = null`, `p_fim timestamptz = null`                                 | campos da reserva + `servico_nome`, `cliente_nome`, `cliente_telefone`, `profissional_nome`, `fuso_horario`; somente participantes; filtra intervalos sobrepostos ao período |

Erros previsíveis usam códigos `PT401` (login), `PT403` (permissão), `PT404` (registro ausente/inacessível), `PT409` (conflito) e `PT422` (dados/regra inválidos). `23P01` significa sobreposição e `23514` constraint inválida. O Angular converte códigos para mensagens amigáveis, sem exibir detalhes internos do PostgreSQL.

## Testes locais

`supabase/tests/local-bootstrap.sql` emula somente os objetos Auth indispensáveis em um PostgreSQL descartável; **não execute esse arquivo no Supabase remoto**. Não é backend alternativo nem dados mockados do aplicativo.

Em um cluster PostgreSQL de teste que possua `btree_gist`, crie o banco **`agenda_mvp_test`**. Execute o bootstrap uma única vez nesse cluster, as três migrations no banco e depois `integration.sql`. O teste de integração termina com `ROLLBACK` e verifica autenticação/permissões, tentativa de autoelevação, isolamento entre clientes/profissionais, duração, almoço, bloqueios, cancelamento, auditoria, preço histórico e conclusão.

```powershell
$env:PSQL_PATH = 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
$env:PGTEST_PORT = '55432'
& $env:PSQL_PATH -h 127.0.0.1 -p 55432 -U postgres -d agenda_mvp_test -v ON_ERROR_STOP=1 -f supabase/tests/integration.sql
node supabase/tests/concurrency.mjs
```

O teste de concorrência usa conexões reais independentes, uma barreira e transações sobrepostas. Verifica duas reservas do mesmo intervalo, reserva versus bloqueio nas duas ordens, e a exclusão GiST via INSERT direto. Recusa outro nome de banco e conecta somente a `127.0.0.1`; seus registros de teste são removidos ao terminar.

Os testes locais verificam PostgreSQL/RLS/RPC; confirmação real de email e comunicação pela Data API do Supabase dependem da aplicação das migrations e das configurações do projeto remoto.

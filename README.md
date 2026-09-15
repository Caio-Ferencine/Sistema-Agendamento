# Agenda

MVP de agendamento com **Angular 21**, **Supabase Auth** e **PostgreSQL**. O projeto Angular existente foi mantido, assim como sua configuração de conexão por `supabase-js`.

Clientes encontram serviços, profissionais e horários livres. Profissionais administram serviços, rotina semanal, bloqueios e atendimentos. As regras que protegem reservas e dados são executadas no banco de dados.

## Executar o projeto

Abra o terminal na pasta `sistema-agendamento`, que contém `package.json`. Se estiver na pasta pai `Sistema Agendamento`, entre nela antes:

```powershell
cd sistema-agendamento
npm ci
npm start
```

Acesse [http://localhost:4200](http://localhost:4200). A validação final foi executada com Node.js 24.19.0. Use essa versão ou uma versão compatível e atualizada; o Node 24.11 deste ambiente apresentou timeout ao iniciar workers do Vitest.

```powershell
npm run build
npm test -- --watch=false
```

O build gera os arquivos estáticos de produção em `dist/sistema-agendamento/browser`. Para publicar uma SPA, configure o servidor para retornar `index.html` nas rotas do Angular, incluindo `/auth/callback`.

A conexão já configurada permanece em `src/environments/environment.ts` e `src/environments/environment.development.ts`. O Angular utiliza apenas a URL do projeto, a **Publishable Key** pública e o token do usuário autenticado. Nunca coloque `service_role`, secret key ou senha de banco nesses arquivos. Não é necessário adicionar um servidor próprio para este MVP.

## Preparar o Supabase

A conexão existente não cria tabelas automaticamente. Antes de usar os fluxos de cadastro e agendamento, aplique as migrations no **mesmo projeto Supabase configurado no Angular**.

No SQL Editor administrativo, execute os arquivos uma única vez, nesta ordem:

| Ordem | Arquivo                                                                                                      | Conteúdo                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 1     | [`supabase/migrations/202609130001_schema.sql`](supabase/migrations/202609130001_schema.sql)                 | Enums, tabelas, chaves, índices, constraints e RLS inicialmente fechado. |
| 2     | [`supabase/migrations/202609130002_business_rules.sql`](supabase/migrations/202609130002_business_rules.sql) | Criação de perfil a partir do Auth, regras de negócio, auditoria e RPCs. |
| 3     | [`supabase/migrations/202609130003_rls.sql`](supabase/migrations/202609130003_rls.sql)                       | Grants por operação/coluna e policies de acesso.                         |

As migrations são transacionais e destinadas à instalação inicial. Não repita uma migration já aplicada; alterações posteriores devem ser registradas em uma nova migration. Se o projeto remoto já contiver tabelas com os mesmos nomes, revise a compatibilidade antes de executar. O Angular não aplica SQL automaticamente.

Mantenha `app_private` fora dos **Exposed schemas** da Data API. As RPCs públicas chamam funções internas que validam identidade, papel e propriedade dos registros. Nenhuma RPC do MVP aceita chamadas sem autenticação.

Em **Authentication → URL Configuration**, configure:

- Site URL de desenvolvimento: `http://localhost:4200`.
- Redirect URL de desenvolvimento: `http://localhost:4200/auth/callback`.
- Site URL e Redirect URL equivalentes para cada ambiente publicado, usando o domínio real e `/auth/callback`.

Quando a confirmação de email estiver habilitada, confirme o email antes de entrar. A tela de cadastro informa essa etapa e oferece reenvio da confirmação. O link retorna ao callback da aplicação. Como o fluxo utiliza PKCE, abra a confirmação no mesmo navegador em que realizou o cadastro.

### Habilitar um profissional

O cadastro público sempre cria um **cliente**. O papel não pode ser escolhido em uma requisição do navegador nem alterado pelo próprio usuário. Para disponibilizar um profissional no MVP:

1. Crie e confirme sua conta pela tela de cadastro.
2. Copie o UUID da conta em **Authentication → Users**.
3. No SQL Editor administrativo, execute:

```sql
select app_private.promover_profissional('UUID-DO-USUARIO'::uuid);
```

4. Saia e entre novamente para carregar o painel profissional.
5. Cadastre ao menos um serviço ativo e uma faixa de disponibilidade semanal.

Essa função administrativa não pode ser executada pelos usuários da aplicação. Não existem senhas em tabelas públicas. Contas Auth preexistentes recebem um perfil durante a migration.

## Arquitetura

A aplicação usa componentes standalone, rotas carregadas sob demanda, formulários reativos e signals para estados de carregamento, dados e mensagens. Os componentes recebem dados de serviços Angular, sem chamadas diretas ao Supabase espalhadas pelas telas.

- **Supabase:** mantém uma única instância de `supabase-js` e reutiliza a configuração existente.
- **AuthService:** gerencia sessão, login, cadastro, confirmação, logout e carregamento de perfil.
- **Guards:** esperam a autenticação, exigem perfil válido e restringem páginas ao papel correto.
- **SchedulingService:** concentra consultas e operações de serviços, disponibilidade, bloqueios e agendamentos.
- **Models:** tipam perfis, serviços, faixas, bloqueios, horários e agendamentos.
- **Utilitários de datas:** convertem os horários locais do profissional para instantes UTC e formatam a interface em português.
- **Tratamento de erros:** traduz erros de conexão, autenticação, permissão, validação e conflito em mensagens amigáveis. Detalhes internos do PostgreSQL não são exibidos ao usuário.
- **PostgreSQL:** centraliza cálculo de disponibilidade, validação de reservas, transições de status, autorização e proteção contra concorrência.

Guards e validações Angular melhoram a experiência. A autorização real continua nas policies, grants e funções do banco.

```text
src/
├── app/
│   ├── core/
│   │   ├── auth/               # Sessão, autenticação e perfil
│   │   ├── guards/             # Acesso autenticado e por papel
│   │   └── services/           # Cliente Supabase, dados e erros
│   ├── models/                # Entidades TypeScript
│   ├── pages/
│   │   ├── auth/              # Login, cadastro e callback
│   │   ├── cliente/           # Painel, reserva e histórico
│   │   └── profissional/      # Agenda e gerenciamento
│   ├── shared/
│   │   ├── components/        # Estrutura visual compartilhada
│   │   └── utils/             # Datas e fusos horários
│   └── app.routes.ts
├── environments/              # Configuração Supabase existente
└── styles.css                 # Design responsivo compartilhado
supabase/
├── migrations/                # Estrutura, regras e RLS reproduzíveis
└── tests/                     # Integração SQL e concorrência real
docs/
└── database.md                # Contratos, segurança e testes do banco
```

A estrutura mantém responsabilidades explícitas sem criar pastas vazias, interceptors desnecessários ou camadas que apenas repassem chamadas. Novas funcionalidades podem acrescentar serviços e páginas por domínio.

## Banco de dados e relacionamentos

| Tabela                | Finalidade                                                                          | Relacionamentos                                                |
| --------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `profiles`            | Nome, telefone opcional, tipo, fuso horário e auditoria.                            | PK `id` também é FK para `auth.users.id`.                      |
| `servicos`            | Nome, descrição, duração, preço opcional e situação ativa.                          | Muitos serviços pertencem a um profissional em `profiles`.     |
| `disponibilidade`     | Dia da semana e faixas locais de trabalho.                                          | Muitas faixas pertencem a um profissional.                     |
| `bloqueios`           | Início/fim absolutos e motivo privado da indisponibilidade.                         | Muitos bloqueios pertencem a um profissional.                  |
| `agendamentos`        | Cliente, profissional, serviço, intervalo, preço confirmado, status e cancelamento. | FKs para os dois perfis e FK composta de serviço/profissional. |
| `agendamento_eventos` | Histórico de criação e mudanças de status, autor e instante.                        | Muitos eventos pertencem a um agendamento.                     |

A FK composta `(servico_id, profissional_id)` impede associar a reserva a um profissional diferente do dono do serviço. As FKs preservam referências históricas com `ON DELETE RESTRICT`.

Todas as tabelas possuem `created_at`; as entidades mutáveis possuem `updated_at` mantido por trigger. O preço confirmado é um snapshot intencional da reserva. A duração histórica é representada por `fim - inicio`, sem depender de futuras alterações no serviço.

Tipos de perfil: `cliente` e `profissional`. Status de agendamento:

- `agendado`
- `cancelado_cliente`
- `cancelado_profissional`
- `concluido`

## Disponibilidade e regras de negócio

O profissional cadastra **faixas de trabalho**, sem preencher manualmente cada horário. Para trabalhar de 09h a 18h com almoço de 12h a 13h, cria duas faixas no mesmo dia: 09:00–12:00 e 13:00–18:00.

A função de disponibilidade usa o dia da semana, a duração do serviço ativo, as faixas, os bloqueios e as reservas ativas. O início dos horários segue uma grade de 15 minutos a partir de cada faixa. Serviços têm entre 5 e 480 minutos e precisam caber integralmente no intervalo livre.

O fuso padrão é `America/Sao_Paulo`, validado no PostgreSQL. Faixas semanais usam horários locais; bloqueios e reservas usam `timestamptz`. O navegador interpreta escolhas no fuso do profissional. O horizonte de reserva é de hoje até 365 dias; horários passados não são retornados nem aceitos pelo banco.

Ao confirmar uma reserva, o banco calcula o fim a partir da duração e verifica novamente todas as regras. Não aceita um ID arbitrário de cliente: usa a identidade autenticada. A confirmação de disponibilidade exibida no navegador não garante a reserva até a transação terminar.

A proteção de concorrência combina:

1. **Advisory lock transacional por profissional:** serializa reservas e alterações de agenda relacionadas; a reserva relê os dados após adquirir o lock.
2. **Constraint de exclusão GiST:** proíbe sobreposição de reservas ativas diretamente na tabela, inclusive em requisições simultâneas.

Os intervalos são `[início, fim)`: um atendimento pode começar exatamente quando o anterior termina. Faixas semanais sobrepostas também são rejeitadas. Um bloqueio que atingir uma reserva ativa é recusado; o profissional precisa resolver o agendamento antes de bloquear o período.

Cancelar uma reserva futura registra status, motivo opcional, autor e instante. O registro não é apagado, e o horário volta imediatamente ao cálculo de disponibilidade. Repetir o cancelamento não sobrescreve o primeiro registro nem duplica o evento de auditoria.

Somente o profissional responsável pode concluir o atendimento, após seu horário final. Reservas canceladas ou concluídas não voltam a `agendado`. Alterar serviço ou rotina semanal preserva os agendamentos existentes.

Os detalhes e contratos das RPCs estão em [`docs/database.md`](docs/database.md).

## Segurança e RLS

RLS está habilitado nas seis tabelas públicas, com grants limitados por operação e, nas atualizações, por coluna. Usuários não autenticados não acessam dados do MVP.

| Recurso                   | Cliente                                                        | Profissional                                                             |
| ------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `profiles`                | Lê o próprio perfil; pode alterar somente seu nome e telefone. | Próprio perfil e leitura de clientes relacionados aos seus agendamentos. |
| Catálogo de profissionais | RPC retorna somente ID, nome e fuso.                           | Mesmo catálogo limitado.                                                 |
| `servicos`                | Lê serviços ativos e serviços do próprio histórico.            | Cria e altera somente seus serviços; desativa sem apagar histórico.      |
| `disponibilidade`         | Consulta somente horários livres por RPC.                      | Gerencia somente suas faixas.                                            |
| `bloqueios`               | Não acessa a tabela nem os motivos privados.                   | Gerencia somente seus bloqueios.                                         |
| `agendamentos`            | Lê somente os próprios; cria e cancela por RPC.                | Lê relacionados; cancela e conclui por RPC.                              |
| `agendamento_eventos`     | Lê eventos das próprias reservas.                              | Lê eventos das reservas relacionadas.                                    |

Agendamentos e eventos não permitem INSERT, UPDATE ou DELETE direto pela Data API para usuários da aplicação. IDs de proprietário, papel de perfil e auditoria não são campos editáveis pelo cliente. Alterar um UUID na requisição não concede acesso a outro registro.

As funções públicas usam `SECURITY INVOKER`. As operações privilegiadas ficam no schema não exposto `app_private`, com `SECURITY DEFINER`, `search_path` vazio, nomes de objetos qualificados e checagem interna do usuário. A permissão padrão de execução pública das funções é revogada.

Esta combinação segue os mecanismos de [RLS e grants documentados pelo Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security). A proteção de intervalos utiliza os [tipos range e constraints de exclusão do PostgreSQL](https://www.postgresql.org/docs/current/rangetypes.html).

## Rotas

| Rota                            | Acesso               | Tela                                                           |
| ------------------------------- | -------------------- | -------------------------------------------------------------- |
| `/login`                        | Visitante            | Login e encaminhamento por perfil.                             |
| `/cadastro`                     | Visitante            | Cadastro de cliente.                                           |
| `/auth/callback`                | Confirmação de email | Retorno do Supabase Auth.                                      |
| `/cliente`                      | Cliente              | Painel do cliente.                                             |
| `/cliente/agendar`              | Cliente              | Assistente de reserva em quatro etapas.                        |
| `/cliente/agendamentos`         | Cliente              | Próximos atendimentos, histórico e cancelamento.               |
| `/profissional`                 | Profissional         | Painel com resumo e próximos clientes.                         |
| `/profissional/agenda`          | Profissional         | Agenda, filtros por data, histórico, cancelamento e conclusão. |
| `/profissional/servicos`        | Profissional         | Cadastro, edição, ativação e desativação de serviços.          |
| `/profissional/disponibilidade` | Profissional         | Dias de trabalho e múltiplas faixas por dia.                   |
| `/profissional/bloqueios`       | Profissional         | Compromissos, dias inteiros, férias e outros períodos.         |

A escolha de serviço/profissional, data, horário e a confirmação fazem parte do assistente em `/cliente/agendar`. Cada etapa possui validação antes de avançar.

## Funcionalidades implementadas

**Cliente:** cadastro com Supabase Auth, confirmação de email conforme a configuração do projeto, login/logout, catálogo real de serviços e profissionais, seleção de data e horários calculados no banco, confirmação de reserva, próximos agendamentos, histórico e cancelamento com motivo opcional.

**Profissional:** login com encaminhamento ao painel próprio; indicadores de agenda; criação e edição de serviços com duração/preço; ativação/desativação; múltiplas faixas semanais e intervalos; criação, edição e remoção de bloqueios por horário/dia/período; agenda com filtros; identificação e telefone do cliente quando informado; cancelamento e conclusão de atendimentos.

**Compartilhado:** navegação responsiva para desktop, tablet e celular; formulários reativos; estados de carregamento; confirmação de ações; mensagens de sucesso, erro, conflito e campos inválidos. Não há dados fictícios nas telas.

## Verificação dos fluxos

Os comandos acima permitem compilar a aplicação e executar os testes Angular. A suíte SQL e o teste de concorrência têm instruções próprias em [`docs/database.md`](docs/database.md).

- `supabase/tests/integration.sql`: verifica regras de negócio e isolamento de acesso em transação com rollback.
- `supabase/tests/concurrency.mjs`: usa conexões PostgreSQL independentes para testar disputas reais por horários e bloqueios.
- `supabase/tests/local-bootstrap.sql`: prepara somente um PostgreSQL de teste isolado. **Não execute este arquivo no Supabase remoto.**

Após aplicar as migrations e configurar o Auth no projeto remoto, valide o fluxo completo com uma conta profissional e duas contas clientes: publique serviço/disponibilidade, reserve um horário, tente reservá-lo pela segunda conta, cancele a primeira reserva e verifique que o horário volta a aparecer. Confira também almoço, bloqueios, duração insuficiente, tentativas em horários passados e acesso a rotas do outro papel.

A integração real com email e Data API depende das configurações do Supabase remoto; os testes locais de banco não substituem essa verificação.

## Evolução posterior

O MVP concentra-se na agenda. Pagamentos, WhatsApp, notificações push, assinaturas, multiempresa, marketplace e relatórios avançados não fazem parte desta entrega.

Próximos incrementos possíveis incluem recuperação de senha, edição de perfil na interface, paginação do histórico, atualização automática da agenda, testes E2E no CI, acessibilidade ampliada e configurações administrativas de antecedência/prazo de cancelamento. Novos canais de comunicação ou pagamentos podem consumir os serviços e eventos existentes sem mover as regras de reserva para o navegador.

## Resultado da validação

Build de produção aprovado; 30 testes unitários, 40 verificações SQL e 4 cenários de concorrência aprovados. Formulários, proteção de rotas e telas de autenticação em desktop/celular também foram verificados em navegador real. Consulte [docs/validation.md](docs/validation.md) para os comandos, resultados e limites da validação.

# Validação do MVP

Validação concluída em 14/09/2026. Não foram aplicadas migrations nem criadas contas no Supabase remoto.

| Verificação                      | Resultado                                                                                                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                  | Aprovado. Angular 21 compilou todas as rotas e templates com TypeScript estrito.                                                                                                                                            |
| Suíte Angular/Vitest             | 30 testes aprovados em 8 arquivos, com Node 24.19.0 e configuração `vitest-base.config.ts`.                                                                                                                                 |
| Instalação das migrations        | As três migrations foram aplicadas, em ordem, em um banco PostgreSQL 18.4 novo e isolado.                                                                                                                                   |
| `supabase/tests/integration.sql` | 40 verificações aprovadas; dados de teste desfeitos por ROLLBACK.                                                                                                                                                           |
| `supabase/tests/concurrency.mjs` | 4 cenários aprovados com conexões independentes e espera de lock observada no PostgreSQL.                                                                                                                                   |
| Navegador real                   | Login/cadastro com campos obrigatórios, redirecionamento de visitantes nas rotas de cliente/profissional, telas móveis sem overflow horizontal e ausência de erros JavaScript. Capturas de desktop e celular inspecionadas. |
| Conexão existente                | URL e Publishable Key de desenvolvimento comparadas com a versão original do Git e preservadas. Nenhuma chave privada no Angular.                                                                                           |
| `git diff --check`               | Aprovado.                                                                                                                                                                                                                   |

## Cobertura do banco

Foram verificados isolamento entre clientes e profissionais, negação de acesso anônimo, tentativa de autoelevação por metadata, proteção de IDs e colunas, duração completa do serviço, almoço, bloqueios, horários passados, preço/duração históricos, alteração de serviço antes da confirmação, cancelamento por ambos os participantes, liberação imediata do horário, idempotência, auditoria e conclusão após o fim.

A suíte concorrente mantém a primeira transação aberta, inicia a segunda conexão, confirma uma espera real em `pg_stat_activity` e só então libera a primeira transação. Os cenários cobrem duas reservas no mesmo intervalo, reserva versus bloqueio nas duas ordens e a exclusão GiST com INSERT direto. Os registros de teste foram removidos e o servidor PostgreSQL temporário foi encerrado.

## Executar novamente

Com Node.js 24.19.0:

```powershell
npm ci
npm run build
npm test -- --watch=false
```

A configuração do Vitest usa um worker thread para manter o consumo de recursos previsível nesta suíte pequena. O Angular continua responsável pela compilação, jsdom e inicialização do TestBed. A integração utiliza a opção [runnerConfig documentada pelo Angular](https://angular.dev/guide/testing).

As instruções de preparação do PostgreSQL descartável e os comandos das suítes SQL estão em [database.md](database.md). O bootstrap local nunca deve ser executado no Supabase remoto.

## Limites e observações

- O build mantém os budgets originais. Há um aviso de tamanho: pacote inicial de aproximadamente 502,77 kB, 2,77 kB acima do alerta de 500 kB; transferência estimada de 126,27 kB. O limite de erro de 1 MB não foi atingido.
- No Node 24.11 do terminal deste ambiente, o Vitest compilou os testes, mas houve timeout de inicialização dos workers. A execução com o Node 24.19 instalado concluiu os 30 testes, sem erros.
- O aplicativo usa Supabase real; não há backend simulado ou dados fictícios nas telas. Doubles de teste são usados somente nos testes unitários, e contas descartáveis somente no PostgreSQL local.
- Login/cadastro válidos com envio de email, Data API remota e o fluxo completo entre contas reais dependem da aplicação das migrations e da configuração do Supabase descritas no README. Esses fluxos remotos não foram declarados testados.
- Foram verificadas visualmente as telas públicas de autenticação. As páginas autenticadas passaram pela compilação Angular; as regras de agendamento foram verificadas pelas suítes de banco e pelos testes de serviços/guards.

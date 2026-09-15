/** Real PostgreSQL sessions. Use ONLY with the disposable local test database. */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const psql = process.env.PSQL_PATH ?? 'C:/Program Files/PostgreSQL/18/bin/psql.exe';
const database = process.env.PGTEST_DATABASE ?? 'agenda_mvp_test';
if (database !== 'agenda_mvp_test')
  throw new Error('This test requires the dedicated agenda_mvp_test database.');
const args = [
  '-X',
  '-qAt',
  '-h',
  '127.0.0.1',
  '-p',
  process.env.PGTEST_PORT ?? '55432',
  '-U',
  'postgres',
  '-d',
  database,
  '-v',
  'ON_ERROR_STOP=1',
  '-v',
  'VERBOSITY=verbose',
];

function startSession(onOutput) {
  const child = spawn(psql, args, { windowsHide: true });
  const result = new Promise((resolve, reject) => {
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      onOutput?.(stdout);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
  return { child, result };
}

function execute(sql, onOutput) {
  const session = startSession(onOutput);
  session.child.stdin.end(sql);
  return session.result;
}

async function ok(sql) {
  const result = await execute(sql);
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim();
}

const client1 = randomUUID(),
  client2 = randomUUID(),
  professional = randomUUID(),
  service = randomUUID();
const slot = (hour) =>
  `((current_timestamp at time zone 'America/Sao_Paulo')::date + 2 + time '${hour}') at time zone 'America/Sao_Paulo'`;
const as = (id) =>
  `set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`;
const book = (id, hour) => `${as(id)} select public.criar_agendamento('${service}',${slot(hour)});`;

try {
  await ok(`insert into auth.users(id,raw_user_meta_data) values
    ('${client1}','{"nome":"Concurrent Client One"}'),('${client2}','{"nome":"Concurrent Client Two"}'),('${professional}','{"nome":"Concurrent Professional"}');
    select app_private.promover_profissional('${professional}');
    insert into public.servicos(id,profissional_id,nome,duracao_minutos) values('${service}','${professional}','Concurrency service',60);
    insert into public.disponibilidade(profissional_id,dia_semana,hora_inicio,hora_fim)
      select '${professional}'::uuid,d,'08:00','18:00' from generate_series(0,6) d;`);

  async function race(firstSQL, secondSQL, label) {
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const firstSession = startSession((output) => {
      if (output.includes('LOCK_HELD')) release();
    });
    const first = firstSession.result;
    firstSession.child.stdin.write(`begin; ${firstSQL} select 'LOCK_HELD';\n`);
    let second;
    try {
      await Promise.race([
        held,
        first.then((result) => {
          throw new Error(`First transaction failed before barrier: ${result.stderr}`);
        }),
      ]);
      second = execute(secondSQL);
      const deadline = Date.now() + 30000;
      let observedWait = false;
      while (Date.now() < deadline) {
        observedWait =
          Number(
            await ok(
              `select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and pid<>pg_backend_pid();`,
            ),
          ) > 0;
        if (observedWait) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.ok(
        observedWait,
        'Second database session must actually wait on the uncommitted first transaction',
      );
      firstSession.child.stdin.end('commit;\n');
    } catch (error) {
      firstSession.child.stdin.end('rollback;\n');
      await first;
      if (second) await second;
      throw error;
    }
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.code, 0, a.stderr);
    assert.notEqual(b.code, 0, 'The conflicting transaction unexpectedly succeeded');
    assert.match(b.stderr, /PT409|23P01/);
    console.log(`PASS: ${label}`);
  }

  await race(
    book(client1, '09:00'),
    book(client2, '09:00'),
    'simultaneous bookings reserve the interval exactly once',
  );
  assert.equal(
    await ok(
      `select count(*) from public.agendamentos where profissional_id='${professional}' and status='agendado';`,
    ),
    '1',
  );

  const block = (
    hour,
  ) => `${as(professional)} insert into public.bloqueios(profissional_id,inicio,fim,motivo)
    values('${professional}',${slot(hour)},(${slot(hour)}) + interval '1 hour','Concurrent block');`;
  await race(
    book(client1, '11:00'),
    block('11:00'),
    'block waits for concurrent booking then rejects overlap',
  );
  await race(
    block('13:00'),
    book(client2, '13:00'),
    'booking waits for concurrent block then rejects overlap',
  );

  // This bypasses RPC deliberately as the local database owner, proving the
  // independent exclusion constraint is also protecting the table itself.
  const direct =
    await execute(`insert into public.agendamentos(cliente_id,profissional_id,servico_id,inicio,fim)
    values('${client2}','${professional}','${service}',${slot('09:15')},${slot('10:15')});`);
  assert.notEqual(direct.code, 0);
  assert.match(direct.stderr, /23P01/);
  console.log('PASS: PostgreSQL GiST exclusion rejects direct overlapping inserts');
} finally {
  await ok(`delete from public.agendamento_eventos where agendamento_id in (select id from public.agendamentos where profissional_id='${professional}');
    delete from public.agendamentos where profissional_id='${professional}';
    delete from public.bloqueios where profissional_id='${professional}';
    delete from public.disponibilidade where profissional_id='${professional}';
    delete from public.servicos where profissional_id='${professional}';
    delete from public.profiles where id in ('${client1}','${client2}','${professional}');
    delete from auth.users where id in ('${client1}','${client2}','${professional}');`);
}

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cache = join(root, 'node_modules/.cache');
mkdirSync(cache, { recursive: true });
const output = mkdtempSync(join(cache, 'hubmi-submissions-tests-'));
for (const name of ['lib/supabase/config', 'lib/supabase/client', 'features/submissions/model', 'features/submissions/service', 'features/auth/return-path']) {
  const dest = join(output, name + '.js');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, ts.transpileModule(readFileSync(join(root, 'src', name + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
after(() => rmSync(output, { recursive: true, force: true }));
const require = createRequire(import.meta.url);
const model = require(join(output, 'features/submissions/model.js'));
const { createSubmissionsService } = require(join(output, 'features/submissions/service.js'));
const config = require(join(output, 'lib/supabase/config.js'));
const { safeReturnPath } = require(join(output, 'features/auth/return-path.js'));
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const draft = { ...model.EMPTY_DRAFT, title: ' Pomysł ', problem_description: ' Potrzeba ', solution_description: ' Rozwiązanie ', target_group: ' Odbiorcy ', implementation_stage: 'pomysl' };
const record = { ...model.submissionPayload(draft, id), user_id: owner, status: 'nowe', created_at: '2026-10-03T12:00:00Z' };
const innovation = { id: 'inv_01', title: 'Innowacja testowa', description: 'Opis', target_group: 'Odbiorcy', source_url: null };
test('powiązana innowacja zachowuje pochodzenie i oznaczenie demonstracyjności', () => {
  const result = model.parseInnovation({ ...innovation, is_demonstrative: true, source_label: 'Wzorzec demonstracyjny ROPS' });
  assert.equal(result.demonstrative, true);
  assert.equal(result.source_label, 'Wzorzec demonstracyjny ROPS');
  assert.equal(model.parseInnovation(innovation).demonstrative, false);
});
const ok = (data) => ({ data, error: null });
const err = (code) => ({ data: null, error: { code } });
function fixture(responses = [], user = owner) {
  const calls = [];
  const client = {
    auth: { getUser: async () => { calls.push({ auth: true }); return { data: { user: user ? { id: user } : null }, error: null }; } },
    from(table) {
      const call = { table, filters: [], orders: [] };
      const q = {
        select(columns) { call.columns = columns; return q; },
        eq(key, value) { call.filters.push([key, value]); return q; },
        limit(n) { call.limit = n; return q; },
        order(key, opts) { call.orders.push([key, opts]); return q; },
        insert(payload) { call.payload = payload; return q; },
        single() { call.single = true; return q; },
        maybeSingle() { call.maybeSingle = true; return q; },
        abortSignal(signal) { call.signal = signal; return q; },
        then(resolve, reject) {
          calls.push(call);
          const next = responses.shift();
          if (!next) return Promise.reject(new Error('Nieoczekiwane żądanie')).then(resolve, reject);
          return Promise.resolve(typeof next === 'function' ? next(call) : next).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return { calls, service: createSubmissionsService(client, true), client };
}
const kind = (expected) => (e) => { assert.equal(e.kind, expected); return true; };

test('walidacja wszystkich wymaganych pól, limitów i powiązań demo', () => {
  assert.equal(Object.keys(model.validateDraft(model.EMPTY_DRAFT)).length, 5);
  assert.deepEqual(model.validateDraft(draft), {});
  assert.ok(model.validateDraft({ ...draft, title: 'x'.repeat(161) }).title);
  assert.ok(model.validateDraft({ ...draft, matched_innovation_id: 'demo-1' }).matched_innovation_id);
  assert.ok(model.validateDraft({ ...draft, implementation_stage: 'admin' }).implementation_stage);
});
test('payload jest ścisłą listą pól bez właściciela, roli i statusu', () => {
  const payload = model.submissionPayload({ ...draft, user_id: other, status: 'zaakceptowane', role: 'admin', official_response: 'Tak' }, id);
  assert.deepEqual(payload, { id, title: 'Pomysł', problem_description: 'Potrzeba', solution_description: 'Rozwiązanie', target_group: 'Odbiorcy', implementation_stage: 'pomysl', institution_name: null, applicant_type: 'Nieokreślony', matched_innovation_id: null });
});
test('publiczny klucz akceptowany, service_role i secret odrzucane', () => {
  const jwt = (role) => `e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`;
  assert.equal(config.isPublicSupabaseKey(jwt('anon')), true);
  assert.equal(config.isPublicSupabaseKey(jwt('service_role')), false);
  assert.equal(config.isPublicSupabaseKey('sb_secret_test-fixture-only'), false);
  assert.equal(config.isPublicSupabaseKey('sb_publishable_test-fixture-only'), true);
});
test('wyłączona integracja nie odpytuje Auth ani bazy', async () => {
  const f = fixture();
  await assert.rejects(createSubmissionsService(f.client, false).create(draft, id), kind('configuration'));
  assert.deepEqual(f.calls, []);
});
test('brak sesji blokuje prywatne odczyty i zapis przed zapytaniem do bazy', async () => {
  const f = fixture([], null);
  await assert.rejects(f.service.list(), kind('auth'));
  await assert.rejects(f.service.create(draft, id), kind('auth'));
  assert.ok(f.calls.every((c) => c.auth));
});
test('brak kolumn zatrzymuje INSERT', async () => {
  const f = fixture([err('42703')]);
  await assert.rejects(f.service.create(draft, id), kind('schema'));
  assert.equal(f.calls.filter((c) => c.payload).length, 0);
});
test('zapis wymaga potwierdzonej treści i właściciela rekordu', async () => {
  const f = fixture([ok([]), ok(record)]);
  assert.deepEqual(await f.service.create(draft, id), record);
  assert.equal(f.calls.at(-1).payload.user_id, undefined);
  for (const row of [{ ...record, user_id: other }, { ...record, title: 'Inna treść' }, { ...record, created_at: 'błędna data' }]) {
    const bad = fixture([ok([]), ok(row)]);
    await assert.rejects(bad.service.create(draft, id));
  }
});
test('RLS i awaria sieci nie dają pozorowanego sukcesu', async () => {
  for (const [code, expected] of [['42501', 'access'], ['500', 'network']]) {
    const f = fixture([ok([]), err(code)]);
    await assert.rejects(f.service.create(draft, id), kind(expected));
    assert.equal(draft.title, ' Pomysł ');
  }
});
test('lista i szczegóły filtrują po potwierdzonym właścicielu', async () => {
  const f = fixture([ok([]), ok([record]), ok([]), ok(record)]);
  assert.deepEqual(await f.service.list(), [record]);
  assert.deepEqual(await f.service.get(id), record);
  for (const call of f.calls.filter((c) => c.table)) assert.ok(call.filters.some(([k, v]) => k === 'user_id' && v === owner));
  assert.ok(f.calls.at(-1).filters.some(([k, v]) => k === 'id' && v === id));
});
test('cudzy rekord lub brak rekordu nie ujawnia prywatnej fiszki', async () => {
  await assert.rejects(fixture([ok([]), ok({ ...record, user_id: other })]).service.get(id), kind('access'));
  await assert.rejects(fixture([ok([]), ok(null)]).service.get(id), kind('not_found'));
  await assert.rejects(fixture([ok([]), ok([{ ...record, user_id: other }])]).service.list(), kind('access'));
});
test('powiązanie odczytuje rzeczywistą innowację przed INSERT', async () => {
  const linked = { ...draft, matched_innovation_id: innovation.id };
  const f = fixture([ok([]), ok(innovation), ok({ ...record, matched_innovation_id: innovation.id })]);
  await f.service.create(linked, id);
  assert.equal(f.calls[2].table, 'innovations');
  const missing = fixture([ok([]), ok(null)]);
  await assert.rejects(missing.service.create(linked, id), kind('not_found'));
  assert.ok(!missing.calls.some((c) => c.payload));
  const demo = fixture();
  await assert.rejects(demo.service.getInnovation('demo-example'), kind('validation'));
  assert.deepEqual(demo.calls, []);
});
test('retry konfliktu UUID potwierdza własny rekord o dokładnie tej samej treści', async () => {
  const f = fixture([ok([]), err('23505'), ok(record)]);
  assert.deepEqual(await f.service.create(draft, id), record);
  const bad = fixture([ok([]), err('23505'), ok({ ...record, solution_description: 'Inne rozwiązanie' })]);
  await assert.rejects(bad.service.create(draft, id), kind('response'));
});
test('anulowane żądanie nie rozpoczyna prywatnych operacji', async () => {
  const f = fixture();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.service.create(draft, id, controller.signal), { name: 'AbortError' });
  assert.deepEqual(f.calls, []);
});
test('przekierowanie po logowaniu pozostaje we własnych dozwolonych stronach', () => {
  for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/admin']) assert.equal(safeReturnPath(path), '/moje-zgloszenia');
  assert.equal(safeReturnPath('/kreator?innowacja=inv_01'), '/kreator?innowacja=inv_01');
  assert.equal(safeReturnPath(`/moje-zgloszenia/${id}`), `/moje-zgloszenia/${id}`);
});
test('timeout obejmuje odczyt body w kliencie Supabase', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let start;
  const ready = new Promise((resolve) => { start = resolve; });
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => ({
    arrayBuffer: () => { start(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); },
  }));
  const rejection = assert.rejects(config.timedSupabaseFetch('https://test.invalid'), { name: 'TimeoutError' });
  await ready; t.mock.timers.tick(config.SUPABASE_TIMEOUT_MS); await rejection;
});

test('szczegóły i powiązanie odrzucają rekord o innym ID niż żądane', async () => {
  await assert.rejects(fixture([ok([]), ok({ ...record, id: other })]).service.get(id), kind('response'));
  await assert.rejects(fixture([ok({ ...innovation, id: 'inv_other' })]).service.getInnovation(innovation.id), kind('response'));
});

test('anonimowe konto Auth nie zapisuje ani nie odczytuje fiszek', async () => {
  const f = fixture();
  f.client.auth.getUser = async () => ({ data: { user: { id: owner, is_anonymous: true } }, error: null });
  await assert.rejects(f.service.create(draft, id), kind('auth'));
  await assert.rejects(f.service.list(), kind('auth'));
  assert.deepEqual(f.calls, []);
});

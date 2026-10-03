import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cache = join(root, 'node_modules/.cache'); mkdirSync(cache, { recursive: true });
const output = mkdtempSync(join(cache, 'hubmi-rops-list-tests-'));
const dest = join(output, 'list-monitor.cjs');
writeFileSync(dest, ts.transpileModule(readFileSync(join(root, 'src/features/rops/list-monitor.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText);
after(() => rmSync(output, { recursive: true, force: true }));
const { createListMonitor, ROPS_POLL_INTERVAL } = createRequire(import.meta.url)(dest);
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function fixture(load) {
  const timers = new Map(), states = []; let seq = 0, visible = true;
  const monitor = createListMonitor({ load, publish: s => states.push(s),
    describeError: e => ({ message: e.message, terminal: e.terminal === true }),
    schedule: (fn, delay) => { const id = ++seq; timers.set(id, { fn, delay }); return id; },
    cancel: id => timers.delete(id), now: () => '2026-10-03T19:00:00Z', isVisible: () => visible,
  });
  return { monitor, states, timers, last: () => states.at(-1), hide: () => { visible = false; },
    show: () => { visible = true; }, tick: async () => {
      assert.equal(timers.size, 1); const [id, timer] = [...timers][0]; timers.delete(id);
      assert.equal(timer.delay, ROPS_POLL_INTERVAL); timer.fn(); await flush();
    },
  };
}

test('pierwszy odczyt ustala bazę; kolejne oznaczają nowe ID i aktualizują status', async () => {
  let rows = [{ id: 'a', status: 'nowe' }]; const f = fixture(async () => rows);
  await f.monitor.refresh(); assert.deepEqual(f.last().newIds, []);
  rows = [{ id: 'b', status: 'nowe' }, { id: 'a', status: 'weryfikacja' }]; await f.tick();
  assert.deepEqual(f.last().newIds, ['b']); assert.equal(f.last().data[1].status, 'weryfikacja');
  rows = [...rows, { id: 'c' }]; await f.tick(); assert.deepEqual(f.last().newIds, ['b', 'c']);
  rows = [{ id: 'a' }, { id: 'c' }]; await f.tick(); assert.deepEqual(f.last().newIds, ['c']);
  f.monitor.stop(); assert.equal(f.timers.size, 0);
});
test('pusta poprawna lista też jest bazą do wykrywania nowych zgłoszeń', async () => {
  let rows = []; const f = fixture(async () => rows); await f.monitor.refresh();
  rows = [{ id: 'a' }]; await f.tick(); assert.deepEqual(f.last().newIds, ['a']); f.monitor.stop();
});
test('odczyt automatyczny i ręczny są szeregowe, zegar startuje po zakończeniu', async () => {
  let finish, calls = 0; const f = fixture(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const pending = f.monitor.refresh(); await flush();
  await Promise.all([f.monitor.refresh(), f.monitor.refresh()]); assert.equal(calls, 1); assert.equal(f.timers.size, 0);
  finish([{ id: 'a' }]); await pending; assert.equal(f.timers.size, 1);
  const second = f.monitor.refresh(); await flush(); assert.equal(calls, 2); assert.equal(f.timers.size, 0);
  finish([{ id: 'b' }]); await second; assert.equal(f.timers.size, 1); f.monitor.stop();
});
test('błąd sieci zachowuje dane i oznaczenia; kolejny odczyt usuwa błąd', async () => {
  let fail = false; const f = fixture(async () => { if (fail) throw new Error('Brak połączenia'); return [{ id: 'a' }]; });
  await f.monitor.refresh(); fail = true; await f.tick();
  assert.deepEqual(f.last().data, [{ id: 'a' }]); assert.equal(f.last().error, 'Brak połączenia');
  assert.equal(f.last().lastChecked, '2026-10-03T19:00:00Z'); assert.equal(f.timers.size, 1);
  fail = false; await f.tick(); assert.equal(f.last().error, null); f.monitor.stop();
});
test('odmowa dostępu lub wygaśnięcie sesji usuwa prywatne dane i wstrzymuje odpytywanie', async () => {
  let fail = false; const f = fixture(async () => { if (fail) throw Object.assign(new Error('Brak uprawnień'), { terminal: true }); return [{ id: 'a' }]; });
  await f.monitor.refresh(); fail = true; await f.tick();
  assert.equal(f.last().data, null); assert.deepEqual(f.last().newIds, []); assert.equal(f.last().paused, true); assert.equal(f.timers.size, 0);
  fail = false; await f.monitor.refresh(); assert.equal(f.last().paused, false); assert.equal(f.timers.size, 1); f.monitor.stop();
});
test('niewidoczny panel nie wysyła kolejnych żądań', async () => {
  let calls = 0; const f = fixture(async () => { calls++; return []; }); await f.monitor.refresh();
  f.hide(); await f.tick(); await f.tick(); assert.equal(calls, 1);
  f.show(); await f.tick(); assert.equal(calls, 2); f.monitor.stop();
});
test('opuszczenie panelu anuluje aktywny odczyt i ignoruje spóźnioną odpowiedź', async () => {
  let finish, signal; const f = fixture(s => { signal = s; return new Promise(resolve => { finish = resolve; }); });
  const pending = f.monitor.refresh(); await flush(); const before = f.states.length;
  f.monitor.stop(); assert.equal(signal.aborted, true); finish([{ id: 'late' }]); await pending;
  assert.equal(f.states.length, before); assert.equal(f.timers.size, 0); await f.monitor.refresh(); assert.equal(f.states.length, before);
});
test('odmontowanie przed rozpoczęciem odczytu nie uruchamia SDK (także replay efektu React)', async () => {
  let calls = 0; const f = fixture(async () => { calls++; return []; });
  const pending = f.monitor.refresh(); f.monitor.stop(); await pending; assert.equal(calls, 0); assert.equal(f.timers.size, 0);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/uuid.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const compiled = { exports: {} };
new Function('exports', outputText)(compiled.exports);
const { createRecordId } = compiled.exports;

test('UUID używa natywnego generatora, gdy jest dostępny', () => {
  const expected = '11111111-1111-4111-8111-111111111111';
  assert.equal(createRecordId({ randomUUID: () => expected }), expected);
});
test('UUID na HTTP bez randomUUID używa bezpiecznego losowania i wersji v4', () => {
  let called = false;
  const id = createRecordId({ getRandomValues: (bytes) => { called = true; bytes.fill(255); return bytes; } });
  assert.equal(called, true);
  assert.equal(id, 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('UUID bez bezpiecznego generatora odmawia, nie zastępuje go Math.random', () => {
  assert.throws(() => createRecordId({}), /bezpiecznego generowania/);
});

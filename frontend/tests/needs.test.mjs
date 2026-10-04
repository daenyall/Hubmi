import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Atrapa sesji testuje wyłącznie logikę frontendu; nie potwierdza zapisu w Supabase.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cache = join(root, "node_modules/.cache");
mkdirSync(cache, { recursive: true });
const output = mkdtempSync(join(cache, "hubmi-needs-tests-"));
for (const name of [
  "lib/matching", "lib/api", "lib/supabase/config", "lib/supabase/client",
  "features/submissions/model", "features/submissions/service", "features/rops/access",
  "features/rops/backend-session", "features/needs/model", "features/needs/service",
]) {
  const dest = join(output, `${name}.js`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, ts.transpileModule(readFileSync(join(root, "src", `${name}.ts`), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
after(() => rmSync(output, { recursive: true, force: true }));
const require = createRequire(import.meta.url);
const model = require(join(output, "features/needs/model.js"));
const { createNeedsService } = require(join(output, "features/needs/service.js"));

const draft = {
  ...model.EMPTY_NEED, institution_name: "Gmina Testowa (rekord testowy)", powiat: "tarnowski",
  category: "Seniorzy", target_group: "Osoby 75+", problem_summary: "Brak transportu do ośrodka zdrowia",
  detailed_description: "Seniorzy z przysiółków nie mają jak dojechać do lekarza.",
};
const row = (over = {}) => ({
  id: "n-1", user_id: null, created_at: "2026-10-04T10:00:00+00:00", updated_at: null,
  institution_name: "Gmina", institution_type: "JST", powiat: "tarnowski", gmina: null, contact_email: null, contact_phone: null,
  category: "Seniorzy", target_group: "Osoby 75+", problem_summary: "P", detailed_description: "Opis dłuższy",
  estimated_affected_count: 0, urgency_level: "sredni", status: "nowe", rops_internal_notes: null, reviewed_at: null, ...over,
});
function fakeSession(handler) {
  const calls = [];
  return { calls, call: async (path, init, mode) => { calls.push({ path, init, mode }); return handler(path, init, mode); } };
}

test("walidacja potrzeby: wymagane pola, lista powiatów, liczba osób i email", () => {
  const errors = model.validateNeed(model.EMPTY_NEED);
  for (const key of ["problem_summary", "detailed_description", "category", "target_group", "institution_name", "powiat"]) assert.ok(errors[key], key);
  assert.deepEqual(model.validateNeed(draft), {});
  assert.ok(model.validateNeed({ ...draft, powiat: "Tarnowski " }).powiat, "powiat spoza listy rozbiłby agregację");
  assert.ok(model.validateNeed({ ...draft, estimated_affected_count: "-3" }).estimated_affected_count);
  assert.ok(model.validateNeed({ ...draft, estimated_affected_count: "2000000" }).estimated_affected_count);
  assert.ok(model.validateNeed({ ...draft, contact_email: "zly" }).contact_email);
  assert.deepEqual(model.validateNeed({ ...draft, contact_email: "a@b.pl", estimated_affected_count: "120" }), {});
});

test("payload pomija puste pola opcjonalne i nie wysyła statusu ani honeypota", () => {
  const payload = model.needPayload({ ...draft, gmina: "  ", estimated_affected_count: "" });
  assert.equal(payload.gmina, undefined);
  assert.equal(payload.estimated_affected_count, 0);
  assert.equal("status" in payload, false);
  assert.equal("hp_website" in payload, false);
});

test("pojedyncze zgłoszenie nie jest trendem; kierunek dopiero od progu", () => {
  assert.match(model.describeChange(1, 0).direction, /Za mało zgłoszeń \(1\)/);
  assert.equal(model.describeChange(1, 0).difference, "+1");
  assert.match(model.describeChange(3, 1).direction, /Za mało/);
  assert.equal(model.describeChange(4, 1).direction, "Więcej zgłoszeń o 300%");
  assert.equal(model.describeChange(0, 5).direction, "Mniej zgłoszeń o 100%");
  assert.equal(model.describeChange(3, 3).direction, "Bez zmian");
  assert.match(model.describeChange(5, 0).direction, /w poprzednim okresie nie było/);
});

test("porównanie okresów nie przejmuje etykiety trendu z backendu", () => {
  const parsed = model.parseTrends({
    period_days: 30, total_growth_percentage: 100,
    current_period: { start: "2026-09-04T00:00:00+00:00", end: "2026-10-04T00:00:00+00:00", total: 1 },
    previous_period: { start: "2026-08-05T00:00:00+00:00", end: "2026-09-04T00:00:00+00:00", total: 0 },
    category_trends: [{ name: "Seniorzy", current_count: 1, previous_count: 0, growth_percentage: 100, trend: "wzrostowy" }],
    powiat_trends: [], emerging_hotspots: [],
  });
  assert.deepEqual(parsed.categories[0], { name: "Seniorzy", current: 1, previous: 0 });
  assert.equal(JSON.stringify(parsed).includes("wzrostowy"), false);
  assert.throws(() => model.parseTrends({ period_days: 30, current_period: {}, previous_period: {}, category_trends: [], powiat_trends: [] }));
});

test("zestawienie: parsowanie kategorii, powiatów i skupisk", () => {
  const s = model.parseSummary({
    total_needs_reported: 2, filtered_period_days: null,
    needs_by_status: { nowe: 2 }, needs_by_urgency: { sredni: 2 },
    top_categories: [{ category: "Seniorzy", count: 2, percentage: 100 }],
    top_powiats: [{ powiat: "tarnowski", count: 2, percentage: 100 }],
    emerging_hotspots: [{ theme: "x", category: "Seniorzy", powiat: "tarnowski", reported_count: 2, urgency_level: "sredni", recommended_action: "R" }],
  });
  assert.equal(s.categories[0].name, "Seniorzy");
  assert.equal(s.clusters[0].reported_count, 2);
  assert.ok(s.clusters[0].reported_count < model.MIN_CLUSTER_SIZE, "2 zgłoszenia nie tworzą skupiska w widoku");
});

test("gość: zapis bez tokenu, bez twierdzenia o odczycie z konta", async () => {
  const session = fakeSession(() => ({ ok: true, status: 201, data: { id: "n-1", status: "nowe", message: "ok" }, authenticated: false }));
  const result = await createNeedsService(session).submit(draft);
  assert.equal(result.onAccount, null);
  assert.equal(session.calls.length, 1);
  assert.equal(session.calls[0].mode, "optional");
  assert.equal(session.calls[0].init.body.status, undefined);
});

test("zalogowany: potwierdzenie przez ponowny odczyt /api/needs/my", async () => {
  const session = fakeSession((path) => path === "/api/needs"
    ? { ok: true, status: 201, data: { id: "n-1", status: "nowe", message: "ok" }, authenticated: true }
    : { ok: true, status: 200, data: [row()], authenticated: true });
  assert.equal((await createNeedsService(session).submit(draft)).onAccount, true);
  const missing = fakeSession((path) => path === "/api/needs"
    ? { ok: true, status: 201, data: { id: "n-2", status: "nowe" }, authenticated: true }
    : { ok: true, status: 200, data: [row()], authenticated: true });
  assert.equal((await createNeedsService(missing).submit(draft)).onAccount, false);
});

test("błędy zapisu: treść 400 z backendu i informacja o zachowanej treści", async () => {
  const bad = fakeSession(() => ({ ok: false, status: 400, data: { detail: "Nieprawidłowe zgłoszenie." }, authenticated: false }));
  await assert.rejects(createNeedsService(bad).submit(draft), /Nieprawidłowe zgłoszenie\. Wpisana treść pozostała/);
  const down = fakeSession(() => ({ ok: false, status: 500, data: null, authenticated: false }));
  await assert.rejects(createNeedsService(down).submit(draft), /pozostała w formularzu/);
  const noId = fakeSession(() => ({ ok: true, status: 201, data: { status: "nowe" }, authenticated: false }));
  await assert.rejects(createNeedsService(noId).submit(draft), /nie potwierdzamy zapisu/);
  const invalid = fakeSession(() => { throw new Error("nie powinno wywołać"); });
  await assert.rejects(createNeedsService(invalid).submit(model.EMPTY_NEED), /Popraw zaznaczone pola/);
});

test("panel ROPS: tryb rops, filtry w adresie, 403 jako brak uprawnień", async () => {
  const session = fakeSession(() => ({ ok: true, status: 200, data: [row()], authenticated: true }));
  await createNeedsService(session).list({ powiat: "tarnowski", status: "nowe", search: "  " });
  assert.equal(session.calls[0].mode, "rops");
  assert.equal(session.calls[0].path, "/api/admin/needs?powiat=tarnowski&status=nowe&limit=100");
  const denied = fakeSession(() => ({ ok: false, status: 403, data: null, authenticated: true }));
  await assert.rejects(createNeedsService(denied).summary({}), /nie ma uprawnień/);
});

test("zmiana statusu potwierdzona tylko zwróconym rekordem z nowym statusem", async () => {
  const ok = fakeSession(() => ({ ok: true, status: 200, data: row({ status: "analizowane" }), authenticated: true }));
  assert.equal((await createNeedsService(ok).updateStatus("n-1", "analizowane", " notatka ")).status, "analizowane");
  assert.deepEqual(ok.calls[0].init.body, { status: "analizowane", rops_internal_notes: "notatka" });
  const stale = fakeSession(() => ({ ok: true, status: 200, data: row({ status: "nowe" }), authenticated: true }));
  await assert.rejects(createNeedsService(stale).updateStatus("n-1", "analizowane", ""), /inny stan/);
  await assert.rejects(createNeedsService(ok).updateStatus("n-1", "dowolny", ""), /Wybierz status/);
});

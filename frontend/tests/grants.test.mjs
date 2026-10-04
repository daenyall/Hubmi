import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Atrapa sesji testuje logikę frontendu; nie potwierdza zapisu w Supabase.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cache = join(root, "node_modules/.cache");
mkdirSync(cache, { recursive: true });
const output = mkdtempSync(join(cache, "hubmi-grants-tests-"));
for (const name of [
  "lib/matching", "lib/api", "lib/supabase/config", "lib/supabase/client",
  "features/submissions/model", "features/submissions/service", "features/rops/access",
  "features/rops/backend-session", "features/grants/model", "features/grants/service",
]) {
  const dest = join(output, `${name}.js`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, ts.transpileModule(readFileSync(join(root, "src", `${name}.ts`), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
after(() => rmSync(output, { recursive: true, force: true }));
const require = createRequire(import.meta.url);
const m = require(join(output, "features/grants/model.js"));
const { createGrantService, GrantValidationError } = require(join(output, "features/grants/service.js"));

const CALL = { max_grant_amount: 100000 };
function complete() {
  const d = m.emptyDraft();
  d.title = "Rekord testowy";
  d.person = { first_name: "Anna", last_name: "Test", email: "a@test.pl", phone: "", address: { street: "", postal_code: "", city: "" } };
  for (const [k, , min] of m.TEXT_SECTIONS) d.texts[k] = "x".repeat(min);
  d.prep = [{ action_name: "Rekrutacja", schedule: "m. 1", cost: "10 000", phase: "" }];
  d.test = [{ action_name: "Pilotaż", schedule: "m. 2-5", cost: "5000,50", phase: "pilotaż" }];
  d.grant_amount = "15000,5";
  for (const [k] of m.DECLARATIONS) d.declarations[k] = true;
  return d;
}
const row = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", call_id: "c1", call_name: "Nabór", call_status: "demonstracyjny", user_id: "u1", status: "roboczy",
  applicant_type: "osoba_fizyczna", title: "Rekord testowy", applicant_data: {}, innovation_description: "", innovativeness: "", problem_diagnosis: "",
  target_group_description: "", expected_change: "", future_vision: "", action_plan: { prep_period: [], test_period: [] }, grant_amount: 15000.5,
  total_costs_calculated: 0, is_budget_balanced: false, project_team: "", declarations: {}, submitted_at: null, rops_notes: null, created_at: null, updated_at: null, ...over,
});
function fake(handler) {
  const calls = [];
  return { calls, call: async (path, init, mode) => { calls.push({ path, init, mode }); return handler(path, init, mode); } };
}

test("kwoty w polskim zapisie i suma planu", () => {
  assert.equal(m.parseAmount("45 000,50"), 45000.5);
  assert.equal(m.parseAmount(""), 0);
  assert.ok(Number.isNaN(m.parseAmount("abc")));
  assert.ok(Number.isNaN(m.parseAmount("1,234")));
  assert.equal(m.planTotal(complete()), 15000.5);
});

test("kompletność odzwierciedla reguły backendu (pkt 1–12)", () => {
  const errors = m.submitErrors(m.emptyDraft(), CALL);
  for (const p of ["Pkt 1", "Pkt 2", "3. Opis", "4. Innowacyjność", "11. Zespół", "Pkt 10", "Pkt 12"]) assert.ok(errors.some((e) => e.includes(p)), p);
  assert.deepEqual(m.submitErrors(complete(), CALL), []);
  const mismatch = { ...complete(), grant_amount: "16000" };
  assert.ok(m.submitErrors(mismatch, CALL).some((e) => e.includes("różni się")));
  assert.ok(m.submitErrors(complete(), { max_grant_amount: 1000 }).some((e) => e.includes("przekracza limit")));
  const entity = { ...complete(), applicant_type: "podmiot" };
  entity.entity = { ...entity.entity, organization_name: "Fundacja", email: "f@test.pl" };
  assert.ok(m.submitErrors(entity, CALL).some((e) => e.includes("NIP lub KRS")));
});

test("oświadczenia: all_confirmed tylko gdy każde zaznaczono osobno", () => {
  const d = complete();
  assert.equal(m.draftPayload(d).declarations.all_confirmed, true);
  d.declarations.gdpr = false;
  const p = m.draftPayload(d);
  assert.equal(p.declarations.all_confirmed, false);
  assert.equal(p.declarations.criminal_liability, true);
  assert.ok(m.submitErrors(d, CALL).some((e) => e.includes("Pkt 12")));
  assert.equal(m.draftPayload(m.emptyDraft()).declarations.all_confirmed, false);
});

test("zapis i odczyt szkicu: dane wnioskodawcy tylko dla wybranego typu", () => {
  const d = complete();
  const p = m.draftPayload(d);
  assert.deepEqual(Object.keys(p.applicant_data).sort(), ["address", "email", "first_name", "last_name", "phone"]);
  assert.equal(p.grant_amount, 15000.5);
  assert.deepEqual(p.action_plan.test_period[0], { action_name: "Pilotaż", schedule: "m. 2-5", cost: 5000.5, phase: "pilotaż" });
  assert.equal("phase" in p.action_plan.prep_period[0], false);
  const back = m.draftFromApplication(m.parseApplication(row({ ...p, applicant_data: p.applicant_data, action_plan: p.action_plan, declarations: p.declarations })));
  assert.equal(back.person.first_name, "Anna");
  assert.equal(back.grant_amount, "15000,5");
  assert.equal(back.test[0].cost, "5000,5");
  assert.equal(back.declarations.gdpr, true);
  const group = { ...m.emptyDraft(), applicant_type: "grupa_nieformalna", group: { partners: "Jan\n\n Ewa ", representative: "Jan", representative_email: "" } };
  assert.deepEqual(m.draftPayload(group).applicant_data.partners, [{ name: "Jan" }, { name: "Ewa" }]);
});

test("błędy formatu blokują zapis roboczy", () => {
  assert.deepEqual(m.saveErrors(complete()), []);
  assert.ok(m.saveErrors({ ...complete(), grant_amount: "dużo" }).length);
});

test("422 z backendu: lista punktów; 400: tekst", () => {
  assert.deepEqual(m.submitDetail({ detail: { message: "x", errors: ["Pkt 1: a", "Pkt 12: b"] } }), ["Pkt 1: a", "Pkt 12: b"]);
  assert.deepEqual(m.submitDetail({ detail: "Nabór zamknięty." }), ["Nabór zamknięty."]);
});

test("eksport demonstracyjny dostaje zastrzeżenie, otwarty nie", () => {
  const exp = { text: "ZAŁĄCZNIK NR 3" };
  assert.match(m.exportFileText(exp, "demonstracyjny"), /^UWAGA: WERSJA DEMONSTRACYJNA/);
  assert.equal(m.exportFileText(exp, "otwarty"), "ZAŁĄCZNIK NR 3");
});

test("serwis: utworzenie i zapis potwierdzone ponownym odczytem", async () => {
  const s = fake((path, init) => init.method === "POST" ? { ok: true, status: 201, data: row({ call_id: "c1" }), authenticated: true } : { ok: true, status: 200, data: row({ call_id: "c1" }), authenticated: true });
  await createGrantService(s).create("c1");
  assert.deepEqual(s.calls.map((c) => c.init.method), ["POST", "GET"]);
  assert.equal(s.calls[0].mode, "user");

  const d = complete();
  const ok = fake(() => ({ ok: true, status: 200, data: row({ title: "Rekord testowy", grant_amount: 15000.5 }), authenticated: true }));
  await createGrantService(ok).save("id", d);
  assert.equal(ok.calls[0].init.method, "PUT");
  assert.equal(ok.calls[0].init.body.declarations.all_confirmed, true);
  const stale = fake((p, init) => ({ ok: true, status: 200, data: row({ title: init.method === "PUT" ? "Rekord testowy" : "Inny" }), authenticated: true }));
  await assert.rejects(createGrantService(stale).save("id", d), /nie potwierdził zapisu/);
  await assert.rejects(createGrantService(ok).save("id", { ...d, grant_amount: "x" }), (e) => e instanceof GrantValidationError);
});

test("serwis: złożenie z błędami 422, nabór zamknięty (400) i brak dostępu (403)", async () => {
  const invalid = fake(() => ({ ok: false, status: 422, data: { detail: { message: "m", errors: ["Pkt 12: oświadczenia"] } }, authenticated: true }));
  await assert.rejects(createGrantService(invalid).submit("id"), (e) => e instanceof GrantValidationError && e.errors[0] === "Pkt 12: oświadczenia");
  const closed = fake(() => ({ ok: false, status: 400, data: { detail: "Nabór jest zamknięty." }, authenticated: true }));
  await assert.rejects(createGrantService(closed).submit("id"), /Nabór jest zamknięty/);
  const denied = fake(() => ({ ok: false, status: 403, data: { detail: "Nie możesz wyświetlić wniosku innego autora." }, authenticated: true }));
  await assert.rejects(createGrantService(denied).get("id"), (e) => e.kind === "access" && /innego autora/.test(e.message));
  const ghost = fake((p, init) => init.method === "POST" ? { ok: true, status: 200, data: row(), authenticated: true } : { ok: true, status: 200, data: row({ status: "roboczy" }), authenticated: true });
  await assert.rejects(createGrantService(ghost).submit("id"), /nie potwierdził złożenia/);
  const ok = fake(() => ({ ok: true, status: 200, data: row({ status: "zlozony", submitted_at: "2026-10-04T10:00:00Z" }), authenticated: true }));
  assert.equal((await createGrantService(ok).submit("id")).status, "zlozony");
});

test("ROPS: lista w trybie rops z filtrami", async () => {
  const s = fake(() => ({ ok: true, status: 200, data: [row({ status: "zlozony" })], authenticated: true }));
  await createGrantService(s).adminList({ status: "zlozony", call_id: "c1" });
  assert.equal(s.calls[0].mode, "rops");
  assert.equal(s.calls[0].path, "/api/admin/grant-applications?limit=100&call_id=c1&status=zlozony");
});

test("awaria sieci przy zapisie mówi, że treść została w formularzu", async () => {
  const { BackendApiError } = require(join(output, "lib/api.js"));
  const down = { call: async () => { throw new BackendApiError("network", "Nie udało się połączyć z usługą."); } };
  await assert.rejects(createGrantService(down).save("id", complete()), /Nie udało się połączyć z usługą\. Wpisana treść pozostała w formularzu\./);
  await assert.rejects(createGrantService(down).submit("id"), /pozostała w formularzu/);
});

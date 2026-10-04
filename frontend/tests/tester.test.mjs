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
const output = mkdtempSync(join(cache, "hubmi-tester-tests-"));
for (const name of [
  "lib/matching", "lib/api", "lib/supabase/config", "lib/supabase/client",
  "features/submissions/model", "features/submissions/service", "features/rops/access",
  "features/rops/backend-session", "features/tester/model", "features/tester/service",
]) {
  const dest = join(output, `${name}.js`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, ts.transpileModule(readFileSync(join(root, "src", `${name}.ts`), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
after(() => rmSync(output, { recursive: true, force: true }));
const require = createRequire(import.meta.url);
const model = require(join(output, "features/tester/model.js"));
const { createTesterService } = require(join(output, "features/tester/service.js"));

const APP_ID = "11111111-2222-4333-8444-555555555555";
const appDraft = { ...model.emptyApplication("inv_01"), institution_name: "Gmina Testowa", contact_person: "Jan Test", contact_email: "test@example.org", target_audience_count: "20" };
const fbDraft = { ...model.emptyFeedback("inv_01"), rating_usability: "4", rating_effectiveness: "5", rating_accessibility: "3", would_recommend: "tak", author_name: "Gmina Testowa" };
const appRow = (over = {}) => ({ id: APP_ID, innovation_id: "inv_01", tester_type: "JST", institution_name: "Gmina Testowa", contact_person: "Jan Test", contact_email: "test@example.org", contact_phone: null, testing_scope: "pilotaz_3m", target_audience_count: 20, status: "nowe", notes: null, rops_notes: null, created_at: "2026-10-04T10:00:00+00:00", updated_at: null, ...over });
const fbRow = (over = {}) => ({ id: "f-1", innovation_id: "inv_01", application_id: null, rating_usability: 4, rating_effectiveness: 5, rating_accessibility: 3, average_score: 4, pros: null, cons_and_barriers: null, suggested_improvements: null, would_recommend: true, author_name: "Gmina Testowa", created_at: null, ...over });
const summary = (recent, total = recent.length) => ({ innovation_id: "inv_01", total_reviews: total, avg_usability: 4, avg_effectiveness: 5, avg_accessibility: 3, overall_rating: 4, recommendation_percentage: 100, recent_reviews: recent });
function fakeSession(handler) {
  const calls = [];
  return { calls, call: async (path, init, mode) => { calls.push({ path, init, mode }); return handler(path, init, mode); } };
}

test("walidacja zgłoszenia i opinii", () => {
  const e = model.validateApplication(model.emptyApplication(""));
  for (const k of ["innovation_id", "institution_name", "contact_person", "contact_email", "target_audience_count"]) assert.ok(e[k], k);
  assert.deepEqual(model.validateApplication(appDraft), {});
  const f = model.validateFeedback(model.emptyFeedback("inv_01"));
  for (const k of ["rating_usability", "rating_effectiveness", "rating_accessibility", "would_recommend", "author_name"]) assert.ok(f[k], k);
  assert.deepEqual(model.validateFeedback(fbDraft), {});
  assert.ok(model.validateFeedback({ ...fbDraft, rating_usability: "6" }).rating_usability);
  assert.ok(model.validateFeedback({ ...fbDraft, application_id: "abc" }).application_id);
});

test("payload opinii nie zawiera statusu pilotażu", () => {
  const p = model.feedbackPayload({ ...fbDraft, application_id: APP_ID });
  assert.equal(p.would_recommend, true);
  assert.equal(p.rating_effectiveness, 5);
  assert.equal("status" in p, false);
});

test("brak opinii nie jest pokazywany jako średnia 0/5", () => {
  const empty = model.parseFeedbackSummary({ ...summary([]), avg_usability: 0, overall_rating: 0, recommendation_percentage: 0 });
  assert.equal(model.ratingLines(empty), null);
  assert.equal(model.ratingLines(model.parseFeedbackSummary(summary([fbRow()]))).length, 5);
});

test("opinia: zapis potwierdzony ponownym odczytem ocen; jedyne żądanie zapisu to POST feedback", async () => {
  const session = fakeSession((path) => path === "/api/testing/feedback"
    ? { ok: true, status: 201, data: fbRow(), authenticated: false }
    : { ok: true, status: 200, data: summary([fbRow()]), authenticated: false });
  const r = await createTesterService(session).feedback(fbDraft);
  assert.equal(r.confirmed, true);
  assert.deepEqual(session.calls.map((c) => c.init.method), ["POST", "GET"]);
  assert.equal(session.calls.some((c) => c.path.includes("/applications")), false, "opinia nie dotyka statusu zgłoszenia");
  const absent = fakeSession((path) => path === "/api/testing/feedback"
    ? { ok: true, status: 201, data: fbRow({ id: "f-2" }), authenticated: false }
    : { ok: true, status: 200, data: summary([fbRow()]), authenticated: false });
  assert.equal((await createTesterService(absent).feedback(fbDraft)).confirmed, false);
  const many = fakeSession((path) => path === "/api/testing/feedback"
    ? { ok: true, status: 201, data: fbRow({ id: "f-2" }), authenticated: false }
    : { ok: true, status: 200, data: summary([fbRow()], 25), authenticated: false });
  assert.equal((await createTesterService(many).feedback(fbDraft)).confirmed, null);
});

test("błąd 400 z backendu pokazuje przyczynę i informację o zachowanej treści", async () => {
  const bad = fakeSession(() => ({ ok: false, status: 400, data: { detail: "Wskazane zgłoszenie pilotażowe nie dotyczy ocenianej innowacji." }, authenticated: false }));
  await assert.rejects(createTesterService(bad).feedback(fbDraft), /nie dotyczy ocenianej innowacji\. Wpisana treść pozostała/);
  const down = fakeSession(() => ({ ok: false, status: 503, data: null, authenticated: false }));
  await assert.rejects(createTesterService(down).apply(appDraft), /pozostała w formularzu/);
});

test("zgłoszenie: zwrócony rekord innej innowacji nie jest potwierdzeniem", async () => {
  const ok = fakeSession(() => ({ ok: true, status: 201, data: appRow(), authenticated: false }));
  assert.equal((await createTesterService(ok).apply(appDraft)).id, APP_ID);
  assert.equal(ok.calls[0].init.body.target_audience_count, 20);
  const other = fakeSession(() => ({ ok: true, status: 201, data: appRow({ innovation_id: "inv_99" }), authenticated: false }));
  await assert.rejects(createTesterService(other).apply(appDraft), /innej innowacji/);
});

test("ROPS: lista w trybie rops, status tylko z listy i potwierdzony ponownym odczytem", async () => {
  const list = fakeSession(() => ({ ok: true, status: 200, data: [appRow()], authenticated: true }));
  await createTesterService(list).applications({ status: "nowe" });
  assert.equal(list.calls[0].mode, "rops");
  assert.equal(list.calls[0].path, "/api/testing/applications?limit=100&status=nowe");
  const upd = fakeSession(() => ({ ok: true, status: 200, data: appRow({ status: "w_trakcie" }), authenticated: true }));
  assert.equal((await createTesterService(upd).updateStatus(appRow(), "w_trakcie", undefined)).status, "w_trakcie");
  const stale = fakeSession((path, init) => init.method === "PATCH"
    ? { ok: true, status: 200, data: appRow({ status: "w_trakcie" }), authenticated: true }
    : { ok: true, status: 200, data: appRow({ status: "nowe" }), authenticated: true });
  await assert.rejects(createTesterService(stale).updateStatus(appRow(), "w_trakcie", undefined), /Ponowny odczyt pokazał status „Nowe”/);
  await assert.rejects(createTesterService(upd).updateStatus(appRow(), "zamkniete", undefined), /Wybierz status/);
  const denied = fakeSession(() => ({ ok: false, status: 403, data: null, authenticated: true }));
  await assert.rejects(createTesterService(denied).applications({}), /nie ma uprawnień/);
});

// ---------- rozdzielenie uwag zgłaszającego (notes) i notatki ROPS (rops_notes) ----------
const APPLICANT = "Uwagi zgłaszającego — rekord testowy";

test("parser czyta rops_notes osobno; null i brak pola dają null", () => {
  assert.equal(model.parseApplication(appRow({ notes: APPLICANT, rops_notes: "Notatka" })).rops_notes, "Notatka");
  assert.equal(model.parseApplication(appRow({ notes: APPLICANT, rops_notes: "Notatka" })).notes, APPLICANT);
  assert.equal(model.parseApplication(appRow({ rops_notes: null })).rops_notes, null);
  const legacy = appRow();
  delete legacy.rops_notes;
  assert.equal(model.parseApplication(legacy).rops_notes, null);
  assert.throws(() => model.parseApplication(appRow({ rops_notes: 7 })), /rops_notes/);
});

test("ropsNoteChange: brak zmiany, nowa treść i wyczyszczenie", () => {
  assert.equal(model.ropsNoteChange(null, ""), undefined);
  assert.equal(model.ropsNoteChange(null, "   "), undefined);
  assert.equal(model.ropsNoteChange("", ""), undefined);
  assert.equal(model.ropsNoteChange("Notatka", " Notatka "), undefined);
  assert.equal(model.ropsNoteChange(null, " Nowa "), "Nowa");
  assert.equal(model.ropsNoteChange("Stara", "Nowa"), "Nowa");
  assert.equal(model.ropsNoteChange("Stara", ""), "", "wyczyszczenie wysyła pustą wartość");
});

function patchSession(after) {
  return fakeSession((path, init) => ({ ok: true, status: 200, data: init.method === "PATCH" ? after : after, authenticated: true }));
}

test("sama zmiana statusu nie wysyła notes ani rops_notes", async () => {
  const s = patchSession(appRow({ notes: APPLICANT, status: "zaakceptowane" }));
  await createTesterService(s).updateStatus(appRow({ notes: APPLICANT }), "zaakceptowane", model.ropsNoteChange(null, ""));
  assert.deepEqual(s.calls[0].init.body, { status: "zaakceptowane" });
  assert.equal(s.calls[1].init.method, "GET", "zapis potwierdzony ponownym odczytem");
});

test("dodanie, zmiana i wyczyszczenie notatki wysyła tylko rops_notes", async () => {
  const add = patchSession(appRow({ notes: APPLICANT, rops_notes: "Pierwsza" }));
  await createTesterService(add).updateStatus(appRow({ notes: APPLICANT }), "nowe", model.ropsNoteChange(null, "Pierwsza"));
  assert.deepEqual(add.calls[0].init.body, { status: "nowe", rops_notes: "Pierwsza" });

  const edit = patchSession(appRow({ notes: APPLICANT, rops_notes: "Druga" }));
  await createTesterService(edit).updateStatus(appRow({ notes: APPLICANT, rops_notes: "Pierwsza" }), "nowe", model.ropsNoteChange("Pierwsza", "Druga"));
  assert.deepEqual(edit.calls[0].init.body, { status: "nowe", rops_notes: "Druga" });

  const clear = patchSession(appRow({ notes: APPLICANT, rops_notes: "" }));
  const cleared = await createTesterService(clear).updateStatus(appRow({ notes: APPLICANT, rops_notes: "Druga" }), "nowe", model.ropsNoteChange("Druga", ""));
  assert.deepEqual(clear.calls[0].init.body, { status: "nowe", rops_notes: "" });
  assert.equal(cleared.notes, APPLICANT);

  const clearNull = patchSession(appRow({ notes: APPLICANT, rops_notes: null }));
  await createTesterService(clearNull).updateStatus(appRow({ notes: APPLICANT, rops_notes: "Druga" }), "nowe", "");
  for (const s of [add, edit, clear, clearNull]) assert.equal("notes" in s.calls[0].init.body, false, "notes nigdy nie jest wysyłane");
});

test("odczyt po zapisie wykrywa zmienione uwagi zgłaszającego lub inną notatkę", async () => {
  const merged = patchSession(appRow({ notes: `${APPLICANT}\n\n[Notatka ROPS]: X`, rops_notes: "X" }));
  await assert.rejects(createTesterService(merged).updateStatus(appRow({ notes: APPLICANT }), "nowe", "X"), /zmienione uwagi zgłaszającego/);
  const other = patchSession(appRow({ notes: APPLICANT, rops_notes: "Stara" }));
  await assert.rejects(createTesterService(other).updateStatus(appRow({ notes: APPLICANT, rops_notes: "Stara" }), "nowe", "Nowa"), /inną notatkę ROPS/);
});

test("błąd zapisu statusu: 422 i 400 z przyczyną, bez potwierdzenia", async () => {
  const invalid = fakeSession(() => ({ ok: false, status: 422, data: { detail: [] }, authenticated: true }));
  await assert.rejects(createTesterService(invalid).updateStatus(appRow(), "nowe", undefined), /odrzuciła dane.*pozostała w formularzu/);
  assert.equal(invalid.calls.length, 1, "po błędzie nie ma odczytu potwierdzającego");
  const bad = fakeSession(() => ({ ok: false, status: 400, data: { detail: "Niedozwolony status." }, authenticated: true }));
  await assert.rejects(createTesterService(bad).updateStatus(appRow(), "nowe", undefined), /Niedozwolony status\. Wpisana treść/);
});

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cache = join(root, "node_modules/.cache");
mkdirSync(cache, { recursive: true });
const output = mkdtempSync(join(cache, "hubmi-knowledge-admin-tests-"));
const modules = [
  "lib/matching", "lib/api", "lib/supabase/config", "lib/supabase/client",
  "features/submissions/model", "features/submissions/service", "features/rops/access",
  "features/knowledge/admin-model", "features/knowledge/admin-service",
];
for (const name of modules) {
  const dest = join(output, `${name}.js`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, ts.transpileModule(readFileSync(join(root, "src", `${name}.ts`), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
after(() => rmSync(output, { recursive: true, force: true }));
const require = createRequire(import.meta.url);
const model = require(join(output, "features/knowledge/admin-model.js"));

const ROPS_UID = "22222222-2222-4222-8222-222222222222";
/** Wyłącznie dane testu HTTP; nie są rekordami ROPS. */
const draft = {
  title: "Rekord testowy etapu 4", description: "Opis testowy dłuższy niż dziesięć znaków.",
  target_group: "Pracownicy ROPS — rekord testowy", category: "Test",
  why_relevant: "", source_url: "", status: "nowa",
};
const row = (overrides = {}) => ({
  id: "inv_test01", title: draft.title, description: draft.description,
  target_group: draft.target_group, category: draft.category,
  why_relevant: null, source_url: null, status: "nowa", similarity_score: 1.0, ...overrides,
});

function service(t, { role = "rops_admin", uid = ROPS_UID, token = "test-token", anonymous = false, sessionError = null } = {}) {
  const key = "NEXT_PUBLIC_BACKEND_URL";
  const previous = process.env[key];
  process.env[key] = "http://localhost:8123///";
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  for (const name of ["lib/api.js", "features/knowledge/admin-service.js"]) delete require.cache[join(output, name)];
  const mod = require(join(output, "features/knowledge/admin-service.js"));
  const user = uid ? { id: uid, app_metadata: role ? { hubmi_role: role } : {}, is_anonymous: anonymous, email: "x@rops.krakow.pl" } : null;
  const client = { auth: {
    getUser: async () => ({ data: { user }, error: null }),
    getSession: async () => ({ data: { session: token ? { access_token: token } : null }, error: sessionError }),
  } };
  return { ...mod, api: mod.createKnowledgeAdminService(client) };
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function recorder(t, responses) {
  const calls = [];
  const queue = [...responses];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url: String(url), method: options?.method ?? "GET", headers: options?.headers ?? {}, body: options?.body });
    const next = queue.shift();
    if (!next) throw new Error(`Nieoczekiwane żądanie: ${options?.method} ${url}`);
    return next;
  });
  return calls;
}
const kind = (expected) => (error) => { assert.equal(error.name, "KnowledgeAdminError"); assert.equal(error.kind, expected); return true; };

test("model pomija similarity_score i normalizuje puste pola backendu", () => {
  const parsed = model.parseAdminInnovation(row({ why_relevant: null, source_url: undefined, category: "  Test  " }));
  assert.equal("similarity_score" in parsed, false);
  assert.equal(parsed.why_relevant, "");
  assert.equal(parsed.source_url, "");
  assert.equal(parsed.category, "Test");
  assert.throws(() => model.parseAdminInnovation({ title: "Bez id" }), /identyfikatora/);
  assert.throws(() => model.parseAdminInnovation({ id: "x" }), /nazwy/);
  assert.throws(() => model.parseAdminInnovation({ id: "x", title: "y", description: 7 }), /description/);
});

test("lista odrzuca nietablicę i powtórzone identyfikatory", () => {
  assert.deepEqual(model.parseAdminList([]), []);
  assert.throws(() => model.parseAdminList({}), /listy innowacji/);
  assert.throws(() => model.parseAdminList([row(), row()]), /Powtórzone/);
});

test("walidacja odwzorowuje granice schematów InnovationCreate/InnovationUpdate", () => {
  assert.deepEqual(model.validateDraft(draft), {});
  assert.match(model.validateDraft({ ...draft, title: "ab" }).title, /3 znaki/);
  assert.match(model.validateDraft({ ...draft, title: "a".repeat(201) }).title, /200/);
  assert.match(model.validateDraft({ ...draft, description: "krótki" }).description, /10 znaków/);
  assert.match(model.validateDraft({ ...draft, target_group: "xy" }).target_group, /3 znaki/);
  assert.match(model.validateDraft({ ...draft, category: "   " }).category, /kategorię/);
  assert.match(model.validateDraft({ ...draft, status: "opublikowane" }).status, /z listy/);
  assert.equal(model.validateDraft({ ...draft, source_url: "https://rops.krakow.pl/a" }).source_url, undefined);
  assert.match(model.validateDraft({ ...draft, source_url: "javascript:alert(1)" }).source_url, /http/);
  assert.match(model.validateDraft({ ...draft, source_url: "https://user:pass@rops.krakow.pl" }).source_url, /logowania/);
  assert.equal(model.firstInvalidField(model.validateDraft({ ...draft, title: "a", category: "" })), "title");
});

test("payload przycina pola, a porównanie nazywa niepotwierdzone wartości", () => {
  assert.deepEqual(model.draftPayload({ ...draft, title: "  Nazwa  " }).title, "Nazwa");
  const record = model.parseAdminInnovation(row());
  assert.deepEqual(model.mismatchedFields(record, model.draftPayload(draft)), []);
  assert.deepEqual(model.mismatchedFields(record, model.draftPayload({ ...draft, description: "Inny opis niż zapisany" })), ["Opis"]);
  assert.match(model.statusLabel("archiwalne"), /Status z bazy: archiwalne/);
  assert.equal(model.statusLabel("sprawdzone"), "Sprawdzone");
});

test("odczyt listy wysyła status/limit/offset i token sesji w nagłówku", async (t) => {
  const { api } = service(t);
  const calls = recorder(t, [json([row()])]);
  const rows = await api.list({ status: "nowa" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "inv_test01");
  const parsed = new URL(calls[0].url);
  assert.equal(parsed.origin + parsed.pathname, "http://localhost:8123/api/admin/innovations");
  assert.equal(parsed.searchParams.get("status"), "nowa");
  assert.equal(parsed.searchParams.get("limit"), "100");
  assert.equal(parsed.searchParams.get("offset"), "0");
  assert.equal(calls[0].headers.Authorization, "Bearer test-token");
  assert.equal(calls[0].method, "GET");
});

test("konto bez roli ROPS nie wysyła żądania do API", async (t) => {
  const { api } = service(t, { role: null });
  const calls = recorder(t, []);
  await assert.rejects(() => api.list(), kind("access"));
  assert.equal(calls.length, 0);
});

test("konto anonimowe i brak tokenu kończą się błędem sesji przed żądaniem", async (t) => {
  const anon = service(t, { anonymous: true });
  const calls = recorder(t, []);
  await assert.rejects(() => anon.api.list(), kind("auth"));
  const noToken = service(t, { token: null });
  await assert.rejects(() => noToken.api.list(), kind("auth"));
  assert.equal(calls.length, 0);
});

test("401, 403, 404 i 422 mają rozdzielone rodzaje błędów", async (t) => {
  const { api } = service(t);
  recorder(t, [json({ detail: "x" }, 401), json({ detail: "x" }, 403), json({ detail: "x" }, 404), json({ detail: "x" }, 422)]);
  await assert.rejects(() => api.list(), kind("auth"));
  await assert.rejects(() => api.list(), kind("access"));
  await assert.rejects(() => api.update("inv_test01", draft), kind("not_found"));
  await assert.rejects(() => api.create(draft), kind("validation"));
});

test("błąd zapisu zapowiada zachowanie treści formularza", async (t) => {
  const { api } = service(t);
  recorder(t, [json({ detail: "x" }, 500)]);
  await assert.rejects(() => api.create(draft), (error) => {
    assert.match(error.message, /pozostała w formularzu/);
    return true;
  });
});

test("niepoprawny formularz nie wysyła żądania do API", async (t) => {
  const { api } = service(t);
  const calls = recorder(t, []);
  await assert.rejects(() => api.create({ ...draft, description: "krótki" }), kind("validation"));
  assert.equal(calls.length, 0);
});

test("dodanie innowacji potwierdza zapis ponownym odczytem rekordu", async (t) => {
  const { api } = service(t);
  const calls = recorder(t, [json(row(), 201), json(row())]);
  const result = await api.create(draft);
  assert.equal(result.confirmed, true);
  assert.equal(result.record.id, "inv_test01");
  assert.equal(calls[0].method, "POST");
  assert.equal(JSON.parse(calls[0].body).status, "nowa");
  assert.equal("id" in JSON.parse(calls[0].body), false);
  assert.equal("similarity_score" in JSON.parse(calls[0].body), false);
  assert.equal(calls[1].method, "GET");
  assert.equal(new URL(calls[1].url).pathname, "/api/admin/innovations/inv_test01");
});

test("404 w ponownym odczycie nie jest raportowane jako sukces", async (t) => {
  const { api } = service(t);
  recorder(t, [json(row(), 201), json({ detail: "brak" }, 404)]);
  const result = await api.create(draft);
  assert.equal(result.confirmed, false);
  assert.match(result.note, /ponowny odczyt/i);
});

test("rozbieżność po ponownym odczycie wskazuje pole", async (t) => {
  const { api } = service(t);
  recorder(t, [json(row()), json(row({ description: "Inna treść zapisana w bazie" }))]);
  const result = await api.update("inv_test01", draft);
  assert.equal(result.confirmed, false);
  assert.match(result.note, /Opis/);
});

test("edycja wysyła PUT na identyfikator rekordu i potwierdza zapis", async (t) => {
  const { api } = service(t);
  const changed = { ...draft, description: "Zmieniony opis testowy etapu 4" };
  const calls = recorder(t, [json(row({ description: changed.description })), json(row({ description: changed.description }))]);
  const result = await api.update("inv_test01", changed);
  assert.equal(result.confirmed, true);
  assert.equal(calls[0].method, "PUT");
  assert.equal(new URL(calls[0].url).pathname, "/api/admin/innovations/inv_test01");
  assert.equal(JSON.parse(calls[0].body).description, changed.description);
});

test("publikacja potwierdza status sprawdzone, a inny status zgłasza jako niepotwierdzony", async (t) => {
  const ok = service(t);
  const calls = recorder(t, [json(row({ status: "sprawdzone" })), json(row({ status: "sprawdzone" }))]);
  const confirmed = await ok.api.publish("inv_test01");
  assert.equal(confirmed.confirmed, true);
  assert.equal(confirmed.record.status, "sprawdzone");
  assert.equal(new URL(calls[0].url).pathname, "/api/admin/innovations/inv_test01/publish");
  assert.equal(new URL(calls[1].url).pathname, "/api/admin/innovations/inv_test01");
  t.mock.restoreAll();
  const stuck = service(t);
  recorder(t, [json(row({ status: "sprawdzone" })), json(row({ status: "nowa" }))]);
  const result = await stuck.api.publish("inv_test01");
  assert.equal(result.confirmed, false);
  assert.match(result.note, /„nowa”/);
});

test("niepoprawny identyfikator nie trafia do ścieżki URL", async (t) => {
  const { api } = service(t);
  const calls = recorder(t, []);
  await assert.rejects(() => api.publish("../../admin"), kind("validation"));
  await assert.rejects(() => api.update("inv 01", draft), kind("validation"));
  assert.equal(calls.length, 0);
});

test("niepoprawna odpowiedź usługi nie jest raportowana jako zapis", async (t) => {
  const { api } = service(t);
  recorder(t, [json({ id: "", title: "" }, 201)]);
  await assert.rejects(() => api.create(draft), kind("response"));
});

test("potwierdzenie toleruje sklejanie spacji przez sanityzację backendu", () => {
  const typed = { ...draft, description: "Opis  z   podwójnymi\tspacjami i tabulatorem." };
  const stored = model.parseAdminInnovation(row({ description: "Opis z podwójnymi spacjami i tabulatorem." }));
  assert.deepEqual(model.mismatchedFields(stored, model.draftPayload(typed)), []);
  assert.equal(model.normalizeStored("  a \t b  "), "a b");
  // Usunięcie treści przez sanityzację nadal musi być zgłoszone jako niepotwierdzone.
  const strippedByBackend = model.parseAdminInnovation(row({ description: "Opis bez wstawki skryptu." }));
  assert.deepEqual(
    model.mismatchedFields(strippedByBackend, model.draftPayload({ ...draft, description: "Opis <script>alert(1)</script> ze wstawka." })),
    ["Opis"],
  );
});

test("identyfikator dłuższy niż 64 znaki jest odrzucany jak w is_valid_innovation_id", () => {
  assert.equal(model.isInnovationId("inv_72784057"), true);
  assert.equal(model.isInnovationId("a".repeat(64)), true);
  assert.equal(model.isInnovationId("a".repeat(65)), false);
  assert.equal(model.isInnovationId("inv/01"), false);
});

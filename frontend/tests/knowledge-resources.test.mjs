import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Zasoby pochodzą z trwałej tabeli knowledge_resources. Atrapa sesji testuje logikę, nie integrację.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cache = join(root, "node_modules", ".cache");
mkdirSync(cache, { recursive: true });
const output = mkdtempSync(join(cache, "hubmi-resources-tests-"));
for (const name of [
  "lib/matching", "lib/api", "lib/supabase/config", "lib/supabase/client",
  "features/submissions/model", "features/submissions/service", "features/rops/access", "features/rops/backend-session",
  "features/knowledge/resources", "features/knowledge/resource-model", "features/knowledge/resource-service",
]) {
  const dest = join(output, `${name}.js`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, ts.transpileModule(readFileSync(join(root, "src", `${name}.ts`), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
after(() => rmSync(output, { recursive: true, force: true }));
const require = createRequire(import.meta.url);
const { isSafeResourceUrl } = require(join(output, "features/knowledge/resources.js"));
const m = require(join(output, "features/knowledge/resource-model.js"));
const { createResourceAdminService } = require(join(output, "features/knowledge/resource-service.js"));

const row = (over = {}) => ({
  id: "res_test01", title: "Raport testowy", description: "Opis testowy dłuższy niż dziesięć znaków.", group_id: "raporty-diagnozy",
  group_title: "Raporty i diagnozy społeczne", kind: "Dokument PDF", url: "https://rops.krakow.pl/a.pdf", year: 2025,
  coverage_scope: "woj. małopolskie", caveat: null, status: "roboczy", verified_by: null, verified_at: null,
  published_by: null, published_at: null, created_at: "2026-10-04T10:00:00+00:00", updated_at: "2026-10-04T10:00:00+00:00", ...over,
});
const draft = () => ({ ...m.emptyResourceDraft(), title: "Raport testowy", description: "Opis testowy dłuższy niż dziesięć znaków.", url: "https://rops.krakow.pl/a.pdf", year: "2025", coverage_scope: "woj. małopolskie" });
function fake(handler) {
  const calls = [];
  return { calls, call: async (path, init, mode) => { calls.push({ path, init, mode }); return handler(path, init, mode); } };
}

test("isSafeResourceUrl odrzuca http, dane logowania i śmieci", () => {
  assert.equal(isSafeResourceUrl("http://rops.krakow.pl/a"), false);
  assert.equal(isSafeResourceUrl("https://user:pass@rops.krakow.pl/a"), false);
  assert.equal(isSafeResourceUrl("javascript:alert(1)"), false);
  assert.equal(isSafeResourceUrl("nie-adres"), false);
  assert.equal(isSafeResourceUrl(""), false);
  assert.equal(isSafeResourceUrl("https://rops.krakow.pl/badania-analizy-raporty/raporty-z-badan"), true);
});

test("widok publiczny pokazuje tylko opublikowane zasoby z bezpiecznym adresem", () => {
  const groups = m.parseGroups([{ id: "raporty-diagnozy", title: "Raporty", intro: "i", items: [
    row({ id: "a", status: "opublikowany" }), row({ id: "b", status: "roboczy" }), row({ id: "c", status: "zweryfikowany" }),
    row({ id: "d", status: "opublikowany", url: "http://rops.krakow.pl/x" }),
  ] }]);
  assert.deepEqual(groups[0].items.map((r) => r.id), ["a"]);
});

test("parser: rok musi być liczbą całkowitą, brak roku to null", () => {
  assert.equal(m.parseResource(row({ year: null })).year, null);
  assert.throws(() => m.parseResource(row({ year: "2025" })), /year/);
});

test("walidacja wymaga roku, zasięgu ze źródła i HTTPS", () => {
  const e = m.validateResource(m.emptyResourceDraft(), new Date("2026-10-04"));
  for (const k of ["title", "description", "url", "year", "coverage_scope"]) assert.ok(e[k], k);
  assert.deepEqual(m.validateResource(draft(), new Date("2026-10-04")), {});
  assert.ok(m.validateResource({ ...draft(), year: "2030" }, new Date("2026-10-04")).year, "rok z przyszłości");
  assert.ok(m.validateResource({ ...draft(), url: "http://rops.krakow.pl/a" }).url);
  assert.ok(m.validateResource({ ...draft(), coverage_scope: "cała Europa" }).coverage_scope);
});

test("zasięg ogólnopolski jest rozpoznawany, regionalny nie", () => {
  assert.equal(m.isNationalScope("ogólnopolski"), true);
  assert.equal(m.isNationalScope("regionalny i krajowy"), true);
  assert.equal(m.isNationalScope("woj. małopolskie"), false);
  assert.equal(m.isNationalScope(null), false);
});

test("treść zasobu nie zawiera statusu; puste zastrzeżenie to null", () => {
  const p = m.resourcePayload(draft());
  assert.equal("status" in p, false);
  assert.equal(p.year, 2025);
  assert.equal(p.caveat, null);
  assert.equal(p.group_title, "Raporty i diagnozy społeczne");
});

test("ROPS: nowy zasób to zawsze szkic, potwierdzony ponownym odczytem", async () => {
  const s = fake((path, init) => ({ ok: true, status: init.method === "POST" ? 201 : 200, data: row(), authenticated: true }));
  const r = await createResourceAdminService(s).create(draft());
  assert.equal(r.status, "roboczy");
  assert.equal("status" in s.calls[0].init.body, false);
  for (const audit of ["verified_at", "verified_by", "published_at", "published_by", "created_at", "updated_at"]) assert.equal(audit in s.calls[0].init.body, false);
  assert.equal(s.calls[0].mode, "rops");
  assert.deepEqual(s.calls.map((c) => c.init.method), ["POST", "GET"]);
  const published = fake(() => ({ ok: true, status: 201, data: row({ status: "opublikowany" }), authenticated: true }));
  await assert.rejects(createResourceAdminService(published).create(draft()), /nie potwierdził/);
});

test("ROPS: weryfikacja bez notatki, publikacja i wycofanie potwierdzone odczytem", async () => {
  const v = fake(() => ({ ok: true, status: 200, data: row({ status: "zweryfikowany", verified_by: "rops", verified_at: "2026-10-04T11:00:00Z" }), authenticated: true }));
  await createResourceAdminService(v).verify("res_test01");
  assert.deepEqual(v.calls[0].init.body, {}, "notatka trafiłaby do publicznego caveat");
  const pub = fake(() => ({ ok: true, status: 200, data: row({ status: "opublikowany" }), authenticated: true }));
  assert.equal((await createResourceAdminService(pub).publish("res_test01")).status, "opublikowany");
  const un = fake(() => ({ ok: true, status: 200, data: row({ status: "zweryfikowany" }), authenticated: true }));
  await createResourceAdminService(un).unpublish("res_test01");
  assert.deepEqual(un.calls[0].init, { method: "POST", body: undefined });
  assert.equal(un.calls[0].path, "/api/admin/knowledge-resources/res_test01/unpublish");
  assert.equal(v.calls[0].path, "/api/admin/knowledge-resources/res_test01/verify");
  assert.equal(pub.calls[0].path, "/api/admin/knowledge-resources/res_test01/publish");
  const stale = fake((p, init) => ({ ok: true, status: 200, data: row({ status: init.method === "GET" ? "roboczy" : "opublikowany" }), authenticated: true }));
  await assert.rejects(createResourceAdminService(stale).publish("res_test01"), /publikacji/);
});

test("ROPS: 403 dla autora, 422 z przyczyną i zachowaną treścią", async () => {
  const denied = fake(() => ({ ok: false, status: 403, data: null, authenticated: true }));
  await assert.rejects(createResourceAdminService(denied).list({}), /nie ma uprawnień/);
  const bad = fake(() => ({ ok: false, status: 422, data: { detail: "Nieprawidłowy adres URL." }, authenticated: true }));
  await assert.rejects(createResourceAdminService(bad).update("res_test01", draft()), /Nieprawidłowy adres URL\. Wpisana treść pozostała/);
});


test("edycja pokazuje cofnięcie do szkicu; potwierdza całą treść bez statusu i audytu", async () => {
  const changed = { ...draft(), description: "Zmieniona treść po formalnej weryfikacji." };
  const expected = row({ ...m.resourcePayload(changed), status: "roboczy", verified_at: null, published_at: null });
  const s = fake(() => ({ ok: true, status: 200, data: expected }));
  const r = await createResourceAdminService(s).update("res_test01", changed);
  assert.equal(r.status, "roboczy");
  assert.equal(r.verified_at, null);
  assert.deepEqual(s.calls[0].init.body, m.resourcePayload(changed));
  const stale = fake((p, init) => ({ ok: true, status: 200, data: init.method === "GET" ? row() : expected }));
  await assert.rejects(createResourceAdminService(stale).update("res_test01", changed), /nie potwierdził/);
  const wrong = fake(() => ({ ok: true, status: 200, data: row({ id: "inny" }) }));
  await assert.rejects(createResourceAdminService(wrong).verify("res_test01"), /inny zasób/);
});

test("usunięcie dotyczy ID i wymaga 404 z ponownego odczytu", async () => {
  const s = fake((p, init) => init.method === "DELETE"
    ? { ok: true, status: 200, data: { success: true, id: "res_test01" } }
    : { ok: false, status: 404, data: null });
  await createResourceAdminService(s).remove("res_test01");
  assert.deepEqual(s.calls.map((c) => [c.path, c.init.method, c.mode]), [
    ["/api/admin/knowledge-resources/res_test01", "DELETE", "rops"],
    ["/api/admin/knowledge-resources/res_test01", "GET", "rops"],
  ]);
  for (const result of [
    { ok: true, status: 200, data: row() },
    { ok: false, status: 503, data: null },
    { ok: false, status: 403, data: null },
  ]) {
    const bad = fake((p, init) => init.method === "DELETE" ? { ok: true, status: 200, data: { success: true, id: "res_test01" } } : result);
    await assert.rejects(createResourceAdminService(bad).remove("res_test01"));
  }
  const wrong = fake(() => ({ ok: true, status: 200, data: { success: true, id: "inny" } }));
  await assert.rejects(createResourceAdminService(wrong).remove("res_test01"), /wybranego zasobu/);
  assert.equal(wrong.calls.length, 1);
});


test("sam status zweryfikowany bez audytu nie potwierdza formalnej weryfikacji", async () => {
  const ghost = fake(() => ({ ok: true, status: 200, data: row({ status: "zweryfikowany" }) }));
  await assert.rejects(createResourceAdminService(ghost).verify("res_test01"), /nie potwierdził: weryfikacji/);
});

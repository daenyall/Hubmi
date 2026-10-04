import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cache = join(root, "node_modules", ".cache");
mkdirSync(cache, { recursive: true });
const output = mkdtempSync(join(cache, "hubmi-knowledge-tests-"));
for (const relative of ["lib/api", "lib/matching", "lib/mock-matching", "features/knowledge/model", "features/knowledge/service"]) {
  const target = join(output, `${relative}.js`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, ts.transpileModule(readFileSync(join(root, "src", `${relative}.ts`), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText);
}
after(() => rmSync(output, { recursive: true, force: true }));
const require = createRequire(import.meta.url);
const model = require(join(output, "features/knowledge/model.js"));
function client(t, mock = "false") {
  const keys = ["NEXT_PUBLIC_BACKEND_URL", "NEXT_PUBLIC_USE_MOCK_MATCHING"];
  const previous = keys.map((key) => process.env[key]);
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:8123///";
  process.env.NEXT_PUBLIC_USE_MOCK_MATCHING = mock;
  t.after(() => keys.forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key];
    else process.env[key] = previous[index];
  }));
  for (const path of ["lib/api.js", "features/knowledge/service.js"]) delete require.cache[join(output, path)];
  return { ...require(join(output, "lib/api.js")), ...require(join(output, "features/knowledge/service.js")) };
}
// Wyłącznie odpowiedzi HTTP testu; nie są danymi aplikacji ani źródłami ROPS.
const row = {
  id: "test-1", title: "Łączymy pokolenia", description: "Wspólny ogród mieszkańców",
  target_group: "Seniorzy i młodzież", category: "Integracja",
  source_url: "https://example.org/http-fixture", similarity_score: 1, status: "sprawdzone",
};
const json = (value) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
const kind = (expected, status) => (error) => {
  assert.equal(error.name, "BackendApiError"); assert.equal(error.kind, expected);
  if (status !== undefined) assert.equal(error.status, status);
  return true;
};
const abortingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener("abort", () => reject(signal.reason), { once: true });
});

test("GET korzysta z konfiguracji i category/limit/offset, także gdy matching używa demo", async (t) => {
  const api = client(t, "true");
  const spy = t.mock.method(globalThis, "fetch", async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, "http://localhost:8123/api/innovations");
    assert.deepEqual(Object.fromEntries(parsed.searchParams), { limit: "50", offset: "100", category: "Wsparcie & opieka" });
    assert.equal(options.method, "GET"); assert.equal(options.cache, "no-store");
    assert.deepEqual(options.headers, { Accept: "application/json" }); assert.equal(options.body, undefined);
    return json([row]);
  });
  const result = await api.fetchCatalogPage({ category: " Wsparcie & opieka ", offset: 100 });
  assert.equal(result[0].audience, row.target_group);
  assert.equal("similarity_score" in result[0], false); assert.equal("status" in result[0], false);
  assert.equal(spy.mock.callCount(), 1);
});

test("katalog bez danych i brakujące opcjonalne pola nie tworzą fikcyjnej treści", () => {
  assert.deepEqual(model.parseCatalog([]), []);
  assert.deepEqual(model.parseCatalog([{ id: "id", title: "Nazwa", description: null, target_group: null }]), [
    { id: "id", title: "Nazwa", description: "", audience: "", category: null, source_url: null, source_invalid: false, demonstrative: false, source_label: "" },
  ]);
});

test("źródła wymagają HTTP/HTTPS; niedostępny adres nie usuwa rekordu", () => {
  for (const source_url of ["javascript:alert(1)", "data:text/html,test", "//example.org", "/źródło", "https://user:password@example.org", "błędny adres"]) {
    const [item] = model.parseCatalog([{ ...row, source_url }]);
    assert.equal(item.source_url, null); assert.equal(item.source_invalid, true); assert.equal(item.id, row.id);
  }
  for (const source_url of ["http://example.org/test", "https://example.org/test"]) {
    assert.equal(model.parseCatalog([{ ...row, source_url }])[0].source_url, source_url);
  }
});

test("nieprawidłowy kontrakt, duplikaty i przekroczenie limitu są błędem odpowiedzi", async (t) => {
  const api = client(t);
  for (const body of [{ matches: [row] }, null, [null], [{ ...row, id: "" }], [{ ...row, title: " " }], [{ ...row, target_group: [] }], [row, row], [row, { ...row, id: "test-2" }]]) {
    t.mock.method(globalThis, "fetch", async () => json(body));
    await assert.rejects(api.fetchCatalogPage({ limit: 1 }), kind("response"));
  }
});

test("lokalne wyszukiwanie obejmuje nazwę, opis i odbiorców oraz polskie znaki", () => {
  const items = model.parseCatalog([row, { ...row, id: "other", title: "Transport", description: "Dojazd", target_group: "Dzieci" }]);
  for (const query of ["LACZYMY", "OGRÓD", "mlodziez", "  seniorzy ogród  "]) assert.equal(model.searchCatalog(items, query)[0].id, row.id);
  assert.equal(model.searchCatalog(items, "ogród dzieci").length, 0);
  assert.equal(model.searchCatalog(items, "nie ma takich danych").length, 0);
  assert.equal(model.searchCatalog(items, " \n ").length, 2);
});

test("kategorie pochodzą tylko z przekazanych rekordów, bez duplikatów i pustych wartości", () => {
  assert.deepEqual(model.collectCategories(model.parseCatalog([row, { ...row, id: "2" }, { ...row, id: "3", category: null }])), ["Integracja"]);
});

test("paginacja liczy offset po rekordach serwera i nie dubluje kart na styku stron", () => {
  const page = model.parseCatalog(Array.from({ length: 50 }, (_, index) => ({ ...row, id: `id-${index}` })));
  const first = model.mergeCatalogPage({ items: [], nextOffset: 0, hasMore: false }, page);
  assert.equal(first.nextOffset, 50); assert.equal(first.hasMore, true);
  const next = model.mergeCatalogPage(first, [page[49], { ...page[0], id: "id-50" }]);
  assert.equal(next.items.length, 51); assert.equal(next.nextOffset, 52); assert.equal(next.hasMore, false);
  const end = model.mergeCatalogPage(first, []);
  assert.equal(end.items.length, 50); assert.equal(end.nextOffset, 50); assert.equal(end.hasMore, false);
});

test("błędy HTTP, sieci i JSON nie włączają danych demonstracyjnych", async (t) => {
  const api = client(t, "true");
  for (const status of [429, 502, 503]) {
    t.mock.method(globalThis, "fetch", async () => new Response("Techniczna treść błędu", { status }));
    await assert.rejects(api.fetchCatalogPage(), kind("api", status));
  }
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Awaria sieci"); });
  await assert.rejects(api.fetchCatalogPage(), kind("network"));
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Awaria</html>"));
  await assert.rejects(api.fetchCatalogPage(), kind("response"));
});

test("nieprawidłowe limit/offset nie wysyłają żądania", async (t) => {
  const api = client(t);
  const spy = t.mock.method(globalThis, "fetch", () => assert.fail("Nie wysyłaj błędnych parametrów"));
  for (const request of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { offset: -1 }, { offset: NaN }, { offset: Number.MAX_SAFE_INTEGER + 1 }]) {
    await assert.rejects(api.fetchCatalogPage(request));
  }
  assert.equal(spy.mock.callCount(), 0);
});

test("20 sekund przerywa oczekiwanie na nagłówki", async (t) => {
  const api = client(t); t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(globalThis, "fetch", abortingFetch);
  const rejection = assert.rejects(api.fetchCatalogPage(), kind("timeout"));
  t.mock.timers.tick(api.MATCH_TIMEOUT_MS); await rejection;
});

test("20 sekund obejmuje także odczyt body", async (t) => {
  const api = client(t); t.mock.timers.enable({ apis: ["setTimeout"] });
  let ready; const reading = new Promise((resolve) => { ready = resolve; });
  t.mock.method(globalThis, "fetch", async (_url, { signal }) => ({ ok: true, json: () => {
    ready(); return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  } }));
  const rejection = assert.rejects(api.fetchCatalogPage(), kind("timeout"));
  await reading; t.mock.timers.tick(api.MATCH_TIMEOUT_MS); await rejection;
});

test("anulowanie i już anulowany sygnał nie zamieniają się w błąd API", async (t) => {
  const api = client(t);
  const spy = t.mock.method(globalThis, "fetch", abortingFetch);
  const controller = new AbortController();
  const rejection = assert.rejects(api.fetchCatalogPage({}, controller.signal), { name: "AbortError" });
  controller.abort(); await rejection;
  await assert.rejects(api.fetchCatalogPage({}, controller.signal), { name: "AbortError" });
  assert.equal(spy.mock.callCount(), 1);
});

test("rekord oznaczony przez backend jako demonstracyjny niesie oznaczenie do widoku", () => {
  const [item] = model.parseCatalog([{ id: "inv_01", title: "Wzorzec", is_demonstrative: true, source_label: "ROPS Kraków" }]);
  assert.equal(item.demonstrative, true);
  assert.equal(item.source_label, "ROPS Kraków");
  assert.equal(model.parseCatalog([{ id: "x", title: "Bez pola" }])[0].demonstrative, false);
});

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Uruchamiamy rzeczywisty klient TS bez dodawania frameworka testowego.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cacheRoot = join(root, "node_modules", ".cache");
mkdirSync(cacheRoot, { recursive: true });
const output = mkdtempSync(join(cacheRoot, "hubmi-api-tests-"));
for (const name of ["matching", "mock-matching", "api"]) {
  const source = readFileSync(join(root, "src", "lib", `${name}.ts`), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  writeFileSync(join(output, `${name}.js`), outputText);
}
const require = createRequire(import.meta.url);
after(() => rmSync(output, { recursive: true, force: true }));

function apiFor(t, { mock, backend = "http://localhost:8000" } = {}) {
  const keys = ["NEXT_PUBLIC_USE_MOCK_MATCHING", "NEXT_PUBLIC_BACKEND_URL"];
  const previous = keys.map((key) => process.env[key]);
  if (mock === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_MATCHING;
  else process.env.NEXT_PUBLIC_USE_MOCK_MATCHING = mock;
  process.env.NEXT_PUBLIC_BACKEND_URL = backend;
  t.after(() => keys.forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key];
    else process.env[key] = previous[index];
  }));
  const path = join(output, "api.js");
  delete require.cache[path];
  return require(path);
}

// Fikcyjne dane testu HTTP; adres domeny example.org nie jest źródłem innowacji.
const item = {
  id: "test-1",
  title: "Rekord testowy",
  description: "Opis testowy",
  source_url: "https://example.org/test-fixture",
  reason: "Uzasadnienie testowe",
  audience: "Grupa testowa",
};
const wireItem = {
  id: item.id, title: item.title, description: item.description,
  source_url: item.source_url, why_relevant: item.reason,
  target_group: item.audience, similarity_score: 0.97, status: "testowy",
};
const jsonResponse = (body) => new Response(JSON.stringify(body), {
  headers: { "Content-Type": "application/json" },
});

function abortingFetch(_url, { signal }) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

const expectKind = (kind, status) => (error) => {
  assert.equal(error.name, "MatchApiError");
  assert.equal(error.kind, kind);
  if (status !== undefined) assert.equal(error.status, status);
  return true;
};

test("POST wysyła przycięty opis i zachowuje dane kart, bez interpretacji score", async (t) => {
  const api = apiFor(t, { backend: "http://localhost:8123///" });
  const fetchMock = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "http://localhost:8123/api/match");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(options.body), { problem_description: "Pomoc seniorom" });
    return jsonResponse({ matches: [wireItem], total_found: 1, related_resources: [item] });
  });
  const result = await api.matchProblem({ problem_description: "  Pomoc seniorom\n" });
  assert.deepEqual(result, { matches: [item], related_resources: [item] });
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("pusty opis jest odrzucany przed żądaniem", async (t) => {
  const api = apiFor(t);
  const fetchMock = t.mock.method(globalThis, "fetch", () => assert.fail("Nie wysyłaj pustego opisu"));
  await assert.rejects(api.matchProblem({ problem_description: " \n\t " }), expectKind("validation"));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("puste dopasowania i pominięte materiały są poprawną odpowiedzią", async (t) => {
  const api = apiFor(t);
  t.mock.method(globalThis, "fetch", async () => jsonResponse({ matches: [], total_found: 0 }));
  assert.deepEqual(await api.matchProblem({ problem_description: "Potrzeba" }), {
    matches: [], related_resources: [],
  });
});

test("błędne rekordy, listy i niebezpieczne źródła odrzucają całą odpowiedź", async (t) => {
  const api = apiFor(t);
  for (const body of [
    null, {}, { matches: [], total_found: "0" }, { matches: {}, total_found: 0 },
    { matches: [null], total_found: 1 },
    { matches: [{ ...wireItem, title: " " }], total_found: 1 },
    { matches: [{ ...wireItem, source_url: "javascript:alert(1)" }], total_found: 1 },
    { matches: [{ ...wireItem, source_url: "/wzgledny-adres" }], total_found: 1 },
    { matches: [{ ...wireItem, target_group: 123 }], total_found: 1 },
    { matches: [{ ...wireItem, category: [null] }], total_found: 1 },
    { matches: [{ ...wireItem, similarity_score: null }], total_found: 1 },
    { matches: [wireItem, wireItem], total_found: 2 },
    { matches: [], total_found: 0, related_resources: null },
  ]) {
    t.mock.method(globalThis, "fetch", async () => jsonResponse(body));
    await assert.rejects(api.matchProblem({ problem_description: "Potrzeba" }), expectKind("response"));
  }
});

test("niepoprawny JSON powoduje błąd odpowiedzi", async (t) => {
  const api = apiFor(t);
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Nie JSON</html>"));
  await assert.rejects(api.matchProblem({ problem_description: "Potrzeba" }), expectKind("response"));
});

test("błędy HTTP zachowują status i nie uruchamiają mocku", async (t) => {
  const api = apiFor(t, { mock: "false" });
  for (const status of [404, 422, 429, 500]) {
    t.mock.method(globalThis, "fetch", async () => new Response("Błąd testowy", { status }));
    await assert.rejects(api.matchProblem({ problem_description: "Samotność seniorów" }), expectKind("api", status));
  }
});

test("awaria sieci nie uruchamia mocku i pozwala na ponowienie", async (t) => {
  const api = apiFor(t);
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Network error"); });
  await assert.rejects(api.matchProblem({ problem_description: "Samotność seniorów" }), expectKind("network"));
  t.mock.method(globalThis, "fetch", async () => jsonResponse({ matches: [wireItem], total_found: 1 }));
  assert.equal((await api.matchProblem({ problem_description: "Samotność seniorów" })).matches.length, 1);
});

test("limit 20 sekund przerywa oczekiwanie na serwer", async (t) => {
  const api = apiFor(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(globalThis, "fetch", abortingFetch);
  const pending = api.matchProblem({ problem_description: "Potrzeba" });
  const rejection = assert.rejects(pending, expectKind("timeout"));
  t.mock.timers.tick(api.MATCH_TIMEOUT_MS);
  await rejection;
});

test("limit czasu obejmuje także odczytywanie body", async (t) => {
  const api = apiFor(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let bodyStarted;
  const bodyReady = new Promise((resolve) => { bodyStarted = resolve; });
  t.mock.method(globalThis, "fetch", async (_url, { signal }) => ({
    ok: true,
    json: () => {
      bodyStarted();
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
  }));
  const rejection = assert.rejects(api.matchProblem({ problem_description: "Potrzeba" }), expectKind("timeout"));
  await bodyReady;
  t.mock.timers.tick(api.MATCH_TIMEOUT_MS);
  await rejection;
});

test("anulowanie przez komponent przerywa żądanie", async (t) => {
  const api = apiFor(t);
  t.mock.method(globalThis, "fetch", abortingFetch);
  const controller = new AbortController();
  const rejection = assert.rejects(
    api.matchProblem({ problem_description: "Potrzeba" }, controller.signal),
    { name: "AbortError" },
  );
  controller.abort();
  await rejection;
});

test("już anulowane żądanie nie wysyła danych", async (t) => {
  const api = apiFor(t);
  const fetchMock = t.mock.method(globalThis, "fetch", () => assert.fail("Żądanie anulowane"));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.matchProblem({ problem_description: "Potrzeba" }, controller.signal), { name: "AbortError" });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("tylko jawne true włącza demo bez wywoływania backendu", async (t) => {
  const api = apiFor(t, { mock: "true" });
  const fetchMock = t.mock.method(globalThis, "fetch", () => assert.fail("Demo nie wywołuje backendu"));
  const result = await api.matchProblem({ problem_description: "Samotność seniorów" });
  assert.ok(result.matches.length > 0);
  assert.ok(result.related_resources.length > 0);
  for (const record of [...result.matches, ...result.related_resources]) {
    assert.equal(record.source_url, null);
    assert.match(record.id, /^demo-/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("demo potrafi zwrócić brak dopasowań", async (t) => {
  const api = apiFor(t, { mock: "true" });
  t.mock.method(globalThis, "fetch", () => assert.fail("Demo nie wywołuje backendu"));
  assert.deepEqual(await api.matchProblem({ problem_description: "Potrzebujemy ogrodu społecznego" }), {
    matches: [], related_resources: [],
  });
});

test("brak flagi, false, True i 1 korzystają z API", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => jsonResponse({ matches: [], total_found: 0 }));
  for (const mock of [undefined, "false", "True", "1"]) {
    const api = apiFor(t, { mock });
    assert.equal(api.USE_MOCK_MATCHING, false);
    await api.matchProblem({ problem_description: "Samotność seniorów" });
  }
  assert.equal(fetchMock.mock.callCount(), 4);
});

test("kontrakt backendu dopuszcza null w polach opcjonalnych", async (t) => {
  const api = apiFor(t);
  t.mock.method(globalThis, "fetch", async () => jsonResponse({
    matches: [{ id: "minimal", title: "Minimalny rekord", similarity_score: 0.2, status: "testowy",
      why_relevant: null, description: null, target_group: null, category: null, source_url: null }],
    total_found: 1, query: null,
  }));
  assert.deepEqual(await api.matchProblem({ problem_description: "Potrzeba" }), {
    matches: [{ id: "minimal", title: "Minimalny rekord", description: "", reason: "", source_url: null }],
    related_resources: [],
  });
});

test("zachowany matchInnovations zwraca oryginalny kontrakt backendu", async (t) => {
  const api = apiFor(t);
  const body = { matches: [wireItem], total_found: 1, query: "Potrzeba" };
  t.mock.method(globalThis, "fetch", async () => jsonResponse(body));
  assert.deepEqual(await api.matchInnovations("Potrzeba"), body);
});

test("minimalna długość opisu odpowiada walidacji backendu", async (t) => {
  const api = apiFor(t);
  const fetchMock = t.mock.method(globalThis, "fetch", () => assert.fail("Opis za krótki"));
  await assert.rejects(api.matchProblem({ problem_description: "ab" }), expectKind("validation"));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("plan adaptacji wysyła kontekst zgodny z kontraktem Middleman AI", async (t) => {
  const api = apiFor(t);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "http://localhost:8000/api/adapt");
    assert.deepEqual(JSON.parse(options.body), {
      innovation_title: "Tytuł", municipality_context: "Mała gmina", innovation_description: "Opis",
    });
    return jsonResponse({ innovation_title: "Tytuł", adaptation_plan: "Plan testowy" });
  });
  assert.deepEqual(await api.adaptInnovation("Tytuł", "  Mała gmina  ", "Opis"), {
    innovation_title: "Tytuł", adaptation_plan: "Plan testowy",
  });
});

test("plan adaptacji odrzuca za krótki kontekst i niepoprawną odpowiedź", async (t) => {
  const api = apiFor(t);
  await assert.rejects(api.adaptInnovation("Tytuł", "abc"), /co najmniej 5/);
  t.mock.method(globalThis, "fetch", async () => jsonResponse({ adaptation_plan: null }));
  await assert.rejects(api.adaptInnovation("Tytuł", "Mała gmina"), /niepoprawny plan/);
});

test("limit czasu przerywa także generowanie planu", async (t) => {
  const api = apiFor(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(globalThis, "fetch", abortingFetch);
  const rejection = assert.rejects(api.adaptInnovation("Tytuł", "Mała gmina"), /zbyt długo/);
  t.mock.timers.tick(api.MATCH_TIMEOUT_MS);
  await rejection;
});

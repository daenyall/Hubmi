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
const output = mkdtempSync(join(cache, "hubmi-resources-tests-"));
const target = join(output, "resources.js");
writeFileSync(target, ts.transpileModule(readFileSync(join(root, "src", "features/knowledge/resources.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText);
after(() => rmSync(output, { recursive: true, force: true }));
const require = createRequire(import.meta.url);
const { RESOURCE_GROUPS, isSafeResourceUrl } = require(target);

const items = RESOURCE_GROUPS.flatMap((group) => group.items);

test("brief ROPS ma trzy zadeklarowane grupy zasobów", () => {
  assert.deepEqual(RESOURCE_GROUPS.map((group) => group.id), ["mapa-wyzwan", "raporty-diagnozy", "materialy-edukacyjne"]);
  for (const group of RESOURCE_GROUPS) {
    assert.ok(group.title.trim(), `grupa ${group.id} wymaga tytułu`);
    assert.ok(group.intro.trim(), `grupa ${group.id} wymaga wprowadzenia`);
    assert.ok(group.items.length > 0, `grupa ${group.id} nie może być pusta`);
  }
});

test("każdy zasób ma nazwę, opis oparty na źródle, rodzaj i adres", () => {
  for (const item of items) {
    assert.ok(item.id.trim(), "zasób wymaga identyfikatora");
    assert.ok(item.title.trim(), `${item.id}: brak nazwy`);
    assert.ok(item.kind.trim(), `${item.id}: brak rodzaju materiału`);
    assert.ok(item.description.trim().length >= 60, `${item.id}: opis jest zbyt krótki, by pochodził ze źródła`);
    assert.ok(item.url.trim(), `${item.id}: brak adresu`);
  }
});

test("identyfikatory zasobów są unikalne", () => {
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
});

test("wszystkie adresy prowadzą do rops.krakow.pl po HTTPS, bez danych logowania", () => {
  for (const item of items) {
    assert.ok(isSafeResourceUrl(item.url), `${item.id}: adres nie jest bezpiecznym HTTPS`);
    const parsed = new URL(item.url);
    assert.equal(parsed.protocol, "https:", `${item.id}: wymagane HTTPS`);
    assert.equal(parsed.hostname, "rops.krakow.pl", `${item.id}: dozwolona wyłącznie domena ROPS`);
  }
});

test("isSafeResourceUrl odrzuca http, dane logowania i śmieci", () => {
  assert.equal(isSafeResourceUrl("http://rops.krakow.pl/a"), false);
  assert.equal(isSafeResourceUrl("https://user:pass@rops.krakow.pl/a"), false);
  assert.equal(isSafeResourceUrl("javascript:alert(1)"), false);
  assert.equal(isSafeResourceUrl("nie-adres"), false);
  assert.equal(isSafeResourceUrl(""), false);
  assert.equal(isSafeResourceUrl("https://rops.krakow.pl/badania-analizy-raporty/raporty-z-badan"), true);
});

test("Mapa Wyzwań Społecznych jest obecna jako osobna grupa", () => {
  const group = RESOURCE_GROUPS.find((entry) => entry.id === "mapa-wyzwan");
  assert.ok(group, "brak grupy Mapy Wyzwań Społecznych");
  assert.ok(group.items.some((item) => /Mapa Wyzwań Społecznych/.test(item.title)));
});

test("opisy nie obiecują weryfikacji skuteczności innowacji", () => {
  for (const item of items) {
    assert.ok(!/(skuteczn|certyfik|gwarant|potwierdzon[ya] jako)/i.test(item.description), `${item.id}: opis sugeruje ocenę skuteczności`);
  }
});

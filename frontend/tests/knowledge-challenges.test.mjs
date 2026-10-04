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
const output = mkdtempSync(join(cache, "hubmi-challenges-tests-"));
const compile = (relative, name) => {
  const target = join(output, name);
  writeFileSync(target, ts.transpileModule(readFileSync(join(root, "src", relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText);
  return target;
};
const challengesPath = compile("features/knowledge/challenges.ts", "challenges.js");
const resourcesPath = compile("features/knowledge/resources.ts", "resources.js");
after(() => rmSync(output, { recursive: true, force: true }));
const require = createRequire(import.meta.url);
const { MALOPOLSKA_CHALLENGES, NATIONWIDE_MAP, CHALLENGE_SOURCE, REPORT_FINDINGS, OZPS_REPORT_PAGE } = require(challengesPath);
const { isSafeResourceUrl } = require(resourcesPath);

test("audyt wymaga od 3 do 5 kart wyzwań o unikalnych identyfikatorach", () => {
  assert.ok(MALOPOLSKA_CHALLENGES.length >= 3 && MALOPOLSKA_CHALLENGES.length <= 5, `kart: ${MALOPOLSKA_CHALLENGES.length}`);
  const ids = MALOPOLSKA_CHALLENGES.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("każda karta ma nazwę, ustalenie i znaczenie dla odbiorcy", () => {
  for (const item of MALOPOLSKA_CHALLENGES) {
    for (const field of ["id", "name", "finding", "matters"]) {
      assert.equal(typeof item[field], "string", `${item.id}: ${field}`);
      assert.ok(item[field].trim().length > 0, `${item.id}: puste ${field}`);
    }
    assert.ok(item.finding.trim().length >= 80, `${item.id}: ustalenie jest zbyt ogólne`);
    assert.match(item.matters, /mieszka|instytucj|samorząd|organizacj/i, `${item.id}: brak znaczenia dla odbiorcy`);
  }
});

test("karty nie noszą własnych adresów, źródło jest jedno i nazwane", () => {
  assert.ok(CHALLENGE_SOURCE.trim().length > 0);
  assert.match(CHALLENGE_SOURCE, /ROPS/);
  for (const item of MALOPOLSKA_CHALLENGES) {
    assert.doesNotMatch(JSON.stringify(item), /https?:\/\//, `${item.id}: karta nie powinna mieć własnego odnośnika`);
  }
});

test("dane Małopolski są oddzielone od ogólnopolskiej Mapy Wyzwań", () => {
  // Żadna karta regionu nie powołuje się na Mapę jako swoje źródło.
  for (const item of MALOPOLSKA_CHALLENGES) {
    assert.doesNotMatch(item.finding, /Map[aąy] Wyzwań/i, `${item.id}: ustalenie regionu wskazuje na Mapę`);
  }
  assert.match(NATIONWIDE_MAP.title, /ogólnopolsk/i);
  assert.match(NATIONWIDE_MAP.caveat, /ogólnopolsk/i);
  assert.doesNotMatch(NATIONWIDE_MAP.caveat, /wskaźnikami dla Małopolski(?!.)/);
  assert.match(NATIONWIDE_MAP.caveat, /nie są wskaźnikami dla Małopolski/i);
  assert.ok(isSafeResourceUrl(NATIONWIDE_MAP.url), "Mapa musi mieć bezpieczny adres http(s)");
});

test("ustalenia z raportu: źródło, rok i zasięg przy każdym, adresy HTTPS ROPS", () => {
  assert.ok(REPORT_FINDINGS.length >= 5);
  assert.equal(new Set(REPORT_FINDINGS.map((f) => f.id)).size, REPORT_FINDINGS.length);
  assert.ok(isSafeResourceUrl(OZPS_REPORT_PAGE));
  for (const f of REPORT_FINDINGS) {
    assert.ok(f.theme && f.finding && f.period, f.id);
    assert.equal(f.year, 2025, f.id);
    assert.equal(f.scope, "woj. małopolskie", f.id);
    assert.ok(f.source.title && isSafeResourceUrl(f.source.url) && new URL(f.source.url).hostname === "rops.krakow.pl", f.id);
  }
});

test("dane ogólnopolskie są tylko w polu porównania, nie w ustaleniu regionalnym", () => {
  assert.match("dla Polski minus 4,5", /(?<![a-ząćęłńóśźż])(polsk|polsc|kraj|ogólnopolsk)/i, "wzorzec wykrywa dane krajowe");
  assert.doesNotMatch("w Małopolsce", /(?<![a-ząćęłńóśźż])(polsk|polsc|kraj|ogólnopolsk)/i, "Małopolska to nie dane krajowe");
  for (const f of REPORT_FINDINGS) {
    assert.doesNotMatch(f.finding, /(?<![a-ząćęłńóśźż])(polsk|polsc|kraj|ogólnopolsk)/i, `${f.id}: ustalenie miesza dane krajowe`);
    if (f.nationalComparison) assert.match(f.nationalComparison, /Pols(k|c)/, f.id);
  }
});

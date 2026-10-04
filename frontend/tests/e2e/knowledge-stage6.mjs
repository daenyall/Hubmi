// Opt-in: real local frontend + FastAPI + test Supabase; creates and removes only its own records.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const root = fileURLToPath(new URL('../..', import.meta.url));
require('@next/env').loadEnvConfig(root, true, { info() {}, error() {} });
const credentials = Object.fromEntries(fs.readFileSync(path.join(root, '.env.test.local'), 'utf8').split('\n')
  .filter((line) => /^[A-Z_]+=/.test(line)).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')]));
const origin = process.env.HUBMI_E2E_FRONTEND_URL || 'http://localhost:3000';
const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
const base = '/api/admin/knowledge-resources';
const title = `TEST HubMI etap 6 ${randomUUID()}`;
const clients = {};
const accounts = {
  A: [process.env.TEST_AUTHOR_A_EMAIL || 'autor.a@malopolska.pl', credentials.TEST_AUTHOR_A_PASSWORD],
  B: [process.env.TEST_AUTHOR_B_EMAIL || 'autor.b@malopolska.pl', credentials.TEST_AUTHOR_B_PASSWORD],
  R: [process.env.TEST_ROPS_EMAIL || 'ekspert@rops.krakow.pl', credentials.TEST_ROPS_PASSWORD],
};
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
async function api(method, route, who, body) {
  const session = who ? (await clients[who].auth.getSession()).data.session : null;
  const r = await fetch(backend + route, { method, headers: { ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}
async function login(page, who) {
  await page.goto(origin + '/logowanie');
  await page.getByLabel('Email (wymagane)').fill(accounts[who][0]);
  await page.getByLabel('Hasło (wymagane)').fill(accounts[who][1]);
  await page.locator('main form button[type=submit]').click();
  await page.getByRole('button', { name: 'Wyloguj się' }).waitFor();
}
(async () => {
  let browser, id;
  const errors = [];
  try {
    for (const who of Object.keys(accounts)) {
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const auth = await sb.auth.signInWithPassword({ email: accounts[who][0], password: accounts[who][1] });
      check(`konto ${who}`, !auth.error);
      clients[who] = sb;
    }
    const health = await api('GET', '/api/health');
    check('backend połączony z Supabase', health.data.supabase_connected === true);
    const schema = await clients.R.from('knowledge_resources').select('*');
    check('knowledge_resources: dziewięć zasobów migracji 11', !schema.error && ['mapa-wyzwan-spolecznych', 'raporty-z-badan', 'ocena-zasobow', 'ioss', 'social-innovation-canvas', 'publikacje-ze-swiata-innowacji', 'biblioteka-innowacji', 'innowacje-w-modelach', 'video-inkubator-iws'].every((id) => schema.data.some((r) => r.id === id)));
    check('naprawione źródło ROPS: strona tematyczna zamiast nieistniejącego filmu', schema.data.some((r) => r.id === 'video-inkubator-iws' && r.kind === 'Strona tematyczna' && r.url.endsWith('/regiostars-awards-2025/pl-inkubator-wlaczenia-spolecznego')));
    const provenance = await clients.R.from('innovations').select('id,is_demonstrative,source_label').limit(100);
    check('kolumny migracji 11 i demonstracyjne rekordy', !provenance.error && provenance.data.some((r) => r.is_demonstrative && r.source_label));
    browser = await chromium.launch({ ...(process.env.HUBMI_CHROMIUM_PATH ? { executablePath: process.env.HUBMI_CHROMIUM_PATH } : {}) });
    const context = await browser.newContext();
    context.on('page', (p) => p.on('pageerror', () => errors.push('pageerror')));
    const pub = await context.newPage();
    await pub.goto(origin + '/baza-wiedzy');
    await pub.getByRole('heading', { name: 'Zasoby ROPS Kraków' }).waitFor();
    await pub.getByRole('article', { name: 'Social Innovation Canvas', exact: true }).waitFor();
    const content = await pub.locator('main').innerText();
    check('Zasobnik: źródła, rok, zasięg, dane ogólnopolskie i diagnoza 2025', /Rok danych/.test(content) && /Zasięg/.test(content) && /Dane nie tylko dla Małopolski/.test(content) && /852,6 tys\./.test(content) && /Dla porównania, dane ogólnopolskie/.test(content));
    await pub.getByText('Wzorzec demonstracyjny — nie rekord z bazy ROPS', { exact: true }).first().waitFor();
    check('katalog: jawne oznaczenia demonstracyjne z API', true);
    const rops = await context.newPage();
    await login(rops, 'R');
    await rops.goto(origin + '/rops/innowacje');
    await rops.getByRole('heading', { name: 'Zasoby Zasobnika Wiedzy' }).waitFor();
    await rops.getByRole('button', { name: 'Zapisz szkic', exact: true }).click();
    check('walidacja i fokus pierwszego błędnego pola', await rops.locator('#new-resource-title').getAttribute('aria-invalid') === 'true' && await rops.evaluate(() => document.activeElement.id) === 'new-resource-title');
    await rops.locator('#new-resource-title').fill(title);
    await rops.locator('#new-resource-description').fill('Materiał testowy cyklu weryfikacji. Do usunięcia po zakończeniu testu.');
    await rops.locator('#new-resource-url').fill('https://rops.krakow.pl/');
    await rops.locator('#new-resource-year').fill('2025');
    await rops.locator('#new-resource-coverage_scope').selectOption('woj. małopolskie');
    await rops.locator('#new-resource-caveat').fill('Zastrzeżenie testowe do późniejszego usunięcia.');
    const writes = [];
    rops.on('request', (r) => { if (r.url().includes(base) && ['POST', 'PUT', 'DELETE'].includes(r.method())) writes.push({ method: r.method(), route: new URL(r.url()).pathname, body: r.postDataJSON() }); });
    await rops.getByRole('button', { name: 'Zapisz szkic', exact: true }).click();
    await rops.evaluate(() => document.querySelector('#new-resource-title').closest('form').requestSubmit());
    let art = rops.getByRole('article', { name: title, exact: true });
    await art.waitFor();
    const created = (await api('GET', base + '?limit=100', 'R')).data.find((r) => r.title === title);
    id = created.id;
    check('jeden POST; tworzenie bez statusu i audytu', writes.filter((r) => r.route === base && r.method === 'POST').length === 1 && !['status', 'verified_by', 'verified_at', 'published_by', 'published_at', 'created_at', 'updated_at'].some((k) => k in writes[0].body));
    check('szkic: brak publikacji w UI i publicznym API', await art.getByRole('button', { name: 'Opublikuj', exact: true }).count() === 0 && (await api('GET', `/api/knowledge-resources/${id}`)).status === 404);
    check('PR19: publikacja szkicu odrzucona', (await api('POST', `${base}/${id}/publish`, 'R')).status === 400);
    const persisted = await clients.R.from('knowledge_resources').select('status').eq('id', id).single();
    check('trwały szkic w Supabase', !persisted.error && persisted.data.status === 'roboczy');
    for (const who of ['A', 'B', null]) {
      const codes = [];
      for (const [method, route, body] of [['GET', base], ['POST', base, { title: 'Brak dostępu', description: 'Nieuprawniony zapis testowy.', url: 'https://rops.krakow.pl/' }], ['PUT', `${base}/${id}`, { title: 'Nieuprawniona edycja' }], ['POST', `${base}/${id}/verify`], ['POST', `${base}/${id}/publish`], ['POST', `${base}/${id}/unpublish`], ['DELETE', `${base}/${id}`]]) codes.push((await api(method, route, who, body)).status);
      check(`${who || 'anon'}: wszystkie endpointy ROPS odrzucone`, codes.every((code) => [401, 403].includes(code)));
      if (who) {
        const direct = await clients[who].from('knowledge_resources').select('id').eq('id', id);
        check(`${who}: RLS ukrywa szkic`, !direct.error && direct.data.length === 0);
        const update = await clients[who].from('knowledge_resources').update({ title: 'Nieuprawniona edycja' }).eq('id', id).select('id');
        check(`${who}: RLS blokuje edycję`, !!update.error || update.data.length === 0);
      }
    }
    await art.getByRole('button', { name: 'Oznacz jako zweryfikowany', exact: true }).click();
    await art.getByRole('button', { name: 'Opublikuj', exact: true }).waitFor();
    await art.getByRole('button', { name: 'Opublikuj', exact: true }).click();
    await art.getByText('Opublikowano — zasób jest widoczny w Zasobniku.', { exact: true }).waitFor();
    check('weryfikacja i publikacja przez osobne POST', writes.some((r) => r.route.endsWith('/verify') && r.method === 'POST') && writes.some((r) => r.route.endsWith('/publish') && r.method === 'POST'));
    await pub.reload();
    await pub.getByRole('article', { name: title, exact: true }).waitFor();
    check('opublikowany materiał widoczny po F5', true);
    await art.getByRole('button', { name: 'Edytuj', exact: true }).click();
    await art.locator('textarea[id$="-description"]').fill('Zmieniona treść opublikowanego materiału. Wymaga nowej weryfikacji.');
    const editRoute = `**/api/admin/knowledge-resources/${id}`;
    await rops.route(editRoute, (route) => route.request().method() === 'PUT'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Kontrolowana awaria"}' })
      : route.continue());
    await art.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
    await art.getByText(/Baza danych jest chwilowo niedostępna/).waitFor();
    check('kontrolowane 503 przy edycji: treść zachowana, brak fałszywego sukcesu', await art.locator('textarea[id$="-description"]').inputValue() === 'Zmieniona treść opublikowanego materiału. Wymaga nowej weryfikacji.' && (await api('GET', `${base}/${id}`, 'R')).data.status === 'opublikowany');
    await rops.unroute(editRoute);
    await art.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
    await art.getByText(/Zapisano i potwierdzono: szkic/).waitFor();
    check('edycja publikacji: szkic i komunikat ponownej weryfikacji bez F5', /ponowna weryfikacja/.test(await art.innerText()) && await art.getByRole('button', { name: 'Opublikuj', exact: true }).count() === 0);
    const changed = (await api('GET', `${base}/${id}`, 'R')).data;
    check('backend unieważnia audyt po edycji; publiczne 404', changed.status === 'roboczy' && changed.verified_at === null && changed.verified_by === null && changed.published_at === null && (await api('GET', `/api/knowledge-resources/${id}`)).status === 404);
    await art.getByRole('button', { name: 'Zamknij edycję', exact: true }).click();
    await art.getByRole('button', { name: 'Oznacz jako zweryfikowany', exact: true }).click();
    await art.getByRole('button', { name: 'Opublikuj', exact: true }).waitFor();
    await art.getByRole('button', { name: 'Edytuj', exact: true }).click();
    await art.locator('input[id$="-url"]').fill('https://rops.krakow.pl/innowacje-spoleczne');
    await art.locator('textarea[id$="-caveat"]').fill('');
    await art.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
    await art.getByText(/Zapisano i potwierdzono: szkic/).waitFor();
    check('edycja zweryfikowanego źródła: szkic; puste zastrzeżenie zapisane', (await api('GET', `${base}/${id}`, 'R')).data.caveat === null);
    await art.getByRole('button', { name: 'Zamknij edycję', exact: true }).click();
    await art.getByRole('button', { name: 'Oznacz jako zweryfikowany', exact: true }).click();
    await art.getByRole('button', { name: 'Opublikuj', exact: true }).waitFor();
    await art.getByRole('button', { name: 'Opublikuj', exact: true }).click();
    await art.getByRole('button', { name: 'Wycofaj publikację', exact: true }).waitFor();
    await art.getByRole('button', { name: 'Wycofaj publikację', exact: true }).click();
    await art.getByText(/Wycofano publikację — zasób pozostaje zweryfikowany/).waitFor();
    const unpub = (await api('GET', `${base}/${id}`, 'R')).data;
    check('unpublish: POST, status zweryfikowany, brak publicznego zasobu', writes.some((r) => r.route.endsWith('/unpublish') && r.method === 'POST') && unpub.status === 'zweryfikowany' && unpub.published_at === null && (await api('GET', `/api/knowledge-resources/${id}`)).status === 404);
    check('żaden PUT nie wysyła statusu ani audytu', writes.filter((r) => r.method === 'PUT').every((r) => !['status', 'verified_at', 'verified_by', 'published_at', 'published_by'].some((k) => k in r.body)));
    await rops.reload();
    art = rops.getByRole('article', { name: title, exact: true });
    await art.getByRole('button', { name: 'Opublikuj', exact: true }).waitFor();
    check('stan po odświeżeniu zgodny z Supabase', /Zweryfikowany/.test(await art.innerText()));
    await art.getByRole('button', { name: 'Usuń zasób', exact: true }).click();
    check('usunięcie wymaga świadomego potwierdzenia z ID', await art.getByRole('button', { name: 'Potwierdź trwałe usunięcie' }).isDisabled() && (await art.innerText()).includes(id));
    await art.getByRole('button', { name: 'Anuluj', exact: true }).click();
    check('anulowanie nie wysyła DELETE', !writes.some((r) => r.method === 'DELETE'));
    await art.getByRole('button', { name: 'Usuń zasób', exact: true }).click();
    await art.getByRole('checkbox').check();
    await art.getByRole('button', { name: 'Potwierdź trwałe usunięcie' }).click();
    await rops.getByText(`Potwierdzono trwałe usunięcie zasobu (ID: ${id}).`, { exact: true }).waitFor();
    check('DELETE wybranego rekordu, API i baza potwierdzają brak', writes.filter((r) => r.method === 'DELETE').length === 1 && writes.find((r) => r.method === 'DELETE').route === `${base}/${id}` && (await api('GET', `${base}/${id}`, 'R')).status === 404 && (await clients.R.from('knowledge_resources').select('id').eq('id', id)).data.length === 0);
    id = null;
    for (const who of ['A', 'B']) {
      const privateContext = await browser.newContext();
      const page = await privateContext.newPage();
      await login(page, who);
      await page.goto(origin + '/rops/innowacje');
      await page.getByText(/nie ma potwierdzonych uprawnień/).waitFor();
      check(`${who}: brak panelu zasobów w UI`, await page.getByRole('heading', { name: 'Zasoby Zasobnika Wiedzy' }).count() === 0);
      await privateContext.close();
    }
    const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
    for (const page of [pub, rops]) {
      await page.setViewportSize({ width: 375, height: 850 });
      await page.reload();
      await page.getByRole('heading', { name: page === pub ? 'Zasoby ROPS Kraków' : 'Zasoby Zasobnika Wiedzy' }).waitFor();
      await page.addScriptTag({ content: axe });
      const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => v.id));
      check(`${page === pub ? 'Zasobnik' : 'ROPS'}: axe WCAG 2/2.1 A/AA`, violations.length === 0);
      await page.addStyleTag({ content: 'html { font-size:32px !important }' });
      check(`${page === pub ? 'Zasobnik' : 'ROPS'}: 375px i 200% bez poziomego przewijania`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    }
    await pub.route('**/api/knowledge-resources/grouped', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Kontrolowana awaria testowa' }) }));
    await pub.reload();
    await pub.getByRole('button', { name: 'Ponów wczytanie zasobów' }).waitFor();
    check('kontrolowane 503: komunikat i retry', true);
    await pub.unroute('**/api/knowledge-resources/grouped');
    await pub.getByRole('button', { name: 'Ponów wczytanie zasobów' }).click();
    await pub.getByRole('article', { name: 'Social Innovation Canvas', exact: true }).waitFor();
    await pub.route('**/api/knowledge-resources/grouped', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await pub.reload();
    await pub.getByText('Brak opublikowanych zasobów.', { exact: true }).waitFor();
    check('kontrolowany pusty zasobnik: jawny brak materiałów', true);
    check('brak błędów JavaScript', errors.length === 0);
    console.log(`WYNIK: ${checks.length} PASS`);
  } finally {
    if (id && clients.R) {
      const cleanup = await api('DELETE', `${base}/${id}`, 'R');
      if (cleanup.status !== 200 && cleanup.status !== 404) throw new Error('Nie udało się posprzątać rekordu testowego');
      console.log('CLEANUP: usunięto własny rekord testowy');
    }
    if (browser) await browser.close();
  }
})().catch((error) => { console.error(`FAIL ${error.message.split('\n')[0]}`); process.exitCode = 1; });

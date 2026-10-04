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
const title = `TEST HubMI etap 7 ${randomUUID()}`;
const clients = {};
const accounts = {
  A: [process.env.TEST_AUTHOR_A_EMAIL || 'autor.a@malopolska.pl', credentials.TEST_AUTHOR_A_PASSWORD],
  B: [process.env.TEST_AUTHOR_B_EMAIL || 'autor.b@malopolska.pl', credentials.TEST_AUTHOR_B_PASSWORD],
  R: [process.env.TEST_ROPS_EMAIL || 'ekspert@rops.krakow.pl', credentials.TEST_ROPS_PASSWORD],
};
const checks = [];
const check = (name, value) => { checks.push({name,pass:!!value}); console.log(`${value ? 'PASS' : 'FAIL'} ${name}`); };
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
  let browser;
  const created = [];
  fs.mkdirSync(path.join(root, 'node_modules/.cache/hubmi-stage7'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules/.cache/hubmi-stage7/run.json'), JSON.stringify({title}));
  const errors = [];
  const problem = 'Seniorzy w naszej gminie mieszkają samotnie. Potrzebują regularnych spotkań, wsparcia sąsiedzkiego i pomocy w codziennych sprawach.';
  try {
    for (const who of Object.keys(accounts)) {
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const auth = await sb.auth.signInWithPassword({ email: accounts[who][0], password: accounts[who][1] });
      assert.ok(!auth.error, `Konto ${who}`); clients[who] = sb;
    }
    check('Supabase połączony', (await api('GET', '/api/health')).data.supabase_connected === true);
    browser = await chromium.launch({ ...(process.env.HUBMI_CHROMIUM_PATH ? { executablePath: process.env.HUBMI_CHROMIUM_PATH } : {}) });
    const pageFor = async (who) => { const context = await browser.newContext(); context.on('page', (p) => p.on('pageerror', () => errors.push('pageerror'))); const p = await context.newPage(); if (who) await login(p, who); return p; };
    const a = await pageFor('A'), r = await pageFor('R'), b = await pageFor('B');
    await a.goto(origin);
    await a.locator('main textarea').fill(problem);
    const matchResponse = a.waitForResponse((response) => response.url().endsWith('/api/match') && response.request().method() === 'POST');
    await a.getByRole('button', { name: 'Znajdź rozwiązania', exact: true }).click();
    const match = await matchResponse;
    const matched = await match.json();
    check(`A: rzeczywiste dopasowania (HTTP ${match.status()})`, match.ok() && matched.matches?.length > 0);
    if (!match.ok()) {
      await a.locator('main [role=alert]').last().waitFor();
      check('A: awaria matchingu jawna, opis zachowany', await a.locator('main textarea').inputValue() === problem);
    }
    const innovations = (await api('GET', '/api/innovations?limit=50')).data;
    const innovation = matched.matches?.[0] || innovations.find((i) => i.is_demonstrative) || innovations[0];
    assert.ok(innovation, 'Brak innowacji w prawdziwym katalogu');
    if (match.ok() && matched.matches?.length) {
      const card = a.getByRole('article', { name: innovation.title, exact: true });
      await card.waitFor();
      check('A: źródło i oznaczenie wzorca w dopasowaniach', await card.getByRole('link', { name: /Zobacz źródło/ }).count() > 0 && (!innovation.is_demonstrative || (await card.innerText()).includes('Wzorzec demonstracyjny')));
      await card.locator('summary').click();
      await card.getByLabel('Kontekst Twojej instytucji (wymagane)').fill('Gmina wiejska, CUS, świetlica i wolontariusze. Pilotaż przez 3 miesiące, budżet 20 tys. zł.');
      const response = a.waitForResponse((res) => res.url().endsWith('/api/adapt'));
      await card.getByRole('button', { name: 'Wygeneruj plan adaptacji' }).click();
      const generated = await response; const plan = await generated.json();
      await card.getByText('Plan adaptacji jest gotowy.', { exact: true }).waitFor();
      check(`A: rzeczywisty plan i pochodzenie ${plan.generation_source}`, generated.ok() && plan.adaptation_plan?.length > 100 && (await card.innerText()).includes(plan.is_ai_generated ? 'Treść wygenerowana przez AI' : 'Szablon awaryjny, nie AI'));
    } else {
      const plan = await api('POST', '/api/adapt', null, { innovation_title: innovation.title, innovation_description: innovation.description, municipality_context: 'Gmina wiejska, CUS i wolontariusze, budżet 20 tys. zł, pilotaż 3 miesiące.' });
      check(`A: niezależna próba API planu (${plan.data.generation_source || plan.status})`, plan.status === 200 && plan.data.adaptation_plan?.length > 100 && typeof plan.data.is_ai_generated === 'boolean');
      console.log(`INFO plan source=${plan.data.generation_source || 'brak'} AI=${plan.data.is_ai_generated === true}; pełna ścieżka demo zablokowana przez matching`);
    }
    await a.goto(origin + '/baza-wiedzy');
    const catalogCard = a.getByRole('article', { name: innovation.title, exact: true }); await catalogCard.waitFor();
    check('A: katalog, źródło i oznaczenie demonstracyjności', await catalogCard.getByRole('link', { name: /Zobacz źródło/ }).count() > 0 && (!innovation.is_demonstrative || (await catalogCard.innerText()).includes('Wzorzec demonstracyjny')));
    await catalogCard.getByRole('link', { name: /Zgłoś pomysł powiązany/ }).click();
    await a.waitForURL('**/kreator?innowacja=*');
    await a.locator('#innovation-hint').waitFor();
    await a.getByRole('heading', { name: innovation.title, exact: true }).waitFor();
    check('A: szczegóły powiązanej innowacji zachowują demonstracyjność', !innovation.is_demonstrative || (await a.locator('main').innerText()).includes('Wzorzec demonstracyjny'));
    await a.locator('#title').fill(title);
    await a.locator('#problem_description').fill(problem);
    await a.locator('#solution_description').fill('Testowe spotkania sąsiedzkie i współpraca z CUS. Rekord końcowej weryfikacji, do usunięcia.');
    await a.locator('#target_group').fill('Samotni seniorzy w gminie');
    await a.locator('#implementation_stage').selectOption('pomysl');
    const savedResponse = a.waitForResponse((res) => res.url().includes('/rest/v1/submissions') && res.request().method() === 'POST');
    await a.getByRole('button', { name: 'Zapisz fiszkę', exact: true }).click();
    const savedRows = await (await savedResponse).json();
    if (savedRows[0]?.id) created.push(['submissions', savedRows[0].id, 'title']);
    await a.getByRole('link', { name: /Zobacz zapisaną fiszkę/ }).waitFor();
    const submission = (await clients.A.from('submissions').select('id').eq('title', title).single()).data;
    assert.ok(submission?.id, 'Brak fiszki w Supabase');
    await a.goto(origin + '/moje-zgloszenia/' + submission.id); await a.reload();
    await a.getByRole('heading', { name: title, exact: true }).waitFor(); check('A: fiszka trwała po F5', true);
    await r.goto(origin + '/rops'); await r.getByRole('link', { name: title, exact: true }).waitFor();
    await r.goto(origin + '/rops/zgloszenia/' + submission.id);
    await r.locator('#official-response').fill('TEST odpowiedź oficjalna ROPS etap 7. Prosimy o doprecyzowanie harmonogramu pilotażu.');
    await r.getByRole('button', { name: 'Zapisz oficjalną odpowiedź' }).click();
    await r.getByText('Oficjalna odpowiedź została zapisana i jest dostępna autorowi.', { exact: true }).waitFor();
    await r.locator('#message-body').fill('TEST wiadomość ROPS etap 7: konsultacja pilotażu.');
    await r.getByRole('button', { name: 'Wyślij wiadomość' }).click();
    await r.getByText('TEST wiadomość ROPS etap 7: konsultacja pilotażu.', { exact: true }).waitFor();
    await a.reload(); await a.getByText('TEST odpowiedź oficjalna ROPS etap 7. Prosimy o doprecyzowanie harmonogramu pilotażu.', { exact: true }).waitFor();
    await a.getByText('TEST wiadomość ROPS etap 7: konsultacja pilotażu.', { exact: true }).waitFor(); check('A: odpowiedź i rozmowa ROPS widoczne autorowi po F5', true);
    await b.goto(origin + '/moje-zgloszenia/' + submission.id); await b.getByText(/Zgłoszenie nie istnieje|Nie znaleźliśmy tego zgłoszenia|Brak uprawnień|innego autora/).first().waitFor();
    check('A: autor B nie odczytuje fiszki A', !(await b.locator('main').innerText()).includes(title));
    // Needs: one real record, list + summary + change + author reload.
    await a.goto(origin + '/zglos-potrzebe');
    await a.locator('#problem_summary').fill(title + ' potrzeba'); await a.locator('#detailed_description').fill('TEST etap 7: potrzeba wsparcia dla samotnych seniorów. Do usunięcia.');
    await a.locator('#institution_name').fill('TEST HubMI etap 7'); await a.locator('#institution_type').selectOption('CUS');
    await a.locator('#powiat').selectOption('tarnowski'); await a.locator('#category').selectOption('Seniorzy');
    await a.locator('#target_group').fill('Samotni seniorzy'); await a.locator('#urgency_level').selectOption('niski');
    await a.getByRole('button', { name: 'Zgłoś potrzebę', exact: true }).click();
    await a.getByText(/Usługa przyjęła zgłoszenie potrzeby/).waitFor();
    const need = (await api('GET', '/api/needs/my', 'A')).data.find((n) => n.problem_summary === title + ' potrzeba');
    assert.ok(need?.id, 'Brak potrzeby w bazie'); created.push(['community_needs', need.id, 'problem_summary']);
    await a.goto(origin + '/moje-zgloszenia'); await a.reload();
    await a.getByRole('article', { name: title + ' potrzeba', exact: true }).waitFor(); check('B: potrzeba autora trwała po F5', true);
    const summary = await api('GET', '/api/admin/needs/summary', 'R');
    await r.goto(origin + '/rops/potrzeby');
    let needCard = r.getByRole('article', { name: title + ' potrzeba', exact: true }); await needCard.waitFor();
    await r.getByText(`Zgłoszone potrzeby: ${summary.data.total_needs_reported}`, { exact: true }).waitFor(); check('B: ROPS widzi potrzebę i zgodne zestawienie', true);
    await needCard.locator('summary').click(); await needCard.getByLabel('Status', { exact: true }).selectOption('analizowane');
    await needCard.getByLabel(/Notatka wewnętrzna ROPS/).fill('TEST wewnętrzna notatka etap 7');
    await needCard.getByRole('button', { name: 'Zapisz status' }).click(); await needCard.getByText('Zapisano status „Analizowane”.', { exact: true }).waitFor();
    await a.reload(); needCard = a.getByRole('article', { name: title + ' potrzeba', exact: true }); await needCard.getByText('Analizowane', { exact: true }).waitFor();
    check('B: autor po F5 widzi nowy status, bez notatki ROPS', !(await needCard.innerText()).includes('TEST wewnętrzna notatka etap 7'));
    const hidden = await clients.B.from('community_needs').select('id').eq('id', need.id);
    check('B: potrzeba A niewidoczna autorowi B przez RLS', !hidden.error && hidden.data.length === 0);
    await a.goto(origin + '/baza-wiedzy'); await a.getByRole('article', { name: 'Social Innovation Canvas', exact: true }).waitFor();
    check('Zasobnik: źródła i diagnoza regionalna 2025 dostępne', (await a.locator('main').innerText()).includes('852,6 tys.'));
    check('brak błędów JavaScript w głównych ścieżkach', errors.length === 0);
  } catch (error) {
    checks.push({ name: 'Przebieg przerwany przed potwierdzeniem wszystkich odcinków', pass: false });
    throw error;
  } finally {
    // Service credentials are used only for guarded cleanup of this run's exact IDs.
    const serverEnv = Object.fromEntries(fs.readFileSync(path.join(root, '../backend/.env'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')]));
    const service = createClient(serverEnv.SUPABASE_URL, serverEnv.SUPABASE_KEY, { auth: { persistSession: false } });
    for (const [table, id, marker] of created.reverse()) {
      const before = await service.from(table).select(marker).eq('id', id).single();
      assert.ok(!before.error && before.data[marker].startsWith(title), 'Nieprawidłowy rekord do sprzątania');
      const removed = await service.from(table).delete().eq('id', id);
      assert.ok(!removed.error, 'Sprzątanie nie powiodło się');
      const after = await service.from(table).select('id').eq('id', id);
      assert.ok(!after.error && after.data.length === 0, 'Rekord pozostał po sprzątaniu');
      console.log(`CLEANUP ${table}`);
    }
    if (browser) await browser.close();
    const failed = checks.filter((c) => !c.pass);
    console.log(`WYNIK ${checks.length - failed.length}/${checks.length} PASS`);
    fs.mkdirSync(path.join(root, 'node_modules/.cache/hubmi-stage7'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules/.cache/hubmi-stage7/result.json'), JSON.stringify({ checks, failures: failed.length }, null, 2));
    if (failed.length) process.exitCode = 1;
  }
})().catch((error) => { console.error(`ERROR ${error.message.split('\n')[0]}`); process.exitCode = 1; });

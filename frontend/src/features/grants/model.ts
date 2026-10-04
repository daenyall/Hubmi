/**
 * Wniosek w naborze (Załącznik nr 3 ROPS). Kontrakt: backend/app/models/schemas.py (Grant*),
 * reguły kompletności: backend/app/services/grant_applications.py (submit_grant_application).
 * Backend przekazuje nazwę i wersję wzoru, ale nie definicje pól — układ sekcji odpowiada
 * punktom 1–12 wzoru w wersji 1.0 i walidacji backendu.
 */

export const SUPPORTED_TEMPLATE_VERSION = "1.0";

export const CALL_STATUS_LABELS: Record<string, string> = {
  otwarty: "Otwarty", zamkniety: "Zamknięty", demonstracyjny: "Demonstracyjny",
};
export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  roboczy: "Wersja robocza", zlozony: "Złożony", w_ocenie: "W ocenie", zaakceptowany: "Zaakceptowany", odrzucony: "Odrzucony",
};
export const APPLICANT_TYPE_LABELS: Record<string, string> = {
  osoba_fizyczna: "Osoba fizyczna", podmiot: "Podmiot (instytucja, organizacja)", grupa_nieformalna: "Grupa nieformalna",
};
export const label = (labels: Record<string, string>, value: string) => labels[value] ?? value;

/** Teksty oświadczeń z eksportu backendu (pkt 12). Każde potwierdza się osobno. */
export const DECLARATIONS = [
  ["criminal_liability", "Jestem świadomy/a odpowiedzialności karnej za poświadczenie nieprawdy (art. 297 § 1 Kodeksu karnego)."],
  ["no_double_funding", "Pomysł nie jest finansowany z innych środków w ramach Działania 5.1 FERS (brak podwójnego finansowania)."],
  ["accept_procedures", "Znam i akceptuję procedury naboru Inkubatora Włączenia Społecznego 2.0."],
  ["no_fees", "Nie będę pobierać opłat od uczestników testu innowacji."],
  ["accessibility_dnsh", "Rozwiązanie będzie zgodne z zasadami dostępności, równości szans i zasadą DNSH."],
  ["gdpr", "Wypełnię obowiązki informacyjne wynikające z RODO."],
] as const;
export type DeclarationKey = (typeof DECLARATIONS)[number][0];

/** Punkty 3–8 i 11 wzoru: pole, minimalna długość z walidacji backendu i podpowiedź. */
export const TEXT_SECTIONS = [
  ["innovation_description", "3. Opis innowacji", 20, "Na czym polega rozwiązanie, jaki ma charakter i jak realizuje cel włączenia społecznego."],
  ["innovativeness", "4. Innowacyjność rozwiązania", 20, "Czym różni się od rozwiązań dostępnych w Polsce. Jeśli znasz podobne, wskaż różnice."],
  ["problem_diagnosis", "5. Diagnoza problemu", 20, "Jaki problem społeczny rozwiązujesz. Podaj dane, raporty lub obserwacje i ich źródła."],
  ["target_group_description", "6. Odbiorcy innowacji", 15, "Kim są odbiorcy, ilu ich jest i dlaczego są zagrożeni wykluczeniem społecznym."],
  ["expected_change", "7. Zmiana, jaką wprowadza innowacja", 15, "Co zmieni się w życiu odbiorców i po czym to poznasz."],
  ["future_vision", "8. Wizja przyszłości innowacji", 15, "Jak rozwiązanie może działać po teście: skalowanie, wdrożenie w innych miejscach."],
  ["project_team", "11. Zespół projektowy", 10, "Kto realizuje projekt i jakie ma doświadczenie we wdrażaniu podobnych działań."],
] as const;
export type TextKey = (typeof TEXT_SECTIONS)[number][0];

export interface PlanRow { action_name: string; schedule: string; cost: string; phase: string }
export interface Address { street: string; postal_code: string; city: string }
export interface GrantDraft {
  title: string;
  applicant_type: string;
  person: { first_name: string; last_name: string; email: string; phone: string; address: Address };
  entity: { organization_name: string; nip: string; regon: string; krs: string; email: string; phone: string; address: Address; representative: string };
  group: { partners: string; representative: string; representative_email: string };
  texts: Record<TextKey, string>;
  prep: PlanRow[];
  test: PlanRow[];
  grant_amount: string;
  declarations: Record<DeclarationKey, boolean>;
}

const EMPTY_ADDRESS: Address = { street: "", postal_code: "", city: "" };
export const emptyRow = (): PlanRow => ({ action_name: "", schedule: "", cost: "", phase: "" });
export function emptyDraft(): GrantDraft {
  return {
    title: "", applicant_type: "osoba_fizyczna",
    person: { first_name: "", last_name: "", email: "", phone: "", address: { ...EMPTY_ADDRESS } },
    entity: { organization_name: "", nip: "", regon: "", krs: "", email: "", phone: "", address: { ...EMPTY_ADDRESS }, representative: "" },
    group: { partners: "", representative: "", representative_email: "" },
    texts: Object.fromEntries(TEXT_SECTIONS.map(([k]) => [k, ""])) as Record<TextKey, string>,
    prep: [], test: [], grant_amount: "",
    declarations: Object.fromEntries(DECLARATIONS.map(([k]) => [k, false])) as Record<DeclarationKey, boolean>,
  };
}

// ---------- kwoty ----------
/** Kwota w polskim zapisie: „1 234,50” albo „1234.5”. NaN dla niepoprawnej. */
export function parseAmount(value: string): number {
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}
export const formatPln = (n: number) => n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
export function planTotal(draft: Pick<GrantDraft, "prep" | "test">): number {
  const sum = [...draft.prep, ...draft.test].reduce((acc, row) => acc + (parseAmount(row.cost) || 0), 0);
  return Math.round(sum * 100) / 100;
}

// ---------- mapowanie draft <-> kontrakt ----------
const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {});
const addr = (v: unknown): Address => { const a = rec(v); return { street: s(a.street), postal_code: s(a.postal_code), city: s(a.city) }; };
const amountText = (n: number) => (n ? String(n).replace(".", ",") : "");

export function draftFromApplication(app: GrantApplication): GrantDraft {
  const d = emptyDraft();
  const a = app.applicant_data;
  d.title = app.title;
  d.applicant_type = app.applicant_type in APPLICANT_TYPE_LABELS ? app.applicant_type : "osoba_fizyczna";
  if (d.applicant_type === "osoba_fizyczna") {
    d.person = { first_name: s(a.first_name), last_name: s(a.last_name), email: s(a.email), phone: s(a.phone), address: addr(a.address) };
  } else if (d.applicant_type === "podmiot") {
    d.entity = {
      organization_name: s(a.organization_name), nip: s(a.nip), regon: s(a.regon), krs: s(a.krs), email: s(a.email), phone: s(a.phone),
      address: addr(a.address), representative: s(rec(a.authorized_representative).name),
    };
  } else {
    const partners = Array.isArray(a.partners) ? a.partners.map((p) => s(rec(p).name) || s(p)).filter(Boolean) : [];
    const rep = rec(a.representative);
    d.group = { partners: partners.join("\n"), representative: s(rep.name), representative_email: s(rep.email) };
  }
  for (const [key] of TEXT_SECTIONS) d.texts[key] = app[key];
  const rows = (v: unknown): PlanRow[] => (Array.isArray(v) ? v : []).map((r) => {
    const o = rec(r);
    return { action_name: s(o.action_name), schedule: s(o.schedule), cost: typeof o.cost === "number" ? amountText(o.cost) : s(o.cost), phase: s(o.phase) };
  });
  d.prep = rows(app.action_plan.prep_period);
  d.test = rows(app.action_plan.test_period);
  d.grant_amount = amountText(app.grant_amount);
  for (const [key] of DECLARATIONS) d.declarations[key] = app.declarations[key] === true;
  return d;
}

/** Dane wnioskodawcy tylko dla wybranego typu; pozostałe nie trafiają do zapisu. */
function applicantData(d: GrantDraft): Record<string, unknown> {
  const t = (v: string) => v.trim();
  const address = (a: Address) => ({ street: t(a.street), postal_code: t(a.postal_code), city: t(a.city) });
  if (d.applicant_type === "osoba_fizyczna") {
    return { first_name: t(d.person.first_name), last_name: t(d.person.last_name), email: t(d.person.email), phone: t(d.person.phone), address: address(d.person.address) };
  }
  if (d.applicant_type === "podmiot") {
    return {
      organization_name: t(d.entity.organization_name), nip: t(d.entity.nip), regon: t(d.entity.regon), krs: t(d.entity.krs),
      email: t(d.entity.email), phone: t(d.entity.phone), address: address(d.entity.address), authorized_representative: { name: t(d.entity.representative) },
    };
  }
  return {
    partners: d.group.partners.split("\n").map(t).filter(Boolean).map((name) => ({ name })),
    representative: { name: t(d.group.representative), email: t(d.group.representative_email) },
  };
}

/** Zapis roboczy: pełny stan formularza. Kwoty niepoprawne nie są wysyłane (blokuje je saveErrors). */
export function draftPayload(d: GrantDraft) {
  const row = (r: PlanRow, test: boolean) => ({
    action_name: r.action_name.trim(), schedule: r.schedule.trim(), cost: parseAmount(r.cost) || 0,
    ...(test && r.phase.trim() ? { phase: r.phase.trim() } : {}),
  });
  const confirmed = DECLARATIONS.every(([k]) => d.declarations[k]);
  return {
    title: d.title.trim(),
    applicant_type: d.applicant_type,
    applicant_data: applicantData(d),
    ...Object.fromEntries(TEXT_SECTIONS.map(([k]) => [k, d.texts[k].trim()])),
    action_plan: { prep_period: d.prep.map((r) => row(r, false)), test_period: d.test.map((r) => row(r, true)) },
    grant_amount: parseAmount(d.grant_amount) || 0,
    // all_confirmed sprawdza backend; ustawiamy go wyłącznie, gdy każde oświadczenie zaznaczono ręcznie.
    declarations: { ...Object.fromEntries(DECLARATIONS.map(([k]) => [k, d.declarations[k]])), all_confirmed: confirmed },
  };
}

/** Błędy blokujące sam zapis roboczy (format kwot, długości pól backendu). */
export function saveErrors(d: GrantDraft): string[] {
  const errors: string[] = [];
  if (d.title.length > 255) errors.push("Tytuł może mieć maksymalnie 255 znaków.");
  if (Number.isNaN(parseAmount(d.grant_amount))) errors.push("Wnioskowana kwota: wpisz liczbę, np. 45000 lub 45 000,50.");
  [...d.prep, ...d.test].forEach((r, i) => { if (Number.isNaN(parseAmount(r.cost))) errors.push(`Plan działania, pozycja ${i + 1}: niepoprawny koszt.`); });
  return errors;
}

export interface CallLimits { max_grant_amount: number }
/** Kompletność przed złożeniem — te same reguły co submit_grant_application. Ostateczną decyzję podejmuje backend. */
export function submitErrors(d: GrantDraft, call: CallLimits): string[] {
  const e: string[] = [];
  const t = (v: string) => v.trim();
  if (t(d.title).length < 3) e.push("Pkt 1: podaj tytuł innowacji (co najmniej 3 znaki).");
  const email = (v: string) => /^[^\s@]+@[^\s@]+$/.test(t(v));
  if (d.applicant_type === "osoba_fizyczna") {
    if (!t(d.person.first_name) || !t(d.person.last_name)) e.push("Pkt 2: podaj imię i nazwisko.");
    if (!email(d.person.email)) e.push("Pkt 2: podaj poprawny adres email.");
  } else if (d.applicant_type === "podmiot") {
    if (!t(d.entity.organization_name)) e.push("Pkt 2: podaj nazwę podmiotu.");
    if (!t(d.entity.nip) && !t(d.entity.krs)) e.push("Pkt 2: podaj NIP lub KRS.");
    if (!email(d.entity.email)) e.push("Pkt 2: podaj poprawny adres email podmiotu.");
  } else if (!t(d.group.partners) && !t(d.group.representative)) {
    e.push("Pkt 2: wskaż partnerów grupy lub reprezentanta.");
  }
  for (const [key, name, min] of TEXT_SECTIONS) if (t(d.texts[key]).length < min) e.push(`${name}: wpisz co najmniej ${min} znaków.`);
  const amount = parseAmount(d.grant_amount);
  if (!(amount > 0)) e.push("Pkt 10: wnioskowana kwota musi być większa od zera.");
  else if (amount > call.max_grant_amount) e.push(`Pkt 10: kwota przekracza limit naboru (${formatPln(call.max_grant_amount)}).`);
  const total = planTotal(d);
  if (amount > 0 && Math.abs(total - amount) > 0.01) e.push(`Pkt 9–10: suma kosztów planu (${formatPln(total)}) różni się od wnioskowanej kwoty (${formatPln(amount)}).`);
  if (!DECLARATIONS.every(([k]) => d.declarations[k])) e.push("Pkt 12: potwierdź każde oświadczenie osobno.");
  return e;
}

// ---------- parsery ----------
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, f: string): string => { if (typeof v !== "string") throw new Error(`Niepoprawne pole ${f}.`); return v; };
const optStr = (v: unknown, f: string): string | null => (v === null || v === undefined ? null : str(v, f));
const num = (v: unknown, f: string): number => { if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Niepoprawne pole ${f}.`); return v; };

export interface GrantCall {
  id: string; name: string; template_name: string; template_version: string; status: string;
  description: string | null; max_grant_amount: number; max_prep_months: number; max_test_months: number;
}
export function parseCall(v: unknown): GrantCall {
  if (!isRec(v)) throw new Error("Niepoprawny nabór.");
  return {
    id: str(v.id, "id"), name: str(v.name, "name"), template_name: str(v.template_name, "template_name"),
    template_version: str(v.template_version, "template_version"), status: str(v.status, "status"),
    description: optStr(v.description, "description"), max_grant_amount: num(v.max_grant_amount, "max_grant_amount"),
    max_prep_months: num(v.max_prep_months, "max_prep_months"), max_test_months: num(v.max_test_months, "max_test_months"),
  };
}
export const parseCalls = (v: unknown): GrantCall[] => { if (!Array.isArray(v)) throw new Error("Oczekiwano listy naborów."); return v.map(parseCall); };

export interface GrantApplication {
  id: string; call_id: string; call_name: string | null; call_status: string | null; user_id: string; status: string;
  applicant_type: string; title: string; applicant_data: Record<string, unknown>;
  innovation_description: string; innovativeness: string; problem_diagnosis: string; target_group_description: string;
  expected_change: string; future_vision: string; project_team: string;
  action_plan: { prep_period: unknown[]; test_period: unknown[] };
  grant_amount: number; total_costs_calculated: number; is_budget_balanced: boolean;
  declarations: Record<string, unknown>; submitted_at: string | null; rops_notes: string | null;
  created_at: string | null; updated_at: string | null;
}
export function parseApplication(v: unknown): GrantApplication {
  if (!isRec(v) || !isRec(v.applicant_data) || !isRec(v.action_plan) || !isRec(v.declarations) || typeof v.is_budget_balanced !== "boolean") throw new Error("Niepoprawny wniosek.");
  const plan = v.action_plan;
  return {
    id: str(v.id, "id"), call_id: str(v.call_id, "call_id"), call_name: optStr(v.call_name, "call_name"), call_status: optStr(v.call_status, "call_status"),
    user_id: str(v.user_id, "user_id"), status: str(v.status, "status"), applicant_type: str(v.applicant_type, "applicant_type"),
    title: str(v.title, "title"), applicant_data: v.applicant_data,
    innovation_description: str(v.innovation_description, "innovation_description"), innovativeness: str(v.innovativeness, "innovativeness"),
    problem_diagnosis: str(v.problem_diagnosis, "problem_diagnosis"), target_group_description: str(v.target_group_description, "target_group_description"),
    expected_change: str(v.expected_change, "expected_change"), future_vision: str(v.future_vision, "future_vision"),
    project_team: str(v.project_team, "project_team"),
    action_plan: { prep_period: Array.isArray(plan.prep_period) ? plan.prep_period : [], test_period: Array.isArray(plan.test_period) ? plan.test_period : [] },
    grant_amount: num(v.grant_amount, "grant_amount"), total_costs_calculated: num(v.total_costs_calculated, "total_costs_calculated"),
    is_budget_balanced: v.is_budget_balanced, declarations: v.declarations,
    submitted_at: optStr(v.submitted_at, "submitted_at"), rops_notes: optStr(v.rops_notes, "rops_notes"),
    created_at: optStr(v.created_at, "created_at"), updated_at: optStr(v.updated_at, "updated_at"),
  };
}
export const parseApplications = (v: unknown): GrantApplication[] => { if (!Array.isArray(v)) throw new Error("Oczekiwano listy wniosków."); return v.map(parseApplication); };

export interface GrantExport { application_id: string; call_name: string; template_name: string; template_version: string; status: string; text: string; application: GrantApplication }
export function parseExport(v: unknown): GrantExport {
  if (!isRec(v)) throw new Error("Niepoprawny eksport.");
  return {
    application_id: str(v.application_id, "application_id"), call_name: str(v.call_name, "call_name"),
    template_name: str(v.template_name, "template_name"), template_version: str(v.template_version, "template_version"),
    status: str(v.status, "status"), text: str(v.formatted_document_text, "formatted_document_text"),
    application: parseApplication(v.structured_data),
  };
}

/** 422 z submit: { detail: { message, errors[] } }; 422 Pydantic: lista; 400: tekst. */
export function submitDetail(data: unknown): string[] {
  if (!isRec(data)) return [];
  const d = data.detail;
  if (typeof d === "string") return [d];
  if (isRec(d) && Array.isArray(d.errors)) return d.errors.filter((x): x is string => typeof x === "string");
  return [];
}

/**
 * Nagłówek pliku eksportu. Wzór backendu wygląda jak oficjalny formularz ROPS, więc przy naborze
 * demonstracyjnym dopisujemy jednoznaczne zastrzeżenie, zanim plik opuści aplikację.
 */
export function exportFileText(exp: GrantExport, callStatus: string | null): string {
  const notice = callStatus === "otwarty" ? "" : "UWAGA: WERSJA DEMONSTRACYJNA HubMI. Ten dokument nie jest wnioskiem złożonym w oficjalnym konkursie ROPS.\n\n";
  return notice + exp.text;
}

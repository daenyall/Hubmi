/** Model zgłoszeń potrzeb (punkt 7). Kontrakt: backend/app/models/schemas.py, CommunityNeed*. */

export const INSTITUTION_TYPES = ["JST", "CUS", "OPS", "NGO", "Mieszkaniec", "Inna"] as const;

/**
 * Powiaty Małopolski. Backend zapisuje powiat małymi literami i agreguje po dokładnej
 * wartości, więc lista zamknięta zapobiega rozbiciu jednego powiatu na kilka wariantów pisowni.
 */
export const POWIATS: ReadonlyArray<readonly [string, string]> = [
  ["bocheński", "bocheński"], ["brzeski", "brzeski"], ["chrzanowski", "chrzanowski"],
  ["dąbrowski", "dąbrowski"], ["gorlicki", "gorlicki"], ["krakowski", "krakowski"],
  ["limanowski", "limanowski"], ["miechowski", "miechowski"], ["myślenicki", "myślenicki"],
  ["nowosądecki", "nowosądecki"], ["nowotarski", "nowotarski"], ["olkuski", "olkuski"],
  ["oświęcimski", "oświęcimski"], ["proszowicki", "proszowicki"], ["suski", "suski"],
  ["tarnowski", "tarnowski"], ["tatrzański", "tatrzański"], ["wadowicki", "wadowicki"],
  ["wielicki", "wielicki"],
  ["kraków", "Kraków (miasto na prawach powiatu)"],
  ["nowy sącz", "Nowy Sącz (miasto na prawach powiatu)"],
  ["tarnów", "Tarnów (miasto na prawach powiatu)"],
];
const POWIAT_LABELS = new Map(POWIATS);
export function powiatLabel(value: string): string {
  return POWIAT_LABELS.get(value) ?? value;
}

/** Te same nazwy co w katalogu innowacji, by agregacja potrzeb dała się zestawić z bazą wiedzy. */
export const NEED_CATEGORIES = [
  "Seniorzy", "Dostępność", "Zdrowie psychiczne", "Młodzież", "Wsparcie rodziny",
  "Integracja społeczna", "Pomoc społeczna", "Usługi publiczne", "Włączenie cyfrowe", "Inne",
] as const;

export const URGENCY_LABELS: Record<string, string> = {
  niski: "Niska", sredni: "Średnia", wysoki: "Wysoka", krytyczny: "Krytyczna",
};
export const NEED_STATUS_LABELS: Record<string, string> = {
  nowe: "Nowe",
  analizowane: "Analizowane",
  uwzglednione_w_naborze: "Uwzględnione w naborze",
  zaadresowane: "Zaadresowane",
  odrzucone: "Odrzucone",
};
export const label = (labels: Record<string, string>, value: string) => labels[value] ?? value;

/** Limity pól jak w CommunityNeedCreate. */
export const NEED_LIMITS = {
  institution_name: [2, 250], powiat: [2, 100], gmina: [0, 100], contact_email: [0, 150],
  contact_phone: [0, 50], category: [2, 100], target_group: [2, 250],
  problem_summary: [3, 250], detailed_description: [10, 5000],
} as const;
export const MAX_AFFECTED = 1_000_000;

export interface NeedDraft {
  institution_name: string; institution_type: string; powiat: string; gmina: string;
  contact_email: string; contact_phone: string; category: string; target_group: string;
  problem_summary: string; detailed_description: string; estimated_affected_count: string;
  urgency_level: string;
}
export type NeedErrors = Partial<Record<keyof NeedDraft, string>>;
export const EMPTY_NEED: NeedDraft = {
  institution_name: "", institution_type: "JST", powiat: "", gmina: "", contact_email: "", contact_phone: "",
  category: "", target_group: "", problem_summary: "", detailed_description: "",
  estimated_affected_count: "", urgency_level: "sredni",
};
/** Kolejność pól w formularzu — pierwszy błąd dostaje fokus. */
export const NEED_FIELD_ORDER: (keyof NeedDraft)[] = [
  "problem_summary", "detailed_description", "category", "target_group", "urgency_level",
  "estimated_affected_count", "institution_name", "institution_type", "powiat", "gmina",
  "contact_email", "contact_phone",
];

export function validateNeed(draft: NeedDraft): NeedErrors {
  const errors: NeedErrors = {};
  const text = (key: keyof typeof NEED_LIMITS, name: string) => {
    const value = draft[key].trim();
    const [min, max] = NEED_LIMITS[key];
    if (min > 0 && value.length < min) errors[key] = `${name}: wpisz co najmniej ${min} znaki.`;
    else if (value.length > max) errors[key] = `${name}: maksymalnie ${max} znaków.`;
  };
  text("problem_summary", "Krótki opis problemu");
  text("detailed_description", "Szczegółowy opis");
  text("target_group", "Kogo dotyczy problem");
  text("institution_name", "Nazwa instytucji lub zgłaszającego");
  text("gmina", "Gmina");
  text("contact_email", "Email");
  text("contact_phone", "Telefon");
  if (!NEED_CATEGORIES.includes(draft.category as never)) errors.category = "Wybierz kategorię problemu.";
  if (!POWIAT_LABELS.has(draft.powiat)) errors.powiat = "Wybierz powiat.";
  if (!INSTITUTION_TYPES.includes(draft.institution_type as never)) errors.institution_type = "Wybierz typ zgłaszającego.";
  if (!(draft.urgency_level in URGENCY_LABELS)) errors.urgency_level = "Wybierz pilność.";
  const email = draft.contact_email.trim();
  if (email && !errors.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.contact_email = "Podaj poprawny adres email albo zostaw pole puste.";
  const count = draft.estimated_affected_count.trim();
  if (count && (!/^\d+$/.test(count) || Number(count) > MAX_AFFECTED)) errors.estimated_affected_count = `Podaj liczbę całkowitą od 0 do ${MAX_AFFECTED.toLocaleString("pl-PL")} albo zostaw pole puste.`;
  return errors;
}

/** Puste pola opcjonalne nie są wysyłane; honeypot zawsze pusty. Status nadaje backend. */
export function needPayload(draft: NeedDraft) {
  const optional = (value: string) => value.trim() || undefined;
  return {
    institution_name: draft.institution_name.trim(),
    institution_type: draft.institution_type,
    powiat: draft.powiat,
    gmina: optional(draft.gmina),
    contact_email: optional(draft.contact_email),
    contact_phone: optional(draft.contact_phone),
    category: draft.category,
    target_group: draft.target_group.trim(),
    problem_summary: draft.problem_summary.trim(),
    detailed_description: draft.detailed_description.trim(),
    estimated_affected_count: draft.estimated_affected_count.trim() ? Number(draft.estimated_affected_count.trim()) : 0,
    urgency_level: draft.urgency_level,
  };
}

// ---------- parsery odpowiedzi ----------
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, field: string): string => {
  if (typeof v !== "string") throw new Error(`Niepoprawne pole ${field}.`);
  return v;
};
const optStr = (v: unknown, field: string): string | null => (v === null || v === undefined ? null : str(v, field));
const int = (v: unknown, field: string): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new Error(`Niepoprawne pole ${field}.`);
  return v;
};
const num = (v: unknown, field: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Niepoprawne pole ${field}.`);
  return v;
};
const counts = (v: unknown, field: string): Record<string, number> => {
  if (!isRecord(v)) throw new Error(`Niepoprawne pole ${field}.`);
  return Object.fromEntries(Object.entries(v).map(([k, n]) => [k, int(n, field)]));
};

export interface SubmitReceipt { id: string; status: string; message: string }
export function parseReceipt(value: unknown): SubmitReceipt {
  if (!isRecord(value)) throw new Error("Niepoprawna odpowiedź zapisu.");
  const id = str(value.id, "id").trim();
  if (!id) throw new Error("Brak identyfikatora zapisu.");
  return { id, status: str(value.status, "status"), message: optStr(value.message, "message") ?? "" };
}

export interface Need {
  id: string; user_id: string | null; created_at: string; institution_name: string; institution_type: string;
  powiat: string; gmina: string | null; contact_email: string | null; contact_phone: string | null;
  category: string; target_group: string; problem_summary: string; detailed_description: string;
  estimated_affected_count: number; urgency_level: string; status: string;
  rops_internal_notes: string | null; reviewed_at: string | null;
}
export function parseNeed(value: unknown): Need {
  if (!isRecord(value)) throw new Error("Niepoprawny rekord potrzeby.");
  return {
    id: str(value.id, "id"), user_id: optStr(value.user_id, "user_id"), created_at: str(value.created_at, "created_at"),
    institution_name: str(value.institution_name, "institution_name"), institution_type: str(value.institution_type, "institution_type"),
    powiat: str(value.powiat, "powiat"), gmina: optStr(value.gmina, "gmina"),
    contact_email: optStr(value.contact_email, "contact_email"), contact_phone: optStr(value.contact_phone, "contact_phone"),
    category: str(value.category, "category"), target_group: str(value.target_group, "target_group"),
    problem_summary: str(value.problem_summary, "problem_summary"), detailed_description: str(value.detailed_description, "detailed_description"),
    estimated_affected_count: int(value.estimated_affected_count ?? 0, "estimated_affected_count"),
    urgency_level: str(value.urgency_level, "urgency_level"), status: str(value.status, "status"),
    rops_internal_notes: optStr(value.rops_internal_notes, "rops_internal_notes"), reviewed_at: optStr(value.reviewed_at, "reviewed_at"),
  };
}
export function parseNeeds(value: unknown): Need[] {
  if (!Array.isArray(value)) throw new Error("Oczekiwano listy potrzeb.");
  return value.map(parseNeed);
}

export interface Share { name: string; count: number; percentage: number }
export interface Cluster { category: string; powiat: string; reported_count: number; urgency_level: string; recommended_action: string }
export interface NeedsSummary {
  total: number; period_days: number | null; by_status: Record<string, number>; by_urgency: Record<string, number>;
  categories: Share[]; powiats: Share[]; clusters: Cluster[];
}
function parseCluster(v: unknown): Cluster {
  if (!isRecord(v)) throw new Error("Niepoprawny rekord skupiska.");
  return {
    category: str(v.category, "category"), powiat: str(v.powiat, "powiat"),
    reported_count: int(v.reported_count, "reported_count"), urgency_level: str(v.urgency_level, "urgency_level"),
    recommended_action: str(v.recommended_action, "recommended_action"),
  };
}
const list = <T,>(v: unknown, parse: (x: unknown) => T, field: string): T[] => {
  if (!Array.isArray(v)) throw new Error(`Niepoprawne pole ${field}.`);
  return v.map(parse);
};
export function parseSummary(value: unknown): NeedsSummary {
  if (!isRecord(value)) throw new Error("Niepoprawne zestawienie potrzeb.");
  const share = (key: "category" | "powiat") => (v: unknown): Share => {
    if (!isRecord(v)) throw new Error("Niepoprawny wiersz zestawienia.");
    return { name: str(v[key], key), count: int(v.count, "count"), percentage: num(v.percentage, "percentage") };
  };
  return {
    total: int(value.total_needs_reported, "total_needs_reported"),
    period_days: value.filtered_period_days === null || value.filtered_period_days === undefined ? null : int(value.filtered_period_days, "filtered_period_days"),
    by_status: counts(value.needs_by_status, "needs_by_status"),
    by_urgency: counts(value.needs_by_urgency, "needs_by_urgency"),
    categories: list(value.top_categories, share("category"), "top_categories"),
    powiats: list(value.top_powiats, share("powiat"), "top_powiats"),
    clusters: list(value.emerging_hotspots, parseCluster, "emerging_hotspots"),
  };
}

export interface PeriodRow { name: string; current: number; previous: number }
export interface Period { start: string; end: string; total: number }
export interface NeedsTrends { period_days: number; current: Period; previous: Period; categories: PeriodRow[]; powiats: PeriodRow[] }
/**
 * Pola `trend`, `growth_percentage` i `emerging_hotspots` z backendu pomijamy celowo:
 * backend nazywa „wzrostowym” nawet 1 zgłoszenie wobec 0. Kierunek liczy describeChange.
 */
export function parseTrends(value: unknown): NeedsTrends {
  if (!isRecord(value)) throw new Error("Niepoprawne porównanie okresów.");
  const row = (v: unknown): PeriodRow => {
    if (!isRecord(v)) throw new Error("Niepoprawny wiersz porównania.");
    return { name: str(v.name, "name"), current: int(v.current_count, "current_count"), previous: int(v.previous_count, "previous_count") };
  };
  const period = (v: unknown, field: string): Period => {
    if (!isRecord(v)) throw new Error(`Niepoprawne pole ${field}.`);
    return { start: str(v.start, `${field}.start`), end: str(v.end, `${field}.end`), total: int(v.total, `${field}.total`) };
  };
  return {
    period_days: int(value.period_days, "period_days"),
    current: period(value.current_period, "current_period"),
    previous: period(value.previous_period, "previous_period"),
    categories: list(value.category_trends, row, "category_trends"),
    powiats: list(value.powiat_trends, row, "powiat_trends"),
  };
}

/** Kierunek zmiany pokazujemy dopiero przy tylu zgłoszeniach łącznie w obu okresach. */
export const MIN_SAMPLE_FOR_DIRECTION = 5;
/** Skupisko (kategoria + powiat) pokazujemy dopiero od tylu zgłoszeń. */
export const MIN_CLUSTER_SIZE = 3;

export interface Change { difference: string; direction: string }
export function describeChange(current: number, previous: number): Change {
  const diff = current - previous;
  const difference = diff > 0 ? `+${diff}` : String(diff);
  const sample = current + previous;
  if (sample < MIN_SAMPLE_FOR_DIRECTION) {
    return { difference, direction: `Za mało zgłoszeń (${sample}), by ocenić kierunek` };
  }
  if (diff === 0) return { difference, direction: "Bez zmian" };
  if (previous === 0) return { difference, direction: "Więcej zgłoszeń — w poprzednim okresie nie było żadnego" };
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  return { difference, direction: diff > 0 ? `Więcej zgłoszeń o ${pct}%` : `Mniej zgłoszeń o ${pct}%` };
}

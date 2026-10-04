/**
 * Zasoby Zasobnika Wiedzy z trwałej tabeli knowledge_resources (migracja 11).
 * Kontrakt: backend/app/models/schemas.py — KnowledgeResource*.
 * Publicznie widoczne są wyłącznie rekordy „opublikowany”; resztę widzi tylko ROPS.
 */
import { isSafeResourceUrl } from "./resources";

export const RESOURCE_GROUPS_META = [
  ["mapa-wyzwan", "Mapa Wyzwań Społecznych"],
  ["raporty-diagnozy", "Raporty i diagnozy społeczne"],
  ["materialy-edukacyjne", "Materiały edukacyjne o innowacjach społecznych"],
  ["filmy-i-dobre-praktyki", "Filmy i dobre praktyki"],
] as const;
export type ResourceGroupId = (typeof RESOURCE_GROUPS_META)[number][0];
const GROUP_TITLES = new Map<string, string>(RESOURCE_GROUPS_META);
export const groupTitle = (id: string) => GROUP_TITLES.get(id) ?? id;

/** Rodzaje z opisu pola `kind` w kontrakcie. */
export const RESOURCE_KINDS = [
  "Dokument PDF", "Plansza PDF", "Raport roczny", "Pliki do pobrania", "Serwis z danymi",
  "Katalog na stronie ROPS", "Strona tematyczna", "Materiał filmowy (wideo)",
] as const;

/** Zasięg danych: lista zamknięta, żeby dane ogólnopolskie nie udawały regionalnych. */
export const COVERAGE_SCOPES = ["woj. małopolskie", "lokalny (gmina lub powiat)", "ogólnopolski", "regionalny i krajowy"] as const;

export const RESOURCE_STATUS_LABELS: Record<string, string> = {
  roboczy: "Szkic", do_weryfikacji: "Do weryfikacji", zweryfikowany: "Zweryfikowany", opublikowany: "Opublikowany",
};
export const PUBLISHED = "opublikowany";
export const label = (labels: Record<string, string>, value: string) => labels[value] ?? value;

/** Zasięg ogólnopolski lub mieszany — widok musi to powiedzieć wprost. */
export function isNationalScope(scope: string | null): boolean {
  return !!scope && /ogólnopolsk|krajow/i.test(scope);
}

export interface Resource {
  id: string; title: string; description: string; group_id: string; group_title: string | null; kind: string; url: string;
  year: number | null; coverage_scope: string | null; caveat: string | null; status: string;
  verified_at: string | null; published_at: string | null; created_at: string; updated_at: string;
}
export interface ResourceGroup { id: string; title: string; intro: string; items: Resource[] }

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, f: string): string => { if (typeof v !== "string") throw new Error(`Niepoprawne pole ${f}.`); return v; };
const optStr = (v: unknown, f: string): string | null => (v === null || v === undefined ? null : str(v, f));

export function parseResource(v: unknown): Resource {
  if (!isRec(v)) throw new Error("Niepoprawny zasób.");
  const year = v.year === null || v.year === undefined ? null : v.year;
  if (year !== null && (typeof year !== "number" || !Number.isInteger(year))) throw new Error("Niepoprawne pole year.");
  return {
    id: str(v.id, "id"), title: str(v.title, "title"), description: str(v.description, "description"),
    group_id: str(v.group_id, "group_id"), group_title: optStr(v.group_title, "group_title"), kind: str(v.kind, "kind"),
    url: str(v.url, "url"), year, coverage_scope: optStr(v.coverage_scope, "coverage_scope"), caveat: optStr(v.caveat, "caveat"),
    status: str(v.status, "status"), verified_at: optStr(v.verified_at, "verified_at"), published_at: optStr(v.published_at, "published_at"),
    created_at: str(v.created_at, "created_at"), updated_at: str(v.updated_at, "updated_at"),
  };
}
export const parseResources = (v: unknown): Resource[] => { if (!Array.isArray(v)) throw new Error("Oczekiwano listy zasobów."); return v.map(parseResource); };

/**
 * Widok publiczny: tylko „opublikowany” i bezpieczny HTTPS — nawet gdyby usługa zwróciła
 * coś innego, szkic nie trafi na stronę.
 */
export function parseGroups(v: unknown): ResourceGroup[] {
  if (!Array.isArray(v)) throw new Error("Oczekiwano grup zasobów.");
  return v.map((g) => {
    if (!isRec(g)) throw new Error("Niepoprawna grupa.");
    return {
      id: str(g.id, "id"), title: str(g.title, "title"), intro: str(g.intro, "intro"),
      items: parseResources(g.items).filter((r) => r.status === PUBLISHED && isSafeResourceUrl(r.url)),
    };
  });
}

export interface ResourceDraft {
  title: string; description: string; group_id: string; kind: string; url: string; year: string; coverage_scope: string; caveat: string;
}
export type ResourceErrors = Partial<Record<keyof ResourceDraft, string>>;
export const RESOURCE_FIELD_ORDER: (keyof ResourceDraft)[] = ["title", "description", "group_id", "kind", "url", "year", "coverage_scope", "caveat"];
export const emptyResourceDraft = (): ResourceDraft => ({
  title: "", description: "", group_id: "raporty-diagnozy", kind: "Dokument PDF", url: "", year: "", coverage_scope: "", caveat: "",
});
export function draftFromResource(r: Resource): ResourceDraft {
  return {
    title: r.title, description: r.description, group_id: r.group_id, kind: r.kind, url: r.url,
    year: r.year === null ? "" : String(r.year), coverage_scope: r.coverage_scope ?? "", caveat: r.caveat ?? "",
  };
}

export function validateResource(d: ResourceDraft, now = new Date()): ResourceErrors {
  const e: ResourceErrors = {};
  const t = (v: string) => v.trim();
  if (t(d.title).length < 3 || t(d.title).length > 300) e.title = "Tytuł: od 3 do 300 znaków.";
  if (t(d.description).length < 10 || t(d.description).length > 10000) e.description = "Opis: od 10 do 10 000 znaków. Opisz, co zawiera materiał, na podstawie samego źródła.";
  if (!GROUP_TITLES.has(d.group_id)) e.group_id = "Wybierz grupę.";
  if (!RESOURCE_KINDS.includes(d.kind as never)) e.kind = "Wybierz rodzaj.";
  if (!isSafeResourceUrl(t(d.url))) e.url = "Podaj pełny adres HTTPS, bez loginu i hasła w adresie.";
  const year = t(d.year);
  if (!/^\d{4}$/.test(year) || Number(year) < 1990 || Number(year) > now.getFullYear()) e.year = `Podaj rok opracowania danych ze źródła (1990–${now.getFullYear()}).`;
  if (!COVERAGE_SCOPES.includes(d.coverage_scope as never)) e.coverage_scope = "Wybierz zasięg danych podany w źródle.";
  if (d.caveat.length > 2000) e.caveat = "Zastrzeżenie: maksymalnie 2000 znaków.";
  return e;
}

/**
 * Treść zasobu bez statusu: nowy rekord jest zawsze szkicem, a status zmieniają wyłącznie
 * operacje weryfikacji i publikacji. Pusta uwaga to null.
 */
export function resourcePayload(d: ResourceDraft) {
  return {
    title: d.title.trim(), description: d.description.trim(), group_id: d.group_id, group_title: groupTitle(d.group_id),
    kind: d.kind, url: d.url.trim(), year: Number(d.year.trim()), coverage_scope: d.coverage_scope, caveat: d.caveat.trim() || null,
  };
}

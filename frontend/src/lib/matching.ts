/** Kontrakt backendu: backend/app/models/schemas.py (POST /api/match). */
export const MIN_PROBLEM_LENGTH = 3;
export const MAX_PROBLEM_LENGTH = 2000;

export interface MatchRequest {
  problem_description: string;
  threshold?: number | null;
  limit?: number | null;
}

export interface BackendMatchItem {
  id: string;
  title: string;
  similarity_score: number;
  why_relevant?: string | null;
  source_url?: string | null;
  target_group?: string | null;
  category?: string | null;
  description?: string | null;
  status: string;
}

export interface BackendMatchResponse {
  matches: BackendMatchItem[];
  query?: string | null;
  total_found: number;
  no_match_advice?: string | null;
  suggested_categories?: string[] | null;
  can_submit_as_new_challenge?: boolean;
  // Rozszerzenie frontendu do uzgodnienia; obecny backend nie zwraca materiałów.
  related_resources?: MatchItem[];
}

/** Model kart interfejsu, normalizowany z kontraktu backendu. */
export interface MatchItem {
  id: string;
  title: string;
  description: string;
  source_url: string | null;
  reason: string;
  audience?: string | string[];
  tags?: string[];
  /** is_demonstrative z backendu: syntetyczny wzorzec MVP, nie rekord z bazy ROPS. */
  demonstrative?: boolean;
}

export interface MatchResponse {
  matches: MatchItem[];
  related_resources: MatchItem[];
  /** no_match_advice backendu; pusty ciąg, gdy backend nie przysłał porady. */
  advice: string;
  /** suggested_categories backendu; podpowiedzi do przeformułowania opisu. */
  categories: string[];
  /** can_submit_as_new_challenge; bez jawnego true nie proponujemy zgłoszenia. */
  can_submit_challenge: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function isOptionalText(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === "string";
}
function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isText);
}
function isOptionalTextList(value: unknown): value is string[] | null | undefined {
  return value === null || value === undefined || isTextList(value);
}
function isSourceUrl(value: unknown): value is string | null | undefined {
  if (value === null || value === undefined || value === "") return true;
  if (!isText(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseInnovation(value: unknown): MatchItem {
  if (
    !isRecord(value) || !isText(value.id) || !isText(value.title) ||
    typeof value.similarity_score !== "number" || !Number.isFinite(value.similarity_score) ||
    !isText(value.status) || !isSourceUrl(value.source_url) ||
    !isOptionalText(value.description) || !isOptionalText(value.why_relevant) ||
    !isOptionalText(value.target_group) || !isOptionalText(value.category)
  ) throw new Error("Niepoprawny rekord matchmakingu.");
  return {
    id: value.id.trim(),
    title: value.title.trim(),
    description: value.description?.trim() ?? "",
    reason: value.why_relevant?.trim() ?? "",
    source_url: value.source_url?.trim() || null,
    ...(value.target_group?.trim() ? { audience: value.target_group.trim() } : {}),
    ...(value.category?.trim() ? { tags: [value.category.trim()] } : {}),
    ...(value.is_demonstrative === true ? { demonstrative: true } : {}),
  };
}

function parseResource(value: unknown): MatchItem {
  if (
    !isRecord(value) || !isText(value.id) || !isText(value.title) ||
    !isText(value.description) || !isText(value.reason) || !isSourceUrl(value.source_url) ||
    (value.audience !== undefined && !isText(value.audience) && !isTextList(value.audience)) ||
    (value.tags !== undefined && !isTextList(value.tags))
  ) throw new Error("Niepoprawny rekord materiału.");
  return {
    id: value.id.trim(), title: value.title.trim(),
    description: value.description.trim(), reason: value.reason.trim(),
    source_url: value.source_url?.trim() || null,
    ...(value.audience !== undefined ? { audience: value.audience } : {}),
    ...(value.tags !== undefined ? { tags: value.tags } : {}),
  };
}

function parseItems(value: unknown, parse: (item: unknown) => MatchItem): MatchItem[] {
  if (!Array.isArray(value)) throw new Error("Oczekiwano listy wyników.");
  const items = value.map(parse);
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("Identyfikatory wyników muszą być unikalne w obrębie listy.");
  }
  return items;
}

/** Nie wyświetlamy similarity_score jako prawdopodobieństwa ani statusu jako certyfikacji. */
export function parseMatchResponse(value: unknown): MatchResponse {
  if (
    !isRecord(value) || !Number.isInteger(value.total_found) ||
    (value.total_found as number) < 0 || !isOptionalText(value.query) ||
    !isOptionalText(value.no_match_advice) || !isOptionalTextList(value.suggested_categories) ||
    !(value.can_submit_as_new_challenge === undefined || typeof value.can_submit_as_new_challenge === "boolean")
  ) throw new Error("Niepoprawna odpowiedź matchmakingu.");
  return {
    matches: parseItems(value.matches, parseInnovation),
    related_resources: value.related_resources === undefined
      ? [] : parseItems(value.related_resources, parseResource),
    advice: value.no_match_advice?.trim() ?? "",
    categories: [...new Set((value.suggested_categories ?? []).map((name) => name.trim()).filter(Boolean))],
    can_submit_challenge: value.can_submit_as_new_challenge === true,
  };
}

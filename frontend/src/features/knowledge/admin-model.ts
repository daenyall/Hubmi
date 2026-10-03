/** Model panelu zarządzania bazą wiedzy ROPS. Pola techniczne backendu nie należą do modelu. */
export const KNOWLEDGE_PAGE_SIZE = 100;
export const PUBLISHED_STATUS = "sprawdzone";
export const KNOWLEDGE_STATUSES = ["nowa", "weryfikacja", "sprawdzone"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];
export const KNOWLEDGE_STATUS_LABELS: Record<KnowledgeStatus, string> = {
  nowa: "Nowa",
  weryfikacja: "W weryfikacji",
  sprawdzone: "Sprawdzone",
};
/** Limity odpowiadają schematom InnovationCreate/InnovationUpdate backendu. */
export const FIELD_LIMITS = { title: 200, description: 10000, target_group: 4000, category: 200, why_relevant: 10000, source_url: 2000 } as const;

export interface AdminInnovation {
  id: string; title: string; description: string; target_group: string;
  category: string; why_relevant: string; source_url: string; status: string;
}
export type InnovationDraft = Omit<AdminInnovation, "id">;
export type DraftErrors = Partial<Record<keyof InnovationDraft, string>>;

export const FIELD_LABELS: Record<keyof InnovationDraft, string> = {
  title: "Nazwa innowacji", description: "Opis", target_group: "Grupa docelowa",
  category: "Kategoria", why_relevant: "Dlaczego warto", source_url: "Źródło", status: "Status",
};

/** Identyfikator nadaje backend; dopuszczamy wyłącznie postać bezpieczną w ścieżce URL. */
export function isInnovationId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

export function isPublicHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch { return false; }
}

export function statusLabel(status: string): string {
  return Object.hasOwn(KNOWLEDGE_STATUS_LABELS, status)
    ? KNOWLEDGE_STATUS_LABELS[status as KnowledgeStatus]
    : `Status z bazy: ${status || "nie podano"}`;
}

function text(value: unknown, field: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`Niepoprawne pole innowacji: ${field}.`);
  return value.trim();
}

/** similarity_score z MatchItem jest stałą backendu, nie trafnością — pomijamy go. */
export function parseAdminInnovation(value: unknown): AdminInnovation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Niepoprawny rekord innowacji.");
  const row = value as Record<string, unknown>;
  const id = text(row.id, "id");
  const title = text(row.title, "title");
  if (!id) throw new Error("Rekord innowacji bez identyfikatora.");
  if (!title) throw new Error("Rekord innowacji bez nazwy.");
  return {
    id, title,
    description: text(row.description, "description"),
    target_group: text(row.target_group, "target_group"),
    category: text(row.category, "category"),
    why_relevant: text(row.why_relevant, "why_relevant"),
    source_url: text(row.source_url, "source_url"),
    status: text(row.status, "status"),
  };
}

export function parseAdminList(value: unknown): AdminInnovation[] {
  if (!Array.isArray(value)) throw new Error("Oczekiwano listy innowacji.");
  const items = value.map((row) => parseAdminInnovation(row));
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error("Powtórzone identyfikatory na stronie listy.");
  return items;
}

export function emptyDraft(): InnovationDraft {
  return { title: "", description: "", target_group: "", category: "", why_relevant: "", source_url: "", status: "nowa" };
}

export function draftFromRecord(record: AdminInnovation): InnovationDraft {
  return {
    title: record.title, description: record.description, target_group: record.target_group,
    category: record.category, why_relevant: record.why_relevant, source_url: record.source_url,
    status: record.status,
  };
}

/** Wartości wysyłane do API: przycięte, bez pól technicznych i bez identyfikatora. */
export function draftPayload(draft: InnovationDraft): InnovationDraft {
  return {
    title: draft.title.trim(), description: draft.description.trim(),
    target_group: draft.target_group.trim(), category: draft.category.trim(),
    why_relevant: draft.why_relevant.trim(), source_url: draft.source_url.trim(),
    status: draft.status.trim(),
  };
}

export function validateDraft(draft: InnovationDraft): DraftErrors {
  const payload = draftPayload(draft);
  const errors: DraftErrors = {};
  if (payload.title.length < 3) errors.title = "Podaj nazwę innowacji — co najmniej 3 znaki.";
  else if (payload.title.length > FIELD_LIMITS.title) errors.title = `Nazwa może mieć maksymalnie ${FIELD_LIMITS.title} znaków.`;
  if (payload.description.length < 10) errors.description = "Opisz innowację — co najmniej 10 znaków.";
  else if (payload.description.length > FIELD_LIMITS.description) errors.description = `Opis może mieć maksymalnie ${FIELD_LIMITS.description} znaków.`;
  if (payload.target_group.length < 3) errors.target_group = "Podaj grupę docelową — co najmniej 3 znaki.";
  else if (payload.target_group.length > FIELD_LIMITS.target_group) errors.target_group = `Grupa docelowa może mieć maksymalnie ${FIELD_LIMITS.target_group} znaków.`;
  if (!payload.category) errors.category = "Podaj kategorię innowacji.";
  else if (payload.category.length > FIELD_LIMITS.category) errors.category = `Kategoria może mieć maksymalnie ${FIELD_LIMITS.category} znaków.`;
  if (payload.why_relevant.length > FIELD_LIMITS.why_relevant) errors.why_relevant = `To pole może mieć maksymalnie ${FIELD_LIMITS.why_relevant} znaków.`;
  if (payload.source_url) {
    if (payload.source_url.length > FIELD_LIMITS.source_url) errors.source_url = `Adres może mieć maksymalnie ${FIELD_LIMITS.source_url} znaków.`;
    else if (!isPublicHttpUrl(payload.source_url)) errors.source_url = "Podaj pełny adres http(s) bez danych logowania, na przykład https://rops.krakow.pl/strona.";
  }
  if (!(KNOWLEDGE_STATUSES as readonly string[]).includes(payload.status)) errors.status = "Wybierz status z listy.";
  return errors;
}

export const DRAFT_FIELD_ORDER: (keyof InnovationDraft)[] = ["title", "description", "target_group", "category", "why_relevant", "source_url", "status"];

export function firstInvalidField(errors: DraftErrors): keyof InnovationDraft | null {
  return DRAFT_FIELD_ORDER.find((field) => errors[field]) ?? null;
}

/** Pola, których ponowny odczyt rekordu nie potwierdził. Puste = zapis potwierdzony. */
export function mismatchedFields(record: AdminInnovation, expected: InnovationDraft): string[] {
  return DRAFT_FIELD_ORDER.filter((field) => record[field] !== expected[field]).map((field) => FIELD_LABELS[field]);
}

export function collectAdminCategories(items: AdminInnovation[]): string[] {
  return [...new Set(items.flatMap((item) => (item.category ? [item.category] : [])))].sort((a, b) => a.localeCompare(b, "pl"));
}

export const STAGES = {
  pomysl: "Pomysł",
  prototyp: "Prototyp",
  pilotaz: "Pilotaż",
  wdrozenie: "Wdrożenie",
} as const;
export const APPLICANT_TYPES = ["JST", "NGO", "CUS", "Mieszkaniec"] as const;
export const STATUS_LABELS: Record<string, string> = {
  nowe: "Nowe", weryfikacja: "W weryfikacji", zaakceptowane: "Zaakceptowane", odrzucone: "Odrzucone",
};
export type Stage = keyof typeof STAGES;
export interface SubmissionDraft {
  title: string;
  problem_description: string;
  solution_description: string;
  target_group: string;
  implementation_stage: string;
  institution_name: string;
  applicant_type: string;
  matched_innovation_id: string;
}
export const EMPTY_DRAFT: SubmissionDraft = {
  title: "", problem_description: "", solution_description: "", target_group: "",
  implementation_stage: "", institution_name: "", applicant_type: "", matched_innovation_id: "",
};
export type DraftErrors = Partial<Record<keyof SubmissionDraft, string>>;
export interface Submission {
  id: string; user_id: string; title: string; problem_description: string;
  solution_description: string; target_group: string; implementation_stage: Stage;
  institution_name: string | null; applicant_type: string;
  matched_innovation_id: string | null; status: string; created_at: string;
}
export interface Innovation {
  id: string; title: string; description: string; target_group: string; source_url: string | null;
  demonstrative: boolean; source_label: string | null;
}
export const SUBMISSION_COLUMNS = "id,user_id,title,problem_description,solution_description,target_group,implementation_stage,institution_name,applicant_type,matched_innovation_id,status,created_at";
export const INNOVATION_COLUMNS = "id,title,description,target_group,source_url,is_demonstrative,source_label";
export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isInnovationId = (value: string) => /^[a-z0-9_-]{1,200}$/i.test(value) && !/^demo-/i.test(value);

export function validateDraft(draft: SubmissionDraft): DraftErrors {
  const errors: DraftErrors = {};
  const fields = [
    ["title", "Podaj tytuł pomysłu.", 160],
    ["problem_description", "Opisz problem lub potrzebę.", 10000],
    ["solution_description", "Opisz istotę rozwiązania.", 10000],
    ["target_group", "Opisz odbiorców rozwiązania.", 4000],
  ] as const;
  for (const [key, message, limit] of fields) {
    if (!draft[key].trim()) errors[key] = message;
    else if (draft[key].trim().length > limit) errors[key] = `Maksymalna długość to ${limit} znaków.`;
  }
  if (!Object.hasOwn(STAGES, draft.implementation_stage)) errors.implementation_stage = "Wybierz etap realizacji.";
  if (draft.institution_name.trim().length > 200) errors.institution_name = "Nazwa instytucji może mieć maksymalnie 200 znaków.";
  if (draft.applicant_type && !APPLICANT_TYPES.includes(draft.applicant_type as typeof APPLICANT_TYPES[number])) {
    errors.applicant_type = "Wybierz typ zgłaszającego z listy.";
  }
  if (draft.matched_innovation_id && !isInnovationId(draft.matched_innovation_id)) {
    errors.matched_innovation_id = "To powiązanie nie jest dostępne. Wybierz innowację z bazy lub usuń powiązanie.";
  }
  return errors;
}

/** Ścisła lista pól: autor nie wysyła roli, właściciela, statusu ani odpowiedzi ROPS. */
export function submissionPayload(draft: SubmissionDraft, id: string) {
  return {
    id, title: draft.title.trim(), problem_description: draft.problem_description.trim(),
    solution_description: draft.solution_description.trim(), target_group: draft.target_group.trim(),
    implementation_stage: draft.implementation_stage,
    institution_name: draft.institution_name.trim() || null,
    applicant_type: draft.applicant_type || "Nieokreślony",
    matched_innovation_id: draft.matched_innovation_id || null,
  };
}

export function parseSubmission(value: unknown, ownerId: string): Submission {
  if (typeof value !== "object" || value === null) throw new Error("Niepoprawna odpowiedź bazy.");
  const item = value as Record<string, unknown>;
  if (item.user_id !== ownerId) throw new Error("Odpowiedź zawiera dane innego autora.");
  for (const field of ["id", "title", "problem_description", "solution_description", "target_group", "implementation_stage", "applicant_type", "status", "created_at"]) {
    if (typeof item[field] !== "string" || !item[field].trim()) throw new Error("Niepełne dane zgłoszenia.");
  }
  if (!isUuid(item.id as string) || !isUuid(ownerId) || !Object.hasOwn(STAGES, item.implementation_stage as string) ||
      !Number.isFinite(Date.parse(item.created_at as string)) ||
      !(item.institution_name === null || typeof item.institution_name === "string") ||
      !(item.matched_innovation_id === null || typeof item.matched_innovation_id === "string")) {
    throw new Error("Niepoprawne dane zgłoszenia.");
  }
  return item as unknown as Submission;
}

export function parseInnovation(value: unknown): Innovation {
  if (typeof value !== "object" || value === null) throw new Error("Niepoprawna innowacja.");
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !isInnovationId(item.id) || typeof item.title !== "string" || !item.title.trim() ||
      typeof item.description !== "string" || typeof item.target_group !== "string") throw new Error("Niepoprawna innowacja.");
  let source: string | null = null;
  if (typeof item.source_url === "string" && item.source_url) {
    const url = new URL(item.source_url);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Niepoprawne źródło innowacji.");
    source = url.href;
  } else if (item.source_url !== null && item.source_url !== undefined) throw new Error("Niepoprawne źródło innowacji.");
  return { id: item.id, title: item.title, description: item.description, target_group: item.target_group, source_url: source, demonstrative: item.is_demonstrative === true, source_label: typeof item.source_label === "string" ? item.source_label.trim() || null : null };
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(new Date(date));
}

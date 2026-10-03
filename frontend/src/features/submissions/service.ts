import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/client";
import { SUBMISSIONS_ENABLED } from "../../lib/supabase/config";
import {
  INNOVATION_COLUMNS, SUBMISSION_COLUMNS, isInnovationId, isUuid,
  parseInnovation, parseSubmission, submissionPayload, validateDraft,
  type Innovation, type Submission, type SubmissionDraft,
} from "./model";

type ErrorKind = "configuration" | "schema" | "auth" | "access" | "not_found" | "validation" | "network" | "response";
export class SubmissionError extends Error {
  constructor(public readonly kind: ErrorKind, message: string) { super(message); this.name = "SubmissionError"; }
}
export const SETUP_MESSAGE = "Zgłoszenia nie są jeszcze dostępne. Baza i uprawnienia wymagają przygotowania. Fiszka nie została zapisana.";

function databaseError(error: { code?: string }, writing = false): SubmissionError {
  if (["42703", "42P01", "PGRST204", "PGRST205"].includes(error.code ?? "")) {
    return new SubmissionError("schema", SETUP_MESSAGE);
  }
  if (["42501", "PGRST301", "PGRST302"].includes(error.code ?? "")) {
    return new SubmissionError("access", "Brak uprawnień do tej operacji. Zaloguj się ponownie lub skontaktuj się z organizatorem.");
  }
  if (error.code === "23503") return new SubmissionError("validation", "Wybrana innowacja nie jest już dostępna. Usuń powiązanie lub wybierz inną.");
  return new SubmissionError("network", writing
    ? "Nie udało się potwierdzić zapisu. Sprawdź „Moje zgłoszenia” przed ponownym wysłaniem. Twój opis pozostał w formularzu."
    : "Nie udało się pobrać danych. Sprawdź połączenie i spróbuj ponownie.");
}

/** Bez mocków. Flaga włącza integrację dopiero po wdrożeniu kontraktu i RLS przez A. */
export function createSubmissionsService(client: SupabaseClient = createClient(), enabled = SUBMISSIONS_ENABLED) {
  function checkAbort(signal?: AbortSignal) { signal?.throwIfAborted(); }
  async function verifiedOwner(signal?: AbortSignal): Promise<string> {
    if (!enabled) throw new SubmissionError("configuration", SETUP_MESSAGE);
    checkAbort(signal);
    const { data, error } = await client.auth.getUser();
    checkAbort(signal);
    if (error || !data.user || !isUuid(data.user.id)) {
      throw new SubmissionError("auth", "Sesja wygasła lub nie można jej potwierdzić. Zaloguj się ponownie.");
    }
    return data.user.id;
  }
  async function checkSchema(ownerId: string, signal?: AbortSignal) {
    const { error } = await client.from("submissions").select(SUBMISSION_COLUMNS)
      .eq("user_id", ownerId).limit(0).abortSignal(signal ?? new AbortController().signal);
    checkAbort(signal);
    if (error) throw databaseError(error);
  }
  function ownRow(data: unknown, ownerId: string): Submission {
    if (typeof data === "object" && data !== null && "user_id" in data && data.user_id !== ownerId) {
      throw new SubmissionError("access", "Nie masz dostępu do tego zgłoszenia.");
    }
    try { return parseSubmission(data, ownerId); }
    catch { throw new SubmissionError("response", "Baza zwróciła niepoprawne dane zgłoszenia. Spróbuj ponownie."); }
  }
  async function readOwn(id: string, ownerId: string, signal?: AbortSignal) {
    const { data, error } = await client.from("submissions").select(SUBMISSION_COLUMNS)
      .eq("id", id).eq("user_id", ownerId).abortSignal(signal ?? new AbortController().signal).maybeSingle();
    checkAbort(signal);
    if (error) throw databaseError(error);
    if (!data) throw new SubmissionError("not_found", "Zgłoszenie nie istnieje lub nie masz do niego dostępu.");
    const item = ownRow(data, ownerId);
    if (item.id !== id) throw new SubmissionError("response", "Baza zwróciła inne zgłoszenie niż żądane.");
    return item;
  }
  async function getInnovation(id: string, signal?: AbortSignal): Promise<Innovation> {
    if (!isInnovationId(id)) throw new SubmissionError("validation", "Nie można powiązać tej fiszki z rekordem demonstracyjnym lub niepoprawnym identyfikatorem.");
    checkAbort(signal);
    const { data, error } = await client.from("innovations").select(INNOVATION_COLUMNS)
      .eq("id", id).abortSignal(signal ?? new AbortController().signal).maybeSingle();
    checkAbort(signal);
    if (error) throw databaseError(error);
    if (!data) throw new SubmissionError("not_found", "Wybrana innowacja nie jest dostępna. Możesz usunąć powiązanie.");
    try {
      const item = parseInnovation(data);
      if (item.id !== id) throw new Error("Niezgodny identyfikator.");
      return item;
    }
    catch { throw new SubmissionError("response", "Nie udało się odczytać wybranej innowacji."); }
  }
  return {
    getInnovation,
    async listInnovations(signal?: AbortSignal): Promise<Innovation[]> {
      const { data, error } = await client.from("innovations").select(INNOVATION_COLUMNS)
        .order("title").limit(100).abortSignal(signal ?? new AbortController().signal);
      checkAbort(signal);
      if (error) throw databaseError(error);
      if (!Array.isArray(data)) throw new SubmissionError("response", "Nie udało się odczytać listy innowacji.");
      try { return data.map(parseInnovation); }
      catch { throw new SubmissionError("response", "Nie udało się odczytać listy innowacji."); }
    },
    async list(signal?: AbortSignal): Promise<Submission[]> {
      const ownerId = await verifiedOwner(signal);
      await checkSchema(ownerId, signal);
      const { data, error } = await client.from("submissions").select(SUBMISSION_COLUMNS)
        .eq("user_id", ownerId).order("created_at", { ascending: false }).order("id", { ascending: false })
        .abortSignal(signal ?? new AbortController().signal);
      checkAbort(signal);
      if (error) throw databaseError(error);
      if (!Array.isArray(data)) throw new SubmissionError("response", "Nie udało się odczytać listy zgłoszeń.");
      return data.map((row) => ownRow(row, ownerId));
    },
    async get(id: string, signal?: AbortSignal): Promise<Submission> {
      if (!isUuid(id)) throw new SubmissionError("not_found", "Zgłoszenie nie istnieje lub nie masz do niego dostępu.");
      const ownerId = await verifiedOwner(signal);
      await checkSchema(ownerId, signal);
      return readOwn(id, ownerId, signal);
    },
    async create(draft: SubmissionDraft, id: string, signal?: AbortSignal): Promise<Submission> {
      if (!isUuid(id) || Object.keys(validateDraft(draft)).length) {
        throw new SubmissionError("validation", "Uzupełnij wymagane pola fiszki zgodnie z opisem formularza.");
      }
      const ownerId = await verifiedOwner(signal);
      // Tylko SELECT metadanych przed INSERT; nie zapisujemy nieistniejących kolumn.
      await checkSchema(ownerId, signal);
      if (draft.matched_innovation_id) await getInnovation(draft.matched_innovation_id, signal);
      checkAbort(signal);
      const payload = submissionPayload(draft, id);
      const { data, error } = await client.from("submissions").insert(payload).select(SUBMISSION_COLUMNS)
        .abortSignal(signal ?? new AbortController().signal).single();
      checkAbort(signal);
      // Stabilny UUID zabezpiecza ponowienie po przerwaniu potwierdzenia zapisu.
      const saved = error?.code === "23505" ? await readOwn(id, ownerId, signal) : null;
      if (error && !saved) throw databaseError(error, true);
      const confirmed = saved ?? ownRow(data, ownerId);
      if (Object.entries(payload).some(([key, value]) => confirmed[key as keyof Submission] !== value)) {
        throw new SubmissionError("response", "Nie udało się potwierdzić treści zapisu. Sprawdź „Moje zgłoszenia” przed ponownym wysłaniem.");
      }
      return confirmed;
    },
  };
}

export function dataMessage(error: unknown): string {
  return error instanceof SubmissionError ? error.message : "Nie udało się połączyć z bazą. Spróbuj ponownie za chwilę.";
}

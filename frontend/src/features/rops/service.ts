import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/client";
import { isUuid } from "../submissions/model";
import { SubmissionError } from "../submissions/service";
import { STAGE3_ENABLED, verifyParticipant, stage3Error } from "./access";
import { REVIEW_COLUMNS, isStatus, parseReview, validateOfficialResponse, type Review } from "./model";

export function createRopsService(client: SupabaseClient = createClient(), enabled = STAGE3_ENABLED) {
  const verify = (signal?: AbortSignal) => verifyParticipant(client, "rops", enabled, signal);
  function parse(data: unknown): Review {
    try { return parseReview(data); }
    catch { throw new SubmissionError("response", "Baza zwróciła niepoprawne dane zgłoszenia."); }
  }
  function validId(id: string) { if (!isUuid(id)) throw new SubmissionError("not_found", "Zgłoszenie nie istnieje lub nie masz do niego dostępu."); }
  async function read(id: string, signal?: AbortSignal) {
    const { data, error } = await client.from("submissions").select(REVIEW_COLUMNS).eq("id", id)
      .abortSignal(signal ?? new AbortController().signal).maybeSingle();
    signal?.throwIfAborted();
    if (error) throw stage3Error(error);
    if (!data) throw new SubmissionError("not_found", "Zgłoszenie nie istnieje lub nie masz do niego dostępu.");
    const row = parse(data);
    if (row.id !== id) throw new SubmissionError("response", "Baza zwróciła inne zgłoszenie niż żądane.");
    return row;
  }
  async function update(id: string, patch: { status: string } | { official_response: string }, expected: string | null, signal?: AbortSignal) {
    validId(id); await verify(signal);
    const before = await read(id, signal); // Pełny schemat i dostęp przed mutacją.
    let query = client.from("submissions").update(patch).eq("id", id);
    if ("status" in patch) query = query.eq("status", expected);
    else query = expected === null ? query.is("official_response", null) : query.eq("official_response", expected);
    const { data, error } = await query.select(REVIEW_COLUMNS).abortSignal(signal ?? new AbortController().signal).maybeSingle();
    signal?.throwIfAborted();
    if (error) throw stage3Error(error, true);
    if (!data) throw new SubmissionError("response", "Zgłoszenie zmieniło się lub nie masz już dostępu. Odśwież szczegóły przed ponowieniem.");
    const saved = parse(data);
    if (saved.id !== id || saved.user_id !== before.user_id || Object.entries(patch).some(([key, val]) => saved[key as keyof Review] !== val)) {
      throw new SubmissionError("response", "Nie udało się potwierdzić treści zapisu. Odśwież szczegóły przed ponowieniem.");
    }
    return saved;
  }
  return {
    verify,
    async ownResponse(id: string, signal?: AbortSignal): Promise<string | null> {
      validId(id);
      const actor = await verifyParticipant(client, "author", enabled, signal);
      const { data, error } = await client.from("submissions").select("id,user_id,official_response")
        .eq("id", id).eq("user_id", actor.id).abortSignal(signal ?? new AbortController().signal).maybeSingle();
      signal?.throwIfAborted();
      if (error) throw stage3Error(error);
      if (!data || data.id !== id || data.user_id !== actor.id) throw new SubmissionError("access", "Nie masz dostępu do oficjalnej odpowiedzi tego zgłoszenia.");
      if (!(data.official_response === null || typeof data.official_response === "string")) throw new SubmissionError("response", "Nie udało się odczytać oficjalnej odpowiedzi.");
      return data.official_response;
    },
    async list(status = "", signal?: AbortSignal): Promise<Review[]> {
      if (status && !isStatus(status)) throw new SubmissionError("validation", "Wybierz status z listy.");
      await verify(signal);
      let query = client.from("submissions").select(REVIEW_COLUMNS);
      if (status) query = query.eq("status", status);
      const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false })
        .abortSignal(signal ?? new AbortController().signal);
      signal?.throwIfAborted();
      if (error) throw stage3Error(error);
      if (!Array.isArray(data)) throw new SubmissionError("response", "Nie udało się odczytać listy zgłoszeń.");
      return data.map(parse);
    },
    async get(id: string, signal?: AbortSignal) { validId(id); await verify(signal); return read(id, signal); },
    async changeStatus(id: string, status: string, expected: string, signal?: AbortSignal) {
      if (!isStatus(status) || !isStatus(expected)) throw new SubmissionError("validation", "Wybierz status z listy.");
      return update(id, { status }, expected, signal);
    },
    async reply(id: string, text: string, expected: string | null, signal?: AbortSignal) {
      const error = validateOfficialResponse(text);
      if (error) throw new SubmissionError("validation", error);
      return update(id, { official_response: text.trim() }, expected, signal);
    },
  };
}

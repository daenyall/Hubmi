import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/client";
import { isUuid } from "../submissions/model";
import { SubmissionError } from "../submissions/service";
import { STAGE3_ENABLED, verifyParticipant, stage3Error, type Viewer, type Participant } from "../rops/access";
import { MESSAGE_COLUMNS, messagePayload, parseMessage, validateMessage, type Message } from "./model";

export function createMessagesService(client: SupabaseClient = createClient(), enabled = STAGE3_ENABLED) {
  async function access(id: string, viewer: Viewer, signal?: AbortSignal) {
    if (!isUuid(id)) throw new SubmissionError("not_found", "Zgłoszenie nie istnieje lub nie masz do niego dostępu.");
    const participant = await verifyParticipant(client, viewer, enabled, signal);
    let query = client.from("submissions").select("id,user_id").eq("id", id);
    if (viewer === "author") query = query.eq("user_id", participant.id);
    const { data, error } = await query.abortSignal(signal ?? new AbortController().signal).maybeSingle();
    signal?.throwIfAborted();
    if (error) throw stage3Error(error);
    if (!data || data.id !== id || !isUuid(data.user_id) || (viewer === "author" && data.user_id !== participant.id)) {
      throw new SubmissionError("access", "Nie masz dostępu do tego zgłoszenia ani rozmowy.");
    }
    return { participant, owner: data.user_id as string };
  }
  function parse(data: unknown, submissionId: string, owner: string): Message {
    try {
      const message = parseMessage(data, submissionId);
      if (message.sender_role === "applicant" && message.sender_id !== owner) throw new Error("Niezgodny autor.");
      return message;
    } catch { throw new SubmissionError("response", "Baza zwróciła niepoprawną historię rozmowy."); }
  }
  function confirm(message: Message, participant: Participant, id: string, text: string) {
    if (message.id !== id || message.sender_id !== participant.id || message.sender_role !== participant.role || message.message !== text.trim()) {
      throw new SubmissionError("response", "Nie udało się potwierdzić wiadomości. Odśwież rozmowę przed ponowieniem.");
    }
    return message;
  }
  return {
    async list(submissionId: string, viewer: Viewer, signal?: AbortSignal): Promise<Message[]> {
      const { owner } = await access(submissionId, viewer, signal);
      const { data, error } = await client.from("submission_messages").select(MESSAGE_COLUMNS).eq("submission_id", submissionId)
        .order("created_at", { ascending: true }).order("id", { ascending: true }).abortSignal(signal ?? new AbortController().signal);
      signal?.throwIfAborted();
      if (error) throw stage3Error(error);
      if (!Array.isArray(data)) throw new SubmissionError("response", "Nie udało się odczytać historii rozmowy.");
      const messages = data.map((row) => parse(row, submissionId, owner));
      if (new Set(messages.map((row) => row.id)).size !== messages.length) throw new SubmissionError("response", "Baza zwróciła niepoprawną historię rozmowy.");
      return messages;
    },
    async send(submissionId: string, viewer: Viewer, text: string, id: string, signal?: AbortSignal): Promise<Message> {
      const invalid = validateMessage(text);
      if (invalid || !isUuid(id)) throw new SubmissionError("validation", invalid ?? "Niepoprawny identyfikator wiadomości.");
      const { participant, owner } = await access(submissionId, viewer, signal);
      // Sprawdzamy schemat przed INSERT. To nie jest dowód poprawności RLS/triggera.
      const schema = await client.from("submission_messages").select(MESSAGE_COLUMNS).limit(0).abortSignal(signal ?? new AbortController().signal);
      signal?.throwIfAborted();
      if (schema.error) throw stage3Error(schema.error);
      const { data, error } = await client.from("submission_messages").insert(messagePayload(id, submissionId, text))
        .select(MESSAGE_COLUMNS).abortSignal(signal ?? new AbortController().signal).single();
      signal?.throwIfAborted();
      if (error?.code === "23505") {
        const existing = await client.from("submission_messages").select(MESSAGE_COLUMNS).eq("id", id).eq("submission_id", submissionId)
          .eq("sender_id", participant.id).abortSignal(signal ?? new AbortController().signal).maybeSingle();
        signal?.throwIfAborted();
        if (existing.error) throw stage3Error(existing.error);
        if (existing.data) return confirm(parse(existing.data, submissionId, owner), participant, id, text);
      }
      if (error) throw stage3Error(error, true);
      return confirm(parse(data, submissionId, owner), participant, id, text);
    },
  };
}

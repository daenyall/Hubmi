import type { SupabaseClient, User } from "@supabase/supabase-js";
import { SubmissionError } from "../submissions/service";
import { isUuid } from "../submissions/model";

export const STAGE3_ENABLED = process.env.NEXT_PUBLIC_ROPS_COMMUNICATION_ENABLED === "true";
export const STAGE3_SETUP = "Obsługa ROPS i rozmowy nie są jeszcze dostępne. Czekamy na przygotowanie uprawnień i bezpiecznego zapisu przez organizatora.";
export type Viewer = "author" | "rops";
export type Participant = { id: string; role: "applicant" | "rops_admin" };

/** PROPOZYCJA kontraktu, domyślnie wyłączona: metadata nadawane wyłącznie przez serwer. */
export function roleFromVerifiedUser(user: Pick<User, "app_metadata">): Participant["role"] {
  const role: unknown = user.app_metadata?.hubmi_role;
  if (role === "rops_admin") return "rops_admin";
  if (role === undefined || role === "author") return "applicant";
  throw new SubmissionError("access", "Nie można potwierdzić uprawnień tego konta.");
}
export async function verifyParticipant(client: SupabaseClient, viewer: Viewer, enabled: boolean, signal?: AbortSignal): Promise<Participant> {
  if (!enabled) throw new SubmissionError("configuration", STAGE3_SETUP);
  signal?.throwIfAborted();
  const { data, error } = await client.auth.getUser();
  signal?.throwIfAborted();
  if (error || !data.user || !isUuid(data.user.id)) throw new SubmissionError("auth", "Sesja wygasła lub nie można jej potwierdzić. Zaloguj się ponownie.");
  if (data.user.is_anonymous === true) throw new SubmissionError("auth", "Zaloguj się na konto email i hasło przygotowane do zgłoszeń. Konto anonimowe nie ma dostępu.");
  const participant = { id: data.user.id, role: roleFromVerifiedUser(data.user) };
  if (viewer === "rops" && participant.role !== "rops_admin") throw new SubmissionError("access", "To konto nie ma potwierdzonych uprawnień pracownika ROPS.");
  return participant;
}
export function stage3Error(error: { code?: string }, writing = false): SubmissionError {
  if (["42703", "42P01", "PGRST204", "PGRST205"].includes(error.code ?? "")) return new SubmissionError("schema", STAGE3_SETUP);
  if (["PGRST301", "PGRST302"].includes(error.code ?? "")) return new SubmissionError("auth", "Sesja wygasła. Zaloguj się ponownie.");
  if (error.code === "42501") return new SubmissionError("access", "Brak uprawnień do tej operacji. Odśwież sesję lub skontaktuj się z organizatorem.");
  return new SubmissionError("network", writing
    ? "Nie udało się potwierdzić zapisu. Treść pozostała w formularzu. Odśwież widok przed ponowieniem."
    : "Nie udało się pobrać danych. Sprawdź połączenie i spróbuj ponownie.");
}

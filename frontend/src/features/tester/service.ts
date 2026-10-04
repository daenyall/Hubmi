import { BackendCallError, createBackendSession, detailOf, httpCallError, type CallResult } from "../rops/backend-session";
import {
  APPLICATION_STATUS_LABELS, applicationPayload, sameNote, feedbackPayload, parseApplication, parseApplications, parseFeedback,
  parseFeedbackSummary, parseGlobalSummary, validateApplication, validateFeedback,
  type Application, type ApplicationDraft, type Feedback, type FeedbackDraft, type FeedbackSummary, type GlobalSummary,
} from "./model";

const KEEP = " Wpisana treść pozostała w formularzu.";

/** 400 z /api/testing niesie konkretną przyczynę (np. brak innowacji, niezgodne zgłoszenie). */
function writeError(result: CallResult, subject: string): BackendCallError {
  const detail = result.status === 400 ? detailOf(result) : "";
  return detail ? new BackendCallError("validation", `${detail}${KEEP}`) : httpCallError(result.status, true, subject);
}

/** `confirmed` = rekord odczytany ponownie. null: nie dało się sprawdzić (np. opinia poza 10 najnowszymi). */
export interface FeedbackResult { feedback: Feedback; confirmed: boolean | null }

export function createTesterService(session = createBackendSession()) {
  async function read<T>(path: string, parse: (v: unknown) => T, mode: "rops" | "optional", subject: string, signal?: AbortSignal): Promise<T> {
    const result = await session.call(path, { method: "GET" }, mode, signal);
    if (!result.ok) throw httpCallError(result.status, false, subject);
    try { return parse(result.data); }
    catch { throw new BackendCallError("response", `Usługa zwróciła niepoprawne dane (${subject}).`); }
  }
  const summary = (innovationId: string, signal?: AbortSignal): Promise<FeedbackSummary> =>
    read(`/api/testing/feedback/${encodeURIComponent(innovationId)}`, parseFeedbackSummary, "optional", "oceny innowacji", signal);

  return {
    /** Backend zapisuje zgłoszenie w Supabase albo zwraca błąd (bez magazynu awaryjnego). Odczyt ma tylko ROPS. */
    async apply(draft: ApplicationDraft, signal?: AbortSignal): Promise<Application> {
      if (Object.keys(validateApplication(draft)).length) throw new BackendCallError("validation", `Popraw zaznaczone pola.${KEEP}`);
      const result = await session.call("/api/testing/apply", { method: "POST", body: applicationPayload(draft) }, "optional", signal);
      if (!result.ok) throw writeError(result, "zgłoszenie do testowania");
      let saved: Application;
      try { saved = parseApplication(result.data); }
      catch { throw new BackendCallError("response", "Usługa nie zwróciła zgłoszenia, więc nie potwierdzamy zapisu. Nie wysyłaj ponownie przed kontaktem z ROPS."); }
      if (saved.innovation_id !== draft.innovation_id.trim()) throw new BackendCallError("response", "Usługa zwróciła zgłoszenie innej innowacji. Skontaktuj się z ROPS przed ponowieniem.");
      return saved;
    },
    async feedback(draft: FeedbackDraft, signal?: AbortSignal): Promise<FeedbackResult> {
      if (Object.keys(validateFeedback(draft)).length) throw new BackendCallError("validation", `Popraw zaznaczone pola.${KEEP}`);
      const result = await session.call("/api/testing/feedback", { method: "POST", body: feedbackPayload(draft) }, "optional", signal);
      if (!result.ok) throw writeError(result, "opinia o teście");
      let saved: Feedback;
      try { saved = parseFeedback(result.data); }
      catch { throw new BackendCallError("response", "Usługa nie zwróciła opinii, więc nie potwierdzamy zapisu. Sprawdź podsumowanie ocen przed ponowieniem."); }
      try {
        const after = await summary(saved.innovation_id, signal);
        const found = after.recent.some((f) => f.id === saved.id);
        return { feedback: saved, confirmed: found ? true : after.total > after.recent.length ? null : false };
      } catch (error) {
        if (signal?.aborted) throw error;
        return { feedback: saved, confirmed: null };
      }
    },
    summary,
    global: (signal?: AbortSignal): Promise<GlobalSummary> => read("/api/testing/summary", parseGlobalSummary, "optional", "podsumowanie testów", signal),
    applications: (filters: { status?: string; innovation_id?: string }, signal?: AbortSignal): Promise<Application[]> => {
      const p = new URLSearchParams({ limit: "100" });
      if (filters.status) p.set("status", filters.status);
      if (filters.innovation_id) p.set("innovation_id", filters.innovation_id);
      return read(`/api/testing/applications?${p}`, parseApplications, "rops", "zgłoszenia testowe", signal);
    },
    /**
     * Zmiana statusu i notatki ROPS, potwierdzona ponownym odczytem rekordu. Wysyłamy wyłącznie
     * rops_notes — nigdy notes — i tylko gdy notatka się zmieniła (`ropsNote` z ropsNoteChange).
     * Odczyt sprawdza też, że uwagi zgłaszającego pozostały bez zmian.
     */
    async updateStatus(app: Pick<Application, "id" | "notes">, status: string, ropsNote: string | undefined, signal?: AbortSignal): Promise<Application> {
      if (!(status in APPLICATION_STATUS_LABELS)) throw new BackendCallError("validation", "Wybierz status z listy.");
      if (ropsNote !== undefined && ropsNote.length > 5000) throw new BackendCallError("validation", "Notatka ROPS: maksymalnie 5000 znaków.");
      const body = { status, ...(ropsNote !== undefined ? { rops_notes: ropsNote } : {}) };
      const path = `/api/testing/applications/${encodeURIComponent(app.id)}`;
      const result = await session.call(`${path}/status`, { method: "PATCH", body }, "rops", signal);
      if (!result.ok) {
        const detail = result.status === 400 ? detailOf(result) : "";
        throw detail ? new BackendCallError("validation", `${detail}${KEEP}`) : httpCallError(result.status, true, "status pilotażu");
      }
      const fresh = await read(path, parseApplication, "rops", "zgłoszenie testowe", signal);
      const problems: string[] = [];
      if (fresh.status !== status) problems.push(`status „${APPLICATION_STATUS_LABELS[fresh.status] ?? fresh.status}”`);
      if (ropsNote !== undefined && !sameNote(fresh.rops_notes, ropsNote)) problems.push("inną notatkę ROPS");
      if (!sameNote(fresh.notes, app.notes)) problems.push("zmienione uwagi zgłaszającego");
      if (problems.length) throw new BackendCallError("response", `Ponowny odczyt pokazał ${problems.join(" i ")}. Odśwież listę przed ponowieniem.`);
      return fresh;
    },
  };
}

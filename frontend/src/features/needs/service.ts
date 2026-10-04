import { BackendCallError, createBackendSession, detailOf, httpCallError } from "../rops/backend-session";
import {
  NEED_STATUS_LABELS, needPayload, parseNeed, parseNeeds, parseReceipt, parseSummary, parseTrends, validateNeed,
  type Need, type NeedDraft, type NeedsSummary, type NeedsTrends, type SubmitReceipt,
} from "./model";

/**
 * Wynik zgłoszenia. `onAccount` mówi tylko tyle, ile frontend może sprawdzić: czy rekord
 * wrócił z GET /api/needs/my dla zalogowanej osoby. Gość nie ma odczytu po zapisie.
 */
export interface SubmitResult { receipt: SubmitReceipt; onAccount: boolean | null }

export interface NeedFilters { status?: string; category?: string; powiat?: string; urgency_level?: string; search?: string }

const params = (entries: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(entries)) if (v !== undefined && String(v).trim()) p.set(k, String(v).trim());
  const s = p.toString();
  return s ? `?${s}` : "";
};

export function createNeedsService(session = createBackendSession()) {
  async function read<T>(path: string, parse: (v: unknown) => T, mode: "rops" | "user", subject: string, signal?: AbortSignal): Promise<T> {
    const result = await session.call(path, { method: "GET" }, mode, signal);
    if (!result.ok) throw httpCallError(result.status, false, subject);
    try { return parse(result.data); }
    catch { throw new BackendCallError("response", `Usługa zwróciła niepoprawne dane (${subject}).`); }
  }

  return {
    async submit(draft: NeedDraft, signal?: AbortSignal): Promise<SubmitResult> {
      if (Object.keys(validateNeed(draft)).length) throw new BackendCallError("validation", "Popraw zaznaczone pola. Wpisana treść pozostała w formularzu.");
      const result = await session.call("/api/needs", { method: "POST", body: needPayload(draft) }, "optional", signal);
      if (!result.ok) {
        const detail = result.status === 400 ? detailOf(result) : "";
        if (detail) throw new BackendCallError("validation", `${detail} Wpisana treść pozostała w formularzu.`);
        throw httpCallError(result.status, true, "zgłoszenie potrzeby");
      }
      let receipt: SubmitReceipt;
      try { receipt = parseReceipt(result.data); }
      catch { throw new BackendCallError("response", "Usługa nie zwróciła numeru zgłoszenia, więc nie potwierdzamy zapisu. Sprawdź „Moje zgłoszenia” przed ponowieniem."); }
      if (!result.authenticated) return { receipt, onAccount: null };
      try {
        const mine = await read("/api/needs/my", parseNeeds, "user", "Twoje potrzeby", signal);
        return { receipt, onAccount: mine.some((need) => need.id === receipt.id) };
      } catch (error) {
        if (signal?.aborted) throw error;
        return { receipt, onAccount: false };
      }
    },
    mine: (signal?: AbortSignal) => read("/api/needs/my", parseNeeds, "user", "Twoje potrzeby", signal),
    list: (filters: NeedFilters, signal?: AbortSignal): Promise<Need[]> =>
      read(`/api/admin/needs${params({ ...filters, limit: 100 })}`, parseNeeds, "rops", "lista potrzeb", signal),
    summary: (filters: { days?: number; category?: string; powiat?: string }, signal?: AbortSignal): Promise<NeedsSummary> =>
      read(`/api/admin/needs/summary${params(filters)}`, parseSummary, "rops", "zestawienie potrzeb", signal),
    trends: (periodDays: number, signal?: AbortSignal): Promise<NeedsTrends> =>
      read(`/api/admin/needs/trends${params({ period_days: periodDays })}`, parseTrends, "rops", "porównanie okresów", signal),
    async updateStatus(id: string, status: string, notes: string, signal?: AbortSignal): Promise<Need> {
      if (!(status in NEED_STATUS_LABELS)) throw new BackendCallError("validation", "Wybierz status z listy.");
      const body = { status, ...(notes.trim() ? { rops_internal_notes: notes.trim() } : {}) };
      const result = await session.call(`/api/admin/needs/${encodeURIComponent(id)}/status`, { method: "PATCH", body }, "rops", signal);
      if (!result.ok) throw httpCallError(result.status, true, "zmiana statusu potrzeby");
      let need: Need;
      try { need = parseNeed(result.data); }
      catch { throw new BackendCallError("response", "Usługa nie zwróciła rekordu, więc zmiana nie jest potwierdzona. Odśwież listę."); }
      if (need.id !== id || need.status !== status) throw new BackendCallError("response", "Usługa zwróciła inny stan niż zapisywany. Odśwież listę przed ponowieniem.");
      return need;
    },
  };
}

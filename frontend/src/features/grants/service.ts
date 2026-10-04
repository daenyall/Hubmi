import { BackendApiError } from "../../lib/api";
import { BackendCallError, createBackendSession, detailOf, httpCallError, type CallResult } from "../rops/backend-session";
import {
  draftPayload, parseApplication, parseApplications, parseCall, parseCalls, parseExport, saveErrors, submitDetail,
  type GrantApplication, type GrantCall, type GrantDraft, type GrantExport,
} from "./model";

const KEEP = " Wpisana treść pozostała w formularzu.";

/** Błędy kompletności z backendu (422) — lista punktów wzoru do poprawy. */
export class GrantValidationError extends Error {
  constructor(public readonly errors: string[]) { super("Wniosek nie spełnia wymagań wzoru."); this.name = "GrantValidationError"; }
}

function writeError(result: CallResult, subject: string): Error {
  if (result.status === 422) {
    const errors = submitDetail(result.data);
    if (errors.length) return new GrantValidationError(errors);
  }
  const detail = result.status === 400 || result.status === 403 ? detailOf(result) : "";
  return detail ? new BackendCallError(result.status === 403 ? "access" : "validation", `${detail}${KEEP}`) : httpCallError(result.status, true, subject);
}

/** Awaria sieci lub limit czasu przy zapisie: ten sam komunikat, z informacją, że treść została w formularzu. */
async function writing<T>(task: () => Promise<T>): Promise<T> {
  try { return await task(); }
  catch (error) {
    if (error instanceof BackendApiError) throw new BackendCallError(error.kind === "api" ? "server" : error.kind, `${error.message}${KEEP}`);
    throw error;
  }
}

export function createGrantService(session = createBackendSession()) {
  async function read<T>(path: string, parse: (v: unknown) => T, mode: "rops" | "user" | "optional", subject: string, signal?: AbortSignal): Promise<T> {
    const result = await session.call(path, { method: "GET" }, mode, signal);
    if (!result.ok) {
      const detail = result.status === 403 || result.status === 404 ? detailOf(result) : "";
      throw detail ? new BackendCallError(result.status === 403 ? "access" : "not_found", detail) : httpCallError(result.status, false, subject);
    }
    try { return parse(result.data); }
    catch { throw new BackendCallError("response", `Usługa zwróciła niepoprawne dane (${subject}).`); }
  }
  const get = (id: string, signal?: AbortSignal) => read(`/api/grant-applications/${encodeURIComponent(id)}`, parseApplication, "user", "wniosek", signal);

  return {
    calls: (signal?: AbortSignal): Promise<GrantCall[]> => read("/api/grant-calls", parseCalls, "optional", "nabory", signal),
    call: (id: string, signal?: AbortSignal): Promise<GrantCall> => read(`/api/grant-calls/${encodeURIComponent(id)}`, parseCall, "optional", "nabór", signal),
    mine: (signal?: AbortSignal): Promise<GrantApplication[]> => read("/api/grant-applications/my", parseApplications, "user", "Twoje wnioski", signal),
    get,
    async create(callId: string, signal?: AbortSignal): Promise<GrantApplication> {
      const result = await session.call("/api/grant-applications", { method: "POST", body: { call_id: callId } }, "user", signal);
      if (!result.ok) throw writeError(result, "nowy wniosek");
      let app: GrantApplication;
      try { app = parseApplication(result.data); }
      catch { throw new BackendCallError("response", "Usługa nie zwróciła wniosku, więc nie potwierdzamy jego utworzenia. Sprawdź listę swoich wniosków."); }
      // Potwierdzenie ponownym odczytem: wniosek musi istnieć na koncie autora.
      const fresh = await get(app.id, signal);
      if (fresh.call_id !== callId || fresh.status !== "roboczy") throw new BackendCallError("response", "Ponowny odczyt pokazał inny wniosek niż utworzony. Sprawdź listę swoich wniosków.");
      return fresh;
    },
    /** Zapis roboczy potwierdzony ponownym odczytem tytułu i kwoty. */
    save: (id: string, draft: GrantDraft, signal?: AbortSignal): Promise<GrantApplication> => writing(async () => {
      const blocking = saveErrors(draft);
      if (blocking.length) throw new GrantValidationError(blocking);
      const body = draftPayload(draft);
      const result = await session.call(`/api/grant-applications/${encodeURIComponent(id)}`, { method: "PUT", body }, "user", signal);
      if (!result.ok) throw writeError(result, "zapis roboczy wniosku");
      const fresh = await get(id, signal);
      if (fresh.title !== body.title || Math.abs(fresh.grant_amount - body.grant_amount) > 0.001) {
        throw new BackendCallError("response", `Ponowny odczyt nie potwierdził zapisu.${KEEP}`);
      }
      return fresh;
    }),
    /** Złożenie: backend sprawdza kompletność, budżet, oświadczenia i stan naboru. */
    submit: (id: string, signal?: AbortSignal): Promise<GrantApplication> => writing(async () => {
      const result = await session.call(`/api/grant-applications/${encodeURIComponent(id)}/submit`, { method: "POST" }, "user", signal);
      if (!result.ok) throw writeError(result, "złożenie wniosku");
      const fresh = await get(id, signal);
      if (fresh.status === "roboczy" || !fresh.submitted_at) throw new BackendCallError("response", "Ponowny odczyt nie potwierdził złożenia. Odśwież stronę przed ponowieniem.");
      return fresh;
    }),
    exportDoc: (id: string, mode: "user" | "rops", signal?: AbortSignal): Promise<GrantExport> =>
      read(`/api/grant-applications/${encodeURIComponent(id)}/export`, parseExport, mode, "eksport wniosku", signal),
    adminList: (filters: { call_id?: string; status?: string }, signal?: AbortSignal): Promise<GrantApplication[]> => {
      const p = new URLSearchParams({ limit: "100" });
      if (filters.call_id) p.set("call_id", filters.call_id);
      if (filters.status) p.set("status", filters.status);
      return read(`/api/admin/grant-applications?${p}`, parseApplications, "rops", "wnioski w naborach", signal);
    },
    adminGet: (id: string, signal?: AbortSignal): Promise<GrantApplication> =>
      read(`/api/admin/grant-applications/${encodeURIComponent(id)}`, parseApplication, "rops", "wniosek", signal),
  };
}

export function grantErrorMessages(error: unknown, fallback: (e: unknown) => string): string[] {
  if (error instanceof GrantValidationError) return error.errors;
  return [fallback(error)];
}

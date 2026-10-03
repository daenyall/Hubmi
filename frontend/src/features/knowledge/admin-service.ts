import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/client";
import { BackendApiError, requestBackendJson } from "../../lib/api";
import { roleFromVerifiedUser } from "../rops/access";
import { isUuid } from "../submissions/model";
import {
  KNOWLEDGE_PAGE_SIZE, PUBLISHED_STATUS, draftPayload, isInnovationId, mismatchedFields,
  parseAdminInnovation, parseAdminList, validateDraft,
  type AdminInnovation, type InnovationDraft,
} from "./admin-model";

type ErrorKind = "auth" | "access" | "validation" | "not_found" | "network" | "response" | "timeout" | "server";
export class KnowledgeAdminError extends Error {
  constructor(public readonly kind: ErrorKind, message: string) { super(message); this.name = "KnowledgeAdminError"; }
}
/** Treść formularza nigdy nie jest czyszczona przez błąd — komunikaty to potwierdzają. */
const KEEPS_CONTENT = "Wpisana treść pozostała w formularzu.";
/** Backend nie udostępnia odczytu pojedynczej innowacji, więc potwierdzamy przez listę. */
const CONFIRM_PAGES = 10;
const NO_REREAD = "Operacja została przyjęta, ale ponowny odczyt nie znalazł rekordu na liście. Odśwież listę i sprawdź stan przed ponowieniem.";

export function knowledgeAdminMessage(error: unknown): string {
  if (error instanceof KnowledgeAdminError) return error.message;
  if (error instanceof BackendApiError) return error.message;
  return "Nie udało się połączyć z usługą bazy wiedzy. Spróbuj ponownie za chwilę.";
}

function httpError(status: number, writing: boolean): KnowledgeAdminError {
  const tail = writing ? ` ${KEEPS_CONTENT}` : "";
  if (status === 401) return new KnowledgeAdminError("auth", `Sesja wygasła lub token nie został przyjęty. Zaloguj się ponownie.${tail}`);
  if (status === 403) return new KnowledgeAdminError("access", `To konto nie ma uprawnień pracownika ROPS do zarządzania bazą wiedzy.${tail}`);
  if (status === 404) return new KnowledgeAdminError("not_found", "Ta innowacja nie istnieje już w bazie. Odśwież listę.");
  if (status === 422) return new KnowledgeAdminError("validation", `Backend odrzucił dane jako niezgodne ze schematem. Sprawdź pola formularza.${tail}`);
  if (status === 429) return new KnowledgeAdminError("network", `Zbyt wiele zapytań. Poczekaj chwilę i spróbuj ponownie.${tail}`);
  if (status === 503) return new KnowledgeAdminError("server", `Baza danych bazy wiedzy jest chwilowo niedostępna.${tail}`);
  return new KnowledgeAdminError("server", `Usługa nie potwierdziła operacji (kod ${status}).${tail}`);
}

export interface SaveResult { record: AdminInnovation; confirmed: boolean; note: string }
export interface ListRequest { category?: string; status?: string; limit?: number; offset?: number }

export function createKnowledgeAdminService(client: SupabaseClient = createClient()) {
  /** Tożsamość i rola pochodzą ze zweryfikowanego serwerowo getUser; token tylko do nagłówka. */
  async function authorize(signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    const { data, error } = await client.auth.getUser();
    signal?.throwIfAborted();
    if (error || !data.user || !isUuid(data.user.id)) {
      throw new KnowledgeAdminError("auth", "Sesja wygasła lub nie można jej potwierdzić. Zaloguj się ponownie.");
    }
    if (data.user.is_anonymous === true) {
      throw new KnowledgeAdminError("auth", "Konto anonimowe nie ma dostępu do bazy wiedzy ROPS. Zaloguj się na konto pracownika.");
    }
    let role: string;
    try { role = roleFromVerifiedUser(data.user); }
    catch { throw new KnowledgeAdminError("access", "Nie można potwierdzić uprawnień tego konta."); }
    if (role !== "rops_admin") {
      throw new KnowledgeAdminError("access", "To konto nie ma potwierdzonych uprawnień pracownika ROPS.");
    }
    const session = await client.auth.getSession();
    signal?.throwIfAborted();
    const token = session.data.session?.access_token;
    if (session.error || typeof token !== "string" || !token) {
      throw new KnowledgeAdminError("auth", "Nie udało się odczytać tokenu bieżącej sesji. Zaloguj się ponownie.");
    }
    return token;
  }

  async function call(path: string, init: { method?: string; body?: unknown }, writing: boolean, signal?: AbortSignal): Promise<unknown> {
    const token = await authorize(signal);
    const result = await requestBackendJson(path, { ...init, token, signal });
    signal?.throwIfAborted();
    if (!result.ok) throw httpError(result.status, writing);
    return result.data;
  }

  async function list({ category, status, limit = KNOWLEDGE_PAGE_SIZE, offset = 0 }: ListRequest = {}, signal?: AbortSignal): Promise<AdminInnovation[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
      throw new KnowledgeAdminError("validation", "Niepoprawne parametry strony listy innowacji.");
    }
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (category?.trim()) params.set("category", category.trim());
    if (status?.trim()) params.set("status", status.trim());
    const raw = await call(`/api/admin/innovations?${params}`, { method: "GET" }, false, signal);
    try {
      const page = parseAdminList(raw);
      if (page.length > limit) throw new Error("Przekroczony limit strony.");
      return page;
    } catch { throw new KnowledgeAdminError("response", "Otrzymaliśmy niepoprawne dane listy innowacji. Spróbuj ponownie."); }
  }

  function parseOne(raw: unknown, writing: boolean): AdminInnovation {
    try { return parseAdminInnovation(raw); }
    catch {
      throw new KnowledgeAdminError("response", writing
        ? `Usługa nie zwróciła poprawnego rekordu, więc zapis nie został potwierdzony. Odśwież listę przed ponowieniem. ${KEEPS_CONTENT}`
        : "Usługa zwróciła niepoprawny rekord innowacji.");
    }
  }

  /** Ponowny odczyt: filtr statusu zawęża stronicowanie, bo API nie wyszukuje po id. */
  async function findById(id: string, status: string | undefined, signal?: AbortSignal): Promise<AdminInnovation | null> {
    for (let page = 0; page < CONFIRM_PAGES; page += 1) {
      const rows = await list({ status, limit: KNOWLEDGE_PAGE_SIZE, offset: page * KNOWLEDGE_PAGE_SIZE }, signal);
      const found = rows.find((row) => row.id === id);
      if (found) return found;
      if (rows.length < KNOWLEDGE_PAGE_SIZE) return null;
    }
    return null;
  }

  async function confirmDraft(returned: AdminInnovation, expected: InnovationDraft, signal?: AbortSignal): Promise<SaveResult> {
    const found = await findById(returned.id, expected.status, signal);
    if (!found) return { record: returned, confirmed: false, note: NO_REREAD };
    const diff = mismatchedFields(found, expected);
    return diff.length
      ? { record: found, confirmed: false, note: `Ponowny odczyt pokazał inne wartości pól: ${diff.join(", ")}. Sprawdź rekord na liście.` }
      : { record: found, confirmed: true, note: "" };
  }

  async function write(path: string, method: "POST" | "PUT", draft: InnovationDraft, signal?: AbortSignal): Promise<SaveResult> {
    const errors = validateDraft(draft);
    if (Object.keys(errors).length) throw new KnowledgeAdminError("validation", `Popraw zaznaczone pola formularza. ${KEEPS_CONTENT}`);
    const payload = draftPayload(draft);
    const returned = parseOne(await call(path, { method, body: payload }, true, signal), true);
    return confirmDraft(returned, payload, signal);
  }

  function requireId(id: string) {
    if (!isInnovationId(id)) throw new KnowledgeAdminError("validation", "Niepoprawny identyfikator innowacji.");
  }

  return {
    authorize,
    list,
    async create(draft: InnovationDraft, signal?: AbortSignal): Promise<SaveResult> {
      return write("/api/admin/innovations", "POST", draft, signal);
    },
    async update(id: string, draft: InnovationDraft, signal?: AbortSignal): Promise<SaveResult> {
      requireId(id);
      const result = await write(`/api/admin/innovations/${encodeURIComponent(id)}`, "PUT", draft, signal);
      if (result.record.id !== id) {
        throw new KnowledgeAdminError("response", `Usługa zwróciła inny rekord niż edytowany. Odśwież listę przed ponowieniem. ${KEEPS_CONTENT}`);
      }
      return result;
    },
    /** Publikacja ustawia w backendzie wyłącznie status „sprawdzone”. */
    async publish(id: string, signal?: AbortSignal): Promise<SaveResult> {
      requireId(id);
      const returned = parseOne(await call(`/api/admin/innovations/${encodeURIComponent(id)}/publish`, { method: "POST" }, false, signal), true);
      if (returned.id !== id) throw new KnowledgeAdminError("response", "Usługa zwróciła inny rekord niż publikowany. Odśwież listę.");
      const found = await findById(id, PUBLISHED_STATUS, signal) ?? await findById(id, undefined, signal);
      if (!found) return { record: returned, confirmed: false, note: NO_REREAD };
      return found.status === PUBLISHED_STATUS
        ? { record: found, confirmed: true, note: "" }
        : { record: found, confirmed: false, note: `Ponowny odczyt pokazał status „${found.status}” zamiast „${PUBLISHED_STATUS}”. Sprawdź rekord na liście.` };
    },
  };
}

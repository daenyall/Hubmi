import { getBackendJson, BackendApiError } from "../../lib/api";
import { BackendCallError, createBackendSession, detailOf, httpCallError } from "../rops/backend-session";
import {
  PUBLISHED, parseGroups, parseResource, parseResources, resourcePayload, validateResource,
  type Resource, type ResourceDraft, type ResourceGroup,
} from "./resource-model";

const KEEP = " Wpisana treść pozostała w formularzu.";

/** Publiczny odczyt pogrupowanych, opublikowanych zasobów. */
export async function fetchResourceGroups(signal?: AbortSignal): Promise<ResourceGroup[]> {
  const raw = await getBackendJson("/api/knowledge-resources/grouped", signal);
  try { return parseGroups(raw); }
  catch { throw new BackendApiError("response", "Otrzymaliśmy niepoprawne dane zasobów. Spróbuj ponownie."); }
}
/** Publiczny odczyt jednego zasobu; null, gdy nie jest opublikowany (404). */
export async function fetchPublishedResource(id: string, signal?: AbortSignal): Promise<Resource | null> {
  try {
    const r = parseResource(await getBackendJson(`/api/knowledge-resources/${encodeURIComponent(id)}`, signal));
    return r.status === PUBLISHED ? r : null;
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 404) return null;
    throw error;
  }
}

/** Operacje panelu ROPS; każdy zapis potwierdzany ponownym odczytem rekordu. */
export function createResourceAdminService(session = createBackendSession()) {
  const base = "/api/admin/knowledge-resources";
  async function read(id: string, signal?: AbortSignal): Promise<Resource> {
    const result = await session.call(`${base}/${encodeURIComponent(id)}`, { method: "GET" }, "rops", signal);
    if (!result.ok) throw httpCallError(result.status, false, "zasób wiedzy");
    try { return parseResource(result.data); } catch { throw new BackendCallError("response", "Usługa zwróciła niepoprawny zasób."); }
  }
  async function write(path: string, method: "POST" | "PUT", body: unknown, subject: string, signal?: AbortSignal): Promise<Resource> {
    const result = await session.call(path, { method, body }, "rops", signal);
    if (!result.ok) {
      const detail = result.status === 422 || result.status === 400 ? detailOf(result) : "";
      throw detail ? new BackendCallError("validation", `${detail}${KEEP}`) : httpCallError(result.status, true, subject);
    }
    try { return parseResource(result.data); } catch { throw new BackendCallError("response", `Usługa nie zwróciła rekordu, więc zapis nie jest potwierdzony.${KEEP}`); }
  }
  async function confirm(id: string, check: (r: Resource) => boolean, what: string, signal?: AbortSignal): Promise<Resource> {
    const fresh = await read(id, signal);
    if (!check(fresh)) throw new BackendCallError("response", `Ponowny odczyt nie potwierdził: ${what}. Odśwież listę przed ponowieniem.`);
    return fresh;
  }
  const guard = (d: ResourceDraft) => { if (Object.keys(validateResource(d)).length) throw new BackendCallError("validation", `Popraw zaznaczone pola.${KEEP}`); };

  return {
    list: async (filters: { status?: string; group_id?: string }, signal?: AbortSignal): Promise<Resource[]> => {
      const p = new URLSearchParams({ limit: "100" });
      if (filters.status) p.set("status", filters.status);
      if (filters.group_id) p.set("group_id", filters.group_id);
      const result = await session.call(`${base}?${p}`, { method: "GET" }, "rops", signal);
      if (!result.ok) throw httpCallError(result.status, false, "zasoby wiedzy");
      try { return parseResources(result.data); } catch { throw new BackendCallError("response", "Usługa zwróciła niepoprawną listę zasobów."); }
    },
    /** Nowy zasób zawsze jako szkic — bez pola status w treści. */
    async create(d: ResourceDraft, signal?: AbortSignal): Promise<Resource> {
      guard(d);
      const body = { ...resourcePayload(d), status: "roboczy" };
      const saved = await write(base, "POST", body, "nowy zasób", signal);
      return confirm(saved.id, (r) => r.status === "roboczy" && r.title === body.title && r.url === body.url, "zapisu szkicu", signal);
    },
    async update(id: string, d: ResourceDraft, signal?: AbortSignal): Promise<Resource> {
      guard(d);
      const body = resourcePayload(d);
      await write(`${base}/${encodeURIComponent(id)}`, "PUT", body, "edycja zasobu", signal);
      return confirm(id, (r) => r.title === body.title && r.url === body.url && r.year === body.year && r.coverage_scope === body.coverage_scope, "zapisu zmian", signal);
    },
    /** Bez notatki: backend dopisuje ją do publicznego pola caveat. */
    async verify(id: string, signal?: AbortSignal): Promise<Resource> {
      await write(`${base}/${encodeURIComponent(id)}/verify`, "POST", {}, "weryfikacja zasobu", signal);
      return confirm(id, (r) => r.status === "zweryfikowany", "weryfikacji", signal);
    },
    async publish(id: string, signal?: AbortSignal): Promise<Resource> {
      await write(`${base}/${encodeURIComponent(id)}/publish`, "POST", undefined, "publikacja zasobu", signal);
      return confirm(id, (r) => r.status === PUBLISHED, "publikacji", signal);
    },
    /** Brak osobnej operacji w API — wycofanie to zmiana statusu na szkic przez PUT. */
    async unpublish(id: string, signal?: AbortSignal): Promise<Resource> {
      await write(`${base}/${encodeURIComponent(id)}`, "PUT", { status: "roboczy" }, "wycofanie publikacji", signal);
      return confirm(id, (r) => r.status === "roboczy", "wycofania publikacji", signal);
    },
  };
}

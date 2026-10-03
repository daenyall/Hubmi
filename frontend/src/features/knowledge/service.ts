import { BackendApiError, getBackendJson } from "../../lib/api";
import { CATALOG_PAGE_SIZE, parseCatalog, type KnowledgeItem } from "./model";
export interface CatalogRequest { category?: string; limit?: number; offset?: number }
/** GET /api/innovations odpowiada listą MatchItem, bez total_count i bez endpointu kategorii. */
export async function fetchCatalogPage({ category, limit = CATALOG_PAGE_SIZE, offset = 0 }: CatalogRequest = {}, signal?: AbortSignal): Promise<KnowledgeItem[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new Error("Niepoprawne parametry strony katalogu.");
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (category?.trim()) params.set("category", category.trim());
  const raw = await getBackendJson(`/api/innovations?${params}`, signal);
  try {
    const page = parseCatalog(raw);
    if (page.length > limit) throw new Error("Przekroczony limit strony.");
    return page;
  } catch { throw new BackendApiError("response", "Otrzymaliśmy niepoprawne dane katalogu. Spróbuj ponownie."); }
}
export function catalogErrorMessage(error: unknown): string {
  return error instanceof BackendApiError ? error.message : "Nie udało się wczytać katalogu. Spróbuj ponownie.";
}

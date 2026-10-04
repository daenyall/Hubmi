export const CATALOG_PAGE_SIZE = 50;
export interface KnowledgeItem {
  id: string; title: string; description: string; audience: string; category: string | null;
  source_url: string | null; source_invalid: boolean;
  /** Backend: syntetyczny wzorzec MVP, a nie rekord z bazy ROPS. Brak pola = false. */
  demonstrative: boolean; source_label: string;
}
export interface CatalogSnapshot { items: KnowledgeItem[]; nextOffset: number; hasMore: boolean }
function optionalText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error("Niepoprawne pole katalogu.");
  return value.trim();
}
/** similarity_score i status nie należą do modelu karty katalogu. */
export function parseCatalog(value: unknown): KnowledgeItem[] {
  if (!Array.isArray(value)) throw new Error("Oczekiwano tablicy innowacji.");
  const items = value.map((raw): KnowledgeItem => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Niepoprawny rekord katalogu.");
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id.trim() || typeof row.title !== "string" || !row.title.trim()) throw new Error("Brak nazwy lub identyfikatora innowacji.");
    const source = optionalText(row.source_url);
    let sourceUrl: string | null = null;
    if (source) {
      try {
        const parsed = new URL(source);
        if (["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password) sourceUrl = parsed.href;
      } catch { /* Niedostępny link nie usuwa rzeczywistego rekordu z katalogu. */ }
    }
    return {
      id: row.id.trim(), title: row.title.trim(), description: optionalText(row.description),
      audience: optionalText(row.target_group), category: optionalText(row.category) || null,
      source_url: sourceUrl, source_invalid: !!source && !sourceUrl,
      demonstrative: row.is_demonstrative === true, source_label: optionalText(row.source_label),
    };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error("Powtórzone identyfikatory na stronie katalogu.");
  return items;
}
function searchable(text: string): string {
  return text.toLocaleLowerCase("pl-PL").normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l");
}
export function searchCatalog(items: KnowledgeItem[], query: string): KnowledgeItem[] {
  const terms = searchable(query).trim().split(/\s+/).filter(Boolean);
  return terms.length ? items.filter((item) => {
    const text = searchable(`${item.title} ${item.description} ${item.audience}`);
    return terms.every((term) => text.includes(term));
  }) : items;
}
export function mergeCatalogPage(previous: CatalogSnapshot, page: KnowledgeItem[], limit = CATALOG_PAGE_SIZE): CatalogSnapshot {
  const items = new Map(previous.items.map((item) => [item.id, item]));
  for (const item of page) items.set(item.id, item);
  return { items: [...items.values()], nextOffset: previous.nextOffset + page.length, hasMore: page.length === limit };
}
export function collectCategories(items: KnowledgeItem[]): string[] {
  return [...new Set(items.flatMap((item) => item.category ? [item.category] : []))].sort((a, b) => a.localeCompare(b, "pl"));
}

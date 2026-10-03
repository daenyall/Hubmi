"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { collectCategories, searchCatalog, type KnowledgeItem } from "./model";
import { useCatalog } from "./use-catalog";
import { KnowledgeCard } from "./knowledge-card";

export function KnowledgeBrowser() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const onPage = useCallback((items: KnowledgeItem[]) => setCategories((known) => [...new Set([...known, ...collectCategories(items)])].sort((a, b) => a.localeCompare(b, "pl"))), []);
  return <div className="space-y-6">
    <div className="grid gap-5 rounded-2xl border border-border bg-card p-[24px] sm:grid-cols-2">
      <div className="min-w-0 space-y-2"><label htmlFor="catalog-search" className="block font-semibold">Szukaj w pobranych innowacjach</label>
        <Input id="catalog-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-describedby="catalog-search-hint" placeholder="Nazwa, opis lub odbiorcy" className="h-auto min-h-12 py-3 text-base md:text-base" />
        <p id="catalog-search-hint" className="text-sm leading-relaxed text-muted-foreground">Wyszukiwanie obejmuje tylko pobrane rekordy bieżącego widoku. Wczytaj kolejne, aby rozszerzyć zakres.</p>
      </div>
      <div className="min-w-0 space-y-2"><label htmlFor="catalog-category" className="block font-semibold">Kategoria</label>
        <select id="catalog-category" value={category} onChange={(event) => setCategory(event.target.value)} aria-describedby="catalog-category-hint" className="min-h-12 w-full max-w-full rounded-lg border border-input bg-background px-[12px] py-3 text-base">
          <option value="">Wszystkie kategorie</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <p id="catalog-category-hint" className="text-sm leading-relaxed text-muted-foreground">Filtr działa na serwerze. Lista kategorii pochodzi z dotychczas pobranych rekordów i może być niepełna.</p>
      </div>
    </div>
    {(query || category) && <Button variant="outline" onClick={() => { setQuery(""); setCategory(""); }} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Wyczyść wyszukiwanie i filtr</Button>}
    <CatalogResults key={category} category={category} query={query} onPage={onPage} />
  </div>;
}
function CatalogResults({ category, query, onPage }: { category: string; query: string; onPage: (items: KnowledgeItem[]) => void }) {
  const { snapshot, initial, message, loadingMore, moreError, loadMore, retry } = useCatalog(category, onPage);
  const visible = searchCatalog(snapshot.items, query);
  if (initial === "loading") return <LoadingMessage>Wczytujemy katalog innowacji…</LoadingMessage>;
  if (initial === "error") return <div className="space-y-4"><StatusMessage error>{message}</StatusMessage><Button variant="outline" onClick={retry} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Ponów wczytanie katalogu</Button></div>;
  return <section aria-labelledby="catalog-results-heading" className="space-y-5">
    <h2 id="catalog-results-heading" className="text-xl font-semibold">{category ? `Innowacje: ${category}` : "Katalog innowacji"}</h2>
    <p role="status" aria-atomic="true" className="text-sm text-muted-foreground">Pobrano {snapshot.items.length} pozycji w tym widoku. Wyniki wyszukiwania w pobranych rekordach: {visible.length}.</p>
    {!snapshot.items.length ? <StatusMessage>{category ? "Brak innowacji w wybranej kategorii." : "Katalog jest obecnie pusty."}</StatusMessage>
      : !visible.length ? <StatusMessage>Nie znaleziono wyników w pobranych rekordach. Zmień tekst lub wczytaj kolejne innowacje, jeśli są dostępne.</StatusMessage>
      : <ul className="grid gap-5 sm:grid-cols-2">{visible.map((item) => <li key={item.id} className="min-w-0"><KnowledgeCard item={item} /></li>)}</ul>}
    {!visible.length && <Link href="/kreator" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Opisz własny pomysł w kreatorze</Link>}
    {moreError && <StatusMessage error>Nie wczytano kolejnej strony. Pobrane rekordy pozostają dostępne. {moreError}</StatusMessage>}
    {snapshot.hasMore && <Button disabled={loadingMore} onClick={() => void loadMore()} className="h-auto min-h-12 whitespace-normal px-[24px] py-3 text-base">{loadingMore ? "Wczytujemy kolejne innowacje…" : moreError ? "Ponów wczytanie kolejnej strony" : "Wczytaj więcej"}</Button>}
    {loadingMore && <LoadingMessage>Wczytujemy kolejne pozycje katalogu…</LoadingMessage>}
    {!snapshot.hasMore && snapshot.items.length > 0 && <p className="text-sm text-muted-foreground">Brak kolejnych pozycji w bieżącym widoku katalogu.</p>}
  </section>;
}

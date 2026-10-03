"use client";
import { useEffect, useRef, useState } from "react";
import { CATALOG_PAGE_SIZE, mergeCatalogPage, type CatalogSnapshot, type KnowledgeItem } from "./model";
import { catalogErrorMessage, fetchCatalogPage } from "./service";

export function useCatalog(category: string, onPage: (page: KnowledgeItem[]) => void) {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot>({ items: [], nextOffset: 0, hasMore: false });
  const [initial, setInitial] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    Promise.resolve().then(() => fetchCatalogPage({ category }, controller.signal)).then((page) => {
      if (controller.signal.aborted) return;
      setSnapshot(mergeCatalogPage({ items: [], nextOffset: 0, hasMore: false }, page));
      setInitial("ready"); onPage(page);
    }).catch((error) => {
      if (!controller.signal.aborted) { setMessage(catalogErrorMessage(error)); setInitial("error"); }
    });
    return () => { mounted.current = false; controller.abort(); pending.current?.abort(); };
  }, [category, onPage, attempt]);
  async function loadMore() {
    if (pending.current || initial !== "ready" || !snapshot.hasMore) return;
    const controller = new AbortController(); pending.current = controller;
    setLoadingMore(true); setMoreError("");
    try {
      const page = await fetchCatalogPage({ category, offset: snapshot.nextOffset, limit: CATALOG_PAGE_SIZE }, controller.signal);
      if (!controller.signal.aborted && mounted.current) {
        setSnapshot((previous) => mergeCatalogPage(previous, page)); onPage(page);
      }
    } catch (error) {
      if (!controller.signal.aborted && mounted.current) setMoreError(catalogErrorMessage(error));
    } finally {
      if (pending.current === controller) pending.current = null;
      if (mounted.current) setLoadingMore(false);
    }
  }
  return { snapshot, initial, message, loadingMore, moreError, loadMore, retry: () => { setInitial("loading"); setMessage(""); setAttempt((n) => n + 1); } };
}

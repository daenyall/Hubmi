"use client";
import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { useBackendQuery } from "@/features/rops/use-backend-query";
import { isSafeResourceUrl } from "./resources";
import { fetchPublishedResource } from "./resource-service";

const CANVAS_ID = "social-innovation-canvas";

/**
 * Pomoc w kreatorze: plansza warsztatowa ROPS do przemyślenia pomysłu przed zapisem fiszki.
 * Pochodzi z opublikowanego zasobu Zasobnika; gdy ROPS go wycofa, podpowiedź znika.
 * Nie jest kolejnym formularzem ani integracją — to odnośnik do pliku w serwisie ROPS.
 */
export function CanvasHint() {
  const load = useCallback((signal: AbortSignal) => fetchPublishedResource(CANVAS_ID, signal), []);
  const { state } = useBackendQuery("canvas-hint", load);
  const canvas = state.status === "success" && state.data && isSafeResourceUrl(state.data.url) ? state.data : null;
  if (!canvas) return null;
  return <aside aria-labelledby="canvas-hint-heading" className="space-y-3 rounded-2xl border border-border bg-secondary p-[24px]">
    <div className="flex flex-wrap items-center gap-3">
      <h2 id="canvas-hint-heading" className="text-xl font-semibold">Zanim opiszesz pomysł: {canvas.title}</h2>
      <Badge variant="outline" className="h-auto min-h-7 max-w-full whitespace-normal">{canvas.kind}</Badge>
    </div>
    <p className="max-w-3xl text-sm leading-relaxed">
      Plansza prowadzi przez problem i jego skalę, osoby, których dotyczy, wartość i przystępność rozwiązania oraz koszty.
      Przy każdej sekcji ma pytania pomocnicze, więc pomaga sprawdzić pomysł, zanim zapiszesz fiszkę. Wypełniasz ją u siebie — nic z niej nie trafia do tego formularza.
    </p>
    <a
      href={canvas.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4"
    >
      Otwórz planszę (PDF, nowa karta)
      <span className="sr-only">: {canvas.title} w serwisie ROPS Kraków, plik PDF otwiera się w nowej karcie</span>
    </a>
  </aside>;
}

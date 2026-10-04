"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adaptInnovation, type AdaptResponse } from "@/lib/api";
import type { MatchItem } from "@/lib/matching";

type AdaptState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; result: AdaptResponse };

const SOURCE_NAMES: Record<string, string> = {
  gemini: "model Gemini",
  openai: "model OpenAI",
  template_fallback: "szablon awaryjny ROPS",
};

/**
 * Pochodzenie planu. Trzy rozłączne stany, bo brak metadanej to nie wynik AI:
 * true = wygenerował model, false = szablon awaryjny, null = backend nie podał źródła.
 * Żaden z nich nie jest stanowiskiem ani zatwierdzeniem ROPS.
 */
function PlanOrigin({ result }: { result: AdaptResponse }) {
  const ai = result.is_ai_generated;
  const source = result.generation_source;
  const named = source ? SOURCE_NAMES[source] ?? `źródło „${source}”` : "";
  const label = ai === true ? "Treść wygenerowana przez AI" : ai === false ? "Szablon awaryjny, nie AI" : "Źródło planu niepotwierdzone";
  const explanation = ai === true
    ? `Plan przygotował ${named || "model generatywny"} na podstawie Twojego opisu. Sprawdź dane przed użyciem — to nie jest stanowisko ani zatwierdzenie ROPS.`
    : ai === false
      ? `To gotowy szablon${named ? ` (${named})` : ""}, a nie plan przygotowany dla Twojego opisu. Nie jest stanowiskiem ani zatwierdzeniem ROPS i wymaga samodzielnego uzupełnienia.`
      : `Backend nie podał informacji o źródle tego planu${named ? ` (${named})` : ""}. Nie traktuj treści jako wyniku AI ani jako stanowiska ROPS.`;
  return <div className="space-y-2 rounded-lg border border-border bg-secondary p-[12px]">
    <Badge variant={ai === true ? "secondary" : "outline"} className="h-auto min-h-7 max-w-full whitespace-normal">{label}</Badge>
    <p className="text-sm leading-relaxed">{explanation}</p>
    {result.disclaimer && <p className="text-sm leading-relaxed text-muted-foreground"><span className="font-semibold">Zastrzeżenie usługi: </span>{result.disclaimer}</p>}
  </div>;
}

/** Zachowuje funkcję Middleman AI z upstreamu, z edytowalnym kontekstem. */
export function AdaptationForm({ item }: { item: MatchItem }) {
  const id = useId();
  const [context, setContext] = useState("");
  const [state, setState] = useState<AdaptState>({ status: "idle" });
  const request = useRef<AbortController | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  const loading = state.status === "loading";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    if (context.trim().length < 5) {
      setState({ status: "error", message: "Opisz kontekst swojej instytucji, używając co najmniej 5 znaków." });
      field.current?.focus();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setState({ status: "loading" });
    try {
      const result = await adaptInnovation(item.title, context, item.description, controller.signal);
      if (!controller.signal.aborted) setState({ status: "success", result });
    } catch (error) {
      if (!controller.signal.aborted) setState({
        status: "error",
        message: error instanceof Error ? error.message : "Nie udało się wygenerować planu. Spróbuj ponownie.",
      });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  return (
    <details className="rounded-xl border border-border p-[16px]">
      <summary className="min-h-11 cursor-pointer rounded-sm py-2 font-semibold text-primary">
        Plan adaptacji dla Twojej instytucji
      </summary>
      <form onSubmit={submit} noValidate className="mt-3 space-y-3">
        <label htmlFor={id} className="block text-sm font-semibold">Kontekst Twojej instytucji (wymagane)</label>
        <p id={`${id}-hint`} className="text-sm leading-relaxed text-muted-foreground">
          Opisz miejsce, zasoby i budżet, aby dopasować plan do lokalnych możliwości.
        </p>
        <textarea
          id={id}
          ref={field}
          required
          rows={4}
          value={context}
          readOnly={loading}
          aria-describedby={`${id}-hint`}
          onChange={(event) => { setContext(event.target.value); setState({ status: "idle" }); }}
          placeholder="Np. mała gmina wiejska, dostępna świetlica i zespół wolontariuszy."
          className="w-full resize-y rounded-lg border border-input bg-background p-[12px] text-base leading-relaxed"
        />
        {state.status === "error" && <p role="alert" className="text-sm leading-relaxed text-red-900">{state.message}</p>}
        <Button type="submit" disabled={loading} className="h-auto min-h-11 max-w-full whitespace-normal px-[16px] py-2">
          {loading ? "Generujemy plan…" : "Wygeneruj plan adaptacji"}
        </Button>
      </form>
      <p role="status" aria-atomic="true" className="mt-3 text-sm text-muted-foreground">
        {loading ? "Generujemy plan adaptacji…" : state.status === "success" ? "Plan adaptacji jest gotowy." : ""}
      </p>
      {state.status === "success" && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <h4 className="font-semibold">Plan adaptacji: {item.title}</h4>
          <PlanOrigin result={state.result} />
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{state.result.adaptation_plan}</p>
        </div>
      )}
    </details>
  );
}

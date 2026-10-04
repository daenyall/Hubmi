"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CircleAlert, FileText, LoaderCircle, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MatchCard } from "@/components/match-card";
import { MatchApiError, matchProblem, USE_MOCK_MATCHING } from "@/lib/api";
import { MAX_PROBLEM_LENGTH, MIN_PROBLEM_LENGTH, type MatchResponse } from "@/lib/matching";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; response: MatchResponse; query: string }
  | { status: "error"; message: string; validation: boolean };

const examples = [
  {
    label: "Samotność seniorów",
    text: "W naszej gminie osoby starsze mieszkające samotnie rzadko wychodzą z domu. Szukamy sposobu na regularne spotkania, budowanie relacji sąsiedzkich i wsparcie w codziennych sprawach.",
  },
  {
    label: "Dostępność wsparcia",
    text: "Osoby z niepełnosprawnościami i ich opiekunowie mają trudność z dotarciem do lokalnych usług. Chcemy ograniczyć bariery i zapewnić dostępne wsparcie blisko domu.",
  },
];

const LINK = "inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4";

/**
 * Brak wyników obejmuje też opis odrzucony przez walidator backendu: w obu przypadkach
 * backend odpowiada 200 z no_match_advice. Pokazujemy jego poradę, nie własną interpretację.
 */
function NoMatches({ response }: { response: MatchResponse }) {
  return (
    <div className="space-y-6 rounded-2xl border border-dashed border-input bg-card/60 p-[24px]">
      <div className="flex items-start gap-3">
        <Search className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 space-y-2">
          <p className="text-base font-semibold">Nie znaleziono dopasowanych innowacji</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {response.advice || "Usługa nie przysłała dodatkowej porady. Nazwij potrzebę krócej i konkretniej, a potem spróbuj ponownie."}
          </p>
        </div>
      </div>

      {response.categories.length > 0 && (
        <div className="space-y-2">
          <h3 id="suggested-categories" className="text-sm font-semibold">Kategorie tematyczne ROPS</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">Podpowiedzi do przeformułowania opisu. Nie są filtrem tego wyszukiwania.</p>
          <ul aria-labelledby="suggested-categories" className="flex flex-wrap gap-2">
            {response.categories.map((name) => (
              <li key={name}><Badge variant="outline" className="h-auto min-h-7 max-w-full whitespace-normal">{name}</Badge></li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h3 id="next-steps" className="text-sm font-semibold">Co możesz zrobić dalej</h3>
        <ul aria-labelledby="next-steps" className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>Nazwij potrzebę wprost i krótko, na przykład „samotność seniorów na wsi”.</li>
          <li><Link href="/baza-wiedzy" className={LINK}>Przejrzyj Zasobnik Wiedzy</Link> i zawęź go filtrem kategorii.</li>
          {response.can_submit_challenge && (
            <li>
              <Link href="/kreator" className={LINK}>Zgłoś pomysł na rozwiązanie</Link>
              {" "}— fiszka wymaga opisu problemu i istoty rozwiązania, więc przygotuj oba.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

export function MatchingForm() {
  const [description, setDescription] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const textarea = useRef<HTMLTextAreaElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const loading = state.status === "loading";
  const validationError = state.status === "error" && state.validation;

  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    if (state.status === "success") resultsHeading.current?.focus();
  }, [state.status]);

  function updateDescription(value: string) {
    setDescription(value);
    // Wyniki zawsze dotyczą wysłanego opisu, nigdy edytowanego pytania.
    setState({ status: "idle" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Ref blokuje także dwa wysłania przed kolejnym renderem Reacta.
    if (activeRequest.current) return;
    const query = description.trim();
    if (!query) {
      setState({
        status: "error",
        message: "Opisz problem lub potrzebę, aby znaleźć rozwiązania.",
        validation: true,
      });
      textarea.current?.focus();
      return;
    }
    if (query.length < MIN_PROBLEM_LENGTH) {
      setState({ status: "error", message: `Opis potrzeby musi zawierać co najmniej ${MIN_PROBLEM_LENGTH} znaki.`, validation: true });
      textarea.current?.focus();
      return;
    }
    if (query.length > MAX_PROBLEM_LENGTH) {
      setState({ status: "error", message: `Opis może mieć maksymalnie ${MAX_PROBLEM_LENGTH} znaków. Masz ich ${query.length}. Skróć opis i spróbuj ponownie.`, validation: true });
      textarea.current?.focus();
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setState({ status: "loading" });
    try {
      const response = await matchProblem({ problem_description: query }, controller.signal);
      if (!controller.signal.aborted) setState({ status: "success", response, query });
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({
          status: "error",
          message: error instanceof MatchApiError
            ? error.message
            : "Nie udało się wyszukać rozwiązań. Spróbuj ponownie za chwilę.",
          validation: false,
        });
      }
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }

  const announcement = loading
    ? "Szukamy rozwiązań dla opisanej potrzeby…"
    : state.status === "success"
      ? `Znalezione innowacje: ${state.response.matches.length}. Powiązane materiały: ${state.response.related_resources.length}.`
      : "";

  return (
    <div className="space-y-12">
      <section id="wyszukaj" aria-labelledby="form-heading" className="scroll-mt-6">
        <Card className="gap-6 rounded-3xl border border-border shadow-sm ring-0 [--card-spacing:24px] sm:[--card-spacing:32px]">
          <CardHeader className="gap-2">
            <CardTitle>
              <h2 id="form-heading" className="text-2xl font-semibold tracking-tight">Zacznij od swojej potrzeby</h2>
            </CardTitle>
            <p className="text-base leading-relaxed text-muted-foreground">
              Opowiedz o sytuacji. Poszukamy innowacji społecznych, które mogą pomóc.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} noValidate className="space-y-5" aria-busy={loading}>
              <div className="space-y-3">
                <label htmlFor="problem-description" className="block text-base font-semibold">
                  Opisz problem lub potrzebę <span className="font-normal text-muted-foreground">(wymagane)</span>
                </label>
                <p id="problem-hint" className="text-sm leading-relaxed text-muted-foreground">
                  Kogo dotyczy problem? Co chcesz zmienić? Opisz to zwięźle i konkretnie, od {MIN_PROBLEM_LENGTH} do {MAX_PROBLEM_LENGTH} znaków.
                </p>
                <textarea
                  ref={textarea}
                  id="problem-description"
                  name="problem_description"
                  required
                  rows={6}
                  value={description}
                  onChange={(event) => updateDescription(event.target.value)}
                  readOnly={loading}
                  aria-invalid={validationError || undefined}
                  aria-describedby={`problem-hint${validationError ? " problem-error" : ""}`}
                  maxLength={MAX_PROBLEM_LENGTH}
                  placeholder={`Np. ${examples[0].text}`}
                  className="block min-h-44 w-full resize-y rounded-xl border border-input bg-background p-[16px] text-base leading-relaxed text-foreground placeholder:text-muted-foreground read-only:opacity-75 aria-invalid:border-destructive"
                />
                <p className="text-sm text-muted-foreground">Wykorzystano {description.length} z {MAX_PROBLEM_LENGTH} znaków.</p>
              </div>

              {state.status === "error" && (
                <div id="problem-error" role="alert" className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm leading-relaxed text-red-900">
                  <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <p>{state.message}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm text-muted-foreground">Użyj przykładu:</span>
                {examples.map((example) => (
                  <Button
                    key={example.label}
                    type="button"
                    variant="outline"
                    disabled={loading}
                    onClick={() => {
                      updateDescription(example.text);
                      textarea.current?.focus();
                    }}
                    className="h-auto min-h-11 max-w-full whitespace-normal rounded-full px-[16px] py-2"
                  >
                    {example.label}
                  </Button>
                ))}
              </div>

              <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                  Nazwij potrzebę wprost, na przykład „samotność seniorów na wsi”.
                </p>
                <Button type="submit" disabled={loading} className="h-auto min-h-12 w-full whitespace-normal rounded-xl px-[24px] py-3 text-base sm:w-auto [&_svg]:size-[20px]">
                  {loading ? (
                    <><LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden="true" /> Szukamy rozwiązań…</>
                  ) : (
                    <>Znajdź rozwiązania <ArrowRight className="size-5" aria-hidden="true" /></>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="results-heading" className="space-y-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-1 size-6 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 space-y-2">
            <h2 id="results-heading" ref={resultsHeading} tabIndex={-1} className="rounded-sm text-2xl font-semibold tracking-tight">
              Dopasowane innowacje
            </h2>
            <p role="status" aria-atomic="true" className="text-sm text-muted-foreground">{announcement}</p>
          </div>
        </div>

        {state.status === "success" && (
          <p className="text-sm leading-relaxed text-muted-foreground">Dopasowania dla: <q>{state.query}</q></p>
        )}

        {state.status === "success" && state.response.matches.length > 0 ? (
          <ul className="grid gap-5 md:grid-cols-2">
            {state.response.matches.map((item) => (
              <li key={item.id} className="min-w-0"><MatchCard item={item} demo={USE_MOCK_MATCHING} /></li>
            ))}
          </ul>
        ) : state.status === "success" ? (
          <NoMatches response={state.response} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-input bg-card/60 px-6 py-10 text-center">
            <Search className="size-7 text-primary" aria-hidden="true" />
            <p className="text-base font-semibold">
              {loading ? "Sprawdzamy dopasowania" : state.status === "error" ? "Wyszukiwanie nie zostało zakończone" : "Tu pojawią się propozycje dla Ciebie"}
            </p>
            <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
              {loading ? "To może potrwać chwilę. Wyniki pokażemy po zakończeniu wyszukiwania." : state.status === "error" ? "Twój opis pozostał w formularzu. Możesz spróbować ponownie." : "Opisz potrzebę i wybierz „Znajdź rozwiązania”, aby zobaczyć innowacje oraz powody ich dopasowania."}
            </p>
          </div>
        )}
      </section>

      {state.status === "success" && state.response.related_resources.length > 0 && (
        <section aria-labelledby="resources-heading" className="space-y-5">
          <div className="flex items-center gap-3">
            <FileText className="size-6 shrink-0 text-primary" aria-hidden="true" />
            <h2 id="resources-heading" className="text-2xl font-semibold tracking-tight">Powiązane materiały</h2>
          </div>
          <ul className="grid gap-5 md:grid-cols-2">
            {state.response.related_resources.map((item) => (
              <li key={item.id} className="min-w-0"><MatchCard item={item} demo={USE_MOCK_MATCHING} resource /></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

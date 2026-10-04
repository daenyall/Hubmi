"use client";
import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { useBackendQuery } from "@/features/rops/use-backend-query";
import { isNationalScope, type Resource } from "./resource-model";
import { fetchResourceGroups } from "./resource-service";

function ResourceCard({ item }: { item: Resource }) {
  const video = /wideo|film/i.test(item.kind);
  return <article aria-label={item.title} className="h-full min-w-0">
    <Card className="h-full rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px]">
      <CardHeader className="space-y-3">
        <h4 className="text-lg font-semibold leading-snug">{item.title}</h4>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="h-auto min-h-7 max-w-full whitespace-normal">{item.kind}</Badge>
          {isNationalScope(item.coverage_scope) && <Badge variant="outline" className="h-auto min-h-7 max-w-full whitespace-normal">Dane nie tylko dla Małopolski</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2 [&>div]:min-w-0">
          <div><dt className="font-semibold">Rok danych</dt><dd>{item.year ?? "nie podano w źródle"}</dd></div>
          <div><dt className="font-semibold">Zasięg</dt><dd>{item.coverage_scope ?? "nie podano w źródle"}</dd></div>
        </dl>
        <p className="leading-relaxed text-muted-foreground">{item.description}</p>
        {item.caveat && <p className="text-sm leading-relaxed text-muted-foreground"><span className="font-semibold">Zastrzeżenie: </span>{item.caveat}</p>}
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">
          {video ? "Obejrzyj materiał wideo" : "Otwórz źródło"}<span className="sr-only">: {item.title} (otwiera się w nowej karcie)</span>
        </a>
      </CardContent>
    </Card>
  </article>;
}

export function KnowledgeResourceSections() {
  const load = useCallback((signal: AbortSignal) => fetchResourceGroups(signal), []);
  const { state, refresh } = useBackendQuery("resource-groups", load);
  return <section aria-labelledby="rops-resources-heading" className="space-y-6">
    <div className="max-w-3xl space-y-2">
      <h2 id="rops-resources-heading" className="text-2xl font-semibold tracking-tight">Zasoby ROPS Kraków</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Raporty, materiały edukacyjne i nagrania opublikowane przez ROPS w Zasobniku. Przy każdym podajemy rok i zasięg danych ze źródła.
        Za treść i aktualność materiałów odpowiada ROPS Kraków. Odnośniki otwierają się w nowej karcie.
      </p>
    </div>
    {state.status === "loading" && <LoadingMessage>Wczytujemy zasoby…</LoadingMessage>}
    {state.status === "error" && <div className="space-y-3"><StatusMessage error>{state.message}</StatusMessage>
      <Button variant="outline" onClick={refresh} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Ponów wczytanie zasobów</Button></div>}
    {state.status === "success" && (state.data.every((g) => !g.items.length)
      ? <StatusMessage>Brak opublikowanych zasobów.</StatusMessage>
      : state.data.filter((g) => g.items.length).map((group) => <div key={group.id} className="space-y-4">
        <div className="max-w-3xl space-y-2">
          <h3 id={`resource-group-${group.id}`} className="text-xl font-semibold">{group.title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{group.intro}</p>
        </div>
        <ul aria-labelledby={`resource-group-${group.id}`} className="grid gap-5 sm:grid-cols-2">
          {group.items.map((item) => <li key={item.id} className="min-w-0"><ResourceCard item={item} /></li>)}
        </ul>
      </div>))}
  </section>;
}

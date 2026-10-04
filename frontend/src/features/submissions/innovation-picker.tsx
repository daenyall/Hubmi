"use client";
import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { createSubmissionsService } from "./service";
import { useSubmissionQuery } from "./use-query";

export function LinkedInnovation({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => createSubmissionsService().getInnovation(id, signal), [id]);
  const { state } = useSubmissionQuery(id, load);
  if (state.status === "loading") return <LoadingMessage>Wczytujemy powiązaną innowację…</LoadingMessage>;
  if (state.status === "error") return <StatusMessage error>{state.message}</StatusMessage>;
  return <div className="space-y-2 rounded-xl border border-border bg-secondary p-[16px]">
    <h3 className="text-lg font-semibold">{state.data.title}</h3>
    {state.data.demonstrative && <Badge variant="outline" className="h-auto min-h-7 max-w-full whitespace-normal">Wzorzec demonstracyjny — nie rekord z bazy ROPS</Badge>}
    {state.data.source_label && <p className="text-sm text-muted-foreground">Pochodzenie: {state.data.source_label}</p>}
    <p className="whitespace-pre-wrap text-sm leading-relaxed">{state.data.description}</p>
    <p className="text-sm"><span className="font-semibold">Odbiorcy: </span>{state.data.target_group}</p>
    {state.data.source_url && <a href={state.data.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-primary underline underline-offset-4">Zobacz źródło<span className="sr-only"> (otwiera się w nowej karcie)</span></a>}
  </div>;
}
export function InnovationPicker({ value, onChange, disabled, error }: { value: string; onChange: (value: string) => void; disabled: boolean; error?: string }) {
  const load = useCallback((signal: AbortSignal) => createSubmissionsService().listInnovations(signal), []);
  const { state, retry } = useSubmissionQuery("innovations", load);
  const options = state.status === "success" ? state.data : [];
  return <div className="space-y-3">
    <label htmlFor="matched_innovation_id" className="block font-semibold">Powiązana innowacja (opcjonalnie)</label>
    <p id="innovation-hint" className="text-sm leading-relaxed text-muted-foreground">Możesz oprzeć pomysł na innowacji z bazy albo pozostawić zgłoszenie bez powiązania.</p>
    <select id="matched_innovation_id" value={value} disabled={disabled || state.status !== "success"} onChange={(event) => onChange(event.target.value)} aria-invalid={!!error || undefined} aria-describedby={`innovation-hint${error ? " matched_innovation_id-error" : ""}`} className="min-h-12 w-full rounded-lg border border-input bg-background px-[12px] py-3 text-base">
      <option value="">Bez powiązania</option>
      {value && !options.some((item) => item.id === value) && <option value={value}>Wybrana innowacja</option>}
      {options.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select>
    {state.status === "loading" && <p role="status" className="text-sm text-muted-foreground">Wczytujemy listę innowacji…</p>}
    {state.status === "error" && <div className="space-y-2"><p className="text-sm text-muted-foreground">Lista innowacji jest niedostępna. Możesz zgłosić własny pomysł bez powiązania.</p><Button type="button" variant="outline" disabled={disabled} onClick={retry} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Ponów wczytanie innowacji</Button></div>}
    {value && <><Button type="button" variant="outline" disabled={disabled} onClick={() => onChange("")} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Usuń powiązanie</Button><LinkedInnovation key={value} id={value} /></>}
  </div>;
}

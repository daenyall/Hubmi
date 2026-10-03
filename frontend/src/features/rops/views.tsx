"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { useSubmissionQuery } from "@/features/submissions/use-query";
import { STATUS_LABELS } from "@/features/submissions/model";
import { SubmissionContent } from "@/features/submissions/views";
import { Conversation } from "@/features/messages/conversation";
import { RopsGate, Stage3Error } from "./gate";
import { createRopsService } from "./service";
import { formatDate } from "@/features/submissions/model";
import { RopsActions } from "./actions";
import type { Review } from "./model";

function AccessibleList() {
  const [filter, setFilter] = useState("");
  return <section aria-labelledby="rops-list-heading" className="space-y-5">
    <h2 id="rops-list-heading" className="text-xl font-semibold">Zgłoszenia do obsługi</h2>
    <div className="max-w-sm space-y-2"><label htmlFor="status-filter" className="block font-semibold">Filtruj według statusu</label>
      <select id="status-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="min-h-12 w-full rounded-lg border border-input bg-card px-[12px] py-3 text-base">
        <option value="">Wszystkie statusy</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></div>
    <FilteredList key={filter} filter={filter} />
  </section>;
}
function FilteredList({ filter }: { filter: string }) {
  const load = useCallback((signal: AbortSignal) => createRopsService().list(filter, signal), [filter]);
  const { state, retry } = useSubmissionQuery(`rops-list:${filter}`, load);
  if (state.status === "loading") return <LoadingMessage>Wczytujemy zgłoszenia…</LoadingMessage>;
  if (state.status === "error") return <Stage3Error message={state.message} retry={retry} />;
  return <div className="space-y-5">
    {!state.data.length ? <StatusMessage>{filter ? "Brak zgłoszeń o wybranym statusie." : "Nie ma jeszcze zgłoszeń do obsługi."}</StatusMessage>
      : <ul className="grid gap-4 sm:grid-cols-2">{state.data.map((item) => <li key={item.id} className="space-y-4 rounded-2xl border border-border bg-card p-[24px]">
        <h3 className="text-xl font-semibold"><Link href={`/rops/zgloszenia/${item.id}`} className="rounded-sm text-primary underline underline-offset-4">{item.title}</Link></h3>
        <p className="text-sm text-muted-foreground">Zgłoszono: <time dateTime={item.created_at}>{formatDate(item.created_at)}</time></p>
        <Badge variant="secondary" className="h-auto min-h-7 whitespace-normal">{STATUS_LABELS[item.status]}</Badge>
      </li>)}</ul>}
    <Button variant="outline" onClick={retry} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Odśwież zgłoszenia</Button>
  </div>;
}
export function RopsList() { return <RopsGate><AccessibleList /></RopsGate>; }

function AccessibleDetail({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => createRopsService().get(id, signal), [id]);
  const { state, retry } = useSubmissionQuery(`rops-detail:${id}`, load);
  const [saved, setSaved] = useState<{ base: Review; item: Review } | null>(null);
  if (state.status === "loading") return <LoadingMessage>Wczytujemy zgłoszenie…</LoadingMessage>;
  if (state.status === "error") return <Stage3Error message={state.message} retry={retry} />;
  const item = saved?.base === state.data ? saved.item : state.data;
  return <div className="space-y-8">
    <SubmissionContent item={item} />
    <section aria-labelledby="published-official-heading" className="space-y-3"><h2 id="published-official-heading" className="text-xl font-semibold">Opublikowana odpowiedź ROPS</h2>
      {item.official_response?.trim() ? <blockquote className="whitespace-pre-wrap rounded-xl border border-border bg-secondary p-[24px] leading-relaxed">{item.official_response}</blockquote> : <p className="text-muted-foreground">Nie opublikowano jeszcze oficjalnej odpowiedzi.</p>}
    </section>
    <RopsActions key={item.id} item={item} onSaved={(confirmed) => setSaved({ base: state.data, item: confirmed })} />
    <Button variant="outline" onClick={retry} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Odśwież szczegóły zgłoszenia</Button>
    <Conversation submissionId={id} viewer="rops" />
  </div>;
}
export function RopsDetail({ id }: { id: string }) {
  return <div className="space-y-5"><Link href="/rops" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Wróć do panelu ROPS</Link><RopsGate><AccessibleDetail key={id} id={id} /></RopsGate></div>;
}

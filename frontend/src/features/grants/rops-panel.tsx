"use client";
import Link from "next/link";
import { useCallback, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { RopsBackendGate } from "@/features/rops/backend-gate";
import { useBackendQuery } from "@/features/rops/use-backend-query";
import { formatDate } from "@/features/submissions/model";
import { APPLICANT_TYPE_LABELS, APPLICATION_STATUS_LABELS, CALL_STATUS_LABELS, formatPln, label } from "./model";
import { createGrantService } from "./service";

const SELECT = "min-h-12 w-full rounded-lg border border-input bg-card px-[12px] py-3 text-base";

function Panel() {
  const id = useId();
  // Domyślnie złożone: wersje robocze to praca autora, a nie wnioski do oceny.
  const [status, setStatus] = useState("zlozony");
  const [callId, setCallId] = useState("");
  const callsLoad = useCallback((signal: AbortSignal) => createGrantService().calls(signal), []);
  const calls = useBackendQuery("rops-grant-calls", callsLoad);
  const load = useCallback((signal: AbortSignal) => createGrantService().adminList({ status: status || undefined, call_id: callId || undefined }, signal), [status, callId]);
  const { state, refresh } = useBackendQuery(`rops-grants:${status}:${callId}`, load);
  return <section aria-labelledby={`${id}-h`} className="space-y-5">
    <h2 id={`${id}-h`} className="text-2xl font-semibold">Wnioski w naborach</h2>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-2"><label htmlFor={`${id}-s`} className="block font-semibold">Status wniosku</label>
        <select id={`${id}-s`} value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT}><option value="">Wszystkie (także wersje robocze)</option>{Object.entries(APPLICATION_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="min-w-0 space-y-2"><label htmlFor={`${id}-c`} className="block font-semibold">Nabór</label>
        <select id={`${id}-c`} value={callId} onChange={(e) => setCallId(e.target.value)} className={SELECT}><option value="">Wszystkie</option>{calls.state.status === "success" && calls.state.data.map((c) => <option key={c.id} value={c.id}>{c.name} ({label(CALL_STATUS_LABELS, c.status)})</option>)}</select></div>
    </div>
    <Button variant="outline" onClick={refresh} className="h-auto min-h-11 px-[16px]">Odśwież listę</Button>
    {state.status === "loading" && <LoadingMessage>Wczytujemy wnioski…</LoadingMessage>}
    {state.status === "error" && <div className="space-y-3"><StatusMessage error>{state.message}</StatusMessage><Button variant="outline" onClick={refresh} className="h-auto min-h-11 px-[16px]">Spróbuj ponownie</Button></div>}
    {state.status === "success" && (state.data.length === 0 ? <StatusMessage>Brak wniosków dla wybranych filtrów.</StatusMessage>
      : <ul className="space-y-4">{state.data.map((a) => <li key={a.id} className="min-w-0"><article aria-label={a.title || "Wniosek bez tytułu"} className="space-y-2 rounded-2xl border border-border bg-card p-[20px]">
        <div className="flex flex-wrap gap-2"><Badge variant="secondary" className="h-auto min-h-7 whitespace-normal">{label(APPLICATION_STATUS_LABELS, a.status)}</Badge>
          <Badge variant="outline" className="h-auto min-h-7 whitespace-normal">Nabór: {label(CALL_STATUS_LABELS, a.call_status ?? "")}</Badge></div>
        <h3 className="text-lg font-semibold"><Link href={`/rops/wnioski/${a.id}`} className="rounded-sm text-primary underline underline-offset-4">{a.title || "Wniosek bez tytułu"}</Link></h3>
        <p className="text-sm">{a.call_name ?? "Nabór"} · {label(APPLICANT_TYPE_LABELS, a.applicant_type)} · {formatPln(a.grant_amount)}{a.is_budget_balanced ? "" : " · kosztorys niezgodny"}</p>
        <p className="text-sm text-muted-foreground">{a.submitted_at ? <>Złożono <time dateTime={a.submitted_at}>{formatDate(a.submitted_at)}</time></> : "Niezłożony"}</p>
      </article></li>)}</ul>)}
  </section>;
}

export function GrantsRopsPanel() {
  return <div className="space-y-5">
    <Link href="/rops" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Wróć do panelu ROPS</Link>
    <RopsBackendGate><Panel /></RopsBackendGate>
  </div>;
}

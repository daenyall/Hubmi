"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { fetchCatalogPage } from "@/features/knowledge/service";
import { RopsBackendGate } from "@/features/rops/backend-gate";
import { backendCallMessage } from "@/features/rops/backend-session";
import { useBackendQuery } from "@/features/rops/use-backend-query";
import { formatDate } from "@/features/submissions/model";
import { APPLICATION_STATUS_LABELS, SCOPE_LABELS, label, ratingLines, type Application } from "./model";
import { createTesterService } from "./service";

const SELECT = "min-h-12 w-full rounded-lg border border-input bg-card px-[12px] py-3 text-base";

function StatusForm({ app, onSaved }: { app: Application; onSaved: (a: Application) => void }) {
  const id = useId();
  const [status, setStatus] = useState(app.status in APPLICATION_STATUS_LABELS ? app.status : "nowe");
  const [notes, setNotes] = useState(app.notes ?? "");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller; setPending(true); setFeedback(null);
    try {
      const saved = await createTesterService().updateStatus(app.id, status, notes, controller.signal);
      if (!controller.signal.aborted) { onSaved(saved); setFeedback({ error: false, message: `Zapisano i potwierdzono status „${label(APPLICATION_STATUS_LABELS, saved.status)}”.` }); }
    } catch (error) {
      if (!controller.signal.aborted) setFeedback({ error: true, message: backendCallMessage(error) });
    } finally {
      if (request.current === controller) { request.current = null; setPending(false); }
    }
  }
  return <form onSubmit={submit} noValidate aria-busy={pending} className="space-y-3 border-t border-border pt-4">
    <fieldset disabled={pending} className="min-w-0 space-y-3">
      <legend className="font-semibold">Status pilotażu</legend>
      <div className="max-w-sm space-y-2"><label htmlFor={`${id}-s`} className="block text-sm font-semibold">Status</label>
        <select id={`${id}-s`} value={status} onChange={(e) => { setStatus(e.target.value); setFeedback(null); }} className={SELECT}>{Object.entries(APPLICATION_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="space-y-2"><label htmlFor={`${id}-n`} className="block text-sm font-semibold">Notatka ROPS (opcjonalnie)</label>
        <p id={`${id}-nh`} className="text-sm text-muted-foreground">Zastępuje pole „Uwagi” zgłoszenia — backend przechowuje jedno pole notatek dla zgłaszającego i ROPS.</p>
        <textarea id={`${id}-n`} aria-describedby={`${id}-nh`} value={notes} rows={3} maxLength={5000} onChange={(e) => { setNotes(e.target.value); setFeedback(null); }} className="block w-full resize-y rounded-lg border border-input bg-background p-[12px] text-base" /></div>
    </fieldset>
    {feedback && <StatusMessage error={feedback.error}>{feedback.message}</StatusMessage>}
    <Button type="submit" disabled={pending} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">{pending ? "Zapisujemy…" : "Zapisz status"}</Button>
  </form>;
}

function InnovationRatings({ innovationId }: { innovationId: string }) {
  const load = useCallback((signal: AbortSignal) => createTesterService().summary(innovationId, signal), [innovationId]);
  const { state } = useBackendQuery(`rops-ratings:${innovationId}`, load);
  if (state.status === "loading") return <p className="text-sm text-muted-foreground">Wczytujemy oceny…</p>;
  if (state.status === "error") return <p className="text-sm text-red-900">{state.message}</p>;
  const lines = ratingLines(state.data);
  return lines ? <ul className="space-y-1 text-sm">{lines.map((l) => <li key={l}>{l}</li>)}</ul> : <p className="text-sm text-muted-foreground">Brak opinii o tej innowacji.</p>;
}

function ApplicationItem({ initial, title }: { initial: Application; title: string }) {
  const [app, setApp] = useState(initial);
  return <li className="min-w-0"><article aria-label={`${app.institution_name}: ${title}`} className="space-y-3 rounded-2xl border border-border bg-card p-[20px]">
    <Badge variant="secondary" className="h-auto min-h-7 whitespace-normal">{label(APPLICATION_STATUS_LABELS, app.status)}</Badge>
    <h3 className="text-lg font-semibold">{app.institution_name} ({app.tester_type})</h3>
    <p className="text-sm">Innowacja: <span className="font-semibold">{title}</span> · {label(SCOPE_LABELS, app.testing_scope)} · uczestników: {app.target_audience_count}</p>
    {app.created_at && <p className="text-sm text-muted-foreground">Zgłoszono <time dateTime={app.created_at}>{formatDate(app.created_at)}</time></p>}
    <details className="rounded-lg border border-border p-[12px]">
      <summary className="min-h-11 cursor-pointer rounded-sm py-2 font-semibold text-primary">Kontakt, oceny i obsługa</summary>
      <div className="mt-3 space-y-4 text-sm leading-relaxed">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="font-semibold">Koordynator</dt><dd>{app.contact_person}</dd></div>
          <div><dt className="font-semibold">Kontakt</dt><dd>{[app.contact_email, app.contact_phone].filter(Boolean).join(", ")}</dd></div>
          <div className="sm:col-span-2"><dt className="font-semibold">Uwagi</dt><dd className="whitespace-pre-wrap">{app.notes || "brak"}</dd></div>
          <div className="sm:col-span-2"><dt className="font-semibold">Numer zgłoszenia</dt><dd><code className="break-all">{app.id}</code></dd></div>
        </dl>
        <div><h4 className="font-semibold">Oceny tej innowacji</h4><InnovationRatings innovationId={app.innovation_id} /></div>
        <StatusForm app={app} onSaved={setApp} />
      </div>
    </details>
  </article></li>;
}

function Panel() {
  const id = useId();
  const [status, setStatus] = useState("");
  const [innovation, setInnovation] = useState("");
  const catalogLoad = useCallback((signal: AbortSignal) => fetchCatalogPage({ limit: 100 }, signal), []);
  const catalog = useBackendQuery("rops-tester-catalog", catalogLoad);
  const titles = new Map(catalog.state.status === "success" ? catalog.state.data.map((i) => [i.id, i.title]) : []);
  const globalLoad = useCallback((signal: AbortSignal) => createTesterService().global(signal), []);
  const global = useBackendQuery("rops-tester-global", globalLoad);
  const load = useCallback((signal: AbortSignal) => createTesterService().applications({ status: status || undefined, innovation_id: innovation || undefined }, signal), [status, innovation]);
  const { state, refresh } = useBackendQuery(`rops-apps:${status}:${innovation}`, load);
  return <div className="space-y-10">
    {global.state.status === "success" && <section aria-labelledby={`${id}-g`} className="space-y-2 rounded-2xl border border-border bg-secondary p-[24px]">
      <h2 id={`${id}-g`} className="text-xl font-semibold">Podsumowanie testów</h2>
      <p className="text-sm">Zgłoszenia: {global.state.data.applications} · aktywne pilotaże (zaakceptowane i w trakcie): {global.state.data.active} · zakończone: {global.state.data.completed} · opinie: {global.state.data.feedbacks}{global.state.data.feedbacks ? ` · średnia ${global.state.data.average.toLocaleString("pl-PL")} / 5` : ""}</p>
      <p className="text-sm">Według statusu: {Object.entries(global.state.data.by_status).map(([k, n]) => `${label(APPLICATION_STATUS_LABELS, k)}: ${n}`).join(" · ") || "brak zgłoszeń"}</p>
    </section>}
    <section aria-labelledby={`${id}-l`} className="space-y-5">
      <h2 id={`${id}-l`} className="text-2xl font-semibold">Zgłoszenia do testowania</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">Status zmienia wyłącznie ROPS. Opinie przesłane po teście nie kończą pilotażu automatycznie.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2"><label htmlFor={`${id}-st`} className="block font-semibold">Status</label><select id={`${id}-st`} value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT}><option value="">Wszystkie</option>{Object.entries(APPLICATION_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="min-w-0 space-y-2"><label htmlFor={`${id}-in`} className="block font-semibold">Innowacja</label><select id={`${id}-in`} value={innovation} onChange={(e) => setInnovation(e.target.value)} className={SELECT}><option value="">Wszystkie</option>{[...titles].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>
      <Button variant="outline" onClick={refresh} className="h-auto min-h-11 px-[16px]">Odśwież listę</Button>
      {state.status === "loading" && <LoadingMessage>Wczytujemy zgłoszenia testowe…</LoadingMessage>}
      {state.status === "error" && <div className="space-y-3"><StatusMessage error>{state.message}</StatusMessage><Button variant="outline" onClick={refresh} className="h-auto min-h-11 px-[16px]">Spróbuj ponownie</Button></div>}
      {state.status === "success" && (state.data.length === 0 ? <StatusMessage>Brak zgłoszeń dla wybranych filtrów.</StatusMessage>
        : <ul className="space-y-4">{state.data.map((a) => <ApplicationItem key={a.id} initial={a} title={titles.get(a.innovation_id) ?? `Innowacja ${a.innovation_id}`} />)}</ul>)}
    </section>
  </div>;
}

export function TesterRopsPanel() {
  return <div className="space-y-5">
    <Link href="/rops" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Wróć do panelu ROPS</Link>
    <RopsBackendGate><Panel /></RopsBackendGate>
  </div>;
}

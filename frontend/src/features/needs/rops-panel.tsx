"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { RopsBackendGate } from "@/features/rops/backend-gate";
import { formatDate } from "@/features/submissions/model";
import { backendCallMessage } from "@/features/rops/backend-session";
import { useBackendQuery } from "@/features/rops/use-backend-query";
import {
  MIN_CLUSTER_SIZE, MIN_SAMPLE_FOR_DIRECTION, NEED_CATEGORIES, NEED_STATUS_LABELS, POWIATS, URGENCY_LABELS,
  describeChange, label, powiatLabel, type Need, type NeedsSummary, type NeedsTrends, type PeriodRow, type Share,
} from "./model";
import { createNeedsService, type NeedFilters } from "./service";

const SELECT = "min-h-12 w-full rounded-lg border border-input bg-card px-[12px] py-3 text-base";
const LINK = "inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4";
const PERIODS = [["", "Cały okres"], ["30", "Ostatnie 30 dni"], ["90", "Ostatnie 90 dni"], ["365", "Ostatni rok"]] as const;

function QueryError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="space-y-3"><StatusMessage error>{message}</StatusMessage>
    <Button variant="outline" onClick={retry} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Spróbuj ponownie</Button></div>;
}

function ShareTable({ caption, rows, name }: { caption: string; rows: Share[]; name: (v: string) => string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{caption}: brak zgłoszeń w wybranym zakresie.</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[18rem] border-collapse text-left text-sm">
    <caption className="mb-2 text-left text-base font-semibold">{caption}</caption>
    <thead><tr className="border-b border-border"><th scope="col" className="py-2 pr-3">Nazwa</th><th scope="col" className="py-2 pr-3 text-right">Zgłoszenia</th><th scope="col" className="py-2 text-right">Udział</th></tr></thead>
    <tbody>{rows.map((r) => <tr key={r.name} className="border-b border-border"><th scope="row" className="py-2 pr-3 font-normal">{name(r.name)}</th><td className="py-2 pr-3 text-right">{r.count}</td><td className="py-2 text-right">{r.percentage.toLocaleString("pl-PL")}%</td></tr>)}</tbody>
  </table></div>;
}

function Summary({ data }: { data: NeedsSummary }) {
  const clusters = data.clusters.filter((c) => c.reported_count >= MIN_CLUSTER_SIZE);
  return <div className="space-y-6">
    <p className="text-lg"><span className="font-semibold">Zgłoszone potrzeby: {data.total}</span>{data.period_days ? ` (ostatnie ${data.period_days} dni)` : " (cały okres)"}</p>
    <dl className="grid gap-4 sm:grid-cols-2">
      <div><dt className="font-semibold">Według statusu</dt><dd className="mt-1 text-sm">{Object.entries(data.by_status).map(([k, n]) => `${label(NEED_STATUS_LABELS, k)}: ${n}`).join(" · ")}</dd></div>
      <div><dt className="font-semibold">Według pilności</dt><dd className="mt-1 text-sm">{Object.entries(data.by_urgency).map(([k, n]) => `${label(URGENCY_LABELS, k)}: ${n}`).join(" · ")}</dd></div>
    </dl>
    <div className="grid gap-6 md:grid-cols-2">
      <ShareTable caption="Kategorie" rows={data.categories} name={(v) => v} />
      <ShareTable caption="Powiaty" rows={data.powiats} name={powiatLabel} />
    </div>
    <section aria-labelledby="clusters-heading" className="space-y-3">
      <h3 id="clusters-heading" className="text-lg font-semibold">Skupiska zgłoszeń (kategoria w jednym powiecie)</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">Pokazujemy tylko połączenia z co najmniej {MIN_CLUSTER_SIZE} zgłoszeniami. Podpowiedź działania to stały tekst przypisany w backendzie do kategorii — nie wynik analizy ani stanowisko ROPS.</p>
      {clusters.length === 0 ? <StatusMessage>Brak skupisk: żadna kategoria nie ma jeszcze {MIN_CLUSTER_SIZE} zgłoszeń w jednym powiecie.</StatusMessage>
        : <ul className="space-y-3">{clusters.map((c) => <li key={`${c.category}|${c.powiat}`} className="rounded-xl border border-border p-[16px]">
          <p className="font-semibold">{c.category} — {powiatLabel(c.powiat)}: {c.reported_count} zgłoszeń</p>
          <p className="text-sm">Najwyższa zgłoszona pilność: {label(URGENCY_LABELS, c.urgency_level)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Podpowiedź (szablon): {c.recommended_action}</p>
        </li>)}</ul>}
    </section>
  </div>;
}

function SummarySection() {
  const id = useId();
  const [days, setDays] = useState("");
  const [category, setCategory] = useState("");
  const [powiat, setPowiat] = useState("");
  const load = useCallback((signal: AbortSignal) => createNeedsService().summary({ days: days ? Number(days) : undefined, category: category || undefined, powiat: powiat || undefined }, signal), [days, category, powiat]);
  const { state, refresh } = useBackendQuery(`summary:${days}:${category}:${powiat}`, load);
  return <section aria-labelledby={`${id}-h`} className="space-y-5">
    <h2 id={`${id}-h`} className="text-2xl font-semibold">Zestawienie potrzeb</h2>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="min-w-0 space-y-2"><label htmlFor={`${id}-days`} className="block font-semibold">Okres</label>
        <select id={`${id}-days`} value={days} onChange={(e) => setDays(e.target.value)} className={SELECT}>{PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="min-w-0 space-y-2"><label htmlFor={`${id}-cat`} className="block font-semibold">Kategoria</label>
        <select id={`${id}-cat`} value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT}><option value="">Wszystkie</option>{NEED_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      <div className="min-w-0 space-y-2"><label htmlFor={`${id}-pow`} className="block font-semibold">Powiat</label>
        <select id={`${id}-pow`} value={powiat} onChange={(e) => setPowiat(e.target.value)} className={SELECT}><option value="">Wszystkie</option>{POWIATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
    </div>
    {state.status === "loading" && <LoadingMessage>Wczytujemy zestawienie…</LoadingMessage>}
    {state.status === "error" && <QueryError message={state.message} retry={refresh} />}
    {state.status === "success" && <Summary data={state.data} />}
  </section>;
}

function ComparisonTable({ caption, rows, name }: { caption: string; rows: PeriodRow[]; name: (v: string) => string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{caption}: brak zgłoszeń w obu okresach.</p>;
  const sorted = [...rows].sort((a, b) => b.current + b.previous - (a.current + a.previous) || a.name.localeCompare(b.name, "pl"));
  return <div className="overflow-x-auto"><table className="w-full min-w-[30rem] border-collapse text-left text-sm">
    <caption className="mb-2 text-left text-base font-semibold">{caption}</caption>
    <thead><tr className="border-b border-border"><th scope="col" className="py-2 pr-3">Nazwa</th><th scope="col" className="py-2 pr-3 text-right">Bieżący okres</th><th scope="col" className="py-2 pr-3 text-right">Poprzedni okres</th><th scope="col" className="py-2 pr-3 text-right">Różnica</th><th scope="col" className="py-2">Kierunek</th></tr></thead>
    <tbody>{sorted.map((r) => { const c = describeChange(r.current, r.previous); return <tr key={r.name} className="border-b border-border">
      <th scope="row" className="py-2 pr-3 font-normal">{name(r.name)}</th><td className="py-2 pr-3 text-right">{r.current}</td><td className="py-2 pr-3 text-right">{r.previous}</td><td className="py-2 pr-3 text-right">{c.difference}</td><td className="py-2">{c.direction}</td>
    </tr>; })}</tbody>
  </table></div>;
}

function Trends({ data }: { data: NeedsTrends }) {
  const total = describeChange(data.current.total, data.previous.total);
  const range = (start: string, end: string) => `${formatDate(start)} – ${formatDate(end)}`;
  return <div className="space-y-6">
    <dl className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-border p-[16px]"><dt className="font-semibold">Bieżący okres</dt><dd className="mt-1 text-sm">{range(data.current.start, data.current.end)}</dd><dd className="mt-2 text-2xl font-semibold">{data.current.total} zgłoszeń</dd></div>
      <div className="rounded-xl border border-border p-[16px]"><dt className="font-semibold">Poprzedni okres</dt><dd className="mt-1 text-sm">{range(data.previous.start, data.previous.end)}</dd><dd className="mt-2 text-2xl font-semibold">{data.previous.total} zgłoszeń</dd></div>
    </dl>
    <p><span className="font-semibold">Łącznie:</span> różnica {total.difference}. {total.direction}.</p>
    <ComparisonTable caption="Kategorie w obu okresach" rows={data.categories} name={(v) => v} />
    <ComparisonTable caption="Powiaty w obu okresach" rows={data.powiats} name={powiatLabel} />
  </div>;
}

function TrendsSection() {
  const id = useId();
  const [period, setPeriod] = useState("30");
  const load = useCallback((signal: AbortSignal) => createNeedsService().trends(Number(period), signal), [period]);
  const { state, refresh } = useBackendQuery(`trends:${period}`, load);
  return <section aria-labelledby={`${id}-h`} className="space-y-5">
    <h2 id={`${id}-h`} className="text-2xl font-semibold">Porównanie okresów</h2>
    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">Porównujemy liczbę zgłoszeń w dwóch kolejnych okresach tej samej długości. Kierunek opisujemy dopiero, gdy w obu okresach łącznie jest co najmniej {MIN_SAMPLE_FOR_DIRECTION} zgłoszeń — przy mniejszej liczbie różnica nie świadczy o trendzie.</p>
    <div className="max-w-xs space-y-2"><label htmlFor={`${id}-p`} className="block font-semibold">Długość okresu</label>
      <select id={`${id}-p`} value={period} onChange={(e) => setPeriod(e.target.value)} className={SELECT}>
        <option value="30">30 dni</option><option value="90">90 dni</option><option value="180">180 dni</option><option value="365">365 dni</option>
      </select></div>
    {state.status === "loading" && <LoadingMessage>Wczytujemy porównanie…</LoadingMessage>}
    {state.status === "error" && <QueryError message={state.message} retry={refresh} />}
    {state.status === "success" && <Trends data={state.data} />}
  </section>;
}

function StatusForm({ need, onSaved }: { need: Need; onSaved: (n: Need) => void }) {
  const id = useId();
  const [status, setStatus] = useState(need.status);
  const [notes, setNotes] = useState(need.rops_internal_notes ?? "");
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
      const saved = await createNeedsService().updateStatus(need.id, status, notes, controller.signal);
      if (!controller.signal.aborted) { setFeedback({ error: false, message: `Zapisano status „${label(NEED_STATUS_LABELS, saved.status)}”.` }); onSaved(saved); }
    } catch (error) {
      if (!controller.signal.aborted) setFeedback({ error: true, message: backendCallMessage(error) });
    } finally {
      if (request.current === controller) { request.current = null; setPending(false); }
    }
  }
  return <form onSubmit={submit} noValidate aria-busy={pending} className="space-y-3 border-t border-border pt-4">
    <fieldset disabled={pending} className="min-w-0 space-y-3">
      <legend className="font-semibold">Obsługa zgłoszenia</legend>
      <div className="max-w-sm space-y-2"><label htmlFor={`${id}-s`} className="block text-sm font-semibold">Status</label>
        <select id={`${id}-s`} value={status} onChange={(e) => { setStatus(e.target.value); setFeedback(null); }} className={SELECT}>{Object.entries(NEED_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="space-y-2"><label htmlFor={`${id}-n`} className="block text-sm font-semibold">Notatka wewnętrzna ROPS (opcjonalnie, niewidoczna dla zgłaszającego)</label>
        <textarea id={`${id}-n`} value={notes} maxLength={5000} rows={3} onChange={(e) => { setNotes(e.target.value); setFeedback(null); }} className="block w-full resize-y rounded-lg border border-input bg-background p-[12px] text-base" /></div>
    </fieldset>
    {feedback && <StatusMessage error={feedback.error}>{feedback.message}</StatusMessage>}
    <Button type="submit" disabled={pending} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">{pending ? "Zapisujemy…" : "Zapisz status"}</Button>
  </form>;
}

function NeedItem({ initial }: { initial: Need }) {
  const [need, setNeed] = useState(initial);
  return <li className="min-w-0"><article aria-label={need.problem_summary} className="space-y-3 rounded-2xl border border-border bg-card p-[20px]">
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary" className="h-auto min-h-7 whitespace-normal">{label(NEED_STATUS_LABELS, need.status)}</Badge>
      <Badge variant="outline" className="h-auto min-h-7 whitespace-normal">Pilność: {label(URGENCY_LABELS, need.urgency_level)}</Badge>
    </div>
    <h3 className="text-lg font-semibold">{need.problem_summary}</h3>
    <p className="text-sm text-muted-foreground">{need.category} · {powiatLabel(need.powiat)}{need.gmina ? `, gmina ${need.gmina}` : ""} · zgłoszono <time dateTime={need.created_at}>{formatDate(need.created_at)}</time></p>
    <details className="rounded-lg border border-border p-[12px]">
      <summary className="min-h-11 cursor-pointer rounded-sm py-2 font-semibold text-primary">Szczegóły i obsługa</summary>
      <div className="mt-3 space-y-3 text-sm leading-relaxed">
        <p className="whitespace-pre-wrap">{need.detailed_description}</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="font-semibold">Kogo dotyczy</dt><dd>{need.target_group}</dd></div>
          <div><dt className="font-semibold">Szacunkowa liczba osób</dt><dd>{need.estimated_affected_count || "nie podano"}</dd></div>
          <div><dt className="font-semibold">Zgłaszający</dt><dd>{need.institution_name} ({need.institution_type})</dd></div>
          <div><dt className="font-semibold">Kontakt</dt><dd>{[need.contact_email, need.contact_phone].filter(Boolean).join(", ") || "nie podano"}</dd></div>
          <div><dt className="font-semibold">Konto zgłaszającego</dt><dd>{need.user_id ? "zalogowany użytkownik" : "zgłoszenie bez logowania"}</dd></div>
        </dl>
        <StatusForm need={need} onSaved={setNeed} />
      </div>
    </details>
  </article></li>;
}

function NeedsList() {
  const id = useId();
  const [filters, setFilters] = useState<NeedFilters>({});
  const [search, setSearch] = useState("");
  const set = (key: keyof NeedFilters) => (e: { target: { value: string } }) => setFilters((f) => ({ ...f, [key]: e.target.value || undefined }));
  const key = JSON.stringify(filters);
  const load = useCallback((signal: AbortSignal) => createNeedsService().list(JSON.parse(key) as NeedFilters, signal), [key]);
  const { state, refresh } = useBackendQuery(`list:${key}`, load);
  return <section aria-labelledby={`${id}-h`} className="space-y-5">
    <h2 id={`${id}-h`} className="text-2xl font-semibold">Lista zgłoszonych potrzeb</h2>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="min-w-0 space-y-2"><label htmlFor={`${id}-st`} className="block font-semibold">Status</label><select id={`${id}-st`} value={filters.status ?? ""} onChange={set("status")} className={SELECT}><option value="">Wszystkie</option>{Object.entries(NEED_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="min-w-0 space-y-2"><label htmlFor={`${id}-c`} className="block font-semibold">Kategoria</label><select id={`${id}-c`} value={filters.category ?? ""} onChange={set("category")} className={SELECT}><option value="">Wszystkie</option>{NEED_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      <div className="min-w-0 space-y-2"><label htmlFor={`${id}-p`} className="block font-semibold">Powiat</label><select id={`${id}-p`} value={filters.powiat ?? ""} onChange={set("powiat")} className={SELECT}><option value="">Wszystkie</option>{POWIATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="min-w-0 space-y-2"><label htmlFor={`${id}-u`} className="block font-semibold">Pilność</label><select id={`${id}-u`} value={filters.urgency_level ?? ""} onChange={set("urgency_level")} className={SELECT}><option value="">Wszystkie</option>{Object.entries(URGENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
    </div>
    <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setFilters((f) => ({ ...f, search: search.trim() || undefined })); }}>
      <div className="min-w-0 flex-1 space-y-2"><label htmlFor={`${id}-q`} className="block font-semibold">Szukaj w treści i nazwie zgłaszającego</label>
        <Input id={`${id}-q`} type="search" value={search} onChange={(e) => setSearch(e.target.value)} className="h-auto min-h-12 py-3 text-base md:text-base" /></div>
      <Button type="submit" variant="outline" className="h-auto min-h-12 px-[16px]">Szukaj</Button>
      <Button type="button" variant="outline" onClick={refresh} className="h-auto min-h-12 px-[16px]">Odśwież listę</Button>
    </form>
    {state.status === "loading" && <LoadingMessage>Wczytujemy zgłoszenia…</LoadingMessage>}
    {state.status === "error" && <QueryError message={state.message} retry={refresh} />}
    {state.status === "success" && <>
      <p role="status" className="text-sm text-muted-foreground">Wyświetlono {state.data.length} zgłoszeń{state.data.length === 100 ? " (limit 100 — zawęź filtry)" : ""}.</p>
      {state.data.length === 0 ? <StatusMessage>Brak zgłoszeń dla wybranych filtrów.</StatusMessage>
        : <ul className="space-y-4">{state.data.map((n) => <NeedItem key={n.id} initial={n} />)}</ul>}
    </>}
  </section>;
}

export function NeedsRopsPanel() {
  return <div className="space-y-5">
    <Link href="/rops" className={LINK}>Wróć do panelu ROPS</Link>
    <RopsBackendGate><div className="space-y-12"><SummarySection /><TrendsSection /><NeedsList /></div></RopsBackendGate>
  </div>;
}

"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { fetchCatalogPage } from "@/features/knowledge/service";
import type { KnowledgeItem } from "@/features/knowledge/model";
import { backendCallMessage } from "@/features/rops/backend-session";
import { useBackendQuery } from "@/features/rops/use-backend-query";
import { formatDate } from "@/features/submissions/model";
import {
  APPLICATION_ORDER, FEEDBACK_ORDER, RATING_LABELS, SCOPE_LABELS, TESTER_TYPES, emptyApplication, emptyFeedback, ratingLines,
  validateApplication, validateFeedback, type Application, type ApplicationDraft, type FeedbackDraft,
} from "./model";
import { createTesterService, type FeedbackResult } from "./service";

const SELECT = "min-h-12 w-full rounded-lg border border-input bg-background px-[12px] py-3 text-base aria-invalid:border-destructive";
const AREA = "block w-full resize-y rounded-lg border border-input bg-background p-[12px] text-base leading-relaxed aria-invalid:border-destructive";
const INPUT = "h-auto min-h-12 py-3 text-base md:text-base";

function Field({ id, label, hint, error, required, children }: { id: string; label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return <div className="min-w-0 space-y-2">
    <label htmlFor={id} className="block font-semibold">{label} <span className="font-normal text-muted-foreground">({required ? "wymagane" : "opcjonalnie"})</span></label>
    {hint && <p id={`${id}-hint`} className="text-sm leading-relaxed text-muted-foreground">{hint}</p>}
    {children}
    {error && <p id={`${id}-error`} className="text-sm text-red-900">{error}</p>}
  </div>;
}
function ErrorSummary({ items }: { items: [string, string][] }) {
  if (!items.length) return null;
  return <StatusMessage error>Sprawdź oznaczone pola formularza.
    <ul className="mt-2 space-y-1">{items.map(([id, message]) => <li key={id}><a href={`#${id}`} className="underline underline-offset-4">{message}</a></li>)}</ul>
  </StatusMessage>;
}

/** Wspólna obsługa: blokada równoległego wysłania, zachowanie treści przy błędzie, przerwanie przy odmontowaniu. */
function useSubmit<T>() {
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ status: "idle" | "loading" } | { status: "error"; message: string } | { status: "success"; data: T }>({ status: "idle" });
  useEffect(() => () => request.current?.abort(), []);
  async function run(task: (signal: AbortSignal) => Promise<T>) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setState({ status: "loading" });
    try {
      const data = await task(controller.signal);
      if (!controller.signal.aborted) setState({ status: "success", data });
    } catch (error) {
      if (!controller.signal.aborted) setState({ status: "error", message: backendCallMessage(error) });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }
  return { state, run, reset: () => setState({ status: "idle" }) };
}

function Ratings({ innovationId, version }: { innovationId: string; version: number }) {
  const load = useCallback((signal: AbortSignal) => createTesterService().summary(innovationId, signal), [innovationId]);
  const { state, refresh } = useBackendQuery(`ratings:${innovationId}:${version}`, load);
  if (state.status === "loading") return <LoadingMessage>Wczytujemy oceny tej innowacji…</LoadingMessage>;
  if (state.status === "error") return <div className="space-y-3"><StatusMessage error>{state.message}</StatusMessage><Button variant="outline" onClick={refresh} className="h-auto min-h-11 px-[16px]">Spróbuj ponownie</Button></div>;
  const lines = ratingLines(state.data);
  if (!lines) return <StatusMessage>Ta innowacja nie ma jeszcze ocen z testów.</StatusMessage>;
  return <div className="space-y-4">
    <ul className="space-y-1 text-sm">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    <p className="text-sm text-muted-foreground">Oceny pochodzą z formularza poniżej i nie są weryfikowane przez ROPS przed publikacją.</p>
    <h4 className="font-semibold">Najnowsze opinie</h4>
    <ul className="space-y-3">{state.data.recent.map((f) => <li key={f.id} className="rounded-xl border border-border p-[16px] text-sm leading-relaxed">
      <p className="font-semibold">{f.author_name} — średnio {f.average_score.toLocaleString("pl-PL")} / 5{f.would_recommend ? ", poleca" : ", nie poleca"}</p>
      {f.created_at && <p className="text-muted-foreground"><time dateTime={f.created_at}>{formatDate(f.created_at)}</time></p>}
      {f.pros && <p><span className="font-semibold">Mocne strony: </span>{f.pros}</p>}
      {f.cons_and_barriers && <p><span className="font-semibold">Bariery: </span>{f.cons_and_barriers}</p>}
      {f.suggested_improvements && <p><span className="font-semibold">Propozycje usprawnień: </span>{f.suggested_improvements}</p>}
    </li>)}</ul>
  </div>;
}

function ApplyForm({ innovation, onApplied }: { innovation: KnowledgeItem; onApplied: (a: Application) => void }) {
  const [draft, setDraft] = useState<ApplicationDraft>(emptyApplication(innovation.id));
  const [errors, setErrors] = useState<Partial<Record<keyof ApplicationDraft, string>>>({});
  const { state, run, reset } = useSubmit<Application>();
  const loading = state.status === "loading";
  const p = (key: keyof ApplicationDraft) => `apply-${key}`;
  const bind = (key: keyof ApplicationDraft, hint = false) => ({
    id: p(key), value: draft[key], "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": [hint ? `${p(key)}-hint` : "", errors[key] ? `${p(key)}-error` : ""].filter(Boolean).join(" ") || undefined,
    onChange: (e: { target: { value: string } }) => { const v = e.target.value; setDraft((d) => ({ ...d, [key]: v })); setErrors((x) => ({ ...x, [key]: undefined })); if (state.status === "error") reset(); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const v = validateApplication(draft); setErrors(v);
    const first = APPLICATION_ORDER.find((k) => v[k]);
    if (first) { document.getElementById(p(first))?.focus(); return; }
    void run(async (signal) => { const saved = await createTesterService().apply(draft, signal); onApplied(saved); return saved; });
  }
  if (state.status === "success") return <div className="space-y-4">
    <StatusMessage><strong>Zgłoszenie do testowania zostało zapisane.</strong> Numer: <code className="break-all">{state.data.id}</code>. Status: „Nowe”. ROPS skontaktuje się na adres {state.data.contact_email}. Zachowaj numer — podasz go w ocenie po teście.</StatusMessage>
    <p className="text-sm text-muted-foreground">Statusu zgłoszenia nie można obecnie sprawdzić w serwisie — widzi go tylko ROPS.</p>
    <Button variant="outline" onClick={() => { setDraft(emptyApplication(innovation.id)); setErrors({}); reset(); }} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Wyślij kolejne zgłoszenie</Button>
  </div>;
  const list = APPLICATION_ORDER.filter((k) => errors[k]).map((k) => [p(k), errors[k] as string] as [string, string]);
  return <form onSubmit={submit} noValidate aria-busy={loading} className="space-y-6">
    <ErrorSummary items={list} />
    <fieldset disabled={loading} className="min-w-0 space-y-6">
      <legend className="sr-only">Zgłoszenie chęci testowania: {innovation.title}</legend>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id={p("institution_name")} label="Instytucja testująca" error={errors.institution_name} required><Input {...bind("institution_name")} maxLength={255} className={INPUT} /></Field>
        <Field id={p("tester_type")} label="Typ instytucji" error={errors.tester_type} required><select {...bind("tester_type")} className={SELECT}>{TESTER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
        <Field id={p("contact_person")} label="Osoba koordynująca test" error={errors.contact_person} required><Input {...bind("contact_person")} autoComplete="name" maxLength={255} className={INPUT} /></Field>
        <Field id={p("contact_email")} label="Email kontaktowy" error={errors.contact_email} required><Input {...bind("contact_email")} type="email" autoComplete="email" className={INPUT} /></Field>
        <Field id={p("contact_phone")} label="Telefon" error={errors.contact_phone}><Input {...bind("contact_phone")} type="tel" autoComplete="tel" maxLength={50} className={INPUT} /></Field>
        <Field id={p("testing_scope")} label="Zakres testu" error={errors.testing_scope} required><select {...bind("testing_scope")} className={SELECT}>{Object.entries(SCOPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field id={p("target_audience_count")} label="Szacunkowa liczba uczestników" error={errors.target_audience_count} required><Input {...bind("target_audience_count")} inputMode="numeric" maxLength={7} className={`${INPUT} max-w-xs`} /></Field>
      </div>
      <Field id={p("notes")} label="Uwagi" hint="Specyfika grupy, terminy, potrzebne wsparcie ROPS." error={errors.notes}><textarea {...bind("notes", true)} rows={3} maxLength={5000} className={AREA} /></Field>
      <p className="text-sm text-muted-foreground">Dane kontaktowe widzą wyłącznie pracownicy ROPS.</p>
    </fieldset>
    {state.status === "error" && <StatusMessage error>{state.message}</StatusMessage>}
    <Button type="submit" disabled={loading} className="h-auto min-h-12 w-full whitespace-normal px-[24px] py-3 text-base sm:w-auto">{loading ? "Wysyłamy zgłoszenie…" : "Zgłoś chęć testowania"}</Button>
    <p role="status" aria-atomic="true" className="text-sm text-muted-foreground">{loading ? "Wysyłamy zgłoszenie do testowania…" : ""}</p>
  </form>;
}

function RatingGroup({ name, legend, value, error, onChange }: { name: keyof typeof RATING_LABELS; legend: string; value: string; error?: string; onChange: (v: string) => void }) {
  return <fieldset id={`fb-${name}`} tabIndex={-1} aria-describedby={error ? `fb-${name}-error` : "rating-scale"} aria-invalid={error ? true : undefined} className="min-w-0 rounded-lg">
    <legend className="font-semibold">{legend} <span className="font-normal text-muted-foreground">(wymagane)</span></legend>
    <div className="mt-2 flex flex-wrap gap-2">{["1", "2", "3", "4", "5"].map((n) => <label key={n} className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input px-3 has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring">
      <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="size-4 accent-[var(--primary)]" />{n}
    </label>)}</div>
    {error && <p id={`fb-${name}-error`} className="mt-1 text-sm text-red-900">{error}</p>}
  </fieldset>;
}

function FeedbackForm({ innovation, applicationId, onSaved }: { innovation: KnowledgeItem; applicationId: string; onSaved: () => void }) {
  const [draft, setDraft] = useState<FeedbackDraft>(emptyFeedback(innovation.id));
  const [errors, setErrors] = useState<Partial<Record<keyof FeedbackDraft, string>>>({});
  const { state, run, reset } = useSubmit<FeedbackResult>();
  const loading = state.status === "loading";
  const set = (key: keyof FeedbackDraft, v: string) => { setDraft((d) => ({ ...d, [key]: v })); setErrors((x) => ({ ...x, [key]: undefined })); if (state.status === "error") reset(); };
  const bind = (key: keyof FeedbackDraft, hint = false) => ({
    id: `fb-${key}`, value: draft[key], "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": [hint ? `fb-${key}-hint` : "", errors[key] ? `fb-${key}-error` : ""].filter(Boolean).join(" ") || undefined,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const v = validateFeedback(draft); setErrors(v);
    const first = FEEDBACK_ORDER.find((k) => v[k]);
    if (first) { document.getElementById(`fb-${first}`)?.focus(); return; }
    void run(async (signal) => { const r = await createTesterService().feedback(draft, signal); onSaved(); return r; });
  }
  if (state.status === "success") return <div className="space-y-4">
    <StatusMessage><strong>Opinia została zapisana.</strong> {state.data.confirmed === true ? "Widać ją już w podsumowaniu ocen powyżej." : state.data.confirmed === false ? "Nie znaleźliśmy jej jednak w ponownym odczycie ocen — sprawdź podsumowanie przed ponownym wysłaniem." : "Nie udało się jej odczytać ponownie — sprawdź podsumowanie ocen przed ponownym wysłaniem."} Wysłanie opinii nie zmienia statusu pilotażu — o nim decyduje ROPS.</StatusMessage>
    <Button variant="outline" onClick={() => { setDraft(emptyFeedback(innovation.id)); setErrors({}); reset(); }} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Dodaj kolejną opinię</Button>
  </div>;
  const list = FEEDBACK_ORDER.filter((k) => errors[k]).map((k) => [`fb-${k}`, errors[k] as string] as [string, string]);
  return <form onSubmit={submit} noValidate aria-busy={loading} className="space-y-6">
    <ErrorSummary items={list} />
    <p id="rating-scale" className="text-sm text-muted-foreground">Skala: 1 — bardzo źle, 5 — bardzo dobrze.</p>
    <fieldset disabled={loading} className="min-w-0 space-y-6">
      <legend className="sr-only">Ocena po teście: {innovation.title}</legend>
      {(Object.keys(RATING_LABELS) as (keyof typeof RATING_LABELS)[]).map((k) => <RatingGroup key={k} name={k} legend={RATING_LABELS[k]} value={draft[k]} error={errors[k]} onChange={(v) => set(k, v)} />)}
      <fieldset id="fb-would_recommend" tabIndex={-1} aria-describedby={errors.would_recommend ? "fb-would_recommend-error" : undefined} aria-invalid={errors.would_recommend ? true : undefined} className="min-w-0 rounded-lg">
        <legend className="font-semibold">Czy polecasz to rozwiązanie innym gminom i instytucjom? <span className="font-normal text-muted-foreground">(wymagane)</span></legend>
        <div className="mt-2 flex flex-wrap gap-2">{[["tak", "Tak"], ["nie", "Nie"]].map(([v, l]) => <label key={v} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input px-4 has-[:checked]:border-primary has-[:checked]:bg-secondary">
          <input type="radio" name="would_recommend" value={v} checked={draft.would_recommend === v} onChange={() => set("would_recommend", v)} className="size-4 accent-[var(--primary)]" />{l}
        </label>)}</div>
        {errors.would_recommend && <p id="fb-would_recommend-error" className="mt-1 text-sm text-red-900">{errors.would_recommend}</p>}
      </fieldset>
      <Field id="fb-pros" label="Co zadziałało — mocne strony" error={errors.pros}><textarea {...bind("pros")} rows={3} maxLength={5000} className={AREA} /></Field>
      <Field id="fb-cons_and_barriers" label="Bariery i trudności" error={errors.cons_and_barriers}><textarea {...bind("cons_and_barriers")} rows={3} maxLength={5000} className={AREA} /></Field>
      <Field id="fb-suggested_improvements" label="Propozycje usprawnień" hint="Co warto zmienić, zanim rozwiązanie wdrożą kolejne gminy." error={errors.suggested_improvements}><textarea {...bind("suggested_improvements", true)} rows={3} maxLength={5000} className={AREA} /></Field>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="fb-author_name" label="Podpis (instytucja lub stanowisko)" hint="Podpis jest widoczny publicznie przy opinii." error={errors.author_name} required><Input {...bind("author_name", true)} maxLength={255} className={INPUT} /></Field>
        <Field id="fb-application_id" label="Numer zgłoszenia testowego" hint="Z potwierdzenia zgłoszenia do testowania. Backend sprawdza, czy dotyczy tej innowacji." error={errors.application_id}><Input {...bind("application_id", true)} className={INPUT} />
          {applicationId && draft.application_id !== applicationId && <Button type="button" variant="outline" onClick={() => set("application_id", applicationId)} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Wstaw numer z wysłanego zgłoszenia</Button>}</Field>
      </div>
    </fieldset>
    {state.status === "error" && <StatusMessage error>{state.message}</StatusMessage>}
    <Button type="submit" disabled={loading} className="h-auto min-h-12 w-full whitespace-normal px-[24px] py-3 text-base sm:w-auto">{loading ? "Wysyłamy opinię…" : "Wyślij opinię"}</Button>
    <p role="status" aria-atomic="true" className="text-sm text-muted-foreground">{loading ? "Wysyłamy opinię…" : ""}</p>
  </form>;
}

function GlobalTesting({ titles }: { titles: Map<string, string> }) {
  const load = useCallback((signal: AbortSignal) => createTesterService().global(signal), []);
  const { state } = useBackendQuery("testing-global", load);
  if (state.status !== "success") return null;
  const g = state.data;
  return <section aria-labelledby="testing-global-h" className="space-y-3 rounded-2xl border border-border bg-secondary p-[24px]">
    <h2 id="testing-global-h" className="text-xl font-semibold">Testy innowacji w Małopolsce</h2>
    <p className="text-sm">Zgłoszenia do testowania: {g.applications} · trwające pilotaże: {g.active} · zakończone: {g.completed} · opinie: {g.feedbacks}{g.feedbacks > 0 ? ` · średnia ocena: ${g.average.toLocaleString("pl-PL")} / 5` : ""}</p>
    {g.top.length > 0 && <><h3 className="font-semibold">Najwyżej oceniane</h3><ol className="list-decimal space-y-1 pl-6 text-sm">{g.top.map((t) => <li key={t.innovation_id}>{titles.get(t.innovation_id) ?? `Innowacja ${t.innovation_id}`} — {t.average_score.toLocaleString("pl-PL")} / 5 (opinie: {t.review_count})</li>)}</ol></>}
  </section>;
}

export function TesterPage({ initialId }: { initialId: string }) {
  const load = useCallback((signal: AbortSignal) => fetchCatalogPage({ limit: 100 }, signal), []);
  const { state, refresh } = useBackendQuery("tester-catalog", load);
  const [selected, setSelected] = useState(initialId);
  const [version, setVersion] = useState(0);
  const [applicationId, setApplicationId] = useState("");
  if (state.status === "loading") return <LoadingMessage>Wczytujemy innowacje do testowania…</LoadingMessage>;
  if (state.status === "error") return <div className="space-y-3"><StatusMessage error>{state.message}</StatusMessage><Button variant="outline" onClick={refresh} className="h-auto min-h-11 px-[16px]">Spróbuj ponownie</Button></div>;
  const items = state.data;
  const titles = new Map(items.map((i) => [i.id, i.title]));
  const innovation = items.find((i) => i.id === selected);
  return <div className="space-y-8">
    <GlobalTesting titles={titles} />
    <div className="max-w-2xl space-y-2">
      <label htmlFor="tester-innovation" className="block font-semibold">Którą innowację chcesz przetestować lub ocenić?</label>
      <select id="tester-innovation" value={innovation ? selected : ""} onChange={(e) => { setSelected(e.target.value); setApplicationId(""); }} className={SELECT}>
        <option value="">Wybierz innowację z katalogu</option>{items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
      </select>
      {selected && !innovation && <p className="text-sm text-red-900">Wskazanej innowacji nie ma w publicznym katalogu. Wybierz inną z listy.</p>}
    </div>
    {innovation && <div key={innovation.id} className="space-y-8">
      <section aria-labelledby="ratings-h" className="space-y-4">
        <h2 id="ratings-h" className="text-2xl font-semibold">Oceny: {innovation.title}</h2>
        <Ratings innovationId={innovation.id} version={version} />
      </section>
      <Card className="rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px] sm:[--card-spacing:32px]"><CardContent className="space-y-5">
        <h2 className="text-2xl font-semibold">Zgłoś chęć testowania</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">Gmina, CUS, organizacja lub mieszkańcy mogą zgłosić gotowość do przetestowania tej innowacji u siebie — od warsztatów po pilotaż. ROPS rozpatruje zgłoszenie i ustala jego status.</p>
        <ApplyForm innovation={innovation} onApplied={(a) => setApplicationId(a.id)} />
      </CardContent></Card>
      <Card className="rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px] sm:[--card-spacing:32px]"><CardContent className="space-y-5">
        <h2 className="text-2xl font-semibold">Oceń innowację po teście</h2>
        <FeedbackForm innovation={innovation} applicationId={applicationId} onSaved={() => setVersion((v) => v + 1)} />
      </CardContent></Card>
    </div>}
  </div>;
}

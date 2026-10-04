"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { AuthGate } from "@/features/auth/login-form";
import { backendCallMessage } from "@/features/rops/backend-session";
import { useBackendQuery } from "@/features/rops/use-backend-query";
import { formatDate } from "@/features/submissions/model";
import {
  APPLICANT_TYPE_LABELS, APPLICATION_STATUS_LABELS, DECLARATIONS, SUPPORTED_TEMPLATE_VERSION, TEXT_SECTIONS,
  draftFromApplication, emptyRow, formatPln, label, parseAmount, planTotal, submitErrors,
  type GrantApplication, type GrantCall, type GrantDraft, type PlanRow,
} from "./model";
import { createGrantService, grantErrorMessages } from "./service";
import { CallStatusNotice } from "./preview";

const AREA = "block w-full resize-y rounded-lg border border-input bg-background p-[12px] text-base leading-relaxed";
const INPUT = "h-auto min-h-12 py-3 text-base md:text-base";
const LINK = "inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4";

function Field({ id, label: text, hint, children, required = false }: { id: string; label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return <div className="min-w-0 space-y-2">
    <label htmlFor={id} className="block font-semibold">{text} <span className="font-normal text-muted-foreground">({required ? "wymagane do złożenia" : "opcjonalnie"})</span></label>
    {hint && <p id={`${id}-hint`} className="text-sm leading-relaxed text-muted-foreground">{hint}</p>}
    {children}
  </div>;
}
function Messages({ items, error }: { items: string[]; error: boolean }) {
  if (!items.length) return null;
  return <StatusMessage error={error}>{items.length === 1 ? items[0] : <ul className="list-disc space-y-1 pl-5">{items.map((m) => <li key={m}>{m}</li>)}</ul>}</StatusMessage>;
}

function PlanEditor({ title, hint, rows, phase, onChange, prefix }: { title: string; hint: string; rows: PlanRow[]; phase: boolean; onChange: (rows: PlanRow[]) => void; prefix: string }) {
  const set = (i: number, key: keyof PlanRow, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  return <fieldset className="min-w-0 space-y-4 rounded-xl border border-border p-[16px]">
    <legend className="px-1 font-semibold">{title}</legend>
    <p className="text-sm text-muted-foreground">{hint}</p>
    {rows.length === 0 && <p className="text-sm">Brak pozycji.</p>}
    <ol className="space-y-4">{rows.map((r, i) => <li key={i} className="space-y-3 rounded-lg bg-secondary p-[12px]">
      <p className="font-semibold">Pozycja {i + 1}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${prefix}-${i}-name`} label="Działanie"><Input id={`${prefix}-${i}-name`} value={r.action_name} onChange={(e) => set(i, "action_name", e.target.value)} className={INPUT} /></Field>
        <Field id={`${prefix}-${i}-schedule`} label="Termin" hint="Np. „miesiąc 1–2”."><Input id={`${prefix}-${i}-schedule`} aria-describedby={`${prefix}-${i}-schedule-hint`} value={r.schedule} onChange={(e) => set(i, "schedule", e.target.value)} className={INPUT} /></Field>
        <Field id={`${prefix}-${i}-cost`} label="Koszt w zł" hint="Np. 12 500 lub 12500,50."><Input id={`${prefix}-${i}-cost`} aria-describedby={`${prefix}-${i}-cost-hint`} inputMode="decimal" value={r.cost} aria-invalid={Number.isNaN(parseAmount(r.cost)) || undefined} onChange={(e) => set(i, "cost", e.target.value)} className={INPUT} /></Field>
        {phase && <Field id={`${prefix}-${i}-phase`} label="Faza testu" hint="Np. „pilotaż”, „ewaluacja”."><Input id={`${prefix}-${i}-phase`} aria-describedby={`${prefix}-${i}-phase-hint`} value={r.phase} onChange={(e) => set(i, "phase", e.target.value)} className={INPUT} /></Field>}
      </div>
      <Button type="button" variant="outline" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="h-auto min-h-11 max-w-full whitespace-normal px-[16px] py-2">Usuń pozycję {i + 1}</Button>
    </li>)}</ol>
    <Button type="button" variant="outline" onClick={() => onChange([...rows, emptyRow()])} className="h-auto min-h-11 max-w-full whitespace-normal px-[16px] py-2">Dodaj pozycję</Button>
  </fieldset>;
}

function Form({ initial, call, onSubmitted }: { initial: GrantApplication; call: GrantCall; onSubmitted: (app: GrantApplication) => void }) {
  const [draft, setDraft] = useState<GrantDraft>(() => draftFromApplication(initial));
  const [saved, setSaved] = useState(() => JSON.stringify(draftFromApplication(initial)));
  const [savedAt, setSavedAt] = useState(initial.updated_at);
  const [pending, setPending] = useState<"" | "save" | "submit">("");
  const [result, setResult] = useState<{ error: boolean; items: string[] } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const request = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(draft) !== saved;
  const missing = submitErrors(draft, call);
  const total = planTotal(draft);
  const amount = parseAmount(draft.grant_amount);
  const closed = call.status === "zamkniety";
  const versionOk = call.template_version === SUPPORTED_TEMPLATE_VERSION;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { if (result) resultRef.current?.focus(); }, [result]);

  const update = (fn: (d: GrantDraft) => GrantDraft) => { setDraft(fn); setResult(null); setConfirming(false); setUnderstood(false); };

  async function run(kind: "save" | "submit") {
    if (request.current) return; // blokada równoległego zapisu i złożenia
    const controller = new AbortController();
    request.current = controller; setPending(kind); setResult(null);
    try {
      const service = createGrantService();
      if (kind === "save") {
        const fresh = await service.save(initial.id, draft, controller.signal);
        if (controller.signal.aborted) return;
        const next = draftFromApplication(fresh);
        setDraft(next); setSaved(JSON.stringify(next)); setSavedAt(fresh.updated_at);
        setResult({ error: false, items: ["Wersja robocza zapisana i potwierdzona ponownym odczytem."] });
      } else {
        const fresh = await service.submit(initial.id, controller.signal);
        if (!controller.signal.aborted) onSubmitted(fresh);
      }
    } catch (error) {
      if (!controller.signal.aborted) setResult({ error: true, items: grantErrorMessages(error, backendCallMessage) });
    } finally {
      if (request.current === controller) { request.current = null; setPending(""); }
    }
  }
  function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void run("save"); }

  const t = draft.applicant_type;
  const person = (k: keyof GrantDraft["person"], v: string) => update((d) => ({ ...d, person: { ...d.person, [k]: v } }));
  const entity = (k: keyof GrantDraft["entity"], v: string) => update((d) => ({ ...d, entity: { ...d.entity, [k]: v } }));
  const addrOf = t === "podmiot" ? draft.entity.address : draft.person.address;
  const setAddr = (k: "street" | "postal_code" | "city", v: string) => update((d) => t === "podmiot"
    ? { ...d, entity: { ...d.entity, address: { ...d.entity.address, [k]: v } } }
    : { ...d, person: { ...d.person, address: { ...d.person.address, [k]: v } } });

  return <div className="space-y-6">
    <form onSubmit={save} noValidate aria-busy={pending !== ""} className="space-y-8">
      <fieldset disabled={pending !== ""} className="min-w-0 space-y-8">
        <legend className="sr-only">Formularz wniosku według wzoru {call.template_name}, wersja {call.template_version}</legend>
        <Card className="rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px] sm:[--card-spacing:32px]"><CardContent className="space-y-6">
          <h2 className="text-xl font-semibold">1. Tytuł innowacji</h2>
          <Field id="title" label="Tytuł" hint="Krótki i jednoznaczny, co najmniej 3 znaki." required>
            <Input id="title" aria-describedby="title-hint" maxLength={255} value={draft.title} onChange={(e) => update((d) => ({ ...d, title: e.target.value }))} className={INPUT} />
          </Field>
        </CardContent></Card>

        <Card className="rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px] sm:[--card-spacing:32px]"><CardContent className="space-y-6">
          <h2 className="text-xl font-semibold">2. Dane pomysłodawcy</h2>
          <fieldset className="min-w-0 space-y-2"><legend className="font-semibold">Kto składa wniosek?</legend>
            <div className="flex flex-wrap gap-2">{Object.entries(APPLICANT_TYPE_LABELS).map(([v, l]) => <label key={v} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input px-4 has-[:checked]:border-primary has-[:checked]:bg-secondary">
              <input type="radio" name="applicant_type" value={v} checked={t === v} onChange={() => update((d) => ({ ...d, applicant_type: v }))} className="size-4 accent-[var(--primary)]" />{l}
            </label>)}</div>
          </fieldset>
          {t === "osoba_fizyczna" && <div className="grid gap-5 sm:grid-cols-2">
            <Field id="first_name" label="Imię" required><Input id="first_name" autoComplete="given-name" value={draft.person.first_name} onChange={(e) => person("first_name", e.target.value)} className={INPUT} /></Field>
            <Field id="last_name" label="Nazwisko" required><Input id="last_name" autoComplete="family-name" value={draft.person.last_name} onChange={(e) => person("last_name", e.target.value)} className={INPUT} /></Field>
            <Field id="person_email" label="Email" required><Input id="person_email" type="email" autoComplete="email" value={draft.person.email} onChange={(e) => person("email", e.target.value)} className={INPUT} /></Field>
            <Field id="person_phone" label="Telefon"><Input id="person_phone" type="tel" autoComplete="tel" value={draft.person.phone} onChange={(e) => person("phone", e.target.value)} className={INPUT} /></Field>
          </div>}
          {t === "podmiot" && <div className="grid gap-5 sm:grid-cols-2">
            <Field id="organization_name" label="Pełna nazwa podmiotu" required><Input id="organization_name" value={draft.entity.organization_name} onChange={(e) => entity("organization_name", e.target.value)} className={INPUT} /></Field>
            <Field id="representative" label="Osoba upoważniona do reprezentacji"><Input id="representative" value={draft.entity.representative} onChange={(e) => entity("representative", e.target.value)} className={INPUT} /></Field>
            <Field id="nip" label="NIP" hint="Wymagany NIP lub KRS." required><Input id="nip" aria-describedby="nip-hint" inputMode="numeric" value={draft.entity.nip} onChange={(e) => entity("nip", e.target.value)} className={INPUT} /></Field>
            <Field id="krs" label="KRS" hint="Wymagany NIP lub KRS." required><Input id="krs" aria-describedby="krs-hint" inputMode="numeric" value={draft.entity.krs} onChange={(e) => entity("krs", e.target.value)} className={INPUT} /></Field>
            <Field id="regon" label="REGON"><Input id="regon" inputMode="numeric" value={draft.entity.regon} onChange={(e) => entity("regon", e.target.value)} className={INPUT} /></Field>
            <Field id="entity_email" label="Email podmiotu" required><Input id="entity_email" type="email" value={draft.entity.email} onChange={(e) => entity("email", e.target.value)} className={INPUT} /></Field>
            <Field id="entity_phone" label="Telefon"><Input id="entity_phone" type="tel" value={draft.entity.phone} onChange={(e) => entity("phone", e.target.value)} className={INPUT} /></Field>
          </div>}
          {t !== "grupa_nieformalna" && <div className="grid gap-5 sm:grid-cols-3">
            <Field id="street" label={t === "podmiot" ? "Siedziba — ulica i numer" : "Ulica i numer"}><Input id="street" autoComplete="street-address" value={addrOf.street} onChange={(e) => setAddr("street", e.target.value)} className={INPUT} /></Field>
            <Field id="postal_code" label="Kod pocztowy"><Input id="postal_code" autoComplete="postal-code" value={addrOf.postal_code} onChange={(e) => setAddr("postal_code", e.target.value)} className={INPUT} /></Field>
            <Field id="city" label="Miejscowość"><Input id="city" autoComplete="address-level2" value={addrOf.city} onChange={(e) => setAddr("city", e.target.value)} className={INPUT} /></Field>
          </div>}
          {t === "grupa_nieformalna" && <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field id="partners" label="Partnerzy grupy" hint="Każdy partner w osobnej linii. Wymagani partnerzy lub reprezentant." required>
              <textarea id="partners" aria-describedby="partners-hint" rows={4} value={draft.group.partners} onChange={(e) => update((d) => ({ ...d, group: { ...d.group, partners: e.target.value } }))} className={AREA} /></Field></div>
            <Field id="group_rep" label="Reprezentant do kontaktów"><Input id="group_rep" value={draft.group.representative} onChange={(e) => update((d) => ({ ...d, group: { ...d.group, representative: e.target.value } }))} className={INPUT} /></Field>
            <Field id="group_rep_email" label="Email reprezentanta"><Input id="group_rep_email" type="email" value={draft.group.representative_email} onChange={(e) => update((d) => ({ ...d, group: { ...d.group, representative_email: e.target.value } }))} className={INPUT} /></Field>
          </div>}
        </CardContent></Card>

        <Card className="rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px] sm:[--card-spacing:32px]"><CardContent className="space-y-6">
          <h2 className="text-xl font-semibold">Opis innowacji (pkt 3–8)</h2>
          {TEXT_SECTIONS.filter(([k]) => k !== "project_team").map(([k, name, min, hint]) => <Field key={k} id={k} label={name} hint={`${hint} Co najmniej ${min} znaków.`} required>
            <textarea id={k} aria-describedby={`${k}-hint`} rows={5} value={draft.texts[k]} onChange={(e) => update((d) => ({ ...d, texts: { ...d.texts, [k]: e.target.value } }))} className={AREA} />
            <p className="text-sm text-muted-foreground">Znaków: {draft.texts[k].trim().length}</p>
          </Field>)}
        </CardContent></Card>

        <Card className="rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px] sm:[--card-spacing:32px]"><CardContent className="space-y-6">
          <h2 className="text-xl font-semibold">9–10. Plan działania i kosztorys</h2>
          <PlanEditor prefix="prep" title={`A. Okres przygotowawczy (do ${call.max_prep_months} mies.)`} hint="Działania przed testem, np. rekrutacja, przygotowanie materiałów." rows={draft.prep} phase={false} onChange={(rows) => update((d) => ({ ...d, prep: rows }))} />
          <PlanEditor prefix="test" title={`B. Okres testowania (do ${call.max_test_months} mies.)`} hint="Działania w trakcie testu innowacji z odbiorcami." rows={draft.test} phase onChange={(rows) => update((d) => ({ ...d, test: rows }))} />
          <Field id="grant_amount" label="10. Wnioskowana kwota grantu w zł" hint={`Maksymalnie ${formatPln(call.max_grant_amount)}. Musi być równa sumie kosztów planu.`} required>
            <Input id="grant_amount" aria-describedby="grant_amount-hint budget-status" inputMode="decimal" value={draft.grant_amount} aria-invalid={Number.isNaN(amount) || undefined} onChange={(e) => update((d) => ({ ...d, grant_amount: e.target.value }))} className={`${INPUT} max-w-xs`} />
          </Field>
          <p id="budget-status" className={Math.abs(total - (amount || 0)) > 0.01 ? "font-semibold text-red-900" : ""}>Suma kosztów planu: {formatPln(total)}. {Number.isNaN(amount) ? "Wnioskowana kwota ma niepoprawny format." : Math.abs(total - amount) > 0.01 ? `Różnica względem wnioskowanej kwoty: ${formatPln(Math.abs(total - amount))}.` : "Kosztorys zgodny z wnioskowaną kwotą."}</p>
        </CardContent></Card>

        <Card className="rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px] sm:[--card-spacing:32px]"><CardContent className="space-y-6">
          <h2 className="text-xl font-semibold">11. Zespół projektowy</h2>
          <Field id="project_team" label="Zespół i jego doświadczenie" hint={`${TEXT_SECTIONS.find(([k]) => k === "project_team")![3]} Co najmniej 10 znaków.`} required>
            <textarea id="project_team" aria-describedby="project_team-hint" rows={4} value={draft.texts.project_team} onChange={(e) => update((d) => ({ ...d, texts: { ...d.texts, project_team: e.target.value } }))} className={AREA} />
          </Field>
        </CardContent></Card>

        <Card className="rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px] sm:[--card-spacing:32px]"><CardContent className="space-y-4">
          <fieldset className="min-w-0 space-y-3"><legend className="text-xl font-semibold">12. Oświadczenia</legend>
            <p className="text-sm leading-relaxed text-muted-foreground">Przeczytaj i zaznacz każde oświadczenie osobno. Nie zaznaczamy ich za Ciebie. Oświadczenia składasz pod rygorem odpowiedzialności karnej.</p>
            {DECLARATIONS.map(([k, text]) => <label key={k} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-input p-3 has-[:checked]:border-primary">
              <input type="checkbox" checked={draft.declarations[k]} onChange={(e) => update((d) => ({ ...d, declarations: { ...d.declarations, [k]: e.target.checked } }))} className="mt-1 size-5 shrink-0 accent-[var(--primary)]" />
              <span className="leading-relaxed">{text}</span>
            </label>)}
          </fieldset>
        </CardContent></Card>
      </fieldset>

      <div className="sticky bottom-0 z-10 space-y-3 border-t border-border bg-background py-4 print:hidden">
        <p role="status" aria-atomic="true" className="text-sm">{pending === "save" ? "Zapisujemy wersję roboczą…" : pending === "submit" ? "Składamy wniosek…" : dirty ? "Masz niezapisane zmiany." : savedAt ? `Zapisano: ${formatDate(savedAt)}.` : ""}</p>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending !== "" || !dirty} className="h-auto min-h-12 max-w-full whitespace-normal px-[24px] py-3 text-base">{pending === "save" ? "Zapisujemy…" : "Zapisz wersję roboczą"}</Button>
          <Link href={`/wnioski/${initial.id}/podglad`} className={LINK}>Podgląd, druk i eksport zapisanej wersji</Link>
        </div>
      </div>
    </form>

    <div ref={resultRef} tabIndex={-1} className="rounded-sm">{result && <Messages items={result.items} error={result.error} />}</div>

    <section aria-labelledby="submit-h" className="space-y-4 rounded-2xl border border-border bg-card p-[24px]">
      <h2 id="submit-h" className="text-xl font-semibold">Złożenie wniosku</h2>
      <CallStatusNotice status={call.status} />
      {missing.length > 0 ? <div className="space-y-2"><p className="font-semibold">Przed złożeniem uzupełnij:</p><ul className="list-disc space-y-1 pl-5 text-sm">{missing.map((m) => <li key={m}>{m}</li>)}</ul></div>
        : <p className="text-sm">Formularz spełnia wymagania kompletności sprawdzane w przeglądarce. Ostateczną weryfikację wykona usługa.</p>}
      {dirty && <p className="text-sm font-semibold">Zapisz zmiany przed złożeniem — złożona zostanie zapisana wersja.</p>}
      {!confirming
        ? <Button type="button" variant="outline" disabled={closed || !versionOk || dirty || pending !== ""} onClick={() => setConfirming(true)} className="h-auto min-h-12 max-w-full whitespace-normal px-[24px] py-3 text-base">Przejdź do złożenia</Button>
        : <div className="space-y-3">
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--primary)]" />
            <span>{call.status === "otwarty" ? "Rozumiem, że po złożeniu nie mogę edytować wniosku, a ROPS rozpocznie jego ocenę." : "Rozumiem, że to nabór demonstracyjny: wniosek nie trafia do oficjalnego konkursu, a po złożeniu nie mogę go edytować."}</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={!understood || pending !== "" || dirty} onClick={() => void run("submit")} className="h-auto min-h-12 max-w-full whitespace-normal px-[24px] py-3 text-base">{pending === "submit" ? "Składamy…" : call.status === "otwarty" ? "Złóż wniosek w naborze" : "Złóż wniosek demonstracyjny"}</Button>
            <Button type="button" variant="outline" disabled={pending !== ""} onClick={() => { setConfirming(false); setUnderstood(false); }} className="h-auto min-h-12 max-w-full whitespace-normal px-[24px] py-3 text-base">Anuluj</Button>
          </div>
        </div>}
    </section>
  </div>;
}

function Submitted({ app }: { app: GrantApplication }) {
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary" className="h-auto min-h-7 whitespace-normal">{label(APPLICATION_STATUS_LABELS, app.status)}</Badge>
      {app.submitted_at && <span className="text-sm text-muted-foreground">Złożono <time dateTime={app.submitted_at}>{formatDate(app.submitted_at)}</time></span>}</div>
    <StatusMessage>Wniosek nie jest już wersją roboczą, więc nie można go edytować. Możesz go przejrzeć, wydrukować i wyeksportować.</StatusMessage>
    <Link href={`/wnioski/${app.id}/podglad`} className={LINK}>Podgląd, druk i eksport</Link>
  </div>;
}

function Loaded({ id }: { id: string }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const service = createGrantService();
    const app = await service.get(id, signal);
    const call = await service.call(app.call_id, signal);
    return { app, call };
  }, [id]);
  const { state, refresh } = useBackendQuery(`grant:${id}`, load);
  const [submitted, setSubmitted] = useState<GrantApplication | null>(null);
  if (state.status === "loading") return <LoadingMessage>Wczytujemy wniosek…</LoadingMessage>;
  if (state.status === "error") return <div className="space-y-3"><StatusMessage error>{state.message}</StatusMessage>{!state.access && <Button variant="outline" onClick={refresh} className="h-auto min-h-11 px-[16px]">Spróbuj ponownie</Button>}</div>;
  const { call } = state.data;
  const app = submitted ?? state.data.app;
  return <div className="space-y-6">
    <div className="space-y-2">
      <p className="text-sm">Nabór: <span className="font-semibold">{call.name}</span></p>
      <p className="text-sm text-muted-foreground">Wzór: {call.template_name}, wersja {call.template_version}</p>
      {call.template_version !== SUPPORTED_TEMPLATE_VERSION && <StatusMessage error>Ten nabór używa wzoru w wersji {call.template_version}; formularz HubMI obsługuje wersję {SUPPORTED_TEMPLATE_VERSION}. Złożenie jest zablokowane.</StatusMessage>}
    </div>
    {submitted && <StatusMessage><strong>{call.status === "otwarty" ? "Wniosek złożony w naborze." : "Wniosek demonstracyjny złożony."}</strong> Potwierdziliśmy zmianę statusu ponownym odczytem.{call.status !== "otwarty" && " Nie trafił do oficjalnego konkursu."}</StatusMessage>}
    {app.status === "roboczy" ? (call.status === "zamkniety"
      ? <><CallStatusNotice status="zamkniety" /><Link href={`/wnioski/${app.id}/podglad`} className={LINK}>Podgląd, druk i eksport wersji roboczej</Link></>
      : <Form initial={app} call={call} onSubmitted={setSubmitted} />)
      : <Submitted app={app} />}
  </div>;
}

export function GrantEditor({ id }: { id: string }) {
  return <div className="space-y-5">
    <Link href="/wnioski" className={LINK}>Wróć do naborów i wniosków</Link>
    <AuthGate><Loaded id={id} /></AuthGate>
  </div>;
}

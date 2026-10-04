"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/status-message";
import { useAuth } from "@/features/auth/auth-provider";
import { backendCallMessage } from "@/features/rops/backend-session";
import {
  EMPTY_NEED, INSTITUTION_TYPES, MAX_AFFECTED, NEED_CATEGORIES, NEED_FIELD_ORDER, NEED_LIMITS, POWIATS, URGENCY_LABELS,
  validateNeed, type NeedDraft, type NeedErrors,
} from "./model";
import { createNeedsService, type SubmitResult } from "./service";

type State = { status: "idle" | "loading" } | { status: "error"; message: string } | { status: "success"; result: SubmitResult };

const FIELD_CLASS = "block w-full rounded-lg border border-input bg-background p-[12px] text-base leading-relaxed aria-invalid:border-destructive";
const SELECT_CLASS = "min-h-12 w-full rounded-lg border border-input bg-background px-[12px] py-3 text-base aria-invalid:border-destructive";

function Field({ id, label, hint, error, required, children }: { id: keyof NeedDraft; label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return <div className="min-w-0 space-y-2">
    <label htmlFor={id} className="block font-semibold">{label} <span className="font-normal text-muted-foreground">({required ? "wymagane" : "opcjonalnie"})</span></label>
    {hint && <p id={`${id}-hint`} className="text-sm leading-relaxed text-muted-foreground">{hint}</p>}
    {children}
    {error && <p id={`${id}-error`} className="text-sm text-red-900">{error}</p>}
  </div>;
}

export function NeedForm() {
  const auth = useAuth();
  const [draft, setDraft] = useState<NeedDraft>(EMPTY_NEED);
  const [errors, setErrors] = useState<NeedErrors>({});
  const [state, setState] = useState<State>({ status: "idle" });
  const request = useRef<AbortController | null>(null);
  const result = useRef<HTMLDivElement>(null);
  const loading = state.status === "loading";
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (state.status === "success") result.current?.focus(); }, [state.status]);

  const describedBy = (key: keyof NeedDraft, hint = true) => [hint ? `${key}-hint` : "", errors[key] ? `${key}-error` : ""].filter(Boolean).join(" ") || undefined;
  const common = (key: keyof NeedDraft, hint = true) => ({
    id: key, name: key, value: draft[key],
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": describedBy(key, hint),
    onChange: (event: { target: { value: string } }) => {
      const value = event.target.value;
      setDraft((current) => ({ ...current, [key]: value }));
      setErrors((current) => ({ ...current, [key]: undefined }));
      if (state.status === "error") setState({ status: "idle" });
    },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return; // Blokada podwójnego wysłania przed kolejnym renderem.
    const validation = validateNeed(draft);
    setErrors(validation);
    const first = NEED_FIELD_ORDER.find((key) => validation[key]);
    if (first) { setState({ status: "idle" }); document.getElementById(first)?.focus(); return; }
    const controller = new AbortController();
    request.current = controller;
    setState({ status: "loading" });
    try {
      const saved = await createNeedsService().submit(draft, controller.signal);
      if (!controller.signal.aborted) setState({ status: "success", result: saved });
    } catch (error) {
      if (!controller.signal.aborted) setState({ status: "error", message: backendCallMessage(error) });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  if (state.status === "success") {
    const { receipt, onAccount } = state.result;
    return <div ref={result} tabIndex={-1} className="space-y-5 rounded-sm">
      <StatusMessage>
        <strong>Usługa przyjęła zgłoszenie potrzeby.</strong> Numer: <code className="break-all">{receipt.id}</code>. Status: „Nowe”.
        {onAccount === true && <> Odczytaliśmy je ponownie z Twojego konta — znajdziesz je w „Moich zgłoszeniach”.</>}
        {onAccount === false && <> Nie udało się odczytać go ponownie z Twojego konta. Sprawdź „Moje zgłoszenia” przed ponownym wysłaniem.</>}
        {onAccount === null && <> Zgłoszenie wysłane bez logowania nie pojawi się na żadnym koncie — zapisz numer, jeśli chcesz się do niego odwołać.</>}
      </StatusMessage>
      <p className="text-sm leading-relaxed text-muted-foreground">Zgłoszenie trafia do zestawień ROPS. Treść i dane kontaktowe widzą wyłącznie pracownicy ROPS.</p>
      <div className="flex flex-wrap gap-4">
        {onAccount !== null && <Link href="/moje-zgloszenia" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Moje zgłoszenia</Link>}
        <Button variant="outline" className="h-auto min-h-11 whitespace-normal px-[16px] py-2" onClick={() => { setDraft(EMPTY_NEED); setErrors({}); setState({ status: "idle" }); }}>Zgłoś kolejną potrzebę</Button>
      </div>
    </div>;
  }

  const errorList = NEED_FIELD_ORDER.filter((key) => errors[key]);
  return <div className="space-y-6">
    {auth.state.status !== "authenticated" && <StatusMessage>
      Możesz zgłosić potrzebę bez logowania. Po <Link href="/logowanie" className="font-semibold underline underline-offset-4">zalogowaniu</Link> zgłoszenie będzie widoczne w „Moich zgłoszeniach”.
    </StatusMessage>}
    <Card className="rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px] sm:[--card-spacing:32px]">
      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-8" aria-busy={loading}>
          {errorList.length > 0 && <StatusMessage error>Sprawdź oznaczone pola formularza.
            <ul className="mt-2 space-y-1">{errorList.map((key) => <li key={key}><a href={`#${key}`} className="underline underline-offset-4">{errors[key]}</a></li>)}</ul>
          </StatusMessage>}
          <fieldset disabled={loading} className="min-w-0 space-y-6">
            <legend className="mb-4 text-xl font-semibold">Problem</legend>
            <Field id="problem_summary" label="Na czym polega problem — w jednym zdaniu" hint="Na przykład: „Samotni seniorzy z przysiółków nie docierają do ośrodka zdrowia”." error={errors.problem_summary} required>
              <Input {...common("problem_summary")} maxLength={NEED_LIMITS.problem_summary[1]} className="h-auto min-h-12 py-3 text-base md:text-base" />
            </Field>
            <Field id="detailed_description" label="Opis sytuacji" hint="Kogo dotyczy, gdzie występuje, od kiedy i jakie ma skutki. Nie musisz proponować rozwiązania." error={errors.detailed_description} required>
              <textarea {...common("detailed_description")} rows={6} maxLength={NEED_LIMITS.detailed_description[1]} className={`${FIELD_CLASS} resize-y`} />
            </Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="category" label="Kategoria" error={errors.category} required>
                <select {...common("category", false)} className={SELECT_CLASS}><option value="">Wybierz kategorię</option>{NEED_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </Field>
              <Field id="urgency_level" label="Pilność" error={errors.urgency_level} required>
                <select {...common("urgency_level", false)} className={SELECT_CLASS}>{Object.entries(URGENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </Field>
            </div>
            <Field id="target_group" label="Kogo dotyczy problem" hint="Grupa osób, np. „osoby 75+ mieszkające samotnie”." error={errors.target_group} required>
              <Input {...common("target_group")} maxLength={NEED_LIMITS.target_group[1]} className="h-auto min-h-12 py-3 text-base md:text-base" />
            </Field>
            <Field id="estimated_affected_count" label="Szacunkowa liczba osób" hint="Jeśli nie wiesz, zostaw puste." error={errors.estimated_affected_count}>
              <Input {...common("estimated_affected_count")} inputMode="numeric" maxLength={String(MAX_AFFECTED).length} className="h-auto min-h-12 max-w-xs py-3 text-base md:text-base" />
            </Field>
          </fieldset>

          <fieldset disabled={loading} className="min-w-0 space-y-6">
            <legend className="mb-4 text-xl font-semibold">Kto zgłasza i gdzie</legend>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="institution_name" label="Nazwa instytucji lub zgłaszającego" hint="Gmina, CUS, OPS, organizacja albo „mieszkaniec”." error={errors.institution_name} required>
                <Input {...common("institution_name")} maxLength={NEED_LIMITS.institution_name[1]} className="h-auto min-h-12 py-3 text-base md:text-base" />
              </Field>
              <Field id="institution_type" label="Typ zgłaszającego" error={errors.institution_type} required>
                <select {...common("institution_type", false)} className={SELECT_CLASS}>{INSTITUTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              </Field>
              <Field id="powiat" label="Powiat" error={errors.powiat} required>
                <select {...common("powiat", false)} className={SELECT_CLASS}><option value="">Wybierz powiat</option>{POWIATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </Field>
              <Field id="gmina" label="Gmina" error={errors.gmina}>
                <Input {...common("gmina", false)} maxLength={NEED_LIMITS.gmina[1]} className="h-auto min-h-12 py-3 text-base md:text-base" />
              </Field>
            </div>
          </fieldset>

          <fieldset disabled={loading} className="min-w-0 space-y-6">
            <legend className="mb-2 text-xl font-semibold">Kontakt</legend>
            <p className="text-sm leading-relaxed text-muted-foreground">Dane kontaktowe widzą wyłącznie pracownicy ROPS. Podaj je, jeśli ROPS może się z Tobą skontaktować w sprawie zgłoszenia.</p>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="contact_email" label="Email" error={errors.contact_email}>
                <Input {...common("contact_email", false)} type="email" autoComplete="email" maxLength={NEED_LIMITS.contact_email[1]} className="h-auto min-h-12 py-3 text-base md:text-base" />
              </Field>
              <Field id="contact_phone" label="Telefon" error={errors.contact_phone}>
                <Input {...common("contact_phone", false)} type="tel" autoComplete="tel" maxLength={NEED_LIMITS.contact_phone[1]} className="h-auto min-h-12 py-3 text-base md:text-base" />
              </Field>
            </div>
          </fieldset>

          {state.status === "error" && <StatusMessage error>{state.message}</StatusMessage>}
          <div className="space-y-3 border-t border-border pt-5">
            <Button type="submit" disabled={loading} className="h-auto min-h-12 w-full whitespace-normal px-[24px] py-3 text-base sm:w-auto">{loading ? "Wysyłamy zgłoszenie…" : "Zgłoś potrzebę"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
    <p role="status" aria-atomic="true" className="text-sm text-muted-foreground">{loading ? "Wysyłamy zgłoszenie potrzeby. Czekamy na potwierdzenie usługi…" : ""}</p>
  </div>;
}

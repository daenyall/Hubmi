"use client";
import Link from "next/link";
import { createRecordId } from "@/lib/uuid";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/status-message";
import { useAuth } from "@/features/auth/auth-provider";
import { LoginForm } from "@/features/auth/login-form";
import { SUBMISSIONS_ENABLED } from "@/lib/supabase/config";
import { createSubmissionsService, dataMessage, SETUP_MESSAGE } from "./service";
import { APPLICANT_TYPES, EMPTY_DRAFT, STAGES, submissionPayload, validateDraft, type DraftErrors, type Submission, type SubmissionDraft } from "./model";
import { InnovationPicker } from "./innovation-picker";

type SaveState = { status: "idle" | "loading" } | { status: "error"; message: string } | { status: "success"; saved: Submission };
const fields = [
  { key: "title", label: "Tytuł pomysłu", hint: "Krótka nazwa, która opisuje Twój pomysł.", max: 160, rows: 0 },
  { key: "problem_description", label: "Problem lub potrzeba", hint: "Opisz, kogo dotyczy problem, gdzie występuje i jakie ma skutki. Jeśli masz dane lub obserwacje, podaj ich źródło. Oddziel to, co wiesz, od przypuszczeń.", max: 10000, rows: 4 },
  { key: "solution_description", label: "Istota rozwiązania", hint: "Wyjaśnij, jak pomysł odpowiada na opisany problem. Podaj główne działania, kto je wykona i po czym poznasz, że przyniosły oczekiwaną zmianę.", max: 10000, rows: 5 },
  { key: "target_group", label: "Odbiorcy", hint: "Wskaż osoby, które skorzystają z rozwiązania, ich potrzeby i ewentualne bariery udziału. Określ zasięg oraz liczbę odbiorców, jeśli ją znasz.", max: 4000, rows: 3 },
] as const;

export function SubmissionCreator({ initialInnovationId = "" }: { initialInnovationId?: string }) {
  const auth = useAuth();
  const userId = auth.state.status === "authenticated" ? auth.state.user.id : null;
  const [draft, setDraft] = useState<SubmissionDraft>({ ...EMPTY_DRAFT, matched_innovation_id: initialInnovationId });
  const [errors, setErrors] = useState<DraftErrors>({});
  const [state, setState] = useState<SaveState>({ status: "idle" });
  const request = useRef<AbortController | null>(null);
  const retryIdentity = useRef<{ signature: string; id: string } | null>(null);
  const loading = state.status === "loading";
  useEffect(() => () => request.current?.abort(), [userId]);
  const canSave = !!userId && SUBMISSIONS_ENABLED;

  function update(key: keyof SubmissionDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setState({ status: "idle" });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const validation = validateDraft(draft);
    setErrors(validation);
    if (Object.keys(validation).length) {
      setState({ status: "idle" });
      document.getElementById(Object.keys(validation)[0])?.focus();
      return;
    }
    if (!canSave) { setState({ status: "error", message: !SUBMISSIONS_ENABLED ? SETUP_MESSAGE : "Zaloguj się, aby zapisać fiszkę." }); return; }
    const controller = new AbortController();
    request.current = controller;
    setState({ status: "loading" });
    try {
      const signature = JSON.stringify(submissionPayload(draft, ""));
      if (retryIdentity.current?.signature !== signature) retryIdentity.current = { signature, id: createRecordId() };
      const saved = await createSubmissionsService().create(draft, retryIdentity.current.id, controller.signal);
      if (!controller.signal.aborted) setState({ status: "success", saved });
    } catch (error) {
      if (!controller.signal.aborted) setState({ status: "error", message: dataMessage(error) });
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (controller.signal.aborted) setState({ status: "idle" });
      }
    }
  }
  if (state.status === "success" && state.saved.user_id !== userId) return <div className="space-y-4">
    <StatusMessage>Zapisana fiszka jest dostępna na koncie jej autora. Zaloguj się na to konto, aby ją odczytać.</StatusMessage>
    {auth.state.status !== "authenticated" && <LoginForm />}
    <Button variant="outline" className="h-auto min-h-11 whitespace-normal px-[16px] py-2" onClick={() => { setDraft({ ...EMPTY_DRAFT }); setErrors({}); setState({ status: "idle" }); retryIdentity.current = null; }}>Przygotuj nowy pomysł</Button>
  </div>;
  if (state.status === "success" && state.saved.user_id === userId) return <div className="space-y-5">
    <StatusMessage><strong>Fiszka została zapisana.</strong> Potwierdziliśmy zapis „{state.saved.title}” w bazie.</StatusMessage>
    <div className="flex flex-wrap gap-4">
      <Link href={`/moje-zgloszenia/${state.saved.id}`} className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Zobacz zapisaną fiszkę</Link>
      <Link href="/moje-zgloszenia" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Moje zgłoszenia</Link>
      <Button variant="outline" className="h-auto min-h-11 whitespace-normal px-[16px] py-2" onClick={() => { setDraft({ ...EMPTY_DRAFT }); setErrors({}); setState({ status: "idle" }); retryIdentity.current = null; }}>Zgłoś kolejny pomysł</Button>
    </div>
  </div>;
  return <div className="space-y-6">
    {auth.state.status !== "authenticated" && <LoginForm />}
    {!SUBMISSIONS_ENABLED && <StatusMessage>{SETUP_MESSAGE} Możesz przygotować treść poniżej, ale nie zostanie ona zapisana.</StatusMessage>}
    <Card className="rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px] sm:[--card-spacing:32px]">
      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-6" aria-busy={loading}>
          {Object.values(errors).some(Boolean) && <StatusMessage error>Sprawdź oznaczone pola formularza.
            <ul className="mt-2 space-y-1">{Object.entries(errors).filter(([, message]) => message).map(([key, message]) => <li key={key}><a href={`#${key}`} className="underline underline-offset-4">{message}</a></li>)}</ul>
          </StatusMessage>}
          <fieldset disabled={loading} className="min-w-0 space-y-6">
            <legend className="sr-only">Treść fiszki innowacji</legend>
            {fields.map(({ key, label, hint, max, rows }) => <div key={key} className="space-y-2">
              <label htmlFor={key} className="block font-semibold">{label} <span className="font-normal text-muted-foreground">(wymagane)</span></label>
              <p id={`${key}-hint`} className="text-sm leading-relaxed text-muted-foreground">{hint}</p>
              {rows ? <textarea id={key} name={key} required rows={rows} maxLength={max} value={draft[key]} onChange={(e) => update(key, e.target.value)} aria-invalid={!!errors[key] || undefined} aria-describedby={`${key}-hint${errors[key] ? ` ${key}-error` : ""}`} className="block w-full resize-y rounded-lg border border-input bg-background p-[16px] text-base leading-relaxed aria-invalid:border-destructive" />
                : <Input id={key} name={key} required maxLength={max} value={draft[key]} onChange={(e) => update(key, e.target.value)} aria-invalid={!!errors[key] || undefined} aria-describedby={`${key}-hint${errors[key] ? ` ${key}-error` : ""}`} className="h-auto min-h-12 py-3 text-base md:text-base" />}
              {errors[key] && <p id={`${key}-error`} className="text-sm text-red-900">{errors[key]}</p>}
            </div>)}
            <div className="space-y-2">
              <label htmlFor="implementation_stage" className="block font-semibold">Etap realizacji (wymagane)</label>
              <p id="implementation_stage-hint" className="text-sm leading-relaxed text-muted-foreground">Pomysł: planujesz działania. Prototyp: przygotowujesz pierwszą wersję rozwiązania. Pilotaż: sprawdzasz je z ograniczoną grupą odbiorców. Wdrożenie: rozwiązanie jest już wykorzystywane.</p>
              <select id="implementation_stage" required value={draft.implementation_stage} onChange={(e) => update("implementation_stage", e.target.value)} aria-invalid={!!errors.implementation_stage || undefined} aria-describedby={`implementation_stage-hint${errors.implementation_stage ? " implementation_stage-error" : ""}`} className="min-h-12 w-full rounded-lg border border-input bg-background px-[12px] py-3 text-base">
                <option value="">Wybierz etap</option>{Object.entries(STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              {errors.implementation_stage && <p id="implementation_stage-error" className="text-sm text-red-900">{errors.implementation_stage}</p>}
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="min-w-0 space-y-2"><label htmlFor="institution_name" className="block font-semibold">Instytucja (opcjonalnie)</label><Input id="institution_name" maxLength={200} value={draft.institution_name} onChange={(e) => update("institution_name", e.target.value)} aria-invalid={!!errors.institution_name || undefined} aria-describedby={errors.institution_name ? "institution_name-error" : undefined} className="h-auto min-h-12 py-3 text-base md:text-base" />{errors.institution_name && <p id="institution_name-error" className="text-sm text-red-900">{errors.institution_name}</p>}</div>
              <div className="min-w-0 space-y-2"><label htmlFor="applicant_type" className="block font-semibold">Typ zgłaszającego (opcjonalnie)</label><select id="applicant_type" value={draft.applicant_type} onChange={(e) => update("applicant_type", e.target.value)} className="min-h-12 w-full rounded-lg border border-input bg-background px-[12px] py-3 text-base"><option value="">Nie określono</option>{APPLICANT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
            </div>
            <div><InnovationPicker value={draft.matched_innovation_id} onChange={(value) => update("matched_innovation_id", value)} disabled={loading} error={errors.matched_innovation_id} />{errors.matched_innovation_id && <p id="matched_innovation_id-error" className="mt-2 text-sm text-red-900">{errors.matched_innovation_id}</p>}</div>
          </fieldset>
          {state.status === "error" && <StatusMessage error>{state.message}</StatusMessage>}
          <div className="space-y-3 border-t border-border pt-5">
            <p className="text-sm leading-relaxed text-muted-foreground">Wymagane pola są oznaczone. Zgłoszenie otrzyma status „Nowe”; decyzja należy do zespołu weryfikującego.</p>
            <Button type="submit" disabled={loading || !canSave} className="h-auto min-h-12 w-full whitespace-normal px-[24px] py-3 text-base sm:w-auto">{loading ? "Zapisujemy fiszkę…" : "Zapisz fiszkę"}</Button>
            {!userId && <p className="text-sm text-muted-foreground">Zaloguj się powyżej, aby zapisać fiszkę na swoim koncie.</p>}
          </div>
        </form>
      </CardContent>
    </Card>
    <p role="status" aria-atomic="true" className="text-sm text-muted-foreground">{loading ? "Zapisujemy fiszkę. Czekamy na potwierdzenie z bazy…" : ""}</p>
  </div>;
}

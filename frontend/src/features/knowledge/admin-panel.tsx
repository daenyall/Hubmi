"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { AuthGate } from "@/features/auth/login-form";
import { useAuth } from "@/features/auth/auth-provider";
import {
  KNOWLEDGE_STATUSES, KNOWLEDGE_STATUS_LABELS, FIELD_LIMITS, PUBLISHED_STATUS,
  draftFromRecord, emptyDraft, firstInvalidField, statusLabel, validateDraft,
  type AdminInnovation, type DraftErrors, type InnovationDraft,
} from "./admin-model";
import { createKnowledgeAdminService, knowledgeAdminMessage, type SaveResult } from "./admin-service";
import { ResourcesAdminSection } from "./resources-admin";
import { roleFromVerifiedUser } from "@/features/rops/access";

/** Publikacja udostępnia rekord publicznie; szkice odczytuje autoryzowany panel ROPS. */
const VISIBILITY_NOTE = "Publikacja ustawia status „sprawdzone” i udostępnia innowację w publicznym katalogu oraz dopasowaniach. Wersje „Nowa” i „W weryfikacji” są dostępne wyłącznie w panelu ROPS.";

type Feedback = { message: string; error: boolean } | null;

type ListState =
  | { key: string; phase: "loading" }
  | { key: string; phase: "ready"; items: AdminInnovation[] }
  | { key: string; phase: "error"; message: string };

/** Klucz odczytu pilnuje, by widok nie pokazał danych innego filtra ani starszej próby. */
function useAdminList(statusFilter: string) {
  const [attempt, setAttempt] = useState(0);
  const key = `${statusFilter}:${attempt}`;
  const [state, setState] = useState<ListState>({ key, phase: "loading" });
  // Ostatni potwierdzony odczyt tego filtra zostaje na ekranie, gdy odświeżamy listę po zapisie.
  const [cached, setCached] = useState<{ filter: string; items: AdminInnovation[] } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve()
      .then(() => createKnowledgeAdminService().list({ status: statusFilter || undefined }, controller.signal))
      .then((rows) => {
        if (controller.signal.aborted) return;
        setState({ key, phase: "ready", items: rows });
        setCached({ filter: statusFilter, items: rows });
      })
      .catch((error) => { if (!controller.signal.aborted) setState({ key, phase: "error", message: knowledgeAdminMessage(error) }); });
    return () => controller.abort();
  }, [key, statusFilter]);
  const current: ListState = state.key === key ? state : { key, phase: "loading" };
  const previous = current.phase === "ready" || cached?.filter !== statusFilter ? null : cached.items;
  return { state: current, previous, refresh: useCallback(() => setAttempt((n) => n + 1), []) };
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} role="alert" className="text-sm text-red-900">{message}</p>;
}

function InnovationForm({ heading, initial, submitLabel, onSave, onCancel }: {
  heading: string; initial: InnovationDraft; submitLabel: string;
  onSave: (draft: InnovationDraft, signal: AbortSignal) => Promise<SaveResult>;
  onCancel?: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const fields = useRef(new Map<keyof InnovationDraft, HTMLElement | null>());
  // Ponowne wywołanie efektu (StrictMode) musi przywrócić flagę, inaczej zapis nie zaktualizuje widoku.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);

  function change<K extends keyof InnovationDraft>(field: K, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setFeedback(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return; // Blokada równoległego zapisu.
    const found = validateDraft(draft);
    if (Object.keys(found).length) {
      setErrors(found);
      setFeedback({ message: "Popraw zaznaczone pola. Nic nie zostało zapisane, a wpisana treść pozostaje w formularzu.", error: true });
      const first = firstInvalidField(found);
      if (first) fields.current.get(first)?.focus();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setErrors({}); setFeedback(null);
    try {
      const result = await onSave(draft, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setFeedback(result.confirmed
        ? { message: `Zapis potwierdzony ponownym odczytem rekordu (identyfikator: ${result.record.id}).`, error: false }
        : { message: `Zapis nie został w pełni potwierdzony. ${result.note}`, error: true });
      if (result.confirmed) setDraft(draftFromRecord(result.record));
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setFeedback({ message: knowledgeAdminMessage(error), error: true });
    } finally {
      if (request.current === controller) request.current = null;
      if (mounted.current) setPending(false);
    }
  }

  const described = (field: keyof InnovationDraft, hint?: string) =>
    [hint, errors[field] ? `${id}-${field}-error` : ""].filter(Boolean).join(" ") || undefined;
  const textareaClass = "block w-full resize-y rounded-lg border border-input bg-background p-[16px] text-base leading-relaxed aria-invalid:border-destructive";

  return <form onSubmit={(event) => void submit(event)} noValidate aria-busy={pending} className="space-y-5 rounded-2xl border border-border bg-card p-[24px]">
    <h3 className="text-xl font-semibold">{heading}</h3>
    <div className="space-y-2">
      <label htmlFor={`${id}-title`} className="block font-semibold">Nazwa innowacji (wymagane)</label>
      <Input id={`${id}-title`} ref={(node) => { fields.current.set("title", node); }} required maxLength={FIELD_LIMITS.title}
        value={draft.title} readOnly={pending} onChange={(event) => change("title", event.target.value)}
        aria-invalid={!!errors.title || undefined} aria-describedby={described("title", `${id}-title-hint`)}
        className="h-auto min-h-12 py-3 text-base md:text-base" />
      <p id={`${id}-title-hint`} className="text-sm text-muted-foreground">Od 3 do {FIELD_LIMITS.title} znaków.</p>
      <FieldError id={`${id}-title-error`} message={errors.title} />
    </div>
    <div className="space-y-2">
      <label htmlFor={`${id}-description`} className="block font-semibold">Opis (wymagane)</label>
      <textarea id={`${id}-description`} ref={(node) => { fields.current.set("description", node); }} rows={5} required maxLength={FIELD_LIMITS.description}
        value={draft.description} readOnly={pending} onChange={(event) => change("description", event.target.value)}
        aria-invalid={!!errors.description || undefined} aria-describedby={described("description", `${id}-description-hint`)} className={textareaClass} />
      <p id={`${id}-description-hint`} className="text-sm text-muted-foreground">Od 10 do {FIELD_LIMITS.description} znaków. Opis trafia do publicznego katalogu.</p>
      <FieldError id={`${id}-description-error`} message={errors.description} />
    </div>
    <div className="space-y-2">
      <label htmlFor={`${id}-target_group`} className="block font-semibold">Grupa docelowa (wymagane)</label>
      <textarea id={`${id}-target_group`} ref={(node) => { fields.current.set("target_group", node); }} rows={2} required maxLength={FIELD_LIMITS.target_group}
        value={draft.target_group} readOnly={pending} onChange={(event) => change("target_group", event.target.value)}
        aria-invalid={!!errors.target_group || undefined} aria-describedby={described("target_group", `${id}-target-hint`)} className={textareaClass} />
      <p id={`${id}-target-hint`} className="text-sm text-muted-foreground">Odbiorcy rozwiązania, od 3 do {FIELD_LIMITS.target_group} znaków.</p>
      <FieldError id={`${id}-target_group-error`} message={errors.target_group} />
    </div>
    <div className="space-y-2">
      <label htmlFor={`${id}-category`} className="block font-semibold">Kategoria (wymagane)</label>
      <Input id={`${id}-category`} ref={(node) => { fields.current.set("category", node); }} required maxLength={FIELD_LIMITS.category}
        value={draft.category} readOnly={pending} onChange={(event) => change("category", event.target.value)}
        aria-invalid={!!errors.category || undefined} aria-describedby={described("category", `${id}-category-hint`)}
        className="h-auto min-h-12 py-3 text-base md:text-base" />
      <p id={`${id}-category-hint`} className="text-sm text-muted-foreground">Kategoria filtruje katalog, na przykład Seniorzy, Dostępność, Zdrowie psychiczne.</p>
      <FieldError id={`${id}-category-error`} message={errors.category} />
    </div>
    <div className="space-y-2">
      <label htmlFor={`${id}-why_relevant`} className="block font-semibold">Dlaczego warto (opcjonalne)</label>
      <textarea id={`${id}-why_relevant`} ref={(node) => { fields.current.set("why_relevant", node); }} rows={3} maxLength={FIELD_LIMITS.why_relevant}
        value={draft.why_relevant} readOnly={pending} onChange={(event) => change("why_relevant", event.target.value)}
        aria-invalid={!!errors.why_relevant || undefined} aria-describedby={described("why_relevant", `${id}-why-hint`)} className={textareaClass} />
      <p id={`${id}-why-hint`} className="text-sm leading-relaxed text-muted-foreground">Stały opis rekordu, zapisany raz dla wszystkich odbiorców. Nie jest uzasadnieniem dopasowania do konkretnego zapytania użytkownika.</p>
      <FieldError id={`${id}-why_relevant-error`} message={errors.why_relevant} />
    </div>
    <div className="space-y-2">
      <label htmlFor={`${id}-source_url`} className="block font-semibold">Źródło — adres strony (opcjonalne)</label>
      <Input id={`${id}-source_url`} ref={(node) => { fields.current.set("source_url", node); }} type="url" inputMode="url" maxLength={FIELD_LIMITS.source_url}
        value={draft.source_url} readOnly={pending} onChange={(event) => change("source_url", event.target.value)}
        aria-invalid={!!errors.source_url || undefined} aria-describedby={described("source_url", `${id}-source-hint`)}
        className="h-auto min-h-12 py-3 text-base md:text-base" />
      <p id={`${id}-source-hint`} className="text-sm text-muted-foreground">Pełny adres http lub https. Pozostaw puste, jeśli nie ma potwierdzonego źródła.</p>
      <FieldError id={`${id}-source_url-error`} message={errors.source_url} />
    </div>
    <div className="space-y-2">
      <label htmlFor={`${id}-status`} className="block font-semibold">Status</label>
      <select id={`${id}-status`} ref={(node) => { fields.current.set("status", node); }} value={draft.status} disabled={pending}
        onChange={(event) => change("status", event.target.value)}
        aria-invalid={!!errors.status || undefined} aria-describedby={described("status", `${id}-status-hint`)}
        className="min-h-12 w-full rounded-lg border border-input bg-background px-[12px] py-3 text-base">
        {KNOWLEDGE_STATUSES.map((value) => <option key={value} value={value}>{KNOWLEDGE_STATUS_LABELS[value]}</option>)}
      </select>
      <p id={`${id}-status-hint`} className="text-sm leading-relaxed text-muted-foreground">{VISIBILITY_NOTE}</p>
      <FieldError id={`${id}-status-error`} message={errors.status} />
    </div>
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={pending} className="h-auto min-h-12 whitespace-normal px-[24px] py-3 text-base">{pending ? "Zapisujemy…" : submitLabel}</Button>
      {onCancel && <Button type="button" variant="outline" disabled={pending} onClick={onCancel} className="h-auto min-h-12 whitespace-normal px-[24px] py-3 text-base">Zamknij formularz</Button>}
    </div>
    {feedback && <StatusMessage error={feedback.error}>{feedback.message}</StatusMessage>}
    {pending && <p role="status">Czekamy na potwierdzenie zapisu. Nie zamykaj formularza.</p>}
  </form>;
}

function PublishAction({ item, onPublished }: { item: AdminInnovation; onPublished: (record: AdminInnovation) => void }) {
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  // Ponowne wywołanie efektu (StrictMode) musi przywrócić flagę, inaczej zapis nie zaktualizuje widoku.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);

  async function publish() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setFeedback(null);
    try {
      const result = await createKnowledgeAdminService().publish(item.id, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (result.confirmed) {
        setAsking(false);
        setFeedback({ message: "Publikacja potwierdzona ponownym odczytem: status „sprawdzone”.", error: false });
        onPublished(result.record);
      } else setFeedback({ message: `Publikacja nie została potwierdzona. ${result.note}`, error: true });
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setFeedback({ message: knowledgeAdminMessage(error), error: true });
    } finally {
      if (request.current === controller) request.current = null;
      if (mounted.current) setPending(false);
    }
  }

  if (item.status === PUBLISHED_STATUS && !feedback) {
    return <p className="text-sm text-muted-foreground">Status „sprawdzone” jest już ustawiony.</p>;
  }
  return <div className="space-y-3">
    {!asking
      ? <Button variant="outline" onClick={() => { setAsking(true); setFeedback(null); }} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Opublikuj jako sprawdzone</Button>
      : <div role="group" aria-labelledby={`publish-ask-${item.id}`} className="space-y-3 rounded-xl border border-border bg-secondary p-[16px]">
          <p id={`publish-ask-${item.id}`} className="text-sm leading-relaxed">Potwierdź publikację „{item.title}”. Operacja ustawia status „sprawdzone” w bazie wiedzy ROPS. Nie zmienia pozostałych pól i nie usuwa innych wpisów z publicznego katalogu.</p>
          <div className="flex flex-wrap gap-3">
            <Button disabled={pending} onClick={() => void publish()} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">{pending ? "Publikujemy…" : "Potwierdź publikację"}</Button>
            <Button variant="outline" disabled={pending} onClick={() => setAsking(false)} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Anuluj</Button>
          </div>
        </div>}
    {feedback && <StatusMessage error={feedback.error}>{feedback.message}</StatusMessage>}
  </div>;
}

function AdminPanelBody() {
  const [statusFilter, setStatusFilter] = useState("");
  const { state, previous, refresh } = useAdminList(statusFilter);
  const rows = state.phase === "ready" ? state.items : previous;
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const onCreated = useCallback((result: SaveResult) => {
    if (result.confirmed) { setNotice(`Dodano innowację „${result.record.title}” (identyfikator: ${result.record.id}).`); setCreating(false); }
    refresh();
  }, [refresh]);

  return <div className="space-y-8">
    <StatusMessage>{VISIBILITY_NOTE}</StatusMessage>
    <section aria-labelledby="knowledge-admin-add" className="space-y-4">
      <h2 id="knowledge-admin-add" className="text-xl font-semibold">Dodaj innowację</h2>
      {!creating
        ? <Button onClick={() => { setCreating(true); setNotice(""); }} className="h-auto min-h-12 whitespace-normal px-[24px] py-3 text-base">Dodaj nową innowację</Button>
        : <InnovationForm heading="Nowa innowacja w bazie wiedzy" initial={emptyDraft()} submitLabel="Zapisz nową innowację"
            onCancel={() => setCreating(false)}
            onSave={async (draft, signal) => {
              const result = await createKnowledgeAdminService().create(draft, signal);
              onCreated(result);
              return result;
            }} />}
    </section>

    {notice && <StatusMessage>{notice}</StatusMessage>}

    <section aria-labelledby="knowledge-admin-list" className="space-y-5">
      <h2 id="knowledge-admin-list" className="text-xl font-semibold">Innowacje w bazie wiedzy</h2>
      <div className="max-w-sm space-y-2">
        <label htmlFor="knowledge-status-filter" className="block font-semibold">Filtruj według statusu</label>
        <select id="knowledge-status-filter" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setEditing(null); }}
          aria-describedby="knowledge-status-filter-hint" className="min-h-12 w-full rounded-lg border border-input bg-card px-[12px] py-3 text-base">
          <option value="">Wszystkie statusy</option>
          {KNOWLEDGE_STATUSES.map((value) => <option key={value} value={value}>{KNOWLEDGE_STATUS_LABELS[value]}</option>)}
        </select>
        <p id="knowledge-status-filter-hint" className="text-sm text-muted-foreground">Filtr działa na serwerze. Lista pokazuje pierwszą stronę wyników.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={refresh} disabled={state.phase === "loading"} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">{state.phase === "loading" ? "Odczytujemy…" : "Odśwież listę"}</Button>
      </div>
      <p role="status" aria-atomic="true" className="text-sm text-muted-foreground">
        {state.phase === "loading"
          ? previous ? "Odczytujemy listę ponownie. Do czasu potwierdzenia pokazujemy poprzedni odczyt." : "Odczytujemy listę innowacji…"
          : state.phase === "ready" ? `Pozycje w tym widoku: ${state.items.length}.` : ""}
      </p>
      {state.phase === "error" && <div className="space-y-3"><StatusMessage error>{state.message}</StatusMessage>
        <Button variant="outline" onClick={refresh} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Ponów odczyt listy</Button></div>}
      {state.phase === "loading" && !previous && <LoadingMessage>Wczytujemy innowacje…</LoadingMessage>}
      {rows !== null && (!rows.length
        ? <StatusMessage>{statusFilter ? "Brak innowacji o wybranym statusie." : "Baza wiedzy jest obecnie pusta."}</StatusMessage>
        : <ul className="space-y-4">{rows.map((item) => <li key={item.id} className="space-y-4 rounded-2xl border border-border bg-card p-[24px]">
            <div className="space-y-2">
              <h3 className="text-xl font-semibold leading-snug">{item.title}</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="h-auto min-h-7 max-w-full whitespace-normal">{item.category || "Kategoria nie została podana"}</Badge>
                <Badge variant={item.status === PUBLISHED_STATUS ? "default" : "outline"} className="h-auto min-h-7 max-w-full whitespace-normal">{statusLabel(item.status)}</Badge>
              </div>
              <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{item.description || "Opis nie został podany."}</p>
              <p className="leading-relaxed"><span className="font-semibold">Odbiorcy: </span>{item.target_group || "Nie podano."}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" aria-expanded={editing === item.id} onClick={() => { setEditing(editing === item.id ? null : item.id); setNotice(""); }}
                className="h-auto min-h-11 whitespace-normal px-[16px] py-2">{editing === item.id ? "Zamknij edycję" : "Edytuj"}</Button>
              <PublishAction item={item} onPublished={(record) => { setNotice(`Opublikowano „${record.title}” ze statusem „${PUBLISHED_STATUS}”.`); refresh(); }} />
            </div>
            {editing === item.id && <InnovationForm key={item.id} heading={`Edycja: ${item.title}`} initial={draftFromRecord(item)} submitLabel="Zapisz zmiany"
              onCancel={() => setEditing(null)}
              onSave={async (draft, signal) => {
                const result = await createKnowledgeAdminService().update(item.id, draft, signal);
                if (result.confirmed) {
                  setNotice(`Zapisano zmiany w „${result.record.title}” (identyfikator: ${result.record.id}). Zapis potwierdzony ponownym odczytem.`);
                  refresh();
                }
                return result;
              }} />}
          </li>)}</ul>)}
    </section>
  </div>;
}

function AuthorizedPanel() {
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;
  let authorized = false;
  try { authorized = state.user.is_anonymous !== true && roleFromVerifiedUser(state.user) === "rops_admin"; }
  catch { /* Nieznana rola nie uprawnia do montowania prywatnego panelu. */ }
  if (!authorized) return <StatusMessage error>To konto nie ma potwierdzonych uprawnień pracownika ROPS.</StatusMessage>;
  const key = `${state.user.id}:${String(state.user.app_metadata?.hubmi_role)}`;
  return <><AdminPanelBody key={key} /><ResourcesAdminSection key={`resources:${key}`} /></>;
}

export function KnowledgeAdminPanel() {
  return <div className="space-y-5">
    <Link href="/rops" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Wróć do panelu ROPS</Link>
    <AuthGate><AuthorizedPanel /></AuthGate>
  </div>;
}

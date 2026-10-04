"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { backendCallMessage } from "@/features/rops/backend-session";
import { useBackendQuery } from "@/features/rops/use-backend-query";
import { formatDate } from "@/features/submissions/model";
import {
  COVERAGE_SCOPES, PUBLISHED, RESOURCE_FIELD_ORDER, RESOURCE_GROUPS_META, RESOURCE_KINDS, RESOURCE_STATUS_LABELS,
  draftFromResource, emptyResourceDraft, groupTitle, label, validateResource,
  type Resource, type ResourceDraft, type ResourceErrors,
} from "./resource-model";
import { createResourceAdminService } from "./resource-service";

const SELECT = "min-h-12 w-full rounded-lg border border-input bg-background px-[12px] py-3 text-base aria-invalid:border-destructive";
const AREA = "block w-full resize-y rounded-lg border border-input bg-background p-[12px] text-base leading-relaxed aria-invalid:border-destructive";
const INPUT = "h-auto min-h-12 py-3 text-base md:text-base";
const BTN = "h-auto min-h-11 max-w-full whitespace-normal px-[16px] py-2";

/** Jedna operacja naraz: blokada podwójnego wysłania i przerwanie przy odmontowaniu. */
function useAction() {
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState("");
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function run(name: string, task: (signal: AbortSignal) => Promise<string>) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller; setPending(name); setFeedback(null);
    try {
      const message = await task(controller.signal);
      if (!controller.signal.aborted) setFeedback({ error: false, message });
    } catch (error) {
      if (!controller.signal.aborted) setFeedback({ error: true, message: backendCallMessage(error) });
    } finally {
      if (request.current === controller) { request.current = null; setPending(""); }
    }
  }
  return { pending, feedback, setFeedback, run };
}

function ResourceForm({ prefix, initial, submitLabel, onSave }: { prefix: string; initial: ResourceDraft; submitLabel: string; onSave: (d: ResourceDraft, signal: AbortSignal) => Promise<string> }) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<ResourceErrors>({});
  const action = useAction();
  const id = (k: keyof ResourceDraft) => `${prefix}-${k}`;
  const bind = (k: keyof ResourceDraft, hint = false) => ({
    id: id(k), value: draft[k], "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": [hint ? `${id(k)}-hint` : "", errors[k] ? `${id(k)}-error` : ""].filter(Boolean).join(" ") || undefined,
    onChange: (e: { target: { value: string } }) => { const v = e.target.value; setDraft((d) => ({ ...d, [k]: v })); setErrors((x) => ({ ...x, [k]: undefined })); action.setFeedback(null); },
  });
  const field = (k: keyof ResourceDraft, text: string, control: ReactNode, hint?: string) => <div className="min-w-0 space-y-2">
    <label htmlFor={id(k)} className="block font-semibold">{text}{k === "caveat" ? <span className="font-normal text-muted-foreground"> (opcjonalnie)</span> : ""}</label>
    {hint && <p id={`${id(k)}-hint`} className="text-sm leading-relaxed text-muted-foreground">{hint}</p>}
    {control}
    {errors[k] && <p id={`${id(k)}-error`} className="text-sm text-red-900">{errors[k]}</p>}
  </div>;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const v = validateResource(draft); setErrors(v);
    const first = RESOURCE_FIELD_ORDER.find((k) => v[k]);
    if (first) { document.getElementById(id(first))?.focus(); return; }
    void action.run("save", (signal) => onSave(draft, signal));
  }
  return <form onSubmit={submit} noValidate aria-busy={action.pending !== ""} className="space-y-5">
    <fieldset disabled={action.pending !== ""} className="min-w-0 space-y-5">
      <legend className="sr-only">{submitLabel}</legend>
      {field("title", "Tytuł", <Input {...bind("title")} maxLength={300} className={INPUT} />)}
      {field("description", "Opis", <textarea {...bind("description", true)} rows={4} maxLength={10000} className={AREA} />, "Co zawiera materiał — wyłącznie na podstawie samego źródła. Nie dopisuj liczb, których źródło nie podaje.")}
      <div className="grid gap-5 sm:grid-cols-2">
        {field("group_id", "Grupa", <select {...bind("group_id")} className={SELECT}>{RESOURCE_GROUPS_META.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>)}
        {field("kind", "Rodzaj", <select {...bind("kind")} className={SELECT}>{RESOURCE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>)}
        {field("year", "Rok danych", <Input {...bind("year", true)} inputMode="numeric" maxLength={4} className={`${INPUT} max-w-[10rem]`} />, "Rok, którego dotyczą dane w źródle.")}
        {field("coverage_scope", "Zasięg danych", <select {...bind("coverage_scope", true)} className={SELECT}><option value="">Wybierz</option>{COVERAGE_SCOPES.map((c) => <option key={c} value={c}>{c}</option>)}</select>, "Dane ogólnopolskie oznacz jako ogólnopolskie — nie są diagnozą Małopolski.")}
      </div>
      {field("url", "Adres źródła", <Input {...bind("url", true)} type="url" inputMode="url" className={INPUT} />, "Pełny adres HTTPS. Dla filmu wystarczy odnośnik do nagrania lub kanału.")}
      {field("caveat", "Zastrzeżenie", <textarea {...bind("caveat", true)} rows={2} maxLength={2000} className={AREA} />, "Ograniczenia zgłaszane przez samo źródło, np. strona w przebudowie. Widoczne publicznie.")}
    </fieldset>
    {action.feedback && <StatusMessage error={action.feedback.error}>{action.feedback.message}</StatusMessage>}
    <Button type="submit" disabled={action.pending !== ""} className={BTN}>{action.pending ? "Zapisujemy…" : submitLabel}</Button>
  </form>;
}

function ResourceItem({ initial }: { initial: Resource }) {
  const [item, setItem] = useState(initial);
  const [editing, setEditing] = useState(false);
  const action = useAction();
  const service = createResourceAdminService;
  const status = (name: string, op: (s: ReturnType<typeof createResourceAdminService>, signal: AbortSignal) => Promise<Resource>, done: string) =>
    action.run(name, async (signal) => { const r = await op(service(), signal); setItem(r); return done; });
  return <li className="min-w-0"><article aria-label={item.title} className="space-y-3 rounded-2xl border border-border bg-card p-[20px]">
    <div className="flex flex-wrap gap-2">
      <Badge variant={item.status === PUBLISHED ? "default" : "outline"} className="h-auto min-h-7 whitespace-normal">{label(RESOURCE_STATUS_LABELS, item.status)}</Badge>
      <Badge variant="secondary" className="h-auto min-h-7 whitespace-normal">{groupTitle(item.group_id)}</Badge>
    </div>
    <h4 className="text-lg font-semibold">{item.title}</h4>
    <p className="text-sm">{item.kind} · rok {item.year ?? "brak"} · zasięg: {item.coverage_scope ?? "brak"}</p>
    <p className="text-sm [overflow-wrap:anywhere]"><a href={item.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline underline-offset-4">{item.url}<span className="sr-only"> (otwiera się w nowej karcie)</span></a></p>
    <p className="text-sm text-muted-foreground">{item.status === PUBLISHED ? "Widoczny publicznie w Zasobniku." : "Niewidoczny publicznie."} Ostatnia zmiana: <time dateTime={item.updated_at}>{formatDate(item.updated_at)}</time></p>
    <div className="flex flex-wrap gap-3">
      <Button type="button" variant="outline" disabled={action.pending !== ""} aria-expanded={editing} onClick={() => setEditing((v) => !v)} className={BTN}>{editing ? "Zamknij edycję" : "Edytuj"}</Button>
      {item.status !== PUBLISHED && item.status !== "zweryfikowany" && <Button type="button" variant="outline" disabled={action.pending !== ""} onClick={() => void status("verify", (s, sig) => s.verify(item.id, sig), "Zasób oznaczono jako zweryfikowany.")} className={BTN}>{action.pending === "verify" ? "Weryfikujemy…" : "Oznacz jako zweryfikowany"}</Button>}
      {item.status !== PUBLISHED && <Button type="button" disabled={action.pending !== ""} onClick={() => void status("publish", (s, sig) => s.publish(item.id, sig), "Opublikowano — zasób jest widoczny w Zasobniku.")} className={BTN}>{action.pending === "publish" ? "Publikujemy…" : "Opublikuj"}</Button>}
      {item.status === PUBLISHED && <Button type="button" variant="outline" disabled={action.pending !== ""} onClick={() => void status("unpublish", (s, sig) => s.unpublish(item.id, sig), "Wycofano publikację — zasób jest szkicem i zniknął z Zasobnika.")} className={BTN}>{action.pending === "unpublish" ? "Wycofujemy…" : "Wycofaj publikację"}</Button>}
    </div>
    {action.feedback && <StatusMessage error={action.feedback.error}>{action.feedback.message}</StatusMessage>}
    {editing && <div className="border-t border-border pt-4">
      <ResourceForm key={item.updated_at} prefix={`edit-${item.id}`} initial={draftFromResource(item)} submitLabel="Zapisz zmiany" onSave={async (d, signal) => {
        const r = await service().update(item.id, d, signal); setItem(r);
        return r.status === PUBLISHED ? "Zapisano i potwierdzono. Zmiany są widoczne publicznie." : "Zapisano i potwierdzono.";
      }} />
    </div>}
  </article></li>;
}

/** Zasoby Zasobnika w istniejącym panelu bazy wiedzy ROPS. */
export function ResourcesAdminSection() {
  const id = useId();
  const [statusFilter, setStatusFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [formKey, setFormKey] = useState(0);
  const load = useCallback((signal: AbortSignal) => createResourceAdminService().list({ status: statusFilter || undefined, group_id: groupFilter || undefined }, signal), [statusFilter, groupFilter]);
  const { state, refresh } = useBackendQuery(`rops-resources:${statusFilter}:${groupFilter}`, load);
  return <section aria-labelledby={`${id}-h`} className="space-y-8 border-t border-border pt-10">
    <div className="max-w-3xl space-y-2">
      <h2 id={`${id}-h`} className="text-2xl font-semibold">Zasoby Zasobnika Wiedzy</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">Raporty, diagnozy, materiały edukacyjne i odnośniki do nagrań. Nowy zasób jest szkicem — publicznie pojawia się dopiero po publikacji.</p>
    </div>
    <section aria-labelledby={`${id}-add`} className="space-y-4 rounded-2xl border border-border bg-card p-[24px]">
      <h3 id={`${id}-add`} className="text-xl font-semibold">Dodaj zasób (szkic)</h3>
      <ResourceForm key={formKey} prefix="new-resource" initial={emptyResourceDraft()} submitLabel="Zapisz szkic" onSave={async (d, signal) => {
        const r = await createResourceAdminService().create(d, signal);
        setFormKey((k) => k + 1); refresh();
        return `Zapisano szkic „${r.title}”. Nie jest widoczny publicznie.`;
      }} />
    </section>
    <section aria-labelledby={`${id}-list`} className="space-y-5">
      <h3 id={`${id}-list`} className="text-xl font-semibold">Zasoby w bazie</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2"><label htmlFor={`${id}-st`} className="block font-semibold">Status</label>
          <select id={`${id}-st`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={SELECT}><option value="">Wszystkie</option>{Object.entries(RESOURCE_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="min-w-0 space-y-2"><label htmlFor={`${id}-gr`} className="block font-semibold">Grupa</label>
          <select id={`${id}-gr`} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className={SELECT}><option value="">Wszystkie</option>{RESOURCE_GROUPS_META.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>
      <Button variant="outline" onClick={refresh} className={BTN}>Odśwież listę</Button>
      {state.status === "loading" && <LoadingMessage>Wczytujemy zasoby…</LoadingMessage>}
      {state.status === "error" && <div className="space-y-3"><StatusMessage error>{state.message}</StatusMessage><Button variant="outline" onClick={refresh} className={BTN}>Spróbuj ponownie</Button></div>}
      {state.status === "success" && (state.data.length === 0 ? <StatusMessage>Brak zasobów dla wybranych filtrów.</StatusMessage>
        : <ul className="space-y-4">{state.data.map((r) => <ResourceItem key={`${r.id}:${r.updated_at}`} initial={r} />)}</ul>)}
    </section>
  </section>;
}

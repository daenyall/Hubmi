"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/status-message";
import { STATUS_LABELS } from "@/features/submissions/model";
import { dataMessage } from "@/features/submissions/service";
import { createRopsService } from "./service";
import { validateOfficialResponse, type Review } from "./model";

export function RopsActions({ item, onSaved }: { item: Review; onSaved: (item: Review) => void }) {
  const [status, setStatus] = useState(item.status);
  const [response, setResponse] = useState(item.official_response ?? "");
  const [fieldError, setFieldError] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [pending, setPending] = useState<"status" | "reply" | null>(null);
  const request = useRef<AbortController | null>(null);
  const statusVersion = useRef(item.status);
  const responseVersion = useRef(item.official_response);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  async function save(kind: "status" | "reply", event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (request.current) return;
    if (kind === "reply") { const error = validateOfficialResponse(response); if (error) { setFieldError(error); textarea.current?.focus(); return; } }
    const controller = new AbortController(); request.current = controller;
    setPending(kind); setFeedback(null);
    try {
      const service = createRopsService();
      const saved = kind === "status" ? await service.changeStatus(item.id, status, statusVersion.current, controller.signal)
        : await service.reply(item.id, response, responseVersion.current, controller.signal);
      if (mounted.current && !controller.signal.aborted) {
        if (kind === "status") statusVersion.current = saved.status;
        else responseVersion.current = saved.official_response;
        onSaved(saved);
        setFeedback({ message: kind === "status" ? "Status został zapisany." : "Oficjalna odpowiedź została zapisana i jest dostępna autorowi.", error: false });
      }
    } catch (error) { if (mounted.current && !controller.signal.aborted) setFeedback({ message: dataMessage(error), error: true }); }
    finally { if (request.current === controller) request.current = null; if (mounted.current) setPending(null); }
  }
  return <section aria-labelledby="rops-actions-heading" className="space-y-6 rounded-2xl border border-border bg-card p-[24px]">
    <h2 id="rops-actions-heading" className="text-xl font-semibold">Obsługa zgłoszenia</h2>
    <form onSubmit={(event) => void save("status", event)} className="space-y-3" aria-busy={pending === "status"}>
      <label htmlFor="review-status" className="block font-semibold">Status zgłoszenia</label>
      <select id="review-status" value={status} disabled={!!pending} onChange={(event) => { setStatus(event.target.value); setFeedback(null); }} className="min-h-12 w-full rounded-lg border border-input bg-background px-[12px] py-3 text-base">
        {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <Button type="submit" disabled={!!pending || status === item.status} className="h-auto min-h-12 whitespace-normal px-[24px] py-3 text-base">{pending === "status" ? "Zapisujemy status…" : "Zapisz status"}</Button>
    </form>
    <form onSubmit={(event) => void save("reply", event)} noValidate className="space-y-3 border-t border-border pt-5" aria-busy={pending === "reply"}>
      <label htmlFor="official-response" className="block font-semibold">Oficjalna odpowiedź ROPS (wymagane)</label>
      <p id="official-hint" className="text-sm text-muted-foreground">To stanowisko ROPS widoczne autorowi, odrębne od rozmowy. Maksymalnie 10000 znaków. Zapis zastępuje dotychczasową odpowiedź.</p>
      <textarea ref={textarea} id="official-response" rows={5} required maxLength={10000} value={response} disabled={!!pending} onChange={(event) => { setResponse(event.target.value); setFieldError(""); setFeedback(null); }} aria-invalid={!!fieldError || undefined} aria-describedby={`official-hint${fieldError ? " official-error" : ""}`} className="block w-full resize-y rounded-lg border border-input bg-background p-[16px] text-base leading-relaxed aria-invalid:border-destructive" />
      {fieldError && <p id="official-error" role="alert" className="text-sm text-red-900">{fieldError}</p>}
      <Button type="submit" disabled={!!pending} className="h-auto min-h-12 whitespace-normal px-[24px] py-3 text-base">{pending === "reply" ? "Zapisujemy odpowiedź…" : "Zapisz oficjalną odpowiedź"}</Button>
    </form>
    {feedback && <StatusMessage error={feedback.error}>{feedback.message}</StatusMessage>}
    {pending && <p role="status">Czekamy na potwierdzenie zapisu…</p>}
  </section>;
}

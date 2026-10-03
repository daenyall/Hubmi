"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createRecordId } from "@/lib/uuid";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { useSubmissionQuery } from "@/features/submissions/use-query";
import { dataMessage } from "@/features/submissions/service";
import { formatDate } from "@/features/submissions/model";
import { STAGE3_ENABLED, STAGE3_SETUP, type Viewer } from "@/features/rops/access";
import { Stage3Error } from "@/features/rops/gate";
import { MESSAGE_LIMIT, validateMessage } from "./model";
import { createMessagesService } from "./service";

export function Conversation({ submissionId, viewer, onRefresh }: { submissionId: string; viewer: Viewer; onRefresh?: () => void }) {
  if (!STAGE3_ENABLED) return <section aria-label="Rozmowa z ROPS"><h2 className="mb-3 text-xl font-semibold">Rozmowa z ROPS</h2><StatusMessage>{STAGE3_SETUP}</StatusMessage></section>;
  return <ActiveConversation key={`${viewer}:${submissionId}`} submissionId={submissionId} viewer={viewer} onRefresh={onRefresh} />;
}
function ActiveConversation({ submissionId, viewer, onRefresh }: { submissionId: string; viewer: Viewer; onRefresh?: () => void }) {
  const load = useCallback((signal: AbortSignal) => createMessagesService().list(submissionId, viewer, signal), [submissionId, viewer]);
  const { state, retry } = useSubmissionQuery(`messages:${viewer}:${submissionId}`, load);
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const identity = useRef<{ text: string; id: string } | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  function refresh() { setFeedback(null); retry(); onRefresh?.(); }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const invalid = validateMessage(text);
    if (invalid) { setFieldError(invalid); textarea.current?.focus(); return; }
    if (state.status !== "success") return;
    const controller = new AbortController(); request.current = controller;
    setPending(true); setFeedback(null); setFieldError("");
    try {
      if (identity.current?.text !== text.trim()) identity.current = { text: text.trim(), id: createRecordId() };
      await createMessagesService().send(submissionId, viewer, text, identity.current.id, controller.signal);
      if (mounted.current && !controller.signal.aborted) {
        setText(""); identity.current = null;
        setFeedback({ error: false, message: "Wiadomość została zapisana. Odświeżamy historię rozmowy." }); retry();
      }
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setFeedback({ error: true, message: dataMessage(error) });
    } finally { if (request.current === controller) request.current = null; if (mounted.current) setPending(false); }
  }
  return <section aria-labelledby="conversation-heading" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="conversation-heading" className="text-xl font-semibold">Rozmowa z ROPS</h2>
      <Button variant="outline" disabled={pending || state.status === "loading"} onClick={refresh} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Odśwież rozmowę</Button></div>
    <p className="text-sm text-muted-foreground">Wiadomości w rozmowie służą wyjaśnieniom. Oficjalna odpowiedź ROPS jest pokazana osobno.</p>
    {state.status === "loading" && <LoadingMessage>Wczytujemy historię rozmowy…</LoadingMessage>}
    {state.status === "error" && <Stage3Error message={state.message} retry={refresh} />}
    {state.status === "success" && (state.data.length ? <ol aria-label="Historia rozmowy" className="space-y-4">{state.data.map((message) => <li key={message.id}>
      <Card className="rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px]"><CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-semibold">{message.sender_role === "rops_admin" ? "Pracownik ROPS" : "Autor zgłoszenia"}<span className="block text-sm font-normal text-muted-foreground">{message.sender_name}</span></p><time className="text-sm text-muted-foreground" dateTime={message.created_at}>{formatDate(message.created_at)}</time></div>
        <p className="whitespace-pre-wrap leading-relaxed">{message.message}</p>
      </CardContent></Card>
    </li>)}</ol> : <StatusMessage>Rozmowa jest pusta. Możesz wysłać pierwszą wiadomość.</StatusMessage>)}
    <form onSubmit={send} noValidate className="space-y-3" aria-busy={pending}>
      <label htmlFor="message-body" className="block font-semibold">Treść wiadomości (wymagane)</label>
      <p id="message-hint" className="text-sm text-muted-foreground">Maksymalnie {MESSAGE_LIMIT} znaków.</p>
      <textarea ref={textarea} id="message-body" required rows={4} maxLength={MESSAGE_LIMIT} value={text} disabled={pending} onChange={(event) => { setText(event.target.value); setFieldError(""); setFeedback(null); }} aria-invalid={!!fieldError || undefined} aria-describedby={`message-hint${fieldError ? " message-error" : ""}`} className="block w-full resize-y rounded-lg border border-input bg-card p-[16px] text-base leading-relaxed aria-invalid:border-destructive" />
      {fieldError && <p id="message-error" role="alert" className="text-sm text-red-900">{fieldError}</p>}
      <Button type="submit" disabled={pending || state.status !== "success"} className="h-auto min-h-12 whitespace-normal px-[24px] py-3 text-base">{pending ? "Wysyłamy wiadomość…" : "Wyślij wiadomość"}</Button>
      {state.status !== "success" && <p className="text-sm text-muted-foreground">Wysyłanie będzie dostępne po wczytaniu i potwierdzeniu dostępu do rozmowy.</p>}
    </form>
    {pending && <LoadingMessage>Zapisujemy wiadomość…</LoadingMessage>}
    {feedback && <StatusMessage error={feedback.error}>{feedback.message}</StatusMessage>}
  </section>;
}

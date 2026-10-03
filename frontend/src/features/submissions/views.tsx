"use client";
import Link from "next/link";
import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { useAuth } from "@/features/auth/auth-provider";
import { AuthGate } from "@/features/auth/login-form";
import { createSubmissionsService } from "./service";
import { formatDate, STAGES, STATUS_LABELS } from "./model";
import { useSubmissionQuery } from "./use-query";
import { LinkedInnovation } from "./innovation-picker";

function ErrorView({ message, retry, access = false }: { message: string; retry: () => void; access?: boolean }) {
  const auth = useAuth();
  return <div className="space-y-4">
    {access && <h2 className="text-xl font-semibold">Brak dostępu do zgłoszenia</h2>}
    <StatusMessage error>{message}</StatusMessage>
    <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={retry} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Spróbuj ponownie</Button><Button variant="outline" onClick={() => void auth.refresh()} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Sprawdź sesję</Button></div>
  </div>;
}
function OwnedList() {
  const load = useCallback((signal: AbortSignal) => createSubmissionsService().list(signal), []);
  const { state, retry } = useSubmissionQuery("mine", load);
  if (state.status === "loading") return <LoadingMessage>Wczytujemy Twoje zgłoszenia…</LoadingMessage>;
  if (state.status === "error") return <ErrorView message={state.message} access={state.access} retry={retry} />;
  if (!state.data.length) return <div className="space-y-4"><StatusMessage>Nie masz jeszcze zgłoszeń. Opisz swój pomysł i zapisz pierwszą fiszkę.</StatusMessage><Link href="/kreator" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Zgłoś pierwszy pomysł</Link></div>;
  return <section aria-labelledby="submission-list-heading" className="space-y-5">
    <h2 id="submission-list-heading" className="text-xl font-semibold">Twoje fiszki</h2>
    <ul className="grid gap-4 sm:grid-cols-2">{state.data.map((item) => <li key={item.id} className="min-w-0"><article aria-label={item.title} className="h-full"><Card className="h-full rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px]"><CardContent className="space-y-4">
      <h3 className="text-xl font-semibold"><Link href={`/moje-zgloszenia/${item.id}`} className="rounded-sm text-primary underline underline-offset-4">{item.title}</Link></h3>
      <p className="text-sm text-muted-foreground">Zgłoszono: <time dateTime={item.created_at}>{formatDate(item.created_at)}</time></p>
      <Badge variant="secondary" className="h-auto min-h-7 whitespace-normal">{STATUS_LABELS[item.status] ?? "Status nieznany"}</Badge>
    </CardContent></Card></article></li>)}</ul>
    <Button variant="outline" onClick={retry} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Odśwież zgłoszenia</Button>
  </section>;
}
export function MySubmissions() { return <AuthGate><OwnedList /></AuthGate>; }

function OwnedDetail({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => createSubmissionsService().get(id, signal), [id]);
  const { state, retry } = useSubmissionQuery(id, load);
  if (state.status === "loading") return <LoadingMessage>Wczytujemy fiszkę…</LoadingMessage>;
  if (state.status === "error") return <ErrorView message={state.message} access={state.access} retry={retry} />;
  const item = state.data;
  return <article aria-labelledby="submission-title" className="space-y-6">
    <Card className="rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px] sm:[--card-spacing:32px]"><CardContent className="space-y-6">
      <div className="space-y-3"><h2 id="submission-title" className="text-2xl font-semibold">{item.title}</h2><Badge variant="secondary" className="h-auto min-h-7 whitespace-normal">{STATUS_LABELS[item.status] ?? "Status nieznany"}</Badge><p className="text-sm text-muted-foreground">Zgłoszono: <time dateTime={item.created_at}>{formatDate(item.created_at)}</time></p></div>
      {[["Problem lub potrzeba", item.problem_description], ["Istota rozwiązania", item.solution_description], ["Odbiorcy", item.target_group]].map(([label, text]) => <section key={label} className="space-y-2"><h3 className="text-lg font-semibold">{label}</h3><p className="whitespace-pre-wrap text-base leading-relaxed">{text}</p></section>)}
      <dl className="grid gap-5 sm:grid-cols-2"><div><dt className="font-semibold">Etap realizacji</dt><dd className="mt-1">{STAGES[item.implementation_stage]}</dd></div>{item.institution_name && <div><dt className="font-semibold">Instytucja</dt><dd className="mt-1">{item.institution_name}</dd></div>}<div><dt className="font-semibold">Typ zgłaszającego</dt><dd className="mt-1">{item.applicant_type}</dd></div></dl>
      {item.matched_innovation_id && <section className="space-y-3"><h3 className="text-lg font-semibold">Powiązana innowacja</h3><LinkedInnovation id={item.matched_innovation_id} /></section>}
    </CardContent></Card>
  </article>;
}
export function SubmissionDetails({ id }: { id: string }) {
  return <div className="space-y-6"><Link href="/moje-zgloszenia" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Wróć do moich zgłoszeń</Link><AuthGate><OwnedDetail id={id} /></AuthGate></div>;
}

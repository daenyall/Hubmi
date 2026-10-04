"use client";
import Link from "next/link";
import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { useAuth } from "@/features/auth/auth-provider";
import { formatDate } from "@/features/submissions/model";
import { useBackendQuery } from "@/features/rops/use-backend-query";
import { NEED_STATUS_LABELS, label, powiatLabel } from "./model";
import { createNeedsService } from "./service";

function List({ userId }: { userId: string }) {
  const load = useCallback((signal: AbortSignal) => createNeedsService().mine(signal), []);
  const { state, refresh } = useBackendQuery(`my-needs:${userId}`, load);
  if (state.status === "loading") return <LoadingMessage>Wczytujemy zgłoszone potrzeby…</LoadingMessage>;
  if (state.status === "error") return <div className="space-y-3"><StatusMessage error>{state.message}</StatusMessage>
    <Button variant="outline" onClick={refresh} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Spróbuj ponownie</Button></div>;
  if (!state.data.length) return <StatusMessage>Nie zgłaszałeś jeszcze potrzeb z tego konta. <Link href="/zglos-potrzebe" className="font-semibold underline underline-offset-4">Zgłoś potrzebę</Link>.</StatusMessage>;
  return <ul className="grid gap-4 sm:grid-cols-2">{state.data.map((need) => <li key={need.id} className="min-w-0">
    <article aria-label={need.problem_summary} className="h-full space-y-3 rounded-2xl border border-border bg-card p-[20px]">
      <h3 className="text-lg font-semibold">{need.problem_summary}</h3>
      <p className="text-sm text-muted-foreground">{need.category} · {powiatLabel(need.powiat)} · zgłoszono <time dateTime={need.created_at}>{formatDate(need.created_at)}</time></p>
      <Badge variant="secondary" className="h-auto min-h-7 whitespace-normal">{label(NEED_STATUS_LABELS, need.status)}</Badge>
    </article></li>)}</ul>;
}

/** Potrzeby to osobny rodzaj zgłoszenia niż fiszka pomysłu — osobna sekcja i osobne źródło (FastAPI). */
export function MyNeeds() {
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;
  return <section aria-labelledby="my-needs-heading" className="space-y-5 border-t border-border pt-8">
    <h2 id="my-needs-heading" className="text-xl font-semibold">Zgłoszone potrzeby</h2>
    <p className="text-sm leading-relaxed text-muted-foreground">Problemy zgłoszone bez propozycji rozwiązania. Widzisz tu status nadany przez ROPS; notatki wewnętrzne ROPS nie są pokazywane.</p>
    <List userId={state.user.id} />
  </section>;
}

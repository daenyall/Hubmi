"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { useAuth } from "@/features/auth/auth-provider";
import { backendCallMessage } from "@/features/rops/backend-session";
import { useBackendQuery } from "@/features/rops/use-backend-query";
import { formatDate } from "@/features/submissions/model";
import { APPLICATION_STATUS_LABELS, CALL_STATUS_LABELS, SUPPORTED_TEMPLATE_VERSION, formatPln, label, type GrantCall } from "./model";
import { createGrantService } from "./service";
import { CallStatusNotice } from "./preview";

const LINK = "inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4";

function StartButton({ call }: { call: GrantCall }) {
  const auth = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  if (call.status === "zamkniety") return <p className="text-sm text-muted-foreground">Nabór zamknięty — nie można rozpocząć wniosku.</p>;
  if (call.template_version !== SUPPORTED_TEMPLATE_VERSION) return <StatusMessage error>Ten nabór używa wzoru w wersji {call.template_version}, a formularz HubMI obsługuje wersję {SUPPORTED_TEMPLATE_VERSION}. Rozpoczęcie wniosku jest zablokowane do aktualizacji formularza.</StatusMessage>;
  if (auth.state.status !== "authenticated") return <p className="text-sm"><Link href="/logowanie" className="font-semibold text-primary underline underline-offset-4">Zaloguj się</Link>, aby rozpocząć wniosek. Wniosek zapisuje się na Twoim koncie.</p>;
  async function start() {
    if (active.current) return;
    active.current = true; setPending(true); setError("");
    try {
      const app = await createGrantService().create(call.id);
      router.push(`/wnioski/${app.id}`);
    } catch (e) { setError(backendCallMessage(e)); active.current = false; setPending(false); }
  }
  return <div className="space-y-2">
    <Button onClick={() => void start()} disabled={pending} className="h-auto min-h-12 max-w-full whitespace-normal px-[24px] py-3 text-base">{pending ? "Tworzymy wersję roboczą…" : "Rozpocznij wniosek"}</Button>
    {error && <StatusMessage error>{error}</StatusMessage>}
  </div>;
}

function MyApplications({ userId }: { userId: string }) {
  const load = useCallback((signal: AbortSignal) => createGrantService().mine(signal), []);
  const { state, refresh } = useBackendQuery(`grants-mine:${userId}`, load);
  if (state.status === "loading") return <LoadingMessage>Wczytujemy Twoje wnioski…</LoadingMessage>;
  if (state.status === "error") return <div className="space-y-3"><StatusMessage error>{state.message}</StatusMessage><Button variant="outline" onClick={refresh} className="h-auto min-h-11 px-[16px]">Spróbuj ponownie</Button></div>;
  if (!state.data.length) return <StatusMessage>Nie masz jeszcze wniosków w naborach.</StatusMessage>;
  return <ul className="grid gap-4 sm:grid-cols-2">{state.data.map((a) => <li key={a.id} className="min-w-0">
    <article aria-label={a.title || "Wniosek bez tytułu"} className="h-full space-y-2 rounded-2xl border border-border bg-card p-[20px]">
      <h3 className="text-lg font-semibold"><Link href={`/wnioski/${a.id}`} className="rounded-sm text-primary underline underline-offset-4">{a.title || "Wniosek bez tytułu"}</Link></h3>
      <p className="text-sm text-muted-foreground">{a.call_name ?? "Nabór"} · {label(CALL_STATUS_LABELS, a.call_status ?? "")}</p>
      <Badge variant="secondary" className="h-auto min-h-7 whitespace-normal">{label(APPLICATION_STATUS_LABELS, a.status)}</Badge>
      {a.updated_at && <p className="text-sm text-muted-foreground">Ostatnia zmiana: <time dateTime={a.updated_at}>{formatDate(a.updated_at)}</time></p>}
    </article></li>)}</ul>;
}

export function GrantCallsView() {
  const auth = useAuth();
  const load = useCallback((signal: AbortSignal) => createGrantService().calls(signal), []);
  const { state, refresh } = useBackendQuery("grant-calls", load);
  return <div className="space-y-10">
    <StatusMessage>Wniosek w naborze to pełny formularz według wzoru ROPS (Załącznik nr 3), z kosztorysem i oświadczeniami. Różni się od <Link href="/kreator" className="font-semibold underline underline-offset-4">fiszki pomysłu</Link>, która jest krótkim opisem idei i nie jest wnioskiem grantowym.</StatusMessage>
    <section aria-labelledby="calls-h" className="space-y-5">
      <h2 id="calls-h" className="text-2xl font-semibold">Nabory</h2>
      {state.status === "loading" && <LoadingMessage>Wczytujemy nabory…</LoadingMessage>}
      {state.status === "error" && <div className="space-y-3"><StatusMessage error>{state.message}</StatusMessage><Button variant="outline" onClick={refresh} className="h-auto min-h-11 px-[16px]">Spróbuj ponownie</Button></div>}
      {state.status === "success" && (state.data.length === 0 ? <StatusMessage>Brak naborów.</StatusMessage> : <ul className="space-y-5">{state.data.map((c) => <li key={c.id}>
        <article aria-labelledby={`call-${c.id}`} className="space-y-4 rounded-2xl border border-border bg-card p-[24px]">
          <div className="flex flex-wrap items-center gap-2"><Badge variant={c.status === "otwarty" ? "default" : "outline"} className="h-auto min-h-7 whitespace-normal">{label(CALL_STATUS_LABELS, c.status)}</Badge></div>
          <h3 id={`call-${c.id}`} className="text-xl font-semibold">{c.name}</h3>
          {c.description && <p className="leading-relaxed text-muted-foreground">{c.description}</p>}
          <dl className="grid gap-3 text-sm sm:grid-cols-3 [&>div]:min-w-0">
            <div><dt className="font-semibold">Maksymalna kwota grantu</dt><dd>{formatPln(c.max_grant_amount)}</dd></div>
            <div><dt className="font-semibold">Okres przygotowawczy</dt><dd>do {c.max_prep_months} mies.</dd></div>
            <div><dt className="font-semibold">Okres testowania</dt><dd>do {c.max_test_months} mies.</dd></div>
            <div className="sm:col-span-3"><dt className="font-semibold">Wzór formularza</dt><dd className="[overflow-wrap:anywhere]">{c.template_name}, wersja {c.template_version}</dd></div>
          </dl>
          <CallStatusNotice status={c.status} />
          <StartButton call={c} />
        </article></li>)}</ul>)}
    </section>
    {auth.state.status === "authenticated" && <section aria-labelledby="my-grants-h" className="space-y-5">
      <h2 id="my-grants-h" className="text-2xl font-semibold">Twoje wnioski</h2>
      <MyApplications userId={auth.state.user.id} />
    </section>}
    <p className="text-sm text-muted-foreground">Szukasz krótszej formy? <Link href="/kreator" className={LINK}>Zgłoś pomysł w fiszce</Link></p>
  </div>;
}

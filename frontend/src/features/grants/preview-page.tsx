"use client";
import Link from "next/link";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { AuthGate } from "@/features/auth/login-form";
import { RopsBackendGate } from "@/features/rops/backend-gate";
import { useBackendQuery } from "@/features/rops/use-backend-query";
import { createGrantService } from "./service";
import { GrantPreview } from "./preview";

const LINK = "inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4 print:hidden";

function Loaded({ id, mode }: { id: string; mode: "user" | "rops" }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const service = createGrantService();
    const exp = await service.exportDoc(id, mode, signal);
    const call = await service.call(exp.application.call_id, signal);
    return { exp, call };
  }, [id, mode]);
  const { state, refresh } = useBackendQuery(`grant-export:${mode}:${id}`, load);
  if (state.status === "loading") return <LoadingMessage>Wczytujemy podgląd wniosku…</LoadingMessage>;
  if (state.status === "error") return <div className="space-y-3"><StatusMessage error>{state.message}</StatusMessage>{!state.access && <Button variant="outline" onClick={refresh} className="h-auto min-h-11 px-[16px]">Spróbuj ponownie</Button>}</div>;
  const { exp, call } = state.data;
  return <GrantPreview exp={exp} callStatus={call.status} maxPrep={call.max_prep_months} maxTest={call.max_test_months} />;
}

export function GrantPreviewPage({ id }: { id: string }) {
  return <div className="space-y-5">
    <Link href={`/wnioski/${id}`} className={LINK}>Wróć do wniosku</Link>
    <p className="text-sm text-muted-foreground print:hidden">Podgląd pokazuje ostatnią zapisaną wersję. Niezapisane zmiany z formularza nie są tu widoczne.</p>
    <AuthGate><Loaded id={id} mode="user" /></AuthGate>
  </div>;
}

export function RopsGrantPreviewPage({ id }: { id: string }) {
  return <div className="space-y-5">
    <Link href="/rops/wnioski" className={LINK}>Wróć do listy wniosków</Link>
    <RopsBackendGate><Loaded id={id} mode="rops" /></RopsBackendGate>
  </div>;
}

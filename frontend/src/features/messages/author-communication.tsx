"use client";
import { useCallback } from "react";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { useSubmissionQuery } from "@/features/submissions/use-query";
import { createRopsService } from "@/features/rops/service";
import { Stage3Error } from "@/features/rops/gate";
import { STAGE3_ENABLED, STAGE3_SETUP } from "@/features/rops/access";
import { Conversation } from "./conversation";

export function AuthorCommunication({ submissionId }: { submissionId: string }) {
  if (!STAGE3_ENABLED) return <section aria-label="Komunikacja z ROPS" className="space-y-3"><h2 className="text-xl font-semibold">Komunikacja z ROPS</h2><StatusMessage>{STAGE3_SETUP}</StatusMessage></section>;
  return <AvailableCommunication key={submissionId} submissionId={submissionId} />;
}
function AvailableCommunication({ submissionId }: { submissionId: string }) {
  const load = useCallback((signal: AbortSignal) => createRopsService().ownResponse(submissionId, signal), [submissionId]);
  const { state, retry } = useSubmissionQuery(`official:${submissionId}`, load);
  return <div className="space-y-8">
    <section aria-labelledby="author-official-heading" className="space-y-3"><h2 id="author-official-heading" className="text-xl font-semibold">Oficjalna odpowiedź ROPS</h2>
      {state.status === "loading" && <LoadingMessage>Wczytujemy oficjalną odpowiedź…</LoadingMessage>}
      {state.status === "error" && <Stage3Error message={state.message} retry={retry} />}
      {state.status === "success" && (state.data?.trim() ? <blockquote className="whitespace-pre-wrap rounded-xl border border-border bg-secondary p-[24px] leading-relaxed">{state.data}</blockquote> : <p className="text-muted-foreground">ROPS nie opublikował jeszcze oficjalnej odpowiedzi.</p>)}
    </section>
    <Conversation submissionId={submissionId} viewer="author" onRefresh={retry} />
  </div>;
}

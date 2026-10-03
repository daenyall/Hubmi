"use client";
import { useCallback, type ReactNode } from "react";
import { AuthGate } from "@/features/auth/login-form";
import { useAuth } from "@/features/auth/auth-provider";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { Button } from "@/components/ui/button";
import { useSubmissionQuery } from "@/features/submissions/use-query";
import { createRopsService } from "./service";
import { STAGE3_ENABLED, STAGE3_SETUP } from "./access";

export function Stage3Error({ message, retry }: { message: string; retry: () => void }) {
  const auth = useAuth();
  return <div className="space-y-4"><StatusMessage error>{message}</StatusMessage><div className="flex flex-wrap gap-3">
    <Button variant="outline" onClick={retry} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Spróbuj ponownie</Button>
    <Button variant="outline" onClick={() => void auth.refresh()} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Sprawdź sesję</Button>
  </div></div>;
}
function VerifiedRops({ children }: { children: ReactNode }) {
  const load = useCallback((signal: AbortSignal) => createRopsService().verify(signal), []);
  const { state, retry } = useSubmissionQuery("rops-access", load);
  if (state.status === "loading") return <LoadingMessage>Potwierdzamy uprawnienia pracownika ROPS…</LoadingMessage>;
  if (state.status === "error") return <Stage3Error message={state.message} retry={retry} />;
  return children;
}
function RopsIdentity({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;
  return <VerifiedRops key={`${state.user.id}:${String(state.user.app_metadata?.hubmi_role)}`}>{children}</VerifiedRops>;
}
export function RopsGate({ children }: { children: ReactNode }) {
  if (!STAGE3_ENABLED) return <StatusMessage>{STAGE3_SETUP} Prywatne zgłoszenia nie są wyświetlane.</StatusMessage>;
  return <AuthGate><RopsIdentity>{children}</RopsIdentity></AuthGate>;
}

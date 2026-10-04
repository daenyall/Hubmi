"use client";
import { useCallback, type ReactNode } from "react";
import { LoadingMessage, StatusMessage } from "@/components/status-message";
import { Button } from "@/components/ui/button";
import { AuthGate } from "@/features/auth/login-form";
import { useAuth } from "@/features/auth/auth-provider";
import { createBackendSession } from "./backend-session";
import { useBackendQuery } from "./use-backend-query";

function Verified({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const load = useCallback((signal: AbortSignal) => createBackendSession().verifyRops(signal), []);
  const { state, refresh } = useBackendQuery("rops-verify", load);
  if (state.status === "loading") return <LoadingMessage>Potwierdzamy uprawnienia pracownika ROPS…</LoadingMessage>;
  if (state.status === "error") return <div className="space-y-3"><StatusMessage error>{state.message}</StatusMessage>
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={refresh} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Spróbuj ponownie</Button>
      <Button variant="outline" onClick={() => void auth.refresh()} className="h-auto min-h-11 whitespace-normal px-[16px] py-2">Sprawdź sesję</Button>
    </div></div>;
  return children;
}

/** Panel ROPS korzystający z FastAPI: logowanie, potwierdzenie roli, potem treść. */
export function RopsBackendGate({ children }: { children: ReactNode }) {
  return <AuthGate><Verified>{children}</Verified></AuthGate>;
}

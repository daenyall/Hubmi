"use client";
import { useCallback, useEffect, useState } from "react";
import { BackendCallError, backendCallMessage } from "./backend-session";

type State<T> =
  | { key: string; status: "loading" }
  | { key: string; status: "success"; data: T }
  | { key: string; status: "error"; message: string; access: boolean };

/** Odczyt z kluczem: widok nie pokaże danych innego filtra ani starszej próby. */
export function useBackendQuery<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const fullKey = `${key}#${attempt}`;
  const [state, setState] = useState<State<T>>({ key: fullKey, status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => load(controller.signal)).then((data) => {
      if (!controller.signal.aborted) setState({ key: fullKey, status: "success", data });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({
        key: fullKey, status: "error", message: backendCallMessage(error),
        access: error instanceof BackendCallError && (error.kind === "access" || error.kind === "auth"),
      });
    });
    return () => controller.abort();
  }, [fullKey, load]);
  const current: State<T> = state.key === fullKey ? state : { key: fullKey, status: "loading" };
  return { state: current, refresh: useCallback(() => setAttempt((n) => n + 1), []) };
}

"use client";
import { useEffect, useState } from "react";
import { dataMessage, SubmissionError } from "./service";

type State<T> = { key: string; status: "loading" } | { key: string; status: "success"; data: T } | { key: string; status: "error"; message: string; access: boolean };
export function useSubmissionQuery<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<State<T>>({ key, status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => load(controller.signal)).then((data) => {
      if (!controller.signal.aborted) setState({ key, status: "success", data });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ key, status: "error", message: dataMessage(error), access: error instanceof SubmissionError && ["access", "not_found"].includes(error.kind) });
    });
    return () => controller.abort();
  }, [key, load, attempt]);
  return { state: state.key === key ? state : { key, status: "loading" } as State<T>, retry: () => { setState({ key, status: "loading" }); setAttempt((n) => n + 1); } };
}

"use client";
import { useEffect, useRef, useState } from "react";
import { dataMessage, SubmissionError } from "../submissions/service";
import { createListMonitor, initialListSnapshot } from "./list-monitor";
import type { Review } from "./model";

export function useLiveRopsList(load: (signal: AbortSignal) => Promise<Review[]>) {
  const [state, setState] = useState(() => initialListSnapshot<Review>());
  const monitor = useRef<ReturnType<typeof createListMonitor<Review>> | null>(null);
  useEffect(() => {
    const active = createListMonitor({
      load, publish: setState,
      isVisible: () => document.visibilityState !== "hidden",
      describeError: (error) => ({
        message: dataMessage(error),
        terminal: error instanceof SubmissionError && ["auth", "access", "configuration", "schema"].includes(error.kind),
      }),
    });
    monitor.current = active;
    void active.refresh();
    return () => { active.stop(); if (monitor.current === active) monitor.current = null; };
  }, [load]);
  return { state, refresh: () => { void monitor.current?.refresh(); } };
}

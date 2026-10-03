import type { ReactNode } from "react";

export function StatusMessage({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div role={error ? "alert" : "status"} className={`rounded-xl border p-[16px] text-sm leading-relaxed ${error ? "border-red-300 bg-red-50 text-red-900" : "border-border bg-secondary text-foreground"}`}>{children}</div>;
}
export function LoadingMessage({ children = "Wczytujemy dane…" }: { children?: ReactNode }) {
  return <p role="status" className="py-6 text-base text-muted-foreground">{children}</p>;
}

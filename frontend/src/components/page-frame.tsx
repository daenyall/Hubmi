import type { ReactNode } from "react";

export function PageFrame({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-[20px] py-10 sm:px-[32px]">
    <div className="max-w-3xl space-y-3">
      <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {description && <p className="text-base leading-relaxed text-muted-foreground">{description}</p>}
    </div>
    {children}
  </main>;
}

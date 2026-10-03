import Link from "next/link";
import { Leaf } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AuthActions } from "@/features/auth/login-form";
import { USE_MOCK_MATCHING } from "@/lib/api";

export function SiteHeader() {
  return <>
    <a href="#main-content" className="sr-only z-50 rounded-lg bg-primary p-4 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4">Przejdź do treści</a>
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-[20px] py-5 sm:px-[32px]">
        <Link href="/" aria-label="HubMI — strona główna" className="flex min-h-11 items-center gap-3 rounded-sm">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Leaf className="size-5" aria-hidden="true" /></span>
          <span className="text-2xl font-bold tracking-tight">Hub<span className="text-primary">MI</span></span>
        </Link>
        <nav aria-label="Nawigacja główna" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium">
          <Link href="/#wyszukaj" className="inline-flex min-h-11 items-center rounded-sm text-primary underline-offset-4 hover:underline">Znajdź rozwiązania</Link>
          <Link href="/kreator" className="inline-flex min-h-11 items-center rounded-sm text-primary underline-offset-4 hover:underline">Zgłoś pomysł</Link>
          <Link href="/moje-zgloszenia" className="inline-flex min-h-11 items-center rounded-sm text-primary underline-offset-4 hover:underline">Moje zgłoszenia</Link>
          <Link href="/rops" className="inline-flex min-h-11 items-center rounded-sm text-primary underline-offset-4 hover:underline">Panel ROPS</Link>
          <AuthActions />
          {USE_MOCK_MATCHING && <Badge variant="outline" className="h-auto min-h-7 whitespace-normal border-amber-300 bg-amber-50 text-amber-950">Dane demonstracyjne</Badge>}
        </nav>
      </div>
    </header>
  </>;
}
export function SiteFooter() {
  return <footer className="border-t border-border px-[20px] py-6 text-sm text-muted-foreground">
    <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-2 sm:px-3"><p>HubMI · Innowacje społeczne</p><p>HackYeah 2026</p></div>
  </footer>;
}

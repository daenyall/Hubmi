import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/page-frame";
import { NeedForm } from "@/features/needs/need-form";
export const metadata: Metadata = { title: "Zgłoś potrzebę — Splot" };
export default function NeedPage() {
  return <PageFrame title="Zgłoś potrzebę" description="Opisz problem społeczny w swojej okolicy. Nie musisz znać rozwiązania — zgłoszenia pomagają ROPS zobaczyć, gdzie i czego brakuje.">
    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">Masz już pomysł, jak problem rozwiązać? Zamiast tego formularza <Link href="/kreator" className="font-semibold text-primary underline underline-offset-4">przygotuj fiszkę pomysłu</Link>.</p>
    <NeedForm />
  </PageFrame>;
}

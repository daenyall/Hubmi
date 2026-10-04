import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/page-frame";
import { RopsList } from "@/features/rops/views";
export const metadata: Metadata = { title: "Panel ROPS — HubMI", robots: { index: false, follow: false } };
export default function RopsPage() {
  return <PageFrame title="Panel ROPS" description="Przeglądaj zgłoszenia, odpowiadaj autorom i prowadź ich weryfikację.">
    <nav aria-label="Sekcje panelu ROPS">
      <ul className="flex flex-wrap gap-x-6 gap-y-1">
        <li><Link href="/rops/innowacje" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Zarządzaj bazą wiedzy — innowacje</Link></li>
        <li><Link href="/rops/potrzeby" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Potrzeby regionu</Link></li>
        <li><Link href="/rops/tester" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Pilotaże i testy innowacji</Link></li>
      </ul>
    </nav>
    <RopsList />
  </PageFrame>;
}

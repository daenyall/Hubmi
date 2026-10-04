import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { TesterRopsPanel } from "@/features/tester/rops-panel";
export const metadata: Metadata = { title: "Pilotaże — Panel ROPS — Splot", robots: { index: false, follow: false } };
export default function Page() {
  return <PageFrame title="Pilotaże i testy innowacji" description="Zgłoszenia do testowania, ich status i oceny po teście.">
    <TesterRopsPanel />
  </PageFrame>;
}

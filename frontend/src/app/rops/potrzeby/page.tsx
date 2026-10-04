import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { NeedsRopsPanel } from "@/features/needs/rops-panel";
export const metadata: Metadata = { title: "Potrzeby regionu — Panel ROPS — Splot", robots: { index: false, follow: false } };
export default function RopsNeedsPage() {
  return <PageFrame title="Potrzeby regionu" description="Zgłoszone problemy według kategorii, powiatu i okresu oraz ich obsługa.">
    <NeedsRopsPanel />
  </PageFrame>;
}

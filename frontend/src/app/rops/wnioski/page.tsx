import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { GrantsRopsPanel } from "@/features/grants/rops-panel";
export const metadata: Metadata = { title: "Wnioski w naborach — Panel ROPS — HubMI", robots: { index: false, follow: false } };
export default function Page() {
  return <PageFrame title="Wnioski w naborach" description="Odczyt wniosków złożonych przez autorów.">
    <GrantsRopsPanel />
  </PageFrame>;
}

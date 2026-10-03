import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { RopsList } from "@/features/rops/views";
export const metadata: Metadata = { title: "Panel ROPS — HubMI", robots: { index: false, follow: false } };
export default function RopsPage() {
  return <PageFrame title="Panel ROPS" description="Przeglądaj zgłoszenia, odpowiadaj autorom i prowadź ich weryfikację."><RopsList /></PageFrame>;
}

import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { KnowledgeAdminPanel } from "@/features/knowledge/admin-panel";
export const metadata: Metadata = { title: "Baza wiedzy ROPS — HubMI", robots: { index: false, follow: false } };
export default function RopsKnowledgePage() {
  return <PageFrame title="Baza wiedzy ROPS" description="Przeglądaj, dodawaj i edytuj innowacje społeczne oraz nadawaj im status sprawdzony.">
    <KnowledgeAdminPanel />
  </PageFrame>;
}

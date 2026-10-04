import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { KnowledgeAdminPanel } from "@/features/knowledge/admin-panel";
export const metadata: Metadata = { title: "Baza wiedzy ROPS — Splot", robots: { index: false, follow: false } };
export default function RopsKnowledgePage() {
  return <PageFrame title="Baza wiedzy ROPS" description="Przeglądaj, dodawaj, edytuj i publikuj innowacje społeczne oraz zasoby Zasobnika Wiedzy: raporty, materiały edukacyjne i nagrania.">
    <KnowledgeAdminPanel />
  </PageFrame>;
}

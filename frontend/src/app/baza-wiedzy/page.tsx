import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { KnowledgeBrowser } from "@/features/knowledge/browser";
import { KnowledgeResourceSections } from "@/features/knowledge/resource-sections";
import { SocialChallengeSections } from "@/features/knowledge/challenge-sections";
export const metadata: Metadata = {
  title: "Zasobnik Wiedzy — HubMI",
  description: "Przeglądaj dostępne w katalogu innowacje społeczne, odbiorców, kategorie i linki źródłowe.",
};
export default function KnowledgePage() {
  return <PageFrame title="Zasobnik Wiedzy" description="Poznaj innowacje dostępne w katalogu i znajdź inspirację dla lokalnej potrzeby.">
    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">Katalog pokazuje rekordy udostępnione w aplikacji. Obecność innowacji i linku nie potwierdza jej skuteczności ani weryfikacji treści źródła.</p>
    <KnowledgeBrowser />
    <SocialChallengeSections />
    <KnowledgeResourceSections />
  </PageFrame>;
}

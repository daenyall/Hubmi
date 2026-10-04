import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { GrantCallsView } from "@/features/grants/calls-view";
export const metadata: Metadata = { title: "Wniosek w naborze — Splot" };
export default function Page() {
  return <PageFrame title="Wniosek w naborze" description="Przygotuj pełny wniosek według wzoru ROPS: zapisuj wersje robocze, sprawdź kosztorys, wydrukuj i złóż w otwartym naborze.">
    <GrantCallsView />
  </PageFrame>;
}

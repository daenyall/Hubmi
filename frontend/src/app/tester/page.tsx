import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { TesterPage } from "@/features/tester/tester-page";
export const metadata: Metadata = { title: "Tester innowacji — HubMI" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const id = typeof query.innowacja === "string" ? query.innowacja : "";
  return <PageFrame title="Tester innowacji" description="Zgłoś gotowość do przetestowania innowacji u siebie, a po teście oceń ją i zaproponuj usprawnienia.">
    <TesterPage initialId={id} />
  </PageFrame>;
}

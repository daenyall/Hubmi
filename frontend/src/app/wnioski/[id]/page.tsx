import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { GrantEditor } from "@/features/grants/editor";
export const metadata: Metadata = { title: "Wniosek — HubMI", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PageFrame title="Wniosek w naborze" description="Formularz według wzoru ROPS. Zapisuj wersję roboczą — złożenie jest osobnym, świadomym krokiem.">
    <GrantEditor id={id} />
  </PageFrame>;
}

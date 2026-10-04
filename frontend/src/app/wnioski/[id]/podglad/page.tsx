import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { GrantPreviewPage } from "@/features/grants/preview-page";
export const metadata: Metadata = { title: "Podgląd wniosku — Splot", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PageFrame title="Podgląd wniosku"><GrantPreviewPage id={id} /></PageFrame>;
}

import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { RopsDetail } from "@/features/rops/views";
export const metadata: Metadata = { title: "Obsługa zgłoszenia — Splot", robots: { index: false, follow: false } };
export default async function RopsSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PageFrame title="Obsługa zgłoszenia"><RopsDetail id={id} /></PageFrame>;
}

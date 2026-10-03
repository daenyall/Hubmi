import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { SubmissionDetails } from "@/features/submissions/views";
export const metadata: Metadata = { title: "Szczegóły zgłoszenia — HubMI", robots: { index: false, follow: false } };
export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PageFrame title="Szczegóły zgłoszenia"><SubmissionDetails id={id} /></PageFrame>;
}

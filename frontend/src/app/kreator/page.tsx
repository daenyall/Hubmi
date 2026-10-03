import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { SubmissionCreator } from "@/features/submissions/creator";
import { CanvasHint } from "@/features/knowledge/canvas-hint";
export const metadata: Metadata = { title: "Zgłoś pomysł — HubMI" };
export default async function CreatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const id = typeof query.innowacja === "string" ? query.innowacja : "";
  return <PageFrame title="Zgłoś pomysł" description="Opisz swoją innowację społeczną. Zapisana fiszka będzie dostępna na Twoim koncie w „Moich zgłoszeniach”."><CanvasHint /><SubmissionCreator key={id || "new"} initialInnovationId={id} /></PageFrame>;
}

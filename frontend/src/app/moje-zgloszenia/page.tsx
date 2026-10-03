import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { MySubmissions } from "@/features/submissions/views";
export const metadata: Metadata = { title: "Moje zgłoszenia — HubMI" };
export default function SubmissionsPage() {
  return <PageFrame title="Moje zgłoszenia" description="Fiszki zapisane na Twoim koncie. Otwórz zgłoszenie, aby zobaczyć pełny opis i jego status."><MySubmissions /></PageFrame>;
}

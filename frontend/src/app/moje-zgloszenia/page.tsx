import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { MySubmissions } from "@/features/submissions/views";
import { MyNeeds } from "@/features/needs/my-needs";
export const metadata: Metadata = { title: "Moje zgłoszenia — Splot" };
export default function SubmissionsPage() {
  return <PageFrame title="Moje zgłoszenia" description="Fiszki pomysłów i zgłoszone potrzeby z Twojego konta. Otwórz fiszkę, aby zobaczyć pełny opis i jej status."><MySubmissions /><MyNeeds /></PageFrame>;
}

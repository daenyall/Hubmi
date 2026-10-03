import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { LoginForm } from "@/features/auth/login-form";
import { safeReturnPath } from "@/features/auth/return-path";
export const metadata: Metadata = { title: "Logowanie — HubMI", robots: { index: false, follow: false } };
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <PageFrame title="Twoje konto" description="Zaloguj się, aby zapisywać pomysły i wracać do swoich zgłoszeń."><LoginForm returnTo={safeReturnPath(typeof query.next === "string" ? query.next : undefined)} /></PageFrame>;
}

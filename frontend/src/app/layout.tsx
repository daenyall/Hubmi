import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/features/auth/auth-provider";
import { SiteHeader, SiteFooter } from "@/components/site-header";

export const metadata: Metadata = {
  title: "HubMI — innowacje dla potrzeb społecznych",
  description:
    "Opisz potrzebę społeczną i znajdź dopasowane innowacje oraz powiązane materiały z linkami do źródeł. Projekt HubMI na HackYeah 2026.",
  applicationName: "HubMI",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pl"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col"><AuthProvider><SiteHeader />{children}<SiteFooter /></AuthProvider></body>
    </html>
  );
}

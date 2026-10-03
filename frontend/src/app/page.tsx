"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { checkBackendHealth, fetchHello, HealthStatus } from "@/lib/api";
import {
  Activity,
  CheckCircle2,
  Database,
  ExternalLink,
  Flame,
  FolderGit2,
  Layers,
  RefreshCw,
  Server,
  Sparkles,
  Terminal,
  XCircle,
} from "lucide-react";

export default function Home() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const [supabaseReady, setSupabaseReady] = useState<boolean>(false);

  const loadBackendStatus = async () => {
    setLoading(true);
    const data = await checkBackendHealth();
    setHealth(data);
    setLoading(false);
  };

  const handleTestApi = async () => {
    setLoading(true);
    const res = await fetchHello();
    if (res) {
      setApiMessage(res.message);
    } else {
      setApiMessage("Could not connect to FastAPI. Make sure backend is running on :8000");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadBackendStatus();
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      setSupabaseReady(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.18),rgba(255,255,255,0))] pointer-events-none" />

      {/* Navigation Header */}
      <header className="border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-50 bg-slate-950/80 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              H
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                Hubmi
              </span>
              <span className="ml-2 text-xs font-medium text-indigo-400 bg-indigo-950/80 border border-indigo-800/60 px-2 py-0.5 rounded-full">
                HackYeah 2026
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <Badge
              variant="outline"
              className={
                health?.status === "ok"
                  ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-400 flex items-center gap-1.5"
                  : "border-amber-500/50 bg-amber-950/40 text-amber-400 flex items-center gap-1.5"
              }
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  health?.status === "ok" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`}
              />
              Backend: {health?.status === "ok" ? "Connected" : "Offline / Standby"}
            </Badge>

            <Badge
              variant="outline"
              className={
                supabaseReady
                  ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-400 flex items-center gap-1.5"
                  : "border-slate-700 bg-slate-900/60 text-slate-400 flex items-center gap-1.5"
              }
            >
              <Database className="h-3 w-3" />
              Supabase: {supabaseReady ? "Configured" : "Need keys in .env"}
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-12 flex flex-col gap-10 w-full relative z-10">
        {/* Hero Section */}
        <section className="text-center space-y-4 max-w-3xl mx-auto pt-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5" /> Fullstack Monorepo Template
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Gotowe środowisko dla Waszego zespołu
          </h1>
          <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Niezależny podział na foldery <code className="text-indigo-300 font-mono">frontend/</code> oraz{" "}
            <code className="text-indigo-300 font-mono">backend/</code>, Next.js 16, Tailwind CSS v4,
            shadcn/ui, FastAPI i Supabase.
          </p>
        </section>

        {/* Live Connectivity Test Card */}
        <Card className="bg-slate-900/70 border-slate-800 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-indigo-400" />
                <CardTitle className="text-lg text-slate-100">Live API Health & Connectivity</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadBackendStatus}
                disabled={loading}
                className="border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Odśwież stan
              </Button>
            </div>
            <CardDescription className="text-slate-400">
              Sprawdź połączenie między Next.js a serwerem FastAPI (port 8000)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <span className="text-xs text-slate-400">FastAPI Status</span>
                <span className="text-xs font-semibold text-emerald-400">
                  {health ? health.status.toUpperCase() : "BRAK ODPOWIEDZI"}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <span className="text-xs text-slate-400">Backend Env</span>
                <span className="text-xs font-semibold text-slate-200">
                  {health ? health.environment : "–"}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <span className="text-xs text-slate-400">Supabase w Backendzie</span>
                <span
                  className={`text-xs font-semibold ${
                    health?.supabase_connected ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {health?.supabase_connected ? "POŁĄCZONY" : "OCZEKUJE NA KLUCZE"}
                </span>
              </div>
            </div>

            {apiMessage && (
              <div className="p-3 rounded-lg border border-indigo-900/50 bg-indigo-950/40 text-xs font-mono text-indigo-200 flex items-center gap-2">
                <Terminal className="h-4 w-4 shrink-0 text-indigo-400" />
                <span>{apiMessage}</span>
              </div>
            )}
          </CardContent>
          <CardFooter className="pt-0 flex flex-wrap gap-3">
            <Button
              onClick={handleTestApi}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-1.5"
            >
              <Flame className="h-3.5 w-3.5" />
              Wyślij zapytanie testowe do FastAPI
            </Button>
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 border border-slate-800 bg-slate-950/50 px-3 py-2 rounded-md transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Otwórz Swagger UI (/docs)
            </a>
          </CardFooter>
        </Card>

        {/* 2 Developer Workspaces: Frontend & Backend */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Frontend Card */}
          <Card className="bg-slate-900/50 border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Layers className="h-5 w-5" />
                </div>
                <Badge variant="outline" className="border-indigo-800 text-indigo-300 bg-indigo-950/30">
                  Folder: /frontend
                </Badge>
              </div>
              <CardTitle className="text-xl text-slate-100">Frontend (Next.js)</CardTitle>
              <CardDescription className="text-slate-400 text-sm">
                Odpowiedzialny za interfejs, komponenty i UX
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <ul className="space-y-2 text-xs text-slate-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Next.js 16 (App Router + TypeScript)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Tailwind CSS v4 & shadcn/ui komponenty</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Klient Supabase SSR (@supabase/ssr)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Komunikacja z backendem w <code className="text-slate-300">src/lib/api.ts</code></span>
                </li>
              </ul>

              <div className="pt-2">
                <div className="text-xs font-mono bg-slate-950 border border-slate-800 p-2.5 rounded-md text-slate-300 space-y-1">
                  <div className="text-slate-500"># Uruchomienie deweloperskie:</div>
                  <div>cd frontend</div>
                  <div className="text-indigo-300">npm run dev</div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t border-slate-800/80 pt-4 text-xs text-slate-400 flex items-center justify-between">
              <span>Port: 3000</span>
              <a
                href="https://ui.shadcn.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-slate-200 inline-flex items-center gap-1"
              >
                shadcn/ui docs <ExternalLink className="h-3 w-3" />
              </a>
            </CardFooter>
          </Card>

          {/* Backend Card */}
          <Card className="bg-slate-900/50 border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Server className="h-5 w-5" />
                </div>
                <Badge variant="outline" className="border-emerald-800 text-emerald-300 bg-emerald-950/30">
                  Folder: /backend
                </Badge>
              </div>
              <CardTitle className="text-xl text-slate-100">Backend (FastAPI)</CardTitle>
              <CardDescription className="text-slate-400 text-sm">
                Odpowiedzialny za logikę biznesową, API i integrację z bazą
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <ul className="space-y-2 text-xs text-slate-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>FastAPI + Uvicorn z autoreloadem</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Gotowy klient Supabase Python SDK</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>CORS skonfigurowany dla frontendu (:3000)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Automatyczna dokumentacja OpenAPI / Swagger</span>
                </li>
              </ul>

              <div className="pt-2">
                <div className="text-xs font-mono bg-slate-950 border border-slate-800 p-2.5 rounded-md text-slate-300 space-y-1">
                  <div className="text-slate-500"># Uruchomienie deweloperskie:</div>
                  <div>cd backend</div>
                  <div>source .venv/bin/activate</div>
                  <div className="text-emerald-300">python run.py</div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t border-slate-800/80 pt-4 text-xs text-slate-400 flex items-center justify-between">
              <span>Port: 8000</span>
              <a
                href="https://fastapi.tiangolo.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-slate-200 inline-flex items-center gap-1"
              >
                FastAPI docs <ExternalLink className="h-3 w-3" />
              </a>
            </CardFooter>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 px-6 text-center text-xs text-slate-500 relative z-10">
        Hubmi • HackYeah 2026 • Next.js & FastAPI Monorepo
      </footer>
    </div>
  );
}

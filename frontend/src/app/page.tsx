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
import { Input } from "@/components/ui/input";
import {
  checkBackendHealth,
  matchInnovations,
  adaptInnovation,
  HealthStatus,
  MatchItem,
} from "@/lib/api";
import {
  Activity,
  Bot,
  CheckCircle2,
  Database,
  ExternalLink,
  Flame,
  Layers,
  Lightbulb,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Tag,
  Users,
} from "lucide-react";

const EXAMPLE_PROBLEMS = [
  "Samotność i brak transportu do lekarza dla osób starszych na wsi",
  "Kryzys psychiczny i poczucie izolacji wśród młodzieży",
  "Trudności dzieci w spektrum autyzmu z hałasem i przebodźcowaniem w szkole",
  "Osoby na wózkach inwalidzkich odcięte od wycieczek górskich i przyrody",
];

export default function Home() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [supabaseReady, setSupabaseReady] = useState<boolean>(false);

  // Matchmaking state
  const [problemText, setProblemText] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [selectedInnovation, setSelectedInnovation] = useState<MatchItem | null>(null);
  const [adaptContext, setAdaptContext] = useState("Mała gmina wiejska Zabierzów, mały budżet");
  const [adaptPlan, setAdaptPlan] = useState<string | null>(null);
  const [adapting, setAdapting] = useState(false);

  const loadBackendStatus = async () => {
    setLoading(true);
    const data = await checkBackendHealth();
    setHealth(data);
    setLoading(false);
  };

  const handleSearch = async (queryToUse?: string) => {
    const q = queryToUse || problemText;
    if (!q.trim()) return;
    setSearching(true);
    setAdaptPlan(null);
    setSelectedInnovation(null);

    const res = await matchInnovations(q);
    if (res && res.matches) {
      setMatches(res.matches);
    }
    setSearching(false);
  };

  const handleGenerateAdaptation = async (item: MatchItem) => {
    setSelectedInnovation(item);
    setAdapting(true);
    setAdaptPlan(null);

    const res = await adaptInnovation(
      item.title,
      adaptContext,
      item.description
    );

    if (res) {
      setAdaptPlan(res.adaptation_plan);
    }
    setAdapting(false);
  };

  useEffect(() => {
    loadBackendStatus();
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      setSupabaseReady(true);
    }
    // Pre-populate with first search
    handleSearch(EXAMPLE_PROBLEMS[0]);
    setProblemText(EXAMPLE_PROBLEMS[0]);
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
              M
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                MostMI
              </span>
              <span className="ml-1 text-xs text-slate-400 font-normal">
                (Splot Małopolski)
              </span>
              <span className="ml-2 text-xs font-medium text-indigo-400 bg-indigo-950/80 border border-indigo-800/60 px-2 py-0.5 rounded-full">
                ROPS Kraków • HackYeah 2026
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
              FastAPI (:8000): {health?.status === "ok" ? "Online" : "Offline"}
            </Badge>

            <Badge
              variant="outline"
              className={
                health?.supabase_connected
                  ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-400 flex items-center gap-1.5"
                  : "border-slate-700 bg-slate-900/60 text-slate-400 flex items-center gap-1.5"
              }
            >
              <Database className="h-3 w-3" />
              Supabase pgvector: {health?.supabase_connected ? "Aktywne (10 innowacji)" : "Brak"}
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-10 flex flex-col gap-10 w-full relative z-10">
        {/* Hero Section */}
        <section className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5" /> Moduł I: Matchmaking Społeczny (Wektorowy)
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Inteligentne kojarzenie potrzeb z innowacjami
          </h1>
          <p className="text-slate-400 text-base max-w-2xl mx-auto leading-relaxed">
            Wpisz wyzwanie społeczne z Twojej gminy lub organizacji. Silnik semantyczny przeszuka bazę innowacji ROPS Kraków przy użyciu wektorów i wskaże gotowe rozwiązania.
          </p>
        </section>

        {/* Search Bar Component */}
        <Card className="bg-slate-900/80 border-slate-800 shadow-2xl backdrop-blur-md">
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <Input
                  value={problemText}
                  onChange={(e) => setProblemText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Opisz problem (np. wykluczenie komunikacyjne seniorów, samotność, brak sali wyciszeń...)"
                  className="pl-10 h-11 bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm focus-visible:ring-indigo-500"
                />
              </div>
              <Button
                onClick={() => handleSearch()}
                disabled={searching}
                className="h-11 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm gap-2"
              >
                {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Dopasuj innowacje
              </Button>
            </div>

            {/* Quick Suggestions */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-slate-400 font-medium">Szybkie przykłady:</span>
              {EXAMPLE_PROBLEMS.map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setProblemText(example);
                    handleSearch(example);
                  }}
                  className="px-2.5 py-1 rounded-md bg-slate-800/60 hover:bg-slate-800 text-slate-300 border border-slate-700/60 transition-colors text-left truncate max-w-xs"
                >
                  {example}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-slate-100">
                Rekomendowane innowacje ROPS Kraków ({matches.length})
              </h2>
            </div>
            {matches.length > 0 && (
              <Badge variant="outline" className="border-indigo-800/80 bg-indigo-950/40 text-indigo-300 text-xs">
                Wyszukiwanie semantyczne pgvector (1536D)
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {matches.map((item) => (
              <Card
                key={item.id}
                className={`bg-slate-900/60 border-slate-800 hover:border-indigo-500/50 transition-all flex flex-col justify-between ${
                  selectedInnovation?.id === item.id ? "ring-2 ring-indigo-500" : ""
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <Badge variant="outline" className="border-indigo-800 text-indigo-300 bg-indigo-950/40 text-xs">
                      {item.category || "Innowacja społeczna"}
                    </Badge>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                      Trafność: {Math.round(item.similarity_score * 100)}%
                    </span>
                  </div>
                  <CardTitle className="text-lg text-slate-100 mt-2">{item.title}</CardTitle>
                  <CardDescription className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                    <Users className="h-3.5 w-3.5 text-slate-500" /> {item.target_group}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3 text-xs text-slate-300">
                  <p className="line-clamp-3 text-slate-400 leading-relaxed">{item.description}</p>
                  
                  {item.why_relevant && (
                    <div className="p-2.5 rounded-md bg-indigo-950/30 border border-indigo-900/40 text-indigo-200">
                      <span className="font-semibold text-indigo-300">Dlaczego warto: </span>
                      {item.why_relevant}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="border-t border-slate-800/80 pt-3 flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGenerateAdaptation(item)}
                    disabled={adapting && selectedInnovation?.id === item.id}
                    className="text-xs bg-slate-800/80 border-slate-700 hover:bg-slate-700 text-indigo-300 gap-1.5"
                  >
                    <Bot className="h-3.5 w-3.5 text-indigo-400" />
                    {adapting && selectedInnovation?.id === item.id ? "Generowanie..." : "Plan adaptacji AI"}
                  </Button>

                  {item.source_url && (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1"
                    >
                      Baza ROPS <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>

        {/* Middleman AI Output Section */}
        {selectedInnovation && adaptPlan && (
          <Card className="bg-gradient-to-br from-indigo-950/50 via-slate-900/80 to-slate-950 border-indigo-800/60 shadow-xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-indigo-400" />
                  <CardTitle className="text-lg text-slate-100">
                    Moduł VII: Middleman AI — Plan Adaptacji dla: {selectedInnovation.title}
                  </CardTitle>
                </div>
                <Badge className="bg-indigo-600 text-white text-xs">Asystent Wdrożenia</Badge>
              </div>
              <CardDescription className="text-slate-400 text-xs">
                Wygenerowany plan wdrożenia innowacji do specyfiki i możliwości zgłaszającej się instytucji
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 text-xs sm:text-sm text-slate-200 whitespace-pre-line leading-relaxed font-sans">
                {adaptPlan}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between items-center text-xs text-slate-400 border-t border-slate-800/60 pt-3">
              <span>Kontekst: {adaptContext}</span>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs">
                Zapisz jako fiszkę w portalu ROPS
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Quick Links for Developers */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noreferrer"
            className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 transition-all flex flex-col gap-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">Swagger API Docs</span>
              <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-400">Interaktywny panel FastAPI pod adresem :8000/docs</span>
          </a>

          <a
            href="https://supabase.com/dashboard/project/sctlcicbbfppbfqewziu/editor"
            target="_blank"
            rel="noreferrer"
            className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 transition-all flex flex-col gap-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">Supabase Table Editor</span>
              <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-400">Podgląd 10 innowacji i wektorów w chmurze</span>
          </a>

          <a
            href="https://github.com/daenyall/Hubmi"
            target="_blank"
            rel="noreferrer"
            className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 transition-all flex flex-col gap-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">GitHub (daenyall/Hubmi)</span>
              <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <span className="text-xs text-slate-400">Zsynchronizowany kod z gałęzią main</span>
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 px-6 text-center text-xs text-slate-500 relative z-10">
        MostMI (Splot Małopolski) • Małopolski Hub Innowacji Społecznych • ROPS Kraków
      </footer>
    </div>
  );
}

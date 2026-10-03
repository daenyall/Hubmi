import { ArrowRight, MessageSquareText, Search, BookOpen } from "lucide-react";
import { MatchingForm } from "@/components/matching-form";
import { USE_MOCK_MATCHING } from "@/lib/api";

const steps = [
  { icon: MessageSquareText, title: "Opisz potrzebę", description: "Zacznij od osób i sytuacji, którą chcesz zmienić." },
  { icon: Search, title: "Poznaj dopasowania", description: "Sprawdź propozycje i wyjaśnienia ich dopasowania." },
  { icon: BookOpen, title: "Sięgnij do źródeł", description: "Przejdź do dostępnych materiałów i poznaj szczegóły." },
];

export default function Home() {
  return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 space-y-12 px-[20px] pb-16 pt-12 sm:px-[32px] sm:pt-16">
        <section aria-labelledby="intro-heading" className="max-w-3xl space-y-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <span aria-hidden="true" className="size-2 rounded-full bg-primary" /> Innowacje społeczne bliżej ludzi
          </p>
          <h1 id="intro-heading" className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Od potrzeby do <span className="text-primary">konkretnego rozwiązania.</span>
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Szukasz sposobu na lokalny problem społeczny? Opisz go, a HubMI pomoże znaleźć dopasowane innowacje i materiały z dostępnymi źródłami.
          </p>
        </section>

        {USE_MOCK_MATCHING && (
          <aside aria-label="Tryb demonstracyjny" className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-950">
            <strong>Dane demonstracyjne.</strong> Pokazujemy fikcyjne przykłady działania interfejsu. Nie są to zweryfikowane innowacje ani materiały ROPS.
          </aside>
        )}

        <MatchingForm />

        <section id="jak-to-dziala" aria-labelledby="steps-heading" className="scroll-mt-6 border-t border-border pt-10">
          <h2 id="steps-heading" className="mb-6 text-2xl font-semibold tracking-tight">Mały krok w stronę zmiany</h2>
          <ol className="grid gap-6 sm:grid-cols-3">
            {steps.map(({ icon: Icon, title, description }, index) => (
              <li key={title} className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><Icon className="size-5" aria-hidden="true" /></span>
                  <h3 className="text-base font-semibold"><span className="sr-only">Krok {index + 1}: </span>{title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
              </li>
            ))}
          </ol>
          <a href="#wyszukaj" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-semibold text-primary underline underline-offset-4">
            Opisz swoją potrzebę <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </section>
      </main>

  );
}

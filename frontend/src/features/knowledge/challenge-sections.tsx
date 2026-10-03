import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CHALLENGE_SOURCE, MALOPOLSKA_CHALLENGES, NATIONWIDE_MAP, type SocialChallenge } from "./challenges";
import { isSafeResourceUrl } from "./resources";

function ChallengeCard({ item }: { item: SocialChallenge }) {
  return <article aria-label={item.name} className="h-full min-w-0">
    <Card className="h-full rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px]">
      <CardHeader className="space-y-3">
        <h4 className="text-lg font-semibold leading-snug">{item.name}</h4>
        <Badge variant="secondary" className="h-auto min-h-7 max-w-full whitespace-normal">Małopolska</Badge>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <p className="leading-relaxed text-muted-foreground">{item.finding}</p>
        <p className="leading-relaxed"><span className="font-semibold">Dlaczego to ważne: </span>{item.matters}</p>
        <p className="text-sm leading-relaxed text-muted-foreground"><span className="font-semibold">Źródło: </span>{CHALLENGE_SOURCE}</p>
      </CardContent>
    </Card>
  </article>;
}

export function SocialChallengeSections() {
  const mapUrl = isSafeResourceUrl(NATIONWIDE_MAP.url) ? NATIONWIDE_MAP.url : null;
  return <section aria-labelledby="social-challenges-heading" className="space-y-6">
    <div className="max-w-3xl space-y-2">
      <h2 id="social-challenges-heading" className="text-2xl font-semibold tracking-tight">Najważniejsze wyzwania społeczne Małopolski</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Krótkie karty na podstawie briefu wyzwania ROPS Kraków. Każda podaje ustalenie z tego dokumentu, a nie wynik własnej analizy.
        Nie znajdziesz tu liczb ani dat, których brief nie podaje.
      </p>
    </div>
    <ul aria-labelledby="social-challenges-heading" className="grid gap-5 sm:grid-cols-2">
      {MALOPOLSKA_CHALLENGES.map((item) => <li key={item.id} className="min-w-0"><ChallengeCard item={item} /></li>)}
    </ul>

    <div className="space-y-3 rounded-2xl border border-border bg-secondary p-[24px]">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="nationwide-map-heading" className="text-xl font-semibold">{NATIONWIDE_MAP.title}</h3>
        <Badge variant="outline" className="h-auto min-h-7 max-w-full whitespace-normal">Zasięg ogólnopolski</Badge>
      </div>
      <p className="max-w-3xl leading-relaxed text-muted-foreground">{NATIONWIDE_MAP.finding}</p>
      <p className="max-w-3xl text-sm leading-relaxed">{NATIONWIDE_MAP.caveat}</p>
      {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">
        Otwórz Mapę Wyzwań Społecznych (PDF, nowa karta)
        <span className="sr-only">: dokument w serwisie ROPS Kraków, plik PDF otwiera się w nowej karcie</span>
      </a>}
    </div>
  </section>;
}

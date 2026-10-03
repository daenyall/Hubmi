import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { isSafeResourceUrl, RESOURCE_GROUPS, type KnowledgeResource } from "./resources";

function ResourceCard({ item }: { item: KnowledgeResource }) {
  // Pozycja bez bezpiecznego adresu nie trafia na listę; nie pokazujemy martwego odnośnika.
  return <article aria-label={item.title} className="h-full min-w-0">
    <Card className="h-full rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px]">
      <CardHeader className="space-y-3">
        <h4 className="text-lg font-semibold leading-snug">{item.title}</h4>
        <Badge variant="secondary" className="h-auto min-h-7 max-w-full whitespace-normal">{item.kind}</Badge>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <p className="leading-relaxed text-muted-foreground">{item.description}</p>
        {item.caveat && <p className="text-sm leading-relaxed text-muted-foreground">{item.caveat}</p>}
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">
          Otwórz w serwisie ROPS<span className="sr-only">: {item.title} (otwiera się w nowej karcie)</span>
        </a>
      </CardContent>
    </Card>
  </article>;
}

export function KnowledgeResourceSections() {
  const groups = RESOURCE_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => isSafeResourceUrl(item.url)) }))
    .filter((group) => group.items.length);
  if (!groups.length) return null;
  return <section aria-labelledby="rops-resources-heading" className="space-y-6">
    <div className="max-w-3xl space-y-2">
      <h2 id="rops-resources-heading" className="text-2xl font-semibold tracking-tight">Zasoby ROPS Kraków</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Odnośniki do materiałów opublikowanych w serwisie rops.krakow.pl. To stała lista prowadząca poza aplikację, a nie rekordy pobrane do katalogu powyżej.
        Za treść i aktualność odpowiada ROPS Kraków. Odnośniki otwierają się w nowej karcie.
      </p>
    </div>
    {groups.map((group) => <div key={group.id} className="space-y-4">
      <div className="max-w-3xl space-y-2">
        <h3 id={`resource-group-${group.id}`} className="text-xl font-semibold">{group.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{group.intro}</p>
      </div>
      <ul aria-labelledby={`resource-group-${group.id}`} className="grid gap-5 sm:grid-cols-2">
        {group.items.map((item) => <li key={item.id} className="min-w-0"><ResourceCard item={item} /></li>)}
      </ul>
    </div>)}
  </section>;
}

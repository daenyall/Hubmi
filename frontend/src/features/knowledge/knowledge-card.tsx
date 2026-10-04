import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import type { KnowledgeItem } from "./model";

export function KnowledgeCard({ item }: { item: KnowledgeItem }) {
  // Taki sam format ID jak obsługiwany przez istniejący kreator; rekordy demo nie tworzą powiązania.
  const canLink = /^[a-z0-9_-]{1,200}$/i.test(item.id) && !/^demo-/i.test(item.id);
  return <article aria-label={item.title} className="h-full min-w-0">
    <Card className="h-full rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px]">
      <CardHeader className="space-y-3"><h3 className="text-xl font-semibold leading-snug">{item.title}</h3>
        {item.category ? <Badge variant="secondary" className="h-auto min-h-7 max-w-full whitespace-normal">{item.category}</Badge> : <p className="text-sm text-muted-foreground">Kategoria nie została podana.</p>}
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{item.description || "Opis nie został udostępniony."}</p>
        <p className="leading-relaxed"><span className="font-semibold">Odbiorcy: </span>{item.audience || "Grupa odbiorców nie została podana."}</p>
      </CardContent>
      <CardFooter className="flex-wrap gap-4 bg-transparent">
        {item.source_url ? <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Zobacz źródło<span className="sr-only">: {item.title} (otwiera się w nowej karcie)</span></a>
          : <p className="text-sm text-muted-foreground">{item.source_invalid ? "Link źródłowy jest niedostępny — niepoprawny adres." : "Brak źródła."}</p>}
        {canLink && <Link href={`/kreator?innowacja=${encodeURIComponent(item.id)}`} aria-label={`Zgłoś pomysł powiązany z: ${item.title}`} className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Zgłoś pomysł</Link>}
        {canLink && <Link href={`/tester?innowacja=${encodeURIComponent(item.id)}`} aria-label={`Przetestuj lub oceń: ${item.title}`} className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Przetestuj u siebie</Link>}
      </CardFooter>
    </Card>
  </article>;
}

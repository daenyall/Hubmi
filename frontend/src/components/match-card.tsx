import { ArrowUpRight, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { MatchItem } from "@/lib/matching";
import { AdaptationForm } from "@/components/adaptation-form";
import Link from "next/link";
import { isInnovationId } from "@/features/submissions/model";

export function MatchCard({
  item,
  demo,
  resource = false,
}: {
  item: MatchItem;
  demo: boolean;
  resource?: boolean;
}) {
  const audience = Array.isArray(item.audience)
    ? item.audience.join(", ")
    : item.audience;

  return (
    <article className="h-full min-w-0" aria-label={item.title}>
      <Card className="h-full gap-5 rounded-2xl border border-border shadow-sm ring-0 [--card-spacing:24px]">
        <CardHeader className="gap-3">
          {demo && (
            <Badge variant="outline" className="h-auto min-h-6 whitespace-normal border-amber-300 bg-amber-50 text-amber-950">
              Przykład demonstracyjny
            </Badge>
          )}
          <CardTitle>
            <h3 className="text-xl font-semibold leading-snug">{item.title}</h3>
          </CardTitle>
          {item.description && <p className="text-base leading-relaxed text-muted-foreground">{item.description}</p>}
        </CardHeader>
        <CardContent className="flex-1 space-y-5">
          {audience && (
            <div className="flex items-start gap-2 text-sm leading-relaxed">
              <Users className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <p><span className="font-semibold">Odbiorcy: </span>{audience}</p>
            </div>
          )}
          {item.reason && <div className="rounded-xl bg-secondary p-[16px]">
            <p className="mb-1 text-sm font-semibold text-primary">
              {resource ? "Dlaczego ten materiał?" : "Dlaczego to rozwiązanie?"}
            </p>
            <p className="text-sm leading-relaxed">{item.reason}</p>
          </div>}
          {!!item.tags?.length && (
            <ul className="flex flex-wrap gap-2" aria-label="Tematy">
              {item.tags.map((tag, index) => (
                <li key={`${tag}-${index}`} className="min-w-0 max-w-full">
                  <Badge variant="secondary" className="h-auto min-h-6 max-w-full whitespace-normal text-left">
                    {tag}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {!resource && !demo && <AdaptationForm item={item} />}
        </CardContent>
        <CardFooter className="min-h-16 flex-wrap gap-4 bg-transparent">
          {!demo && !resource && isInnovationId(item.id) && <Link href={`/kreator?innowacja=${encodeURIComponent(item.id)}`} aria-label={`Zgłoś pomysł powiązany z: ${item.title}`} className="inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4">Zgłoś pomysł</Link>}
          {item.source_url ? (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-sm font-semibold text-primary underline underline-offset-4 hover:text-foreground"
            >
              {resource ? "Otwórz materiał" : "Zobacz źródło"}
              <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">: {item.title} (otwiera się w nowej karcie)</span>
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">
              {demo ? "Przykład demonstracyjny — bez źródła." : "Źródło nieudostępnione."}
            </p>
          )}
        </CardFooter>
      </Card>
    </article>
  );
}

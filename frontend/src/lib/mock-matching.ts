import type { MatchItem, BackendMatchResponse } from "./matching";

// Fikcyjne rekordy do prezentacji interfejsu. Nie są innowacjami ROPS.
// Nie mamy materiałów źródłowych w repozytorium, dlatego nie tworzymy linków.
const examples: { keywords: RegExp; item: MatchItem }[] = [
  {
    keywords: /senior|starsz|samotno|samotn|izolac/i,
    item: {
      id: "demo-sasiedzi",
      title: "Sąsiedzki krąg wsparcia",
      description:
        "Demonstracyjny pomysł na regularne spotkania i wzajemną pomoc sąsiedzką, organizowane blisko miejsca zamieszkania.",
      audience: ["Osoby starsze", "Osoby doświadczające samotności"],
      tags: ["Relacje społeczne", "Wsparcie lokalne"],
      reason:
        "W demonstracji ten przykład pojawia się przy opisie samotności lub potrzeb osób starszych. Ilustruje możliwość budowania codziennych relacji w okolicy.",
      source_url: null,
    },
  },
  {
    keywords: /niepełnospraw|dostępno|dostępn|barier|opiekun|opieki/i,
    item: {
      id: "demo-wsparcie",
      title: "Wsparcie bliżej domu",
      description:
        "Demonstracyjny pomysł na punkt pomocy w dostępnej przestrzeni, z możliwością umówienia rozmowy i wsparcia w codziennych sprawach.",
      audience: ["Osoby z niepełnosprawnościami", "Opiekunowie"],
      tags: ["Dostępność", "Samodzielność"],
      reason:
        "W demonstracji ten przykład odpowiada słowom związanym z dostępnością i opieką. Pokazuje, jak można ograniczać bariery w korzystaniu z lokalnego wsparcia.",
      source_url: null,
    },
  },
  {
    keywords: /młodz|młod|młodzie|uczni|szkoł|dzieci/i,
    item: {
      id: "demo-mlodzi",
      title: "Miejsce dla młodych",
      description:
        "Demonstracyjny pomysł na współtworzoną przez młodzież przestrzeń spotkań, rozwijania zainteresowań i kontaktu z lokalnym mentorem.",
      audience: ["Młodzież", "Lokalni animatorzy"],
      tags: ["Uczestnictwo", "Edukacja"],
      reason:
        "W demonstracji ten przykład pojawia się przy potrzebach młodych osób. Ilustruje tworzenie okazji do spotkań i zaangażowania w życie lokalne.",
      source_url: null,
    },
  },
];

export async function getMockMatches(
  problemDescription: string,
  signal?: AbortSignal,
): Promise<BackendMatchResponse> {
  // Krótka przerwa pozwala też pokazać stan ładowania podczas demonstracji.
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, 650);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

  const matches = examples
    .filter(({ keywords }) => keywords.test(problemDescription))
    .map(({ item }) => ({
      id: item.id, title: item.title, description: item.description,
      why_relevant: item.reason, source_url: item.source_url,
      target_group: Array.isArray(item.audience) ? item.audience.join(", ") : item.audience,
      category: item.tags?.[0],
      similarity_score: 0, // Syntetyczne pole kontraktu w demo; nigdy nie jest pokazywane.
      status: "demonstracyjne",
    }));

  return {
    matches,
    total_found: matches.length,
    query: problemDescription,
    related_resources: matches.length
      ? [
          {
            id: "demo-checklista",
            title: "Pytania przed wdrożeniem rozwiązania",
            description:
              "Demonstracyjna lista pytań: kogo zaprosić do rozmowy, jakie bariery usunąć i jak zebrać opinie osób korzystających ze wsparcia?",
            reason:
              "Przykład materiału pomocniczego do zaplanowania rozmowy o lokalnej potrzebie. Nie jest publikacją ani zweryfikowanym materiałem ROPS.",
            source_url: null,
          },
        ]
      : [],
  };
}

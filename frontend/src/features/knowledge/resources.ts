/**
 * Zewnętrzne zasoby ROPS Kraków wskazane w briefie wyzwania: raporty i diagnozy,
 * Mapa Wyzwań Społecznych oraz materiały edukacyjne o innowacjach społecznych.
 *
 * To NIE są rekordy katalogu z GET /api/innovations ani dane z Supabase.
 * To stała, ręcznie zweryfikowana lista odnośników do rops.krakow.pl.
 * Każdy adres sprawdzono 3 października 2026 (HTTP 200), a opisy pochodzą
 * z treści stron docelowych i samych dokumentów. Nie dodawaj tu adresu,
 * którego nie otworzyłeś i nie opisu, którego nie potwierdza źródło.
 */
export type ResourceKind =
  | "Dokument PDF"
  | "Plansza PDF"
  | "Raport roczny"
  | "Pliki do pobrania"
  | "Serwis z danymi"
  | "Katalog na stronie ROPS"
  | "Strona tematyczna";

export interface KnowledgeResource {
  id: string;
  title: string;
  description: string;
  kind: ResourceKind;
  url: string;
  /** Pokazywane przy pozycji, gdy strona docelowa sama sygnalizuje ograniczenie. */
  caveat?: string;
}

export interface ResourceGroup {
  id: string;
  title: string;
  intro: string;
  items: KnowledgeResource[];
}

export const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    id: "mapa-wyzwan",
    title: "Mapa Wyzwań Społecznych",
    intro: "Punkt wyjścia do nazwania problemu. Wnioski z mapy warto przywołać w opisie diagnozy w kreatorze pomysłu.",
    items: [
      {
        id: "mapa-wyzwan-spolecznych",
        title: "Mapa Wyzwań Społecznych",
        description:
          "Opracowanie Działu Innowacji Społecznych ROPS w Krakowie, przygotowane na potrzeby projektu „Inkubator Włączenia Społecznego 2.0”. Obejmuje osiem obszarów: rodzina i piecza zastępcza, bezdomność, niepełnosprawność, ubóstwo, integracja cudzoziemców, zdrowie, zdrowie psychiczne oraz seniorzy. Dla każdego obszaru podaje definicję i analizę danych zastanych. Dane mają charakter ogólnopolski.",
        kind: "Dokument PDF",
        url: "https://rops.krakow.pl/mpliki/IS/IWS_20/za._nr_2._Mapa_Wyzwa_Spoecznych.pdf",
      },
    ],
  },
  {
    id: "raporty-diagnozy",
    title: "Raporty i diagnozy społeczne",
    intro: "Dane i wnioski, którymi można poprzeć skalę problemu. Sprawdź datę opracowania, zanim powołasz się na liczby.",
    items: [
      {
        id: "raporty-z-badan",
        title: "Raporty z badań",
        description:
          "Raporty badawcze ROPS do pobrania, m.in. „Wyzwania i potrzeby sektora opiekuńczego w Małopolsce” (2026) oraz „Usługi społeczne w Małopolsce – deficyty, potrzeby, potencjał rozwojowy” (2025). Opracowania opisują skalę zjawisk i dostęp mieszkańców regionu do pomocy i wsparcia. Publikacje udostępniono na licencji CC BY 4.0.",
        kind: "Pliki do pobrania",
        url: "https://rops.krakow.pl/badania-analizy-raporty/raporty-z-badan",
      },
      {
        id: "ocena-zasobow",
        title: "Ocena zasobów pomocy społecznej województwa małopolskiego",
        description:
          "Coroczne opracowanie realizowane zgodnie z obowiązkiem ustawowym. Raport przedstawia podstawowe informacje o sytuacji społecznej i demograficznej regionu. Najnowsza edycja za 2025 r. jest udostępniona również w wersji dostępnej dla osób ze szczególnymi potrzebami, wraz z alternatywą tekstową.",
        kind: "Raport roczny",
        url: "https://rops.krakow.pl/badania-analizy-raporty/ocena-zasobow-pomocy-spolecznej-w-woj-malopolskim/biezaca-ocena",
      },
      {
        id: "ioss",
        title: "Internetowy Obserwator Statystyk Społecznych",
        description:
          "Ogólnodostępny serwis wizualizujący wskaźniki społeczne. Wybraną statystykę można przeglądać na mapie, w tabeli i na wykresie oraz analizować na przestrzeni lat. Obejmuje dane o demografii, zdrowiu, rynku pracy, edukacji, pomocy społecznej, pieczy zastępczej i kulturze.",
        kind: "Serwis z danymi",
        url: "https://rops.krakow.pl/badania-analizy-raporty/internetowy-obserwator-statystyk-spolecznych",
      },
    ],
  },
  {
    id: "materialy-edukacyjne",
    title: "Materiały edukacyjne o innowacjach społecznych",
    intro: "Jak projektuje się i inkubuje innowację społeczną — doświadczenia ROPS Kraków i narzędzia do pracy nad pomysłem.",
    items: [
      {
        id: "social-innovation-canvas",
        title: "Social Innovation Canvas",
        description:
          "Plansza warsztatowa do rozpisania pomysłu na innowację społeczną. Prowadzi przez problem i jego intensywność, aktorów zmiany, przystępność i wartość rozwiązania oraz strukturę kosztów stałych. Przy każdej sekcji podaje pytania pomocnicze.",
        kind: "Plansza PDF",
        url: "https://rops.krakow.pl/mpliki/IS/Moj_folder/INNO_AGH_-_SOCIAL_CANVAS.pdf",
      },
      {
        id: "publikacje-ze-swiata-innowacji",
        title: "Publikacje ze świata innowacji",
        description:
          "Publikacje ROPS podsumowujące kolejne inkubatory, m.in. „Połącz kropki, czyli o sile innowacji społecznych w obszarze włączenia społecznego”, „Innowacje społeczne dla dostępności” oraz „Przewodnik po innowacjach społecznych” o tym, czy i jak administracja publiczna może inkubować innowacje.",
        kind: "Pliki do pobrania",
        url: "https://rops.krakow.pl/innowacje-spoleczne/publikacje-ze-swiata-innowacji",
      },
      {
        id: "biblioteka-innowacji",
        title: "Biblioteka Innowacji Społecznych",
        description:
          "Innowacje inkubowane przez ROPS, pogrupowane według odbiorców: seniorzy, dzieci, młodzież i rodzina, osoby o ograniczonej mobilności, osoby z niepełnosprawnością sensoryczną i intelektualną, zdrowie i medycyna, rynek pracy, cudzoziemcy oraz osoby w kryzysie bezdomności.",
        kind: "Katalog na stronie ROPS",
        url: "https://rops.krakow.pl/innowacje-spoleczne/biblioteka-innowacji-spolecznych/kategorie",
        caveat: "ROPS informuje na tej stronie, że jest ona w przebudowie i część odnośników może być nieaktywna.",
      },
      {
        id: "innowacje-w-modelach",
        title: "Innowacje w małopolskich modelach",
        description:
          "Przegląd innowacji społecznych, które weszły do Małopolskich Modeli Usług Społecznych, wraz z opisem gotowych do wykorzystania rozwiązań, takich jak „Organizator kompleksowej opieki w miejscu zamieszkania”.",
        kind: "Strona tematyczna",
        url: "https://rops.krakow.pl/innowacje-spoleczne/innowacje-w-malopolskich-modelach",
      },
    ],
  },
];

/** Adresy zasobów muszą być publicznymi HTTPS bez danych logowania w URL. */
export function isSafeResourceUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/**
 * Najważniejsze wyzwania społeczne Małopolski.
 *
 * Jedyne źródło tych ustaleń to brief wyzwania „HubMI.pl” (template wyzwania)
 * przekazany uczestnikom HackYeah 2026 przez ROPS Kraków — plik docs/rops/hubmi-1.pdf,
 * odczytany 4 października 2026. Każde `finding` jest parafrazą zdania z tego dokumentu.
 *
 * Czego tu NIE ma: liczb, dat ani wyników badań, których brief nie podaje.
 * Danych z ogólnopolskiej Mapy Wyzwań Społecznych nie mieszamy z regionem — Mapa ma
 * własny blok (NATIONWIDE_MAP) i wprost oznaczony zasięg.
 * Pozostałe lokalne pliki (HubMI-nowy-plan, humbi-wniosek) to nasz plan pracy i formularz
 * naboru ROPS, więc nie są źródłem ustaleń o kondycji regionu.
 */
export const CHALLENGE_SOURCE = "Brief wyzwania „HubMI.pl”, ROPS Kraków — materiał dla uczestników HackYeah 2026";

export interface SocialChallenge {
  id: string;
  name: string;
  /** Konkretne ustalenie z odczytanego materiału. */
  finding: string;
  /** Dlaczego to ma znaczenie dla mieszkańca lub instytucji — też wprost z briefu. */
  matters: string;
}

export const MALOPOLSKA_CHALLENGES: SocialChallenge[] = [
  {
    id: "starzenie-i-samotnosc",
    name: "Starzenie się społeczeństwa i samotność",
    finding:
      "Brief wymienia starzenie się społeczeństwa i samotność wśród wyzwań, przed którymi stoi dziś Małopolska. ROPS od dziesięciu lat pełni funkcję regionalnego inkubatora innowacji i zebrał portfolio blisko 200 innowacji społecznych odpowiadających na realne wyzwania mieszkańców, w tym na starzenie się społeczeństwa.",
    matters:
      "Dla mieszkańca to pytanie o kontakt z innymi i wsparcie blisko domu. Dla instytucji — brief wskazuje, że samorządy z jednej strony diagnozują lokalne wyzwania, a z drugiej szukają gotowych rozwiązań, które mogą wdrożyć w swoich politykach lokalnych.",
  },
  {
    id: "zdrowie-psychiczne-i-uslugi",
    name: "Kryzys zdrowia psychicznego i dostęp do usług społecznych",
    finding:
      "Na liście wyzwań regionu brief stawia obok siebie kryzys zdrowia psychicznego oraz ograniczony dostęp do usług społecznych. Wskazuje też potrzebę lepszej koordynacji działań, która zapewni sprawną realizację zadań publicznych, i współpracy międzysektorowej.",
    matters:
      "Dla mieszkańca liczy się, czy wsparcie jest w zasięgu, gdy jest potrzebne. Dla instytucji to kwestia koordynacji: brief łączy ten problem z brakiem sprawnej współpracy między administracją, organizacjami i mieszkańcami.",
  },
  {
    id: "wykluczenie-cyfrowe",
    name: "Wykluczenie cyfrowe",
    finding:
      "Brief wymienia wykluczenie cyfrowe wśród wyzwań Małopolski, a wymagania narzędzia formułuje tak, by samo nie pogłębiało problemu: docelowo ma spełniać standard dostępności cyfrowej WCAG 2.1 na poziomie AA, aby mogli z niego korzystać seniorzy oraz osoby z niepełnosprawnościami.",
    matters:
      "Dla mieszkańca o niskich umiejętnościach cyfrowych decyduje to, czy w ogóle dotrze do informacji. Dla instytucji — brief ocenia, czy mieszkaniec w różnym wieku i bez przygotowania technicznego potrafi samodzielnie wypełnić moduły i odnaleźć informacje.",
  },
  {
    id: "struktura-osadnicza",
    name: "Zmiana struktury osadniczej regionu",
    finding:
      "Brief opisuje zmianę struktury osadniczej jako depopulację większości obszarów regionu przy jednoczesnym dynamicznym wzroście liczby ludności w wybranych gminach wokół aglomeracji krakowskiej.",
    matters:
      "Dla mieszkańca oznacza to inną dostępność usług w gminie wyludniającej się i w gminie szybko rosnącej. Dla instytucji — to samo rozwiązanie nie pasuje do obu sytuacji, więc dobór innowacji wymaga uwzględnienia lokalnego kontekstu.",
  },
  {
    id: "mikrorozwiazania-bez-skali",
    name: "Mikro-rozwiązania bez drogi do skali",
    finding:
      "Brief stwierdza, że w regionie działa wiele oddolnych inicjatyw tworzących wartościowe mikro-rozwiązania, ale większość z nich nie ma narzędzi do rozwoju i skalowania pomysłów, co uniemożliwia ich wdrożenie w skali całego regionu. Brakuje miejsca, które w usystematyzowany sposób łączyłoby diagnozowanie problemów, rozwój pomysłów, testowanie innowacji, upowszechnianie sprawdzonych rozwiązań i budowanie partnerstw.",
    matters:
      "Dla mieszkańca i organizacji to ryzyko, że dobry lokalny pomysł zostanie tam, gdzie powstał. Dla instytucji — trudniej skorzystać z tego, co już gdzieś zadziałało, zamiast szukać rozwiązania od zera.",
  },
];

/** Osobny blok: zasięg danych jest ogólnopolski, więc nie opisuje kondycji Małopolski. */
export const NATIONWIDE_MAP = {
  title: "Mapa Wyzwań Społecznych — dane ogólnopolskie",
  finding:
    "Opracowanie Działu Innowacji Społecznych ROPS w Krakowie, przygotowane na potrzeby projektu „Inkubator Włączenia Społecznego 2.0”. Obejmuje osiem obszarów: rodzina i piecza zastępcza, bezdomność, niepełnosprawność, ubóstwo, integracja cudzoziemców, zdrowie, zdrowie psychiczne oraz seniorzy. Dla każdego obszaru podaje definicję i analizę danych zastanych.",
  caveat:
    "Dane w Mapie mają charakter ogólnopolski, więc nie są wskaźnikami dla Małopolski. Traktuj je jako tło problemu, nie jako diagnozę regionu.",
  url: "https://rops.krakow.pl/mpliki/IS/IWS_20/za._nr_2._Mapa_Wyzwa_Spoecznych.pdf",
} as const;

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
export const CHALLENGE_SOURCE = "Brief wyzwania, ROPS Kraków — materiał dla uczestników HackYeah 2026";

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

/**
 * Diagnoza Małopolski w danych — ustalenia z raportu „Ocena zasobów pomocy społecznej
 * województwa małopolskiego za rok 2025” (ROPS w Krakowie), odczytanego 4 października 2026
 * z wersji tekstowych opublikowanych na stronie raportu. Liczby przepisano dokładnie ze źródła;
 * niczego nie przeliczono ani nie dopisano. Porównania z Polską są tylko tam, gdzie podaje je
 * samo źródło, i są wprost oznaczone jako dane ogólnopolskie.
 */
export interface ReportSource { title: string; url: string }
export interface ReportFinding {
  id: string;
  theme: string;
  finding: string;
  /** Okres i zasięg danych wprost ze źródła. */
  year: number;
  period: string;
  scope: "woj. małopolskie";
  /** Wartość ogólnopolska podana przez to samo źródło — nie opisuje regionu. */
  nationalComparison?: string;
  source: ReportSource;
}

const OZPS_2025: ReportSource = {
  title: "Ocena zasobów pomocy społecznej województwa małopolskiego za rok 2025 — wybrane dane (ROPS w Krakowie)",
  url: "https://rops.krakow.pl/pliki-do-pobrania/wpis,alternatywa-tekstowa-do-ozps-wm-za-rok-2025-wybrane-dane,1487",
};
const PIECZA_2025: ReportSource = {
  title: "Piecza zastępcza w Małopolsce w 2025 r. — wybrane dane (ROPS w Krakowie)",
  url: "https://rops.krakow.pl/pliki-do-pobrania/wpis,alternatywa-tekstowa-do-piecza-zastepcza-w-malopolsce-w-2025-r-wybrane-dane,1486",
};
/** Pełny raport w wersji dostępnej (PDF, ok. 10 MB) i strona raportu. */
export const OZPS_REPORT_PAGE = "https://rops.krakow.pl/badania-analizy-raporty/ocena-zasobow-pomocy-spolecznej-w-woj-malopolskim/biezaca-ocena";

export const REPORT_FINDINGS: ReportFinding[] = [
  {
    id: "demografia-2025",
    theme: "Mniej urodzeń",
    finding: "W 2025 r. województwo zamieszkiwało 3,43 mln osób. Zarejestrowano 25,6 tys. urodzeń żywych — o 3,7% mniej niż rok wcześniej. Współczynnik przyrostu naturalnego wyniósł minus 2,0 na 1 tys. mieszkańców (w 2024 r. minus 1,8).",
    year: 2025, period: "rok 2025", scope: "woj. małopolskie",
    nationalComparison: "Współczynnik przyrostu naturalnego dla Polski: minus 4,5.",
    source: OZPS_2025,
  },
  {
    id: "seniorzy-2025",
    theme: "Przybywa seniorów",
    finding: "W 2025 r. w Małopolsce mieszkało 852,6 tys. osób powyżej 60. roku życia — o 11 tys. więcej niż w 2024 r. To 24,9% mieszkańców. Osoby powyżej 80. roku życia stanowiły 17,6% osób powyżej 60. roku życia (wskaźnik podwójnego starzenia).",
    year: 2025, period: "rok 2025", scope: "woj. małopolskie", source: OZPS_2025,
  },
  {
    id: "klienci-2025",
    theme: "Kto korzysta z pomocy społecznej",
    finding: "Pomocą społeczną objęto 90,3 tys. osób, czyli 2,6% mieszkańców — o prawie 3,5 tys. osób mniej niż rok wcześniej. Skorzystało z niej prawie 14 tys. rodzin z dziećmi, o 625 mniej niż w 2024 r.",
    year: 2025, period: "rok 2025", scope: "woj. małopolskie",
    nationalComparison: "Odsetek osób korzystających z pomocy społecznej w Polsce: 3,2%.",
    source: OZPS_2025,
  },
  {
    id: "przyczyny-2025",
    theme: "Główne przyczyny pomocy",
    finding: "Najczęstsze przyczyny udzielania pomocy (odsetek klientów): długotrwała lub ciężka choroba — 54,0%, ubóstwo — 44,7%, niepełnosprawność — 37,3%, ochrona macierzyństwa — 29,1%, bezrobocie — 26,9%. Odsetki nie sumują się do 100%.",
    year: 2025, period: "rok 2025", scope: "woj. małopolskie", source: OZPS_2025,
  },
  {
    id: "powiaty-2025",
    theme: "Różnice między powiatami",
    finding: "Udział osób korzystających z pomocy społecznej w ludności powiatu był najwyższy w powiatach gorlickim (6,4%, o 0,38 punktu procentowego więcej niż w 2024 r.), nowosądeckim (5,0%) i limanowskim (4,8%), a najniższy w krakowskim (1,5%), wielickim (1,6%) i w Krakowie (1,8%).",
    year: 2025, period: "rok 2025", scope: "woj. małopolskie", source: OZPS_2025,
  },
  {
    id: "uslugi-2012-2025",
    theme: "Więcej usług dziennych i środowiskowych",
    finding: "W sektorze publicznym między 2012 a 2025 r. liczba placówek wsparcia dziennego dla dzieci i młodzieży wzrosła ze 122 do 218, klubów samopomocy z 10 do 93, dziennych domów pomocy dla seniorów z 7 do 46, a środowiskowych domów samopomocy z 74 do 87.",
    year: 2025, period: "lata 2012–2025, sektor publiczny", scope: "woj. małopolskie", source: OZPS_2025,
  },
  {
    id: "kadra-2025",
    theme: "Obciążenie pracowników socjalnych",
    finding: "W ośrodkach pomocy społecznej i centrach usług społecznych pracowało 1 663 pracowników socjalnych. Na jednego pracownika socjalnego przypadało średnio 2 092 mieszkańców oraz 23 rodziny objęte pracą socjalną.",
    year: 2025, period: "rok 2025", scope: "woj. małopolskie", source: OZPS_2025,
  },
  {
    id: "koszty-2025",
    theme: "Koszty opieki",
    finding: "Nakłady na pomoc społeczną i inne obszary polityki społecznej wyniosły łącznie ponad 4,5 mld zł. Przeciętny miesięczny koszt jednego miejsca wynosił 8 214 zł w domu pomocy społecznej i 1 977 zł w dziennym domu pomocy dla seniorów. Gminy wydały 396,1 mln zł na odpłatność za pobyt mieszkańców w domach pomocy społecznej.",
    year: 2025, period: "rok 2025", scope: "woj. małopolskie", source: OZPS_2025,
  },
  {
    id: "piecza-2025",
    theme: "Dzieci w pieczy zastępczej",
    finding: "Na koniec 2025 r. w rodzinnej pieczy zastępczej przebywało 3 214 dzieci, a w 97 placówkach opiekuńczo-wychowawczych — 1 138 wychowanków. Dzieci trafiały do rodzin zastępczych najczęściej z powodu bezradności wychowawczej rodziców (32,8%) i uzależnienia rodziców (32,8%); do placówek — głównie z powodu bezradności wychowawczej rodziców (58,5%).",
    year: 2025, period: "stan na koniec 2025 r.", scope: "woj. małopolskie", source: PIECZA_2025,
  },
];

-- ==============================================================================
-- MIGRATION 11: ZARZĄDZANIE ZASOBNIKIEM WIEDZY (KNOWLEDGE RESOURCES) & DANE INNOWACJI
-- HubMI / ROPS Kraków (HackYeah 2026)
--
-- Zakres migracji:
-- 1. Oznaczenie pochodzenia i jawnej demonstracyjności rekordów innowacji (is_demonstrative, source_label).
-- 2. Tabela public.knowledge_resources: raporty, diagnozy, materiały edukacyjne, karty wyzwań i zweryfikowane materiały filmowe.
-- 3. RLS: publiczny odczyt wyłącznie dla 'opublikowany', pełny dostęp dla ról ROPS Kraków i service_role.
-- 4. Zweryfikowany zestaw startowy autentycznych zasobów ROPS Kraków.
-- ==============================================================================

-- 1. OZNACZENIE PROWENIENCJI I ŹRÓDEŁ DLA INNOWACJI
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS is_demonstrative BOOLEAN DEFAULT false;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS source_label TEXT DEFAULT 'ROPS Kraków';

-- Aktualizacja istniejących rekordów demonstracyjnych
UPDATE public.innovations
SET is_demonstrative = true,
    source_label = 'ROPS Kraków – Baza Innowacji Społecznych (wzorzec demonstracyjny)'
WHERE id LIKE 'inv_%';

-- 2. TABELA ZASOBÓW WIEDZY (ZASOBNIK WIEDZY ROPS)
CREATE TABLE IF NOT EXISTS public.knowledge_resources (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL DEFAULT 'materialy-edukacyjne',
    group_title TEXT NOT NULL DEFAULT 'Materiały edukacyjne',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'Dokument PDF',
    url TEXT NOT NULL,
    year INTEGER,
    coverage_scope TEXT,
    caveat TEXT,
    status TEXT NOT NULL DEFAULT 'roboczy' CHECK (status IN ('roboczy', 'do_weryfikacji', 'zweryfikowany', 'opublikowany')),
    verified_by TEXT,
    verified_at TIMESTAMPTZ,
    published_by TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indeksy dla filtrowania i paginacji
CREATE INDEX IF NOT EXISTS idx_knowledge_resources_status ON public.knowledge_resources (status);
CREATE INDEX IF NOT EXISTS idx_knowledge_resources_group ON public.knowledge_resources (group_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_resources_kind ON public.knowledge_resources (kind);

-- 3. POLITYKI ROW LEVEL SECURITY (RLS)
ALTER TABLE public.knowledge_resources ENABLE ROW LEVEL SECURITY;

-- Odczyt publiczny (anon / uwierzytelnieni): wyłącznie zasoby o statusie 'opublikowany'
DROP POLICY IF EXISTS "Public read published knowledge resources" ON public.knowledge_resources;
CREATE POLICY "Public read published knowledge resources"
ON public.knowledge_resources FOR SELECT
USING (status = 'opublikowany');

-- Panel Administratora ROPS Kraków: pełny dostęp do wszystkich rekordów
DROP POLICY IF EXISTS "ROPS Admin manages knowledge resources" ON public.knowledge_resources;
CREATE POLICY "ROPS Admin manages knowledge resources"
ON public.knowledge_resources FOR ALL
TO authenticated
USING (
    COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin'
    OR COALESCE(auth.jwt()->'app_metadata'->>'role', '') = 'rops_admin'
)
WITH CHECK (
    COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin'
    OR COALESCE(auth.jwt()->'app_metadata'->>'role', '') = 'rops_admin'
);

-- Dostęp service_role dla operacji backendowych i zadań administracyjnych
DROP POLICY IF EXISTS "Service role manages knowledge resources" ON public.knowledge_resources;
CREATE POLICY "Service role manages knowledge resources"
ON public.knowledge_resources FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. ZWERYFIKOWANY ZESTAW STARTOWY ZASOBÓW WIEDZY ROPS KRAKÓW (MVP)
INSERT INTO public.knowledge_resources (
    id, group_id, group_title, title, description, kind, url, year, coverage_scope, caveat, status, published_at
) VALUES
(
    'mapa-wyzwan-spolecznych',
    'mapa-wyzwan',
    'Mapa Wyzwań Społecznych',
    'Mapa Wyzwań Społecznych',
    'Opracowanie Działu Innowacji Społecznych ROPS w Krakowie, przygotowane na potrzeby projektu „Inkubator Włączenia Społecznego 2.0”. Obejmuje osiem obszarów: rodzina i piecza zastępcza, bezdomność, niepełnosprawność, ubóstwo, integracja cudzoziemców, zdrowie, zdrowie psychiczne oraz seniorzy. Dla każdego obszaru podaje definicję i analizę danych zastanych.',
    'Dokument PDF',
    'https://rops.krakow.pl/mpliki/IS/IWS_20/za._nr_2._Mapa_Wyzwa_Spoecznych.pdf',
    2024,
    'ogólnopolski',
    NULL,
    'opublikowany',
    now()
),
(
    'raporty-z-badan',
    'raporty-diagnozy',
    'Raporty i diagnozy społeczne',
    'Raporty z badań',
    'Raporty badawcze ROPS do pobrania, m.in. „Wyzwania i potrzeby sektora opiekuńczego w Małopolsce” (2026) oraz „Usługi społeczne w Małopolsce – deficyty, potrzeby, potencjał rozwojowy” (2025). Opracowania opisują skalę zjawisk i dostęp mieszkańców regionu do pomocy i wsparcia. Publikacje udostępniono na licencji CC BY 4.0.',
    'Pliki do pobrania',
    'https://rops.krakow.pl/badania-analizy-raporty/raporty-z-badan',
    2026,
    'woj. małopolskie',
    NULL,
    'opublikowany',
    now()
),
(
    'ocena-zasobow',
    'raporty-diagnozy',
    'Raporty i diagnozy społeczne',
    'Ocena zasobów pomocy społecznej województwa małopolskiego',
    'Coroczne opracowanie realizowane zgodnie z obowiązkiem ustawowym. Raport przedstawia podstawowe informacje o sytuacji społecznej i demograficznej regionu. Najnowsza edycja za 2025 r. jest udostępniona również w wersji dostępnej dla osób ze szczególnymi potrzebami, wraz z alternatywą tekstową.',
    'Raport roczny',
    'https://rops.krakow.pl/badania-analizy-raporty/ocena-zasobow-pomocy-spolecznej-w-woj-malopolskim/biezaca-ocena',
    2025,
    'woj. małopolskie',
    NULL,
    'opublikowany',
    now()
),
(
    'ioss',
    'raporty-diagnozy',
    'Raporty i diagnozy społeczne',
    'Internetowy Obserwator Statystyk Społecznych',
    'Ogólnodostępny serwis wizualizujący wskaźniki społeczne. Wybraną statystykę można przeglądać na mapie, w tabeli i na wykresie oraz analizować na przestrzeni lat. Obejmuje dane o demografii, zdrowiu, rynku pracy, edukacji, pomocy społecznej, pieczy zastępczej i kulturze.',
    'Serwis z danymi',
    'https://rops.krakow.pl/badania-analizy-raporty/internetowy-obserwator-statystyk-spolecznych',
    2026,
    'woj. małopolskie',
    NULL,
    'opublikowany',
    now()
),
(
    'social-innovation-canvas',
    'materialy-edukacyjne',
    'Materiały edukacyjne o innowacjach społecznych',
    'Social Innovation Canvas',
    'Plansza warsztatowa do rozpisania pomysłu na innowację społeczną. Prowadzi przez problem i jego intensywność, aktorów zmiany, przystępność i wartość rozwiązania oraz strukturę kosztów stałych. Przy każdej sekcji podaje pytania pomocnicze.',
    'Plansza PDF',
    'https://rops.krakow.pl/mpliki/IS/Moj_folder/INNO_AGH_-_SOCIAL_CANVAS.pdf',
    2024,
    'ogólnopolski',
    NULL,
    'opublikowany',
    now()
),
(
    'publikacje-ze-swiata-innowacji',
    'materialy-edukacyjne',
    'Materiały edukacyjne o innowacjach społecznych',
    'Publikacje ze świata innowacji',
    'Publikacje ROPS podsumowujące kolejne inkubatory, m.in. „Połącz kropki, czyli o sile innowacji społecznych w obszarze włączenia społecznego”, „Innowacje społeczne dla dostępności” oraz „Przewodnik po innowacjach społecznych” o tym, czy i jak administracja publiczna może inkubować innowacje.',
    'Pliki do pobrania',
    'https://rops.krakow.pl/innowacje-spoleczne/publikacje-ze-swiata-innowacji',
    2025,
    'regionalny i krajowy',
    NULL,
    'opublikowany',
    now()
),
(
    'biblioteka-innowacji',
    'materialy-edukacyjne',
    'Materiały edukacyjne o innowacjach społecznych',
    'Biblioteka Innowacji Społecznych',
    'Innowacje inkubowane przez ROPS, pogrupowane według odbiorców: seniorzy, dzieci, młodzież i rodzina, osoby o ograniczonej mobilności, osoby z niepełnosprawnością sensoryczną i intelektualną, zdrowie i medycyna, rynek pracy, cudzoziemcy oraz osoby w kryzysie bezdomności.',
    'Katalog na stronie ROPS',
    'https://rops.krakow.pl/innowacje-spoleczne/biblioteka-innowacji-spolecznych/kategorie',
    2026,
    'woj. małopolskie',
    'ROPS informuje na tej stronie, że jest ona w przebudowie i część odnośników może być nieaktywna.',
    'opublikowany',
    now()
),
(
    'innowacje-w-modelach',
    'materialy-edukacyjne',
    'Materiały edukacyjne o innowacjach społecznych',
    'Innowacje w małopolskich modelach',
    'Przegląd innowacji społecznych, które weszły do Małopolskich Modeli Usług Społecznych, wraz z opisem gotowych do wykorzystania rozwiązań, takich jak „Organizator kompleksowej opieki w miejscu zamieszkania”.',
    'Strona tematyczna',
    'https://rops.krakow.pl/innowacje-spoleczne/innowacje-w-malopolskich-modelach',
    2025,
    'woj. małopolskie',
    NULL,
    'opublikowany',
    now()
),
(
    'video-inkubator-iws',
    'filmy-i-dobre-praktyki',
    'Filmy i dobre praktyki',
    'Inkubator Włączenia Społecznego – Filmy i dobre praktyki',
    'Zweryfikowana baza materiałów filmowych i dobrych praktyk wdrożeniowych innowacji społecznych w gminach Małopolski. Prezentuje doświadczenia innowatorów oraz metodykę skalowania rozwiązań.',
    'Materiał filmowy (wideo)',
    'https://rops.krakow.pl/innowacje-spoleczne/filmy-i-dobre-praktyki',
    2025,
    'woj. małopolskie',
    'Materiały wideo udostępnione w serwisie ROPS Kraków.',
    'opublikowany',
    now()
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    group_id = EXCLUDED.group_id,
    group_title = EXCLUDED.group_title,
    kind = EXCLUDED.kind,
    url = EXCLUDED.url,
    year = EXCLUDED.year,
    coverage_scope = EXCLUDED.coverage_scope,
    caveat = EXCLUDED.caveat,
    status = EXCLUDED.status,
    updated_at = now();

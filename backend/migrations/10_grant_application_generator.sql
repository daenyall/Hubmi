-- ==============================================================================
-- MIGRACJA 10: GENERATOR WNIOSKÓW DLA KONKRETNEGO NABORU (ROPS KRAKÓW / HUBMI)
-- Punkt 8 MVP: Generator wniosków grantowych na innowacje społeczne
--
-- Zgodność ze wzorem: Załącznik nr 3 do Ogłoszenia projektu „Inkubator Włączenia Społecznego 2.0”
-- Działanie 5.1: Innowacje społeczne Program FERS 2021-2027
--
-- Funkcjonalności:
-- 1. Konfiguracja naboru: nazwa, wzór, wersja i stan otwarty/zamknięty/demonstracyjny.
-- 2. Struktura wniosku: 12 sekcji zgodnych z oficjalnym wzorem (dane wnioskodawcy, opis,
--    innowacyjność, diagnoza, grupa docelowa, zmiana, wizja, plan i koszty, wnioskowana kwota,
--    zespół projektowy, oświadczenia prawne).
-- 3. Izolacja danych autorów: wnioskodawca widzi i edytuje WYŁĄCZNIE własne wnioski (auth.uid() = user_id).
-- 4. Ochrona przed modyfikacją po złożeniu: wniosek ze statusem 'zlozony' jest tylko do odczytu dla autora.
-- 5. Wgląd ROPS Kraków: administratorzy ROPS mają wgląd we wszystkie wnioski i możliwość ich oceny.
-- ==============================================================================

-- 1. TABELA KONFIGURACJI NABORÓW GRANTOWYCH
CREATE TABLE IF NOT EXISTS public.grant_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    template_name VARCHAR(100) NOT NULL DEFAULT 'za._3._Formularz_aplikacyjny_wzor.pdf',
    template_version VARCHAR(50) NOT NULL DEFAULT '1.0',
    status VARCHAR(50) NOT NULL DEFAULT 'demonstracyjny' CHECK (status IN ('otwarty', 'zamkniety', 'demonstracyjny')),
    description TEXT,
    max_grant_amount NUMERIC(12, 2) NOT NULL DEFAULT 100000.00 CHECK (max_grant_amount > 0),
    max_prep_months INT NOT NULL DEFAULT 3 CHECK (max_prep_months BETWEEN 1 AND 6),
    max_test_months INT NOT NULL DEFAULT 9 CHECK (max_test_months BETWEEN 1 AND 18),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TABELA WNIOSKÓW GRANTOWYCH
CREATE TABLE IF NOT EXISTS public.grant_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES public.grant_calls(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'roboczy' CHECK (status IN ('roboczy', 'zlozony', 'w_ocenie', 'zaakceptowany', 'odrzucony')),
    
    -- Typ wnioskodawcy
    applicant_type VARCHAR(50) NOT NULL DEFAULT 'osoba_fizyczna' CHECK (applicant_type IN ('osoba_fizyczna', 'podmiot', 'grupa_nieformalna')),
    
    -- 1. Tytuł innowacji
    title VARCHAR(255) NOT NULL DEFAULT '',
    
    -- 2. Dane wnioskodawcy (struktura JSONB dla osoby fizycznej, podmiotu lub grupy nieformalnej)
    applicant_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- 3-8. Sekcje merytoryczne wniosku
    innovation_description TEXT NOT NULL DEFAULT '',
    innovativeness TEXT NOT NULL DEFAULT '',
    problem_diagnosis TEXT NOT NULL DEFAULT '',
    target_group_description TEXT NOT NULL DEFAULT '',
    expected_change TEXT NOT NULL DEFAULT '',
    future_vision TEXT NOT NULL DEFAULT '',
    
    -- 9. Plan działania i koszty (okres przygotowawczy do 3 msc, okres testowania do 9 msc)
    action_plan JSONB NOT NULL DEFAULT '{"prep_period": [], "test_period": []}'::jsonb,
    
    -- 10. Wnioskowana kwota grantu (musi odpowiadać sumie kosztów z planu działania)
    grant_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (grant_amount >= 0),
    
    -- 11. Zespół projektowy i jego doświadczenie
    project_team TEXT NOT NULL DEFAULT '',
    
    -- 12. Oświadczenia prawne wnioskodawcy (wymóg świadomego zaznaczenia)
    declarations JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Pola administracyjne ROPS
    submitted_at TIMESTAMPTZ DEFAULT NULL,
    rops_notes TEXT DEFAULT NULL,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_grant_applications_user_id ON public.grant_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_grant_applications_call_id ON public.grant_applications(call_id);
CREATE INDEX IF NOT EXISTS idx_grant_applications_status ON public.grant_applications(status);
CREATE INDEX IF NOT EXISTS idx_grant_calls_status ON public.grant_calls(status);

-- 3. POLITYKI BEZPIECZEŃSTWA (RLS)
ALTER TABLE public.grant_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_applications ENABLE ROW LEVEL SECURITY;

-- Polityki dla grant_calls:
-- Publiczny odczyt konfiguracji naborów
CREATE POLICY "Public read grant calls"
ON public.grant_calls FOR SELECT
TO public
USING (true);

-- Zarządzanie naborami: wyłącznie rops_admin i service_role
CREATE POLICY "ROPS manage grant calls"
ON public.grant_calls FOR ALL
TO public
USING (
    COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin'
    OR COALESCE(auth.jwt()->>'role', '') = 'rops_admin'
    OR auth.role() = 'service_role'
);

-- Polityki dla grant_applications:
-- 1. Odczyt: autor widzi tylko swoje wnioski, administrator ROPS i service_role widzą wszystkie
CREATE POLICY "Authors and ROPS read grant applications"
ON public.grant_applications FOR SELECT
TO public
USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin'
    OR COALESCE(auth.jwt()->>'role', '') = 'rops_admin'
    OR auth.role() = 'service_role'
);

-- 2. Tworzenie: zalogowany wnioskodawca tworzy wniosek ze swoim własnym user_id
CREATE POLICY "Authors can insert grant applications"
ON public.grant_applications FOR INSERT
TO public
WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR auth.role() = 'service_role'
);

-- 3. Aktualizacja: autor może edytować WYŁĄCZNIE własny wniosek w statusie 'roboczy'
CREATE POLICY "Authors can update draft grant applications"
ON public.grant_applications FOR UPDATE
TO public
USING (
    ((auth.uid() IS NOT NULL AND auth.uid() = user_id) AND status = 'roboczy')
    OR COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin'
    OR COALESCE(auth.jwt()->>'role', '') = 'rops_admin'
    OR auth.role() = 'service_role'
);

-- 4. Usuwanie: autor może usunąć wyłącznie własny draft 'roboczy'
CREATE POLICY "Authors can delete draft grant applications"
ON public.grant_applications FOR DELETE
TO public
USING (
    ((auth.uid() IS NOT NULL AND auth.uid() = user_id) AND status = 'roboczy')
    OR auth.role() = 'service_role'
);

-- 4. SEED: Domyślny nabór demonstracyjny na bazie oficjalnego Załącznika nr 3 ROPS Kraków
INSERT INTO public.grant_calls (
    id,
    name,
    template_name,
    template_version,
    status,
    description,
    max_grant_amount,
    max_prep_months,
    max_test_months
) VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'Inkubator Włączenia Społecznego 2.0 – Nabór Pomysłów na Innowacje Społeczne (ROPS Kraków)',
    'za._3._Formularz_aplikacyjny_wzor.pdf',
    '1.0',
    'demonstracyjny',
    'Oficjalny wzór naboru grantowego na innowacje społeczne (Działanie 5.1 FERS 2021-2027) organizowany przez Regionalny Ośrodek Polityki Społecznej w Krakowie. Nabór demonstracyjny umożliwiający przygotowanie, walidację i eksport wniosku.',
    100000.00,
    3,
    9
) ON CONFLICT (id) DO NOTHING;

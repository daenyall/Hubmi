-- ==============================================================================
-- MIGRACJA 04: MODUŁ TESTERA INNOWACJI SPOŁECZNYCH (ROPS KRAKÓW / MOSTMI)
-- Punkt IV Wyzwania ROPS: pilotaże w gminach, feedback, oceny i rekomendacje
-- ==============================================================================

-- 1. TABELA ZGŁOSZEŃ CHĘCI TESTOWANIA W GMINIE / INSTYTUCJI
CREATE TABLE IF NOT EXISTS public.innovation_test_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    innovation_id TEXT NOT NULL REFERENCES public.innovations(id) ON DELETE CASCADE,
    tester_type TEXT NOT NULL DEFAULT 'JST',          -- 'JST', 'CUS', 'NGO', 'Mieszkaniec', 'Inna'
    institution_name TEXT NOT NULL,                   -- np. 'Gmina Wieliczka', 'CUS Tarnów'
    contact_person TEXT NOT NULL,                     -- Imię i nazwisko koordynatora
    contact_email TEXT NOT NULL,                      -- Email do kontaktu
    contact_phone TEXT,                               -- Numer telefonu
    testing_scope TEXT NOT NULL DEFAULT 'pilotaz_3m', -- 'warsztaty', 'pilotaz_1m', 'pilotaz_3m', 'wdrozenie_pelne'
    target_audience_count INT DEFAULT 20,             -- Szacunkowa liczba odbiorców
    status TEXT NOT NULL DEFAULT 'nowe',              -- 'nowe', 'zaakceptowane', 'w_trakcie', 'zakonczone', 'odrzucone'
    notes TEXT,                                       -- Notatka urzędowa ROPS
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Indeks pod szybkie zapytania po statusie i innowacji
CREATE INDEX IF NOT EXISTS test_applications_inv_idx 
ON public.innovation_test_applications (innovation_id, status);


-- 2. TABELA FORMULARZY OCEN I FEEDBACKU Z TESTÓW
CREATE TABLE IF NOT EXISTS public.innovation_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    innovation_id TEXT NOT NULL REFERENCES public.innovations(id) ON DELETE CASCADE,
    application_id UUID REFERENCES public.innovation_test_applications(id) ON DELETE SET NULL,
    rating_usability INT NOT NULL CHECK (rating_usability BETWEEN 1 AND 5),      -- Łatwość wdrożenia
    rating_effectiveness INT NOT NULL CHECK (rating_effectiveness BETWEEN 1 AND 5), -- Skuteczność dla odbiorców
    rating_accessibility INT NOT NULL CHECK (rating_accessibility BETWEEN 1 AND 5), -- Dostępność (WCAG/OzN/seniorzy)
    pros TEXT,                                        -- Mocne strony rozwiązania
    cons_and_barriers TEXT,                           -- Napotkane bariery (transport, finanse, opór)
    suggested_improvements TEXT,                      -- Rekomendacje dla ROPS i innych gmin
    would_recommend BOOLEAN NOT NULL DEFAULT TRUE,    -- Czy gmina poleca to rozwiązanie innym?
    author_name TEXT NOT NULL,                        -- Imię/rola wystawiającego opinię
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Indeks pod pobieranie recenzji dla innowacji
CREATE INDEX IF NOT EXISTS feedback_inv_idx 
ON public.innovation_feedback (innovation_id, created_at DESC);


-- 3. POLITYKI BEZPIECZEŃSTWA (RLS)
ALTER TABLE public.innovation_test_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.innovation_feedback ENABLE ROW LEVEL SECURITY;

-- Każdy może zgłosić chęć testowania
CREATE POLICY "Anyone can apply to test" 
ON public.innovation_test_applications FOR INSERT 
TO public 
WITH CHECK (true);

-- Odczyt aplikacji testowych: publiczny odczyt lub admin ROPS
CREATE POLICY "Public read test applications" 
ON public.innovation_test_applications FOR SELECT 
TO public 
USING (true);

-- Zarządzanie statusem aplikacji testowej: wyłącznie Admin ROPS / service_role
CREATE POLICY "Admins manage test applications" 
ON public.innovation_test_applications FOR UPDATE 
TO public 
USING (
    auth.jwt()->>'email' LIKE '%@rops.krakow.pl' 
    OR auth.jwt()->>'role' = 'rops_admin' 
    OR auth.role() = 'service_role'
);

-- Oceny i feedback: publiczny odczyt (transparentność bazy wiedzy ROPS)
CREATE POLICY "Public read feedback" 
ON public.innovation_feedback FOR SELECT 
TO public 
USING (true);

-- Dodawanie ocen z testów:
CREATE POLICY "Anyone can submit feedback" 
ON public.innovation_feedback FOR INSERT 
TO public 
WITH CHECK (true);

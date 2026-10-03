-- ==============================================================================
-- MOSTMI / SPLOT MAŁOPOLSKI — SUPABASE SCHEMA
-- Wyzwanie ROPS Kraków (HackYeah 2026)
-- ==============================================================================

-- 1. WŁĄCZENIE ROZSZERZENIA PGVECTOR
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. TABELA INNOWACJI SPOŁECZNYCH (Baza wiedzy ROPS)
CREATE TABLE IF NOT EXISTS public.innovations (
    id TEXT PRIMARY KEY,                          -- np. 'inv_01', 'inv_02'
    title TEXT NOT NULL,                          -- Nazwa innowacji
    description TEXT NOT NULL,                    -- Pełny opis rozwiązania
    target_group TEXT NOT NULL,                   -- Grupa docelowa (np. Seniorzy 65+, osoby z niepełnosprawnością)
    category TEXT NOT NULL DEFAULT 'Inne',        -- Kategoria (np. 'Seniorzy', 'Dostępność', 'Zdrowie psychiczne', 'Włączenie cyfrowe')
    why_relevant TEXT,                            -- Skrót dlaczego warto / rezultaty
    source_url TEXT,                              -- Link do strony ROPS / materiałów
    status TEXT NOT NULL DEFAULT 'sprawdzone',    -- 'sprawdzone', 'w testach', 'nowa'
    author_or_institution TEXT DEFAULT 'ROPS Kraków',
    embedding vector(1536),                       -- Wektor z modelu text-embedding-3-small (1536 wymiarów)
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Indeks HNSW pod szybkie wyszukiwanie podobieństwa cosinusowego
CREATE INDEX IF NOT EXISTS innovations_embedding_hnsw_idx 
ON public.innovations 
USING hnsw (embedding vector_cosine_ops);


-- 3. TABELA ZGŁOSZEŃ / FISZEK POMYSŁÓW (Pracownicy JST / NGO / Mieszkańcy)
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_description TEXT NOT NULL,            -- Zgłoszony problem lokalny
    matched_innovation_id TEXT REFERENCES public.innovations(id) ON DELETE SET NULL,
    applicant_type TEXT NOT NULL DEFAULT 'JST',   -- 'JST', 'NGO', 'CUS', 'Mieszkaniec'
    applicant_name TEXT,                          -- Imię i nazwisko zgłaszającego
    applicant_email TEXT,                         -- Email do kontaktu
    institution_name TEXT,                        -- np. 'Gmina Zabierzów', 'CUS Tarnów', 'Fundacja Pomocy'
    status TEXT NOT NULL DEFAULT 'nowe',          -- 'nowe', 'weryfikacja', 'zaakceptowane', 'odrzucone'
    official_response TEXT,                       -- Odpowiedź zwrotna od urzędnika ROPS
    notes TEXT,                                   -- Dodatkowe uwagi
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);


-- 4. TABELA WIADOMOŚCI / DIALOGU ROPS <-> INNOWATOR (Platforma komunikacji)
CREATE TABLE IF NOT EXISTS public.submission_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL DEFAULT 'applicant', -- 'applicant', 'rops_admin', 'mentor'
    sender_name TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);


-- 5. FUNKCJA RPC DO MATCHMAKINGU WEKTOROWEGO (Wywoływana przez FastAPI)
CREATE OR REPLACE FUNCTION match_innovations (
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.25,
    match_count INT DEFAULT 4
)
RETURNS TABLE (
    id TEXT,
    title TEXT,
    description TEXT,
    target_group TEXT,
    category TEXT,
    why_relevant TEXT,
    source_url TEXT,
    status TEXT,
    similarity_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.id,
        i.title,
        i.description,
        i.target_group,
        i.category,
        i.why_relevant,
        i.source_url,
        i.status,
        ROUND((1 - (i.embedding <=> query_embedding))::NUMERIC, 4)::FLOAT AS similarity_score
    FROM public.innovations i
    WHERE i.embedding IS NOT NULL
      AND (1 - (i.embedding <=> query_embedding)) >= match_threshold
    ORDER BY i.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;


-- 6. POLITYKI BEZPIECZEŃSTWA (RLS - Row Level Security)
-- Pozwalają frontendowi Next.js czytać innowacje i dodawać fiszki bezpośrednio

ALTER TABLE public.innovations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_messages ENABLE ROW LEVEL SECURITY;

-- Odczyt innowacji: PUBLICZNY (każdy może przeglądać bazę innowacji)
CREATE POLICY "Public read innovations" 
ON public.innovations FOR SELECT 
USING (true);

-- Zapis innowacji: Tylko rola service_role (np. skrypt seedujący w Pythonie)
CREATE POLICY "Service role manages innovations" 
ON public.innovations FOR ALL 
USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- Odczyt i dodawanie fiszek: Publiczny dostęp dla użytkowników demo
CREATE POLICY "Public read and write submissions" 
ON public.submissions FOR ALL 
USING (true) 
WITH CHECK (true);

-- Odczyt i dodawanie wiadomości w dialogu fiszki:
CREATE POLICY "Public read and write messages" 
ON public.submission_messages FOR ALL 
USING (true) 
WITH CHECK (true);

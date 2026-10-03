-- ==============================================================================
-- MIGRATION 06: ENFORCE VERIFIED INNOVATIONS VISIBILITY & RPC FILTERING
-- MostMI / ROPS Kraków (HackYeah 2026)
--
-- Zgodnie z punktem 2 audytu:
-- 1. RPC match_innovations filtruje status 'sprawdzone' przed ORDER BY i LIMIT,
--    aby nieopublikowane szkice nie wypierały opublikowanych innowacji z wyników.
-- 2. Polityka RLS na tabeli innovations zezwala na publiczny odczyt (anon / zwykli
--    użytkownicy) wyłącznie dla rekordów ze statusem 'sprawdzone'.
-- 3. Pracownicy ROPS (app_metadata->>hubmi_role = 'rops_admin') oraz service_role
--    mają pełen dostęp do odczytu i modyfikacji wszystkich innowacji w każdym statusie.
-- ==============================================================================

-- 1. Aktualizacja funkcji RPC match_innovations z filtrowaniem statusu
DROP FUNCTION IF EXISTS public.match_innovations(vector, float, int);
DROP FUNCTION IF EXISTS public.match_innovations(vector, float, int, text);

CREATE OR REPLACE FUNCTION public.match_innovations (
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.20,
    match_count INT DEFAULT 4,
    filter_category TEXT DEFAULT NULL
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
SECURITY DEFINER
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
        GREATEST(0.0, LEAST(1.0, ROUND((1 - (i.embedding <=> query_embedding))::NUMERIC, 4)))::FLOAT AS similarity_score
    FROM public.innovations i
    WHERE i.embedding IS NOT NULL
      AND i.status = 'sprawdzone'
      AND (1 - (i.embedding <=> query_embedding)) >= match_threshold
      AND (filter_category IS NULL OR i.category = filter_category)
    ORDER BY i.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;

-- 2. Ścisła polityka Row Level Security (RLS) dla tabeli innovations
ALTER TABLE public.innovations ENABLE ROW LEVEL SECURITY;

-- Usunięcie wcześniejszej, zbyt szerokiej polityki SELECT (USING true)
DROP POLICY IF EXISTS "Public read innovations" ON public.innovations;
DROP POLICY IF EXISTS "Public read verified innovations" ON public.innovations;
DROP POLICY IF EXISTS "ROPS and service role manage innovations" ON public.innovations;

-- Publiczny odczyt: tylko status 'sprawdzone', chyba że użytkownik jest rops_admin lub service_role
CREATE POLICY "Public read verified innovations" 
ON public.innovations FOR SELECT 
TO public 
USING (
    status = 'sprawdzone'
    OR auth.role() = 'service_role'
    OR (COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin')
);

-- Pełne zarządzanie (INSERT, UPDATE, DELETE) dla ROPS admin i service_role
CREATE POLICY "ROPS and service role manage innovations" 
ON public.innovations FOR ALL 
TO authenticated, service_role 
USING (
    auth.role() = 'service_role'
    OR (COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin')
)
WITH CHECK (
    auth.role() = 'service_role'
    OR (COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin')
);

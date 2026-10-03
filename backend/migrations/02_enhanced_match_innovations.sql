-- ==============================================================================
-- MIGRATION 02: ENHANCED MATCH INNOVATIONS RPC WITH CATEGORY FILTER & BOUNDS
-- MostMI / ROPS Kraków (HackYeah 2026)
-- ==============================================================================

-- 1. Usunięcie starej wersji (zapobiega konfliktom przeciążenia funkcji w PostgREST)
DROP FUNCTION IF EXISTS public.match_innovations(vector, float, int);
DROP FUNCTION IF EXISTS public.match_innovations(vector, float, int, text);

-- 2. Utworzenie ulepszonej funkcji RPC z opcjonalnym filtrowaniem po kategorii
CREATE OR REPLACE FUNCTION match_innovations (
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
      AND (1 - (i.embedding <=> query_embedding)) >= match_threshold
      AND (filter_category IS NULL OR i.category = filter_category)
    ORDER BY i.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;

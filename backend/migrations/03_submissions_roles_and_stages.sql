-- ==============================================================================
-- MIGRACJA 03: SUBMISSIONS ROLES, STAGES & EVENTS (ROPS KRAKÓW / MOSTMI)
-- Zgodność z modelem frontendu, obsługa statusów, ról i audytu zdarzeń
-- ==============================================================================

-- 1. DODANIE BRAKUJĄCYCH KOLUMN DO TABELI SUBMISSIONS
ALTER TABLE public.submissions 
ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Fiszka innowacji społecznej',
ADD COLUMN IF NOT EXISTS solution_description TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS target_group TEXT DEFAULT 'Mieszkańcy Małopolski',
ADD COLUMN IF NOT EXISTS implementation_stage TEXT NOT NULL DEFAULT 'pomysl';

-- Ograniczenie dopuszczalnych etapów realizacji
ALTER TABLE public.submissions 
DROP CONSTRAINT IF EXISTS submissions_implementation_stage_check;

ALTER TABLE public.submissions 
ADD CONSTRAINT submissions_implementation_stage_check 
CHECK (implementation_stage IN ('pomysl', 'prototyp', 'pilotaz', 'wdrozenie'));

-- Ograniczenie dopuszczalnych statusów
ALTER TABLE public.submissions 
DROP CONSTRAINT IF EXISTS submissions_status_check;

ALTER TABLE public.submissions 
ADD CONSTRAINT submissions_status_check 
CHECK (status IN ('nowe', 'weryfikacja', 'zaakceptowane', 'odrzucone'));


-- 2. TABELA DZIENNIKA ZDARZEŃ I POWIADOMIEŃ (AUDIT LOG / WEBHOOK EVENTS)
CREATE TABLE IF NOT EXISTS public.submission_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by TEXT NOT NULL DEFAULT 'rops_admin',
    comment TEXT,
    webhook_dispatched BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Indeks pod szybkie pobieranie historii zmian zgłoszenia
CREATE INDEX IF NOT EXISTS submission_events_sub_idx 
ON public.submission_events (submission_id, created_at DESC);

-- RLS dla tabeli submission_events
ALTER TABLE public.submission_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and authors view submission events" ON public.submission_events;
CREATE POLICY "Admins and authors view submission events" 
ON public.submission_events FOR SELECT 
TO public 
USING (
    EXISTS (
        SELECT 1 FROM public.submissions s 
        WHERE s.id = submission_events.submission_id
          AND (
              (auth.uid() IS NOT NULL AND auth.uid() = s.user_id)
              OR (auth.jwt()->>'email' LIKE '%@rops.krakow.pl' OR auth.jwt()->>'role' = 'rops_admin' OR auth.role() = 'service_role')
          )
    )
);

DROP POLICY IF EXISTS "Service role and admins insert submission events" ON public.submission_events;
CREATE POLICY "Service role and admins insert submission events" 
ON public.submission_events FOR INSERT 
TO public 
WITH CHECK (
    auth.jwt()->>'email' LIKE '%@rops.krakow.pl' 
    OR auth.jwt()->>'role' = 'rops_admin' 
    OR auth.role() = 'service_role'
);

-- ==============================================================================
-- MIGRACJA 05: UNIFIED HUBMI CORE (ROPS KRAKÓW / SUPABASE)
-- Pełna fiszka, właściciel z sesji, nadawca wiadomości z serwera,
-- rola ROPS z app_metadata.hubmi_role, ochrona statusu/pól urzędowych i RLS.
-- ==============================================================================

-- 1. ROZSZERZENIE TABELI PUBLIC.SUBMISSIONS
ALTER TABLE public.submissions 
ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid(),
ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Fiszka innowacji społecznej',
ADD COLUMN IF NOT EXISTS solution_description TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS target_group TEXT NOT NULL DEFAULT 'Mieszkańcy Małopolski',
ADD COLUMN IF NOT EXISTS implementation_stage TEXT NOT NULL DEFAULT 'pomysl';

-- Ustawienie domyślnego auth.uid() dla user_id
ALTER TABLE public.submissions 
ALTER COLUMN user_id SET DEFAULT auth.uid();

-- Ograniczenie dopuszczalnych etapów realizacji (etap 2 i 3)
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

-- Ograniczenie długości oficjalnej odpowiedzi (do 10000 znaków)
ALTER TABLE public.submissions 
DROP CONSTRAINT IF EXISTS submissions_official_response_check;

ALTER TABLE public.submissions 
ADD CONSTRAINT submissions_official_response_check 
CHECK (official_response IS NULL OR char_length(official_response) <= 10000);


-- 2. TRIGGER OCHRONY PÓL URZĘDOWYCH I WŁAŚCICIELA DLA SUBMISSIONS
CREATE OR REPLACE FUNCTION public.protect_submission_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Klient authenticated (Supabase SDK)
        IF auth.role() = 'authenticated' THEN
            NEW.user_id := auth.uid();
            NEW.status := 'nowe';
            NEW.official_response := NULL;
        ELSE
            -- service_role / backend FastAPI
            IF NEW.user_id IS NULL THEN
                NEW.user_id := auth.uid();
            END IF;
            IF NEW.status IS NULL THEN
                NEW.status := 'nowe';
            END IF;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Ochrona przed modyfikacją statusu, odpowiedzi i właściciela przez zwykłego autora
        IF NOT (
            auth.role() = 'service_role' 
            OR (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
        ) THEN
            IF NEW.status IS DISTINCT FROM OLD.status THEN
                RAISE EXCEPTION 'Tylko pracownik ROPS Kraków może zmieniać status zgłoszenia.';
            END IF;
            IF NEW.official_response IS DISTINCT FROM OLD.official_response THEN
                RAISE EXCEPTION 'Tylko pracownik ROPS Kraków może dodawać lub edytować oficjalną odpowiedź.';
            END IF;
            IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
                RAISE EXCEPTION 'Nie można modyfikować właściciela zgłoszenia.';
            END IF;
        END IF;
    END IF;
    NEW.updated_at := TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_submission_fields ON public.submissions;
CREATE TRIGGER trg_protect_submission_fields
BEFORE INSERT OR UPDATE ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.protect_submission_fields();


-- 3. ROZSZERZENIE I ZABEZPIECZENIE TABELI PUBLIC.SUBMISSION_MESSAGES
ALTER TABLE public.submission_messages
ADD COLUMN IF NOT EXISTS sender_id UUID DEFAULT auth.uid();

-- Walidacja długości wiadomości (1-5000 znaków)
ALTER TABLE public.submission_messages 
DROP CONSTRAINT IF EXISTS submission_messages_message_check;

ALTER TABLE public.submission_messages 
ADD CONSTRAINT submission_messages_message_check 
CHECK (char_length(trim(message)) BETWEEN 1 AND 5000);

-- TRIGGER SERWEROWEGO USTALANIA NADAWCY DLA SUBMISSION_MESSAGES
CREATE OR REPLACE FUNCTION public.set_submission_message_sender()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() = 'authenticated' THEN
        NEW.sender_id := auth.uid();
        IF (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin') THEN
            NEW.sender_role := 'rops_admin';
            NEW.sender_name := COALESCE(NULLIF(NEW.sender_name, ''), auth.jwt()->>'email', 'Pracownik ROPS');
        ELSE
            NEW.sender_role := 'applicant';
            NEW.sender_name := COALESCE(NULLIF(NEW.sender_name, ''), auth.jwt()->>'email', 'Wnioskodawca');
        END IF;
    ELSE
        -- service_role / backend FastAPI
        IF NEW.sender_id IS NULL THEN
            NEW.sender_id := COALESCE(auth.uid(), gen_random_uuid());
        END IF;
        IF NEW.sender_role IS NULL THEN
            NEW.sender_role := 'applicant';
        END IF;
        IF NEW.sender_name IS NULL OR trim(NEW.sender_name) = '' THEN
            NEW.sender_name := CASE WHEN NEW.sender_role = 'rops_admin' THEN 'Pracownik ROPS' ELSE 'Wnioskodawca' END;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_submission_message_sender ON public.submission_messages;
CREATE TRIGGER trg_set_submission_message_sender
BEFORE INSERT ON public.submission_messages
FOR EACH ROW EXECUTE FUNCTION public.set_submission_message_sender();


-- 4. POLITYKI RLS (ROW LEVEL SECURITY)
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.innovations ENABLE ROW LEVEL SECURITY;

-- Submissions SELECT: autor lub pracownik ROPS lub service_role
DROP POLICY IF EXISTS "Authors and ROPS view submissions" ON public.submissions;
DROP POLICY IF EXISTS "Authors and Admins view submissions" ON public.submissions;
DROP POLICY IF EXISTS "Public read submissions" ON public.submissions;

CREATE POLICY "Authors and ROPS view submissions" 
ON public.submissions FOR SELECT 
TO public 
USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
    OR auth.role() = 'service_role'
);

-- Submissions INSERT: tylko zalogowany autor dla własnego user_id lub service_role
DROP POLICY IF EXISTS "Anyone can create submission" ON public.submissions;
DROP POLICY IF EXISTS "Authenticated users create submissions" ON public.submissions;

CREATE POLICY "Authenticated users create submissions" 
ON public.submissions FOR INSERT 
TO authenticated, service_role 
WITH CHECK (
    auth.role() = 'service_role' 
    OR (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()))
);

-- Submissions UPDATE: tylko ROPS lub service_role
DROP POLICY IF EXISTS "Admins manage submissions" ON public.submissions;
DROP POLICY IF EXISTS "ROPS manage submissions" ON public.submissions;

CREATE POLICY "ROPS manage submissions" 
ON public.submissions FOR UPDATE 
TO authenticated, service_role 
USING (
    (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
    OR auth.role() = 'service_role'
);

-- Submission Messages SELECT: tylko autor powiązanego zgłoszenia lub ROPS lub service_role
DROP POLICY IF EXISTS "Participants view messages" ON public.submission_messages;

CREATE POLICY "Participants view messages" 
ON public.submission_messages FOR SELECT 
TO authenticated, service_role 
USING (
    auth.role() = 'service_role'
    OR (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
    OR EXISTS (
        SELECT 1 FROM public.submissions s 
        WHERE s.id = submission_messages.submission_id
          AND s.user_id = auth.uid()
    )
);

-- Submission Messages INSERT: tylko autor powiązanego zgłoszenia lub ROPS lub service_role
DROP POLICY IF EXISTS "Participants send messages" ON public.submission_messages;

CREATE POLICY "Participants send messages" 
ON public.submission_messages FOR INSERT 
TO authenticated, service_role 
WITH CHECK (
    auth.role() = 'service_role'
    OR (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
    OR EXISTS (
        SELECT 1 FROM public.submissions s 
        WHERE s.id = submission_messages.submission_id
          AND s.user_id = auth.uid()
    )
);

-- Innovations: SELECT publiczny, zapis wyłącznie ROPS lub service_role
DROP POLICY IF EXISTS "Public read innovations" ON public.innovations;
CREATE POLICY "Public read innovations" 
ON public.innovations FOR SELECT 
TO public 
USING (true);

DROP POLICY IF EXISTS "Service role manages innovations" ON public.innovations;
DROP POLICY IF EXISTS "ROPS and service role manage innovations" ON public.innovations;
CREATE POLICY "ROPS and service role manage innovations" 
ON public.innovations FOR ALL 
TO authenticated, service_role 
USING (
    auth.role() = 'service_role'
    OR (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
);


-- 5. TABELE MODUŁU TESTERA INNOWACJI SPOŁECZNYCH W GMINACH
CREATE TABLE IF NOT EXISTS public.innovation_test_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    innovation_id TEXT NOT NULL REFERENCES public.innovations(id) ON DELETE CASCADE,
    applicant_id UUID DEFAULT auth.uid(),
    tester_type TEXT NOT NULL DEFAULT 'JST',
    institution_name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT,
    testing_scope TEXT NOT NULL DEFAULT 'pilotaz_3m',
    target_audience_count INT DEFAULT 20,
    status TEXT NOT NULL DEFAULT 'nowe',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE IF NOT EXISTS public.innovation_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    innovation_id TEXT NOT NULL REFERENCES public.innovations(id) ON DELETE CASCADE,
    application_id UUID REFERENCES public.innovation_test_applications(id) ON DELETE SET NULL,
    rating_usability INT NOT NULL CHECK (rating_usability BETWEEN 1 AND 5),
    rating_effectiveness INT NOT NULL CHECK (rating_effectiveness BETWEEN 1 AND 5),
    rating_accessibility INT NOT NULL CHECK (rating_accessibility BETWEEN 1 AND 5),
    pros TEXT,
    cons_and_barriers TEXT,
    suggested_improvements TEXT,
    would_recommend BOOLEAN NOT NULL DEFAULT TRUE,
    author_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.innovation_test_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.innovation_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can apply to test" ON public.innovation_test_applications;
CREATE POLICY "Anyone can apply to test" 
ON public.innovation_test_applications FOR INSERT 
TO public 
WITH CHECK (true);

DROP POLICY IF EXISTS "ROPS and owners read test applications" ON public.innovation_test_applications;
CREATE POLICY "ROPS and owners read test applications" 
ON public.innovation_test_applications FOR SELECT 
TO public 
USING (
    (auth.uid() IS NOT NULL AND auth.uid() = applicant_id)
    OR (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
    OR auth.role() = 'service_role'
);

DROP POLICY IF EXISTS "Admins manage test applications" ON public.innovation_test_applications;
CREATE POLICY "Admins manage test applications" 
ON public.innovation_test_applications FOR UPDATE 
TO public 
USING (
    (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
    OR auth.role() = 'service_role'
);

DROP POLICY IF EXISTS "Public read feedback" ON public.innovation_feedback;
CREATE POLICY "Public read feedback" 
ON public.innovation_feedback FOR SELECT 
TO public 
USING (true);

DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.innovation_feedback;
CREATE POLICY "Anyone can submit feedback" 
ON public.innovation_feedback FOR INSERT 
TO public 
WITH CHECK (true);

-- 6. ODŚWIEŻENIE CACHE SCHEMATU POSTGREST
NOTIFY pgrst, 'reload schema';

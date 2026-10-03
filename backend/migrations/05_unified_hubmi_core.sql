-- ==============================================================================
-- MIGRACJA 05: UNIFIED HUBMI CORE (ROPS KRAKÓW / SUPABASE) - WERSJA UTWARDZONA
-- 
-- Zabezpieczenia:
-- 1. Pełna fiszka z defaultem user_id = auth.uid()
-- 2. Serwerowy sender_id, sender_role i sender_name (klient nie może podszyć tożsamości)
-- 3. Ochrona statusu, official_response, user_id i notes przed autorem (trigger + RLS)
-- 4. Bezwzględna blokada kont anonimowych (is_anonymous=true) w triggerach i RLS
-- 5. Całkowite wyczyszczenie wszystkich historycznych otwartych polityk RLS
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

-- Ograniczenie długości oficjalnej odpowiedzi (do 10000 znaków)
ALTER TABLE public.submissions 
DROP CONSTRAINT IF EXISTS submissions_official_response_check;

ALTER TABLE public.submissions 
ADD CONSTRAINT submissions_official_response_check 
CHECK (official_response IS NULL OR char_length(official_response) <= 10000);


-- 2. TRIGGER OCHRONY PÓL URZĘDOWYCH, NOTES I WŁAŚCICIELA DLA SUBMISSIONS
CREATE OR REPLACE FUNCTION public.protect_submission_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- A) Blokada kont anonimowych Supabase Auth (is_anonymous=true)
    IF COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) IS TRUE THEN
        RAISE EXCEPTION 'Konta anonimowe nie posiadają uprawnień do operacji na zgłoszeniach.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Klient authenticated (Supabase SDK / PostgREST)
        IF auth.role() = 'authenticated' THEN
            IF auth.uid() IS NULL THEN
                RAISE EXCEPTION 'Operacja wymaga zalogowanego użytkownika (brak auth.uid).';
            END IF;
            -- Wymuszenie tożsamości z sesji i reset pól urzędowych
            NEW.user_id := auth.uid();
            NEW.status := 'nowe';
            NEW.official_response := NULL;
            NEW.notes := NULL; -- Ochrona notes: autor nie może nadawać notatek urzędowych
        ELSIF auth.role() = 'service_role' THEN
            -- service_role / backend FastAPI
            IF NEW.user_id IS NULL THEN
                NEW.user_id := auth.uid();
            END IF;
            IF NEW.status IS NULL THEN
                NEW.status := 'nowe';
            END IF;
        ELSE
            RAISE EXCEPTION 'Brak uprawnień do utworzenia zgłoszenia.';
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Ochrona przed modyfikacją statusu, odpowiedzi, notatek i właściciela przez zwykłego autora
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
            IF NEW.notes IS DISTINCT FROM OLD.notes THEN
                RAISE EXCEPTION 'Tylko pracownik ROPS Kraków może edytować notatki urzędowe.';
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
    -- A) Blokada kont anonimowych Supabase Auth (is_anonymous=true)
    IF COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) IS TRUE THEN
        RAISE EXCEPTION 'Konta anonimowe nie posiadają uprawnień do wysyłania wiadomości.';
    END IF;

    IF auth.role() = 'authenticated' THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Wysyłanie wiadomości wymaga aktywnej sesji użytkownika.';
        END IF;

        NEW.sender_id := auth.uid();

        -- SERWEROWE sender_name i sender_role: całkowicie ignorujemy dane podane przez klienta!
        IF (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin') THEN
            NEW.sender_role := 'rops_admin';
            NEW.sender_name := COALESCE(auth.jwt()->>'email', 'Pracownik ROPS');
        ELSE
            NEW.sender_role := 'applicant';
            NEW.sender_name := COALESCE(auth.jwt()->>'email', 'Wnioskodawca');
        END IF;

    ELSIF auth.role() = 'service_role' THEN
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
    ELSE
        RAISE EXCEPTION 'Brak uprawnień do wysłania wiadomości.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_submission_message_sender ON public.submission_messages;
CREATE TRIGGER trg_set_submission_message_sender
BEFORE INSERT ON public.submission_messages
FOR EACH ROW EXECUTE FUNCTION public.set_submission_message_sender();


-- 4. CAŁKOWITE USUNIĘCIE WSZYSTKICH STARYCH I NIEBEZPIECZNYCH POLITYK RLS
-- Submissions
DROP POLICY IF EXISTS "Public read and write submissions" ON public.submissions;
DROP POLICY IF EXISTS "Public submissions access" ON public.submissions;
DROP POLICY IF EXISTS "Public read submissions" ON public.submissions;
DROP POLICY IF EXISTS "Anyone can create submission" ON public.submissions;
DROP POLICY IF EXISTS "Authors view own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Authors and Admins view submissions" ON public.submissions;
DROP POLICY IF EXISTS "Authors and ROPS view submissions" ON public.submissions;
DROP POLICY IF EXISTS "Authors update own draft submissions" ON public.submissions;
DROP POLICY IF EXISTS "Admins manage submissions" ON public.submissions;
DROP POLICY IF EXISTS "ROPS manage submissions" ON public.submissions;
DROP POLICY IF EXISTS "Admins delete submissions" ON public.submissions;
DROP POLICY IF EXISTS "Authenticated users create submissions" ON public.submissions;

-- Submission messages
DROP POLICY IF EXISTS "Public read and write messages" ON public.submission_messages;
DROP POLICY IF EXISTS "Public submission messages access" ON public.submission_messages;
DROP POLICY IF EXISTS "Participants view messages" ON public.submission_messages;
DROP POLICY IF EXISTS "Participants send messages" ON public.submission_messages;

-- Innovations
DROP POLICY IF EXISTS "Public read innovations" ON public.innovations;
DROP POLICY IF EXISTS "Service role manages innovations" ON public.innovations;
DROP POLICY IF EXISTS "ROPS and service role manage innovations" ON public.innovations;

-- Submission events
DROP POLICY IF EXISTS "Admins and authors view submission events" ON public.submission_events;
DROP POLICY IF EXISTS "Service role and admins insert submission events" ON public.submission_events;


-- 5. NOWE, SZCZELNE POLITYKI BEZPIECZEŃSTWA (RLS)
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.innovations ENABLE ROW LEVEL SECURITY;

-- Submissions SELECT: tylko autor (nie-anonimowy) lub pracownik ROPS (app_metadata) lub service_role
CREATE POLICY "Authors and ROPS view submissions" 
ON public.submissions FOR SELECT 
TO authenticated, service_role 
USING (
    auth.role() = 'service_role'
    OR (
        COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) IS FALSE
        AND (
            (auth.uid() IS NOT NULL AND auth.uid() = user_id)
            OR (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
        )
    )
);

-- Submissions INSERT: tylko zweryfikowany użytkownik dla własnego user_id (konta anonimowe zablokowane)
CREATE POLICY "Authenticated users create submissions" 
ON public.submissions FOR INSERT 
TO authenticated, service_role 
WITH CHECK (
    auth.role() = 'service_role' 
    OR (
        auth.uid() IS NOT NULL 
        AND COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) IS FALSE
        AND (user_id IS NULL OR user_id = auth.uid())
    )
);

-- Submissions UPDATE: wyłącznie pracownik ROPS lub service_role
CREATE POLICY "ROPS manage submissions" 
ON public.submissions FOR UPDATE 
TO authenticated, service_role 
USING (
    auth.role() = 'service_role'
    OR (
        COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) IS FALSE
        AND (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
    )
);

-- Submission Messages SELECT: autor powiązanego zgłoszenia lub ROPS (konta anonimowe zablokowane)
CREATE POLICY "Participants view messages" 
ON public.submission_messages FOR SELECT 
TO authenticated, service_role 
USING (
    auth.role() = 'service_role'
    OR (
        COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) IS FALSE
        AND (
            (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
            OR EXISTS (
                SELECT 1 FROM public.submissions s 
                WHERE s.id = submission_messages.submission_id
                  AND s.user_id = auth.uid()
            )
        )
    )
);

-- Submission Messages INSERT: autor powiązanego zgłoszenia lub ROPS (konta anonimowe zablokowane)
CREATE POLICY "Participants send messages" 
ON public.submission_messages FOR INSERT 
TO authenticated, service_role 
WITH CHECK (
    auth.role() = 'service_role'
    OR (
        COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) IS FALSE
        AND (
            (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
            OR EXISTS (
                SELECT 1 FROM public.submissions s 
                WHERE s.id = submission_messages.submission_id
                  AND s.user_id = auth.uid()
            )
        )
    )
);

-- Innovations: SELECT publiczny, zapis wyłącznie ROPS lub service_role
CREATE POLICY "Public read innovations" 
ON public.innovations FOR SELECT 
TO public 
USING (true);

CREATE POLICY "ROPS and service role manage innovations" 
ON public.innovations FOR ALL 
TO authenticated, service_role 
USING (
    auth.role() = 'service_role'
    OR (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
);


-- 6. TABELE MODUŁU TESTERA INNOWACJI SPOŁECZNYCH W GMINACH
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

DROP POLICY IF EXISTS "Public read test applications" ON public.innovation_test_applications;
DROP POLICY IF EXISTS "ROPS and owners read test applications" ON public.innovation_test_applications;

CREATE POLICY "ROPS and owners read test applications" 
ON public.innovation_test_applications FOR SELECT 
TO authenticated, service_role 
USING (
    auth.role() = 'service_role'
    OR (
        COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) IS FALSE
        AND (
            (auth.uid() IS NOT NULL AND auth.uid() = applicant_id)
            OR (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
        )
    )
);

DROP POLICY IF EXISTS "Admins manage test applications" ON public.innovation_test_applications;
CREATE POLICY "Admins manage test applications" 
ON public.innovation_test_applications FOR UPDATE 
TO authenticated, service_role 
USING (
    auth.role() = 'service_role'
    OR (
        COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) IS FALSE
        AND (auth.jwt()->'app_metadata'->>'hubmi_role' = 'rops_admin')
    )
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

-- 7. ODŚWIEŻENIE CACHE SCHEMATU POSTGREST
NOTIFY pgrst, 'reload schema';

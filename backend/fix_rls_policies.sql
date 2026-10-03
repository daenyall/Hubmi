-- ==============================================================================
-- FIX RLS POLICIES FOR PRIVATE SUBMISSIONS & MESSAGES (MostMI / ROPS Kraków)
-- Zabezpieczenie prywatnych zgłoszeń i uprawnień Administratora ROPS
-- ==============================================================================

-- 1. DODANIE KOLUMN BEZPIECZEŃSTWA DO TABELI SUBMISSIONS (jeśli nie istnieją)
ALTER TABLE public.submissions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS access_token TEXT DEFAULT encode(gen_random_bytes(16), 'hex');

-- 2. USUNIĘCIE STARYCH, ZBYT OTWARTYCH POLITYK
DROP POLICY IF EXISTS "Public read and write submissions" ON public.submissions;
DROP POLICY IF EXISTS "Public read and write messages" ON public.submission_messages;

-- 3. BEZPIECZNE POLITYKI DLA TABELI SUBMISSIONS

-- A) Każdy może złożyć nowe zgłoszenie / fiszkę (INSERT)
CREATE POLICY "Anyone can create submission" 
ON public.submissions FOR INSERT 
TO public 
WITH CHECK (true);

-- B) Autor widzi TYLKO swoje zgłoszenie (zalogowany po user_id LUB anonimowy z poprawnym access_token)
CREATE POLICY "Authors view own submissions" 
ON public.submissions FOR SELECT 
TO public 
USING (
    -- 1. Użytkownik zalogowany widzi swoje:
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    -- 2. Dostęp przez unikalny token dostępu fiszki:
    OR (access_token IS NOT NULL AND access_token = COALESCE(current_setting('request.headers', true)::json->>'x-submission-token', ''))
    -- 3. Administrator ROPS lub klucz serwisowy:
    OR (auth.jwt()->>'email' LIKE '%@rops.krakow.pl' OR auth.jwt()->>'role' = 'rops_admin' OR auth.role() = 'service_role')
);

-- C) Tylko Administrator ROPS lub service_role może modyfikować status i odpowiedź:
CREATE POLICY "Admins manage submissions" 
ON public.submissions FOR UPDATE 
TO public 
USING (
    auth.jwt()->>'email' LIKE '%@rops.krakow.pl' 
    OR auth.jwt()->>'role' = 'rops_admin' 
    OR auth.role() = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = user_id AND status = 'nowe')
);

-- D) Usuwanie zgłoszeń: wyłącznie Administrator ROPS / service_role:
CREATE POLICY "Admins delete submissions" 
ON public.submissions FOR DELETE 
TO public 
USING (
    auth.jwt()->>'email' LIKE '%@rops.krakow.pl' 
    OR auth.jwt()->>'role' = 'rops_admin' 
    OR auth.role() = 'service_role'
);


-- 4. BEZPIECZNE POLITYKI DLA TABELI SUBMISSION_MESSAGES (Czat / Dialog przy fiszce)

-- A) Odczyt wiadomości: tylko dozwolony dla autora powiązanego zgłoszenia lub admina ROPS:
CREATE POLICY "Participants view messages" 
ON public.submission_messages FOR SELECT 
TO public 
USING (
    EXISTS (
        SELECT 1 FROM public.submissions s 
        WHERE s.id = submission_messages.submission_id
          AND (
              (auth.uid() IS NOT NULL AND auth.uid() = s.user_id)
              OR (s.access_token IS NOT NULL AND s.access_token = COALESCE(current_setting('request.headers', true)::json->>'x-submission-token', ''))
              OR (auth.jwt()->>'email' LIKE '%@rops.krakow.pl' OR auth.jwt()->>'role' = 'rops_admin' OR auth.role() = 'service_role')
          )
    )
);

-- B) Dodawanie wiadomości do wątku:
CREATE POLICY "Participants send messages" 
ON public.submission_messages FOR INSERT 
TO public 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.submissions s 
        WHERE s.id = submission_messages.submission_id
          AND (
              (auth.uid() IS NOT NULL AND auth.uid() = s.user_id)
              OR (s.access_token IS NOT NULL AND s.access_token = COALESCE(current_setting('request.headers', true)::json->>'x-submission-token', ''))
              OR (auth.jwt()->>'email' LIKE '%@rops.krakow.pl' OR auth.jwt()->>'role' = 'rops_admin' OR auth.role() = 'service_role')
          )
    )
);

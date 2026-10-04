-- ==============================================================================
-- MIGRATION 08: FIX USER_ID SPOOFING AND ENFORCE IDENTITY BOUNDARY (PUNKT 7)
-- HubMI / ROPS Kraków (HackYeah 2026)
--
-- Naprawa podatności podszywania się pod cudzy user_id:
-- 1. Gość (auth.uid() IS NULL) bezwzględnie otrzymuje user_id = NULL.
--    Nawet jeśli przekaże cudzy identyfikator (np. Autora A), trigger nadpisuje go na NULL,
--    a polityka RLS WITH CHECK blokuje próbę zapisu z niezerowym user_id.
-- 2. Zalogowany użytkownik (auth.uid() IS NOT NULL) otrzymuje user_id = auth.uid().
--    Nawet jeśli przekaże user_id innego autora (np. Autora B), trigger nadpisuje go na auth.uid(),
--    a polityka RLS uniemożliwia przypisanie zgłoszenia komukolwiek innemu.
-- 3. Tylko rops_admin oraz service_role po kryptograficznej weryfikacji tożsamości
--    mogą zachować jawnie przekazany user_id.
-- 4. Ochrona pól administracyjnych (status, rops_internal_notes, reviewed_by, reviewed_at)
--    pozostaje w pełni aktywna.
-- 5. Migracja nie kasuje i nie modyfikuje istniejących rekordów w tabeli community_needs.
-- ==============================================================================

-- 1. Aktualizacja funkcji triggera z bezwzględnym wymuszeniem granic tożsamości
CREATE OR REPLACE FUNCTION public.trg_enforce_community_needs_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Uprawnieni administratorzy ROPS oraz service_role backendu zachowują przekazany kontekst
    IF (auth.role() = 'service_role' OR COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin') THEN
        RETURN NEW;
    END IF;

    -- Dla wszystkich pozostałych żądań bezwzględnie wymuś bezpieczne wartości domyślne:
    NEW.status := 'nowe';
    NEW.rops_internal_notes := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.created_at := now();
    NEW.updated_at := now();

    -- BEZWZGLĘDNA BLOKADA PODSZYWANIA SIĘ POD CUDZY USER_ID:
    -- Jeśli użytkownik jest zalogowany -> przypisz jego prawdziwy identyfikator sesji auth.uid()
    -- Jeśli użytkownik jest niezalogowanym gościem -> user_id MUSI wynosić NULL
    IF auth.uid() IS NOT NULL THEN
        NEW.user_id := auth.uid();
    ELSE
        NEW.user_id := NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- 2. Reinstalacja triggera na tabeli community_needs
DROP TRIGGER IF EXISTS trg_community_needs_security ON public.community_needs;
CREATE TRIGGER trg_community_needs_security
BEFORE INSERT OR UPDATE ON public.community_needs
FOR EACH ROW
EXECUTE FUNCTION public.trg_enforce_community_needs_security();

-- 3. Aktualizacja polityki RLS INSERT z rygorystycznym sprawdzeniem tożsamości
DROP POLICY IF EXISTS "Public and users can insert needs" ON public.community_needs;

CREATE POLICY "Public and users can insert needs"
ON public.community_needs FOR INSERT 
TO anon, authenticated
WITH CHECK (
    -- Blokada próby bezpośredniego wstrzyknięcia innych statusów i notatek administracyjnych
    (status IS NULL OR status = 'nowe')
    AND (rops_internal_notes IS NULL OR rops_internal_notes = '')
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    -- Zabezpieczenie tożsamości na poziomie RLS:
    AND (
        -- Niezalogowany gość może zapisać rekord wyłącznie z user_id IS NULL
        (auth.uid() IS NULL AND user_id IS NULL)
        OR
        -- Zalogowany użytkownik może zapisać wyłącznie z user_id równym swojemu auth.uid() lub NULL (trigger ustawi na auth.uid())
        (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()))
    )
);

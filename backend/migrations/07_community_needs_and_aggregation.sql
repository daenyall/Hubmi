-- ==============================================================================
-- MIGRATION 07: COMMUNITY NEEDS COLLECTION AND REGIONAL AGGREGATION (PUNKT 7)
-- HubMI / ROPS Kraków (HackYeah 2026)
--
-- Moduł zbierania oddolnych potrzeb społecznych od samorządów (JST, CUS, OPS)
-- i NGO oraz agregacji regionalnej dla kadry analitycznej ROPS Kraków.
--
-- ZABEZPIECZENIA I RLS:
-- 1. Ochrona pól administracyjnych (status, rops_internal_notes, reviewed_by, reviewed_at)
--    przed podrobieniem w bezpośrednim zapytaniu INSERT przez Supabase SDK.
-- 2. Trigger BEFORE INSERT gwarantuje wymuszenie wartości domyślnych dla ról innych niż rops_admin/service_role.
-- 3. Pełny odczyt i agregacja dostępna WYŁĄCZNIE dla użytkowników z uprawnieniem rops_admin lub service_role.
-- 4. Zwykły zalogowany wnioskodawca (autor) ma wgląd WYŁĄCZNIE do własnych zgłoszeń (auth.uid() = user_id).
-- 5. Niezalogowany gość ma prawo wyłącznie wysłać zgłoszenie (INSERT), bez prawa odczytu (SELECT).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.community_needs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Dane jednostki zgłaszającej
    institution_name VARCHAR(255) NOT NULL,
    institution_type VARCHAR(50) NOT NULL DEFAULT 'JST',
    powiat VARCHAR(100) NOT NULL,
    gmina VARCHAR(100),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),

    -- Treść wyzwania społecznego
    category VARCHAR(100) NOT NULL,
    target_group VARCHAR(255) NOT NULL DEFAULT 'Mieszkańcy',
    problem_summary VARCHAR(255) NOT NULL,
    detailed_description TEXT NOT NULL,
    estimated_affected_count INT DEFAULT 0 CHECK (estimated_affected_count >= 0),
    urgency_level VARCHAR(20) NOT NULL DEFAULT 'sredni',

    -- Pola administracyjne ROPS
    status VARCHAR(50) NOT NULL DEFAULT 'nowe',
    rops_internal_notes TEXT DEFAULT NULL,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ DEFAULT NULL
);

-- Indeksy dla wydajnej agregacji i filtrowania regionalnego
CREATE INDEX IF NOT EXISTS idx_community_needs_powiat ON public.community_needs(powiat);
CREATE INDEX IF NOT EXISTS idx_community_needs_category ON public.community_needs(category);
CREATE INDEX IF NOT EXISTS idx_community_needs_status ON public.community_needs(status);
CREATE INDEX IF NOT EXISTS idx_community_needs_created_at ON public.community_needs(created_at);
CREATE INDEX IF NOT EXISTS idx_community_needs_user_id ON public.community_needs(user_id);

-- Trigger do automatycznej ochrony pól administracyjnych przy INSERT
CREATE OR REPLACE FUNCTION public.trg_enforce_community_needs_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Jeśli operację wykonuje rops_admin lub service_role, zachowaj przekazane wartości
    IF (auth.role() = 'service_role' OR COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin') THEN
        RETURN NEW;
    END IF;

    -- Dla każdego publicznego/zwykłego użytkownika bezwzględnie wymuś wartości bezpieczne:
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

DROP TRIGGER IF EXISTS trg_community_needs_security ON public.community_needs;
CREATE TRIGGER trg_community_needs_security
BEFORE INSERT OR UPDATE ON public.community_needs
FOR EACH ROW
EXECUTE FUNCTION public.trg_enforce_community_needs_security();

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.community_needs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public and users can insert needs" ON public.community_needs;
DROP POLICY IF EXISTS "ROPS Admin full management on community needs" ON public.community_needs;
DROP POLICY IF EXISTS "Authors can view own submitted needs" ON public.community_needs;

-- 1. Zapis (INSERT): dozwolony dla anon i authenticated z blokadą podszywania się pod user_id
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
        (auth.uid() IS NULL AND user_id IS NULL)
        OR
        (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()))
    )
);

-- 2. Odczyt (SELECT): 
-- Zwykły użytkownik widzi wyłącznie własne zgłoszone potrzeby (auth.uid() = user_id)
CREATE POLICY "Authors can view own submitted needs"
ON public.community_needs FOR SELECT 
TO authenticated
USING (
    user_id IS NOT NULL AND auth.uid() = user_id
);

-- 3. Pełny dostęp dla ROPS Admin i Service Role (SELECT, UPDATE, DELETE)
CREATE POLICY "ROPS Admin full management on community needs"
ON public.community_needs FOR ALL 
TO authenticated, service_role
USING (
    auth.role() = 'service_role'
    OR (COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin')
)
WITH CHECK (
    auth.role() = 'service_role'
    OR (COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin')
);

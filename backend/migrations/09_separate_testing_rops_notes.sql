-- ==============================================================================
-- MIGRACJA 09: SEPARACJA NOTATEK ADMINISTRATORA ROPS I UWAG ZGŁASZAJĄCEGO
-- Punkt IV Wyzwania ROPS / Moduł Testera Innowacji
--
-- Zapobiega nadpisywaniu uwag zgłaszającego (pole notes) przez notatki
-- urzędowe ROPS Kraków wprowadzane przy zmianie statusu (PATCH).
-- ==============================================================================

ALTER TABLE public.innovation_test_applications
ADD COLUMN IF NOT EXISTS rops_notes TEXT DEFAULT NULL;

COMMENT ON COLUMN public.innovation_test_applications.notes IS 'Uwagi wnioskodawcy i specyfika grupy docelowej zgłaszającego pilotaż';
COMMENT ON COLUMN public.innovation_test_applications.rops_notes IS 'Wewnętrzne notatki urzędowe ROPS Kraków dotyczące przebiegu pilotażu';

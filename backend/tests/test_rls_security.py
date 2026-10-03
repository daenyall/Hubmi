import pytest
from app.db.supabase import get_supabase_client
from scripts.verify_rls import verify_rls_status


class TestRlsSecurity:
    """Zestaw testów bezpieczeństwa Row Level Security (RLS) w Supabase."""

    def test_innovations_public_read_access(self):
        """Baza innowacji społecznych ROPS musi być publicznie dostępna do odczytu."""
        supabase = get_supabase_client()
        assert supabase is not None, "Baza Supabase powinna być skonfigurowana"

        res = supabase.table("innovations").select("id, title, category").limit(5).execute()
        assert res.data is not None
        assert isinstance(res.data, list)
        assert len(res.data) >= 1

    def test_submissions_privacy_rls(self):
        """Prywatne fiszki problemów nie mogą wyciekać do zapytań bez autoryzacji."""
        supabase = get_supabase_client()
        assert supabase is not None

        # Zapytanie bez tokenu nie powinno zwracać niepowiązanych prywatnych zgłoszeń
        res = supabase.table("submissions").select("id, problem_description").execute()
        assert isinstance(res.data, list)
        # Przy poprawnym RLS, zapytanie anonimowe bez tokena widzi 0 nieautoryzowanych zgłoszeń
        assert len(res.data) == 0

    def test_submission_messages_privacy_rls(self):
        """Wiadomości i notatki do fiszek podlegają rygorystycznej izolacji RLS."""
        supabase = get_supabase_client()
        assert supabase is not None

        res = supabase.table("submission_messages").select("id, message").execute()
        assert isinstance(res.data, list)
        assert len(res.data) == 0

    def test_verify_rls_script_success(self):
        """Skrypt audytu verify_rls_status powinien kończyć się kodem sukcesu 0."""
        code = verify_rls_status()
        assert code == 0

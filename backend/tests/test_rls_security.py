import os
import pytest
from supabase import create_client
from app.core.config import settings
from app.db.supabase import get_supabase_client
from scripts.verify_rls import verify_rls_status


class TestRlsSecurity:
    """Zestaw testów bezpieczeństwa Row Level Security (RLS) w Supabase."""

    @classmethod
    def setup_class(cls):
        anon_key = os.environ.get(
            "SUPABASE_ANON_KEY",
            os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_ryFIgolkPjysepnk0cB6ig_7txaNe0P")
        )
        cls.anon_sb = create_client(settings.SUPABASE_URL, anon_key)

    def test_innovations_public_read_access(self):
        """Baza innowacji społecznych ROPS musi być publicznie dostępna do odczytu."""
        res = self.anon_sb.table("innovations").select("id, title, category").limit(5).execute()
        assert res.data is not None
        assert isinstance(res.data, list)
        assert len(res.data) >= 1

    def test_submissions_privacy_rls(self):
        """Prywatne fiszki problemów nie mogą wyciekać do zapytań bez autoryzacji."""
        # Zapytanie anonimowe bez tokenu nie powinno zwracać niepowiązanych prywatnych zgłoszeń
        res = self.anon_sb.table("submissions").select("id, problem_description").execute()
        assert isinstance(res.data, list)
        # Przy poprawnym RLS, zapytanie anonimowe bez tokena widzi 0 nieautoryzowanych zgłoszeń
        assert len(res.data) == 0

    def test_submission_messages_privacy_rls(self):
        """Wiadomości i notatki do fiszek podlegają rygorystycznej izolacji RLS."""
        res = self.anon_sb.table("submission_messages").select("id, message").execute()
        assert isinstance(res.data, list)
        assert len(res.data) == 0

    def test_verify_rls_script_success(self):
        """Skrypt audytu verify_rls_status powinien kończyć się kodem sukcesu 0."""
        code = verify_rls_status()
        assert code == 0

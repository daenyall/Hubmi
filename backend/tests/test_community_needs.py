import os
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from datetime import datetime, timezone, timedelta

from app.main import app
from app.models.schemas import (
    CommunityNeedCreate,
    CommunityNeedStatusUpdate,
)
import app.services.needs as needs_service

client = TestClient(app)


class MockTableQuery:
    """Mock symulujący zapytania PostgREST / Supabase Table."""

    def __init__(self, data=None, count=None, error=None):
        self._data = data if data is not None else []
        self._count = count if count is not None else len(self._data)
        self._error = error

    def select(self, *args, **kwargs):
        return MockTableQuery(data=self._data, count=self._count, error=self._error)

    def insert(self, record, *args, **kwargs):
        if self._error:
            raise self._error
        inserted = dict(record)
        return MockTableQuery(data=[inserted], count=1)

    def update(self, fields, *args, **kwargs):
        if self._error:
            raise self._error
        updated = [dict(r, **fields) for r in self._data]
        return MockTableQuery(data=updated, count=len(updated))

    def eq(self, column, value):
        if self._error:
            raise self._error
        filtered = [r for r in self._data if str(r.get(column)) == str(value)]
        return MockTableQuery(data=filtered, count=len(filtered), error=self._error)

    def order(self, *args, **kwargs):
        return MockTableQuery(data=self._data, count=self._count, error=self._error)

    def range(self, start, end):
        return MockTableQuery(data=self._data[start : end + 1], count=self._count, error=self._error)

    def limit(self, count):
        return MockTableQuery(data=self._data[:count], count=min(len(self._data), count), error=self._error)

    def execute(self):
        if self._error:
            raise self._error
        mock_res = MagicMock()
        mock_res.data = self._data
        mock_res.count = self._count
        return mock_res



class MockSupabaseClient:
    """Mock klienta Supabase sterowany stanem testu."""

    def __init__(self, table_query=None):
        self._query = table_query or MockTableQuery()

    def table(self, table_name):
        return self._query


# ==============================================================================
# ZESTAW TESTÓW: BEZPIECZEŃSTWO, BRAK CICHEGO FALLBACKU I TOŻSAMOŚĆ (PUNKT 7)
# ==============================================================================

class TestNeedsHardeningAndSecurity:

    def test_missing_supabase_client_returns_503(self, monkeypatch):
        """Brak konfiguracji lub klienta Supabase daje jawny błąd 503, nie pozorowany sukces."""
        monkeypatch.setattr(needs_service, "get_supabase_client", lambda: None)

        payload = {
            "institution_name": "Gmina Miechów",
            "powiat": "miechowski",
            "category": "Seniorzy",
            "problem_summary": "Brak opieki domowej",
            "detailed_description": "Opis problemu społecznego seniorów wymagających wsparcia.",
        }

        # POST
        res_post = client.post("/api/needs", json=payload)
        assert res_post.status_code == 503
        assert "niedostępna" in res_post.json().get("detail", "").lower()

        # GET admin list
        res_list = client.get("/api/admin/needs", headers={"X-Admin-Role": "rops_admin"})
        assert res_list.status_code == 503

        # GET summary
        res_sum = client.get("/api/admin/needs/summary", headers={"X-Admin-Role": "rops_admin"})
        assert res_sum.status_code == 503

    def test_database_error_on_insert_returns_500_without_silent_success(self, monkeypatch):
        """Błąd bazy (np. brak tabeli / PGRST205) zwraca jawne 500 i nie zapisuje w pamięci."""
        mock_failing = MockSupabaseClient(
            table_query=MockTableQuery(error=RuntimeError("PGRST205: Could not find the table 'community_needs'"))
        )
        monkeypatch.setattr(needs_service, "get_supabase_client", lambda: mock_failing)

        payload = {
            "institution_name": "Centrum Usług Społecznych",
            "powiat": "tarnowski",
            "category": "Dostępność",
            "problem_summary": "Bariery architektoniczne",
            "detailed_description": "Szczegółowy opis luki w usługach dostępnościowych.",
        }

        res = client.post("/api/needs", json=payload)
        assert res.status_code == 500
        assert "błąd" in res.json().get("detail", "").lower()
        # Upewniamy się, że nie ujawniono szczegółów technicznych w odpowiedzi użytkownika
        assert "pgrst205" not in res.json().get("detail", "").lower()

    def test_unconfirmed_insert_empty_data_returns_500(self, monkeypatch):
        """Jeśli Supabase nie zwróci potwierdzenia zapisu (puste res.data), API zwraca błąd 500."""
        # Query zwracające pustą listę przy execute()
        empty_insert_query = MagicMock()
        empty_res = MagicMock()
        empty_res.data = []  # Baza nic nie potwierdziła!
        empty_insert_query.insert.return_value.execute.return_value = empty_res

        mock_sb = MagicMock()
        mock_sb.table.return_value = empty_insert_query
        monkeypatch.setattr(needs_service, "get_supabase_client", lambda: mock_sb)

        payload = {
            "institution_name": "OPS Wieliczka",
            "powiat": "wielicki",
            "category": "Seniorzy",
            "problem_summary": "Samotność osób starszych",
            "detailed_description": "Dokładny opis sytuacji seniorów w gminie Wieliczka.",
        }

        res = client.post("/api/needs", json=payload)
        assert res.status_code == 500
        assert "nie potwierdziła" in res.json().get("detail", "").lower()

    def test_read_failure_does_not_substitute_fixtures(self, monkeypatch):
        """Awaria odczytu zwraca błąd 500, a nie przykładowe dane w pamięci."""
        mock_failing = MockSupabaseClient(table_query=MockTableQuery(error=RuntimeError("Connection timeout")))
        monkeypatch.setattr(needs_service, "get_supabase_client", lambda: mock_failing)

        headers = {"X-Admin-Role": "rops_admin"}

        res_list = client.get("/api/admin/needs", headers=headers)
        assert res_list.status_code == 500

        res_summary = client.get("/api/admin/needs/summary", headers=headers)
        assert res_summary.status_code == 500

        res_trends = client.get("/api/admin/needs/trends", headers=headers)
        assert res_trends.status_code == 500

    def test_empty_needs_catalog_returns_true_zeroes_and_empty_lists(self, monkeypatch):
        """Pusta tabela w bazie zwraca pustą listę oraz prawdziwe zera w statystykach."""
        mock_empty = MockSupabaseClient(table_query=MockTableQuery(data=[], count=0))
        monkeypatch.setattr(needs_service, "get_supabase_client", lambda: mock_empty)

        headers = {"X-Admin-Role": "rops_admin"}

        # Lista
        res_list = client.get("/api/admin/needs", headers=headers)
        assert res_list.status_code == 200
        assert res_list.json() == []

        # Podsumowanie
        res_summary = client.get("/api/admin/needs/summary", headers=headers)
        assert res_summary.status_code == 200
        data = res_summary.json()
        assert data["total_needs_reported"] == 0
        assert data["top_categories"] == []
        assert data["top_powiats"] == []
        assert data["emerging_hotspots"] == []
        for st, count in data["needs_by_status"].items():
            assert count == 0

        # Trendy
        res_trends = client.get("/api/admin/needs/trends?period_days=30", headers=headers)
        assert res_trends.status_code == 200
        trends_data = res_trends.json()
        assert trends_data["total_growth_percentage"] == 0.0
        assert trends_data["category_trends"] == []
        assert trends_data["powiat_trends"] == []

    def test_confirmed_insert_returns_201_and_can_be_read_back(self, monkeypatch):
        """Potwierdzony zapis z Supabase zwraca 201 i może zostać ponownie odczytany."""
        stored_db = []

        class StatefulMockQuery(MockTableQuery):
            def insert(self, record, *args, **kwargs):
                inserted = dict(record)
                stored_db.append(inserted)
                mock_res = MagicMock()
                mock_res.data = [inserted]
                res_mock = MagicMock()
                res_mock.execute.return_value = mock_res
                return res_mock

            def select(self, *args, **kwargs):
                return MockTableQuery(data=list(stored_db), count=len(stored_db))

        mock_sb = MagicMock()
        mock_sb.table.return_value = StatefulMockQuery()
        monkeypatch.setattr(needs_service, "get_supabase_client", lambda: mock_sb)

        payload = {
            "institution_name": "Centrum Usług Społecznych w Skawinie",
            "institution_type": "CUS",
            "powiat": "krakowski",
            "gmina": "Skawina",
            "contact_email": "cus@skawina.pl",
            "category": "Zdrowie psychiczne",
            "target_group": "Młodzież 13-18 lat",
            "problem_summary": "Kryzys emocjonalny po pandemii",
            "detailed_description": "Potrzebny mobilny punkt wsparcia psychologicznego w szkołach.",
            "estimated_affected_count": 80,
            "urgency_level": "wysoki",
        }

        # Zapis
        res_post = client.post("/api/needs", json=payload)
        assert res_post.status_code == 201
        res_data = res_post.json()
        need_id = res_data["id"]
        assert res_data["status"] == "nowe"

        # Ponowny odczyt przez administratora ROPS
        headers = {"X-Admin-Role": "rops_admin"}
        res_get = client.get("/api/admin/needs", headers=headers)
        assert res_get.status_code == 200
        items = res_get.json()
        assert len(items) == 1
        assert items[0]["id"] == need_id
        assert items[0]["problem_summary"] == "Kryzys emocjonalny po pandemii"
        assert items[0]["status"] == "nowe"

    def test_guest_cannot_assign_need_to_author_a(self, monkeypatch):
        """Niezalogowany gość nie może przypisać potrzeby autorowi A (user_id = NULL)."""
        captured_record = {}

        class InspectInsertQuery(MockTableQuery):
            def insert(self, record, *args, **kwargs):
                nonlocal captured_record
                captured_record = dict(record)
                return MockTableQuery(data=[captured_record], count=1)

        mock_sb = MagicMock()
        mock_sb.table.return_value = InspectInsertQuery()
        monkeypatch.setattr(needs_service, "get_supabase_client", lambda: mock_sb)

        # Gość próbuje wstrzyknąć cudzy user_id w payloadzie
        payload = {
            "institution_name": "Podszywacz",
            "powiat": "krakowski",
            "category": "Inne",
            "problem_summary": "Próba podszycia pod autora A",
            "detailed_description": "Szczegółowy opis z próbą wstrzyknięcia cudzego user_id.",
            "user_id": "author-a-uuid-1234",
        }

        res = client.post("/api/needs", json=payload)
        assert res.status_code == 201
        # W bazie user_id musi bezwzględnie wynosić None!
        assert captured_record.get("user_id") is None

    def test_author_a_cannot_assign_need_to_author_b(self, monkeypatch):
        """Zalogowany autor A nie może przypisać potrzeby autorowi B (user_id = auth.uid())."""
        captured_record = {}

        class InspectInsertQuery(MockTableQuery):
            def insert(self, record, *args, **kwargs):
                nonlocal captured_record
                captured_record = dict(record)
                return MockTableQuery(data=[captured_record], count=1)

        mock_sb = MagicMock()
        mock_sb.table.return_value = InspectInsertQuery()
        monkeypatch.setattr(needs_service, "get_supabase_client", lambda: mock_sb)

        # Autor A zalogowany (nagłówek applicant daje user_id test-applicant-001)
        headers = {
            "Authorization": "Bearer author-a-token",
            "X-Admin-Role": "applicant",
        }

        # Próbuje podać w payloadzie identyfikator Autora B
        payload = {
            "institution_name": "Podmiot Autora A",
            "powiat": "tarnowski",
            "category": "Seniorzy",
            "problem_summary": "Zgłoszenie z próbą sfałszowania właściciela",
            "detailed_description": "Opis problemu społecznego z próbą przypisania do konta B.",
            "user_id": "author-b-uuid-9999",
        }

        res = client.post("/api/needs", json=payload, headers=headers)
        assert res.status_code == 201
        # Rekord musi zawierać tożsamość zweryfikowaną sesją (Autor A: test-applicant-001), a nie podrobioną
        assert captured_record.get("user_id") == "test-applicant-001"
        assert captured_record.get("user_id") != "author-b-uuid-9999"

    def test_guest_and_author_cannot_access_rops_admin_needs(self):
        """Gość i autor otrzymują 403 Forbidden przy próbie dostępu do panelu administratora ROPS."""
        # Gość
        res_guest = client.get("/api/admin/needs")
        assert res_guest.status_code in (401, 403)

        # Autor
        headers_author = {"X-Admin-Role": "applicant"}
        res_author = client.get("/api/admin/needs", headers=headers_author)
        assert res_author.status_code == 403

        res_author_summary = client.get("/api/admin/needs/summary", headers=headers_author)
        assert res_author_summary.status_code == 403

        res_author_trends = client.get("/api/admin/needs/trends", headers=headers_author)
        assert res_author_trends.status_code == 403

    def test_author_can_view_only_own_needs(self, monkeypatch):
        """Autor widzi wyłącznie własne zgłoszenia w /api/needs/my."""
        # Symulacja bazy z dwoma zgłoszeniami: autora A i autora B
        stored = [
            {
                "id": "need-author-a",
                "user_id": "test-applicant-001",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "institution_name": "CUS Autora A",
                "powiat": "krakowski",
                "category": "Seniorzy",
                "problem_summary": "Potrzeba A",
                "detailed_description": "Opis potrzeby należącej do Autora A.",
                "status": "nowe",
            },
            {
                "id": "need-author-b",
                "user_id": "author-b-uuid",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "institution_name": "CUS Autora B",
                "powiat": "tarnowski",
                "category": "Dostępność",
                "problem_summary": "Potrzeba B",
                "detailed_description": "Opis potrzeby należącej do Autora B.",
                "status": "nowe",
            },
        ]

        mock_sb = MockSupabaseClient(table_query=MockTableQuery(data=stored))
        monkeypatch.setattr(needs_service, "get_supabase_client", lambda: mock_sb)

        # Autor A odpytuje o swoje potrzeby
        headers_author_a = {
            "Authorization": "Bearer author-a-token",
            "X-Admin-Role": "applicant",
        }
        res = client.get("/api/needs/my", headers=headers_author_a)
        assert res.status_code == 200
        items = res.json()
        assert len(items) == 1
        assert items[0]["id"] == "need-author-a"
        assert items[0]["user_id"] == "test-applicant-001"

    def test_author_cannot_update_need_status(self):
        """Zwykły autor otrzymuje 403 przy próbie zmiany statusu potrzeby."""
        headers_author = {"X-Admin-Role": "applicant"}
        patch_payload = {"status": "zaadresowane"}
        res = client.patch("/api/admin/needs/any-id/status", json=patch_payload, headers=headers_author)
        assert res.status_code == 403

    def test_rops_admin_can_update_status_and_notes(self, monkeypatch):
        """Administrator ROPS może formalnie zmienić status potrzeby i dodać notatkę analityczną."""
        existing = {
            "id": "need-001",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "institution_name": "CUS Myślenice",
            "powiat": "myślenicki",
            "category": "Zdrowie psychiczne",
            "problem_summary": "Kryzys młodzieży",
            "detailed_description": "Brak opieki psychologicznej w sołectwach.",
            "status": "nowe",
            "rops_internal_notes": None,
        }

        mock_sb = MockSupabaseClient(table_query=MockTableQuery(data=[existing]))
        monkeypatch.setattr(needs_service, "get_supabase_client", lambda: mock_sb)

        headers_rops = {"X-Admin-Role": "rops_admin"}
        patch_payload = {
            "status": "uwzglednione_w_naborze",
            "rops_internal_notes": "Włączono do kryteriów naboru grantów testujących FERS 2026/Q4.",
        }
        res_patch = client.patch("/api/admin/needs/need-001/status", json=patch_payload, headers=headers_rops)
        assert res_patch.status_code == 200
        updated = res_patch.json()
        assert updated["id"] == "need-001"
        assert updated["status"] == "uwzglednione_w_naborze"
        assert "FERS 2026/Q4" in updated["rops_internal_notes"]

    def test_honeypot_spam_rejection(self):
        """Wypełnienie pola honeypot powoduje natychmiastowe odrzucenie jako spam."""
        payload = {
            "institution_name": "Bot Spamer",
            "powiat": "krakowski",
            "category": "Inne",
            "problem_summary": "Kupuj tanie leki online",
            "detailed_description": "Spam bot próbuje zalać bazę nieprawidłowymi zgłoszeniami reklamowymi.",
            "hp_website": "http://spambot-link.com",  # Honeypot filled!
        }
        response = client.post("/api/needs", json=payload)
        assert response.status_code == 400
        assert "spam" in response.text.lower() or "nieprawidłowe" in response.text.lower()

    def test_summary_aggregates_with_confirmed_records(self, monkeypatch):
        """Podsumowanie poprawnie oblicza kategorie, powiaty i hotspoty na potwierdzonych rekordach."""
        now = datetime.now(timezone.utc)
        records = [
            {
                "id": "1",
                "created_at": (now - timedelta(days=2)).isoformat(),
                "institution_name": "OPS 1",
                "powiat": "tarnowski",
                "category": "Seniorzy",
                "problem_summary": "P1",
                "detailed_description": "D1",
                "urgency_level": "wysoki",
                "status": "nowe",
            },
            {
                "id": "2",
                "created_at": (now - timedelta(days=5)).isoformat(),
                "institution_name": "OPS 2",
                "powiat": "tarnowski",
                "category": "Seniorzy",
                "problem_summary": "P2",
                "detailed_description": "D2",
                "urgency_level": "krytyczny",
                "status": "nowe",
            },
            {
                "id": "3",
                "created_at": (now - timedelta(days=10)).isoformat(),
                "institution_name": "CUS 1",
                "powiat": "krakowski",
                "category": "Zdrowie psychiczne",
                "problem_summary": "P3",
                "detailed_description": "D3",
                "urgency_level": "sredni",
                "status": "analizowane",
            },
        ]

        mock_sb = MockSupabaseClient(table_query=MockTableQuery(data=records))
        monkeypatch.setattr(needs_service, "get_supabase_client", lambda: mock_sb)

        headers = {"X-Admin-Role": "rops_admin"}
        res = client.get("/api/admin/needs/summary", headers=headers)
        assert res.status_code == 200
        data = res.json()

        assert data["total_needs_reported"] == 3
        assert data["needs_by_status"]["nowe"] == 2
        assert data["needs_by_status"]["analizowane"] == 1
        assert data["needs_by_urgency"]["wysoki"] == 1
        assert data["needs_by_urgency"]["krytyczny"] == 1

        # Seniorzy: 2 z 3 = 66.7%
        assert data["top_categories"][0]["category"] == "Seniorzy"
        assert data["top_categories"][0]["count"] == 2
        assert data["top_categories"][0]["percentage"] == 66.7

        # Tarnowski: 2 z 3 = 66.7%
        assert data["top_powiats"][0]["powiat"] == "tarnowski"
        assert data["top_powiats"][0]["count"] == 2

        # Hotspot
        assert len(data["emerging_hotspots"]) >= 1
        assert "tarnowski" in data["emerging_hotspots"][0]["powiat"]

    def test_trends_period_comparison_with_confirmed_records(self, monkeypatch):
        """Porównanie okresów poprawnie wylicza dynamikę i trendy."""
        now = datetime.now(timezone.utc)
        # 2 w bieżącym okresie (ostatnie 30 dni), 1 w poprzednim (30-60 dni temu)
        records = [
            {
                "id": "curr-1",
                "created_at": (now - timedelta(days=5)).isoformat(),
                "institution_name": "OPS",
                "powiat": "tarnowski",
                "category": "Seniorzy",
                "problem_summary": "C1",
                "detailed_description": "D1",
                "urgency_level": "wysoki",
                "status": "nowe",
            },
            {
                "id": "curr-2",
                "created_at": (now - timedelta(days=15)).isoformat(),
                "institution_name": "OPS",
                "powiat": "tarnowski",
                "category": "Seniorzy",
                "problem_summary": "C2",
                "detailed_description": "D2",
                "urgency_level": "wysoki",
                "status": "nowe",
            },
            {
                "id": "prev-1",
                "created_at": (now - timedelta(days=45)).isoformat(),
                "institution_name": "OPS",
                "powiat": "tarnowski",
                "category": "Seniorzy",
                "problem_summary": "P1",
                "detailed_description": "D1",
                "urgency_level": "sredni",
                "status": "analizowane",
            },
        ]

        mock_sb = MockSupabaseClient(table_query=MockTableQuery(data=records))
        monkeypatch.setattr(needs_service, "get_supabase_client", lambda: mock_sb)

        headers = {"X-Admin-Role": "rops_admin"}
        res = client.get("/api/admin/needs/trends?period_days=30", headers=headers)
        assert res.status_code == 200
        data = res.json()

        assert data["current_period"]["total"] == 2
        assert data["previous_period"]["total"] == 1
        # Z 1 na 2 = wzrost o 100%
        assert data["total_growth_percentage"] == 100.0
        assert data["category_trends"][0]["trend"] == "wzrostowy"
        assert data["powiat_trends"][0]["trend"] == "wzrostowy"


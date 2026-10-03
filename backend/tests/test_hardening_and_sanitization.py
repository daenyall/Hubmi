import pytest
from starlette.testclient import TestClient
from app.main import app
from app.utils.sanitize import (
    sanitize_text,
    sanitize_optional,
    is_valid_innovation_id,
    is_valid_uuid,
    safe_error_message,
)

client = TestClient(app)


class TestHardeningAndSanitization:
    """
    Testy jednostkowe i integracyjne dla mechanizmów bezpieczeństwa (Hardening):
    - Sanityzacja XSS / strip tagów HTML
    - Walidacja identyfikatorów przeciwko injection
    - Bezpieczne komunikaty błędów (brak leaków stacktrace)
    - Domyślny filtr 'sprawdzone' w katalogu publicznym
    """

    def test_sanitize_text_strips_script_tags(self):
        """Skrypty JS są usuwane z pól tekstowych."""
        malicious = "Innowacja dla seniorów <script>alert('XSS')</script> wspierająca aktywność."
        cleaned = sanitize_text(malicious)
        assert "<script>" not in cleaned
        assert "</script>" not in cleaned
        assert "alert('XSS')" not in cleaned
        assert "Innowacja dla seniorów wspierająca aktywność." in cleaned

    def test_sanitize_text_strips_dangerous_attributes(self):
        """Atrybuty onload, onerror, onclick oraz javascript: są neutralizowane."""
        malicious = 'Kliknij <img src="x" onerror="stealCookies()"> lub <a href="javascript:void(0)">link</a>'
        cleaned = sanitize_text(malicious)
        assert "onerror=" not in cleaned
        assert "stealCookies()" not in cleaned
        assert "javascript:" not in cleaned

    def test_sanitize_text_null_bytes_and_spaces(self):
        """Null byte injection i nadmiarowe białe znaki są normalizowane."""
        malicious = "Test\x00tekstu   z    odstępami"
        cleaned = sanitize_text(malicious)
        assert "\x00" not in cleaned
        assert cleaned == "Testtekstu z odstępami"

    def test_sanitize_optional_preserves_none(self):
        """sanitize_optional poprawnie zwraca None dla pustych wartości."""
        assert sanitize_optional(None) is None
        assert sanitize_optional("   ") is None
        assert sanitize_optional("Poprawny tekst") == "Poprawny tekst"

    def test_is_valid_innovation_id(self):
        """Walidacja ID akceptuje poprawne identyfikatory i odrzuca próby injection."""
        assert is_valid_innovation_id("inv_01") is True
        assert is_valid_innovation_id("inv_transport_seniorzy") is True
        assert is_valid_innovation_id("550e8400-e29b-41d4-a716-446655440000") is True

        # Próby SQL injection, XSS, Path Traversal
        assert is_valid_innovation_id("' OR '1'='1") is False
        assert is_valid_innovation_id("<script>alert(1)</script>") is False
        assert is_valid_innovation_id("../../etc/passwd") is False
        assert is_valid_innovation_id("inv; DROP TABLE innovations;--") is False
        assert is_valid_innovation_id("a" * 65) is False

    def test_is_valid_uuid(self):
        """Walidacja UUID sprawdza ścisły format."""
        assert is_valid_uuid("550e8400-e29b-41d4-a716-446655440000") is True
        assert is_valid_uuid("inv_01") is False
        assert is_valid_uuid("not-a-uuid") is False

    def test_get_innovation_rejects_malicious_id_with_422(self):
        """GET /api/innovations/{id} odrzuca próby injection zwracając HTTP 422."""
        # Próba XSS w ścieżce
        response = client.get("/api/innovations/%3Cscript%3E")
        assert response.status_code == 422
        assert "Nieprawidłowy format identyfikatora" in response.json()["detail"]

        # Próba SQL injection ze spacjami
        response_sql = client.get("/api/innovations/'%20OR%20'1'='1")
        assert response_sql.status_code == 422

        # Przekroczenie maksymalnej długości (np. 65 znaków)
        response_long = client.get("/api/innovations/" + "a" * 65)
        assert response_long.status_code == 422

    def test_safe_error_message_no_traces(self):
        """Komunikaty bezpieczne nie ujawniają nazw tabel, połączeń ani wyjątków Pythona."""
        msg = safe_error_message("zgłoszenia")
        assert "Exception" not in msg
        assert "Traceback" not in msg
        assert "psycopg2" not in msg
        assert "supabase" not in msg
        assert "zgłoszenia" in msg

    def test_public_catalog_status_filtering(self):
        """Domyślnie publiczny katalog innowacji filtruje po statusie 'sprawdzone'."""
        response = client.get("/api/innovations")
        assert response.status_code == 200
        items = response.json()
        assert isinstance(items, list)
        for item in items:
            assert item.get("status") == "sprawdzone"

    def test_middleman_adapt_sanitizes_xss(self):
        """Endpoint /api/adapt akceptuje i czyści dane z tagów XSS."""
        payload = {
            "innovation_title": "Asystent Seniora <script>alert(1)</script>",
            "innovation_description": "Opis innowacji z bezpiecznym tekstem.",
            "municipality_context": "Gmina wiejska Lipowa <script>pwned()</script> potrzebuje wsparcia dla 200 seniorów.",
            "municipality_type": "wiejska",
            "budget_range": "50k-100k",
            "time_horizon": "6 miesięcy",
        }
        response = client.post("/api/adapt", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "adaptation_plan" in data
        assert len(data["adaptation_plan"]) > 0

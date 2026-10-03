import pytest
from starlette.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestMatchApi:
    """Zestaw testów integracyjnych endpointu POST /api/match oraz GET /api/innovations."""

    def test_health_check(self):
        """Weryfikacja dostępności serwisu backendowego i połączenia z Supabase."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "supabase_connected" in data

    def test_match_valid_query(self):
        """Zapytanie o seniorów powinno zwrócić status 200 i poprawne rekordy dopasowań."""
        payload = {
            "problem_description": "samotni seniorzy na wsi bez transportu do lekarza i apteki",
            "threshold": 0.15,
            "limit": 3,
        }
        response = client.post("/api/match", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert "matches" in data
        assert "total_found" in data
        assert "query" in data
        assert data["query"] == payload["problem_description"]
        assert isinstance(data["matches"], list)
        assert data["total_found"] == len(data["matches"])

        if len(data["matches"]) > 0:
            top_match = data["matches"][0]
            assert "id" in top_match
            assert "title" in top_match
            assert "similarity_score" in top_match
            assert isinstance(top_match["similarity_score"], float)
            assert "status" in top_match

    def test_match_short_description_rejected(self):
        """Opis krótszy niż 3 znaki musi zostać odrzucony z kodem błędu 400 lub 422."""
        payload = {"problem_description": "ab"}
        response = client.post("/api/match", json=payload)
        assert response.status_code in [400, 422]

    def test_match_whitespace_only_rejected(self):
        """Opis składający się z samych spacji musi zostać odrzucony."""
        payload = {"problem_description": "      "}
        response = client.post("/api/match", json=payload)
        assert response.status_code in [400, 422]

    def test_match_no_matches_returns_empty_list_cleanly(self):
        """
        Kluczowa weryfikacja: przy bardzo wysokim progu podobieństwa (0.99)
        API zwraca status 200 z pustą tablicą matches: [], bez wstrzykiwania fałszywych mocków.
        """
        payload = {
            "problem_description": "samotni seniorzy na wsi bez transportu",
            "threshold": 0.99,
        }
        response = client.post("/api/match", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["matches"] == []
        assert data["total_found"] == 0

    def test_match_limit_constraint(self):
        """Liczba zwróconych innowacji nie może przekraczać zadanego parametru limit."""
        payload = {
            "problem_description": "pomoc społeczna wsparcie mieszkańców",
            "threshold": 0.05,
            "limit": 2,
        }
        response = client.post("/api/match", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert len(data["matches"]) <= 2

    def test_get_innovations_catalog(self):
        """Endpoint GET /api/innovations zwraca zaimportowaną bazę innowacji."""
        response = client.get("/api/innovations?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        first_item = data[0]
        assert "id" in first_item
        assert "title" in first_item
        assert "category" in first_item

    def test_cors_localhost_allowed(self):
        """Weryfikacja CORS dla lokalnego frontendu Next.js."""
        headers = {
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        }
        response = client.options("/api/match", headers=headers)
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"

    def test_cors_vercel_regex_allowed(self):
        """Weryfikacja CORS dla preview deploymentów Vercela Daniela."""
        headers = {
            "Origin": "https://hubmi-git-feat-frontend-daenyalls-projects.vercel.app",
            "Access-Control-Request-Method": "POST",
        }
        response = client.options("/api/match", headers=headers)
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "https://hubmi-git-feat-frontend-daenyalls-projects.vercel.app"

    def test_cors_cloudflare_tunnel_allowed(self):
        """Weryfikacja CORS dla publicznych tuneli Cloudflare Tunnel (trycloudflare.com)."""
        headers = {
            "Origin": "https://hubmi-demo-hackyeah.trycloudflare.com",
            "Access-Control-Request-Method": "POST",
        }
        response = client.options("/api/match", headers=headers)
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "https://hubmi-demo-hackyeah.trycloudflare.com"

    def test_cors_render_allowed(self):
        """Weryfikacja CORS dla wdrożeń na Render (onrender.com)."""
        headers = {
            "Origin": "https://hubmi-frontend.onrender.com",
            "Access-Control-Request-Method": "POST",
        }
        response = client.options("/api/match", headers=headers)
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "https://hubmi-frontend.onrender.com"

import pytest
from starlette.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestSearchResilienceAndGibberish:
    """
    Zestaw testów odpornościowych dla wyszukiwarki semantyczno-hybrydowej,
    ochrony przed bełkotem (keyboard mash) oraz endpointów pojedynczych innowacji.
    """

    def test_gibberish_awdawdawdawd_returns_no_matches_with_advice(self):
        """Wpisanie 'awdawdawdawd' nie może zwracać przypadkowych innowacji ani halucynować dopasowań."""
        payload = {
            "problem_description": "awdawdawdawd",
            "threshold": 0.2,
            "limit": 4,
        }
        response = client.post("/api/match", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["matches"] == []
        assert data["total_found"] == 0
        assert data["no_match_advice"] is not None
        assert "nie przypomina opisu" in data["no_match_advice"]

    def test_gibberish_keyboard_mash_asdfghjkl_rejected(self):
        """Wpisanie losowych liter 'asdfghjkl' jest wykrywane jako bełkot."""
        payload = {
            "problem_description": "asdfghjkl",
            "threshold": 0.2,
        }
        response = client.post("/api/match", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["matches"] == []
        assert data["total_found"] == 0
        assert data["no_match_advice"] is not None

    def test_gibberish_repeated_characters_rejected(self):
        """Wpisanie powtórzonego znaku 'zzzzzzzz' jest traktowane jako bełkot."""
        payload = {
            "problem_description": "zzzzzzzzzzzzzz",
            "threshold": 0.2,
        }
        response = client.post("/api/match", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["matches"] == []
        assert data["total_found"] == 0

    def test_valid_social_problem_matches_successfully(self):
        """Poprawny opis wyzwania społecznego dla seniorów powinien zwrócić trafne innowacje."""
        payload = {
            "problem_description": "samotni seniorzy na wsi potrzebujący wsparcia i integracji",
            "threshold": 0.2,
            "limit": 3,
        }
        response = client.post("/api/match", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["matches"], list)
        assert data["total_found"] > 0
        first = data["matches"][0]
        assert first["similarity_score"] >= 0.2
        assert first["status"] == "sprawdzone"

    def test_user_screenshot_query_seniors_in_municipality(self):
        """Zapytanie ze screenshotu użytkownika o samotnych seniorach w gminie musi zwrócić trafne innowacje."""
        payload = {
            "problem_description": "W naszej gminie osoby starsze mieszkające samotnie rzadko wychodzą z domu. Szukamy sposobu na regularne spotkania, budowanie relacji sąsiedzkich i wsparcie w codziennych sprawach.",
            "threshold": 0.2,
            "limit": 4,
        }
        response = client.post("/api/match", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["total_found"] >= 1
        assert len(data["matches"]) >= 1
        assert any(any(w in (m["title"] + m["description"]).lower() for w in ["senior", "starsz", "sąsiedz", "wsparci"]) for m in data["matches"])
        # AI lub baza powinna wygenerować why_relevant
        assert data["matches"][0]["why_relevant"] is not None

    def test_user_screenshot_query_disabilities_and_caregivers(self):
        """Zapytanie ze screenshotu użytkownika o osobach z niepełnosprawnościami musi zwrócić trafne innowacje."""
        payload = {
            "problem_description": "Osoby z niepełnosprawnościami i ich opiekunowie mają trudność z dotarciem do lokalnych usług. Chcemy ograniczyć bariery i zapewnić dostępne wsparcie blisko domu.",
            "threshold": 0.2,
            "limit": 4,
        }
        response = client.post("/api/match", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["total_found"] >= 1
        assert len(data["matches"]) >= 1
        assert data["matches"][0]["why_relevant"] is not None

    def test_get_single_innovation_public_success(self):
        """Endpoint GET /api/innovations/{id} zwraca pojedynczą innowację."""
        response = client.get("/api/innovations/inv_01")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "inv_01"
        assert "title" in data
        assert "category" in data

    def test_get_single_innovation_public_not_found(self):
        """Endpoint GET /api/innovations/{id} zwraca 404 dla nieistniejącego ID."""
        response = client.get("/api/innovations/nieistniejaca_innowacja_9999")
        assert response.status_code == 404
        data = response.json()
        assert "nie została odnaleziona" in data["detail"]

    def test_get_single_innovation_admin_authorized(self):
        """Endpoint GET /api/admin/innovations/{id} dla uprawnionego pracownika ROPS."""
        headers = {"X-Admin-Role": "rops_admin"}
        response = client.get("/api/admin/innovations/inv_01", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "inv_01"

    def test_get_single_innovation_admin_unauthorized(self):
        """Endpoint GET /api/admin/innovations/{id} bez uprawnień zwraca 401."""
        response = client.get("/api/admin/innovations/inv_01")
        assert response.status_code in (401, 403)

    def test_list_innovations_status_filter(self):
        """GET /api/innovations z parametrem status filtruje listę."""
        response = client.get("/api/innovations?status=sprawdzone&limit=5")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for item in data:
            assert item["status"] == "sprawdzone"

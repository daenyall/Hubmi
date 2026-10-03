import pytest
from starlette.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestNoMatchAndExceptionsHandling:
    """Zestaw testów weryfikujący obsługę sytuacji braku dopasowania i filtrów kategorii."""

    def test_no_match_provides_structured_advice(self):
        """Brak dopasowań przy wysokim progu zwraca kod 200, pustą listę i poradnik rekomendacji."""
        payload = {
            "problem_description": "samotni mieszkańcy szukający pomocy",
            "threshold": 0.99,
        }
        res = client.post("/api/match", json=payload)
        assert res.status_code == 200
        data = res.json()

        assert data["matches"] == []
        assert data["total_found"] == 0
        assert data["no_match_advice"] is not None
        assert "doprecyzowanie opisu" in data["no_match_advice"].lower()
        assert isinstance(data["suggested_categories"], list)
        assert "Seniorzy" in data["suggested_categories"]
        assert data["can_submit_as_new_challenge"] is True

    def test_match_with_category_filtering(self):
        """Wyszukiwanie z filtrem kategorii zwraca tylko innowacje z wybranej dziedziny."""
        payload = {
            "problem_description": "transport i wsparcie w dotarciu do lekarza",
            "category": "Seniorzy",
            "threshold": 0.15,
            "limit": 3,
        }
        res = client.post("/api/match", json=payload)
        assert res.status_code == 200
        data = res.json()

        assert isinstance(data["matches"], list)
        for item in data["matches"]:
            assert item["category"] == "Seniorzy"

    def test_no_match_with_specific_category_advice(self):
        """Brak dopasowań w specyficznej kategorii informuje o konieczności zmiany filtra lub progu."""
        payload = {
            "problem_description": "nowoczesne technologie kosmiczne dla rolnictwa",
            "category": "Wsparcie rodziny",
            "threshold": 0.90,
        }
        res = client.post("/api/match", json=payload)
        assert res.status_code == 200
        data = res.json()

        assert data["matches"] == []
        assert data["total_found"] == 0
        assert data["no_match_advice"] is not None
        assert "Wsparcie rodziny" in data["no_match_advice"]

    def test_similarity_scores_are_strictly_bounded(self):
        """Wskaźnik podobieństwa cosinusowego musi zawsze mieścić się w przedziale [0.0, 1.0]."""
        payload = {
            "problem_description": "pomoc psychologiczna dla młodzieży w kryzysie",
            "threshold": 0.1,
            "limit": 5,
        }
        res = client.post("/api/match", json=payload)
        assert res.status_code == 200
        data = res.json()

        for item in data["matches"]:
            score = item["similarity_score"]
            assert 0.0 <= score <= 1.0, f"Niepoprawny wynik podobieństwa: {score}"

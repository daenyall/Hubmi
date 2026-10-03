import uuid
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestKnowledgeAdmin:
    """Testy panelu zarządzania bazą wiedzy innowacji (Punkt VI Wyzwania ROPS Kraków)."""

    def test_list_innovations_unauthorized(self):
        """Brak roli ROPS skutkuje kodem 403 Forbidden."""
        res = client.get("/api/admin/innovations")
        assert res.status_code == 403

    def test_list_innovations_authorized(self):
        """Administrator ROPS pobiera listę innowacji."""
        admin_headers = {"X-Admin-Role": "rops_admin"}
        res = client.get("/api/admin/innovations", headers=admin_headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    @patch("app.api.endpoints.admin.create_embedding")
    @patch("app.api.endpoints.admin.get_supabase_client")
    def test_create_innovation_with_embedding(self, mock_get_sb, mock_embed):
        """Tworzenie nowej innowacji wylicza 1536D embedding i zapisuje w bazie."""
        mock_embed.return_value = [0.1] * 1536
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb

        sample_inv = {
            "id": "inv_test_01",
            "title": "Innowacyjny Klub Seniora",
            "description": "Opis innowacji testowej wspierającej integrację międzypokoleniową.",
            "target_group": "Seniorzy",
            "category": "Seniorzy",
            "why_relevant": "Rozwiązanie testowane w Małopolsce",
            "source_url": "https://rops.krakow.pl/innowacje/klub",
            "status": "sprawdzone",
        }
        mock_sb.table().insert().execute.return_value = MagicMock(data=[sample_inv])

        admin_headers = {"X-Admin-Role": "rops_admin"}
        payload = {
            "id": "inv_test_01",
            "title": "Innowacyjny Klub Seniora",
            "description": "Opis innowacji testowej wspierającej integrację międzypokoleniową.",
            "target_group": "Seniorzy",
            "category": "Seniorzy",
            "why_relevant": "Rozwiązanie testowane w Małopolsce",
            "source_url": "https://rops.krakow.pl/innowacje/klub",
            "status": "sprawdzone",
        }
        res = client.post("/api/admin/innovations", json=payload, headers=admin_headers)
        assert res.status_code == 201
        assert res.json()["id"] == "inv_test_01"
        assert res.json()["title"] == "Innowacyjny Klub Seniora"
        mock_embed.assert_called_once()

    @patch("app.api.endpoints.admin.get_supabase_client")
    def test_publish_innovation(self, mock_get_sb):
        """Publikacja innowacji zmienia status na 'sprawdzone'."""
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb

        sample_published = {
            "id": "inv_test_02",
            "title": "Terenowy Wózek",
            "description": "Opis wózka",
            "target_group": "OzN",
            "category": "Dostępność",
            "status": "sprawdzone",
        }
        mock_sb.table().update().eq().execute.return_value = MagicMock(data=[sample_published])

        admin_headers = {"X-Admin-Role": "rops_admin"}
        res = client.post("/api/admin/innovations/inv_test_02/publish", headers=admin_headers)
        assert res.status_code == 200
        assert res.json()["status"] == "sprawdzone"

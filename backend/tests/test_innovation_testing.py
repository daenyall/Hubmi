import uuid
from typing import Any
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestInnovationTesting:
    """Testy modułu Testera Innowacji Społecznych w Małopolsce (Punkt IV Wyzwania ROPS Kraków)."""

    test_inv_id: str = ""
    test_inv_id_2: str = ""
    sb: Any = None

    @classmethod
    def setup_class(cls):
        from app.db.supabase import get_supabase_client
        cls.sb = get_supabase_client()
        cls.test_inv_id = f"inv_t_{uuid.uuid4().hex[:6]}"
        cls.test_inv_id_2 = f"inv_t_{uuid.uuid4().hex[:6]}"
        if cls.sb:
            cls.sb.table("innovations").insert([
                {
                    "id": cls.test_inv_id,
                    "title": "Test Innowacja 1",
                    "description": "Opis innowacji testowej",
                    "target_group": "Testerzy",
                    "category": "Test",
                    "status": "sprawdzone",
                },
                {
                    "id": cls.test_inv_id_2,
                    "title": "Test Innowacja 2",
                    "description": "Opis innowacji testowej 2",
                    "target_group": "Testerzy",
                    "category": "Test",
                    "status": "sprawdzone",
                },
            ]).execute()

    @classmethod
    def teardown_class(cls):
        if cls.sb:
            try:
                cls.sb.table("innovation_feedback").delete().in_("innovation_id", [cls.test_inv_id, cls.test_inv_id_2]).execute()
                cls.sb.table("innovation_test_applications").delete().in_("innovation_id", [cls.test_inv_id, cls.test_inv_id_2]).execute()
                cls.sb.table("innovations").delete().in_("id", [cls.test_inv_id, cls.test_inv_id_2]).execute()
            except Exception:
                pass

    def test_apply_validation_missing_institution(self):
        """Brak nazwy instytucji skutkuje błędem 400 Bad Request."""
        res = client.post(
            "/api/testing/apply",
            json={
                "innovation_id": self.test_inv_id,
                "institution_name": "   ",
                "contact_person": "Jan Kowalski",
                "contact_email": "jan@wieliczka.pl",
            },
        )
        assert res.status_code == 400
        assert "Podaj nazwę instytucji" in res.json()["detail"]

    def test_apply_validation_invalid_email(self):
        """Niepoprawny format adresu e-mail skutkuje błędem 400 Bad Request."""
        res = client.post(
            "/api/testing/apply",
            json={
                "innovation_id": self.test_inv_id,
                "institution_name": "Gmina Wieliczka",
                "contact_person": "Jan Kowalski",
                "contact_email": "nie-email",
            },
        )
        assert res.status_code == 400
        assert "adres e-mail" in res.json()["detail"]

    def test_apply_successful_creation(self):
        """Poprawne zgłoszenie chęci testowania zwraca kod 201 i domyślny status 'nowe'."""
        inv_id = self.test_inv_id
        payload = {
            "innovation_id": inv_id,
            "tester_type": "JST",
            "institution_name": "Gmina Skała",
            "contact_person": "Anna Nowak",
            "contact_email": "a.nowak@skala.pl",
            "contact_phone": "+48 12 345 67 89",
            "testing_scope": "pilotaz_3m",
            "target_audience_count": 35,
            "notes": "Pilotaż w 2 sołectwach z udziałem OSP",
        }
        res = client.post("/api/testing/apply", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["innovation_id"] == inv_id
        assert data["status"] == "nowe"
        assert data["institution_name"] == "Gmina Skała"
        assert data["target_audience_count"] == 35
        assert data["id"] is not None

    def test_list_applications_and_filtering(self):
        """Pobieranie listy aplikacji wspiera filtrowanie po statusie i ID innowacji."""
        target_inv = self.test_inv_id
        res1 = client.post(
            "/api/testing/apply",
            json={
                "innovation_id": target_inv,
                "tester_type": "CUS",
                "institution_name": "CUS Tarnów",
                "contact_person": "Piotr Wrona",
                "contact_email": "p.wrona@cus.tarnow.pl",
                "testing_scope": "pilotaz_1m",
                "target_audience_count": 15,
            },
        )
        assert res1.status_code == 201

        # 1. Próba pobrania bez uprawnień administratora ROPS (powinna być zablokowana - ochrona danych osobowych RODO)
        res_unauthorized = client.get("/api/testing/applications")
        assert res_unauthorized.status_code == 403

        # 2. Pobranie listy jako Administrator ROPS
        admin_headers = {"X-Admin-Role": "rops_admin"}
        res_all = client.get("/api/testing/applications", headers=admin_headers)
        assert res_all.status_code == 200
        assert len(res_all.json()) >= 1

        # 3. Filtrowanie po innovation_id jako Administrator ROPS
        res_filtered = client.get(
            f"/api/testing/applications?innovation_id={target_inv}",
            headers=admin_headers,
        )
        assert res_filtered.status_code == 200
        matched = res_filtered.json()
        assert len(matched) >= 1
        assert all(item["innovation_id"] == target_inv for item in matched)

    def test_get_application_by_id(self):
        """Pobieranie pojedynczej aplikacji po ID wymaga uprawnień ROPS (ochrona danych) i zwraca 404 dla nieistniejącej."""
        inv_id = self.test_inv_id
        create_res = client.post(
            "/api/testing/apply",
            json={
                "innovation_id": inv_id,
                "tester_type": "NGO",
                "institution_name": "Fundacja Aktywna Wieś",
                "contact_person": "Marta Lis",
                "contact_email": "marta@aktywnawies.org",
            },
        )
        app_id = create_res.json()["id"]

        # Próba anonimowa (403 Forbidden)
        anon_res = client.get(f"/api/testing/applications/{app_id}")
        assert anon_res.status_code == 403

        # Odczyt jako Administrator ROPS
        admin_headers = {"X-Admin-Role": "rops_admin"}
        get_res = client.get(f"/api/testing/applications/{app_id}", headers=admin_headers)
        assert get_res.status_code == 200
        assert get_res.json()["id"] == app_id
        assert get_res.json()["institution_name"] == "Fundacja Aktywna Wieś"

        # Błędne ID
        bad_res = client.get(f"/api/testing/applications/{uuid.uuid4()}", headers=admin_headers)
        assert bad_res.status_code == 404

    def test_patch_status_authorization(self):
        """Tylko administrator ROPS może zmienić status testu innowacji."""
        inv_id = self.test_inv_id
        create_res = client.post(
            "/api/testing/apply",
            json={
                "innovation_id": inv_id,
                "tester_type": "JST",
                "institution_name": "Gmina Zabierzów",
                "contact_person": "Krzysztof Bąk",
                "contact_email": "krzysztof@zabierzow.pl",
            },
        )
        app_id = create_res.json()["id"]

        # 1. Próba anonimowa (powinna zwrócić 403 Forbidden)
        anon_res = client.patch(
            f"/api/testing/applications/{app_id}/status",
            json={"status": "zaakceptowane"},
        )
        assert anon_res.status_code == 403

        # 2. Próba z rolą wnioskodawcy (403)
        applicant_res = client.patch(
            f"/api/testing/applications/{app_id}/status",
            headers={"X-Admin-Role": "applicant"},
            json={"status": "zaakceptowane"},
        )
        assert applicant_res.status_code == 403

        # 3. Zmiana jako Administrator ROPS Kraków
        admin_res = client.patch(
            f"/api/testing/applications/{app_id}/status",
            headers={"X-Admin-Role": "rops_admin"},
            json={
                "status": "zaakceptowane",
                "notes": "Zatwierdzono dofinansowanie pilotażu z ROPS Kraków.",
            },
        )
        assert admin_res.status_code == 200
        assert admin_res.json()["status"] == "zaakceptowane"
        assert "Zatwierdzono" in admin_res.json()["notes"]

    def test_submit_feedback_and_scoring(self):
        """Dodanie recenzji wylicza poprawną średnią ważoną i zapisuje wskaźniki."""
        inv_id = self.test_inv_id
        res = client.post(
            "/api/testing/feedback",
            json={
                "innovation_id": inv_id,
                "rating_usability": 5,
                "rating_effectiveness": 4,
                "rating_accessibility": 3,
                "pros": "Świetna integracja międzypokoleniowa i zaangażowanie OSP.",
                "cons_and_barriers": "Wymaga wsparcia transportowego dla sołectw oddalonych.",
                "suggested_improvements": "Dodać skróconą instrukcję ETR dla seniorów.",
                "would_recommend": True,
                "author_name": "Koordynator CUS Wieliczka",
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert data["innovation_id"] == inv_id
        # Średnia: (5 + 4 + 3) / 3 = 4.0
        assert data["average_score"] == 4.0
        assert data["would_recommend"] is True
        assert data["author_name"] == "Koordynator CUS Wieliczka"

    def test_feedback_summary_aggregation(self):
        """Raport podsumowujący poprawnie agreguje wiele opinii i wskaźnik rekomendacji."""
        target_inv = self.test_inv_id_2

        # Opinia 1: 5, 5, 5 (rekomenduje: True)
        client.post(
            "/api/testing/feedback",
            json={
                "innovation_id": target_inv,
                "rating_usability": 5,
                "rating_effectiveness": 5,
                "rating_accessibility": 5,
                "would_recommend": True,
                "author_name": "Tester 1",
            },
        )
        # Opinia 2: 3, 3, 3 (rekomenduje: False)
        client.post(
            "/api/testing/feedback",
            json={
                "innovation_id": target_inv,
                "rating_usability": 3,
                "rating_effectiveness": 3,
                "rating_accessibility": 3,
                "would_recommend": False,
                "author_name": "Tester 2",
            },
        )

        res = client.get(f"/api/testing/feedback/{target_inv}")
        assert res.status_code == 200
        summary = res.json()
        assert summary["innovation_id"] == target_inv
        assert summary["total_reviews"] == 2
        assert summary["avg_usability"] == 4.0
        assert summary["avg_effectiveness"] == 4.0
        assert summary["avg_accessibility"] == 4.0
        assert summary["overall_rating"] == 4.0
        # 1 z 2 rekomenduje -> 50%
        assert summary["recommendation_percentage"] == 50.0
        assert len(summary["recent_reviews"]) == 2

    def test_global_testing_summary(self):
        """Globalne statystyki modułu testowania zawierają liczbę aplikacji i pilotaży."""
        res = client.get("/api/testing/summary")
        assert res.status_code == 200
        summary = res.json()
        assert "total_applications" in summary
        assert "active_pilots" in summary
        assert "completed_pilots" in summary
        assert "total_feedbacks" in summary
        assert "overall_avg_rating" in summary
        assert isinstance(summary["top_rated_innovations"], list)
        assert isinstance(summary["applications_by_status"], dict)

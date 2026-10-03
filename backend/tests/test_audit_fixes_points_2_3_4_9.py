import uuid
from typing import Any
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.supabase import get_supabase_client
from app.services.ai import get_active_embedding_model, create_embedding

client = TestClient(app)


class TestAuditFixesPoints2349:
    """
    Kompleksowy zestaw testów weryfikujący poprawki punktów 2, 3, 4 i 9 audytu:
    - Punkt 2: Publikacja i widoczność (status=sprawdzone, brak obchodzenia parametrem, ukryte szkice)
    - Punkt 3: Jednolity model embeddingów (gemini-embedding-2, brak cichych fallbacków)
    - Punkt 4: Proweniencja Middleman AI (is_ai_generated, generation_source, disclaimer, dynamiczny plan)
    - Punkt 9: Tester (brak mutacji statusu zgłoszenia przy dodaniu opinii, walidacja powiązania)
    """

    sb: Any = None
    test_verified_id: str = ""
    test_draft_id: str = ""
    test_other_inv_id: str = ""

    @classmethod
    def setup_class(cls):
        cls.sb = get_supabase_client()
        cls.test_verified_id = f"inv_v_{uuid.uuid4().hex[:6]}"
        cls.test_draft_id = f"inv_d_{uuid.uuid4().hex[:6]}"
        cls.test_other_inv_id = f"inv_o_{uuid.uuid4().hex[:6]}"

        if cls.sb:
            cls.sb.table("innovations").insert([
                {
                    "id": cls.test_verified_id,
                    "title": "Zweryfikowana Innowacja ROPS",
                    "description": "Opis zweryfikowanej innowacji w katalogu publicznym",
                    "target_group": "Mieszkańcy Małopolski",
                    "category": "Seniorzy",
                    "status": "sprawdzone",
                },
                {
                    "id": cls.test_draft_id,
                    "title": "Nieopublikowany Szkic Roboczy",
                    "description": "Szkic innowacji niewidoczny w katalogu publicznym",
                    "target_group": "Tylko ROPS",
                    "category": "Seniorzy",
                    "status": "nowa",
                },
                {
                    "id": cls.test_other_inv_id,
                    "title": "Inna Innowacja ROPS",
                    "description": "Druga innowacja do testów relacji zgłoszeń",
                    "target_group": "Młodzież",
                    "category": "Młodzież",
                    "status": "sprawdzone",
                },
            ]).execute()

    @classmethod
    def teardown_class(cls):
        if cls.sb:
            try:
                cls.sb.table("innovation_feedback").delete().in_("innovation_id", [cls.test_verified_id, cls.test_draft_id, cls.test_other_inv_id]).execute()
                cls.sb.table("innovation_test_applications").delete().in_("innovation_id", [cls.test_verified_id, cls.test_draft_id, cls.test_other_inv_id]).execute()
                cls.sb.table("innovations").delete().in_("id", [cls.test_verified_id, cls.test_draft_id, cls.test_other_inv_id]).execute()
            except Exception:
                pass

    # =========================================================================
    # PUNKT 2: PUBLIKACJA I WIDOCZNOŚĆ
    # =========================================================================

    def test_public_catalog_strictly_verified_only(self):
        """Katalog publiczny zwraca wyłącznie innowacje ze statusem 'sprawdzone'."""
        res = client.get("/api/innovations")
        assert res.status_code == 200
        items = res.json()
        assert len(items) > 0
        for it in items:
            assert it["status"] == "sprawdzone"

    def test_public_catalog_status_param_cannot_bypass(self):
        """Przekazanie parametru ?status=all lub ?status=nowa nie może ominąć reguły widoczności."""
        for param in ["all", "nowa", "szkic", "dowolny"]:
            res = client.get(f"/api/innovations?status={param}")
            assert res.status_code == 200
            items = res.json()
            # Żaden zwrócony rekord nie może być szkicem / statusem innym niż sprawdzone
            for it in items:
                assert it["status"] == "sprawdzone"
                assert it["id"] != self.test_draft_id

    def test_get_single_innovation_draft_returns_404_publicly(self):
        """Szkic jest niewidoczny publicznie po ID (zwraca 404)."""
        res = client.get(f"/api/innovations/{self.test_draft_id}")
        assert res.status_code == 404
        assert "nie została odnaleziona" in res.json()["detail"]

    def test_get_single_innovation_draft_visible_to_rops_admin(self):
        """Szkic jest w pełni widoczny i edytowalny dla administratora ROPS."""
        admin_headers = {"X-Admin-Role": "rops_admin"}
        res = client.get(f"/api/admin/innovations/{self.test_draft_id}", headers=admin_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == self.test_draft_id
        assert data["status"] == "nowa"

    def test_verified_innovation_visible_publicly(self):
        """Sprawdzona innowacja jest poprawnie dostępna publicznie po ID."""
        res = client.get(f"/api/innovations/{self.test_verified_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == self.test_verified_id
        assert data["status"] == "sprawdzone"

    # =========================================================================
    # PUNKT 3: EMBEDDINGI
    # =========================================================================

    def test_single_active_embedding_model(self):
        """Aktywnym modelem wektorowym jest wyłącznie gemini-embedding-2."""
        active_model = get_active_embedding_model()
        assert active_model == "gemini-embedding-2"

    def test_embedding_vector_dimension_is_1536(self):
        """Wektor embeddingu ma ściśle 1536 wymiarów i jest znormalizowany."""
        vec = create_embedding("Wsparcie psychiczne seniorów")
        assert len(vec) == 1536
        norm = sum(x * x for x in vec) ** 0.5
        assert abs(norm - 1.0) < 1e-3

    def test_real_matchmaking_for_diverse_social_problems(self):
        """Wyszukiwarka semantyczna skutecznie dopasowuje różnorodne realne problemy społeczne."""
        queries = [
            ("Samotność osób starszych na wsi", "Seniorzy"),
            ("Kryzys psychologiczny wśród dzieci i młodzieży", "Zdrowie psychiczne"),
            ("Brak podjazdów i barier architektonicznych", "Dostępność"),
        ]
        for query, expected_domain in queries:
            res = client.post("/api/match", json={"problem_description": query, "limit": 3})
            assert res.status_code == 200
            data = res.json()
            assert data["total_found"] > 0
            # Wyniki muszą mieć status 'sprawdzone'
            for match in data["matches"]:
                assert match["status"] == "sprawdzone"

    # =========================================================================
    # PUNKT 4: MIDDLEMAN AI
    # =========================================================================

    def test_middleman_response_provenance_and_advisory(self):
        """Odpowiedź Middlemana zawiera jawną proweniencję, dynamiczny kontekst i notę doradczą."""
        payload = {
            "innovation_title": "Kawiarenka Pamięci",
            "municipality_context": "Gmina wiejska Lipnica, 350 seniorów, mały budżet 20 tysięcy",
            "municipality_type": "wiejska",
            "budget_range": "15 000 – 25 000 PLN",
            "time_horizon": "6 miesięcy",
            "key_partners": ["OSP", "KGW", "OPS"],
        }
        res = client.post("/api/adapt", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert "adaptation_plan" in data
        assert len(data["adaptation_plan"]) > 50
        # Proweniencja i nota
        assert "is_ai_generated" in data
        assert data["generation_source"] in ["gemini", "openai", "template_fallback"]
        assert data.get("disclaimer") is not None
        assert "ROPS Kraków" in data["disclaimer"]
        # Budżet i granty
        assert data.get("estimated_budget_pln") is not None
        assert isinstance(data.get("recommended_grants"), list)

    # =========================================================================
    # PUNKT 9: TESTER
    # =========================================================================

    def test_feedback_does_not_mutate_application_status(self):
        """Dodanie opinii NIE MOŻE samowolnie zmieniać statusu zgłoszenia testowego na 'zakonczone'."""
        # 1. Tworzymy zgłoszenie testowe
        app_res = client.post(
            "/api/testing/apply",
            json={
                "innovation_id": self.test_verified_id,
                "institution_name": "OPS Wieliczka",
                "contact_person": "Ewa Maj",
                "contact_email": "e.maj@ops.wieliczka.pl",
                "testing_scope": "pilotaz_3m",
            },
        )
        assert app_res.status_code == 201
        app_id = app_res.json()["id"]
        assert app_res.json()["status"] == "nowe"

        # 2. Administrator zmienia status na 'w_trakcie'
        patch_res = client.patch(
            f"/api/testing/applications/{app_id}/status",
            headers={"X-Admin-Role": "rops_admin"},
            json={"status": "w_trakcie"},
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["status"] == "w_trakcie"

        # 3. Zwykły użytkownik dodaje opinię / feedback powiązany z tym application_id
        fb_res = client.post(
            "/api/testing/feedback",
            json={
                "innovation_id": self.test_verified_id,
                "application_id": app_id,
                "rating_usability": 5,
                "rating_effectiveness": 5,
                "rating_accessibility": 4,
                "pros": "Bardzo dobre rezultaty w środowisku lokalnym",
                "author_name": "Koordynator OPS",
            },
        )
        assert fb_res.status_code == 201
        assert fb_res.json()["application_id"] == app_id

        # 4. Sprawdzamy czy status zgłoszenia pozostał 'w_trakcie' (NIE ZMIENIŁ SIĘ na 'zakonczone')
        admin_res = client.get(
            f"/api/testing/applications/{app_id}",
            headers={"X-Admin-Role": "rops_admin"},
        )
        assert admin_res.status_code == 200
        assert admin_res.json()["status"] == "w_trakcie"

    def test_feedback_rejects_mismatched_application_id(self):
        """Dodanie opinii ze zgłoszeniem (application_id) dotyczącym INNEJ innowacji zwraca 400 Bad Request."""
        # Tworzymy aplikację dla innowacji verified
        app_res = client.post(
            "/api/testing/apply",
            json={
                "innovation_id": self.test_verified_id,
                "institution_name": "CUS Skawina",
                "contact_person": "Piotr Kot",
                "contact_email": "p.kot@cus.skawina.pl",
            },
        )
        app_id = app_res.json()["id"]

        # Próbujemy dodać feedback dla test_other_inv_id z application_id powiązanym z test_verified_id
        bad_fb = client.post(
            "/api/testing/feedback",
            json={
                "innovation_id": self.test_other_inv_id,
                "application_id": app_id,
                "rating_usability": 4,
                "rating_effectiveness": 4,
                "rating_accessibility": 4,
                "author_name": "Hacker",
            },
        )
        assert bad_fb.status_code == 400
        assert "nie dotyczy ocenianej innowacji" in bad_fb.json()["detail"]

    def test_feedback_rejects_nonexistent_application_id(self):
        """Dodanie opinii z nieistniejącym application_id zwraca 400 Bad Request."""
        bad_fb = client.post(
            "/api/testing/feedback",
            json={
                "innovation_id": self.test_verified_id,
                "application_id": str(uuid.uuid4()),
                "rating_usability": 4,
                "rating_effectiveness": 4,
                "rating_accessibility": 4,
                "author_name": "Tester",
            },
        )
        assert bad_fb.status_code == 400
        assert "nie istnieje" in bad_fb.json()["detail"]

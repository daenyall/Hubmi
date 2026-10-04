import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestCommunityNeeds:
    """
    Kompleksowy zestaw testów dla Modułu Zbierania Potrzeb i Agregacji Regionalnej (Punkt 7):
    - Zgłoszenie samej potrzeby bez rozwiązania
    - Zabezpieczenie pól administracyjnych (status, notatki ROPS)
    - Ochrona przed spamem (honeypot, walidacja)
    - Izolacja uprawnień: Gość, Autor, Administrator ROPS
    - Zestawienie analityczne dla ROPS (summary)
    - Porównanie okresów pozwalające obserwować trendy (trends)
    - Aktualizacja statusu przez ROPS
    """

    def test_guest_can_submit_community_need(self):
        """Gość (niezalogowany) może zgłosić samą potrzebę bez rozwiązania."""
        payload = {
            "institution_name": "Koło Gospodyń Wiejskich w Zakliczynie",
            "institution_type": "NGO",
            "powiat": "tarnowski",
            "gmina": "Zakliczyn",
            "contact_email": "kgw.zakliczyn@example.pl",
            "category": "Seniorzy",
            "target_group": "Kobiety 70+ samotne na terenach wiejskich",
            "problem_summary": "Brak opieki wytchnieniowej dla opiekunów osób niesamodzielnych",
            "detailed_description": "Wiele rodzin nie ma możliwości skorzystania z kilkudniowej opieki wytchnieniowej z powodu braku wykwalifikowanych opiekunów na terenie gminy.",
            "estimated_affected_count": 35,
            "urgency_level": "wysoki",
        }

        response = client.post("/api/needs", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["status"] == "nowe"
        assert "zarejestrowana" in data["message"].lower()

    def test_author_can_submit_need_and_view_own(self):
        """Zalogowany autor może zgłosić potrzebę i odczytać własne zgłoszenia."""
        headers = {
            "Authorization": "Bearer test-author-token",
            "X-Admin-Role": "applicant",
        }
        payload = {
            "institution_name": "Centrum Usług Społecznych w Skawinie",
            "institution_type": "CUS",
            "powiat": "krakowski",
            "gmina": "Skawina",
            "category": "Zdrowie psychiczne",
            "target_group": "Młodzież szkolna",
            "problem_summary": "Wzrost zachowań depresyjnych pośród młodzieży szkół ponadpodstawowych",
            "detailed_description": "Potrzebne wsparcie mobilnego psychotraumatologa oraz warsztaty radzenia sobie ze stresem.",
            "estimated_affected_count": 150,
            "urgency_level": "krytyczny",
        }

        res_post = client.post("/api/needs", json=payload, headers=headers)
        assert res_post.status_code == 201

        # Odczyt własnych potrzeb przez autora
        res_get = client.get("/api/needs/my", headers=headers)
        assert res_get.status_code == 200
        items = res_get.json()
        assert isinstance(items, list)

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

    def test_validation_short_description_fails(self):
        """Zgłoszenie ze zbyt krótkim opisem jest odrzucane z kodem 422."""
        payload = {
            "institution_name": "Gmina",
            "powiat": "krakowski",
            "category": "Seniorzy",
            "problem_summary": "Za krótki",
            "detailed_description": "Krótko",  # min 10 chars required
        }
        response = client.post("/api/needs", json=payload)
        assert response.status_code == 422

    def test_guest_cannot_access_my_needs(self):
        """Niezalogowany gość otrzymuje 401 przy próbie odczytu /api/needs/my."""
        response = client.get("/api/needs/my")
        assert response.status_code == 401

    def test_guest_and_author_cannot_access_rops_admin_needs(self):
        """Gość i autor otrzymują 403 Forbidden przy próbie dostępu do panelu administracyjnego ROPS."""
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

    def test_rops_admin_can_list_and_filter_needs(self):
        """Administrator ROPS ma pełny dostęp do listy potrzeb z filtrowaniem."""
        headers_rops = {"X-Admin-Role": "rops_admin"}
        
        # Pobranie całości
        response = client.get("/api/admin/needs", headers=headers_rops)
        assert response.status_code == 200
        items = response.json()
        assert isinstance(items, list)
        assert len(items) >= 1

        # Filtrowanie po powiecie
        res_powiat = client.get("/api/admin/needs?powiat=myślenicki", headers=headers_rops)
        assert res_powiat.status_code == 200
        for item in res_powiat.json():
            assert item["powiat"] == "myślenicki"

    def test_rops_admin_summary_aggregation(self):
        """Administrator ROPS otrzymuje zagregowane zestawienie statystyk i hotspotów."""
        headers_rops = {"X-Admin-Role": "rops_admin"}
        response = client.get("/api/admin/needs/summary", headers=headers_rops)
        assert response.status_code == 200
        data = response.json()

        assert "total_needs_reported" in data
        assert data["total_needs_reported"] >= 1
        assert "needs_by_status" in data
        assert "needs_by_urgency" in data
        assert "top_categories" in data
        assert "top_powiats" in data
        assert "emerging_hotspots" in data

        # Weryfikacja struktury kategorii
        if data["top_categories"]:
            top_cat = data["top_categories"][0]
            assert "category" in top_cat
            assert "count" in top_cat
            assert "percentage" in top_cat

        # Weryfikacja hotspotów i rekomendacji polityki społecznej
        if data["emerging_hotspots"]:
            hotspot = data["emerging_hotspots"][0]
            assert "theme" in hotspot
            assert "reported_count" in hotspot
            assert "recommended_action" in hotspot

    def test_rops_admin_trends_period_comparison(self):
        """Administrator ROPS otrzymuje porównanie okresów i trendy wzrostu/spadku."""
        headers_rops = {"X-Admin-Role": "rops_admin"}
        response = client.get("/api/admin/needs/trends?period_days=30", headers=headers_rops)
        assert response.status_code == 200
        data = response.json()

        assert data["period_days"] == 30
        assert "current_period" in data
        assert "previous_period" in data
        assert "total_growth_percentage" in data
        assert "category_trends" in data
        assert "powiat_trends" in data

        # Sprawdzenie kierunku trendu w kategoriach
        if data["category_trends"]:
            trend_item = data["category_trends"][0]
            assert "name" in trend_item
            assert "current_count" in trend_item
            assert "previous_count" in trend_item
            assert "trend" in trend_item
            assert trend_item["trend"] in ("wzrostowy", "spadkowy", "stabilny")

    def test_rops_admin_can_update_status_and_notes(self):
        """Administrator ROPS może formalnie zmienić status potrzeby i dodać notatkę analityczną."""
        headers_rops = {"X-Admin-Role": "rops_admin"}
        
        # Pobranie pierwszego zgłoszenia
        list_res = client.get("/api/admin/needs", headers=headers_rops)
        assert list_res.status_code == 200
        first_id = list_res.json()[0]["id"]

        # Zmiana statusu
        patch_payload = {
            "status": "uwzglednione_w_naborze",
            "rops_internal_notes": "Włączono do kryteriów naboru grantów testujących FERS 2026/Q4.",
        }
        res_patch = client.patch(f"/api/admin/needs/{first_id}/status", json=patch_payload, headers=headers_rops)
        assert res_patch.status_code == 200
        updated = res_patch.json()
        assert updated["id"] == first_id
        assert updated["status"] == "uwzglednione_w_naborze"
        assert "FERS 2026/Q4" in updated["rops_internal_notes"]

    def test_author_cannot_update_need_status(self):
        """Zwykły autor otrzymuje 403 przy próbie zmiany statusu potrzeby."""
        headers_author = {"X-Admin-Role": "applicant"}
        patch_payload = {"status": "zaadresowane"}
        res = client.patch("/api/admin/needs/any-id/status", json=patch_payload, headers=headers_author)
        assert res.status_code == 403

    def test_admin_fields_tampering_blocked_on_submit(self):
        """Próba wstrzyknięcia statusu lub notatek ROPS w publicznym POST jest ignorowana / wymusza 'nowe'."""
        payload = {
            "institution_name": "Atakujący Podmiot",
            "powiat": "wadowicki",
            "category": "Dostępność",
            "problem_summary": "Próba wstrzyknięcia statusu zaakceptowanego",
            "detailed_description": "Opis problemu społecznego z próbą podrobienia pól administracyjnych.",
            "status": "uwzglednione_w_naborze",  # Próba nadpisania statusu!
            "rops_internal_notes": "Fałszywa notatka urzędowa",  # Próba wstrzyknięcia notatki!
        }
        res = client.post("/api/needs", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "nowe"  # Wymuszony bezpieczny status!

        # Weryfikacja w panelu admina czy notatka nie została zapisana
        headers_rops = {"X-Admin-Role": "rops_admin"}
        need_res = client.get(f"/api/admin/needs?search=wstrzykni%C4%99cia", headers=headers_rops)
        assert need_res.status_code == 200
        found = [n for n in need_res.json() if n["id"] == data["id"]]
        if found:
            assert found[0]["status"] == "nowe"
            assert found[0]["rops_internal_notes"] is None

    def test_search_and_category_filtering(self):
        """Wyszukiwanie tekstowe i filtrowanie kategorii działa precyzyjnie."""
        headers_rops = {"X-Admin-Role": "rops_admin"}
        res = client.get("/api/admin/needs?category=Seniorzy", headers=headers_rops)
        assert res.status_code == 200
        for item in res.json():
            assert item["category"].lower() == "seniorzy"

    def test_update_nonexistent_need_returns_404(self):
        """Aktualizacja nieistniejącego id zwraca 404 Not Found."""
        headers_rops = {"X-Admin-Role": "rops_admin"}
        res = client.patch(
            "/api/admin/needs/00000000-0000-0000-0000-000000000000/status",
            json={"status": "analizowane"},
            headers=headers_rops,
        )
        assert res.status_code == 404


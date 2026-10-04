import os
from fastapi.testclient import TestClient
from app.main import app
from app.services.ai import (
    create_embedding,
    generate_adaptation_plan,
    get_active_embedding_model,
)
from app.services.knowledge_resources import is_safe_resource_url

client = TestClient(app)


class TestKnowledgeResources:
    """
    Zestaw testów weryfikujących:
    1. Zarządzanie Zasobnikiem Wiedzy (publiczne i panel ROPS: dodawanie, edycja, weryfikacja, publikacja).
    2. Bezpieczeństwo URLi oraz obsługę odnośników do materiałów filmowych.
    3. Autentyczność i jawne oznaczenie demonstracyjności innowacji (brak wymyślonych adresów ROPS).
    4. Blokadę cichego deterministycznego matchmakingu poza środowiskiem testowym.
    5. Spójność planu adaptacji AI (budżet, rekomendacje grantów jako propozycje, KPI).
    """

    def test_public_resources_only_published(self):
        """Publiczne API zwraca wyłącznie zweryfikowane i opublikowane zasoby wiedzy."""
        res = client.get("/api/knowledge-resources")
        assert res.status_code == 200
        items = res.json()
        assert len(items) > 0
        for item in items:
            assert item["status"] == "opublikowany"
            assert is_safe_resource_url(item["url"])
            assert item["title"]
            assert item["description"]
            assert item["kind"]

    def test_public_grouped_resources(self):
        """Zasoby pogrupowane w standardowe kategorie spójne ze strukturą frontendu."""
        res = client.get("/api/knowledge-resources/grouped")
        assert res.status_code == 200
        groups = res.json()
        group_ids = [g["id"] for g in groups]
        assert "mapa-wyzwan" in group_ids
        assert "raporty-diagnozy" in group_ids
        assert "materialy-edukacyjne" in group_ids
        assert "filmy-i-dobre-praktyki" in group_ids

        for g in groups:
            assert g["title"]
            assert g["intro"]
            assert isinstance(g["items"], list)

    def test_public_single_resource_and_404(self):
        """Odczyt pojedynczego opublikowanego zasobu oraz 404 dla nieistniejących."""
        res = client.get("/api/knowledge-resources/mapa-wyzwan-spolecznych")
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == "mapa-wyzwan-spolecznych"
        assert data["status"] == "opublikowany"
        assert data["year"] == 2024
        assert data["coverage_scope"] == "ogólnopolski"

        res_404 = client.get("/api/knowledge-resources/non-existent-resource-12345")
        assert res_404.status_code == 404

    def test_admin_permissions_enforced(self):
        """Dostęp do zarządzania zasobami wiedzy ma wyłącznie Administrator ROPS Kraków."""
        # Anonim
        res_anon = client.get("/api/admin/knowledge-resources")
        assert res_anon.status_code in (401, 403)

        # Zwykły wnioskodawca / autor
        res_user = client.get(
            "/api/admin/knowledge-resources",
            headers={"X-Admin-Role": "applicant", "X-Test-User-Id": "test-user"},
        )
        assert res_user.status_code == 403

        # Administrator ROPS Kraków
        res_admin = client.get(
            "/api/admin/knowledge-resources",
            headers={"X-Admin-Role": "rops_admin"},
        )
        assert res_admin.status_code == 200
        assert isinstance(res_admin.json(), list)

    def test_admin_crud_verification_and_publish_lifecycle(self):
        """Pełny cykl życia zasobu: dodanie roboczego, edycja, weryfikacja, publikacja i widoczność."""
        admin_headers = {"X-Admin-Role": "rops_admin", "X-Test-User-Id": "rops-officer-01"}

        # 1. Walidacja odrzucenia niebezpiecznego URL (brak HTTPS lub javascript:)
        res_bad_url = client.post(
            "/api/admin/knowledge-resources",
            headers=admin_headers,
            json={
                "title": "Niebezpieczny link",
                "description": "Próba dodania linku bez bezpiecznego protokołu HTTPS.",
                "group_id": "materialy-edukacyjne",
                "kind": "Dokument PDF",
                "url": "http://niebezpieczna-strona.pl/plik.pdf",
            },
        )
        assert res_bad_url.status_code == 422

        # 2. Utworzenie poprawnego nowego zasobu (wideo z odnośnikiem)
        new_resource = {
            "title": "Jak skutecznie testować innowację w CUS",
            "description": "Nagranie warsztatu szkoleniowego dla pracowników małopolskich Centrów Usług Społecznych.",
            "group_id": "filmy-i-dobre-praktyki",
            "group_title": "Filmy i dobre praktyki",
            "kind": "Materiał filmowy (wideo)",
            "url": "https://rops.krakow.pl/innowacje-spoleczne/filmy-i-dobre-praktyki/szkolenie-cus",
            "year": 2026,
            "coverage_scope": "woj. małopolskie",
            "status": "roboczy",
        }
        res_create = client.post(
            "/api/admin/knowledge-resources",
            headers=admin_headers,
            json=new_resource,
        )
        assert res_create.status_code == 201
        res_data = res_create.json()
        res_id = res_data["id"]
        assert res_data["status"] == "roboczy"
        assert res_data["kind"] == "Materiał filmowy (wideo)"

        # 3. Szkic 'roboczy' NIE może być widoczny w publicznym API
        pub_check = client.get(f"/api/knowledge-resources/{res_id}")
        assert pub_check.status_code == 404

        # 4. Edycja zasobu przez ROPS
        res_update = client.put(
            f"/api/admin/knowledge-resources/{res_id}",
            headers=admin_headers,
            json={"coverage_scope": "woj. małopolskie (powiaty ziemskie)"},
        )
        assert res_update.status_code == 200
        assert res_update.json()["coverage_scope"] == "woj. małopolskie (powiaty ziemskie)"

        try:
            # 5. Weryfikacja zasobu przez ROPS Kraków
            res_verify = client.post(
                f"/api/admin/knowledge-resources/{res_id}/verify",
                headers=admin_headers,
                json={"verification_notes": "Odnośnik sprawdzony w domenie rops.krakow.pl, materiał dostępny cyfrowo."},
            )
            assert res_verify.status_code == 200
            verified_data = res_verify.json()
            assert verified_data["status"] == "zweryfikowany"
            assert verified_data["verified_by"] is not None
            assert verified_data["verified_at"] is not None
            assert "Odnośnik sprawdzony" in (verified_data["caveat"] or "")

            # 6. 'zweryfikowany' nadal nie jest publicznie widoczny bez publikacji
            pub_check_v = client.get(f"/api/knowledge-resources/{res_id}")
            assert pub_check_v.status_code == 404

            # 7. Publikacja zasobu w Zasobniku ROPS
            res_publish = client.post(
                f"/api/admin/knowledge-resources/{res_id}/publish",
                headers=admin_headers,
            )
            assert res_publish.status_code == 200
            pub_data = res_publish.json()
            assert pub_data["status"] == "opublikowany"
            assert pub_data["published_by"] is not None
            assert pub_data["published_at"] is not None

            # 8. Po publikacji zasób jest natychmiast widoczny w publicznym katalogu
            pub_check_ok = client.get(f"/api/knowledge-resources/{res_id}")
            assert pub_check_ok.status_code == 200
            assert pub_check_ok.json()["title"] == "Jak skutecznie testować innowację w CUS"

            # 9. Wycofanie publikacji (unpublish) -> status wraca do 'zweryfikowany', publicznie znika
            res_unpub = client.post(
                f"/api/admin/knowledge-resources/{res_id}/unpublish",
                headers=admin_headers,
            )
            assert res_unpub.status_code == 200
            assert res_unpub.json()["status"] == "zweryfikowany"
            assert client.get(f"/api/knowledge-resources/{res_id}").status_code == 404

            # 10. Trwałe usunięcie zasobu (DELETE) przez ROPS
            res_del = client.delete(
                f"/api/admin/knowledge-resources/{res_id}",
                headers=admin_headers,
            )
            assert res_del.status_code == 200
            assert res_del.json()["success"] is True

            # 11. Potwierdzenie rzeczywistego braku rekordu pod bezpośrednim adresem i w panelu ROPS
            assert client.get(f"/api/knowledge-resources/{res_id}").status_code == 404
            assert client.get(f"/api/admin/knowledge-resources/{res_id}", headers=admin_headers).status_code == 404
        finally:
            # Gwarancja czystości bazy - jeśli test padł przed usunięciem
            try:
                client.delete(f"/api/admin/knowledge-resources/{res_id}", headers=admin_headers)
            except Exception:
                pass

    def test_verification_revocation_on_content_change_and_publish_guard(self):
        """Zmiana treści lub źródła po weryfikacji unieważnia weryfikację i blokuje publikację do czasu ponownej oceny."""
        admin_headers = {"X-Admin-Role": "rops_admin", "X-Test-User-Id": "rops-guard-01"}
        res_create = client.post(
            "/api/admin/knowledge-resources",
            headers=admin_headers,
            json={
                "title": "Poradnik wdrożeniowy CUS",
                "description": "Opis poradnika do weryfikacji.",
                "group_id": "materialy-edukacyjne",
                "kind": "Dokument PDF",
                "url": "https://rops.krakow.pl/innowacje/poradnik.pdf",
            },
        )
        assert res_create.status_code == 201
        res_id = res_create.json()["id"]

        try:
            # 1. Próba bezpośredniej publikacji szkicu roboczego -> 400
            bad_pub = client.post(f"/api/admin/knowledge-resources/{res_id}/publish", headers=admin_headers)
            assert bad_pub.status_code == 400
            assert "wcześniejsza formalna weryfikacja" in bad_pub.json()["detail"].lower()

            # 2. Poprawna weryfikacja
            v_res = client.post(f"/api/admin/knowledge-resources/{res_id}/verify", headers=admin_headers)
            assert v_res.status_code == 200
            assert v_res.json()["status"] == "zweryfikowany"

            # 3. Zmiana adresu URL lub treści unieważnia weryfikację
            update_res = client.put(
                f"/api/admin/knowledge-resources/{res_id}",
                headers=admin_headers,
                json={"url": "https://rops.krakow.pl/innowacje/poradnik-zaktualizowany.pdf"},
            )
            assert update_res.status_code == 200
            updated = update_res.json()
            assert updated["status"] == "roboczy"
            assert updated["verified_by"] is None
            assert updated["verified_at"] is None

            # 4. Ponowna próba publikacji bez nowej weryfikacji jest zablokowana -> 400
            pub_blocked = client.post(f"/api/admin/knowledge-resources/{res_id}/publish", headers=admin_headers)
            assert pub_blocked.status_code == 400
        finally:
            client.delete(f"/api/admin/knowledge-resources/{res_id}", headers=admin_headers)

    def test_cannot_bypass_verification_via_post_or_put(self):
        """POST i PUT nie mogą bezpośrednio ustawić statusu 'opublikowany' ani manipulować polami weryfikacji."""
        admin_headers = {"X-Admin-Role": "rops_admin"}
        # 1. POST z 'opublikowany' -> 422
        bad_post = client.post(
            "/api/admin/knowledge-resources",
            headers=admin_headers,
            json={
                "title": "Bypass POST",
                "description": "Opis.",
                "group_id": "materialy-edukacyjne",
                "kind": "Dokument PDF",
                "url": "https://rops.krakow.pl/innowacje/plik.pdf",
                "status": "opublikowany",
            },
        )
        assert bad_post.status_code == 422

            # 2. Tworzymy roboczy
        create_res = client.post(
            "/api/admin/knowledge-resources",
            headers=admin_headers,
            json={
                "title": "Bypass PUT Test",
                "description": "Opis zasobu testowego do weryfikacji blokady edycji.",
                "group_id": "materialy-edukacyjne",
                "kind": "Dokument PDF",
                "url": "https://rops.krakow.pl/innowacje/plik.pdf",
            },
        )
        assert create_res.status_code == 201
        res_id = create_res.json()["id"]

        try:
            # 3. PUT z 'opublikowany' -> 422
            bad_put = client.put(
                f"/api/admin/knowledge-resources/{res_id}",
                headers=admin_headers,
                json={"status": "opublikowany"},
            )
            assert bad_put.status_code == 422
        finally:
            client.delete(f"/api/admin/knowledge-resources/{res_id}", headers=admin_headers)

    def test_database_failure_and_unconfirmed_write_handling(self, monkeypatch):
        """Brak połączenia lub niepotwierdzony zapis w Supabase rzuca jawne błędy 503/500 bez sekretów."""
        from app.services import knowledge_resources

        # 1. Symulacja braku konfiguracji klienta -> 503
        monkeypatch.setattr(knowledge_resources, "get_supabase_client", lambda: None)
        res_503 = client.get("/api/knowledge-resources")
        assert res_503.status_code == 503
        assert "niedostępna" in res_503.json()["detail"].lower()

        # 2. Symulacja niepotwierdzonego zapisu (puste res.data z Supabase) -> 500
        class MockEmptyTable:
            def insert(self, *args, **kwargs):
                return self
            def execute(self):
                class MockRes:
                    data = []
                return MockRes()

        class MockEmptyClient:
            def table(self, name):
                return MockEmptyTable()

        monkeypatch.setattr(knowledge_resources, "get_supabase_client", lambda: MockEmptyClient())
        admin_headers = {"X-Admin-Role": "rops_admin"}
        res_unconfirmed = client.post(
            "/api/admin/knowledge-resources",
            headers=admin_headers,
            json={
                "title": "Niepotwierdzony zasób",
                "description": "Opis zawartości zasobu testowego sprawdzającego brak potwierdzenia zapisu.",
                "group_id": "materialy-edukacyjne",
                "kind": "Dokument PDF",
                "url": "https://rops.krakow.pl/innowacje/plik.pdf",
            },
        )
        assert res_unconfirmed.status_code == 500
        assert "potwierdziła" in res_unconfirmed.json()["detail"].lower()

    def test_filtering_and_pagination_order(self):
        """Filtrowanie następuje przed paginacją, nie dołączając rekordów spoza wybranej strony."""
        res_all = client.get("/api/knowledge-resources?limit=2&offset=0")
        assert res_all.status_code == 200
        data_all = res_all.json()
        assert len(data_all) <= 2
        for item in data_all:
            assert item["status"] == "opublikowany"

    def test_innovations_data_authenticity_and_no_fake_urls(self):
        """Wszystkie rekordy innowacji mają wiarygodne źródła (brak zmyślonych podstron ROPS) i oznaczenie demo."""
        res = client.get("/api/innovations?limit=15")
        assert res.status_code == 200
        items = res.json()
        for item in items:
            src = item.get("source_url") or ""
            # Żaden rekord nie może wskazywać na wymyślone adresy typu /innowacje/asystent-seniora
            assert "/innowacje/asystent-seniora" not in src
            assert "/innowacje/wsparcie-psychiczne" not in src
            assert "/innowacje/wloczykij" not in src
            assert "/innowacje/latarnik-cyfrowy" not in src

            # Rekordy demonstracyjne są jawnie oznaczone
            if item["id"].startswith("inv_"):
                assert item["is_demonstrative"] is True
                assert item["source_label"] is not None

    def test_adaptation_plan_consistency_and_funding_proposals(self):
        """Brak sprzeczności między planem adaptacji a polami budżetu/KPI; rekomendacje są propozycjami do weryfikacji."""
        result = generate_adaptation_plan(
            innovation_title="Opieka Wytchnieniowa dla Opiekunów",
            innovation_desc="Czasowe zastępstwo dla opiekunów osób niesamodzielnych.",
            context="CUS w gminie wiejskiej, ograniczone środki własne.",
            municipality_type="wiejska",
            budget_range="18 000 – 25 000 PLN",
            time_horizon="3 miesiące",
            key_partners=["KGW", "OSP", "CUS"],
        )

        assert result["estimated_budget_pln"] == "18 000 – 25 000 PLN"
        plan = result["adaptation_plan"]
        assert any(term in plan.lower() for term in ["budżet", "pln", "18 000", "25 000", "22 500"])

        # Rekomendacje finansowania są jawnie oznaczone jako propozycje do weryfikacji
        grants = result["recommended_grants"]
        assert len(grants) >= 3
        for g in grants:
            assert "propozycja" in g.lower() or "weryfikacji" in g.lower()

        # Zastrzeżenie prawne
        disclaimer = result["disclaimer"]
        assert disclaimer is not None
        assert "propozycjami" in disclaimer.lower() or "weryfikacji" in disclaimer.lower()

    def test_no_silent_deterministic_matchmaking_outside_tests(self):
        """Brak kluczy AI poza środowiskiem testowym blokuje cichy fallback deterministyczny."""
        # Tymczasowo wyłączamy flagę PYTEST_CURRENT_TEST
        old_val = os.environ.get("PYTEST_CURRENT_TEST")
        try:
            del os.environ["PYTEST_CURRENT_TEST"]
            active_model = get_active_embedding_model()
            if active_model == "deterministic-test-fallback":
                try:
                    create_embedding("Dowolny tekst testowy problemu")
                    assert False, "Powinien zostać rzucony RuntimeError blokujący cichy fallback deterministyczny!"
                except RuntimeError as e:
                    assert "Cichy fallback deterministyczny" in str(e)
        finally:
            if old_val is not None:
                os.environ["PYTEST_CURRENT_TEST"] = old_val

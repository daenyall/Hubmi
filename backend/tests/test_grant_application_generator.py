import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.grant_applications import (
    DEFAULT_DEMO_CALL_ID,
    update_grant_call_status,
)

client = TestClient(app)


class TestGrantApplicationGenerator:
    """
    Testy modułu generatora wniosków dla konkretnego naboru (Załącznik nr 3 ROPS Kraków).
    Weryfikacja konfiguracji naboru, walidacji kosztów, izolacji autorów,
    blokady zamkniętego naboru, eksportu i panelu ROPS.
    """

    @pytest.fixture(autouse=True)
    def reset_demo_call_status(self):
        """Zapewnia stan demonstracyjny przed każdym testem."""
        try:
            update_grant_call_status(DEFAULT_DEMO_CALL_ID, "demonstracyjny")
        except Exception:
            pass

    def test_grant_calls_configuration_and_demonstrative_state(self):
        """Lista naborów zawiera oficjalny demonstracyjny wzór Załącznika nr 3 ROPS Kraków."""
        res = client.get("/api/grant-calls")
        assert res.status_code == 200
        calls = res.json()
        assert len(calls) >= 1

        demo_call = next((c for c in calls if c["id"] == DEFAULT_DEMO_CALL_ID), None)
        assert demo_call is not None
        assert demo_call["template_name"] == "za._3._Formularz_aplikacyjny_wzor.pdf"
        assert demo_call["template_version"] == "1.0"
        assert demo_call["status"] == "demonstracyjny"
        assert demo_call["max_grant_amount"] == 100000.0
        assert demo_call["max_prep_months"] == 3
        assert demo_call["max_test_months"] == 9

        # Pobranie pojedynczego naboru
        single_res = client.get(f"/api/grant-calls/{DEFAULT_DEMO_CALL_ID}")
        assert single_res.status_code == 200
        assert single_res.json()["name"] == demo_call["name"]

    def test_admin_can_update_call_status(self):
        """Tylko administrator ROPS może zmienić stan naboru (otwarty, zamkniety, demonstracyjny)."""
        call_id = DEFAULT_DEMO_CALL_ID

        # 1. Próba anonimowa -> 403
        anon_res = client.patch(
            f"/api/admin/grant-calls/{call_id}/status",
            json={"status": "otwarty"},
        )
        assert anon_res.status_code == 403

        # 2. Próba zwykłego wnioskodawcy -> 403
        applicant_res = client.patch(
            f"/api/admin/grant-calls/{call_id}/status",
            headers={"X-Admin-Role": "applicant"},
            json={"status": "otwarty"},
        )
        assert applicant_res.status_code == 403

        # 3. Zmiana przez Administratora ROPS -> 200
        admin_res = client.patch(
            f"/api/admin/grant-calls/{call_id}/status",
            headers={"X-Admin-Role": "rops_admin"},
            json={"status": "otwarty"},
        )
        assert admin_res.status_code == 200
        assert admin_res.json()["status"] == "otwarty"

        # 4. Niepoprawny status -> 400
        bad_status_res = client.patch(
            f"/api/admin/grant-calls/{call_id}/status",
            headers={"X-Admin-Role": "rops_admin"},
            json={"status": "niepoprawny_status"},
        )
        assert bad_status_res.status_code == 400

    def test_author_can_create_and_read_draft(self):
        """Autor może utworzyć roboczy wniosek (draft) i odczytać go z listy własnych wniosków."""
        author_headers = {
            "X-Admin-Role": "applicant",
            "X-Test-User-Id": "author-user-001",
        }

        create_res = client.post(
            "/api/grant-applications",
            headers=author_headers,
            json={
                "call_id": DEFAULT_DEMO_CALL_ID,
                "title": "Mobilna Kawiarnia Senioralna w Gminie Iwkowa",
                "applicant_type": "osoba_fizyczna",
                "applicant_data": {
                    "first_name": "Jan",
                    "last_name": "Kowalski",
                    "email": "jan.kowalski@example.com",
                    "phone": "+48 600 111 222",
                },
            },
        )
        assert create_res.status_code == 201
        data = create_res.json()
        app_id = data["id"]
        assert data["status"] == "roboczy"
        assert data["user_id"] == "author-user-001"
        assert data["title"] == "Mobilna Kawiarnia Senioralna w Gminie Iwkowa"

        # Odczyt listy wniosków autora
        my_res = client.get("/api/grant-applications/my", headers=author_headers)
        assert my_res.status_code == 200
        my_list = my_res.json()
        assert any(item["id"] == app_id for item in my_list)

        # Odczyt pojedynczego wniosku
        detail_res = client.get(f"/api/grant-applications/{app_id}", headers=author_headers)
        assert detail_res.status_code == 200
        assert detail_res.json()["id"] == app_id

    def test_author_can_update_draft(self):
        """Autor może wielokrotnie aktualizować i trwale zapisywać sekcje roboczego wniosku."""
        author_headers = {
            "X-Admin-Role": "applicant",
            "X-Test-User-Id": "author-user-002",
        }

        create_res = client.post(
            "/api/grant-applications",
            headers=author_headers,
            json={"call_id": DEFAULT_DEMO_CALL_ID, "title": "Szkic początkowy"},
        )
        app_id = create_res.json()["id"]

        # Aktualizacja sekcji merytorycznych i budżetu
        update_payload = {
            "title": "Zaktualizowany Tytuł Innowacji",
            "innovation_description": "Nowatorski system teleopieki sąsiedzkiej dla seniorów wiejskich.",
            "innovativeness": "Rozwiązanie łączy technologię IoT z siecią lokalnych wolontariuszy OSP.",
            "grant_amount": 45000.0,
            "action_plan": {
                "prep_period": [
                    {"action_name": "Zakup opasek SOS", "schedule": "styczeń 2025", "cost": 15000.0}
                ],
                "test_period": [
                    {"phase": "faza_1", "action_name": "Test w 2 sołectwach", "schedule": "luty-kwiecień 2025", "cost": 30000.0}
                ],
            },
        }

        put_res = client.put(
            f"/api/grant-applications/{app_id}",
            headers=author_headers,
            json=update_payload,
        )
        assert put_res.status_code == 200
        updated = put_res.json()
        assert updated["title"] == "Zaktualizowany Tytuł Innowacji"
        assert updated["grant_amount"] == 45000.0
        assert updated["total_costs_calculated"] == 45000.0
        assert updated["is_budget_balanced"] is True

    def test_author_isolation_cannot_access_or_edit_other_author_application(self):
        """Rygorystyczna izolacja danych: Autor B nie może podejrzeć ani zmodyfikować wniosku Autora A."""
        headers_a = {"X-Admin-Role": "applicant", "X-Test-User-Id": "author-A"}
        headers_b = {"X-Admin-Role": "applicant", "X-Test-User-Id": "author-B"}

        # Autor A tworzy wniosek
        create_res = client.post(
            "/api/grant-applications",
            headers=headers_a,
            json={"call_id": DEFAULT_DEMO_CALL_ID, "title": "Prywatny Wniosek Autora A"},
        )
        app_a_id = create_res.json()["id"]

        # 1. Autor B próbuje odczytać wniosek Autora A -> 403
        get_b_res = client.get(f"/api/grant-applications/{app_a_id}", headers=headers_b)
        assert get_b_res.status_code == 403
        assert "innego autora" in get_b_res.json()["detail"]

        # 2. Autor B próbuje zmodyfikować wniosek Autora A -> 403
        put_b_res = client.put(
            f"/api/grant-applications/{app_a_id}",
            headers=headers_b,
            json={"title": "Próba wrogiego przejęcia"},
        )
        assert put_b_res.status_code == 403

        # 3. Autor B próbuje złożyć wniosek Autora A -> 403
        submit_b_res = client.post(
            f"/api/grant-applications/{app_a_id}/submit",
            headers=headers_b,
        )
        assert submit_b_res.status_code == 403

        # 4. W liście wniosków Autora B wniosek Autora A nie występuje
        my_b_res = client.get("/api/grant-applications/my", headers=headers_b)
        assert my_b_res.status_code == 200
        assert not any(item["id"] == app_a_id for item in my_b_res.json())

    def test_submit_validation_missing_required_fields(self):
        """Próba złożenia niekompletnego wniosku zwraca 422 Unprocessable Entity z listą błędów."""
        author_headers = {"X-Admin-Role": "applicant", "X-Test-User-Id": "author-valid-01"}

        create_res = client.post(
            "/api/grant-applications",
            headers=author_headers,
            json={"call_id": DEFAULT_DEMO_CALL_ID, "title": "AB"},  # zbyt krótki tytuł
        )
        app_id = create_res.json()["id"]

        submit_res = client.post(
            f"/api/grant-applications/{app_id}/submit",
            headers=author_headers,
        )
        assert submit_res.status_code == 422
        errors = submit_res.json()["detail"]["errors"]
        assert any("Pkt 1:" in e for e in errors)
        assert any("Pkt 2:" in e for e in errors)
        assert any("Pkt 3:" in e for e in errors)
        assert any("Pkt 12:" in e for e in errors)

    def test_submit_validation_cost_inconsistency(self):
        """Niezgodność budżetowa (suma działań != wnioskowany grant) uniemożliwia złożenie wniosku."""
        author_headers = {"X-Admin-Role": "applicant", "X-Test-User-Id": "author-budget-01"}

        # Wypełniamy wszystkie pola poprawnie, ale psujemy sumę kosztów
        valid_data = {
            "title": "Asystentura Społeczna dla Osób Starszych",
            "applicant_type": "osoba_fizyczna",
            "applicant_data": {
                "first_name": "Maria",
                "last_name": "Wiśniewska",
                "email": "maria@example.com",
            },
            "innovation_description": "Kompleksowy model asystentury w małych gminach wiejskich.",
            "innovativeness": "Wykorzystanie lokalnych zasobów bez budowy kosztownej infrastruktury.",
            "problem_diagnosis": "Ponad 40% seniorów w regionie cierpi na samotność i brak opieki.",
            "target_group_description": "Samotni seniorzy 75+ mieszkający w rozproszonych przysiółkach.",
            "expected_change": "Zwiększenie samodzielności i poczucia bezpieczeństwa uczestników.",
            "future_vision": "Model łatwy do wdrożenia w każdej gminie wiejskiej w Polsce.",
            "project_team": "Koordynator z 10-letnim doświadczeniem w CUS oraz 3 opiekunów.",
            "grant_amount": 50000.0,
            "action_plan": {
                "prep_period": [
                    {"action_name": "Rekrutacja asystentów", "schedule": "styczeń 2025", "cost": 10000.0}
                ],
                "test_period": [
                    {"phase": "faza_1", "action_name": "Pilotaż asystentury", "schedule": "luty-czerwiec 2025", "cost": 35000.0}
                ],
            },  # Suma kosztów: 45 000 PLN, a wnioskowana kwota: 50 000 PLN -> Różnica 5000 PLN!
            "declarations": {"all_confirmed": True},
        }

        create_res = client.post(
            "/api/grant-applications",
            headers=author_headers,
            json=dict({"call_id": DEFAULT_DEMO_CALL_ID}, **valid_data),
        )
        app_id = create_res.json()["id"]

        submit_res = client.post(
            f"/api/grant-applications/{app_id}/submit",
            headers=author_headers,
        )
        assert submit_res.status_code == 422
        errors = submit_res.json()["detail"]["errors"]
        assert any("Niezgodność budżetowa" in e for e in errors)
        assert any("5000.00" in e for e in errors)

    def test_submit_validation_declarations_must_be_consciously_confirmed(self):
        """Oświadczenia prawne nie mogą być uzupełniane automatycznie; wymagają świadomego potwierdzenia."""
        author_headers = {"X-Admin-Role": "applicant", "X-Test-User-Id": "author-decl-01"}

        valid_data = {
            "title": "Innowacyjny Wolontariat Młodzieżowy",
            "applicant_type": "osoba_fizyczna",
            "applicant_data": {"first_name": "Adam", "last_name": "Mickiewicz", "email": "adam@poczta.pl"},
            "innovation_description": "Opis innowacji spełniający wszystkie wymogi formalne naboru.",
            "innovativeness": "Innowacyjność w skali całego województwa małopolskiego.",
            "problem_diagnosis": "Diagnoza problemu wykluczenia młodzieży z terenów wiejskich.",
            "target_group_description": "Młodzież ze szkół ponadpodstawowych w wieku 15-19 lat.",
            "expected_change": "Zmiana postaw społecznych i włączenie w życie lokalne.",
            "future_vision": "Wizja dalszego rozwoju i transferu do innych powiatów.",
            "project_team": "Zespół pedagogów i psychologów z wieloletnim stażem.",
            "grant_amount": 30000.0,
            "action_plan": {
                "prep_period": [{"action_name": "Warsztaty wstępne", "schedule": "styczeń 2025", "cost": 10000.0}],
                "test_period": [{"phase": "faza_1", "action_name": "Działania wolontariackie", "schedule": "luty 2025", "cost": 20000.0}],
            },
            "declarations": {"all_confirmed": False},  # Brak świadomego potwierdzenia!
        }

        create_res = client.post(
            "/api/grant-applications",
            headers=author_headers,
            json=dict({"call_id": DEFAULT_DEMO_CALL_ID}, **valid_data),
        )
        app_id = create_res.json()["id"]

        submit_res = client.post(
            f"/api/grant-applications/{app_id}/submit",
            headers=author_headers,
        )
        assert submit_res.status_code == 422
        errors = submit_res.json()["detail"]["errors"]
        assert any("Pkt 12:" in e for e in errors)
        assert any("świadome potwierdzenie wszystkich oświadczeń" in e for e in errors)

    def test_submit_successful_and_locked_afterwards(self):
        """Poprawne złożenie wniosku zmienia status na 'zlozony' i blokuje dalszą edycję przez autora."""
        author_headers = {"X-Admin-Role": "applicant", "X-Test-User-Id": "author-success-01"}

        valid_data = {
            "title": "Centrum Innowacji Wiejskiej",
            "applicant_type": "osoba_fizyczna",
            "applicant_data": {"first_name": "Piotr", "last_name": "Zieliński", "email": "piotr@zielinski.pl"},
            "innovation_description": "Utworzenie wiejskiego punktu wsparcia cyfrowego i społecznego.",
            "innovativeness": "Połączenie edukacji cyfrowej seniorów z warsztatami rzemiosła.",
            "problem_diagnosis": "Wykluczenie cyfrowe ponad 60% mieszkańców w wieku emerytalnym.",
            "target_group_description": "Mieszkańcy wsi w wieku 60+ niemający dostępu do internetu.",
            "expected_change": "Nabycie umiejętności załatwiania spraw urzędowych online.",
            "future_vision": "Przekształcenie w trwały punkt prowadzony przez Koło Gospodyń Wiejskich.",
            "project_team": "3 instruktorów IT oraz animator społeczny z certyfikatem ROPS.",
            "grant_amount": 40000.0,
            "action_plan": {
                "prep_period": [{"action_name": "Wyposażenie sali", "schedule": "marzec 2025", "cost": 15000.0}],
                "test_period": [{"phase": "faza_1", "action_name": "Cykl 20 warsztatów", "schedule": "kwiecień-czerwiec 2025", "cost": 25000.0}],
            },
            "declarations": {"all_confirmed": True},
        }

        create_res = client.post(
            "/api/grant-applications",
            headers=author_headers,
            json=dict({"call_id": DEFAULT_DEMO_CALL_ID}, **valid_data),
        )
        app_id = create_res.json()["id"]

        # Złożenie wniosku
        submit_res = client.post(
            f"/api/grant-applications/{app_id}/submit",
            headers=author_headers,
        )
        assert submit_res.status_code == 200
        submitted_app = submit_res.json()
        assert submitted_app["status"] == "zlozony"
        assert submitted_app["submitted_at"] is not None

        # Próba edycji po złożeniu -> 400 Bad Request
        edit_res = client.put(
            f"/api/grant-applications/{app_id}",
            headers=author_headers,
            json={"title": "Zmiana po terminie"},
        )
        assert edit_res.status_code == 400
        assert "zablokowany przed edycją" in edit_res.json()["detail"]

        # Próba ponownego złożenia -> 400 Bad Request
        resubmit_res = client.post(
            f"/api/grant-applications/{app_id}/submit",
            headers=author_headers,
        )
        assert resubmit_res.status_code == 400

    def test_closed_call_blocks_submission_and_creation(self):
        """Zamknięty nabór bezwzględnie blokuje składanie nowych wniosków i rejestrację."""
        author_headers = {"X-Admin-Role": "applicant", "X-Test-User-Id": "author-closed-test"}
        admin_headers = {"X-Admin-Role": "rops_admin"}

        # 1. Tworzymy draft w stanie otwartym/demo
        create_res = client.post(
            "/api/grant-applications",
            headers=author_headers,
            json={"call_id": DEFAULT_DEMO_CALL_ID, "title": "Wniosek przed zamknięciem"},
        )
        app_id = create_res.json()["id"]

        # 2. Administrator zamyka nabór
        client.patch(
            f"/api/admin/grant-calls/{DEFAULT_DEMO_CALL_ID}/status",
            headers=admin_headers,
            json={"status": "zamkniety"},
        )

        # 3. Próba utworzenia nowego wniosku w zamkniętym naborze -> 400
        new_create_res = client.post(
            "/api/grant-applications",
            headers=author_headers,
            json={"call_id": DEFAULT_DEMO_CALL_ID, "title": "Wniosek w zamkniętym naborze"},
        )
        assert new_create_res.status_code == 400
        assert "został zamknięty" in new_create_res.json()["detail"]

        # 4. Próba złożenia istniejącego draftu w zamkniętym naborze -> 400
        submit_res = client.post(
            f"/api/grant-applications/{app_id}/submit",
            headers=author_headers,
        )
        assert submit_res.status_code == 400
        assert "zamknięty" in submit_res.json()["detail"]

    def test_export_and_preview_formatted_document(self):
        """Endpoint eksportu i podglądu generuje sformatowany dokument w układzie Załącznika nr 3."""
        author_headers = {"X-Admin-Role": "applicant", "X-Test-User-Id": "author-export-01"}

        create_res = client.post(
            "/api/grant-applications",
            headers=author_headers,
            json={
                "call_id": DEFAULT_DEMO_CALL_ID,
                "title": "Teatr Międzypokoleniowy w Suchej Beskidzkiej",
                "applicant_type": "podmiot",
                "applicant_data": {
                    "organization_name": "Stowarzyszenie Rozwoju Kultury Lokalnej",
                    "nip": "1234567890",
                    "krs": "0000123456",
                    "email": "kontakt@kultura-sucha.pl",
                    "address": {"street": "ul. Mickiewicza 10", "postal_code": "34-200", "city": "Sucha Beskidzka"},
                    "authorized_representative": {"name": "Tadeusz Kantor", "role": "Prezes Zarządu"},
                },
                "innovation_description": "Warsztaty dramaturgiczne łączące młodzież i pensjonariuszy DPS.",
                "grant_amount": 25000.0,
                "action_plan": {
                    "prep_period": [{"action_name": "Scenografia i scenariusz", "schedule": "maj 2025", "cost": 10000.0}],
                    "test_period": [{"phase": "faza_1", "action_name": "Próby i 3 spektakle", "schedule": "czerwiec 2025", "cost": 15000.0}],
                },
            },
        )
        app_id = create_res.json()["id"]

        export_res = client.get(
            f"/api/grant-applications/{app_id}/export",
            headers=author_headers,
        )
        assert export_res.status_code == 200
        data = export_res.json()
        assert data["application_id"] == app_id
        assert data["template_name"] == "za._3._Formularz_aplikacyjny_wzor.pdf"
        assert "ZAŁĄCZNIK NR 3 DO OGŁOSZENIA" in data["formatted_document_text"]
        assert "FORMULARZ APLIKACYJNY" in data["formatted_document_text"]
        assert "Teatr Międzypokoleniowy" in data["formatted_document_text"]
        assert "Stowarzyszenie Rozwoju Kultury Lokalnej" in data["formatted_document_text"]
        assert "ZGODNY" in data["formatted_document_text"]
        assert "10000.00 PLN" in data["formatted_document_text"]

    def test_rops_admin_can_review_and_update_status(self):
        """Administrator ROPS Kraków ma wgląd we wszystkie wnioski i może zarządzać oceną."""
        author_headers = {"X-Admin-Role": "applicant", "X-Test-User-Id": "author-admin-view"}
        admin_headers = {"X-Admin-Role": "rops_admin"}

        # 1. Autor tworzy wniosek
        create_res = client.post(
            "/api/grant-applications",
            headers=author_headers,
            json={"call_id": DEFAULT_DEMO_CALL_ID, "title": "Wniosek do Oceny ROPS"},
        )
        app_id = create_res.json()["id"]

        # 2. Administrator pobiera listę wszystkich wniosków
        admin_list_res = client.get("/api/admin/grant-applications", headers=admin_headers)
        assert admin_list_res.status_code == 200
        apps = admin_list_res.json()
        assert any(a["id"] == app_id for a in apps)

        # 3. Administrator wyświetla szczegóły wniosku
        admin_detail_res = client.get(f"/api/admin/grant-applications/{app_id}", headers=admin_headers)
        assert admin_detail_res.status_code == 200
        assert admin_detail_res.json()["title"] == "Wniosek do Oceny ROPS"

        # 4. Administrator zmienia status w procesie oceny ROPS
        patch_res = client.patch(
            f"/api/admin/grant-applications/{app_id}/status",
            headers=admin_headers,
            json={
                "status": "zaakceptowany",
                "rops_notes": "Rekomendacja Komisji Oceny Innowacji: pozytywna, innowacja kierowana do umowy grantowej.",
            },
        )
        assert patch_res.status_code == 200
        updated = patch_res.json()
        assert updated["status"] == "zaakceptowany"
        assert "Rekomendacja Komisji" in updated["rops_notes"]

        # 5. Zwykły użytkownik nie może wywołać endpointów admina -> 403
        forbidden_res = client.get("/api/admin/grant-applications", headers=author_headers)
        assert forbidden_res.status_code == 403

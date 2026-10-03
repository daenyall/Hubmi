from fastapi.testclient import TestClient
from app.main import app
from app.services.ai import generate_adaptation_plan

client = TestClient(app)


class TestMiddlemanAI:
    """Testy modułu Middleman AI (adaptacja innowacji ROPS do lokalnych warunków)."""

    def test_adapt_short_context_fails(self):
        """Kontekst krótszy niż 5 znaków zwraca błąd walidacji 400."""
        res = client.post(
            "/api/adapt",
            json={
                "innovation_title": "Senior w Chmurze",
                "municipality_context": "gmi",
            },
        )
        assert res.status_code == 400
        assert "min. 5 znaków" in res.json()["detail"]

    def test_adapt_basic_request_backward_compatibility(self):
        """Żądanie z podstawowymi polami zwraca pełną odpowiedź (wsteczna kompatybilność z frontendem)."""
        res = client.post(
            "/api/adapt",
            json={
                "innovation_title": "Opieka Wytchnieniowa w Społeczności",
                "innovation_description": "System wolontariatu sąsiedzkiego i asystentury dla opiekunów osób zależnych.",
                "municipality_context": "Gmina wiejska na Podhalu, 4500 mieszkańców, 1 dom kultury, brak CUS.",
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["innovation_title"] == "Opieka Wytchnieniowa w Społeczności"
        assert len(data["adaptation_plan"]) > 50
        # Domyślne wartości z enrichera
        assert data.get("estimated_budget_pln") is not None
        assert isinstance(data.get("recommended_grants"), list)
        assert len(data["recommended_grants"]) > 0
        assert isinstance(data.get("key_kpis"), list)

    def test_adapt_enriched_parameters(self):
        """Żądanie ze wszystkimi nowymi parametrami (typ samorządu, budżet, horyzont, partnerzy) uwzględnia je w planie."""
        res = client.post(
            "/api/adapt",
            json={
                "innovation_title": "Cyfrowy Senior na Wsi",
                "innovation_description": "Mobilne warsztaty tabletowe dla osób 65+.",
                "municipality_context": "Gmina Iwkowa, rozproszona zabudowa, wysoki odsetek seniorów.",
                "municipality_type": "wiejska",
                "budget_range": "20 000 – 40 000 PLN",
                "time_horizon": "6 miesięcy",
                "key_partners": ["KGW Iwkowa", "OSP Porąbka", "GOPS"],
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["innovation_title"] == "Cyfrowy Senior na Wsi"
        assert data["estimated_budget_pln"] == "20 000 – 40 000 PLN"
        plan = data["adaptation_plan"]

        # Weryfikacja kluczowych elementów w wygenerowanym planie
        assert "Harmonogram" in plan or "Etap" in plan or "Faza" in plan
        assert "Kosztorys" in plan or "Koszt" in plan or "|" in plan
        assert "WCAG" in plan or "Dostępnoś" in plan

    def test_generate_adaptation_plan_service_direct(self):
        """Bezpośrednie wywołanie serwisu zwraca strukturę ze słownikiem i poprawnymi polami."""
        result = generate_adaptation_plan(
            innovation_title="Mobilny Asystent Osoby Niewidomej",
            innovation_desc="Audiodeskrypcja przestrzeni publicznej.",
            context="CUS w małym mieście, budżet ograniczony do funduszy sołeckich.",
            municipality_type="miejsko-wiejska",
            budget_range="15 000 PLN",
            time_horizon="3 miesiące",
            key_partners=["CUS", "Polski Związek Niewidomych"],
        )
        assert isinstance(result, dict)
        assert "adaptation_plan" in result
        assert "estimated_budget_pln" in result
        assert result["estimated_budget_pln"] == "15 000 PLN"
        assert len(result["recommended_grants"]) >= 3
        assert len(result["key_kpis"]) >= 3

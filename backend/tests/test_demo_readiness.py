"""Focused regressions for demo blockers; no live accounts or database writes."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.services import ai, grant_applications as grants
from app.api.endpoints import admin, match
from app.models.schemas import InnovationCreate

DECLARATIONS = ("criminal_liability", "no_double_funding", "accept_procedures", "no_fees", "accessibility_dnsh", "gdpr")


def application(declarations):
    return {
        "id": "own-test", "user_id": "author", "call_id": "own-call", "status": "roboczy",
        "title": "Testowy wniosek", "applicant_type": "osoba_fizyczna",
        "applicant_data": {"first_name": "Rekord", "last_name": "Testowy", "email": "test@example.invalid"},
        **dict.fromkeys(("innovation_description", "innovativeness", "problem_diagnosis", "target_group_description", "expected_change", "future_vision", "project_team"), "Pełna treść testowego wniosku."),
        "grant_amount": 100, "action_plan": {"prep_period": [{"cost": 100}]}, "declarations": declarations,
    }


@pytest.mark.parametrize("declarations", [
    {}, {"all_confirmed": True},
    *[{"all_confirmed": True, **dict.fromkeys(DECLARATIONS, True), key: False} for key in DECLARATIONS],
    {**dict.fromkeys(DECLARATIONS, True), "gdpr": "true"},
    {**dict.fromkeys(DECLARATIONS, True), "gdpr": 1},
])
def test_submit_rejects_missing_or_non_boolean_declarations(monkeypatch, declarations):
    monkeypatch.setattr(grants, "get_application_by_id_raw", lambda _: application(declarations))
    monkeypatch.setattr(grants, "get_grant_call_by_id", lambda _: SimpleNamespace(status="demonstracyjny", max_grant_amount=1000))
    database = MagicMock()
    monkeypatch.setattr(grants, "_get_active_supabase", database)
    with pytest.raises(HTTPException) as exc:
        grants.submit_grant_application("own-test", "author")
    assert exc.value.status_code == 422
    assert any("Pkt 12" in message for message in exc.value.detail["errors"])
    database.assert_not_called()


def test_submit_accepts_each_individually_confirmed_declaration(monkeypatch):
    row = application(dict.fromkeys(DECLARATIONS, True))
    monkeypatch.setattr(grants, "get_application_by_id_raw", lambda _: row)
    monkeypatch.setattr(grants, "get_grant_call_by_id", lambda _: SimpleNamespace(status="demonstracyjny", max_grant_amount=1000, model_dump=lambda: {}))
    database = MagicMock()
    query = database.table.return_value.update.return_value.eq.return_value
    query.execute.return_value = SimpleNamespace(data=[{**row, "status": "zlozony"}])
    monkeypatch.setattr(grants, "_get_active_supabase", lambda: database)
    monkeypatch.setattr(grants, "_map_application_to_response", lambda value, call_info=None: value)
    assert grants.submit_grant_application("own-test", "author")["status"] == "zlozony"
    assert database.table.return_value.update.call_args.args[0]["submitted_at"]


def test_model_switch_never_compares_old_database_vectors(monkeypatch):
    database = MagicMock()
    query = database.table.return_value.select.return_value.eq.return_value
    query.limit.return_value.execute.return_value = SimpleNamespace(data=[{
        "id": "own-test", "title": "Seniorzy", "description": "Wsparcie seniorów", "embedding": [0, 1],
    }])
    monkeypatch.setattr(match, "create_embedding", lambda _: [1, 0])
    candidates = match._live_semantic_candidates(database, [1, 0], None)
    assert candidates[0]["similarity_score"] == 1
    assert "embedding" not in database.table.return_value.select.call_args.args[0].split(",")
    database.rpc.assert_not_called()


def test_gemini_quota_failure_uses_configured_backup_and_cooldown(monkeypatch):
    monkeypatch.setattr(ai.settings, "GEMINI_GENERATION_MODEL", "primary")
    monkeypatch.setattr(ai.settings, "GEMINI_GENERATION_FALLBACK_MODELS", "backup")
    monkeypatch.setattr(ai.settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(ai, "_gemini_unavailable_until", {})
    post = MagicMock(side_effect=[
        SimpleNamespace(status_code=429),
        SimpleNamespace(status_code=200, json=lambda: {"candidates": ["result"]}),
        SimpleNamespace(status_code=200, json=lambda: {"candidates": ["result"]}),
    ])
    monkeypatch.setattr(ai.requests, "post", post)
    assert ai._request_gemini_content({}, 1)["candidates"]
    assert ai._request_gemini_content({}, 1)["candidates"]
    assert ["backup" in call.args[0] for call in post.call_args_list] == [False, True, True]
    assert all("test-key" not in call.args[0] for call in post.call_args_list)


def test_innovation_provider_failure_is_503_without_insert(monkeypatch):
    database = MagicMock()
    monkeypatch.setattr(admin, "get_supabase_client", lambda: database)
    def unavailable(_):
        raise RuntimeError("provider unavailable")
    monkeypatch.setattr(admin, "create_embedding", unavailable)
    payload = InnovationCreate(title="Testowa innowacja", description="Opis testowej innowacji.", target_group="Seniorzy", status="nowa")
    with pytest.raises(HTTPException) as exc:
        admin.create_admin_innovation(payload, SimpleNamespace())
    assert exc.value.status_code == 503
    database.table.assert_not_called()


def test_truncated_plan_is_not_returned_as_generated_ai(monkeypatch):
    monkeypatch.setattr(ai.settings, "GEMINI_GENERATION_MODEL", "primary")
    monkeypatch.setattr(ai.settings, "GEMINI_GENERATION_FALLBACK_MODELS", "backup")
    monkeypatch.setattr(ai, "_gemini_unavailable_until", {})
    complete = {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "Complete plan"}]}}]}
    post = MagicMock(side_effect=[
        SimpleNamespace(status_code=200, json=lambda: {"candidates": [{"finishReason": "MAX_TOKENS"}]}),
        SimpleNamespace(status_code=200, json=lambda: complete),
    ])
    monkeypatch.setattr(ai.requests, "post", post)
    assert ai._request_gemini_content({}, 1) == complete
    assert post.call_count == 2


def test_transient_503_does_not_disable_model_for_the_following_plan(monkeypatch):
    monkeypatch.setattr(ai.settings, "GEMINI_GENERATION_MODEL", "primary")
    monkeypatch.setattr(ai.settings, "GEMINI_GENERATION_FALLBACK_MODELS", "")
    monkeypatch.setattr(ai, "_gemini_unavailable_until", {})
    post = MagicMock(side_effect=[SimpleNamespace(status_code=503), SimpleNamespace(status_code=200, json=lambda: {"candidates": []})])
    monkeypatch.setattr(ai.requests, "post", post)
    assert ai._request_gemini_content({}, 10) is None
    assert ai._request_gemini_content({}, 10) == {"candidates": []}
    assert post.call_count == 2
    assert post.call_args.kwargs["timeout"] <= 5


def test_plan_cache_reuses_success_and_retries_failure(monkeypatch):
    ai._get_generated_gemini_plan.cache_clear()
    response = {"candidates": [{"content": {"parts": [{"text": "Complete real provider response"}]}}]}
    provider = MagicMock(side_effect=[None, response, response])
    monkeypatch.setattr(ai, "_request_gemini_content", provider)
    try:
        with pytest.raises(RuntimeError):
            ai._get_generated_gemini_plan("context A")
        assert ai._get_generated_gemini_plan("context A") == "Complete real provider response"
        assert ai._get_generated_gemini_plan("context A") == "Complete real provider response"
        ai._get_generated_gemini_plan("context B")
        assert provider.call_count == 3
    finally:
        ai._get_generated_gemini_plan.cache_clear()

"""Focused unit regressions; no external database or authentication."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from app.models.schemas import KnowledgeResourceUpdate
from app.services import knowledge_resources as service


@pytest.fixture
def resource():
    return service._map_to_response({
        "id": "own-test-resource", "title": "Materiał testowy",
        "description": "Opis materiału testowego.", "url": "https://rops.krakow.pl/",
        "group_id": "raporty-diagnozy", "group_title": "Raporty i diagnozy społeczne",
        "status": "opublikowany", "caveat": "Stare zastrzeżenie",
        "verified_by": "rops", "verified_at": "2026-10-04T10:00:00Z",
        "published_by": "rops", "published_at": "2026-10-04T11:00:00Z",
        "created_at": "2026-10-04T09:00:00Z", "updated_at": "2026-10-04T11:00:00Z",
    })


@pytest.mark.parametrize("payload", [
    {"caveat": None}, {"caveat": ""}, {"caveat": "Nowe ograniczenie źródła"},
    {"group_title": "Zmieniona nazwa grupy"},
])
def test_public_content_edits_revoke_verification(monkeypatch, resource, payload):
    monkeypatch.setattr(service, "admin_get_resource", lambda _: resource)
    sb = MagicMock()
    table = sb.table.return_value
    def update(data):
        table.eq.return_value.execute.return_value = SimpleNamespace(data=[{**resource.model_dump(), **data}])
        return table
    table.update.side_effect = update
    monkeypatch.setattr(service, "_get_active_supabase", lambda: sb)
    result = service.admin_update_resource(resource.id, KnowledgeResourceUpdate(**payload), "rops")
    assert result.status == "roboczy"
    assert result.verified_by is None and result.verified_at is None
    assert result.published_by is None and result.published_at is None
    if "caveat" in payload:
        assert result.caveat == (payload["caveat"] or None)
    table.eq.assert_called_once_with("id", resource.id)


def test_omitted_caveat_keeps_existing_value_and_verification(monkeypatch, resource):
    monkeypatch.setattr(service, "admin_get_resource", lambda _: resource)
    sb = MagicMock()
    sb.table.return_value.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[resource.model_dump()])
    monkeypatch.setattr(service, "_get_active_supabase", lambda: sb)
    service.admin_update_resource(resource.id, KnowledgeResourceUpdate(title=resource.title), "rops")
    changes = sb.table.return_value.update.call_args.args[0]
    assert "caveat" not in changes and "status" not in changes


def test_delete_read_failure_cannot_confirm_success(monkeypatch, resource):
    monkeypatch.setattr(service, "admin_get_resource", lambda _: resource)
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.execute.side_effect = RuntimeError("Read failed")
    monkeypatch.setattr(service, "_get_active_supabase", lambda: sb)
    with pytest.raises(HTTPException) as error:
        service.admin_delete_resource(resource.id, "rops")
    assert error.value.status_code == 502

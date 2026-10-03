import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.notifications import (
    record_submission_event,
    get_recent_events,
    send_email_notification_stub,
    notify_status_change,
)

client = TestClient(app)


class TestWebhooksAndNotifications:
    """Testy systemu powiadomień, webhooków i audytu zdarzeń."""

    def test_record_submission_event(self):
        """Zdarzenie zmiany statusu jest poprawnie rejestrowane w logu audytowym."""
        event_id = record_submission_event(
            submission_id="sub-test-123",
            old_status="nowe",
            new_status="zaakceptowane",
            changed_by="ekspert@rops.krakow.pl",
            comment="Pozytywna opinia komisji merytorycznej.",
        )
        assert event_id is not None

        events = get_recent_events(limit=10)
        assert len(events) > 0
        matching = [e for e in events if e.get("submission_id") == "sub-test-123"]
        assert len(matching) > 0
        assert matching[0]["new_status"] == "zaakceptowane"

    def test_email_notification_stub_content(self):
        """Stub powiadomienia e-mail zawiera oficjalny nagłówek ROPS i powód zmiany statusu."""
        email_data = send_email_notification_stub(
            to_email="innowator@jst-krakow.pl",
            submission_title="Asystent Cyfrowy Seniora",
            new_status="zaakceptowane",
            official_response="Gratulujemy! Projekt zakwalifikowany do fazy pilotażowej.",
        )
        assert email_data["to"] == "innowator@jst-krakow.pl"
        assert "[ROPS Kraków]" in email_data["subject"]
        assert "ZAAKCEPTOWANE" in email_data["body"]
        assert "Gratulujemy!" in email_data["body"]

    def test_notify_status_change_dispatcher(self):
        """Główny dyspozytor powiadomień przetwarza e-mail i log zdarzenia."""
        res = notify_status_change(
            submission_id="sub-test-456",
            old_status="weryfikacja",
            new_status="zaakceptowane",
            title="Dostępny Ogród Sensoryczny",
            applicant_email="kontakt@ngo-malopolska.org",
            official_response="Projekt spełnia wszystkie kryteria dostępności WCAG i ROPS.",
            changed_by="dyrektor@rops.krakow.pl",
        )
        assert res.success is True
        assert res.email_sent is True
        assert res.event_id is not None

    def test_admin_events_endpoint_forbidden_for_user(self):
        """Zwykły użytkownik nie może podejrzeć rejestru zdarzeń audytowych."""
        res = client.get("/api/admin/events")
        assert res.status_code == 403

    def test_admin_events_endpoint_allowed_for_admin(self):
        """Administrator ROPS ma pełny podgląd dziennika audytowego."""
        res = client.get(
            "/api/admin/events",
            headers={"X-Admin-Role": "rops_admin"},
        )
        assert res.status_code == 200
        events = res.json()
        assert isinstance(events, list)

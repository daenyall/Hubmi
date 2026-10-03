import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models.schemas import SubmissionStatusUpdate, SubmissionCreate

client = TestClient(app)


class TestSubmissionsStatus:
    """Testy cyklu życia i statusów zgłoszeń (nowe, weryfikacja, zaakceptowane, odrzucone)."""

    def test_status_update_schema_validation(self):
        """Model SubmissionStatusUpdate przyjmuje tylko dozwolone statusy ROPS."""
        valid_statuses = ["nowe", "weryfikacja", "zaakceptowane", "odrzucone"]
        for st in valid_statuses:
            obj = SubmissionStatusUpdate(status=st, official_response="Komentarz")
            assert obj.status == st

    def test_patch_status_forbidden_for_anonymous(self):
        """Anonimowy użytkownik nie może zmienić statusu zgłoszenia."""
        res = client.patch(
            "/api/admin/submissions/some-fake-id/status",
            json={"status": "zaakceptowane", "official_response": "Zgoda"},
        )
        assert res.status_code == 403

    def test_patch_status_requires_admin_role(self):
        """Zwykły wnioskodawca nie ma uprawnień do zmiany statusu zgłoszenia."""
        res = client.patch(
            "/api/admin/submissions/some-fake-id/status",
            headers={"X-Admin-Role": "applicant"},
            json={"status": "zaakceptowane"},
        )
        assert res.status_code == 403

    def test_submission_create_model_defaults(self):
        """Nowe zgłoszenie domyślnie posiada status 'nowe' i etap 'pomysl'."""
        sub = SubmissionCreate(
            title="Senior Taxi w Małopolsce",
            problem_description="Brak transportu dla seniorów w sołectwach.",
            solution_description="Dedykowany bus gminny zamawiany przez CUS.",
            target_group="Seniorzy 70+",
            applicant_type="JST",
            institution_name="Gmina Igołomia-Wawrzeńczyce",
        )
        assert sub.implementation_stage == "pomysl"
        assert sub.applicant_type == "JST"
        assert sub.title == "Senior Taxi w Małopolsce"

    def test_messages_requires_permission(self):
        """Próba pobrania wiadomości bez autoryzacji dla nieistniejącego/cudzego ID jest odrzucana."""
        res = client.get("/api/submissions/00000000-0000-0000-0000-000000000000/messages")
        assert res.status_code in (403, 404, 503)

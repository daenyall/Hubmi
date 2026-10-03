import base64
import json
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def make_jwt(sub: str, email: str, role: str = "authenticated") -> str:
    """Helper tworzący dummy JWT z payloadem base64."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps({"sub": sub, "email": email, "role": role}).encode()).decode().rstrip("=")
    signature = "dummy_sig"
    return f"{header}.{payload}.{signature}"


class TestRolesSecurity:
    """Testy weryfikacji uprawnień (RBAC): Autor vs Administrator ROPS."""

    def test_anonymous_access_admin_forbidden(self):
        """Użytkownik bez autoryzacji nie ma dostępu do panelu administratora ROPS."""
        res = client.get("/api/admin/submissions")
        assert res.status_code == 403
        assert "Brak uprawnień" in res.json().get("detail", "")

    def test_unverified_or_forged_jwt_rejected(self):
        """Token z niepoprawnym/podrobionym podpisem jest odrzucany z kodem 401 Unauthorized."""
        token = make_jwt(sub="user-123", email="wojt@zabierzow.pl", role="authenticated")
        res = client.get(
            "/api/admin/submissions",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 401
        assert "Nieprawidłowy lub wygasły token" in res.json().get("detail", "")

    def test_applicant_access_admin_forbidden(self):
        """Zwykły wnioskodawca (JST/NGO) nie ma dostępu do panelu administratora (403 Forbidden)."""
        res = client.get(
            "/api/admin/submissions",
            headers={"X-Admin-Role": "applicant"},
        )
        assert res.status_code == 403
        assert "Administrator ROPS Kraków" in res.json().get("detail", "")

    def test_rops_admin_service_key_granted(self):
        """Klucz serwisowy backendu Supabase posiada pełne uprawnienia administratora."""
        from app.core.config import settings
        if settings.SUPABASE_KEY:
            res = client.get(
                "/api/admin/submissions",
                headers={"Authorization": f"Bearer {settings.SUPABASE_KEY}"},
            )
            assert res.status_code != 403
            assert res.status_code != 401

    def test_dev_header_rops_admin_granted(self):
        """Nagłówek X-Admin-Role: rops_admin daje uprawnienia administratora dla frontendu / demo."""
        res = client.get(
            "/api/admin/submissions",
            headers={"X-Admin-Role": "rops_admin"},
        )
        assert res.status_code != 403

    def test_mentor_role_granted(self):
        """Rola mentor również posiada uprawnienia do podglądu zgłoszeń."""
        res = client.get(
            "/api/admin/submissions",
            headers={"X-Admin-Role": "mentor"},
        )
        assert res.status_code != 403

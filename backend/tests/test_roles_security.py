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

    def test_applicant_access_admin_forbidden(self):
        """Zwykły wnioskodawca (JST/NGO) nie ma dostępu do panelu administratora."""
        token = make_jwt(sub="user-123", email="wojt@zabierzow.pl", role="authenticated")
        res = client.get(
            "/api/admin/submissions",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 403
        assert "Administrator ROPS Kraków" in res.json().get("detail", "")

    def test_rops_admin_jwt_access_granted(self):
        """Użytkownik z domeną @rops.krakow.pl otrzymuje uprawnienia administratora."""
        token = make_jwt(sub="admin-rops-01", email="anna.nowak@rops.krakow.pl", role="authenticated")
        res = client.get(
            "/api/admin/submissions",
            headers={"Authorization": f"Bearer {token}"},
        )
        # Powinno być 200 (jeśli Supabase działa) lub 503 (jeśli brak bazy), ale NIGDY 403!
        assert res.status_code != 403

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

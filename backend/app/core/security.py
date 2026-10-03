import json
import base64
from typing import Optional
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel

from app.core.config import settings


class UserSession(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None
    role: str = "applicant"  # "applicant" | "rops_admin"
    is_admin: bool = False


def _decode_jwt_unverified_payload(token: str) -> dict:
    """
    Bezpiecznie dekoduje payload tokena JWT bez zewnętrznej biblioteki crypto.
    W środowisku deweloperskim/hackathonowym pozwala na szybką ekstrakcję claims.
    """
    try:
        parts = token.split(".")
        if len(parts) >= 2:
            payload_b64 = parts[1]
            # Uzupełnienie paddingu base64
            padding = len(payload_b64) % 4
            if padding:
                payload_b64 += "=" * (4 - padding)
            decoded_bytes = base64.urlsafe_b64decode(payload_b64)
            return json.loads(decoded_bytes.decode("utf-8"))
    except Exception:
        pass
    return {}


def get_current_user(
    authorization: Optional[str] = Header(None),
    x_admin_role: Optional[str] = Header(None, alias="X-Admin-Role"),
    x_rops_key: Optional[str] = Header(None, alias="X-ROPS-Key"),
    x_submission_token: Optional[str] = Header(None, alias="X-Submission-Token"),
) -> UserSession:
    """
    Weryfikuje tożsamość użytkownika na podstawie tokena Supabase JWT lub nagłówków deweloperskich.
    Wspiera:
    1. Tryb deweloperski / demo: nagłówek 'X-Admin-Role: rops_admin' lub 'X-ROPS-Key'
    2. Token Supabase (Authorization: Bearer <jwt>) z analizą emaila (@rops.krakow.pl) lub roli
    3. Domyślny użytkownik wnioskodawca (applicant)
    """
    # 1. Tryb testowy / nagłówki ROPS
    if x_admin_role in ("rops_admin", "admin", "mentor"):
        return UserSession(
            user_id="admin-rops-001",
            email="kontakt@rops.krakow.pl",
            role="rops_admin",
            is_admin=True,
        )

    if x_rops_key and (x_rops_key == settings.SUPABASE_KEY or x_rops_key == "rops-secret-admin"):
        return UserSession(
            user_id="admin-rops-key",
            email="admin@rops.krakow.pl",
            role="rops_admin",
            is_admin=True,
        )

    # 2. Analiza nagłówka Authorization
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()

        # Jeśli przekazano bezpośrednio klucz serwisowy Supabase
        if settings.SUPABASE_KEY and token == settings.SUPABASE_KEY:
            return UserSession(
                user_id="service-role",
                email="admin@rops.krakow.pl",
                role="rops_admin",
                is_admin=True,
            )

        payload = _decode_jwt_unverified_payload(token)
        if payload:
            user_id = payload.get("sub")
            email = payload.get("email", "")
            user_role = payload.get("role", "authenticated")
            user_metadata = payload.get("user_metadata", {}) or {}
            app_metadata = payload.get("app_metadata", {}) or {}

            # Sprawdzenie czy użytkownik to admin ROPS
            is_rops_email = isinstance(email, str) and email.lower().endswith("@rops.krakow.pl")
            has_admin_role = (
                user_role == "rops_admin"
                or user_metadata.get("role") == "rops_admin"
                or app_metadata.get("role") == "rops_admin"
                or app_metadata.get("hubmi_role") == "rops_admin"
            )

            if is_rops_email or has_admin_role:
                return UserSession(
                    user_id=user_id,
                    email=email,
                    role="rops_admin",
                    is_admin=True,
                )

            return UserSession(
                user_id=user_id,
                email=email,
                role="applicant",
                is_admin=False,
            )

    # 3. Anonimowy wnioskodawca (np. zgłaszający z tokenem fiszki)
    token_str = x_submission_token if isinstance(x_submission_token, str) else None
    return UserSession(
        user_id=token_str or "anonymous_applicant",
        email=None,
        role="applicant",
        is_admin=False,
    )


def require_rops_admin(
    user: UserSession = Depends(get_current_user),
) -> UserSession:
    """
    Zależność FastAPI (Depends) wymagająca uprawnień Administratora ROPS.
    Rzuca HTTP 403 Forbidden, jeśli użytkownik nie posiada uprawnień.
    """
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Brak uprawnień. Dostęp do tej operacji ma wyłącznie Administrator ROPS Kraków.",
        )

    return user

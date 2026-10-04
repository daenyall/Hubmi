from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import require_authenticated_user, require_rops_admin, UserSession
from app.models.schemas import (
    GrantCallResponse,
    GrantCallStatusUpdate,
    GrantApplicationCreate,
    GrantApplicationUpdate,
    GrantApplicationResponse,
    GrantApplicationStatusUpdate,
    GrantApplicationExportResponse,
)
from app.services.grant_applications import (
    list_grant_calls,
    get_grant_call_by_id,
    update_grant_call_status,
    create_grant_application,
    list_user_applications,
    get_application_for_author,
    update_draft_application,
    submit_grant_application,
    export_grant_application,
    admin_list_applications,
    admin_update_application_status,
)

# Routery
calls_router = APIRouter(prefix="/grant-calls", tags=["Grant Calls"])
applications_router = APIRouter(prefix="/grant-applications", tags=["Grant Applications"])
admin_grant_router = APIRouter(prefix="/admin/grant-applications", tags=["Admin Grant Applications"])
admin_calls_router = APIRouter(prefix="/admin/grant-calls", tags=["Admin Grant Calls"])


# ==============================================================================
# 1. KONFIGURACJA NABORÓW (GRANT CALLS)
# ==============================================================================

@calls_router.get("", response_model=List[GrantCallResponse])
async def get_calls_list():
    """
    Zwraca listę naborów wniosków grantowych na innowacje społeczne.
    Zawiera m.in. jawny nabór demonstracyjny oparty na Załączniku nr 3 ROPS Kraków.
    """
    return list_grant_calls()


@calls_router.get("/{call_id}", response_model=GrantCallResponse)
async def get_call_details(call_id: str):
    """
    Zwraca szczegółową konfigurację naboru: wzór, wersję, limit kwoty i status.
    """
    call = get_grant_call_by_id(call_id)
    if not call:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nabór o ID '{call_id}' nie został odnaleziony.",
        )
    return call


@admin_calls_router.patch("/{call_id}/status", response_model=GrantCallResponse)
async def update_call_status(
    call_id: str,
    update_data: GrantCallStatusUpdate,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Zmienia stan naboru: 'otwarty', 'zamkniety', 'demonstracyjny'.
    Wymaga uprawnień Administratora ROPS Kraków.
    """
    return update_grant_call_status(call_id, update_data.status)


# ==============================================================================
# 2. WNIOSKI DLA WNIOSKODAWCY (GRANT APPLICATIONS)
# ==============================================================================

@applications_router.post(
    "",
    response_model=GrantApplicationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_new_application(
    data: GrantApplicationCreate,
    user: UserSession = Depends(require_authenticated_user),
):
    """
    Tworzy nowy roboczy wniosek grantowy ('roboczy') dla wskazanego naboru.
    Sprawdza, czy nabór nie jest zamknięty. Wymaga zalogowanego użytkownika.
    """
    user_id = user.user_id or ""
    return create_grant_application(user_id, data)


@applications_router.get("/my", response_model=List[GrantApplicationResponse])
async def get_my_applications(
    user: UserSession = Depends(require_authenticated_user),
):
    """
    Pobiera listę wszystkich wniosków grantowych zalogowanego autora (pełna izolacja danych).
    """
    user_id = user.user_id or ""
    return list_user_applications(user_id)


@applications_router.get("/{application_id}", response_model=GrantApplicationResponse)
async def get_application(
    application_id: str,
    user: UserSession = Depends(require_authenticated_user),
):
    """
    Pobiera szczegóły konkretnego wniosku.
    Autor ma dostęp wyłącznie do swojego wniosku (403 dla wniosków innych użytkowników).
    Administrator ROPS ma wgląd do wszystkich wniosków.
    """
    user_id = user.user_id or ""
    return get_application_for_author(
        application_id, user_id, is_admin=user.is_admin
    )


@applications_router.put("/{application_id}", response_model=GrantApplicationResponse)
async def update_application_draft(
    application_id: str,
    update_data: GrantApplicationUpdate,
    user: UserSession = Depends(require_authenticated_user),
):
    """
    Trwały zapis roboczy wniosku grantowego.
    Autor może modyfikować wyłącznie swój wniosek i wyłącznie w statusie 'roboczy'.
    Złożone wnioski ('zlozony') są zablokowane przed edycją.
    """
    user_id = user.user_id or ""
    return update_draft_application(application_id, user_id, update_data)


@applications_router.post("/{application_id}/submit", response_model=GrantApplicationResponse)
async def submit_application(
    application_id: str,
    user: UserSession = Depends(require_authenticated_user),
):
    """
    Oficjalne złożenie wniosku grantowego w naborze.
    Weryfikuje kompletność wymaganych danych wg Załącznika nr 3, spójność kosztorysu
    (suma pozycji planu działania == wnioskowana kwota) oraz świadome potwierdzenie oświadczeń.
    Blokuje składanie wniosków, jeśli nabór jest zamknięty.
    """
    user_id = user.user_id or ""
    return submit_grant_application(application_id, user_id)


@applications_router.get("/{application_id}/preview", response_model=GrantApplicationExportResponse)
@applications_router.get("/{application_id}/export", response_model=GrantApplicationExportResponse)
async def export_application(
    application_id: str,
    user: UserSession = Depends(require_authenticated_user),
):
    """
    Zwraca ustrukturyzowane dane wniosku oraz pełny sformatowany dokument gotowy
    do druku / eksportu zgodnie z oficjalnym wzorem Załącznika nr 3 ROPS Kraków.
    """
    user_id = user.user_id or ""
    return export_grant_application(
        application_id, user_id, is_admin=user.is_admin
    )


# ==============================================================================
# 3. PANEL ADMINISTRATORA ROPS KRAKÓW
# ==============================================================================

@admin_grant_router.get("", response_model=List[GrantApplicationResponse])
async def admin_get_all_applications(
    call_id: Optional[str] = Query(None, description="Filtruj po ID naboru"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filtruj po statusie"),
    limit: int = Query(50, ge=1, le=100),
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Pobiera listę wszystkich wniosków grantowych złożonych w naborach.
    Wymaga uprawnień Administratora ROPS Kraków.
    """
    return admin_list_applications(call_id=call_id, status_filter=status_filter, limit=limit)


@admin_grant_router.get("/{application_id}", response_model=GrantApplicationResponse)
async def admin_get_application_details(
    application_id: str,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Szczegółowy wgląd we wniosek grantowy dla Administratora ROPS Kraków.
    """
    admin_id = admin.user_id or "admin-rops"
    return get_application_for_author(application_id, admin_id, is_admin=True)


@admin_grant_router.patch("/{application_id}/status", response_model=GrantApplicationResponse)
async def admin_change_application_status(
    application_id: str,
    update_data: GrantApplicationStatusUpdate,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Zmienia status wniosku w procesie oceny ROPS ('w_ocenie', 'zaakceptowany', 'odrzucony')
    wraz z dodaniem wewnętrznej notatki urzędowej.
    """
    admin_id = admin.user_id or "admin-rops"
    return admin_update_application_status(application_id, update_data, admin_id)

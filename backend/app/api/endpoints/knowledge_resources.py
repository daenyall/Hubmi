import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import require_rops_admin, UserSession
from app.models.schemas import (
    KnowledgeResourceCreate,
    KnowledgeResourceUpdate,
    KnowledgeResourceResponse,
    KnowledgeResourceGroupResponse,
    KnowledgeResourceVerifyRequest,
)
from app.services.knowledge_resources import (
    list_public_resources,
    get_public_resource,
    get_grouped_resources,
    admin_list_resources,
    admin_get_resource,
    admin_create_resource,
    admin_update_resource,
    admin_verify_resource,
    admin_publish_resource,
)

logger = logging.getLogger(__name__)

# ==============================================================================
# 1. PUBLICZNE ENDPOINTY ZASOBNIKA WIEDZY
# ==============================================================================

router = APIRouter(prefix="/knowledge-resources", tags=["Knowledge Resources"])


@router.get("", response_model=List[KnowledgeResourceResponse])
async def get_public_knowledge_resources(
    group_id: Optional[str] = Query(None, description="Filtruj po ID grupy: mapa-wyzwan, raporty-diagnozy, materialy-edukacyjne, filmy-i-dobre-praktyki"),
    kind: Optional[str] = Query(None, description="Filtruj po rodzaju zasobu"),
    search: Optional[str] = Query(None, description="Wyszukaj w tytule lub opisie"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    Pobiera zweryfikowane i opublikowane zasoby wiedzy ROPS Kraków.
    Zwraca raporty, diagnozy, materiały edukacyjne oraz odnośniki wideo.
    """
    return list_public_resources(
        group_id=group_id,
        kind=kind,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.get("/grouped", response_model=List[KnowledgeResourceGroupResponse])
async def get_public_knowledge_resources_grouped():
    """
    Pobiera zasoby wiedzy pogrupowane w standardowe kategorie
    (Mapa Wyzwań Społecznych, Raporty i diagnozy, Materiały edukacyjne, Filmy i dobre praktyki)
    gotowe do bezpośredniego wyświetlenia we frontendzie.
    """
    return get_grouped_resources()


@router.get("/{resource_id}", response_model=KnowledgeResourceResponse)
async def get_single_public_resource(resource_id: str):
    """
    Pobiera szczegóły pojedynczego opublikowanego zasobu wiedzy.
    """
    return get_public_resource(resource_id)


# ==============================================================================
# 2. PANEL ADMINISTRATORA ROPS KRAKÓW (ZARZĄDZANIE, WERYFIKACJA, PUBLIKACJA)
# ==============================================================================

admin_router = APIRouter(prefix="/admin/knowledge-resources", tags=["Admin ROPS Knowledge Resources"])


@admin_router.get("", response_model=List[KnowledgeResourceResponse])
async def admin_get_all_resources(
    status_filter: Optional[str] = Query(None, alias="status", description="Filtr statusu: roboczy, do_weryfikacji, zweryfikowany, opublikowany"),
    group_id: Optional[str] = Query(None, description="Filtr grupy"),
    search: Optional[str] = Query(None, description="Wyszukiwanie tekstowe"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Pobiera wszystkie zasoby wiedzy ROPS Kraków (w tym szkice i wersje robocze).
    Wymaga uprawnień Administratora ROPS Kraków.
    """
    return admin_list_resources(
        status_filter=status_filter,
        group_id=group_id,
        search=search,
        limit=limit,
        offset=offset,
    )


@admin_router.post("", response_model=KnowledgeResourceResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_new_resource(
    payload: KnowledgeResourceCreate,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Dodaje nowy materiał, raport, diagnozę lub odnośnik wideo do Zasobnika Wiedzy.
    Weryfikuje poprawność i bezpieczeństwo adresu HTTPS.
    """
    admin_id = admin.user_id or "admin-rops"
    return admin_create_resource(payload, admin_id=admin_id)


@admin_router.get("/{resource_id}", response_model=KnowledgeResourceResponse)
async def admin_get_resource_details(
    resource_id: str,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Pobiera szczegóły dowolnego zasobu wiedzy dla panelu ROPS.
    """
    return admin_get_resource(resource_id)


@admin_router.put("/{resource_id}", response_model=KnowledgeResourceResponse)
async def admin_update_resource_details(
    resource_id: str,
    payload: KnowledgeResourceUpdate,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Edytuje zawartość zasobu wiedzy (tytuł, opis, źródło, rok, zasięg, itp.).
    """
    admin_id = admin.user_id or "admin-rops"
    return admin_update_resource(resource_id, payload, admin_id=admin_id)


@admin_router.post("/{resource_id}/verify", response_model=KnowledgeResourceResponse)
async def admin_verify_resource_status(
    resource_id: str,
    payload: Optional[KnowledgeResourceVerifyRequest] = None,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Weryfikuje autentyczność i dostępność źródła materiału przez ROPS (status: 'zweryfikowany').
    Zapisuje identyfikator urzędnika weryfikującego oraz sygnaturę czasową.
    """
    admin_id = admin.user_id or "admin-rops"
    notes = payload.verification_notes if payload else None
    return admin_verify_resource(resource_id, admin_id=admin_id, notes=notes)


@admin_router.post("/{resource_id}/publish", response_model=KnowledgeResourceResponse)
async def admin_publish_resource_status(
    resource_id: str,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Publikuje zasób wiedzy w publicznym Zasobniku ROPS Kraków (status: 'opublikowany').
    Od tej chwili materiał jest widoczny dla mieszkańców, NGO i JST.
    """
    admin_id = admin.user_id or "admin-rops"
    return admin_publish_resource(resource_id, admin_id=admin_id)

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.security import get_current_user, require_authenticated_user, require_rops_admin, UserSession
from app.models.schemas import (
    CommunityNeedCreate,
    CommunityNeedResponse,
    CommunityNeedStatusUpdate,
    NeedsSummaryResponse,
    NeedsTrendsResponse,
)
from app.services.needs import (
    create_community_need,
    list_community_needs,
    get_user_community_needs,
    update_need_status,
    get_needs_summary,
    get_needs_trends,
)

try:
    from app.main import limiter
except ImportError:
    limiter = None

logger = logging.getLogger(__name__)

# Router publiczny: /api/needs
router = APIRouter(prefix="/needs", tags=["Community Needs"])

# Router administracyjny ROPS: /api/admin/needs
admin_router = APIRouter(prefix="/admin/needs", tags=["Admin ROPS Needs"])


# ==============================================================================
# 1. ENDPOINTY PUBLICZNE I DLA AUTORÓW (/api/needs)
# ==============================================================================

@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def submit_community_need(
    request: Request,
    payload: CommunityNeedCreate,
    user: UserSession = Depends(get_current_user),
):
    """
    Publiczne zgłoszenie oddolnej potrzeby lub wyzwania społecznego przez JST, CUS, OPS, NGO lub mieszkańca.
    Nie wymaga proponowania gotowego rozwiązania innowacyjnego.
    
    Zabezpieczenia:
    - Honeypot przeciw botom (hp_website)
    - Walidacja długości i sanityzacja treści
    - Zabezpieczenie przed podrobieniem statusu i notatek ROPS
    """
    # Ochrona przeciw spamowi botów (honeypot)
    if payload.hp_website and payload.hp_website.strip():
        logger.warning("Wykryto spam bota w zgłoszeniu potrzeby (honeypot triggered)")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nieprawidłowe zgłoszenie.",
        )

    need = create_community_need(payload, user_id=user.user_id)

    return {
        "id": need.id,
        "status": need.status,
        "message": "Potrzeba została pomyślnie zarejestrowana i przekazana do analizy regionalnej ROPS Kraków.",
    }


@router.get("/my", response_model=List[CommunityNeedResponse])
async def get_my_needs(
    user: UserSession = Depends(require_authenticated_user),
):
    """
    Pobiera listę potrzeb zgłoszonych przez aktualnie zalogowanego użytkownika (autora).
    Wymaga uwierzytelnienia. Zwykły autor nie widzi zgłoszeń innych podmiotów.
    """
    return get_user_community_needs(user.user_id)


# ==============================================================================
# 2. ENDPOINTY ADMINISTRACYJNE I AGREGACJA REGIONALNA DLA ROPS (/api/admin/needs)
# ==============================================================================

@admin_router.get("", response_model=List[CommunityNeedResponse])
async def list_admin_needs(
    powiat: Optional[str] = Query(None, description="Filtr powiatu (np. tarnowski, krakowski)"),
    category: Optional[str] = Query(None, description="Filtr kategorii (np. Seniorzy, Zdrowie psychiczne)"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filtr statusu: nowe, analizowane, uwzglednione_w_naborze, odrzucone, zaadresowane"),
    urgency_level: Optional[str] = Query(None, description="Filtr pilności: niski, sredni, wysoki, krytyczny"),
    search: Optional[str] = Query(None, description="Wyszukiwanie tekstowe w tezie problemu, opisie lub nazwie instytucji"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Pobiera pełną listę zgłoszonych potrzeb regionalnych z zaawansowanym filtrowaniem.
    Dostępne wyłącznie dla Administratora ROPS Kraków.
    """
    needs, _ = list_community_needs(
        powiat=powiat,
        category=category,
        status=status_filter,
        urgency_level=urgency_level,
        search=search,
        limit=limit,
        offset=offset,
    )
    return needs


@admin_router.get("/summary", response_model=NeedsSummaryResponse)
async def get_admin_needs_summary(
    days: Optional[int] = Query(None, ge=1, le=730, description="Opcjonalny filtr ostatnich N dni (np. 30, 90)"),
    category: Optional[str] = Query(None, description="Opcjonalny filtr kategorii"),
    powiat: Optional[str] = Query(None, description="Opcjonalny filtr powiatu"),
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Zestawienie analityczne dla decydentów ROPS:
    - Łączna liczba potrzeb
    - Rozkład według statusów i poziomu pilności
    - Top kategorie (ilościowo i procentowo)
    - Top powiaty (ilościowo i procentowo)
    - Wyłonione hotspoty regionalne z rekomendowanymi działaniami polityki społecznej
    """
    return get_needs_summary(days=days, category=category, powiat=powiat)


@admin_router.get("/trends", response_model=NeedsTrendsResponse)
async def get_admin_needs_trends(
    period_days: int = Query(30, ge=1, le=365, description="Długość okresu do porównania w dniach (domyślnie 30)"),
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Porównanie okresów pozwalające obserwować trendy regionalne:
    - Okres bieżący vs okres poprzedni
    - Wskaźnik dynamiki wzrostu / spadku (%)
    - Trendy w poszczególnych kategoriach wyzwań
    - Trendy w ujęciu powiatów
    - Identyfikacja dynamicznie narastających problemów (emerging hotspots)
    """
    return get_needs_trends(period_days=period_days)


@admin_router.patch("/{need_id}/status", response_model=CommunityNeedResponse)
async def update_admin_need_status(
    need_id: str,
    payload: CommunityNeedStatusUpdate,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Formalna zmiana statusu potrzeby oraz dodanie wewnętrznej notatki analityka ROPS.
    """
    updated = update_need_status(need_id, payload, admin_user_id=admin.user_id)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nie znaleziono potrzeby o identyfikatorze {need_id}.",
        )
    return updated

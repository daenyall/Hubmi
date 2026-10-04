import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from urllib.parse import urlparse
from fastapi import HTTPException, status

from app.db.supabase import get_supabase_client
from app.models.schemas import (
    KnowledgeResourceCreate,
    KnowledgeResourceUpdate,
    KnowledgeResourceResponse,
    KnowledgeResourceGroupResponse,
)
from app.utils.helpers import to_dict_list, to_dict

logger = logging.getLogger(__name__)


# ==============================================================================
# WALIDACJA BEZPIECZEŃSTWA ODNOŚNIKÓW ZASOBÓW
# ==============================================================================

def is_safe_resource_url(url: str) -> bool:
    """
    Weryfikuje, czy adres zasobu jest bezpiecznym odnośnikiem HTTPS
    bez ukrytych danych uwierzytelniających (username/password) ani protokołów skryptowych.
    """
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urlparse(url.strip())
        if parsed.scheme != "https":
            return False
        if parsed.username or parsed.password:
            return False
        if not parsed.netloc:
            return False
        return True
    except Exception:
        return False


def _get_active_supabase():
    """
    Pobiera klienta Supabase lub zgłasza jawny błąd 503 w przypadku braku konfiguracji.
    """
    sb = get_supabase_client()
    if not sb:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna lub nieskonfigurowana.",
        )
    return sb


def _map_to_response(r: Dict[str, Any]) -> KnowledgeResourceResponse:
    return KnowledgeResourceResponse(
        id=str(r.get("id", "")),
        title=str(r.get("title", "")),
        description=str(r.get("description", "")),
        group_id=str(r.get("group_id", "materialy-edukacyjne")),
        group_title=str(r.get("group_title", "Materiały edukacyjne")),
        kind=str(r.get("kind", "Dokument PDF")),
        url=str(r.get("url", "")),
        year=r.get("year"),
        coverage_scope=r.get("coverage_scope"),
        caveat=r.get("caveat"),
        status=str(r.get("status", "roboczy")),
        verified_by=r.get("verified_by"),
        verified_at=str(r.get("verified_at")) if r.get("verified_at") else None,
        published_by=r.get("published_by"),
        published_at=str(r.get("published_at")) if r.get("published_at") else None,
        created_at=str(r.get("created_at", "")),
        updated_at=str(r.get("updated_at", "")),
    )


# ==============================================================================
# PUBLICZNE API ZASOBNIKA WIEDZY (WYŁĄCZNIE SUPABASE, BRAK PAMIĘCIOWEGO FALLBACKU)
# ==============================================================================

def list_public_resources(
    group_id: Optional[str] = None,
    kind: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[KnowledgeResourceResponse]:
    """
    Pobiera publiczne zasoby wiedzy (wyłącznie status 'opublikowany').
    Korzysta wyłącznie z trwałej bazy danych Supabase.
    Filtrowanie następuje PRZED paginacją.
    Pusta tabela lub brak wyników zwraca pustą listę.
    """
    sb = _get_active_supabase()

    try:
        query = sb.table("knowledge_resources").select("*").eq("status", "opublikowany")
        if group_id:
            query = query.eq("group_id", group_id)
        if kind:
            query = query.eq("kind", kind)
        if search and search.strip():
            # Filtrowanie po tytule lub opisie
            s_clean = search.strip()
            query = query.ilike("title", f"%{s_clean}%")

        res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    except Exception as e:
        logger.error("Błąd trwałego odczytu knowledge_resources z Supabase: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Wystąpił błąd komunikacji z bazą danych zasobnika wiedzy.",
        )

    rows = to_dict_list(res.data) if res and res.data else []
    return [_map_to_response(r) for r in rows if r.get("id")]


def get_public_resource(resource_id: str) -> KnowledgeResourceResponse:
    """
    Pobiera pojedynczy opublikowany zasób wiedzy.
    Zwraca 404, jeśli rekord nie istnieje lub nie został opublikowany.
    """
    sb = _get_active_supabase()

    try:
        res = (
            sb.table("knowledge_resources")
            .select("*")
            .eq("id", resource_id)
            .eq("status", "opublikowany")
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.error("Błąd trwałego odczytu zasobu %s z Supabase: %s", resource_id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Wystąpił błąd komunikacji z bazą danych zasobnika wiedzy.",
        )

    data = to_dict(res.data) if res and res.data else None
    if not data or not data.get("id"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Zasób wiedzy o ID '{resource_id}' nie został odnaleziony lub nie jest opublikowany.",
        )

    return _map_to_response(data)


def get_grouped_resources() -> List[KnowledgeResourceGroupResponse]:
    """
    Zwraca zasoby pogrupowane w kategorie spójne ze strukturą RESOURCE_GROUPS frontendu.
    Dane pochodzą wyłącznie z opublikowanych rekordów w Supabase.
    """
    all_published = list_public_resources(limit=200)

    groups_def = [
        {
            "id": "mapa-wyzwan",
            "title": "Mapa Wyzwań Społecznych",
            "intro": "Punkt wyjścia do nazwania problemu. Wnioski z mapy warto przywołać w opisie diagnozy w kreatorze pomysłu.",
        },
        {
            "id": "raporty-diagnozy",
            "title": "Raporty i diagnozy społeczne",
            "intro": "Dane i wnioski, którymi można poprzeć skalę problemu. Sprawdź datę opracowania, zanim powołasz się na liczby.",
        },
        {
            "id": "materialy-edukacyjne",
            "title": "Materiały edukacyjne o innowacjach społecznych",
            "intro": "Jak projektuje się i inkubuje innowację społeczną — doświadczenia ROPS Kraków i narzędzia do pracy nad pomysłem.",
        },
        {
            "id": "filmy-i-dobre-praktyki",
            "title": "Filmy i dobre praktyki",
            "intro": "Zweryfikowane materiały filmowe i studia przypadków wdrożeń innowacji społecznych w regionie.",
        },
    ]

    grouped_res: List[KnowledgeResourceGroupResponse] = []
    for g in groups_def:
        items = [r for r in all_published if r.group_id == g["id"]]
        grouped_res.append(
            KnowledgeResourceGroupResponse(
                id=g["id"],
                title=g["title"],
                intro=g["intro"],
                items=items,
            )
        )

    return grouped_res


# ==============================================================================
# PANEL ADMINISTRATORA ROPS KRAKÓW (CRUD, WERYFIKACJA, PUBLIKACJA, USUWANIE)
# ==============================================================================

def admin_list_resources(
    status_filter: Optional[str] = None,
    group_id: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[KnowledgeResourceResponse]:
    """
    Pobiera wszystkie zasoby wiedzy (w dowolnym statusie) dla administratora ROPS.
    Filtrowanie następuje PRZED paginacją bezpośrednio w Supabase.
    """
    sb = _get_active_supabase()

    try:
        query = sb.table("knowledge_resources").select("*")
        if status_filter:
            query = query.eq("status", status_filter)
        if group_id:
            query = query.eq("group_id", group_id)
        if search and search.strip():
            s_clean = search.strip()
            query = query.ilike("title", f"%{s_clean}%")

        res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    except Exception as e:
        logger.error("Błąd odczytu admin knowledge_resources z Supabase: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Wystąpił błąd komunikacji z bazą danych zasobnika wiedzy.",
        )

    rows = to_dict_list(res.data) if res and res.data else []
    return [_map_to_response(r) for r in rows if r.get("id")]


def admin_get_resource(resource_id: str) -> KnowledgeResourceResponse:
    """
    Pobiera szczegóły zasobu w dowolnym statusie dla administratora ROPS.
    """
    sb = _get_active_supabase()

    try:
        res = (
            sb.table("knowledge_resources")
            .select("*")
            .eq("id", resource_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.error("Błąd odczytu admin zasobu %s z Supabase: %s", resource_id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Wystąpił błąd komunikacji z bazą danych zasobnika wiedzy.",
        )

    data = to_dict(res.data) if res and res.data else None
    if not data or not data.get("id"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Zasób wiedzy o ID '{resource_id}' nie został odnaleziony.",
        )

    return _map_to_response(data)


def admin_create_resource(
    payload: KnowledgeResourceCreate, admin_id: str
) -> KnowledgeResourceResponse:
    """
    Dodaje nowy zasób wiedzy do bazy ROPS.
    Wymaga bezpiecznego adresu HTTPS (nie buduje hostingu filmów, akceptuje zweryfikowane linki).
    Nie pozwala na obejście weryfikacji przez bezpośrednie ustawienie statusu 'opublikowany'.
    """
    clean_url = payload.url.strip()
    if not is_safe_resource_url(clean_url):
        raise HTTPException(
            status_code=422,
            detail="Nieprawidłowy adres URL. Wymagany jest bezpieczny protokół HTTPS bez danych uwierzytelniających.",
        )

    # Blokada bezpośredniego tworzenia jako 'opublikowany'
    req_status = (payload.status or "roboczy").strip().lower()
    if req_status == "opublikowany":
        raise HTTPException(
            status_code=422,
            detail="Nowy zasób nie może być dodany od razu jako 'opublikowany'. Wymaga formalnego przejścia weryfikacji przez ROPS Kraków.",
        )
    if req_status not in ("roboczy", "do_weryfikacji"):
        req_status = "roboczy"

    res_id = payload.id.strip() if payload.id and payload.id.strip() else f"res_{uuid.uuid4().hex[:8]}"
    now_str = datetime.now(timezone.utc).isoformat()

    row_data: Dict[str, Any] = {
        "id": res_id,
        "title": payload.title.strip(),
        "description": payload.description.strip(),
        "group_id": payload.group_id.strip(),
        "group_title": payload.group_title.strip() if payload.group_title else "Materiały edukacyjne",
        "kind": payload.kind.strip(),
        "url": clean_url,
        "year": payload.year,
        "coverage_scope": payload.coverage_scope.strip() if payload.coverage_scope else None,
        "caveat": payload.caveat.strip() if payload.caveat else None,
        "status": req_status,
        "verified_by": None,
        "verified_at": None,
        "published_by": None,
        "published_at": None,
        "created_at": now_str,
        "updated_at": now_str,
    }

    sb = _get_active_supabase()

    try:
        res = sb.table("knowledge_resources").insert(row_data).execute()
    except Exception as e:
        logger.error("Błąd zapisu knowledge_resources do Supabase: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Wystąpił błąd podczas trwałego zapisu zasobu wiedzy w bazie danych.",
        )

    if not res or not res.data:
        logger.error("Supabase insert nie zwrócił potwierdzenia zapisu (brak res.data)")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Baza danych nie potwierdziła trwałego zapisu zasobu wiedzy.",
        )

    inserted = to_dict(res.data[0]) if isinstance(res.data, list) else to_dict(res.data)
    return _map_to_response(inserted)


def admin_update_resource(
    resource_id: str, payload: KnowledgeResourceUpdate, admin_id: str
) -> KnowledgeResourceResponse:
    """
    Edytuje istniejący zasób wiedzy.
    POST i PUT nie mogą omijać weryfikacji przez bezpośrednie ustawienie statusu 'opublikowany'.
    Zmiana źródła albo treści po weryfikacji unieważnia wcześniejszą weryfikację i wymaga ponownego zatwierdzenia.
    """
    existing = admin_get_resource(resource_id)
    update_data: Dict[str, Any] = {}
    content_changed = False

    if payload.status is not None:
        new_status = payload.status.strip().lower()
        if new_status == "opublikowany":
            raise HTTPException(
                status_code=422,
                detail="Nie można bezpośrednio ustawić statusu 'opublikowany' przez edycję. Publikacja wymaga formalnej weryfikacji i wywołania dedykowanego endpointu /publish.",
            )
        update_data["status"] = new_status

    if payload.title is not None and payload.title.strip() != existing.title:
        update_data["title"] = payload.title.strip()
        content_changed = True
    if payload.description is not None and payload.description.strip() != existing.description:
        update_data["description"] = payload.description.strip()
        content_changed = True
    if payload.group_id is not None and payload.group_id.strip() != existing.group_id:
        update_data["group_id"] = payload.group_id.strip()
        content_changed = True
    if payload.group_title is not None and payload.group_title.strip() != existing.group_title:
        update_data["group_title"] = payload.group_title.strip()
        content_changed = True
    if payload.kind is not None and payload.kind.strip() != existing.kind:
        update_data["kind"] = payload.kind.strip()
        content_changed = True
    if payload.url is not None:
        clean_url = payload.url.strip()
        if not is_safe_resource_url(clean_url):
            raise HTTPException(
                status_code=422,
                detail="Nieprawidłowy adres URL. Wymagany jest bezpieczny protokół HTTPS bez danych uwierzytelniających.",
            )
        if clean_url != existing.url:
            update_data["url"] = clean_url
            content_changed = True
    if payload.year is not None and payload.year != existing.year:
        update_data["year"] = payload.year
        content_changed = True
    if payload.coverage_scope is not None and payload.coverage_scope.strip() != (existing.coverage_scope or ""):
        update_data["coverage_scope"] = payload.coverage_scope.strip()
        content_changed = True
    if "caveat" in payload.model_fields_set:
        clean_caveat = payload.caveat.strip() or None if payload.caveat is not None else None
        if clean_caveat != existing.caveat:
            update_data["caveat"] = clean_caveat
            content_changed = True

    # Zmiana źródła lub treści po wcześniejszej weryfikacji unieważnia weryfikację
    if content_changed and existing.status in ("zweryfikowany", "opublikowany"):
        logger.info("Zmiana treści/źródła zasobu %s po weryfikacji -> cofnięcie do 'roboczy'", resource_id)
        update_data["status"] = "roboczy"
        update_data["verified_by"] = None
        update_data["verified_at"] = None
        update_data["published_by"] = None
        update_data["published_at"] = None

    now_str = datetime.now(timezone.utc).isoformat()
    update_data["updated_at"] = now_str

    sb = _get_active_supabase()

    try:
        res = (
            sb.table("knowledge_resources")
            .update(update_data)
            .eq("id", resource_id)
            .execute()
        )
    except Exception as e:
        logger.error("Błąd aktualizacji zasobu %s w Supabase: %s", resource_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Wystąpił błąd podczas aktualizacji zasobu wiedzy w bazie danych.",
        )

    if not res or not res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Baza danych nie potwierdziła trwałej aktualizacji zasobu wiedzy.",
        )

    updated = to_dict(res.data[0]) if isinstance(res.data, list) else to_dict(res.data)
    return _map_to_response(updated)


def admin_verify_resource(
    resource_id: str, admin_id: str, notes: Optional[str] = None
) -> KnowledgeResourceResponse:
    """
    Weryfikuje autentyczność i dostępność źródła materiału przez ROPS (status: 'zweryfikowany').
    Zapisuje identyfikator urzędnika weryfikującego oraz sygnaturę czasową.
    """
    existing = admin_get_resource(resource_id)
    if not is_safe_resource_url(existing.url):
        raise HTTPException(
            status_code=422,
            detail="Nie można zweryfikować zasobu: niepoprawny lub niebezpieczny adres URL.",
        )

    now_str = datetime.now(timezone.utc).isoformat()
    update_data = {
        "status": "zweryfikowany",
        "verified_by": admin_id,
        "verified_at": now_str,
        "caveat": notes if notes else existing.caveat,
        "updated_at": now_str,
    }

    sb = _get_active_supabase()

    try:
        res = (
            sb.table("knowledge_resources")
            .update(update_data)
            .eq("id", resource_id)
            .execute()
        )
    except Exception as e:
        logger.error("Błąd weryfikacji zasobu %s w Supabase: %s", resource_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Wystąpił błąd podczas weryfikacji zasobu wiedzy w bazie danych.",
        )

    if not res or not res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Baza danych nie potwierdziła trwałej weryfikacji zasobu wiedzy.",
        )

    updated = to_dict(res.data[0]) if isinstance(res.data, list) else to_dict(res.data)
    return _map_to_response(updated)


def admin_publish_resource(
    resource_id: str, admin_id: str
) -> KnowledgeResourceResponse:
    """
    Publikuje zasób wiedzy w publicznym Zasobniku ROPS Kraków (status: 'opublikowany').
    Wymaga wcześniejszej formalnej weryfikacji (status 'zweryfikowany').
    Publikacja NIE MOŻE sama dopisywać verified_by ani verified_at!
    """
    existing = admin_get_resource(resource_id)

    # Ścisły warunek: publikacja wymaga uprzedniej formalnej weryfikacji
    if existing.status != "zweryfikowany":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Zasób nie może zostać opublikowany: wymagana jest wcześniejsza formalna weryfikacja przez ROPS Kraków (zasób musi posiadać status 'zweryfikowany').",
        )
    if not existing.verified_by or not existing.verified_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Brak potwierdzenia formalnej weryfikacji (brak verified_by lub verified_at). Publikacja jest zablokowana.",
        )

    now_str = datetime.now(timezone.utc).isoformat()
    update_data = {
        "status": "opublikowany",
        "published_by": admin_id,
        "published_at": now_str,
        "updated_at": now_str,
    }

    sb = _get_active_supabase()

    try:
        res = (
            sb.table("knowledge_resources")
            .update(update_data)
            .eq("id", resource_id)
            .execute()
        )
    except Exception as e:
        logger.error("Błąd publikacji zasobu %s w Supabase: %s", resource_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Wystąpił błąd podczas publikacji zasobu wiedzy w bazie danych.",
        )

    if not res or not res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Baza danych nie potwierdziła publikacji zasobu wiedzy.",
        )

    updated = to_dict(res.data[0]) if isinstance(res.data, list) else to_dict(res.data)
    return _map_to_response(updated)


def admin_unpublish_resource(
    resource_id: str, admin_id: str
) -> KnowledgeResourceResponse:
    """
    Wycofuje publikację zasobu wiedzy (cofa status do 'zweryfikowany').
    Natychmiast ukrywa zasób przed widokiem publicznym.
    """
    existing = admin_get_resource(resource_id)
    if existing.status != "opublikowany":
        return existing

    now_str = datetime.now(timezone.utc).isoformat()
    update_data = {
        "status": "zweryfikowany",
        "published_by": None,
        "published_at": None,
        "updated_at": now_str,
    }

    sb = _get_active_supabase()

    try:
        res = (
            sb.table("knowledge_resources")
            .update(update_data)
            .eq("id", resource_id)
            .execute()
        )
    except Exception as e:
        logger.error("Błąd wycofania publikacji zasobu %s: %s", resource_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Wystąpił błąd podczas wycofywania publikacji zasobu wiedzy w bazie danych.",
        )

    if not res or not res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Baza danych nie potwierdziła wycofania publikacji zasobu.",
        )

    updated = to_dict(res.data[0]) if isinstance(res.data, list) else to_dict(res.data)
    return _map_to_response(updated)


def admin_delete_resource(
    resource_id: str, admin_id: str
) -> Dict[str, Any]:
    """
    Trwale usuwa zasób wiedzy z bazy danych ROPS Kraków.
    Potwierdza rzeczywiste usunięcie. Dostęp wyłącznie dla Administratora ROPS.
    """
    # 1. Sprawdzenie czy rekord w ogóle istnieje (zwróci 404 jeśli nie ma)
    admin_get_resource(resource_id)

    sb = _get_active_supabase()

    try:
        sb.table("knowledge_resources").delete().eq("id", resource_id).execute()
    except Exception as e:
        logger.error("Błąd usuwania zasobu %s z Supabase: %s", resource_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Wystąpił błąd podczas usuwania zasobu wiedzy z bazy danych.",
        )

    # 2. Potwierdzenie rzeczywistego braku rekordu
    try:
        check = (
            sb.table("knowledge_resources")
            .select("id")
            .eq("id", resource_id)
            .execute()
        )
        if check and check.data and len(check.data) > 0:
            logger.error("Rekord %s nadal istnieje w Supabase po operacji DELETE", resource_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Operacja usunięcia nie powiodła się. Rekord nadal istnieje w bazie danych.",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Błąd weryfikacji usunięcia zasobu %s: %s", resource_id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Nie udało się potwierdzić usunięcia zasobu wiedzy w bazie danych.",
        )

    return {
        "success": True,
        "message": f"Zasób o ID '{resource_id}' został trwale usunięty z Zasobnika Wiedzy ROPS Kraków.",
        "id": resource_id,
    }

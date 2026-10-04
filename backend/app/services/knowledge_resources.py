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


# ==============================================================================
# AUTENTYCZNY ZESTAW STARTOWY ZASOBÓW ROPS KRAKÓW (MVP)
# ==============================================================================

INITIAL_ROPS_RESOURCES: List[Dict[str, Any]] = [
    {
        "id": "mapa-wyzwan-spolecznych",
        "group_id": "mapa-wyzwan",
        "group_title": "Mapa Wyzwań Społecznych",
        "title": "Mapa Wyzwań Społecznych",
        "description": "Opracowanie Działu Innowacji Społecznych ROPS w Krakowie, przygotowane na potrzeby projektu „Inkubator Włączenia Społecznego 2.0”. Obejmuje osiem obszarów: rodzina i piecza zastępcza, bezdomność, niepełnosprawność, ubóstwo, integracja cudzoziemców, zdrowie, zdrowie psychiczne oraz seniorzy. Dla każdego obszaru podaje definicję i analizę danych zastanych.",
        "kind": "Dokument PDF",
        "url": "https://rops.krakow.pl/mpliki/IS/IWS_20/za._nr_2._Mapa_Wyzwa_Spoecznych.pdf",
        "year": 2024,
        "coverage_scope": "ogólnopolski",
        "caveat": None,
        "status": "opublikowany",
        "verified_by": "rops_admin",
        "verified_at": "2026-10-03T12:00:00+00:00",
        "published_by": "rops_admin",
        "published_at": "2026-10-03T12:00:00+00:00",
        "created_at": "2026-10-03T12:00:00+00:00",
        "updated_at": "2026-10-03T12:00:00+00:00",
    },
    {
        "id": "raporty-z-badan",
        "group_id": "raporty-diagnozy",
        "group_title": "Raporty i diagnozy społeczne",
        "title": "Raporty z badań",
        "description": "Raporty badawcze ROPS do pobrania, m.in. „Wyzwania i potrzeby sektora opiekuńczego w Małopolsce” (2026) oraz „Usługi społeczne w Małopolsce – deficyty, potrzeby, potencjał rozwojowy” (2025). Opracowania opisują skalę zjawisk i dostęp mieszkańców regionu do pomocy i wsparcia. Publikacje udostępniono na licencji CC BY 4.0.",
        "kind": "Pliki do pobrania",
        "url": "https://rops.krakow.pl/badania-analizy-raporty/raporty-z-badan",
        "year": 2026,
        "coverage_scope": "woj. małopolskie",
        "caveat": None,
        "status": "opublikowany",
        "verified_by": "rops_admin",
        "verified_at": "2026-10-03T12:00:00+00:00",
        "published_by": "rops_admin",
        "published_at": "2026-10-03T12:00:00+00:00",
        "created_at": "2026-10-03T12:00:00+00:00",
        "updated_at": "2026-10-03T12:00:00+00:00",
    },
    {
        "id": "ocena-zasobow",
        "group_id": "raporty-diagnozy",
        "group_title": "Raporty i diagnozy społeczne",
        "title": "Ocena zasobów pomocy społecznej województwa małopolskiego",
        "description": "Coroczne opracowanie realizowane zgodnie z obowiązkiem ustawowym. Raport przedstawia podstawowe informacje o sytuacji społecznej i demograficznej regionu. Najnowsza edycja za 2025 r. jest udostępniona również w wersji dostępnej dla osób ze szczególnymi potrzebami, wraz z alternatywą tekstową.",
        "kind": "Raport roczny",
        "url": "https://rops.krakow.pl/badania-analizy-raporty/ocena-zasobow-pomocy-spolecznej-w-woj-malopolskim/biezaca-ocena",
        "year": 2025,
        "coverage_scope": "woj. małopolskie",
        "caveat": None,
        "status": "opublikowany",
        "verified_by": "rops_admin",
        "verified_at": "2026-10-03T12:00:00+00:00",
        "published_by": "rops_admin",
        "published_at": "2026-10-03T12:00:00+00:00",
        "created_at": "2026-10-03T12:00:00+00:00",
        "updated_at": "2026-10-03T12:00:00+00:00",
    },
    {
        "id": "ioss",
        "group_id": "raporty-diagnozy",
        "group_title": "Raporty i diagnozy społeczne",
        "title": "Internetowy Obserwator Statystyk Społecznych",
        "description": "Ogólnodostępny serwis wizualizujący wskaźniki społeczne. Wybraną statystykę można przeglądać na mapie, w tabeli i na wykresie oraz analizować na przestrzeni lat. Obejmuje dane o demografii, zdrowiu, rynku pracy, edukacji, pomocy społecznej, pieczy zastępczej i kulturze.",
        "kind": "Serwis z danymi",
        "url": "https://rops.krakow.pl/badania-analizy-raporty/internetowy-obserwator-statystyk-spolecznych",
        "year": 2026,
        "coverage_scope": "woj. małopolskie",
        "caveat": None,
        "status": "opublikowany",
        "verified_by": "rops_admin",
        "verified_at": "2026-10-03T12:00:00+00:00",
        "published_by": "rops_admin",
        "published_at": "2026-10-03T12:00:00+00:00",
        "created_at": "2026-10-03T12:00:00+00:00",
        "updated_at": "2026-10-03T12:00:00+00:00",
    },
    {
        "id": "social-innovation-canvas",
        "group_id": "materialy-edukacyjne",
        "group_title": "Materiały edukacyjne o innowacjach społecznych",
        "title": "Social Innovation Canvas",
        "description": "Plansza warsztatowa do rozpisania pomysłu na innowację społeczną. Prowadzi przez problem i jego intensywność, aktorów zmiany, przystępność i wartość rozwiązania oraz strukturę kosztów stałych. Przy każdej sekcji podaje pytania pomocnicze.",
        "kind": "Plansza PDF",
        "url": "https://rops.krakow.pl/mpliki/IS/Moj_folder/INNO_AGH_-_SOCIAL_CANVAS.pdf",
        "year": 2024,
        "coverage_scope": "ogólnopolski",
        "caveat": None,
        "status": "opublikowany",
        "verified_by": "rops_admin",
        "verified_at": "2026-10-03T12:00:00+00:00",
        "published_by": "rops_admin",
        "published_at": "2026-10-03T12:00:00+00:00",
        "created_at": "2026-10-03T12:00:00+00:00",
        "updated_at": "2026-10-03T12:00:00+00:00",
    },
    {
        "id": "publikacje-ze-swiata-innowacji",
        "group_id": "materialy-edukacyjne",
        "group_title": "Materiały edukacyjne o innowacjach społecznych",
        "title": "Publikacje ze świata innowacji",
        "description": "Publikacje ROPS podsumowujące kolejne inkubatory, m.in. „Połącz kropki, czyli o sile innowacji społecznych w obszarze włączenia społecznego”, „Innowacje społeczne dla dostępności” oraz „Przewodnik po innowacjach społecznych” o tym, czy i jak administracja publiczna może inkubować innowacje.",
        "kind": "Pliki do pobrania",
        "url": "https://rops.krakow.pl/innowacje-spoleczne/publikacje-ze-swiata-innowacji",
        "year": 2025,
        "coverage_scope": "regionalny i krajowy",
        "caveat": None,
        "status": "opublikowany",
        "verified_by": "rops_admin",
        "verified_at": "2026-10-03T12:00:00+00:00",
        "published_by": "rops_admin",
        "published_at": "2026-10-03T12:00:00+00:00",
        "created_at": "2026-10-03T12:00:00+00:00",
        "updated_at": "2026-10-03T12:00:00+00:00",
    },
    {
        "id": "biblioteka-innowacji",
        "group_id": "materialy-edukacyjne",
        "group_title": "Materiały edukacyjne o innowacjach społecznych",
        "title": "Biblioteka Innowacji Społecznych",
        "description": "Innowacje inkubowane przez ROPS, pogrupowane według odbiorców: seniorzy, dzieci, młodzież i rodzina, osoby o ograniczonej mobilności, osoby z niepełnosprawnością sensoryczną i intelektualną, zdrowie i medycyna, rynek pracy, cudzoziemcy oraz osoby w kryzysie bezdomności.",
        "kind": "Katalog na stronie ROPS",
        "url": "https://rops.krakow.pl/innowacje-spoleczne/biblioteka-innowacji-spolecznych/kategorie",
        "year": 2026,
        "coverage_scope": "woj. małopolskie",
        "caveat": "ROPS informuje na tej stronie, że jest ona w przebudowie i część odnośników może być nieaktywna.",
        "status": "opublikowany",
        "verified_by": "rops_admin",
        "verified_at": "2026-10-03T12:00:00+00:00",
        "published_by": "rops_admin",
        "published_at": "2026-10-03T12:00:00+00:00",
        "created_at": "2026-10-03T12:00:00+00:00",
        "updated_at": "2026-10-03T12:00:00+00:00",
    },
    {
        "id": "innowacje-w-modelach",
        "group_id": "materialy-edukacyjne",
        "group_title": "Materiały edukacyjne o innowacjach społecznych",
        "title": "Innowacje w małopolskich modelach",
        "description": "Przegląd innowacji społecznych, które weszły do Małopolskich Modeli Usług Społecznych, wraz z opisem gotowych do wykorzystania rozwiązań, takich jak „Organizator kompleksowej opieki w miejscu zamieszkania”.",
        "kind": "Strona tematyczna",
        "url": "https://rops.krakow.pl/innowacje-spoleczne/innowacje-w-malopolskich-modelach",
        "year": 2025,
        "coverage_scope": "woj. małopolskie",
        "caveat": None,
        "status": "opublikowany",
        "verified_by": "rops_admin",
        "verified_at": "2026-10-03T12:00:00+00:00",
        "published_by": "rops_admin",
        "published_at": "2026-10-03T12:00:00+00:00",
        "created_at": "2026-10-03T12:00:00+00:00",
        "updated_at": "2026-10-03T12:00:00+00:00",
    },
    {
        "id": "video-inkubator-iws",
        "group_id": "filmy-i-dobre-praktyki",
        "group_title": "Filmy i dobre praktyki",
        "title": "Inkubator Włączenia Społecznego – Filmy i dobre praktyki",
        "description": "Zweryfikowana baza materiałów filmowych i dobrych praktyk wdrożeniowych innowacji społecznych w gminach Małopolski. Prezentuje doświadczenia innowatorów oraz metodykę skalowania rozwiązań.",
        "kind": "Materiał filmowy (wideo)",
        "url": "https://rops.krakow.pl/innowacje-spoleczne/filmy-i-dobre-praktyki",
        "year": 2025,
        "coverage_scope": "woj. małopolskie",
        "caveat": "Materiały wideo udostępnione w serwisie ROPS Kraków.",
        "status": "opublikowany",
        "verified_by": "rops_admin",
        "verified_at": "2026-10-03T12:00:00+00:00",
        "published_by": "rops_admin",
        "published_at": "2026-10-03T12:00:00+00:00",
        "created_at": "2026-10-03T12:00:00+00:00",
        "updated_at": "2026-10-03T12:00:00+00:00",
    },
]

# Magazyn pamięciowy na potrzeby testów i fallbacku
_memory_resources_store: Dict[str, Dict[str, Any]] = {
    item["id"]: dict(item) for item in INITIAL_ROPS_RESOURCES
}


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
# PUBLICZNE API ZASOBNIKA WIEDZY
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
    Łączy bazę danych Supabase z magazynem fallbackowym z deduplikacją po ID.
    """
    seen_ids = set()
    results: List[KnowledgeResourceResponse] = []

    supabase = get_supabase_client()
    if supabase:
        try:
            query = supabase.table("knowledge_resources").select("*").eq("status", "opublikowany")
            if group_id:
                query = query.eq("group_id", group_id)
            if kind:
                query = query.eq("kind", kind)

            res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
            rows = to_dict_list(res.data)
            for r in rows:
                if r.get("id"):
                    seen_ids.add(r["id"])
                    results.append(_map_to_response(r))
        except Exception as e:
            logger.warning("Błąd odczytu knowledge_resources z Supabase: %s", e)

    # Fallback pamięciowy
    mem_rows = [
        r for r in _memory_resources_store.values()
        if r.get("status") == "opublikowany"
    ]
    if group_id:
        mem_rows = [r for r in mem_rows if r.get("group_id") == group_id]
    if kind:
        mem_rows = [r for r in mem_rows if r.get("kind") == kind]

    for r in mem_rows:
        rid = str(r.get("id") or "")
        if rid and rid not in seen_ids:
            seen_ids.add(rid)
            results.append(_map_to_response(r))

    if search and search.strip():
        s_lower = search.strip().lower()
        results = [
            r for r in results
            if s_lower in r.title.lower() or s_lower in r.description.lower()
        ]

    return results[:limit]


def get_public_resource(resource_id: str) -> KnowledgeResourceResponse:
    """
    Pobiera pojedynczy opublikowany zasób wiedzy.
    Zwraca 404, jeśli nie istnieje lub nie został opublikowany.
    """
    supabase = get_supabase_client()
    if supabase:
        try:
            res = (
                supabase.table("knowledge_resources")
                .select("*")
                .eq("id", resource_id)
                .eq("status", "opublikowany")
                .limit(1)
                .execute()
            )
            data = to_dict(res.data)
            if data:
                return _map_to_response(data)
        except Exception as e:
            logger.warning("Błąd pobierania zasobu z Supabase: %s", e)

    if resource_id in _memory_resources_store:
        r = _memory_resources_store[resource_id]
        if r.get("status") == "opublikowany":
            return _map_to_response(r)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Zasób wiedzy o ID '{resource_id}' nie został odnaleziony lub nie jest opublikowany.",
    )


def get_grouped_resources() -> List[KnowledgeResourceGroupResponse]:
    """
    Zwraca zasoby pogrupowane w kategorie spójne ze strukturą RESOURCE_GROUPS frontendu.
    """
    all_published = list_public_resources(limit=100)

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
# PANEL ADMINISTRATORA ROPS KRAKÓW (CRUD, WERYFIKACJA I PUBLIKACJA)
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
    """
    seen_ids = set()
    results: List[KnowledgeResourceResponse] = []

    supabase = get_supabase_client()
    if supabase:
        try:
            query = supabase.table("knowledge_resources").select("*")
            if status_filter:
                query = query.eq("status", status_filter)
            if group_id:
                query = query.eq("group_id", group_id)

            res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
            rows = to_dict_list(res.data)
            for r in rows:
                if r.get("id"):
                    seen_ids.add(r["id"])
                    results.append(_map_to_response(r))
        except Exception as e:
            logger.warning("Błąd odczytu admin knowledge_resources z Supabase: %s", e)

    mem_rows = list(_memory_resources_store.values())
    if status_filter:
        mem_rows = [r for r in mem_rows if r.get("status") == status_filter]
    if group_id:
        mem_rows = [r for r in mem_rows if r.get("group_id") == group_id]
    mem_rows.sort(key=lambda x: str(x.get("created_at", "")), reverse=True)

    for r in mem_rows:
        rid = str(r.get("id") or "")
        if rid and rid not in seen_ids:
            seen_ids.add(rid)
            results.append(_map_to_response(r))

    if search and search.strip():
        s_lower = search.strip().lower()
        results = [
            r for r in results
            if s_lower in r.title.lower() or s_lower in r.description.lower()
        ]

    return results[:limit]


def admin_get_resource(resource_id: str) -> KnowledgeResourceResponse:
    """
    Pobiera szczegóły zasobu w dowolnym statusie dla administratora ROPS.
    """
    supabase = get_supabase_client()
    if supabase:
        try:
            res = (
                supabase.table("knowledge_resources")
                .select("*")
                .eq("id", resource_id)
                .limit(1)
                .execute()
            )
            data = to_dict(res.data)
            if data:
                return _map_to_response(data)
        except Exception as e:
            logger.warning("Błąd odczytu admin zasobu z Supabase: %s", e)

    if resource_id in _memory_resources_store:
        return _map_to_response(_memory_resources_store[resource_id])

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Zasób wiedzy o ID '{resource_id}' nie został odnaleziony.",
    )


def admin_create_resource(
    payload: KnowledgeResourceCreate, admin_id: str
) -> KnowledgeResourceResponse:
    """
    Dodaje nowy zasób wiedzy do bazy ROPS.
    Wymaga bezpiecznego adresu HTTPS (nie buduje hostingu filmów, akceptuje zweryfikowane linki).
    """
    clean_url = payload.url.strip()
    if not is_safe_resource_url(clean_url):
        raise HTTPException(
            status_code=422,
            detail="Nieprawidłowy adres URL. Wymagany jest bezpieczny protokół HTTPS bez danych uwierzytelniających.",
        )

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
        "status": payload.status.strip() if payload.status else "roboczy",
        "verified_by": admin_id if payload.status in ("zweryfikowany", "opublikowany") else None,
        "verified_at": now_str if payload.status in ("zweryfikowany", "opublikowany") else None,
        "published_by": admin_id if payload.status == "opublikowany" else None,
        "published_at": now_str if payload.status == "opublikowany" else None,
        "created_at": now_str,
        "updated_at": now_str,
    }

    supabase = get_supabase_client()
    if supabase:
        try:
            res = supabase.table("knowledge_resources").insert(row_data).execute()
            inserted = to_dict(res.data)
            if inserted:
                _memory_resources_store[res_id] = dict(inserted)
                return _map_to_response(inserted)
        except Exception as e:
            logger.warning("Błąd zapisu knowledge_resources do Supabase: %s", e)

    _memory_resources_store[res_id] = dict(row_data)
    return _map_to_response(row_data)


def admin_update_resource(
    resource_id: str, payload: KnowledgeResourceUpdate, admin_id: str
) -> KnowledgeResourceResponse:
    """
    Edytuje istniejący zasób wiedzy.
    """
    existing = admin_get_resource(resource_id)
    update_data: Dict[str, Any] = {}

    if payload.title is not None:
        update_data["title"] = payload.title.strip()
    if payload.description is not None:
        update_data["description"] = payload.description.strip()
    if payload.group_id is not None:
        update_data["group_id"] = payload.group_id.strip()
    if payload.group_title is not None:
        update_data["group_title"] = payload.group_title.strip()
    if payload.kind is not None:
        update_data["kind"] = payload.kind.strip()
    if payload.url is not None:
        clean_url = payload.url.strip()
        if not is_safe_resource_url(clean_url):
            raise HTTPException(
                status_code=422,
                detail="Nieprawidłowy adres URL. Wymagany jest bezpieczny protokół HTTPS bez danych uwierzytelniających.",
            )
        update_data["url"] = clean_url
    if payload.year is not None:
        update_data["year"] = payload.year
    if payload.coverage_scope is not None:
        update_data["coverage_scope"] = payload.coverage_scope.strip()
    if payload.caveat is not None:
        update_data["caveat"] = payload.caveat.strip()
    if payload.status is not None:
        update_data["status"] = payload.status.strip()

    now_str = datetime.now(timezone.utc).isoformat()
    update_data["updated_at"] = now_str

    supabase = get_supabase_client()
    if supabase:
        try:
            res = (
                supabase.table("knowledge_resources")
                .update(update_data)
                .eq("id", resource_id)
                .execute()
            )
            updated = to_dict(res.data)
            if updated:
                _memory_resources_store[resource_id] = dict(updated)
                return _map_to_response(updated)
        except Exception as e:
            logger.warning("Błąd aktualizacji zasobu w Supabase: %s", e)

    if resource_id in _memory_resources_store:
        _memory_resources_store[resource_id].update(update_data)
        return _map_to_response(_memory_resources_store[resource_id])

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Zasób wiedzy o ID '{resource_id}' nie został odnaleziony.",
    )


def admin_verify_resource(
    resource_id: str, admin_id: str, notes: Optional[str] = None
) -> KnowledgeResourceResponse:
    """
    Weryfikuje zasób wiedzy przez ROPS Kraków (zmienia status na 'zweryfikowany').
    """
    res = admin_get_resource(resource_id)
    if not is_safe_resource_url(res.url):
        raise HTTPException(
            status_code=422,
            detail="Nie można zweryfikować zasobu: niepoprawny lub niebezpieczny adres URL.",
        )

    now_str = datetime.now(timezone.utc).isoformat()
    update_data: Dict[str, Any] = {
        "status": "zweryfikowany",
        "verified_by": admin_id,
        "verified_at": now_str,
        "updated_at": now_str,
    }
    if notes:
        update_data["caveat"] = (
            f"{res.caveat + ' | ' if res.caveat else ''}Notatka weryfikacyjna: {notes.strip()}"
        )

    supabase = get_supabase_client()
    if supabase:
        try:
            r = (
                supabase.table("knowledge_resources")
                .update(update_data)
                .eq("id", resource_id)
                .execute()
            )
            updated = to_dict(r.data)
            if updated:
                _memory_resources_store[resource_id] = dict(updated)
                return _map_to_response(updated)
        except Exception as e:
            logger.warning("Błąd weryfikacji w Supabase: %s", e)

    if resource_id in _memory_resources_store:
        _memory_resources_store[resource_id].update(update_data)
        return _map_to_response(_memory_resources_store[resource_id])

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Zasób wiedzy o ID '{resource_id}' nie został odnaleziony.",
    )


def admin_publish_resource(
    resource_id: str, admin_id: str
) -> KnowledgeResourceResponse:
    """
    Publikuje zasób wiedzy w oficjalnym Zasobniku ROPS Kraków (status 'opublikowany').
    """
    res = admin_get_resource(resource_id)
    now_str = datetime.now(timezone.utc).isoformat()
    update_data: Dict[str, Any] = {
        "status": "opublikowany",
        "published_by": admin_id,
        "published_at": now_str,
        "updated_at": now_str,
    }
    if not res.verified_at:
        update_data["verified_by"] = admin_id
        update_data["verified_at"] = now_str

    supabase = get_supabase_client()
    if supabase:
        try:
            r = (
                supabase.table("knowledge_resources")
                .update(update_data)
                .eq("id", resource_id)
                .execute()
            )
            updated = to_dict(r.data)
            if updated:
                _memory_resources_store[resource_id] = dict(updated)
                return _map_to_response(updated)
        except Exception as e:
            logger.warning("Błąd publikacji w Supabase: %s", e)

    if resource_id in _memory_resources_store:
        _memory_resources_store[resource_id].update(update_data)
        return _map_to_response(_memory_resources_store[resource_id])

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Zasób wiedzy o ID '{resource_id}' nie został odnaleziony.",
    )

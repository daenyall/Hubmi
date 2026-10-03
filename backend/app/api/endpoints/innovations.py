import logging
from typing import List, Optional, Any
from fastapi import APIRouter, HTTPException, Query
from app.db.supabase import get_supabase_client
from app.models.schemas import MatchItem
from app.utils.helpers import to_str
from app.utils.sanitize import is_valid_innovation_id, safe_error_message

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/innovations", response_model=List[MatchItem])
async def list_innovations(
    category: Optional[str] = Query(None, description="Filtruj według kategorii (np. Seniorzy, Dostępność)"),
    limit: int = Query(50, ge=1, le=100, description="Maksymalna liczba zwróconych innowacji"),
    offset: int = Query(0, ge=0, description="Przesunięcie paginacji"),
):
    """
    Pobiera listę zaimportowanych innowacji społecznych ROPS Kraków.
    Publiczny katalog zwraca WYŁĄCZNIE innowacje zweryfikowane i opublikowane (status='sprawdzone').
    Szkice i innowacje robocze nie są udostępniane publicznie (dostępne wyłącznie w autoryzowanym API Admina ROPS).
    """
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Baza danych Supabase nie jest skonfigurowana.")

    try:
        # Publiczne API zwraca bezwzględnie tylko status 'sprawdzone'
        query = (
            supabase.table("innovations")
            .select("id, title, description, target_group, category, why_relevant, source_url, status")
            .eq("status", "sprawdzone")
        )
        if category:
            query = query.eq("category", category)

        res = query.range(offset, offset + limit - 1).execute()
        data: Any = res.data or []

        items: List[MatchItem] = []
        if isinstance(data, list):
            for row in data:
                if isinstance(row, dict):
                    items.append(
                        MatchItem(
                            id=str(row.get("id", "")).strip(),
                            title=str(row.get("title", "")).strip(),
                            similarity_score=1.0,
                            why_relevant=to_str(row.get("why_relevant")),
                            source_url=to_str(row.get("source_url")),
                            target_group=to_str(row.get("target_group")),
                            category=to_str(row.get("category")),
                            description=to_str(row.get("description")),
                            status=str(row.get("status", "sprawdzone")).strip(),
                        )
                    )
        return items
    except Exception as e:
        logger.error("Błąd pobierania katalogu innowacji: %s", e)
        raise HTTPException(status_code=502, detail=safe_error_message("katalog innowacji"))


@router.get("/innovations/{innovation_id}", response_model=MatchItem)
async def get_innovation_by_id(innovation_id: str):
    """
    Pobiera pojedynczą innowację społeczną po jej identyfikatorze ID.
    W widoku publicznym zwracane są WYŁĄCZNIE innowacje zweryfikowane (status='sprawdzone').
    Jeśli innowacja nie istnieje lub jest nieopublikowanym szkicem, zwraca status 404.
    """
    # Walidacja formatu ID (inv_XXXX lub UUID)
    if not is_valid_innovation_id(innovation_id):
        raise HTTPException(
            status_code=422,
            detail="Nieprawidłowy format identyfikatora innowacji. Oczekiwany format: 'inv_XXXX' lub UUID.",
        )

    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Baza danych Supabase nie jest skonfigurowana.")

    try:
        # W widoku publicznym odczytujemy wyłącznie pozycje sprawdzone
        res = (
            supabase.table("innovations")
            .select("id, title, description, target_group, category, why_relevant, source_url, status")
            .eq("id", innovation_id)
            .eq("status", "sprawdzone")
            .execute()
        )
        data: Any = res.data or []
        if not data or not isinstance(data, list) or len(data) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"Innowacja o identyfikatorze '{innovation_id}' nie została odnaleziona.",
            )
        row = data[0]
        return MatchItem(
            id=str(row.get("id", "")).strip(),
            title=str(row.get("title", "")).strip(),
            similarity_score=1.0,
            why_relevant=to_str(row.get("why_relevant")),
            source_url=to_str(row.get("source_url")),
            target_group=to_str(row.get("target_group")),
            category=to_str(row.get("category")),
            description=to_str(row.get("description")),
            status=str(row.get("status", "sprawdzone")).strip(),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Błąd pobierania innowacji %s: %s", innovation_id, e)
        raise HTTPException(status_code=502, detail=safe_error_message("pobieranie innowacji"))

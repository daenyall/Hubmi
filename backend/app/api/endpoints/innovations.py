from typing import List, Optional, Any, Dict
from fastapi import APIRouter, HTTPException, Query
from app.db.supabase import get_supabase_client
from app.models.schemas import MatchItem

router = APIRouter()


def _to_str(val: Any) -> Optional[str]:
    return str(val).strip() if val is not None and str(val).strip() else None


@router.get("/innovations", response_model=List[MatchItem])
async def list_innovations(
    category: Optional[str] = Query(None, description="Filtruj według kategorii (np. Seniorzy, Dostępność)"),
    limit: int = Query(50, ge=1, le=100, description="Maksymalna liczba zwróconych innowacji"),
    offset: int = Query(0, ge=0, description="Przesunięcie paginacji"),
):
    """
    Pobiera listę zaimportowanych innowacji społecznych ROPS Kraków.
    Umożliwia przeglądanie bazy, filtrowanie po kategorii oraz paginację.
    """
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Baza danych Supabase nie jest skonfigurowana.")

    try:
        query = supabase.table("innovations").select(
            "id, title, description, target_group, category, why_relevant, source_url, status"
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
                            why_relevant=_to_str(row.get("why_relevant")),
                            source_url=_to_str(row.get("source_url")),
                            target_group=_to_str(row.get("target_group")),
                            category=_to_str(row.get("category")),
                            description=_to_str(row.get("description")),
                            status=str(row.get("status", "sprawdzone")).strip(),
                        )
                    )
        return items
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Błąd bazy danych: {str(e)}")

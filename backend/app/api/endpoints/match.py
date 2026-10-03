from typing import List, Any, Optional
from fastapi import APIRouter, HTTPException
from app.db.supabase import get_supabase_client
from app.models.schemas import MatchRequest, MatchResponse, MatchItem
from app.services.ai import create_embedding

router = APIRouter()


def _to_str(val: Any) -> Optional[str]:
    return str(val).strip() if val is not None and str(val).strip() else None


def _to_float(val: Any, default: float = 0.85) -> float:
    try:
        f = float(val) if val is not None else default
        return round(f, 4)
    except (ValueError, TypeError):
        return default


@router.post("/match", response_model=MatchResponse)
async def match_problem(request: MatchRequest):
    """
    Obligatoryjny moduł Matchmakingu:
    Przyjmuje opis problemu społecznego, wylicza zbuforowany embedding wektorowy (1536D)
    i odpytuje bazę Supabase (pgvector) przez procedurę RPC match_innovations
    o najbardziej dopasowane innowacje ROPS.
    """
    query_text = request.problem_description.strip()
    if len(query_text) < 3:
        raise HTTPException(
            status_code=400,
            detail="Opis problemu musi zawierać co najmniej 3 znaki.",
        )

    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=503,
            detail="Baza danych Supabase nie jest skonfigurowana. Sprawdź parametry SUPABASE_URL i SUPABASE_KEY.",
        )

    # 1. Wyliczenie zoptymalizowanego embeddingu dla zapytania (LRU cache)
    query_vector = create_embedding(query_text)

    threshold = request.threshold if request.threshold is not None else 0.2
    limit = request.limit if request.limit is not None else 4

    matches: List[MatchItem] = []

    # 2. Odpytanie procedury RPC match_innovations w Supabase
    try:
        rpc_res = supabase.rpc(
            "match_innovations",
            {
                "query_embedding": query_vector,
                "match_threshold": threshold,
                "match_count": limit,
            },
        ).execute()

        data: Any = rpc_res.data
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    matches.append(
                        MatchItem(
                            id=str(item.get("id", "")).strip(),
                            title=str(item.get("title", "")).strip(),
                            similarity_score=_to_float(item.get("similarity_score"), 0.85),
                            why_relevant=_to_str(item.get("why_relevant")),
                            source_url=_to_str(item.get("source_url")),
                            target_group=_to_str(item.get("target_group")),
                            category=_to_str(item.get("category")),
                            description=_to_str(item.get("description")),
                            status=str(item.get("status", "sprawdzone")).strip(),
                        )
                    )
    except Exception as e:
        print(f"Error: RPC match_innovations execution failed: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Błąd silnika wektorowego bazy danych: {str(e)}",
        )

    return MatchResponse(
        matches=matches,
        query=query_text,
        total_found=len(matches),
    )

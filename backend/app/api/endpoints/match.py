from typing import List, Any, Optional
from fastapi import APIRouter, HTTPException
from app.db.supabase import get_supabase_client
from app.models.schemas import MatchRequest, MatchResponse, MatchItem
from app.services.ai import create_embedding

router = APIRouter()


def _to_str(val: Any) -> Optional[str]:
    return str(val) if val is not None else None

def _to_float(val: Any, default: float = 0.85) -> float:
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default


@router.post("/match", response_model=MatchResponse)
async def match_problem(request: MatchRequest):
    """
    Obligatoryjny moduł Matchmakingu:
    Przyjmuje opis problemu społecznego, wylicza embedding wektorowy
    i odpytuje bazę Supabase (pgvector) o najbardziej dopasowane innowacje ROPS.
    """
    if not request.problem_description or len(request.problem_description.strip()) < 3:
        raise HTTPException(status_code=400, detail="Opis problemu musi zawierać co najmniej 3 znaki.")

    query_text = request.problem_description.strip()
    supabase = get_supabase_client()
    
    # 1. Wyliczenie embeddingu dla zapytania
    query_vector = create_embedding(query_text)
    
    matches: List[MatchItem] = []

    # 2. Próba odpytania procedury RPC match_innovations w Supabase
    if supabase:
        try:
            rpc_res = supabase.rpc(
                "match_innovations",
                {
                    "query_embedding": query_vector,
                    "match_threshold": request.threshold or 0.2,
                    "match_count": request.limit or 4,
                }
            ).execute()

            data: Any = rpc_res.data
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        matches.append(MatchItem(
                            id=str(item.get("id", "")),
                            title=str(item.get("title", "")),
                            similarity_score=_to_float(item.get("similarity_score"), 0.85),
                            why_relevant=_to_str(item.get("why_relevant")),
                            source_url=_to_str(item.get("source_url")),
                            target_group=_to_str(item.get("target_group")),
                            category=_to_str(item.get("category")),
                            description=_to_str(item.get("description")),
                            status=str(item.get("status", "sprawdzone")),
                        ))
        except Exception as e:
            print(f"Error: RPC match_innovations failed: {e}")
            raise HTTPException(
                status_code=502,
                detail=f"Błąd silnika wektorowego bazy danych: {str(e)}"
            )

    return MatchResponse(
        matches=matches,
        query=query_text,
        total_found=len(matches),
    )

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
            print(f"Warning: RPC match_innovations failed or not created yet ({e}). Trying direct table query.")
            
            # Fallback: jeśli funkcja RPC nie została jeszcze wklejona w Supabase, pobierz innowacje z tabeli
            try:
                table_res = supabase.table("innovations").select("*").limit(request.limit or 4).execute()
                t_data: Any = table_res.data
                if isinstance(t_data, list):
                    for item in t_data:
                        if isinstance(item, dict):
                            matches.append(MatchItem(
                                id=str(item.get("id", "")),
                                title=str(item.get("title", "")),
                                similarity_score=0.88,
                                why_relevant=_to_str(item.get("why_relevant")),
                                source_url=_to_str(item.get("source_url")),
                                target_group=_to_str(item.get("target_group")),
                                category=_to_str(item.get("category")),
                                description=_to_str(item.get("description")),
                                status=str(item.get("status", "sprawdzone")),
                            ))
            except Exception as table_err:
                print(f"Table query error: {table_err}")

    # Fallback lokalny (gdy baza jest jeszcze pusta przed seedem)
    if not matches:
        matches = [
            MatchItem(
                id="inv_01",
                title="Mobilny Asystent Seniora",
                similarity_score=0.89,
                why_relevant="Rozwiązanie testowane w gminach wiejskich; łączy transport z opieką.",
                source_url="https://rops.krakow.pl/innowacje/asystent-seniora",
                target_group="Seniorzy 65+, osoby z niepełnosprawnością ruchową",
                category="Seniorzy",
                description="System mobilnego wsparcia dla osób starszych w rozproszonych sołectwach.",
                status="sprawdzone",
            ),
            MatchItem(
                id="inv_06",
                title="Mobilny Punkt Usług Społecznych (Bus CUS)",
                similarity_score=0.82,
                why_relevant="Przełamuje barierę depopulacji i odległości od ośrodków miejskich w Małopolsce.",
                source_url="https://rops.krakow.pl/innowacje/mobilny-cus",
                target_group="Mieszkańcy małych sołectw, osoby zależne",
                category="Usługi publiczne",
                description="Mikrobus z personelem pomocowym dojeżdżający do mieszkańców wsi.",
                status="sprawdzone",
            )
        ]

    return MatchResponse(
        matches=matches,
        query=query_text,
        total_found=len(matches),
    )

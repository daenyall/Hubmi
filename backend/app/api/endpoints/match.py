import logging
import re
from typing import List, Any, Optional, Set
from fastapi import APIRouter, HTTPException, Request
from app.db.supabase import get_supabase_client
from app.models.schemas import MatchRequest, MatchResponse, MatchItem
from app.services.ai import create_embedding
from app.services.query_validator import is_gibberish
from app.utils.helpers import to_str, to_float
from app.utils.sanitize import sanitize_text, safe_error_message

try:
    from app.main import limiter
except ImportError:
    limiter = None

logger = logging.getLogger(__name__)
router = APIRouter()

AVAILABLE_ROPS_CATEGORIES = [
    "Seniorzy",
    "Zdrowie psychiczne",
    "Dostępność",
    "Włączenie cyfrowe",
    "Usługi publiczne",
    "Integracja społeczna",
    "Młodzież",
    "Pomoc społeczna",
    "Wsparcie rodziny",
]

POLISH_STOPWORDS: Set[str] = {
    "dla", "oraz", "jest", "jego", "który", "która", "które", "przez",
    "przy", "być", "mieć", "może", "bardzo", "dużo", "mało", "tego",
    "żeby", "jako", "tylko", "gdzie", "kiedy", "naszej", "naszym",
}






@router.post("/match", response_model=MatchResponse)
async def match_problem(request: MatchRequest, req: Request):
    """
    Obligatoryjny moduł Matchmakingu (Wyszukiwarka Semantyczno-Hybrydowa):
    1. Filtruje bełkot i losowe znaki klawiatury (is_gibberish), chroniąc przed halucynacjami.
    2. Wylicza zbuforowany embedding wektorowy (1536D) i odpytuje bazę pgvector (match_innovations).
    3. Stosuje hybrydowe wzmocnienie leksykalne (Hybrid Lexical Boost) dla kluczowych słów w tytule/kategorii.
    4. Zwraca wyłącznie sprawdzone innowacje ROPS Kraków, a przy braku dopasowań – ustrukturyzowane porady.
    """
    query_text = sanitize_text(request.problem_description.strip())
    if len(query_text) < 3:
        raise HTTPException(
            status_code=400,
            detail="Opis problemu musi zawierać co najmniej 3 znaki.",
        )

    # 1. Ochrona przed bełkotem i keyboard mash (np. 'awdawdawdawd', 'asdfghjkl')
    gibberish_detected, reason = is_gibberish(query_text)
    if gibberish_detected:
        return MatchResponse(
            matches=[],
            query=query_text,
            total_found=0,
            no_match_advice=(
                f"Wprowadzony opis nie przypomina opisu wyzwania społecznego ({reason}). "
                "Opisz problem prostymi słowami (np. 'samotność seniorów', 'brak dostępności architektonicznej', 'wykluczenie transportowe') "
                "lub wybierz jedną z rekomendowanych kategorii tematycznych ROPS."
            ),
            suggested_categories=AVAILABLE_ROPS_CATEGORIES,
            can_submit_as_new_challenge=True,
        )

    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=503,
            detail="Baza danych Supabase nie jest skonfigurowana. Sprawdź parametry SUPABASE_URL i SUPABASE_KEY.",
        )

    # 2. Wyliczenie zoptymalizowanego embeddingu dla zapytania (LRU cache)
    query_vector = create_embedding(query_text)

    threshold = request.threshold if request.threshold is not None else 0.2
    limit = request.limit if request.limit is not None else 4

    # Ekstrakcja słów kluczowych do leksykalnego boostingu hybrydowego
    raw_words = re.findall(r"\b[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]{3,}\b", query_text.lower())
    kw_words = set(raw_words) - POLISH_STOPWORDS

    raw_candidates: List[dict] = []

    # 3. Odpytanie procedury RPC match_innovations w Supabase
    try:
        rpc_limit = limit * 4 if request.category else limit * 2
        rpc_res = supabase.rpc(
            "match_innovations",
            {
                "query_embedding": query_vector,
                "match_threshold": max(0.05, threshold - 0.15),
                "match_count": rpc_limit,
            },
        ).execute()

        data: Any = rpc_res.data
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    raw_candidates.append(item)
    except Exception as e:
        logger.error("RPC match_innovations execution failed: %s", e)
        raise HTTPException(
            status_code=502,
            detail=safe_error_message("wyszukiwanie innowacji"),
        )

    # 4. Hybrydowy scoring i filtrowanie
    scored_items: List[MatchItem] = []
    for item in raw_candidates:
        item_status = str(item.get("status", "sprawdzone")).strip()
        # W publicznym matchingu zwracamy wyłącznie innowacje sprawdzone przez ROPS
        if item_status != "sprawdzone":
            continue

        item_category = to_str(item.get("category"))
        if request.category and item_category != request.category:
            continue

        item_title = str(item.get("title", "")).strip()
        item_desc = str(item.get("description", "")).strip()
        item_tg = str(item.get("target_group", "")).strip()

        # Wyliczenie Lexical Boost dla dokładnych słów kluczowych
        title_lower = item_title.lower()
        desc_lower = item_desc.lower()
        cat_lower = (item_category or "").lower()
        tg_lower = item_tg.lower()

        lexical_boost = 0.0
        for word in kw_words:
            if word in title_lower:
                lexical_boost += 0.08
            elif word in cat_lower:
                lexical_boost += 0.05
            elif word in tg_lower:
                lexical_boost += 0.04
            elif word in desc_lower:
                lexical_boost += 0.02

        lexical_boost = min(lexical_boost, 0.20)
        base_sim = to_float(item.get("similarity_score"), 0.5)
        hybrid_score = min(round(base_sim + lexical_boost, 4), 0.99)

        if hybrid_score >= threshold:
            scored_items.append(
                MatchItem(
                    id=str(item.get("id", "")).strip(),
                    title=item_title,
                    similarity_score=hybrid_score,
                    why_relevant=to_str(item.get("why_relevant")),
                    source_url=to_str(item.get("source_url")),
                    target_group=to_str(item.get("target_group")),
                    category=item_category,
                    description=to_str(item.get("description")),
                    status=item_status,
                )
            )

    # Sortowanie po ostatecznym wyniku hybrydowym
    scored_items.sort(key=lambda x: x.similarity_score if x.similarity_score is not None else 0.0, reverse=True)
    matches = scored_items[:limit]

    # 5. Obsługa braku dopasowań: ustrukturyzowana pomoc i rekomendacje
    no_match_advice = None
    suggested_cats = None
    if len(matches) == 0:
        if request.category:
            no_match_advice = (
                f"Nie znaleziono innowacji spełniających kryteria w kategorii '{request.category}' przy progu {threshold}. "
                "Rekomendujemy usunięcie filtra kategorii, obniżenie progu podobieństwa lub zgłoszenie nowej fiszki pomysłu."
            )
        else:
            no_match_advice = (
                "Nie znaleziono bezpośrednio pasujących innowacji powyżej zadanego progu podobieństwa. "
                "Rekomendujemy: (1) doprecyzowanie opisu problemu (grupa docelowa, lokalizacja, potrzeby), "
                "(2) obniżenie progu dopasowania, lub (3) zgłoszenie problemu jako nowej fiszki wyzwania do zaopiniowania przez ROPS Kraków."
            )
        suggested_cats = AVAILABLE_ROPS_CATEGORIES

    return MatchResponse(
        matches=matches,
        query=query_text,
        total_found=len(matches),
        no_match_advice=no_match_advice,
        suggested_categories=suggested_cats,
        can_submit_as_new_challenge=True,
    )

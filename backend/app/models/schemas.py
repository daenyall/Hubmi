from typing import Optional, Any, Dict
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    app_name: str
    environment: str
    supabase_connected: bool


class MessageResponse(BaseModel):
    message: str
    data: Optional[Dict[str, Any]] = None


# Kontrakt Matchmakingu (POST /api/match)
class MatchRequest(BaseModel):
    problem_description: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description="Opis problemu społecznego zgłaszanego przez JST/NGO",
    )
    threshold: Optional[float] = Field(
        0.2,
        ge=0.0,
        le=1.0,
        description="Minimalny próg podobieństwa cosinusowego",
    )
    limit: Optional[int] = Field(
        4,
        ge=1,
        le=50,
        description="Maksymalna liczba zwróconych innowacji",
    )
    category: Optional[str] = Field(
        None,
        description="Opcjonalny filtr kategorii (np. Seniorzy, Dostępność, Zdrowie psychiczne)",
    )


class MatchItem(BaseModel):
    id: str
    title: str
    similarity_score: float
    why_relevant: Optional[str] = None
    source_url: Optional[str] = None
    target_group: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    status: str = "sprawdzone"


class MatchResponse(BaseModel):
    matches: list[MatchItem]
    query: Optional[str] = None
    total_found: int
    no_match_advice: Optional[str] = Field(
        None,
        description="Wskazówki dla użytkownika, gdy nie znaleziono bezpośrednich dopasowań",
    )
    suggested_categories: Optional[list[str]] = Field(
        None,
        description="Lista dostępnych kategorii innowacji ROPS",
    )
    can_submit_as_new_challenge: bool = Field(
        True,
        description="Flaga informująca o możliwości złożenia nowej fiszki wyzwania do ROPS",
    )



# Kontrakt Middlemana AI (POST /api/adapt)
class AdaptRequest(BaseModel):
    innovation_id: Optional[str] = None
    innovation_title: str
    innovation_description: Optional[str] = None
    municipality_context: str = Field(..., description="Zasoby, budżet lub specyfika zgłaszającej się gminy/instytucji")


class AdaptResponse(BaseModel):
    innovation_title: str
    adaptation_plan: str

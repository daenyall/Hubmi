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


# ==============================================================================
# MODELE OBSŁUGI ZGŁOSZEŃ, RÓL, STATUSÓW I AUDYTU (19:00 - 21:00)
# ==============================================================================

class SubmissionCreate(BaseModel):
    title: str = Field(default="Fiszka innowacji społecznej", min_length=2, max_length=200, description="Tytuł innowacji/pomysłu")
    problem_description: str = Field(..., min_length=3, max_length=10000, description="Opis problemu lub potrzeby")
    solution_description: Optional[str] = Field(default="", max_length=10000, description="Istota proponowanego rozwiązania")
    target_group: Optional[str] = Field(default="Mieszkańcy Małopolski", max_length=4000, description="Odbiorcy rozwiązania")
    implementation_stage: str = Field(default="pomysl", description="Etap: pomysl, prototyp, pilotaz, wdrozenie")
    institution_name: Optional[str] = Field(default=None, max_length=200, description="Nazwa instytucji (np. Gmina, NGO)")
    applicant_type: str = Field(default="JST", description="Typ zgłaszającego: JST, NGO, CUS, Mieszkaniec")
    applicant_name: Optional[str] = None
    applicant_email: Optional[str] = None
    matched_innovation_id: Optional[str] = None


class SubmissionResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    title: str = "Fiszka innowacji"
    problem_description: str
    solution_description: Optional[str] = None
    target_group: Optional[str] = None
    implementation_stage: str = "pomysl"
    institution_name: Optional[str] = None
    applicant_type: str = "JST"
    applicant_name: Optional[str] = None
    applicant_email: Optional[str] = None
    matched_innovation_id: Optional[str] = None
    status: str = "nowe"
    official_response: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SubmissionStatusUpdate(BaseModel):
    status: str = Field(
        ...,
        description="Nowy status zgłoszenia: 'nowe', 'weryfikacja', 'zaakceptowane', 'odrzucone'",
    )
    official_response: Optional[str] = Field(
        default=None,
        description="Oficjalna informacja zwrotna od eksperta ROPS Kraków",
    )
    notes: Optional[str] = Field(
        default=None,
        description="Wewnętrzne notatki urzędowe ROPS",
    )


class SubmissionEventResponse(BaseModel):
    id: str
    submission_id: str
    old_status: Optional[str] = None
    new_status: str
    changed_by: str
    comment: Optional[str] = None
    webhook_dispatched: bool = False
    created_at: Optional[str] = None


class MessageCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="Treść wiadomości w wątku")
    sender_name: Optional[str] = Field(None, description="Imię lub rola nadawcy")


class MessageItemResponse(BaseModel):
    id: str
    submission_id: str
    sender_role: str = "applicant"  # 'applicant', 'rops_admin', 'mentor'
    sender_name: str
    message: str
    created_at: Optional[str] = None


class NotificationResult(BaseModel):
    success: bool
    email_sent: bool
    webhook_sent: bool
    message: str
    event_id: Optional[str] = None

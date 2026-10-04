from typing import Optional, Any, Dict, Set
from pydantic import BaseModel, Field, field_validator


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
    municipality_type: Optional[str] = Field(default=None, description="Typ samorządu: 'wiejska', 'miejsko-wiejska', 'miejska', 'powiat'")
    budget_range: Optional[str] = Field(default=None, description="Dostępny budżet na wdrożenie np. '< 20k PLN', '20-50k PLN', '> 50k PLN'")
    time_horizon: Optional[str] = Field(default=None, description="Horyzont czasowy wdrożenia np. '3 miesiące', '6 miesięcy', '12 miesięcy'")
    key_partners: Optional[list[str]] = Field(default=None, description="Lokalni partnerzy: np. ['CUS', 'KGW', 'OSP', 'Parafia', 'OPS']")


class AdaptResponse(BaseModel):
    innovation_title: str
    adaptation_plan: str
    estimated_budget_pln: Optional[str] = Field(default=None, description="Szacunkowy budżet wdrożenia w PLN")
    recommended_grants: Optional[list[str]] = Field(default=None, description="Rekomendowane źródła finansowania (FERS, PFRON, Fundusze Sołeckie, etc.)")
    key_kpis: Optional[list[str]] = Field(default=None, description="Kluczowe wskaźniki sukcesu wdrożenia (KPI)")
    is_ai_generated: bool = Field(default=True, description="Czy plan został wygenerowany przez generative AI czy szablon awaryjny")
    generation_source: str = Field(default="gemini", description="Źródło wygenerowania: 'gemini', 'openai' lub 'template_fallback'")
    disclaimer: Optional[str] = Field(default=None, description="Zastrzeżenie prawne i informacja o orientacyjnym charakterze naborów")


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
    sender_id: Optional[str] = None
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


# ==============================================================================
# MODELE TESTERA INNOWACJI SPOŁECZNYCH W GMINACH (21:00 - 23:30)
# ==============================================================================

class TestApplicationCreate(BaseModel):
    innovation_id: str = Field(..., description="ID innowacji społecznej z bazy ROPS")
    tester_type: str = Field(default="JST", description="Typ testera: 'JST', 'CUS', 'NGO', 'Mieszkaniec', 'Inna'")
    institution_name: str = Field(..., min_length=2, max_length=255, description="Nazwa instytucji testującej (np. 'Gmina Wieliczka', 'CUS Tarnów')")
    contact_person: str = Field(..., min_length=2, max_length=255, description="Imię i nazwisko koordynatora testu")
    contact_email: str = Field(..., description="Email kontaktowy")
    contact_phone: Optional[str] = Field(default=None, description="Telefon kontaktowy")
    testing_scope: str = Field(default="pilotaz_3m", description="Zakres testu: 'warsztaty', 'pilotaz_1m', 'pilotaz_3m', 'wdrozenie_pelne'")
    target_audience_count: int = Field(default=20, ge=1, description="Szacunkowa liczba uczestników/odbiorców")
    notes: Optional[str] = Field(default=None, description="Dodatkowe uwagi lub specyfika grupy docelowej")


ALLOWED_TESTING_STATUSES: Set[str] = {
    "nowe",
    "zaakceptowane",
    "w_trakcie",
    "zakonczone",
    "odrzucone",
}


class TestApplicationResponse(BaseModel):
    id: str
    innovation_id: str
    tester_type: str = "JST"
    institution_name: str
    contact_person: str
    contact_email: str
    contact_phone: Optional[str] = None
    testing_scope: str = "pilotaz_3m"
    target_audience_count: int = 20
    status: str = "nowe"
    notes: Optional[str] = None
    rops_notes: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class TestApplicationStatusUpdate(BaseModel):
    status: str = Field(
        ...,
        description="Nowy status: 'nowe', 'zaakceptowane', 'w_trakcie', 'zakonczone', 'odrzucone'",
    )
    notes: Optional[str] = Field(
        default=None,
        description="Notatka urzędowa ROPS (dla wstecznej kompatybilności)",
    )
    rops_notes: Optional[str] = Field(
        default=None,
        description="Dedykowana notatka urzędowa ROPS Kraków",
    )

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if cleaned == "nowa":
            cleaned = "nowe"
        if cleaned not in ALLOWED_TESTING_STATUSES:
            raise ValueError(
                f"Niedozwolony status: '{v}'. Dozwolone wartości to: {sorted(list(ALLOWED_TESTING_STATUSES))}."
            )
        return cleaned


class TestFeedbackCreate(BaseModel):
    innovation_id: str = Field(..., description="ID innowacji, której dotyczy ocena")
    application_id: Optional[str] = Field(default=None, description="Opcjonalny ID powiązanego zgłoszenia testowego")
    rating_usability: int = Field(..., ge=1, le=5, description="Łatwość wdrożenia (skala 1-5)")
    rating_effectiveness: int = Field(..., ge=1, le=5, description="Skuteczność dla odbiorców (skala 1-5)")
    rating_accessibility: int = Field(..., ge=1, le=5, description="Dostępność WCAG / OzN / seniorzy (skala 1-5)")
    pros: Optional[str] = Field(default=None, description="Mocne strony i zalety rozwiązania")
    cons_and_barriers: Optional[str] = Field(default=None, description="Bariery i trudności wdrożeniowe")
    suggested_improvements: Optional[str] = Field(default=None, description="Rekomendacje ulepszeń dla ROPS i innych gmin")
    would_recommend: bool = Field(default=True, description="Czy gmina poleca to rozwiązanie innym?")
    author_name: str = Field(..., min_length=2, max_length=255, description="Podpis / stanowisko autora opinii")


class TestFeedbackResponse(BaseModel):
    id: str
    innovation_id: str
    application_id: Optional[str] = None
    rating_usability: int
    rating_effectiveness: int
    rating_accessibility: int
    average_score: float
    pros: Optional[str] = None
    cons_and_barriers: Optional[str] = None
    suggested_improvements: Optional[str] = None
    would_recommend: bool = True
    author_name: str
    created_at: Optional[str] = None


class InnovationFeedbackSummary(BaseModel):
    innovation_id: str
    total_reviews: int
    avg_usability: float
    avg_effectiveness: float
    avg_accessibility: float
    overall_rating: float
    recommendation_percentage: float
    recent_reviews: list[TestFeedbackResponse] = Field(default_factory=list)


class TestingGlobalSummary(BaseModel):
    total_applications: int
    active_pilots: int
    completed_pilots: int
    total_feedbacks: int
    overall_avg_rating: float
    top_rated_innovations: list[Dict[str, Any]] = Field(default_factory=list)
    applications_by_status: Dict[str, int] = Field(default_factory=dict)


# ==============================================================================
# MODELE ZARZĄDZANIA WIEDZĄ (PUNKT VI: PANEL ADMINISTRATORA ROPS)
# ==============================================================================

class InnovationCreate(BaseModel):
    id: Optional[str] = Field(None, description="Identyfikator innowacji (np. 'inv_07'). Jeśli brak, generowany automatycznie.")
    title: str = Field(..., min_length=3, max_length=200, description="Nazwa innowacji społecznej")
    description: str = Field(..., min_length=10, max_length=10000, description="Pełny opis innowacji")
    target_group: str = Field(..., min_length=3, max_length=4000, description="Grupa docelowa (odbiorcy)")
    category: str = Field(default="Inne", description="Kategoria (np. Seniorzy, Dostępność, Zdrowie psychiczne)")
    why_relevant: Optional[str] = Field(None, description="Uzasadnienie / dlaczego warto")
    source_url: Optional[str] = Field(None, description="Zweryfikowane źródło / link do strony ROPS")
    status: str = Field(default="sprawdzone", description="Status wiedzy: 'nowa', 'weryfikacja', 'sprawdzone'")
    author_or_institution: Optional[str] = Field(default="ROPS Kraków", description="Instytucja / autor innowacji")


class InnovationUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = Field(None, min_length=10)
    target_group: Optional[str] = Field(None, min_length=3)
    category: Optional[str] = None
    why_relevant: Optional[str] = None
    source_url: Optional[str] = None
    status: Optional[str] = None
    author_or_institution: Optional[str] = None


# ==============================================================================
# MODELE ZBIERANIA POTRZEB I AGREGACJI DLA ROPS (PUNKT 7briefu)
# ==============================================================================

class CommunityNeedCreate(BaseModel):
    institution_name: str = Field(..., min_length=2, max_length=250, description="Nazwa instytucji / samorządu / organizacji")
    institution_type: str = Field(default="JST", description="Typ jednostki: 'JST', 'CUS', 'OPS', 'NGO', 'Mieszkaniec', 'Inna'")
    powiat: str = Field(..., min_length=2, max_length=100, description="Powiat w Małopolsce (np. 'tarnowski', 'krakowski', 'nowosądecki')")
    gmina: Optional[str] = Field(default=None, max_length=100, description="Gmina (opcjonalnie)")
    contact_email: Optional[str] = Field(default=None, max_length=150, description="Adres e-mail osoby do kontaktu")
    contact_phone: Optional[str] = Field(default=None, max_length=50, description="Telefon kontaktowy")
    category: str = Field(..., min_length=2, max_length=100, description="Kategoria wyzwania (np. Seniorzy, Zdrowie psychiczne, Dostępność)")
    target_group: str = Field(default="Mieszkańcy", min_length=2, max_length=250, description="Odbiorcy / grupa docelowa wyzwania")
    problem_summary: str = Field(..., min_length=3, max_length=250, description="Krótka teza / tytuł problemu")
    detailed_description: str = Field(..., min_length=10, max_length=5000, description="Szczegółowy opis luki w usługach społecznych")
    estimated_affected_count: Optional[int] = Field(default=0, ge=0, le=1000000, description="Szacunkowa liczba osób dotkniętych problemem")
    urgency_level: str = Field(default="sredni", description="Poziom pilności: 'niski', 'sredni', 'wysoki', 'krytyczny'")
    hp_website: Optional[str] = Field(default=None, description="Pole honeypot przeciw spamowi (musi być puste)")


class CommunityNeedResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None
    institution_name: str
    institution_type: str
    powiat: str
    gmina: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    category: str
    target_group: str
    problem_summary: str
    detailed_description: str
    estimated_affected_count: int = 0
    urgency_level: str = "sredni"
    status: str = "nowe"
    rops_internal_notes: Optional[str] = None
    reviewed_at: Optional[str] = None


class CommunityNeedStatusUpdate(BaseModel):
    status: str = Field(..., description="Nowy status: 'nowe', 'analizowane', 'uwzglednione_w_naborze', 'odrzucone', 'zaadresowane'")
    rops_internal_notes: Optional[str] = Field(None, max_length=5000, description="Wewnętrzna notatka analityka ROPS")


class CategoryAggregate(BaseModel):
    category: str
    count: int
    percentage: float


class PowiatAggregate(BaseModel):
    powiat: str
    count: int
    percentage: float


class HotspotRecommendation(BaseModel):
    theme: str
    category: str
    powiat: str
    reported_count: int
    urgency_level: str
    recommended_action: str


class NeedsSummaryResponse(BaseModel):
    total_needs_reported: int
    filtered_period_days: Optional[int] = None
    needs_by_status: Dict[str, int]
    needs_by_urgency: Dict[str, int]
    top_categories: list[CategoryAggregate]
    top_powiats: list[PowiatAggregate]
    emerging_hotspots: list[HotspotRecommendation]


class TrendItem(BaseModel):
    name: str
    current_count: int
    previous_count: int
    growth_percentage: float
    trend: str  # 'wzrostowy', 'spadkowy', 'stabilny'


class NeedsTrendsResponse(BaseModel):
    period_days: int
    current_period: Dict[str, Any]
    previous_period: Dict[str, Any]
    total_growth_percentage: float
    category_trends: list[TrendItem]
    powiat_trends: list[TrendItem]
    emerging_hotspots: list[HotspotRecommendation]


# ==============================================================================
# MODELE GENERATORA WNIOSKÓW GRANTOWYCH (ZAŁĄCZNIK NR 3 ROPS KRAKÓW)
# ==============================================================================

class GrantCallResponse(BaseModel):
    id: str
    name: str
    template_name: str
    template_version: str
    status: str  # 'otwarty', 'zamkniety', 'demonstracyjny'
    description: Optional[str] = None
    max_grant_amount: float
    max_prep_months: int
    max_test_months: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class GrantCallStatusUpdate(BaseModel):
    status: str = Field(..., description="Nowy status naboru: 'otwarty', 'zamkniety', 'demonstracyjny'")


class ActionPlanItem(BaseModel):
    action_name: str
    schedule: str
    cost: float = Field(ge=0.0, description="Koszt działania w PLN")
    phase: Optional[str] = None


class ActionPlan(BaseModel):
    prep_period: list[ActionPlanItem] = Field(default_factory=list)
    test_period: list[ActionPlanItem] = Field(default_factory=list)


class GrantApplicationCreate(BaseModel):
    call_id: str = Field(..., description="ID naboru")
    title: Optional[str] = Field(default="", max_length=255)
    applicant_type: str = Field(default="osoba_fizyczna", description="'osoba_fizyczna', 'podmiot', 'grupa_nieformalna'")
    applicant_data: Optional[Dict[str, Any]] = Field(default_factory=dict)
    innovation_description: Optional[str] = ""
    innovativeness: Optional[str] = ""
    problem_diagnosis: Optional[str] = ""
    target_group_description: Optional[str] = ""
    expected_change: Optional[str] = ""
    future_vision: Optional[str] = ""
    action_plan: Optional[Dict[str, Any]] = Field(default_factory=lambda: {"prep_period": [], "test_period": []})
    grant_amount: float = Field(default=0.0, ge=0.0)
    project_team: Optional[str] = ""
    declarations: Optional[Dict[str, Any]] = Field(default_factory=dict)


class GrantApplicationUpdate(BaseModel):
    title: Optional[str] = None
    applicant_type: Optional[str] = None
    applicant_data: Optional[Dict[str, Any]] = None
    innovation_description: Optional[str] = None
    innovativeness: Optional[str] = None
    problem_diagnosis: Optional[str] = None
    target_group_description: Optional[str] = None
    expected_change: Optional[str] = None
    future_vision: Optional[str] = None
    action_plan: Optional[Dict[str, Any]] = None
    grant_amount: Optional[float] = None
    project_team: Optional[str] = None
    declarations: Optional[Dict[str, Any]] = None


class GrantApplicationResponse(BaseModel):
    id: str
    call_id: str
    call_name: Optional[str] = None
    call_status: Optional[str] = None
    user_id: str
    status: str  # 'roboczy', 'zlozony', 'w_ocenie', 'zaakceptowany', 'odrzucony'
    applicant_type: str
    title: str
    applicant_data: Dict[str, Any]
    innovation_description: str
    innovativeness: str
    problem_diagnosis: str
    target_group_description: str
    expected_change: str
    future_vision: str
    action_plan: Dict[str, Any]
    grant_amount: float
    total_costs_calculated: float = 0.0
    is_budget_balanced: bool = True
    project_team: str
    declarations: Dict[str, Any]
    submitted_at: Optional[str] = None
    rops_notes: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class GrantApplicationStatusUpdate(BaseModel):
    status: str = Field(..., description="Nowy status: 'w_ocenie', 'zaakceptowany', 'odrzucony'")
    rops_notes: Optional[str] = Field(default=None, description="Notatka urzędowa ROPS")


class GrantApplicationExportResponse(BaseModel):
    application_id: str
    call_name: str
    template_name: str
    template_version: str
    status: str
    submitted_at: Optional[str] = None
    structured_data: Dict[str, Any]
    formatted_document_text: str




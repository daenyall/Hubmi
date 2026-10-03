from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import require_rops_admin, UserSession
from app.models.schemas import (
    TestApplicationCreate,
    TestApplicationResponse,
    TestApplicationStatusUpdate,
    TestFeedbackCreate,
    TestFeedbackResponse,
    InnovationFeedbackSummary,
    TestingGlobalSummary,
)
from app.services.testing import (
    apply_for_testing as service_apply,
    list_applications as service_list_apps,
    get_application_by_id as service_get_app,
    update_application_status as service_update_status,
    submit_feedback as service_submit_feedback,
    get_innovation_feedback_summary as service_get_feedback_summary,
    get_testing_global_summary as service_get_global_summary,
)

router = APIRouter(prefix="/testing", tags=["Innovation Testing"])


@router.post(
    "/apply",
    response_model=TestApplicationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def apply_to_test_innovation(application: TestApplicationCreate):
    """
    Punkt IV Wyzwania ROPS Kraków:
    Zgłoszenie gminy, CUS, NGO lub innej instytucji do przetestowania
    wybranej innowacji społecznej w warunkach lokalnych (warsztaty, pilotaż 1-3 msc).
    """
    if not application.institution_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Podaj nazwę instytucji zgłaszającej się do testowania.",
        )
    if not application.contact_email.strip() or "@" not in application.contact_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Podaj poprawny adres e-mail do kontaktu.",
        )

    return service_apply(application)


@router.get("/applications", response_model=List[TestApplicationResponse])
async def list_test_applications(
    innovation_id: Optional[str] = Query(None, description="Filtruj po ID innowacji"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filtruj po statusie ('nowe', 'zaakceptowane', 'w_trakcie', 'zakonczone')"),
    limit: int = Query(50, ge=1, le=100),
):
    """
    Pobiera listę zgłoszeń testowych z możliwością filtrowania po innowacji lub statusie.
    """
    return service_list_apps(
        innovation_id=innovation_id,
        status=status_filter,
        limit=limit,
    )


@router.get("/applications/{application_id}", response_model=TestApplicationResponse)
async def get_test_application(application_id: str):
    """
    Pobiera szczegóły konkretnego zgłoszenia testowego.
    """
    app = service_get_app(application_id)
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Zgłoszenie testowe o ID '{application_id}' nie zostało odnalezione.",
        )
    return app


@router.patch("/applications/{application_id}/status", response_model=TestApplicationResponse)
async def update_application_status(
    application_id: str,
    update_data: TestApplicationStatusUpdate,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Aktualizuje status pilotażu / testu innowacji w gminie.
    Wymaga uprawnień Administratora ROPS Kraków.
    """
    updated = service_update_status(application_id, update_data)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Zgłoszenie testowe o ID '{application_id}' nie zostało odnalezione.",
        )
    return updated


@router.post(
    "/feedback",
    response_model=TestFeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_innovation_feedback(feedback: TestFeedbackCreate):
    """
    Formularz ewaluacji testu innowacji społecznej w gminie:
    oceny w skali 1-5 (łatwość wdrożenia, skuteczność, dostępność WCAG/OzN),
    mocne strony, bariery, rekomendowane ulepszenia i wskaźnik polecenia.
    """
    return service_submit_feedback(feedback)


@router.get("/feedback/{innovation_id}", response_model=InnovationFeedbackSummary)
async def get_innovation_feedback_summary(innovation_id: str):
    """
    Zwraca zintegrowany raport ewaluacji i średnie oceny dla wybranej innowacji
    na bazie przeprowadzonych testów w małopolskich samorządach.
    """
    return service_get_feedback_summary(innovation_id)


@router.get("/summary", response_model=TestingGlobalSummary)
async def get_testing_global_summary():
    """
    Statystyki globalne modułu testowania ROPS Kraków:
    liczba zgłoszeń samorządów, aktywne i zakończone pilotaże, średnie oceny.
    """
    return service_get_global_summary()

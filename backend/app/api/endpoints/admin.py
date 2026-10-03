from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.security import require_rops_admin, UserSession
from app.db.supabase import get_supabase_client
from app.models.schemas import (
    SubmissionResponse,
    SubmissionStatusUpdate,
    SubmissionEventResponse,
    NotificationResult,
)
from app.services.notifications import notify_status_change, get_recent_events

router = APIRouter(prefix="/admin", tags=["Admin ROPS"])


class WebhookTestRequest(BaseModel):
    webhook_url: str
    sample_status: str = "zaakceptowane"


@router.get("/submissions", response_model=List[SubmissionResponse])
async def list_admin_submissions(
    status_filter: Optional[str] = Query(None, alias="status", description="Filtr statusu: nowe, weryfikacja, zaakceptowane, odrzucone"),
    applicant_type: Optional[str] = Query(None, description="Filtr typu: JST, NGO, CUS, Mieszkaniec"),
    search: Optional[str] = Query(None, description="Wyszukiwanie w tytule lub opisie"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Pobiera listę wszystkich zgłoszeń z bazy dla Administratora ROPS Kraków.
    Wymaga uprawnień administratora (token JWT lub X-Admin-Role: rops_admin).
    """
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    try:
        query = supabase.table("submissions").select("*")
        if status_filter:
            query = query.eq("status", status_filter)
        if applicant_type:
            query = query.eq("applicant_type", applicant_type)

        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        res = query.execute()
        rows = res.data or []

        if search and search.strip():
            s_lower = search.strip().lower()
            rows = [
                r for r in rows
                if s_lower in str(r.get("title", "")).lower()
                or s_lower in str(r.get("problem_description", "")).lower()
                or s_lower in str(r.get("institution_name", "")).lower()
            ]

        # Normalizacja pól w razie braku kolumn
        results = []
        for r in rows:
            results.append(
                SubmissionResponse(
                    id=str(r.get("id")),
                    user_id=r.get("user_id"),
                    title=r.get("title") or "Fiszka innowacji społecznej",
                    problem_description=r.get("problem_description", ""),
                    solution_description=r.get("solution_description"),
                    target_group=r.get("target_group"),
                    implementation_stage=r.get("implementation_stage") or "pomysl",
                    institution_name=r.get("institution_name"),
                    applicant_type=r.get("applicant_type", "JST"),
                    applicant_name=r.get("applicant_name"),
                    applicant_email=r.get("applicant_email"),
                    matched_innovation_id=r.get("matched_innovation_id"),
                    status=r.get("status", "nowe"),
                    official_response=r.get("official_response"),
                    notes=r.get("notes"),
                    created_at=r.get("created_at"),
                    updated_at=r.get("updated_at"),
                )
            )
        return results

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Błąd podczas pobierania zgłoszeń: {str(e)}",
        )


@router.get("/submissions/{submission_id}", response_model=SubmissionResponse)
async def get_admin_submission_detail(
    submission_id: str,
    admin: UserSession = Depends(require_rops_admin),
):
    """Pobiera szczegóły pojedynczego zgłoszenia dla Administratora ROPS."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    try:
        res = supabase.table("submissions").select("*").eq("id", submission_id).single().execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Nie znaleziono zgłoszenia o ID: {submission_id}",
            )
        r = res.data
        return SubmissionResponse(
            id=str(r.get("id")),
            user_id=r.get("user_id"),
            title=r.get("title") or "Fiszka innowacji",
            problem_description=r.get("problem_description", ""),
            solution_description=r.get("solution_description"),
            target_group=r.get("target_group"),
            implementation_stage=r.get("implementation_stage") or "pomysl",
            institution_name=r.get("institution_name"),
            applicant_type=r.get("applicant_type", "JST"),
            applicant_name=r.get("applicant_name"),
            applicant_email=r.get("applicant_email"),
            matched_innovation_id=r.get("matched_innovation_id"),
            status=r.get("status", "nowe"),
            official_response=r.get("official_response"),
            notes=r.get("notes"),
            created_at=r.get("created_at"),
            updated_at=r.get("updated_at"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Błąd odczytu zgłoszenia: {str(e)}",
        )


@router.patch("/submissions/{submission_id}/status", response_model=SubmissionResponse)
async def update_submission_status(
    submission_id: str,
    payload: SubmissionStatusUpdate,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Aktualizuje status zgłoszenia przez Administratora ROPS Kraków.
    Zapisuje oficjalną odpowiedź, notatki, rejestruje zdarzenie w audit logu
    i wysyła powiadomienie do wnioskodawcy.
    """
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    try:
        # 1. Pobranie aktualnego rekordu
        current_res = supabase.table("submissions").select("*").eq("id", submission_id).execute()
        if not current_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Zgłoszenie o ID: {submission_id} nie istnieje.",
            )

        current_item = current_res.data[0]
        old_status = current_item.get("status", "nowe")
        new_status = payload.status

        # 2. Przygotowanie aktualizacji
        update_data = {
            "status": new_status,
        }
        if payload.official_response is not None:
            update_data["official_response"] = payload.official_response
        if payload.notes is not None:
            update_data["notes"] = payload.notes

        # 3. Zapis w Supabase
        update_res = supabase.table("submissions").update(update_data).eq("id", submission_id).execute()
        if not update_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Nie udało się zapisać zmian w bazie danych.",
            )

        updated_row = update_res.data[0]

        # 4. Dyspozycja powiadomień i log zdarzenia
        notify_status_change(
            submission_id=submission_id,
            old_status=old_status,
            new_status=new_status,
            title=updated_row.get("title") or current_item.get("title") or "Fiszka innowacji",
            applicant_email=current_item.get("applicant_email"),
            official_response=payload.official_response,
            changed_by=admin.email or "rops_admin",
        )

        return SubmissionResponse(
            id=str(updated_row.get("id")),
            user_id=updated_row.get("user_id"),
            title=updated_row.get("title") or "Fiszka innowacji",
            problem_description=updated_row.get("problem_description", ""),
            solution_description=updated_row.get("solution_description"),
            target_group=updated_row.get("target_group"),
            implementation_stage=updated_row.get("implementation_stage") or "pomysl",
            institution_name=updated_row.get("institution_name"),
            applicant_type=updated_row.get("applicant_type", "JST"),
            applicant_name=updated_row.get("applicant_name"),
            applicant_email=updated_row.get("applicant_email"),
            matched_innovation_id=updated_row.get("matched_innovation_id"),
            status=updated_row.get("status", new_status),
            official_response=updated_row.get("official_response"),
            notes=updated_row.get("notes"),
            created_at=updated_row.get("created_at"),
            updated_at=updated_row.get("updated_at"),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Błąd aktualizacji statusu: {str(e)}",
        )


@router.get("/events", response_model=List[SubmissionEventResponse])
async def list_audit_events(
    limit: int = Query(50, ge=1, le=100),
    admin: UserSession = Depends(require_rops_admin),
):
    """Pobiera historię zdarzeń audytowych zmian statusu dla panelu administratora."""
    events = get_recent_events(limit=limit)
    return [
        SubmissionEventResponse(
            id=str(e.get("id")),
            submission_id=str(e.get("submission_id")),
            old_status=e.get("old_status"),
            new_status=e.get("new_status", "nowe"),
            changed_by=e.get("changed_by", "rops_admin"),
            comment=e.get("comment"),
            webhook_dispatched=bool(e.get("webhook_dispatched", False)),
            created_at=e.get("created_at"),
        )
        for e in events
    ]


@router.post("/webhooks/test", response_model=NotificationResult)
async def test_webhook_dispatch(
    body: WebhookTestRequest,
    admin: UserSession = Depends(require_rops_admin),
):
    """Testuje wysłanie webhooka do wskazanego URL."""
    result = notify_status_change(
        submission_id="test-submission-001",
        old_status="nowe",
        new_status=body.sample_status,
        title="Testowa innowacja ROPS",
        applicant_email="test@jst.pl",
        official_response="Wiadomość testowa z panelu ROPS Kraków.",
        changed_by=admin.email or "rops_admin",
        webhook_url=body.webhook_url,
    )
    return result

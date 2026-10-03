import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import get_current_user, UserSession
from app.db.supabase import get_supabase_client
from app.models.schemas import (
    SubmissionCreate,
    SubmissionResponse,
    MessageCreate,
    MessageItemResponse,
)

router = APIRouter(prefix="/submissions", tags=["Submissions"])


@router.get("/my", response_model=List[SubmissionResponse])
async def get_my_submissions(
    user: UserSession = Depends(get_current_user),
):
    """
    Pobiera listę zgłoszeń należących do aktualnie zalogowanego użytkownika (autor).
    Jeśli użytkownik to Administrator ROPS, zwraca wszystkie zgłoszenia.
    """
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    try:
        query = supabase.table("submissions").select("*")
        if not user.is_admin:
            if not user.user_id or user.user_id == "anonymous_applicant":
                return []
            query = query.eq("user_id", user.user_id)

        res = query.order("created_at", desc=True).execute()
        rows = res.data or []

        return [
            SubmissionResponse(
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
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Błąd odczytu zgłoszeń: {str(e)}",
        )


@router.post("", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_submission(
    payload: SubmissionCreate,
    user: UserSession = Depends(get_current_user),
):
    """Tworzy nowe zgłoszenie / fiszkę innowacji w bazie Supabase."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    sub_id = str(uuid.uuid4())
    row_data = {
        "id": sub_id,
        "title": payload.title.strip(),
        "problem_description": payload.problem_description.strip(),
        "solution_description": payload.solution_description.strip() if payload.solution_description else "",
        "target_group": payload.target_group.strip() if payload.target_group else "Wszyscy",
        "implementation_stage": payload.implementation_stage,
        "institution_name": payload.institution_name.strip() if payload.institution_name else None,
        "applicant_type": payload.applicant_type,
        "applicant_name": payload.applicant_name,
        "applicant_email": payload.applicant_email,
        "matched_innovation_id": payload.matched_innovation_id,
        "status": "nowe",
    }
    if user.user_id and user.user_id != "anonymous_applicant":
        row_data["user_id"] = user.user_id

    try:
        res = supabase.table("submissions").insert(row_data).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Błąd podczas tworzenia fiszki w bazie.",
            )
        inserted = res.data[0]
        return SubmissionResponse(
            id=str(inserted.get("id")),
            user_id=inserted.get("user_id"),
            title=inserted.get("title") or payload.title,
            problem_description=inserted.get("problem_description", payload.problem_description),
            solution_description=inserted.get("solution_description"),
            target_group=inserted.get("target_group"),
            implementation_stage=inserted.get("implementation_stage") or "pomysl",
            institution_name=inserted.get("institution_name"),
            applicant_type=inserted.get("applicant_type", "JST"),
            applicant_name=inserted.get("applicant_name"),
            applicant_email=inserted.get("applicant_email"),
            matched_innovation_id=inserted.get("matched_innovation_id"),
            status=inserted.get("status", "nowe"),
            official_response=inserted.get("official_response"),
            notes=inserted.get("notes"),
            created_at=inserted.get("created_at"),
            updated_at=inserted.get("updated_at"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Błąd zapisu zgłoszenia: {str(e)}",
        )


@router.get("/{submission_id}/messages", response_model=List[MessageItemResponse])
async def get_submission_messages(
    submission_id: str,
    user: UserSession = Depends(get_current_user),
):
    """
    Pobiera wątek dyskusji/czatu powiązany z daną fiszką.
    Dostęp ma wyłącznie autor danego zgłoszenia lub Administrator ROPS.
    """
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    # Weryfikacja uprawnień do tego zgłoszenia
    sub_res = supabase.table("submissions").select("id, user_id").eq("id", submission_id).execute()
    if not sub_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Zgłoszenie nie zostało odnalezione.",
        )
    sub = sub_res.data[0]

    # Sprawdzenie czy użytkownik to autor lub admin
    if not user.is_admin:
        if not user.user_id or user.user_id != sub.get("user_id"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Brak dostępu do wątku dyskusji tego zgłoszenia.",
            )

    try:
        msg_res = (
            supabase.table("submission_messages")
            .select("*")
            .eq("submission_id", submission_id)
            .order("created_at", desc=False)
            .execute()
        )
        rows = msg_res.data or []
        return [
            MessageItemResponse(
                id=str(m.get("id")),
                submission_id=str(m.get("submission_id")),
                sender_role=m.get("sender_role", "applicant"),
                sender_name=m.get("sender_name", "Użytkownik"),
                message=m.get("message", ""),
                created_at=m.get("created_at"),
            )
            for m in rows
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Błąd odczytu wiadomości: {str(e)}",
        )


@router.post("/{submission_id}/messages", response_model=MessageItemResponse, status_code=status.HTTP_201_CREATED)
async def post_submission_message(
    submission_id: str,
    payload: MessageCreate,
    user: UserSession = Depends(get_current_user),
):
    """
    Dodaje nową wiadomość do wątku konsultacji fiszki z ROPS Kraków.
    Automatycznie przypisuje rolę nadawcy: 'rops_admin' lub 'applicant'.
    """
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    # Weryfikacja powiązanego zgłoszenia
    sub_res = supabase.table("submissions").select("id, user_id").eq("id", submission_id).execute()
    if not sub_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Zgłoszenie nie zostało odnalezione.",
        )
    sub = sub_res.data[0]

    # Sprawdzenie uprawnień
    if not user.is_admin:
        if not user.user_id or user.user_id != sub.get("user_id"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Brak uprawnień do komentowania tego zgłoszenia.",
            )

    sender_role = "rops_admin" if user.is_admin else "applicant"
    sender_name = payload.sender_name or ("Ekspert ROPS Kraków" if user.is_admin else "Autor zgłoszenia")

    msg_id = str(uuid.uuid4())
    row = {
        "id": msg_id,
        "submission_id": submission_id,
        "sender_role": sender_role,
        "sender_name": sender_name,
        "message": payload.message.strip(),
    }

    try:
        res = supabase.table("submission_messages").insert(row).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Błąd zapisu wiadomości w bazie.",
            )
        inserted = res.data[0]
        return MessageItemResponse(
            id=str(inserted.get("id")),
            submission_id=str(inserted.get("submission_id")),
            sender_role=inserted.get("sender_role", sender_role),
            sender_name=inserted.get("sender_name", sender_name),
            message=inserted.get("message", payload.message),
            created_at=inserted.get("created_at"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Błąd zapisu wiadomości: {str(e)}",
        )

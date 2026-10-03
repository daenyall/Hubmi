import logging
import uuid
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import get_current_user, UserSession
from app.db.supabase import get_supabase_client
from app.models.schemas import (
    SubmissionCreate,
    SubmissionResponse,
    MessageCreate,
    MessageItemResponse,
)
from app.utils.helpers import to_dict_list, to_dict
from app.utils.sanitize import sanitize_text, sanitize_optional, is_valid_uuid, safe_error_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/submissions", tags=["Submissions"])


@router.get("/my", response_model=List[SubmissionResponse])
async def get_my_submissions(
    user: UserSession = Depends(get_current_user),
):
    """
    Pobiera listę zgłoszeń należących do aktualnie zalogowanego użytkownika (autor).
    Jeśli użytkownik to Administrator ROPS, zwraca wszystkie zgłoszenia.
    Wymaga zalogowanego użytkownika (nie-anonimowego).
    """
    if not user.user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wymagane jest zalogowanie, aby odczytać swoje zgłoszenia.",
        )

    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    try:
        query = supabase.table("submissions").select("*")
        if not user.is_admin:
            query = query.eq("user_id", user.user_id)

        res = query.order("created_at", desc=True).execute()
        rows = to_dict_list(res.data)

        return [
            SubmissionResponse(
                id=str(r.get("id", "")),
                user_id=r.get("user_id"),
                title=str(r.get("title") or "Fiszka innowacji"),
                problem_description=str(r.get("problem_description", "")),
                solution_description=str(r.get("solution_description")) if r.get("solution_description") is not None else None,
                target_group=str(r.get("target_group")) if r.get("target_group") is not None else None,
                implementation_stage=str(r.get("implementation_stage") or "pomysl"),
                institution_name=str(r.get("institution_name")) if r.get("institution_name") is not None else None,
                applicant_type=str(r.get("applicant_type", "JST")),
                applicant_name=str(r.get("applicant_name")) if r.get("applicant_name") is not None else None,
                applicant_email=str(r.get("applicant_email")) if r.get("applicant_email") is not None else None,
                matched_innovation_id=str(r.get("matched_innovation_id")) if r.get("matched_innovation_id") is not None else None,
                status=str(r.get("status", "nowe")),
                official_response=str(r.get("official_response")) if r.get("official_response") is not None else None,
                notes=str(r.get("notes")) if r.get("notes") is not None else None,
                created_at=str(r.get("created_at")) if r.get("created_at") is not None else None,
                updated_at=str(r.get("updated_at")) if r.get("updated_at") is not None else None,
            )
            for r in rows
        ]
    except Exception as e:
        logger.error("Błąd odczytu zgłoszeń: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_error_message("odczyt zgłoszeń"),
        )


@router.post("", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_submission(
    payload: SubmissionCreate,
    user: UserSession = Depends(get_current_user),
):
    """Tworzy nowe zgłoszenie / fiszkę innowacji w bazie Supabase."""
    if not user.user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wymagane jest zalogowanie, aby złożyć fiszkę innowacji.",
        )

    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    sub_id = str(uuid.uuid4())
    row_data: Dict[str, Any] = {
        "id": sub_id,
        "user_id": user.user_id,
        "title": sanitize_text(payload.title.strip()),
        "problem_description": sanitize_text(payload.problem_description.strip()),
        "solution_description": sanitize_text(payload.solution_description.strip()) if payload.solution_description else "",
        "target_group": sanitize_text(payload.target_group.strip()) if payload.target_group else "Wszyscy",
        "implementation_stage": payload.implementation_stage,
        "institution_name": sanitize_optional(payload.institution_name),
        "applicant_type": payload.applicant_type,
        "applicant_name": sanitize_optional(payload.applicant_name),
        "applicant_email": payload.applicant_email,
        "matched_innovation_id": payload.matched_innovation_id,
        "status": "nowe",
        "official_response": None,
        "notes": None,
    }

    try:
        res = supabase.table("submissions").insert(row_data).execute()
        inserted_list = to_dict_list(res.data)
        if not inserted_list:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Błąd podczas tworzenia fiszki w bazie.",
            )
        inserted = inserted_list[0]
        return SubmissionResponse(
            id=str(inserted.get("id", "")),
            user_id=inserted.get("user_id"),
            title=str(inserted.get("title") or payload.title),
            problem_description=str(inserted.get("problem_description", payload.problem_description)),
            solution_description=str(inserted.get("solution_description")) if inserted.get("solution_description") is not None else None,
            target_group=str(inserted.get("target_group")) if inserted.get("target_group") is not None else None,
            implementation_stage=str(inserted.get("implementation_stage") or "pomysl"),
            institution_name=str(inserted.get("institution_name")) if inserted.get("institution_name") is not None else None,
            applicant_type=str(inserted.get("applicant_type", "JST")),
            applicant_name=str(inserted.get("applicant_name")) if inserted.get("applicant_name") is not None else None,
            applicant_email=str(inserted.get("applicant_email")) if inserted.get("applicant_email") is not None else None,
            matched_innovation_id=str(inserted.get("matched_innovation_id")) if inserted.get("matched_innovation_id") is not None else None,
            status=str(inserted.get("status", "nowe")),
            official_response=str(inserted.get("official_response")) if inserted.get("official_response") is not None else None,
            notes=str(inserted.get("notes")) if inserted.get("notes") is not None else None,
            created_at=str(inserted.get("created_at")) if inserted.get("created_at") is not None else None,
            updated_at=str(inserted.get("updated_at")) if inserted.get("updated_at") is not None else None,
        )
    except Exception as e:
        logger.error("Błąd zapisu zgłoszenia: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_error_message("zapis zgłoszenia"),
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

    # Weryfikacja zalogowania
    if not user.user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wymagane jest zalogowanie, aby odczytać wątek dyskusji.",
        )

    # Weryfikacja uprawnień do tego zgłoszenia
    sub_res = supabase.table("submissions").select("id, user_id").eq("id", submission_id).execute()
    sub_list = to_dict_list(sub_res.data)
    if not sub_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Zgłoszenie nie zostało odnalezione.",
        )
    sub = sub_list[0]

    # Sprawdzenie czy użytkownik to autor lub admin
    if not user.is_admin:
        if user.user_id != sub.get("user_id"):
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
        rows = to_dict_list(msg_res.data)
        return [
            MessageItemResponse(
                id=str(m.get("id", "")),
                submission_id=str(m.get("submission_id", "")),
                sender_id=str(m.get("sender_id")) if m.get("sender_id") is not None else None,
                sender_role=str(m.get("sender_role", "applicant")),
                sender_name=str(m.get("sender_name", "Użytkownik")),
                message=str(m.get("message", "")),
                created_at=str(m.get("created_at")) if m.get("created_at") is not None else None,
            )
            for m in rows
        ]
    except Exception as e:
        logger.error("Błąd odczytu wiadomości: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_error_message("odczyt wiadomości"),
        )


@router.post("/{submission_id}/messages", response_model=MessageItemResponse, status_code=status.HTTP_201_CREATED)
async def post_submission_message(
    submission_id: str,
    payload: MessageCreate,
    user: UserSession = Depends(get_current_user),
):
    """
    Dodaje nową wiadomość do wątku konsultacji fiszki z ROPS Kraków.
    Automatycznie przypisuje rolę nadawcy: 'rops_admin' lub 'applicant' oraz serwerowe sender_name.
    """
    if not user.user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wymagane jest zalogowanie, aby wysłać wiadomość.",
        )

    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    # Weryfikacja powiązanego zgłoszenia
    sub_res = supabase.table("submissions").select("id, user_id").eq("id", submission_id).execute()
    sub_list = to_dict_list(sub_res.data)
    if not sub_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Zgłoszenie nie zostało odnalezione.",
        )
    sub = sub_list[0]

    # Sprawdzenie uprawnień
    if not user.is_admin:
        if user.user_id != sub.get("user_id"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Brak uprawnień do komentowania tego zgłoszenia.",
            )

    sender_role = "rops_admin" if user.is_admin else "applicant"
    # Serwerowe ustalanie sender_name: zignoruj jakąkolwiek nazwę podaną przez klienta
    sender_name = user.email or ("Ekspert ROPS Kraków" if user.is_admin else "Wnioskodawca")
    sender_id = user.user_id

    msg_id = str(uuid.uuid4())
    row: Dict[str, Any] = {
        "id": msg_id,
        "submission_id": submission_id,
        "sender_id": sender_id,
        "sender_role": sender_role,
        "sender_name": sender_name,
        "message": sanitize_text(payload.message.strip()),
    }
    if sender_id:
        row["sender_id"] = sender_id

    try:
        res = supabase.table("submission_messages").insert(row).execute()
        inserted_list = to_dict_list(res.data)
        if not inserted_list:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Błąd zapisu wiadomości w bazie.",
            )
        inserted = inserted_list[0]
        return MessageItemResponse(
            id=str(inserted.get("id", "")),
            submission_id=str(inserted.get("submission_id", "")),
            sender_id=str(inserted.get("sender_id", sender_id or "")) if (inserted.get("sender_id") or sender_id) else None,
            sender_role=str(inserted.get("sender_role", sender_role)),
            sender_name=str(inserted.get("sender_name", sender_name)),
            message=str(inserted.get("message", payload.message)),
            created_at=str(inserted.get("created_at")) if inserted.get("created_at") is not None else None,
        )
    except Exception as e:
        logger.error("Błąd zapisu wiadomości: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_error_message("zapis wiadomości"),
        )

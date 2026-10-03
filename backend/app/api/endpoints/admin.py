import uuid
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.security import require_rops_admin, UserSession
from app.db.supabase import get_supabase_client
from app.models.schemas import (
    SubmissionResponse,
    SubmissionStatusUpdate,
    SubmissionEventResponse,
    NotificationResult,
    InnovationCreate,
    InnovationUpdate,
    MatchItem,
)
from app.services.ai import create_embedding
from app.services.notifications import notify_status_change, get_recent_events

router = APIRouter(prefix="/admin", tags=["Admin ROPS"])


def _to_dict_list(data: Any) -> List[Dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def _to_dict(data: Any) -> Dict[str, Any]:
    if isinstance(data, dict):
        return data
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        return data[0]
    return {}


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
        rows = _to_dict_list(res.data)

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
                    id=str(r.get("id", "")),
                    user_id=r.get("user_id"),
                    title=str(r.get("title") or "Fiszka innowacji społecznej"),
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
        r = _to_dict(res.data)
        if not r:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Nie znaleziono zgłoszenia o ID: {submission_id}",
            )
        return SubmissionResponse(
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
        current_list = _to_dict_list(current_res.data)
        if not current_list:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Zgłoszenie o ID: {submission_id} nie istnieje.",
            )

        current_item = current_list[0]
        old_status = str(current_item.get("status", "nowe"))
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
        updated_list = _to_dict_list(update_res.data)
        if not updated_list:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Nie udało się zapisać zmian w bazie danych.",
            )

        updated_row = updated_list[0]

        # 4. Dyspozycja powiadomień i log zdarzenia
        notify_status_change(
            submission_id=submission_id,
            old_status=old_status,
            new_status=new_status,
            title=str(updated_row.get("title") or current_item.get("title") or "Fiszka innowacji"),
            applicant_email=str(current_item.get("applicant_email")) if current_item.get("applicant_email") else None,
            official_response=payload.official_response,
            changed_by=admin.email or "rops_admin",
        )

        return SubmissionResponse(
            id=str(updated_row.get("id", "")),
            user_id=updated_row.get("user_id"),
            title=str(updated_row.get("title") or "Fiszka innowacji"),
            problem_description=str(updated_row.get("problem_description", "")),
            solution_description=str(updated_row.get("solution_description")) if updated_row.get("solution_description") is not None else None,
            target_group=str(updated_row.get("target_group")) if updated_row.get("target_group") is not None else None,
            implementation_stage=str(updated_row.get("implementation_stage") or "pomysl"),
            institution_name=str(updated_row.get("institution_name")) if updated_row.get("institution_name") is not None else None,
            applicant_type=str(updated_row.get("applicant_type", "JST")),
            applicant_name=str(updated_row.get("applicant_name")) if updated_row.get("applicant_name") is not None else None,
            applicant_email=str(updated_row.get("applicant_email")) if updated_row.get("applicant_email") is not None else None,
            matched_innovation_id=str(updated_row.get("matched_innovation_id")) if updated_row.get("matched_innovation_id") is not None else None,
            status=str(updated_row.get("status", new_status)),
            official_response=str(updated_row.get("official_response")) if updated_row.get("official_response") is not None else None,
            notes=str(updated_row.get("notes")) if updated_row.get("notes") is not None else None,
            created_at=str(updated_row.get("created_at")) if updated_row.get("created_at") is not None else None,
            updated_at=str(updated_row.get("updated_at")) if updated_row.get("updated_at") is not None else None,
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
    events = _to_dict_list(get_recent_events(limit=limit))
    return [
        SubmissionEventResponse(
            id=str(e.get("id", "")),
            submission_id=str(e.get("submission_id", "")),
            old_status=str(e.get("old_status")) if e.get("old_status") is not None else None,
            new_status=str(e.get("new_status", "nowe")),
            changed_by=str(e.get("changed_by", "rops_admin")),
            comment=str(e.get("comment")) if e.get("comment") is not None else None,
            webhook_dispatched=bool(e.get("webhook_dispatched", False)),
            created_at=str(e.get("created_at")) if e.get("created_at") is not None else None,
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


# ==============================================================================
# ZARZĄDZANIE BAZĄ WIEDZY (PUNKT VI: PANEL ADMINISTRATORA ROPS)
# ==============================================================================

@router.get("/innovations", response_model=List[MatchItem])
async def list_admin_innovations(
    category: Optional[str] = Query(None, description="Filtruj według kategorii"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filtruj według statusu (np. sprawdzone, nowa)"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Pobiera listę innowacji dla panelu administratora ROPS.
    Pozwala na przegląd bazy wiedzy, weryfikację i publikację.
    """
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Baza danych Supabase jest niedostępna.")

    try:
        query = supabase.table("innovations").select(
            "id, title, description, target_group, category, why_relevant, source_url, status"
        )
        if category:
            query = query.eq("category", category)
        if status_filter:
            query = query.eq("status", status_filter)

        res = query.range(offset, offset + limit - 1).execute()
        rows = _to_dict_list(res.data)

        return [
            MatchItem(
                id=str(r.get("id", "")).strip(),
                title=str(r.get("title", "")).strip(),
                similarity_score=1.0,
                why_relevant=r.get("why_relevant"),
                source_url=r.get("source_url"),
                target_group=r.get("target_group"),
                category=r.get("category"),
                description=r.get("description"),
                status=str(r.get("status", "sprawdzone")).strip(),
            )
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Błąd bazy danych: {str(e)}")


@router.post("/innovations", response_model=MatchItem, status_code=status.HTTP_201_CREATED)
async def create_admin_innovation(
    payload: InnovationCreate,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Dodaje nową innowację do Bazy Wiedzy ROPS Kraków.
    Automatycznie wylicza zbuforowany embedding 1536D, dzięki czemu
    rozwiązanie natychmiast bierze udział w matchmakingu wektorowym.
    """
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Baza danych Supabase jest niedostępna.")

    inv_id = payload.id.strip() if payload.id and payload.id.strip() else f"inv_{uuid.uuid4().hex[:8]}"

    # Wyliczenie embeddingu semantycznego
    semantic_text = (
        f"{payload.title}. Kategoria: {payload.category}. "
        f"Grupa docelowa: {payload.target_group}. "
        f"Dlaczego warto: {payload.why_relevant or ''}. "
        f"Opis: {payload.description}"
    )
    embedding = create_embedding(semantic_text)

    row = {
        "id": inv_id,
        "title": payload.title.strip(),
        "description": payload.description.strip(),
        "target_group": payload.target_group.strip(),
        "category": payload.category.strip(),
        "why_relevant": payload.why_relevant.strip() if payload.why_relevant else None,
        "source_url": payload.source_url.strip() if payload.source_url else None,
        "status": payload.status.strip(),
        "author_or_institution": payload.author_or_institution or "ROPS Kraków",
        "embedding": embedding,
    }

    try:
        res = supabase.table("innovations").insert(row).execute()
        inserted_list = _to_dict_list(res.data)
        if not inserted_list:
            raise HTTPException(status_code=500, detail="Błąd podczas tworzenia rekordu innowacji.")
        inserted = inserted_list[0]
        return MatchItem(
            id=str(inserted.get("id", inv_id)),
            title=str(inserted.get("title", payload.title)),
            similarity_score=1.0,
            why_relevant=inserted.get("why_relevant"),
            source_url=inserted.get("source_url"),
            target_group=inserted.get("target_group"),
            category=inserted.get("category"),
            description=inserted.get("description"),
            status=str(inserted.get("status", payload.status)),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Błąd zapisu innowacji: {str(e)}")

@router.get("/innovations/{innovation_id}", response_model=MatchItem)
async def get_admin_innovation_by_id(
    innovation_id: str,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Pobiera pojedynczą innowację z Bazy Wiedzy dla Administratora ROPS.
    """
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Baza danych Supabase jest niedostępna.")

    curr_res = supabase.table("innovations").select("*").eq("id", innovation_id).execute()
    curr_list = _to_dict_list(curr_res.data)
    if not curr_list:
        raise HTTPException(status_code=404, detail="Innowacja nie została odnaleziona.")
    curr = curr_list[0]
    return MatchItem(
        id=str(curr.get("id", innovation_id)),
        title=str(curr.get("title", "")),
        similarity_score=1.0,
        why_relevant=curr.get("why_relevant"),
        source_url=curr.get("source_url"),
        target_group=curr.get("target_group"),
        category=curr.get("category"),
        description=curr.get("description"),
        status=str(curr.get("status", "sprawdzone")),
    )


@router.put("/innovations/{innovation_id}", response_model=MatchItem)
async def update_admin_innovation(
    innovation_id: str,
    payload: InnovationUpdate,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Edytuje istniejącą innowację w Bazie Wiedzy ROPS Kraków.
    Jeśli tytuł lub opis uległy zmianie, automatycznie aktualizuje wektor embeddingu 1536D.
    """
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Baza danych Supabase jest niedostępna.")

    # Pobranie aktualnego rekordu
    curr_res = supabase.table("innovations").select("*").eq("id", innovation_id).execute()
    curr_list = _to_dict_list(curr_res.data)
    if not curr_list:
        raise HTTPException(status_code=404, detail="Innowacja nie została odnaleziona.")
    curr = curr_list[0]

    update_data: Dict[str, Any] = {}
    if payload.title is not None:
        update_data["title"] = payload.title.strip()
    if payload.description is not None:
        update_data["description"] = payload.description.strip()
    if payload.target_group is not None:
        update_data["target_group"] = payload.target_group.strip()
    if payload.category is not None:
        update_data["category"] = payload.category.strip()
    if payload.why_relevant is not None:
        update_data["why_relevant"] = payload.why_relevant.strip()
    if payload.source_url is not None:
        update_data["source_url"] = payload.source_url.strip()
    if payload.status is not None:
        update_data["status"] = payload.status.strip()
    if payload.author_or_institution is not None:
        update_data["author_or_institution"] = payload.author_or_institution.strip()

    # Jeśli zmieniły się kluczowe pola semantyczne, przelicz embedding
    if any(k in update_data for k in ("title", "description", "target_group", "category", "why_relevant")):
        new_title = update_data.get("title", curr.get("title", ""))
        new_cat = update_data.get("category", curr.get("category", ""))
        new_tg = update_data.get("target_group", curr.get("target_group", ""))
        new_why = update_data.get("why_relevant", curr.get("why_relevant", ""))
        new_desc = update_data.get("description", curr.get("description", ""))
        semantic_text = f"{new_title}. Kategoria: {new_cat}. Grupa docelowa: {new_tg}. Dlaczego warto: {new_why}. Opis: {new_desc}"
        update_data["embedding"] = create_embedding(semantic_text)

    try:
        res = supabase.table("innovations").update(update_data).eq("id", innovation_id).execute()
        updated_list = _to_dict_list(res.data)
        if not updated_list:
            raise HTTPException(status_code=500, detail="Błąd aktualizacji rekordu innowacji.")
        updated = updated_list[0]
        return MatchItem(
            id=str(updated.get("id", innovation_id)),
            title=str(updated.get("title", "")),
            similarity_score=1.0,
            why_relevant=updated.get("why_relevant"),
            source_url=updated.get("source_url"),
            target_group=updated.get("target_group"),
            category=updated.get("category"),
            description=updated.get("description"),
            status=str(updated.get("status", "sprawdzone")),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Błąd aktualizacji innowacji: {str(e)}")


@router.post("/innovations/{innovation_id}/publish", response_model=MatchItem)
async def publish_admin_innovation(
    innovation_id: str,
    admin: UserSession = Depends(require_rops_admin),
):
    """
    Weryfikuje i publikuje innowację w Bazie Wiedzy ROPS (status: 'sprawdzone').
    """
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Baza danych Supabase jest niedostępna.")

    try:
        res = supabase.table("innovations").update({"status": "sprawdzone"}).eq("id", innovation_id).execute()
        updated_list = _to_dict_list(res.data)
        if not updated_list:
            raise HTTPException(status_code=404, detail="Innowacja nie została odnaleziona.")
        updated = updated_list[0]
        return MatchItem(
            id=str(updated.get("id", innovation_id)),
            title=str(updated.get("title", "")),
            similarity_score=1.0,
            why_relevant=updated.get("why_relevant"),
            source_url=updated.get("source_url"),
            target_group=updated.get("target_group"),
            category=updated.get("category"),
            description=updated.get("description"),
            status="sprawdzone",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Błąd publikacji innowacji: {str(e)}")


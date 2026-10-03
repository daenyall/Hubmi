import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status

from app.db.supabase import get_supabase_client
from app.models.schemas import (
    TestApplicationCreate,
    TestApplicationResponse,
    TestApplicationStatusUpdate,
    TestFeedbackCreate,
    TestFeedbackResponse,
    InnovationFeedbackSummary,
    TestingGlobalSummary,
)


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



def apply_for_testing(data: TestApplicationCreate) -> TestApplicationResponse:
    """
    Rejestruje zgłoszenie samorządu/instytucji (JST, CUS, NGO)
    chcącej przetestować lub wdrożyć pilotażowo daną innowację społeczną.
    Zapewnia trwały zapis w bazie Supabase lub rzuca jawny błąd 500.
    """
    app_id = str(uuid.uuid4())
    now_str = datetime.now(timezone.utc).isoformat()

    row_data = {
        "id": app_id,
        "innovation_id": data.innovation_id,
        "tester_type": data.tester_type,
        "institution_name": data.institution_name,
        "contact_person": data.contact_person,
        "contact_email": data.contact_email,
        "contact_phone": data.contact_phone,
        "testing_scope": data.testing_scope,
        "target_audience_count": data.target_audience_count,
        "status": "nowe",
        "notes": data.notes,
        "created_at": now_str,
        "updated_at": now_str,
    }

    supabase = get_supabase_client()
    if supabase:
        try:
            res = supabase.table("innovation_test_applications").insert(row_data).execute()
            inserted = _to_dict(res.data)
            if inserted:
                return TestApplicationResponse(
                    id=str(inserted.get("id", app_id)),
                    innovation_id=str(inserted.get("innovation_id", data.innovation_id)),
                    tester_type=str(inserted.get("tester_type", data.tester_type)),
                    institution_name=str(inserted.get("institution_name", data.institution_name)),
                    contact_person=str(inserted.get("contact_person", data.contact_person)),
                    contact_email=str(inserted.get("contact_email", data.contact_email)),
                    contact_phone=inserted.get("contact_phone"),
                    testing_scope=str(inserted.get("testing_scope", data.testing_scope)),
                    target_audience_count=int(inserted.get("target_audience_count") or data.target_audience_count),
                    status=str(inserted.get("status", "nowe")),
                    notes=inserted.get("notes"),
                    created_at=str(inserted.get("created_at") or now_str),
                    updated_at=str(inserted.get("updated_at") or now_str),
                )
            raise RuntimeError("Supabase returned empty data on insert.")
        except HTTPException:
            raise
        except Exception as e:
            err_str = str(e)
            if "23503" in err_str:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Innowacja o ID '{data.innovation_id}' nie istnieje w bazie wiedzy ROPS.",
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Błąd trwałego zapisu zgłoszenia w bazie Supabase: {e}.",
            )

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Baza danych Supabase jest niedostępna.",
    )


def list_applications(
    innovation_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
) -> List[TestApplicationResponse]:
    """
    Pobiera listę zgłoszeń testowych z opcjonalnymi filtrami.
    Dostęp chroniony dla Administratora ROPS Kraków.
    """
    results: List[TestApplicationResponse] = []
    supabase = get_supabase_client()
    if supabase:
        try:
            query = supabase.table("innovation_test_applications").select("*")
            if innovation_id:
                query = query.eq("innovation_id", innovation_id)
            if status_filter:
                query = query.eq("status", status_filter)
            res = query.order("created_at", desc=True).limit(limit).execute()
            rows = _to_dict_list(res.data)
            for r in rows:
                results.append(
                    TestApplicationResponse(
                        id=str(r.get("id")),
                        innovation_id=str(r.get("innovation_id")),
                        tester_type=str(r.get("tester_type", "JST")),
                        institution_name=str(r.get("institution_name", "")),
                        contact_person=str(r.get("contact_person", "")),
                        contact_email=str(r.get("contact_email", "")),
                        contact_phone=r.get("contact_phone"),
                        testing_scope=str(r.get("testing_scope", "pilotaz_3m")),
                        target_audience_count=int(r.get("target_audience_count") or 20),
                        status=str(r.get("status", "nowe")),
                        notes=r.get("notes"),
                        created_at=r.get("created_at"),
                        updated_at=r.get("updated_at"),
                    )
                )
            return results
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Błąd odczytu zgłoszeń testowych z bazy Supabase: {e}.",
            )

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Baza danych Supabase jest niedostępna.",
    )


def get_application_by_id(application_id: str) -> Optional[TestApplicationResponse]:
    """Pobiera pojedyncze zgłoszenie testowe po ID."""
    supabase = get_supabase_client()
    if supabase:
        try:
            res = (
                supabase.table("innovation_test_applications")
                .select("*")
                .eq("id", application_id)
                .limit(1)
                .execute()
            )
            r = _to_dict(res.data)
            if r:
                return TestApplicationResponse(
                    id=str(r.get("id")),
                    innovation_id=str(r.get("innovation_id")),
                    tester_type=str(r.get("tester_type", "JST")),
                    institution_name=str(r.get("institution_name", "")),
                    contact_person=str(r.get("contact_person", "")),
                    contact_email=str(r.get("contact_email", "")),
                    contact_phone=r.get("contact_phone"),
                    testing_scope=str(r.get("testing_scope", "pilotaz_3m")),
                    target_audience_count=int(r.get("target_audience_count") or 20),
                    status=str(r.get("status", "nowe")),
                    notes=r.get("notes"),
                    created_at=r.get("created_at"),
                    updated_at=r.get("updated_at"),
                )
            return None
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Błąd odczytu zgłoszenia testowego z bazy Supabase: {e}.",
            )
    return None


def update_application_status(
    application_id: str,
    update_data: TestApplicationStatusUpdate,
) -> Optional[TestApplicationResponse]:
    """
    Zmienia status pilotażu / testu w gminie (np. zaakceptowane, w_trakcie, zakonczone).
    Dedykowane dla administratora ROPS Kraków.
    """
    now_str = datetime.now(timezone.utc).isoformat()
    update_dict: Dict[str, Any] = {
        "status": update_data.status,
        "updated_at": now_str,
    }
    if update_data.notes is not None:
        update_dict["notes"] = update_data.notes

    supabase = get_supabase_client()
    if supabase:
        try:
            res = (
                supabase.table("innovation_test_applications")
                .update(update_dict)
                .eq("id", application_id)
                .execute()
            )
            r = _to_dict(res.data)
            if r:
                return TestApplicationResponse(
                    id=str(r.get("id")),
                    innovation_id=str(r.get("innovation_id")),
                    tester_type=str(r.get("tester_type", "JST")),
                    institution_name=str(r.get("institution_name", "")),
                    contact_person=str(r.get("contact_person", "")),
                    contact_email=str(r.get("contact_email", "")),
                    contact_phone=r.get("contact_phone"),
                    testing_scope=str(r.get("testing_scope", "pilotaz_3m")),
                    target_audience_count=int(r.get("target_audience_count") or 20),
                    status=str(r.get("status", update_data.status)),
                    notes=r.get("notes"),
                    created_at=r.get("created_at"),
                    updated_at=r.get("updated_at"),
                )
            return None
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Błąd aktualizacji statusu w bazie Supabase: {e}.",
            )
    return None


def submit_feedback(data: TestFeedbackCreate) -> TestFeedbackResponse:
    """
    Zapisuje ocenę i rekomendacje z przeprowadzonego testu w gminie/instytucji.
    Oblicza średnią ocenę cząstkową (usability, effectiveness, accessibility).
    Gwarantuje trwałość w bazie Supabase.
    """
    feedback_id = str(uuid.uuid4())
    now_str = datetime.now(timezone.utc).isoformat()
    avg_score = round(
        (data.rating_usability + data.rating_effectiveness + data.rating_accessibility) / 3.0,
        2,
    )

    row_data = {
        "id": feedback_id,
        "innovation_id": data.innovation_id,
        "application_id": data.application_id,
        "rating_usability": data.rating_usability,
        "rating_effectiveness": data.rating_effectiveness,
        "rating_accessibility": data.rating_accessibility,
        "pros": data.pros,
        "cons_and_barriers": data.cons_and_barriers,
        "suggested_improvements": data.suggested_improvements,
        "would_recommend": data.would_recommend,
        "author_name": data.author_name,
        "created_at": now_str,
    }

    supabase = get_supabase_client()
    if supabase:
        try:
            # Weryfikacja powiązania zgłoszenia testowego (application_id) z innowacją
            if data.application_id:
                app_check = (
                    supabase.table("innovation_test_applications")
                    .select("id, innovation_id")
                    .eq("id", data.application_id)
                    .limit(1)
                    .execute()
                )
                app_data = _to_dict_list(app_check.data)
                if not app_data:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Zgłoszenie testowe '{data.application_id}' nie istnieje.",
                    )
                if app_data[0].get("innovation_id") != data.innovation_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Wskazane zgłoszenie pilotażowe nie dotyczy ocenianej innowacji.",
                    )

            res = supabase.table("innovation_feedback").insert(row_data).execute()
            inserted = _to_dict(res.data)
            if inserted:
                # Zgodnie z punktem 9 audytu: publiczne dodanie opinii NIE MOŻE automatycznie
                # zmieniać statusu zgłoszenia testowego na 'zakonczone'. Zmiana statusu pilotażu
                # jest wyłączną domeną autoryzowanego koordynatora ROPS Kraków.

                return TestFeedbackResponse(
                    id=str(inserted.get("id", feedback_id)),
                    innovation_id=str(inserted.get("innovation_id", data.innovation_id)),
                    application_id=inserted.get("application_id"),
                    rating_usability=int(inserted.get("rating_usability", data.rating_usability)),
                    rating_effectiveness=int(inserted.get("rating_effectiveness", data.rating_effectiveness)),
                    rating_accessibility=int(inserted.get("rating_accessibility", data.rating_accessibility)),
                    average_score=avg_score,
                    pros=inserted.get("pros"),
                    cons_and_barriers=inserted.get("cons_and_barriers"),
                    suggested_improvements=inserted.get("suggested_improvements"),
                    would_recommend=bool(inserted.get("would_recommend", data.would_recommend)),
                    author_name=str(inserted.get("author_name", data.author_name)),
                    created_at=str(inserted.get("created_at") or now_str),
                )
            raise RuntimeError("Supabase returned empty data on feedback insert.")
        except HTTPException:
            raise
        except Exception as e:
            err_str = str(e)
            if "23503" in err_str:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Innowacja lub zgłoszenie powiązane z oceną nie istnieje.",
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Błąd trwałego zapisu formularza ewaluacji w bazie Supabase: {e}.",
            )

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Baza danych Supabase jest niedostępna.",
    )


def list_feedbacks_for_innovation(
    innovation_id: str,
    limit: int = 50,
) -> List[TestFeedbackResponse]:
    """Pobiera listę ocen dla danej innowacji."""
    feedbacks: List[TestFeedbackResponse] = []
    supabase = get_supabase_client()
    if supabase:
        try:
            res = (
                supabase.table("innovation_feedback")
                .select("*")
                .eq("innovation_id", innovation_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            rows = _to_dict_list(res.data)
            for r in rows:
                u = int(r.get("rating_usability") or 3)
                e = int(r.get("rating_effectiveness") or 3)
                a = int(r.get("rating_accessibility") or 3)
                feedbacks.append(
                    TestFeedbackResponse(
                        id=str(r.get("id")),
                        innovation_id=str(r.get("innovation_id")),
                        application_id=r.get("application_id"),
                        rating_usability=u,
                        rating_effectiveness=e,
                        rating_accessibility=a,
                        average_score=round((u + e + a) / 3.0, 2),
                        pros=r.get("pros"),
                        cons_and_barriers=r.get("cons_and_barriers"),
                        suggested_improvements=r.get("suggested_improvements"),
                        would_recommend=bool(r.get("would_recommend", True)),
                        author_name=str(r.get("author_name", "Anonim")),
                        created_at=r.get("created_at"),
                    )
                )
            return feedbacks
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Błąd odczytu ocen z bazy Supabase: {err}.",
            )

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Baza danych Supabase jest niedostępna.",
    )


def get_innovation_feedback_summary(innovation_id: str) -> InnovationFeedbackSummary:
    """
    Zwraca zintegrowaną analizę feedbacku dla innowacji:
    średnia łatwości wdrożenia, skuteczności, dostępności oraz % rekomendacji.
    """
    feedbacks = list_feedbacks_for_innovation(innovation_id, limit=100)
    if not feedbacks:
        return InnovationFeedbackSummary(
            innovation_id=innovation_id,
            total_reviews=0,
            avg_usability=0.0,
            avg_effectiveness=0.0,
            avg_accessibility=0.0,
            overall_rating=0.0,
            recommendation_percentage=100.0,
            recent_reviews=[],
        )

    count = len(feedbacks)
    avg_usability = round(sum(f.rating_usability for f in feedbacks) / count, 2)
    avg_effectiveness = round(sum(f.rating_effectiveness for f in feedbacks) / count, 2)
    avg_accessibility = round(sum(f.rating_accessibility for f in feedbacks) / count, 2)
    overall_rating = round((avg_usability + avg_effectiveness + avg_accessibility) / 3.0, 2)

    recommended_count = sum(1 for f in feedbacks if f.would_recommend)
    recommendation_percentage = round((recommended_count / count) * 100.0, 1)

    return InnovationFeedbackSummary(
        innovation_id=innovation_id,
        total_reviews=count,
        avg_usability=avg_usability,
        avg_effectiveness=avg_effectiveness,
        avg_accessibility=avg_accessibility,
        overall_rating=overall_rating,
        recommendation_percentage=recommendation_percentage,
        recent_reviews=feedbacks[:10],
    )


def get_testing_global_summary() -> TestingGlobalSummary:
    """
    Zwraca całościowe statystyki testowania innowacji w Małopolsce dla ROPS Kraków:
    liczba zgłoszeń, aktywne pilotaże, zakończone testy, średnie oceny.
    """
    try:
        apps = list_applications(limit=500)
    except Exception:
        apps = []

    total_apps = len(apps)
    active_pilots = sum(1 for a in apps if a.status in ["zaakceptowane", "w_trakcie"])
    completed_pilots = sum(1 for a in apps if a.status == "zakonczone")

    apps_by_status: Dict[str, int] = {}
    for a in apps:
        apps_by_status[a.status] = apps_by_status.get(a.status, 0) + 1

    # Agregacja ocen
    all_feedbacks: List[TestFeedbackResponse] = []
    supabase = get_supabase_client()
    if supabase:
        try:
            res = supabase.table("innovation_feedback").select("*").limit(500).execute()
            rows = _to_dict_list(res.data)
            for r in rows:
                u = int(r.get("rating_usability") or 3)
                e = int(r.get("rating_effectiveness") or 3)
                a = int(r.get("rating_accessibility") or 3)
                all_feedbacks.append(
                    TestFeedbackResponse(
                        id=str(r.get("id")),
                        innovation_id=str(r.get("innovation_id")),
                        application_id=r.get("application_id"),
                        rating_usability=u,
                        rating_effectiveness=e,
                        rating_accessibility=a,
                        average_score=round((u + e + a) / 3.0, 2),
                        pros=r.get("pros"),
                        cons_and_barriers=r.get("cons_and_barriers"),
                        suggested_improvements=r.get("suggested_improvements"),
                        would_recommend=bool(r.get("would_recommend", True)),
                        author_name=str(r.get("author_name", "Anonim")),
                        created_at=r.get("created_at"),
                    )
                )
        except Exception:
            pass



    total_feedbacks = len(all_feedbacks)
    overall_avg_rating = (
        round(sum(f.average_score for f in all_feedbacks) / total_feedbacks, 2)
        if total_feedbacks > 0
        else 0.0
    )

    inv_scores: Dict[str, List[float]] = {}
    for f in all_feedbacks:
        inv_scores.setdefault(f.innovation_id, []).append(f.average_score)

    top_innovations: List[Dict[str, Any]] = []
    for inv_id, scores in inv_scores.items():
        top_innovations.append({
            "innovation_id": inv_id,
            "average_score": round(sum(scores) / len(scores), 2),
            "review_count": len(scores),
        })
    top_innovations.sort(key=lambda x: (x["average_score"], x["review_count"]), reverse=True)

    return TestingGlobalSummary(
        total_applications=total_apps,
        active_pilots=active_pilots,
        completed_pilots=completed_pilots,
        total_feedbacks=total_feedbacks,
        overall_avg_rating=overall_avg_rating,
        top_rated_innovations=top_innovations[:5],
        applications_by_status=apps_by_status,
    )

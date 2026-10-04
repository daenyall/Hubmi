import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any, Tuple
from fastapi import HTTPException, status
from postgrest.types import CountMethod

from app.db.supabase import get_supabase_client
from app.models.schemas import (
    CommunityNeedCreate,
    CommunityNeedResponse,
    CommunityNeedStatusUpdate,
    CategoryAggregate,
    PowiatAggregate,
    HotspotRecommendation,
    NeedsSummaryResponse,
    TrendItem,
    NeedsTrendsResponse,
)
from app.utils.helpers import to_dict_list, to_dict
from app.utils.sanitize import sanitize_text, sanitize_optional

logger = logging.getLogger(__name__)


def _row_to_response(r: Dict[str, Any]) -> CommunityNeedResponse:
    """Konwertuje słownik z bazy danych na silnie typowany CommunityNeedResponse."""
    return CommunityNeedResponse(
        id=str(r.get("id", "")),
        user_id=str(r["user_id"]) if r.get("user_id") is not None else None,
        created_at=str(r.get("created_at", "")),
        updated_at=str(r.get("updated_at")) if r.get("updated_at") is not None else None,
        institution_name=str(r.get("institution_name", "")),
        institution_type=str(r.get("institution_type", "JST")),
        powiat=str(r.get("powiat", "")),
        gmina=str(r.get("gmina")) if r.get("gmina") is not None else None,
        contact_email=str(r.get("contact_email")) if r.get("contact_email") is not None else None,
        contact_phone=str(r.get("contact_phone")) if r.get("contact_phone") is not None else None,
        category=str(r.get("category", "")),
        target_group=str(r.get("target_group", "Mieszkańcy")),
        problem_summary=str(r.get("problem_summary", "")),
        detailed_description=str(r.get("detailed_description", "")),
        estimated_affected_count=int(r.get("estimated_affected_count") or 0),
        urgency_level=str(r.get("urgency_level", "sredni")),
        status=str(r.get("status", "nowe")),
        rops_internal_notes=str(r.get("rops_internal_notes")) if r.get("rops_internal_notes") is not None else None,
        reviewed_at=str(r.get("reviewed_at")) if r.get("reviewed_at") is not None else None,
    )


def create_community_need(
    payload: CommunityNeedCreate,
    user_id: Optional[str] = None,
) -> CommunityNeedResponse:
    """
    Tworzy nową oddolną potrzebę społeczną wyłącznie w trwałej bazie Supabase.
    Brak pozorowanego sukcesu ani cichego fallbacku do pamięci.
    """
    sb = get_supabase_client()
    if not sb:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    now_str = datetime.now(timezone.utc).isoformat()
    need_id = str(uuid.uuid4())

    record: Dict[str, Any] = {
        "id": need_id,
        "created_at": now_str,
        "updated_at": now_str,
        "user_id": user_id,  # Pochodzi wyłącznie z kryptograficznie zweryfikowanej sesji (None dla gościa)
        "institution_name": sanitize_text(payload.institution_name),
        "institution_type": sanitize_text(payload.institution_type or "JST"),
        "powiat": sanitize_text(payload.powiat).lower(),
        "gmina": sanitize_optional(payload.gmina),
        "contact_email": sanitize_optional(payload.contact_email),
        "contact_phone": sanitize_optional(payload.contact_phone),
        "category": sanitize_text(payload.category),
        "target_group": sanitize_text(payload.target_group or "Mieszkańcy"),
        "problem_summary": sanitize_text(payload.problem_summary),
        "detailed_description": sanitize_text(payload.detailed_description),
        "estimated_affected_count": max(0, payload.estimated_affected_count or 0),
        "urgency_level": payload.urgency_level if payload.urgency_level in ("niski", "sredni", "wysoki", "krytyczny") else "sredni",
        "status": "nowe",
        "rops_internal_notes": None,
        "reviewed_by": None,
        "reviewed_at": None,
    }

    try:
        res = sb.table("community_needs").insert(record).execute()
    except Exception as e:
        logger.error("Błąd trwałego zapisu community_needs do Supabase: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Wystąpił błąd podczas trwałego zapisu zgłoszenia w bazie danych.",
        )

    if not res or not res.data:
        logger.error("Supabase insert nie zwrócił potwierdzenia zapisu (brak res.data)")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Baza danych nie potwierdziła trwałego zapisu zgłoszenia.",
        )

    data = to_dict(res.data[0])
    return _row_to_response(data)


def list_community_needs(
    powiat: Optional[str] = None,
    category: Optional[str] = None,
    status_filter: Optional[str] = None,
    urgency_level: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Tuple[List[CommunityNeedResponse], int]:
    """Pobiera listę potrzeb dla administratora ROPS wyłącznie z bazy danych."""
    sb = get_supabase_client()
    if not sb:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    try:
        query = sb.table("community_needs").select("*", count=CountMethod.exact)
        if powiat:
            query = query.eq("powiat", powiat.lower().strip())
        if category:
            query = query.eq("category", category.strip())
        if status_filter:
            query = query.eq("status", status_filter.strip())
        if urgency_level:
            query = query.eq("urgency_level", urgency_level.strip())

        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        res = query.execute()
    except Exception as e:
        logger.error("Błąd odczytu z Supabase community_needs: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Wystąpił błąd podczas odczytu zgłoszeń z bazy danych.",
        )

    rows = to_dict_list(res.data) if res and res.data else []
    total = res.count if res and res.count is not None else len(rows)

    if search and search.strip():
        s = search.lower().strip()
        rows = [
            r for r in rows
            if s in str(r.get("problem_summary", "")).lower()
            or s in str(r.get("detailed_description", "")).lower()
            or s in str(r.get("institution_name", "")).lower()
        ]
        total = len(rows)

    return [_row_to_response(r) for r in rows], total


def get_user_community_needs(user_id: Optional[str]) -> List[CommunityNeedResponse]:
    """Pobiera zgłoszenia danego autora wyłącznie z bazy danych."""
    if not user_id:
        return []

    sb = get_supabase_client()
    if not sb:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    try:
        res = sb.table("community_needs").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    except Exception as e:
        logger.error("Błąd odczytu własnych potrzeb z Supabase: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Wystąpił błąd podczas odczytu Twoich zgłoszeń z bazy danych.",
        )

    rows = to_dict_list(res.data) if res and res.data else []
    return [_row_to_response(r) for r in rows]


def update_need_status(
    need_id: str,
    update: CommunityNeedStatusUpdate,
    admin_user_id: Optional[str] = None,
) -> Optional[CommunityNeedResponse]:
    """Aktualizuje status i notatkę ROPS w bazie danych."""
    sb = get_supabase_client()
    if not sb:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    now_str = datetime.now(timezone.utc).isoformat()
    fields: Dict[str, Any] = {
        "status": update.status,
        "updated_at": now_str,
        "reviewed_at": now_str,
    }
    if update.rops_internal_notes is not None:
        fields["rops_internal_notes"] = sanitize_text(update.rops_internal_notes)
    if admin_user_id:
        fields["reviewed_by"] = admin_user_id

    try:
        res = sb.table("community_needs").update(fields).eq("id", need_id).execute()
    except Exception as e:
        logger.error("Błąd aktualizacji w Supabase: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Wystąpił błąd podczas aktualizacji zgłoszenia w bazie danych.",
        )

    if res and res.data and len(res.data) > 0:
        return _row_to_response(to_dict(res.data[0]))
    return None


def _get_all_raw_records() -> List[Dict[str, Any]]:
    """Pobiera wszystkie surowe rekordy wyłącznie z Supabase."""
    sb = get_supabase_client()
    if not sb:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Baza danych Supabase jest niedostępna.",
        )

    try:
        res = sb.table("community_needs").select("*").execute()
    except Exception as e:
        logger.error("Błąd pobrania całości z Supabase community_needs: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Wystąpił błąd podczas pobierania danych analitycznych z bazy danych.",
        )

    return to_dict_list(res.data) if res and res.data else []


def get_needs_summary(
    days: Optional[int] = None,
    category: Optional[str] = None,
    powiat: Optional[str] = None,
) -> NeedsSummaryResponse:
    """
    Zestawienie analityczne dla ROPS oparte wyłącznie na rzeczywistej bazie danych.
    Pusta tabela daje prawdziwe zera i puste listy.
    """
    records = _get_all_raw_records()
    now = datetime.now(timezone.utc)

    # Filtrowanie daty
    if days is not None and days > 0:
        cutoff = now - timedelta(days=days)
        records = [
            r for r in records
            if datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")) >= cutoff
        ]

    # Filtrowanie opcjonalne
    if category:
        records = [r for r in records if r.get("category", "").lower() == category.lower().strip()]
    if powiat:
        records = [r for r in records if r.get("powiat", "").lower() == powiat.lower().strip()]

    total = len(records)

    # Podział według statusu
    status_counts: Dict[str, int] = {
        "nowe": 0,
        "analizowane": 0,
        "uwzglednione_w_naborze": 0,
        "odrzucone": 0,
        "zaadresowane": 0,
    }
    for r in records:
        st = r.get("status", "nowe")
        status_counts[st] = status_counts.get(st, 0) + 1

    # Podział według pilności
    urgency_counts: Dict[str, int] = {
        "niski": 0,
        "sredni": 0,
        "wysoki": 0,
        "krytyczny": 0,
    }
    for r in records:
        urg = r.get("urgency_level", "sredni")
        urgency_counts[urg] = urgency_counts.get(urg, 0) + 1

    # Podział według kategorii
    cat_counts: Dict[str, int] = {}
    for r in records:
        cat = r.get("category", "Inne")
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    top_categories = [
        CategoryAggregate(
            category=cat,
            count=cnt,
            percentage=round((cnt / total * 100), 1) if total > 0 else 0.0,
        )
        for cat, cnt in sorted(cat_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    # Podział według powiatu
    powiat_counts: Dict[str, int] = {}
    for r in records:
        p = r.get("powiat", "nieokreślony")
        powiat_counts[p] = powiat_counts.get(p, 0) + 1

    top_powiats = [
        PowiatAggregate(
            powiat=p,
            count=cnt,
            percentage=round((cnt / total * 100), 1) if total > 0 else 0.0,
        )
        for p, cnt in sorted(powiat_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    # Wykrywanie hotspotów (kombinacja kategoria + powiat o podwyższonej pilności)
    pair_counts: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for r in records:
        key = (r.get("category", "Inne"), r.get("powiat", "małopolski"))
        pair_counts.setdefault(key, []).append(r)

    emerging_hotspots: List[HotspotRecommendation] = []
    for (cat, p), items in sorted(pair_counts.items(), key=lambda x: len(x[1]), reverse=True):
        high_urgency = sum(1 for item in items if item.get("urgency_level") in ("wysoki", "krytyczny"))
        urgency_label = "krytyczny" if any(item.get("urgency_level") == "krytyczny" for item in items) else ("wysoki" if high_urgency > 0 else "sredni")

        if cat.lower() in ("zdrowie psychiczne", "psychologia"):
            rec_action = f"Rekomendowane uruchomienie mobilnego punktu wsparcia psychotraumatologicznego w powiecie {p}."
        elif cat.lower() in ("seniorzy", "osoby starsze"):
            rec_action = f"Rekomendowane upowszechnienie innowacji transportu asystenckiego i opieki wytchnieniowej w powiecie {p}."
        elif cat.lower() in ("dostępność", "niepełnosprawność"):
            rec_action = f"Rekomendowane ukierunkowanie naboru grantów testujących FERS Dostępność na likwidację barier w powiecie {p}."
        else:
            rec_action = f"Rekomendowana organizacja gminnego okrągłego stołu ds. innowacji społecznych dla powiatu {p}."

        emerging_hotspots.append(
            HotspotRecommendation(
                theme=f"{cat} — powiat {p}",
                category=cat,
                powiat=p,
                reported_count=len(items),
                urgency_level=urgency_label,
                recommended_action=rec_action,
            )
        )
        if len(emerging_hotspots) >= 5:
            break

    return NeedsSummaryResponse(
        total_needs_reported=total,
        filtered_period_days=days,
        needs_by_status=status_counts,
        needs_by_urgency=urgency_counts,
        top_categories=top_categories,
        top_powiats=top_powiats,
        emerging_hotspots=emerging_hotspots,
    )


def get_needs_trends(period_days: int = 30) -> NeedsTrendsResponse:
    """
    Porównanie okresów na rzeczywistych danych bazy bez mocków.
    Pusta tabela daje 0.0% wzrostu i puste listy trendów.
    """
    records = _get_all_raw_records()
    now = datetime.now(timezone.utc)
    curr_start = now - timedelta(days=period_days)
    prev_start = now - timedelta(days=2 * period_days)

    curr_records: List[Dict[str, Any]] = []
    prev_records: List[Dict[str, Any]] = []

    for r in records:
        dt = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))
        if dt >= curr_start:
            curr_records.append(r)
        elif dt >= prev_start and dt < curr_start:
            prev_records.append(r)

    curr_total = len(curr_records)
    prev_total = len(prev_records)

    if prev_total == 0:
        total_growth = 100.0 if curr_total > 0 else 0.0
    else:
        total_growth = round(((curr_total - prev_total) / prev_total) * 100, 1)

    # Trendy kategorii
    curr_cat: Dict[str, int] = {}
    for r in curr_records:
        c = r.get("category", "Inne")
        curr_cat[c] = curr_cat.get(c, 0) + 1

    prev_cat: Dict[str, int] = {}
    for r in prev_records:
        c = r.get("category", "Inne")
        prev_cat[c] = prev_cat.get(c, 0) + 1

    all_categories = set(curr_cat.keys()) | set(prev_cat.keys())
    cat_trends: List[TrendItem] = []
    for cat in all_categories:
        c_cnt = curr_cat.get(cat, 0)
        p_cnt = prev_cat.get(cat, 0)
        if p_cnt == 0:
            growth = 100.0 if c_cnt > 0 else 0.0
        else:
            growth = round(((c_cnt - p_cnt) / p_cnt) * 100, 1)

        trend_dir = "wzrostowy" if growth > 5.0 else ("spadkowy" if growth < -5.0 else "stabilny")
        cat_trends.append(
            TrendItem(
                name=cat,
                current_count=c_cnt,
                previous_count=p_cnt,
                growth_percentage=growth,
                trend=trend_dir,
            )
        )
    cat_trends.sort(key=lambda x: (x.growth_percentage, x.current_count), reverse=True)

    # Trendy powiatów
    curr_pow: Dict[str, int] = {}
    for r in curr_records:
        p = r.get("powiat", "nieokreślony")
        curr_pow[p] = curr_pow.get(p, 0) + 1

    prev_pow: Dict[str, int] = {}
    for r in prev_records:
        p = r.get("powiat", "nieokreślony")
        prev_pow[p] = prev_pow.get(p, 0) + 1

    all_powiats = set(curr_pow.keys()) | set(prev_pow.keys())
    pow_trends: List[TrendItem] = []
    for p in all_powiats:
        c_cnt = curr_pow.get(p, 0)
        p_cnt = prev_pow.get(p, 0)
        if p_cnt == 0:
            growth = 100.0 if c_cnt > 0 else 0.0
        else:
            growth = round(((c_cnt - p_cnt) / p_cnt) * 100, 1)

        trend_dir = "wzrostowy" if growth > 5.0 else ("spadkowy" if growth < -5.0 else "stabilny")
        pow_trends.append(
            TrendItem(
                name=p,
                current_count=c_cnt,
                previous_count=p_cnt,
                growth_percentage=growth,
                trend=trend_dir,
            )
        )
    pow_trends.sort(key=lambda x: (x.growth_percentage, x.current_count), reverse=True)

    summary_curr = get_needs_summary(days=period_days)

    return NeedsTrendsResponse(
        period_days=period_days,
        current_period={
            "start": curr_start.isoformat(),
            "end": now.isoformat(),
            "total": curr_total,
        },
        previous_period={
            "start": prev_start.isoformat(),
            "end": curr_start.isoformat(),
            "total": prev_total,
        },
        total_growth_percentage=total_growth,
        category_trends=cat_trends,
        powiat_trends=pow_trends,
        emerging_hotspots=summary_curr.emerging_hotspots,
    )

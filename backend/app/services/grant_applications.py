import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Tuple
from fastapi import HTTPException, status

from app.db.supabase import get_supabase_client
from app.models.schemas import (
    GrantCallResponse,
    GrantCallStatusUpdate,
    GrantApplicationCreate,
    GrantApplicationUpdate,
    GrantApplicationResponse,
    GrantApplicationStatusUpdate,
    GrantApplicationExportResponse,
)

# Domyślny nabór demonstracyjny na bazie Załącznika nr 3 ROPS Kraków
DEFAULT_DEMO_CALL_ID = "c0000000-0000-0000-0000-000000000001"
DEFAULT_DEMO_CALL: Dict[str, Any] = {
    "id": DEFAULT_DEMO_CALL_ID,
    "name": "Inkubator Włączenia Społecznego 2.0 – Nabór Pomysłów na Innowacje Społeczne (ROPS Kraków)",
    "template_name": "za._3._Formularz_aplikacyjny_wzor.pdf",
    "template_version": "1.0",
    "status": "demonstracyjny",
    "description": (
        "Oficjalny wzór naboru grantowego na innowacje społeczne (Działanie 5.1 FERS 2021-2027) "
        "organizowany przez Regionalny Ośrodek Polityki Społecznej w Krakowie. "
        "Nabór demonstracyjny na bazie oficjalnego wzoru umożliwiający przygotowanie, "
        "weryfikację budżetu i eksport gotowego wniosku."
    ),
    "max_grant_amount": 100000.00,
    "max_prep_months": 3,
    "max_test_months": 9,
    "created_at": "2026-10-01T00:00:00+00:00",
    "updated_at": "2026-10-01T00:00:00+00:00",
}

# Pamięciowy bufor demonstracyjny dla testów jednostkowych i środowisk przed wykonaniem migracji 10
_memory_calls_store: Dict[str, Dict[str, Any]] = {
    DEFAULT_DEMO_CALL_ID: dict(DEFAULT_DEMO_CALL)
}
_memory_applications_store: Dict[str, Dict[str, Any]] = {}


def _to_dict(data: Any) -> Dict[str, Any]:
    if isinstance(data, dict):
        return data
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        return data[0]
    return {}


def _to_dict_list(data: Any) -> List[Dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def _calculate_costs(action_plan: Dict[str, Any]) -> float:
    """Sumuje koszty okresu przygotowawczego i testowania z planu działania."""
    total = 0.0
    prep = action_plan.get("prep_period", [])
    if isinstance(prep, list):
        for item in prep:
            if isinstance(item, dict):
                try:
                    total += float(item.get("cost", 0.0) or 0.0)
                except (ValueError, TypeError):
                    pass
    test = action_plan.get("test_period", [])
    if isinstance(test, list):
        for item in test:
            if isinstance(item, dict):
                try:
                    total += float(item.get("cost", 0.0) or 0.0)
                except (ValueError, TypeError):
                    pass
    return round(total, 2)


def _map_application_to_response(
    r: Dict[str, Any], call_info: Optional[Dict[str, Any]] = None
) -> GrantApplicationResponse:
    grant_amount = float(r.get("grant_amount", 0.0) or 0.0)
    action_plan = r.get("action_plan") or {"prep_period": [], "test_period": []}
    if not isinstance(action_plan, dict):
        action_plan = {"prep_period": [], "test_period": []}

    total_costs = _calculate_costs(action_plan)
    is_balanced = abs(total_costs - grant_amount) < 0.01

    c_name = None
    c_status = None
    if call_info:
        c_name = call_info.get("name")
        c_status = call_info.get("status")
    elif r.get("grant_calls"):
        c_call = _to_dict(r.get("grant_calls"))
        c_name = c_call.get("name")
        c_status = c_call.get("status")

    return GrantApplicationResponse(
        id=str(r.get("id")),
        call_id=str(r.get("call_id")),
        call_name=c_name,
        call_status=c_status,
        user_id=str(r.get("user_id")),
        status=str(r.get("status", "roboczy")),
        applicant_type=str(r.get("applicant_type", "osoba_fizyczna")),
        title=str(r.get("title", "")),
        applicant_data=r.get("applicant_data") or {},
        innovation_description=str(r.get("innovation_description", "")),
        innovativeness=str(r.get("innovativeness", "")),
        problem_diagnosis=str(r.get("problem_diagnosis", "")),
        target_group_description=str(r.get("target_group_description", "")),
        expected_change=str(r.get("expected_change", "")),
        future_vision=str(r.get("future_vision", "")),
        action_plan=action_plan,
        grant_amount=grant_amount,
        total_costs_calculated=total_costs,
        is_budget_balanced=is_balanced,
        project_team=str(r.get("project_team", "")),
        declarations=r.get("declarations") or {},
        submitted_at=r.get("submitted_at"),
        rops_notes=r.get("rops_notes"),
        created_at=r.get("created_at"),
        updated_at=r.get("updated_at"),
    )


# ==============================================================================
# 1. NABORY (GRANT CALLS)
# ==============================================================================

def list_grant_calls() -> List[GrantCallResponse]:
    """Pobiera listę skonfigurowanych naborów grantowych."""
    supabase = get_supabase_client()
    if supabase:
        try:
            res = supabase.table("grant_calls").select("*").order("created_at", desc=False).execute()
            rows = _to_dict_list(res.data)
            if rows:
                return [
                    GrantCallResponse(
                        id=str(r.get("id")),
                        name=str(r.get("name")),
                        template_name=str(r.get("template_name", "za._3._Formularz_aplikacyjny_wzor.pdf")),
                        template_version=str(r.get("template_version", "1.0")),
                        status=str(r.get("status", "demonstracyjny")),
                        description=r.get("description"),
                        max_grant_amount=float(r.get("max_grant_amount", 100000.0)),
                        max_prep_months=int(r.get("max_prep_months", 3)),
                        max_test_months=int(r.get("max_test_months", 9)),
                        created_at=r.get("created_at"),
                        updated_at=r.get("updated_at"),
                    )
                    for r in rows
                ]
        except Exception:
            pass

    # Fallback na pamięciowy rejestr naborów
    return [
        GrantCallResponse(
            id=str(r.get("id")),
            name=str(r.get("name")),
            template_name=str(r.get("template_name")),
            template_version=str(r.get("template_version")),
            status=str(r.get("status")),
            description=r.get("description"),
            max_grant_amount=float(r.get("max_grant_amount", 100000.0)),
            max_prep_months=int(r.get("max_prep_months", 3)),
            max_test_months=int(r.get("max_test_months", 9)),
            created_at=r.get("created_at"),
            updated_at=r.get("updated_at"),
        )
        for r in _memory_calls_store.values()
    ]


def get_grant_call_by_id(call_id: str) -> Optional[GrantCallResponse]:
    """Pobiera szczegóły konfiguracji wybranego naboru."""
    supabase = get_supabase_client()
    if supabase:
        try:
            res = supabase.table("grant_calls").select("*").eq("id", call_id).limit(1).execute()
            r = _to_dict(res.data)
            if r:
                return GrantCallResponse(
                    id=str(r.get("id")),
                    name=str(r.get("name")),
                    template_name=str(r.get("template_name", "za._3._Formularz_aplikacyjny_wzor.pdf")),
                    template_version=str(r.get("template_version", "1.0")),
                    status=str(r.get("status", "demonstracyjny")),
                    description=r.get("description"),
                    max_grant_amount=float(r.get("max_grant_amount", 100000.0)),
                    max_prep_months=int(r.get("max_prep_months", 3)),
                    max_test_months=int(r.get("max_test_months", 9)),
                    created_at=r.get("created_at"),
                    updated_at=r.get("updated_at"),
                )
        except Exception:
            pass

    # Fallback
    c = _memory_calls_store.get(call_id)
    if c:
        return GrantCallResponse(
            id=str(c.get("id")),
            name=str(c.get("name")),
            template_name=str(c.get("template_name")),
            template_version=str(c.get("template_version")),
            status=str(c.get("status")),
            description=c.get("description"),
            max_grant_amount=float(c.get("max_grant_amount", 100000.0)),
            max_prep_months=int(c.get("max_prep_months", 3)),
            max_test_months=int(c.get("max_test_months", 9)),
            created_at=c.get("created_at"),
            updated_at=c.get("updated_at"),
        )
    return None


def update_grant_call_status(call_id: str, new_status: str) -> GrantCallResponse:
    """Aktualizuje stan naboru: 'otwarty', 'zamkniety', 'demonstracyjny' (wymaga ROPS admin)."""
    allowed_statuses = {"otwarty", "zamkniety", "demonstracyjny"}
    cleaned_status = new_status.strip().lower()
    if cleaned_status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Niedozwolony stan naboru: '{new_status}'. Dozwolone to: {sorted(list(allowed_statuses))}.",
        )

    now_str = datetime.now(timezone.utc).isoformat()
    supabase = get_supabase_client()
    if supabase:
        try:
            res = (
                supabase.table("grant_calls")
                .update({"status": cleaned_status, "updated_at": now_str})
                .eq("id", call_id)
                .execute()
            )
            r = _to_dict(res.data)
            if r:
                return GrantCallResponse(
                    id=str(r.get("id")),
                    name=str(r.get("name")),
                    template_name=str(r.get("template_name")),
                    template_version=str(r.get("template_version")),
                    status=str(r.get("status")),
                    description=r.get("description"),
                    max_grant_amount=float(r.get("max_grant_amount", 100000.0)),
                    max_prep_months=int(r.get("max_prep_months", 3)),
                    max_test_months=int(r.get("max_test_months", 9)),
                    created_at=r.get("created_at"),
                    updated_at=r.get("updated_at"),
                )
        except Exception:
            pass

    # Pamięć podręczna fallback
    if call_id in _memory_calls_store:
        _memory_calls_store[call_id]["status"] = cleaned_status
        _memory_calls_store[call_id]["updated_at"] = now_str
        c = _memory_calls_store[call_id]
        return GrantCallResponse(
            id=str(c.get("id")),
            name=str(c.get("name")),
            template_name=str(c.get("template_name")),
            template_version=str(c.get("template_version")),
            status=str(c.get("status")),
            description=c.get("description"),
            max_grant_amount=float(c.get("max_grant_amount", 100000.0)),
            max_prep_months=int(c.get("max_prep_months", 3)),
            max_test_months=int(c.get("max_test_months", 9)),
            created_at=c.get("created_at"),
            updated_at=c.get("updated_at"),
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Nabór o ID '{call_id}' nie istnieje.",
    )


# ==============================================================================
# 2. WNIOSKI GRANTOWE (GRANT APPLICATIONS)
# ==============================================================================

def create_grant_application(
    user_id: str, data: GrantApplicationCreate
) -> GrantApplicationResponse:
    """
    Tworzy nowy roboczy wniosek grantowy ('roboczy') dla wskazanego naboru.
    Sprawdza, czy nabór nie jest zamknięty.
    """
    call = get_grant_call_by_id(data.call_id)
    if not call:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nabór grantowy o ID '{data.call_id}' nie istnieje.",
        )

    if call.status == "zamkniety":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nabór '{call.name}' został zamknięty. Tworzenie i składanie wniosków jest zablokowane.",
        )

    app_id = str(uuid.uuid4())
    now_str = datetime.now(timezone.utc).isoformat()

    row_data: Dict[str, Any] = {
        "id": app_id,
        "call_id": data.call_id,
        "user_id": user_id,
        "status": "roboczy",
        "applicant_type": data.applicant_type,
        "title": data.title or "",
        "applicant_data": data.applicant_data or {},
        "innovation_description": data.innovation_description or "",
        "innovativeness": data.innovativeness or "",
        "problem_diagnosis": data.problem_diagnosis or "",
        "target_group_description": data.target_group_description or "",
        "expected_change": data.expected_change or "",
        "future_vision": data.future_vision or "",
        "action_plan": data.action_plan or {"prep_period": [], "test_period": []},
        "grant_amount": float(data.grant_amount or 0.0),
        "project_team": data.project_team or "",
        "declarations": data.declarations or {},
        "submitted_at": None,
        "rops_notes": None,
        "created_at": now_str,
        "updated_at": now_str,
    }

    supabase = get_supabase_client()
    if supabase:
        try:
            res = supabase.table("grant_applications").insert(row_data).execute()
            inserted = _to_dict(res.data)
            if inserted:
                return _map_application_to_response(inserted, call_info=call.model_dump())
        except Exception:
            pass

    # Pamięć fallback
    _memory_applications_store[app_id] = dict(row_data)
    return _map_application_to_response(row_data, call_info=call.model_dump())


def list_user_applications(user_id: str) -> List[GrantApplicationResponse]:
    """
    Pobiera wszystkie wnioski danego autora (pełna izolacja danych).
    """
    supabase = get_supabase_client()
    if supabase:
        try:
            res = (
                supabase.table("grant_applications")
                .select("*, grant_calls(name, status)")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )
            rows = _to_dict_list(res.data)
            return [_map_application_to_response(r) for r in rows]
        except Exception:
            pass

    # Pamięć fallback
    user_rows = [
        r for r in _memory_applications_store.values() if r.get("user_id") == user_id
    ]
    user_rows.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    results: List[GrantApplicationResponse] = []
    for r in user_rows:
        c_info = _memory_calls_store.get(r.get("call_id"))
        results.append(_map_application_to_response(r, call_info=c_info))
    return results


def get_application_by_id_raw(application_id: str) -> Optional[Dict[str, Any]]:
    """Pobiera surowy rekord wniosku z bazy lub pamięci."""
    supabase = get_supabase_client()
    if supabase:
        try:
            res = (
                supabase.table("grant_applications")
                .select("*, grant_calls(name, status)")
                .eq("id", application_id)
                .limit(1)
                .execute()
            )
            r = _to_dict(res.data)
            if r:
                return r
        except Exception:
            pass

    if application_id in _memory_applications_store:
        r = dict(_memory_applications_store[application_id])
        c = _memory_calls_store.get(r.get("call_id"))
        if c:
            r["grant_calls"] = {"name": c.get("name"), "status": c.get("status")}
        return r
    return None


def get_application_for_author(
    application_id: str, user_id: str, is_admin: bool = False
) -> GrantApplicationResponse:
    """
    Pobiera pojedynczy wniosek z rygorystyczną kontrolą dostępu:
    - autor ma dostęp wyłącznie do swojego wniosku
    - administrator ROPS ma wgląd we wszystkie wnioski
    """
    row = get_application_by_id_raw(application_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Wniosek grantowy o ID '{application_id}' nie został odnaleziony.",
        )

    # Kontrola izolacji autorów
    if not is_admin and str(row.get("user_id")) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Brak uprawnień. Nie możesz wyświetlić wniosku innego autora.",
        )

    return _map_application_to_response(row)


def update_draft_application(
    application_id: str, user_id: str, update_data: GrantApplicationUpdate
) -> GrantApplicationResponse:
    """
    Trwały zapis roboczy wniosku grantowego.
    Autor może edytować wyłącznie własny wniosek i wyłącznie w statusie 'roboczy'.
    """
    row = get_application_by_id_raw(application_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Wniosek grantowy o ID '{application_id}' nie został odnaleziony.",
        )

    if str(row.get("user_id")) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Brak uprawnień. Nie możesz modyfikować wniosku innego autora.",
        )

    current_status = str(row.get("status", "roboczy"))
    if current_status != "roboczy":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Złożony wniosek (status: '{current_status}') został zablokowany przed edycją. Modyfikować można wyłącznie wnioski w statusie 'roboczy'.",
        )

    now_str = datetime.now(timezone.utc).isoformat()
    update_dict: Dict[str, Any] = {"updated_at": now_str}

    if update_data.title is not None:
        update_dict["title"] = update_data.title
    if update_data.applicant_type is not None:
        update_dict["applicant_type"] = update_data.applicant_type
    if update_data.applicant_data is not None:
        update_dict["applicant_data"] = update_data.applicant_data
    if update_data.innovation_description is not None:
        update_dict["innovation_description"] = update_data.innovation_description
    if update_data.innovativeness is not None:
        update_dict["innovativeness"] = update_data.innovativeness
    if update_data.problem_diagnosis is not None:
        update_dict["problem_diagnosis"] = update_data.problem_diagnosis
    if update_data.target_group_description is not None:
        update_dict["target_group_description"] = update_data.target_group_description
    if update_data.expected_change is not None:
        update_dict["expected_change"] = update_data.expected_change
    if update_data.future_vision is not None:
        update_dict["future_vision"] = update_data.future_vision
    if update_data.action_plan is not None:
        update_dict["action_plan"] = update_data.action_plan
    if update_data.grant_amount is not None:
        update_dict["grant_amount"] = float(update_data.grant_amount)
    if update_data.project_team is not None:
        update_dict["project_team"] = update_data.project_team
    if update_data.declarations is not None:
        update_dict["declarations"] = update_data.declarations

    supabase = get_supabase_client()
    if supabase:
        try:
            res = (
                supabase.table("grant_applications")
                .update(update_dict)
                .eq("id", application_id)
                .execute()
            )
            inserted = _to_dict(res.data)
            if inserted:
                return _map_application_to_response(inserted)
        except Exception:
            pass

    # Pamięć fallback
    if application_id in _memory_applications_store:
        _memory_applications_store[application_id].update(update_dict)
        return _map_application_to_response(_memory_applications_store[application_id])

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Błąd trwałego zapisu roboczego wniosku grantowego.",
    )


def submit_grant_application(application_id: str, user_id: str) -> GrantApplicationResponse:
    """
    Oficjalne złożenie wniosku grantowego w naborze.
    Przeprowadza ścisłą walidację wymogów formalnych i spójności kosztorysu zgodnie ze wzorem:
    1. Sprawdzenie stanu naboru (blokada dla naboru zamkniętego).
    2. Weryfikacja wymaganych sekcji (tytuł, dane kontaktowe, opis, innowacyjność, diagnoza, grupa docelowa, zmiana, wizja, zespół).
    3. Walidacja zgodności kosztów: suma pozycji w planie działania == wnioskowana kwota grantu.
    4. Świadome potwierdzenie oświadczeń prawnych (brak możliwości auto-generowania oświadczeń).
    """
    row = get_application_by_id_raw(application_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Wniosek grantowy o ID '{application_id}' nie został odnaleziony.",
        )

    if str(row.get("user_id")) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Brak uprawnień. Nie możesz złożyć cudzego wniosku.",
        )

    current_status = str(row.get("status", "roboczy"))
    if current_status != "roboczy":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Wniosek został już złożony (aktualny status: '{current_status}'). Ponowne złożenie jest niedozwolone.",
        )

    # 1. Sprawdzenie naboru
    call_id = str(row.get("call_id"))
    call = get_grant_call_by_id(call_id)
    if not call:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Powiązany nabór grantowy nie istnieje.",
        )

    if call.status == "zamkniety":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nabór '{call.name}' jest zamknięty. Składanie wniosków zostało zablokowane przez organizatora.",
        )

    # 2. Walidacja merytoryczna pól wymaganych wg Załącznika nr 3
    errors: List[str] = []

    title = str(row.get("title", "")).strip()
    if len(title) < 3:
        errors.append("Pkt 1: Podaj krótki i jednoznaczny tytuł innowacji (min. 3 znaki).")

    applicant_data = row.get("applicant_data") or {}
    applicant_type = str(row.get("applicant_type", "osoba_fizyczna"))

    if applicant_type == "osoba_fizyczna":
        first_name = str(applicant_data.get("first_name", "")).strip()
        last_name = str(applicant_data.get("last_name", "")).strip()
        email = str(applicant_data.get("email", "")).strip()
        if not first_name or not last_name:
            errors.append("Pkt 2: Podaj imię i nazwisko osoby fizycznej aplikującej o grant.")
        if not email or "@" not in email:
            errors.append("Pkt 2: Podaj poprawny adres e-mail do kontaktu.")
    elif applicant_type == "podmiot":
        org_name = str(applicant_data.get("organization_name", "")).strip()
        nip = str(applicant_data.get("nip", "")).strip()
        krs = str(applicant_data.get("krs", "")).strip()
        email = str(applicant_data.get("email", "")).strip()
        if not org_name:
            errors.append("Pkt 2: Podaj pełną nazwę wnioskującego podmiotu/instytucji.")
        if not nip and not krs:
            errors.append("Pkt 2: Podaj NIP lub KRS wnioskującego podmiotu.")
        if not email or "@" not in email:
            errors.append("Pkt 2: Podaj poprawny adres e-mail podmiotu.")
    elif applicant_type == "grupa_nieformalna":
        partners = applicant_data.get("partners", [])
        rep = applicant_data.get("representative") or {}
        if not partners and not rep.get("name"):
            errors.append("Pkt 2: Wskaż partnerów grupy nieformalnej oraz reprezentanta do kontaktów.")

    desc = str(row.get("innovation_description", "")).strip()
    if len(desc) < 20:
        errors.append("Pkt 3: Uzupełnij opis innowacji (na czym polega, charakter, realizacja celu włączenia społecznego).")

    innov = str(row.get("innovativeness", "")).strip()
    if len(innov) < 20:
        errors.append("Pkt 4: Uzupełnij opis innowacyjności rozwiązania na tle innych dostępnych w Polsce.")

    diag = str(row.get("problem_diagnosis", "")).strip()
    if len(diag) < 20:
        errors.append("Pkt 5: Wskaż diagnozę problemu społecznego oraz dane statystyczne/raporty.")

    target = str(row.get("target_group_description", "")).strip()
    if len(target) < 15:
        errors.append("Pkt 6: Przedstaw opis grupy odbiorców innowacji i powody wykluczenia społecznego.")

    change = str(row.get("expected_change", "")).strip()
    if len(change) < 15:
        errors.append("Pkt 7: Opisz zmianę, jaką rozwiązanie wprowadzi w życiu odbiorców.")

    future = str(row.get("future_vision", "")).strip()
    if len(future) < 15:
        errors.append("Pkt 8: Przedstaw wizję przyszłości innowacji, skalowalność i wdrażalność.")

    team = str(row.get("project_team", "")).strip()
    if len(team) < 10:
        errors.append("Pkt 11: Wskaż zespół projektowy i jego doświadczenie we wdrażaniu innowacji.")

    # 3. Walidacja zgodności kosztów (Budget consistency)
    grant_amount = float(row.get("grant_amount", 0.0) or 0.0)
    if grant_amount <= 0:
        errors.append("Pkt 10: Wnioskowana kwota grantu musi być większa od zera.")
    elif grant_amount > call.max_grant_amount:
        errors.append(
            f"Pkt 10: Wnioskowana kwota ({grant_amount:.2f} zł) przekracza maksymalny limit naboru ({call.max_grant_amount:.2f} zł)."
        )

    action_plan = row.get("action_plan") or {"prep_period": [], "test_period": []}
    if not isinstance(action_plan, dict):
        action_plan = {"prep_period": [], "test_period": []}

    total_costs = _calculate_costs(action_plan)
    cost_diff = abs(total_costs - grant_amount)
    if cost_diff > 0.01:
        errors.append(
            f"Pkt 9 i 10 (Niezgodność budżetowa): Suma pozycji kosztowych w planie działania ({total_costs:.2f} zł) "
            f"nie zgadza się z wnioskowaną kwotą grantu ({grant_amount:.2f} zł). Różnica: {cost_diff:.2f} zł. "
            f"Wyrównaj kosztorys przed złożeniem wniosku."
        )

    # 4. Świadome potwierdzenie oświadczeń
    declarations = row.get("declarations") or {}
    all_confirmed = bool(declarations.get("all_confirmed", False))
    if not all_confirmed:
        errors.append(
            "Pkt 12: Wymagane jest świadome potwierdzenie wszystkich oświadczeń prawnych (w tym odpowiedzialności karnej "
            "z art. 297 kk, braku podwójnego finansowania i akceptacji procedur naboru)."
        )

    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "Formularz wniosku zawiera błędy walidacji uniemożliwiające jego złożenie.",
                "errors": errors,
            },
        )

    # Wszystkie walidacje zaliczone -> zmiana statusu na 'zlozony'
    now_str = datetime.now(timezone.utc).isoformat()
    update_payload = {
        "status": "zlozony",
        "submitted_at": now_str,
        "updated_at": now_str,
    }

    supabase = get_supabase_client()
    if supabase:
        try:
            res = (
                supabase.table("grant_applications")
                .update(update_payload)
                .eq("id", application_id)
                .execute()
            )
            inserted = _to_dict(res.data)
            if inserted:
                return _map_application_to_response(inserted, call_info=call.model_dump())
        except Exception:
            pass

    # Pamięć fallback
    if application_id in _memory_applications_store:
        _memory_applications_store[application_id].update(update_payload)
        return _map_application_to_response(
            _memory_applications_store[application_id], call_info=call.model_dump()
        )

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Błąd trwałego zapisu złożenia wniosku grantowego.",
    )


# ==============================================================================
# 3. EKSPORT I PODGLĄD WNIOSKU (FORMAT ZAŁĄCZNIKA NR 3)
# ==============================================================================

def export_grant_application(
    application_id: str, user_id: str, is_admin: bool = False
) -> GrantApplicationExportResponse:
    """
    Generuje sformatowany podgląd i pełny dokument wniosku gotowy do eksportu
    oraz wydruku, zgodnie z układem Załącznika nr 3 do Ogłoszenia ROPS Kraków.
    """
    app_obj = get_application_for_author(application_id, user_id, is_admin=is_admin)
    call = get_grant_call_by_id(app_obj.call_id) or GrantCallResponse(
        id=app_obj.call_id,
        name="Inkubator Włączenia Społecznego 2.0 (ROPS Kraków)",
        template_name="za._3._Formularz_aplikacyjny_wzor.pdf",
        template_version="1.0",
        status="demonstracyjny",
        max_grant_amount=100000.0,
        max_prep_months=3,
        max_test_months=9,
    )

    # Formatowanie danych wnioskodawcy
    app_data = app_obj.applicant_data
    if app_obj.applicant_type == "osoba_fizyczna":
        applicant_desc = (
            f"Osoba fizyczna: {app_data.get('first_name', '')} {app_data.get('last_name', '')}\n"
            f"Adres: {app_data.get('address', {}).get('street', '')}, "
            f"{app_data.get('address', {}).get('postal_code', '')} {app_data.get('address', {}).get('city', '')}\n"
            f"Telefon: {app_data.get('phone', 'Brak')} | E-mail: {app_data.get('email', 'Brak')}"
        )
    elif app_obj.applicant_type == "podmiot":
        applicant_desc = (
            f"Podmiot: {app_data.get('organization_name', '')}\n"
            f"NIP: {app_data.get('nip', 'Brak')} | REGON: {app_data.get('regon', 'Brak')} | KRS: {app_data.get('krs', 'Brak')}\n"
            f"Siedziba: {app_data.get('address', {}).get('street', '')}, "
            f"{app_data.get('address', {}).get('postal_code', '')} {app_data.get('address', {}).get('city', '')}\n"
            f"Reprezentant: {app_data.get('authorized_representative', {}).get('name', 'Brak')}\n"
            f"Kontakt: {app_data.get('email', 'Brak')} | Tel: {app_data.get('phone', 'Brak')}"
        )
    else:
        applicant_desc = f"Grupa nieformalna: {len(app_data.get('partners', []))} partnerów"

    # Formatowanie planu działania
    plan = app_obj.action_plan
    prep_lines = []
    for idx, p in enumerate(plan.get("prep_period", []), 1):
        prep_lines.append(
            f"  {idx}. {p.get('action_name')} | Termin: {p.get('schedule')} | Koszt: {float(p.get('cost', 0)):.2f} PLN"
        )
    prep_text = "\n".join(prep_lines) if prep_lines else "  Brak wprowadzonych działań przygotowawczych."

    test_lines = []
    for idx, t in enumerate(plan.get("test_period", []), 1):
        faza = f"[{t.get('phase', 'Faza').upper()}] " if t.get("phase") else ""
        test_lines.append(
            f"  {idx}. {faza}{t.get('action_name')} | Termin: {t.get('schedule')} | Koszt: {float(t.get('cost', 0)):.2f} PLN"
        )
    test_text = "\n".join(test_lines) if test_lines else "  Brak wprowadzonych działań testowych."

    budget_status_str = (
        "ZGODNY (Suma pozycji odpowiada wnioskowanej kwocie)"
        if app_obj.is_budget_balanced
        else f"NIEZGODNY (Różnica: {abs(app_obj.total_costs_calculated - app_obj.grant_amount):.2f} PLN)"
    )

    decl = app_obj.declarations
    all_conf_str = "POTWIERDZONE ŚWIADOMIE (TAK)" if decl.get("all_confirmed") else "BRAK POTWIERDZENIA (NIE)"

    doc_text = f"""================================================================================
ZAŁĄCZNIK NR 3 DO OGŁOSZENIA
FORMULARZ APLIKACYJNY – INKUBATOR WŁĄCZENIA SPOŁECZNEGO 2.0
Działanie 5.1 Innowacje społeczne – Program FERS 2021-2027
Regionalny Ośrodek Polityki Społecznej w Krakowie
================================================================================

NABÓR: {call.name}
WZÓR DOKUMENTU: {call.template_name} (wersja {call.template_version})
STAN NABORU: {call.status.upper()}
IDENTYFIKATOR WNIOSKU: {app_obj.id}
STATUS WNIOSKU: {app_obj.status.upper()}
DATA ZŁOŻENIA: {app_obj.submitted_at or "Wersja robocza (jeszcze niezłożony)"}

--------------------------------------------------------------------------------
1. TYTUŁ INNOWACJI
--------------------------------------------------------------------------------
{app_obj.title or "(Brak tytułu)"}

--------------------------------------------------------------------------------
2. DANE POMYSŁODAWCY
--------------------------------------------------------------------------------
{applicant_desc}

--------------------------------------------------------------------------------
3. OPIS INNOWACJI
--------------------------------------------------------------------------------
{app_obj.innovation_description or "(Brak opisu)"}

--------------------------------------------------------------------------------
4. INNOWACYJNOŚĆ ROZWIĄZANIA
--------------------------------------------------------------------------------
{app_obj.innovativeness or "(Brak opisu)"}

--------------------------------------------------------------------------------
5. DIAGNOZA PROBLEMU
--------------------------------------------------------------------------------
{app_obj.problem_diagnosis or "(Brak opisu)"}

--------------------------------------------------------------------------------
6. OPIS ODBIORCÓW INNOWACJI
--------------------------------------------------------------------------------
{app_obj.target_group_description or "(Brak opisu)"}

--------------------------------------------------------------------------------
7. ZMIANA JAKĄ WPROWADZA INNOWACJA
--------------------------------------------------------------------------------
{app_obj.expected_change or "(Brak opisu)"}

--------------------------------------------------------------------------------
8. WIZJA PRZYSZŁOŚCI INNOWACJI
--------------------------------------------------------------------------------
{app_obj.future_vision or "(Brak opisu)"}

--------------------------------------------------------------------------------
9. PLAN DZIAŁANIA I KOSZTORYS
--------------------------------------------------------------------------------
A. Okres przygotowawczy (maks. {call.max_prep_months} msc):
{prep_text}

B. Okres testowania (maks. {call.max_test_months} msc):
{test_text}

--------------------------------------------------------------------------------
10. WNIOSKOWANA KWOTA GRANTU
--------------------------------------------------------------------------------
Wnioskowana kwota grantu: {app_obj.grant_amount:.2f} PLN
Suma kosztów cząstkowych:  {app_obj.total_costs_calculated:.2f} PLN
Status weryfikacji budżetu: {budget_status_str}

--------------------------------------------------------------------------------
11. ZESPÓŁ PROJEKTOWY I JEGO DOŚWIADCZENIE
--------------------------------------------------------------------------------
{app_obj.project_team or "(Brak opisu zespołu)"}

--------------------------------------------------------------------------------
12. OŚWIADCZENIA PRAWNE WNIOSKODAWCY (Art. 297 § 1 k.k.)
--------------------------------------------------------------------------------
Status oświadczeń: {all_conf_str}
- Odpowiedzialność karna za poświadczenie nieprawdy (art. 297 § 1 k.k. do lat 5)
- Brak podwójnego finansowania w ramach V Osi FERS Działanie 5.1
- Akceptacja procedur naboru Inkubatora Włączenia Społecznego 2.0
- Brak pobierania opłat od uczestników testu innowacji
- Zgodność z zasadami dostępności, równości szans oraz zasadą DNSH
- Wypełnienie obowiązków informacyjnych RODO
================================================================================
"""

    return GrantApplicationExportResponse(
        application_id=app_obj.id,
        call_name=call.name,
        template_name=call.template_name,
        template_version=call.template_version,
        status=app_obj.status,
        submitted_at=app_obj.submitted_at,
        structured_data=app_obj.model_dump(),
        formatted_document_text=doc_text,
    )


# ==============================================================================
# 4. PANEL ADMINISTRATORA ROPS KRAKÓW
# ==============================================================================

def admin_list_applications(
    call_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
) -> List[GrantApplicationResponse]:
    """
    Pobiera wszystkie wnioski grantowe dla Administratora ROPS Kraków z filtrami.
    """
    supabase = get_supabase_client()
    if supabase:
        try:
            query = supabase.table("grant_applications").select("*, grant_calls(name, status)")
            if call_id:
                query = query.eq("call_id", call_id)
            if status_filter:
                query = query.eq("status", status_filter)
            res = query.order("created_at", desc=True).limit(limit).execute()
            rows = _to_dict_list(res.data)
            return [_map_application_to_response(r) for r in rows]
        except Exception:
            pass

    # Pamięć fallback
    rows = list(_memory_applications_store.values())
    if call_id:
        rows = [r for r in rows if r.get("call_id") == call_id]
    if status_filter:
        rows = [r for r in rows if r.get("status") == status_filter]
    rows.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    rows = rows[:limit]

    results: List[GrantApplicationResponse] = []
    for r in rows:
        c_info = _memory_calls_store.get(r.get("call_id"))
        results.append(_map_application_to_response(r, call_info=c_info))
    return results


def admin_update_application_status(
    application_id: str,
    update_data: GrantApplicationStatusUpdate,
    admin_id: str,
) -> GrantApplicationResponse:
    """
    Aktualizuje status wniosku w procesie oceny ROPS Kraków:
    'w_ocenie', 'zaakceptowany', 'odrzucony' + notatka urzędowa.
    """
    allowed_statuses = {"w_ocenie", "zaakceptowany", "odrzucony", "roboczy", "zlozony"}
    cleaned_status = update_data.status.strip().lower()
    if cleaned_status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Niedozwolony status oceny: '{update_data.status}'. Dozwolone to: {sorted(list(allowed_statuses))}.",
        )

    now_str = datetime.now(timezone.utc).isoformat()
    update_dict: Dict[str, Any] = {
        "status": cleaned_status,
        "reviewed_by": admin_id,
        "reviewed_at": now_str,
        "updated_at": now_str,
    }
    if update_data.rops_notes is not None:
        update_dict["rops_notes"] = update_data.rops_notes

    supabase = get_supabase_client()
    if supabase:
        try:
            res = (
                supabase.table("grant_applications")
                .update(update_dict)
                .eq("id", application_id)
                .execute()
            )
            inserted = _to_dict(res.data)
            if inserted:
                return _map_application_to_response(inserted)
        except Exception:
            pass

    if application_id in _memory_applications_store:
        _memory_applications_store[application_id].update(update_dict)
        r = _memory_applications_store[application_id]
        c_info = _memory_calls_store.get(r.get("call_id"))
        return _map_application_to_response(r, call_info=c_info)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Wniosek grantowy o ID '{application_id}' nie został odnaleziony.",
    )

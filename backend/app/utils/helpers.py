"""
Współdzielone funkcje pomocnicze dla endpointów API HubMI.
Wyekstrahowane z innovations.py, admin.py, submissions.py dla eliminacji duplikacji.
"""
from typing import Any, Dict, List, Optional


def to_str(val: Any) -> Optional[str]:
    """Konwertuje wartość na oczyszczony string lub None."""
    return str(val).strip() if val is not None and str(val).strip() else None


def to_float(val: Any, default: float = 0.85) -> float:
    """Bezpieczna konwersja na float z fallbackiem."""
    try:
        f = float(val) if val is not None else default
        return round(f, 4)
    except (ValueError, TypeError):
        return default


def to_dict_list(data: Any) -> List[Dict[str, Any]]:
    """Konwertuje odpowiedź Supabase na listę słowników z walidacją typów."""
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def to_dict(data: Any) -> Dict[str, Any]:
    """Konwertuje odpowiedź Supabase na pojedynczy słownik z walidacją typów."""
    if isinstance(data, dict):
        return data
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        return data[0]
    return {}

"""
Moduł sanityzacji danych wejściowych (XSS/HTML) i walidacji identyfikatorów.
Zapobiega atakom Stored XSS i injection w polach tekstowych HubMI.
"""
import re
from typing import Optional

# Wzorce niebezpiecznych tagów/atrybutów HTML/JS
_DANGEROUS_PATTERNS = [
    re.compile(r"<\s*script[^>]*>.*?</\s*script\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<\s*script[^>]*>", re.IGNORECASE),
    re.compile(r"</\s*script\s*>", re.IGNORECASE),
    re.compile(r"<\s*style[^>]*>.*?</\s*style\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<\s*style[^>]*>", re.IGNORECASE),
    re.compile(r"</\s*style\s*>", re.IGNORECASE),
    re.compile(r"<\s*iframe[^>]*>.*?</\s*iframe\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<\s*iframe[^>]*>", re.IGNORECASE),
    re.compile(r"<\s*object[^>]*>.*?</\s*object\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<\s*object[^>]*>", re.IGNORECASE),
    re.compile(r"<\s*embed[^>]*>", re.IGNORECASE),
    re.compile(r"<\s*svg[^>]*>.*?</\s*svg\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<\s*svg[^>]*>", re.IGNORECASE),
    re.compile(r"<\s*form[^>]*>", re.IGNORECASE),
    re.compile(r"<\s*input[^>]*>", re.IGNORECASE),
    re.compile(r"<\s*img[^>]*>", re.IGNORECASE),
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"vbscript\s*:", re.IGNORECASE),
    re.compile(r"on\w+\s*=\s*(?:'[^']*'|\"[^\"]*\"|[^\s>]+)", re.IGNORECASE),
    re.compile(r"data\s*:\s*text/html", re.IGNORECASE),
    re.compile(r"expression\s*\(", re.IGNORECASE),  # CSS expression()
]

# Wzorzec dozwolonego ID innowacji: alfanumeryczne, podkreślniki, myślniki (1-64 znaki, zapobiega injection)
_VALID_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")

# Wzorzec UUID (submissions, messages)
_UUID_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def sanitize_text(text: str) -> str:
    """
    Oczyszcza tekst z niebezpiecznych wzorców HTML/JS (XSS prevention).
    Zachowuje treść merytoryczną, usuwa wyłącznie potencjalnie szkodliwe elementy.
    """
    if not text:
        return text

    cleaned = text
    for pattern in _DANGEROUS_PATTERNS:
        cleaned = pattern.sub("", cleaned)

    # Usunięcie zerowych bajtów (null byte injection)
    cleaned = cleaned.replace("\x00", "")

    # Normalizacja whitespace (wielokrotne spacje → jedna)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)

    return cleaned.strip()


def sanitize_optional(text: Optional[str]) -> Optional[str]:
    """Sanityzuje opcjonalny tekst (None → None)."""
    if text is None:
        return None
    result = sanitize_text(text)
    return result if result else None


def is_valid_innovation_id(id_str: str) -> bool:
    """Sprawdza czy ID innowacji ma poprawny format (inv_XXXX lub UUID)."""
    return bool(_VALID_ID_PATTERN.match(id_str.strip()))


def is_valid_uuid(id_str: str) -> bool:
    """Sprawdza czy string jest poprawnym UUID."""
    return bool(_UUID_PATTERN.match(id_str.strip()))


def safe_error_message(endpoint_name: str = "operacja") -> str:
    """
    Zwraca bezpieczny komunikat błędu bez ujawniania szczegółów wewnętrznych.
    Szczegóły powinny być zalogowane w loggerze, nie w odpowiedzi HTTP.
    """
    return f"Wystąpił wewnętrzny błąd serwera podczas przetwarzania żądania ({endpoint_name}). Spróbuj ponownie za chwilę."

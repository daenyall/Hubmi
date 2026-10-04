import hashlib
import json
import logging
import math
import os
import re
from functools import lru_cache
from typing import List, Optional, Any, Dict
import requests

from app.core.config import settings

logger = logging.getLogger(__name__)
# Inicjalizacja klienta OpenAI tylko jeśli klucz jest ustawiony
_openai_client = None


def get_openai_client():
    global _openai_client
    if _openai_client is not None:
        return _openai_client
    if settings.OPENAI_API_KEY and settings.OPENAI_API_KEY.startswith("sk-"):
        try:
            from openai import OpenAI
            _openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
            return _openai_client
        except Exception as e:
            logger.warning("Failed to initialize OpenAI client: %s", e)
            return None
    return None


def calculate_cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Oblicza podobieństwo cosinusowe pomiędzy dwoma wektorami."""
    if len(vec_a) != len(vec_b) or not vec_a:
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def _get_gemini_embedding(text: str) -> Optional[List[float]]:
    """Pobiera embedding z Google Gemini (gemini-embedding-2) i normalizuje do 1536D."""
    if not settings.GEMINI_API_KEY:
        return None
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key={settings.GEMINI_API_KEY}"
        payload = {
            "model": "models/gemini-embedding-2",
            "content": {"parts": [{"text": text[:2000]}]},
            "outputDimensionality": 1536,
        }
        res = requests.post(url, json=payload, timeout=10)
        if res.status_code == 200:
            data = res.json()
            values = data.get("embedding", {}).get("values", [])
            if values:
                if len(values) < 1536:
                    values = values + [0.0] * (1536 - len(values))
                norm = math.sqrt(sum(x * x for x in values))
                if norm > 0:
                    values = [round(x / norm, 6) for x in values]
                return values[:1536]
        else:
            logger.warning("Gemini API returned status %s: %s", res.status_code, res.text)
    except Exception as e:
        logger.warning("Gemini embedding error: %s", e)
    return None



def _fallback_deterministic_embedding(text: str, dim: int = 1536) -> List[float]:
    """
    Zapasowy generator wektorów (gdy brak klucza API lub brak internetu).
    Generuje znormalizowany wektor 1536D na bazie słów kluczowych i hashowania,
    zapewniając poprawne działanie operacji wektorowych w pgvector bez błędów.
    """
    words = [w for w in re.split(r"[^\w]+", text.lower()) if w]
    vector = [0.0] * dim
    
    for word in words:
        h = int(hashlib.sha256(word.encode("utf-8")).hexdigest(), 16)
        idx1 = (h) % dim
        idx2 = (h >> 16) % dim
        idx3 = (h >> 32) % dim
        weight = 1.0 / (1.0 + len(word) * 0.1)
        vector[idx1] += weight
        vector[idx2] += weight * 0.5
        vector[idx3] += weight * 0.25

    norm = math.sqrt(sum(x * x for x in vector))
    if norm > 0:
        vector = [round(x / norm, 6) for x in vector]
    else:
        vector[0] = 1.0
    return vector


def get_active_embedding_model() -> str:
    """
    Zwraca jednoznaczny identyfikator aktywnego modelu embeddingów.
    Baza ROPS i pgvector są zsynchronizowane z przestrzenią wektorową gemini-embedding-2 (1536D).
    """
    if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip():
        return "gemini-embedding-2"
    if settings.OPENAI_API_KEY and settings.OPENAI_API_KEY.strip():
        return "text-embedding-3-small"
    return "deterministic-test-fallback"


@lru_cache(maxsize=1024)
def _get_embedding_tuple(clean_text: str, model_name: Optional[str] = None) -> tuple:
    """
    Pobiera embedding jako niezmienną krotkę z buforowaniem LRU.
    Klucz bufora zawiera model_name, zapobiegając mieszaniu różnych przestrzeni wektorowych.
    Po awarii aktywnego modelu zwraca jawny wyjątek zamiast cichego przełączania przestrzeni.
    """
    active_model = model_name or get_active_embedding_model()

    if active_model == "gemini-embedding-2":
        gemini_vec = _get_gemini_embedding(clean_text)
        if gemini_vec:
            return tuple(gemini_vec)
        logger.error("Błąd usługi embeddingów Gemini: brak odpowiedzi lub błąd API.")
        raise RuntimeError("Błąd usługi embeddingów Gemini: API zwróciło błąd lub brak odpowiedzi. Sprawdź klucz GEMINI_API_KEY.")

    if active_model == "text-embedding-3-small":
        client = get_openai_client()
        if client:
            try:
                response = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=clean_text,
                )
                return tuple(response.data[0].embedding)
            except Exception as e:
                logger.error("OpenAI embedding error: %s", e)
                raise RuntimeError(f"Błąd usługi embeddingów OpenAI: {e}")
        raise RuntimeError("Klient OpenAI nie jest skonfigurowany.")

    # Tryb awaryjny wyłącznie w środowisku testowym (pytest) bez skonfigurowanych kluczy
    is_test_runner = os.environ.get("PYTEST_CURRENT_TEST") is not None
    if not is_test_runner:
        logger.error("Brak skonfigurowanych kluczy API AI (GEMINI_API_KEY ani OPENAI_API_KEY) poza środowiskiem testowym.")
        raise RuntimeError(
            "Brak skonfigurowanych kluczy API AI (GEMINI_API_KEY ani OPENAI_API_KEY). "
            "Cichy fallback deterministyczny matchmakingu jest zablokowany poza środowiskiem testowym."
        )

    return tuple(_fallback_deterministic_embedding(clean_text))


def create_embedding(text: str) -> List[float]:
    """
    Tworzy embedding dla danego tekstu za pomocą jednego, aktywnego modelu.
    Gwarantuje spójność przestrzeni wektorowej (1536D) i jawną sygnalizację błędów.
    """
    clean_text = " ".join(text.strip().split())
    if not clean_text:
        return [0.0] * 1536
    active_model = get_active_embedding_model()
    return list(_get_embedding_tuple(clean_text, active_model))


def _build_adaptation_prompt(
    innovation_title: str,
    innovation_desc: str,
    context: str,
    municipality_type: Optional[str] = None,
    budget_range: Optional[str] = None,
    time_horizon: Optional[str] = None,
    key_partners: Optional[list[str]] = None,
) -> str:
    partners_text = ", ".join(key_partners) if key_partners else "CUS / GOPS, Koło Gospodyń Wiejskich (KGW), Ochotnicza Straż Pożarna (OSP), lokalne stowarzyszenia"
    muni_type_text = municipality_type or "Gmina wiejska / miejsko-wiejska"
    budget_text = budget_range or "15 000 – 30 000 PLN (faza pilotażowa)"
    time_text = time_horizon or "3 miesiące (faza pilotażowa)"
    desc_text = innovation_desc.strip() if innovation_desc and innovation_desc.strip() else "Innowacja społeczna inkubowana w ramach programów ROPS Kraków"

    return f"""Jesteś Głównym Doradcą ds. Skalowania i Adaptacji Innowacji Społecznych w Regionalnym Ośrodku Polityki Społecznej w Krakowie (ROPS Kraków).
Twoim celem jest przygotowanie profesjonalnego, gotowego do wdrożenia Planu Adaptacji Innowacji Społecznej dla zgłaszającej się instytucji.

DANE WEJŚCIOWE ZGŁOSZENIA:
- Innowacja: {innovation_title}
- Opis oryginalny: {desc_text}
- Kontekst i specyfika gminy/instytucji: {context}
- Typ samorządu: {muni_type_text}
- Szacowany budżet: {budget_text}
- Horyzont czasowy pilotażu: {time_text}
- Lokalni partnerzy: {partners_text}

WYTYCZNE DLA PLANU ADAPTACJI (zwróć w przejrzystym Markdown):
1. **Diagnoza i Rola Lokalnych Partnerów**:
   - Konkretny podział zadań pomiędzy JST/CUS a partnerami lokalnymi (np. OSP jako logistyka/transport seniorów, KGW jako animacja społeczna i warsztaty integracyjne, CUS jako koordynacja usług).
2. **Harmonogram Wdrożenia (Kamienie Milowe)**:
   - 3 fazy czasowe (Etap 1: Diagnoza i porozumienia; Etap 2: Warsztaty i pilotaż z grupą docelową; Etap 3: Ewaluacja, feedback i trwałość).
3. **Szacunkowy Kosztorys Wdrożenia**:
   - Sporządź czytelną tabelę Markdown:
     | Pozycja | Zakres / Wydatek | Szacunkowy koszt (PLN) |
     z sumą końcową odpowiadającą budżetowi {budget_text}.
4. **Rekomendowane Źródła Finansowania**:
   - Wskaż konkretne programy: Mikrogranty ROPS Kraków, FERS (Fundusze Europejskie dla Rozwoju Społecznego), PFRON (dostępność i wsparcie OzN), Fundusze Sołeckie, Budżet Obywatelski.
5. **Standard Dostępności i Włączenia Społecznego (WCAG 2.1 AA / Dostępność architektoniczna)**:
   - Rekomendacje dla seniorów i osób z niepełnosprawnościami (teksty łatwe do czytania ETR, asystentura, brak barier architektonicznych).
6. **Kluczowe Wskaźniki Sukcesu (KPI) dla ROPS Kraków**:
   - 3-5 mierzalnych wskaźników do ewaluacji testu innowacji."""


def _get_consistent_grants_proposals() -> list[str]:
    return [
        "Inkubator Włączenia Społecznego ROPS Kraków (propozycja grantu testującego – do weryfikacji w bieżącym naborze)",
        "FERS – Fundusze Europejskie dla Rozwoju Społecznego (potencjalny nabór regionalny – propozycja do weryfikacji)",
        "PFRON – Program Dostępność i wyrównywanie szans (propozycja wsparcia – do weryfikacji)",
        "Fundusze Sołeckie / GKRPA (propozycja lokalnego wkładu własnego – do weryfikacji)",
    ]


def _get_consistent_kpis(muni_type_text: str) -> list[str]:
    return [
        f"Objęcie działaniami pilotażowymi min. 15–25 mieszkańców w jednostce ({muni_type_text})",
        "Uzyskanie min. 85% pozytywnych ocen w formularzu ewaluacyjnym testera ROPS",
        "Sformalizowanie partnerstwa wdrożeniowego z min. 2 lokalnymi organizacjami (np. CUS, OSP, KGW)",
        "Potwierdzenie pełnej zgodności rozwiązań ze standardami dostępności WCAG 2.1 AA / ETR",
    ]


DISCLAIMER_ADAPTATION_PROPOSALS = (
    "Przedstawione źródła finansowania, szacunki budżetowe oraz wskaźniki KPI stanowią propozycje doradcze "
    "generowane przez asystenta adaptacji. Wszystkie rekomendacje finansowania pozostają propozycjami "
    "wymagającymi formalnej weryfikacji z aktualnymi regulaminami i harmonogramami naborów ROPS Kraków."
)


def _build_fallback_adaptation_plan(
    innovation_title: str,
    context: str,
    municipality_type: Optional[str] = None,
    budget_range: Optional[str] = None,
    time_horizon: Optional[str] = None,
    key_partners: Optional[list[str]] = None,
) -> str:
    muni_type = municipality_type or "Gmina wiejska / miejsko-wiejska"
    budget = budget_range or "15 000 – 25 000 PLN (szacunkowy koszt fazy pilotażowej)"
    horizon = time_horizon or "3 miesiące (faza pilotażowa)"
    partners = ", ".join(key_partners) if key_partners else "Centrum Usług Społecznych (CUS), Koło Gospodyń Wiejskich (KGW), Ochotnicza Straż Pożarna (OSP)"

    return f"""### Plan Adaptacji Innowacji Społecznej: {innovation_title}
**Dla samorządu/instytucji**: {context}  
**Typ jednostki**: {muni_type} | **Horyzont czasowy**: {horizon} | **Budżet szacunkowy**: {budget}

---

#### 1. Diagnoza i Rola Lokalnych Partnerów
- **Lider wdrożenia**: Ośrodek Pomocy Społecznej / Centrum Usług Społecznych (CUS) – koordynacja merytoryczna i rekrutacja beneficjentów.
- **Kluczowi partnerzy lokalni**: {partners}.
  - *OSP*: Wsparcie transportowe, logistyczne oraz zabezpieczenie spotkań dla seniorów i osób o ograniczonej mobilności.
  - *KGW*: Animacja społecznościowa, międzypokoleniowa integracja, poczęstunek oraz udostępnienie świetlicy wiejskiej.
  - *Lokalne NGO / Wolontariat*: Prowadzenie warsztatów i asysta osobista.

#### 2. Harmonogram Wdrożenia (Kamienie Milowe)
- **Faza 1 (Tygodnie 1–4) – Przygotowanie i porozumienia**:
  - Podpisanie porozumienia partnerskiego z CUS/OSP/KGW.
  - Opracowanie karty uczestnika i rekrutacja min. 15–25 beneficjentów z grupy docelowej.
  - Weryfikacja barier architektonicznych w lokalach gminnych.
- **Faza 2 (Tygodnie 5–10) – Pilotaż rozwiązania**:
  - Uruchomienie cyklu warsztatów i spotkań integracyjnych.
  - Bieżący monitoring frekwencji i wsparcie asystenckie dla uczestników.
- **Faza 3 (Tygodnie 11–12) – Ewaluacja i trwałość**:
  - Zebranie ankiet ewaluacyjnych (formularz testera innowacji ROPS).
  - Prezentacja wyników na sesji Rady Gminy i decyzja o włączeniu do Gminnego Programu Rozwiązywania Problemów Społecznych.

#### 3. Szacunkowy Kosztorys Wdrożenia
| Pozycja kosztowa | Zakres wydatku | Szacowany koszt (PLN) |
| :--- | :--- | :--- |
| Koordynator projektu | Wynagrodzenie koordynatora lokalnego (3 mies. x 1/2 etatu) | 9 000 PLN |
| Materiały warsztatowe | Pakiety edukacyjne, materiały sensoryczne / techniczne | 4 000 PLN |
| Transport i dostępność | Dowozy OSP dla seniorów i osób z niepełnosprawnościami | 3 000 PLN |
| Poczęstunek i integracja | Przygotowanie poczęstunku przez KGW na 6 spotkań | 2 000 PLN |
| Audyt dostępności i promocja | Opracowanie materiałów ETR (Easy to Read) i promocja lokalna | 2 000 PLN |
| **SUMA CAŁKOWITA** | **Kompletny pilotaż w jednostce ({budget})** | **20 000 PLN** |

#### 4. Rekomendowane Źródła Finansowania (Propozycje Wymagające Weryfikacji)
*Wszystkie poniższe programy są propozycjami doradczymi i wymagają potwierdzenia z harmonogramem ROPS Kraków:*
1. **Inkubator Włączenia Społecznego ROPS Kraków**: Propozycja grantu testującego (do weryfikacji w bieżącym naborze).
2. **FERS – Fundusze Europejskie dla Rozwoju Społecznego**: Potencjalny nabór regionalny (propozycja do weryfikacji).
3. **PFRON – Program Dostępność i wyrównywanie szans**: Propozycja wsparcia (do weryfikacji).
4. **Fundusze Sołeckie / GKRPA**: Propozycja lokalnego wkładu własnego (do weryfikacji).

#### 5. Standard Dostępności i Włączenia Społecznego (WCAG 2.1 AA)
- Wszystkie materiały informacyjne przygotowane w standardzie **tekstu łatwego do czytania (ETR)** z kontrastem minimum 4.5:1.
- Sale warsztatowe z podjazdem dla wózków, pętlą indukcyjną lub asystentem osoby niesłyszącej/niewidomej.
- Możliwość dojazdu „door-to-door” zapewniona we współpracy z lokalną jednostką OSP.

#### 6. Kluczowe Wskaźniki Sukcesu (KPI)
1. **Liczba bezpośrednich odbiorców**: Objęcie działaniami pilotażowymi min. 15–25 mieszkańców w jednostce ({muni_type}).
2. **Wskaźnik zadowolenia**: Uzyskanie min. 85% pozytywnych ocen w formularzu ewaluacyjnym testera ROPS.
3. **Zaangażowanie partnerów**: Sformalizowanie partnerstwa wdrożeniowego z min. 2 lokalnymi organizacjami (np. CUS, OSP, KGW).
4. **Dostępność i trwałość**: Potwierdzenie pełnej zgodności rozwiązań ze standardami dostępności WCAG 2.1 AA / ETR."""


def _generate_gemini_plan(
    innovation_title: str,
    innovation_desc: str,
    context: str,
    municipality_type: Optional[str] = None,
    budget_range: Optional[str] = None,
    time_horizon: Optional[str] = None,
    key_partners: Optional[list[str]] = None,
) -> Optional[str]:
    """Generuje plan adaptacji za pomocą Google Gemini."""
    if not settings.GEMINI_API_KEY:
        return None
    try:
        prompt = _build_adaptation_prompt(
            innovation_title=innovation_title,
            innovation_desc=innovation_desc,
            context=context,
            municipality_type=municipality_type,
            budget_range=budget_range,
            time_horizon=time_horizon,
            key_partners=key_partners,
        )

        for model_name in ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"]:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={settings.GEMINI_API_KEY}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2000},
            }
            res = requests.post(url, json=payload, timeout=8)
            if res.status_code == 200:
                data = res.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    full_text = "".join(p.get("text", "") for p in parts)
                    if full_text.strip():
                        return full_text.strip()
    except Exception as e:
        logger.warning("Gemini completion error: %s", e)
    return None


def generate_adaptation_plan(
    innovation_title: str,
    innovation_desc: str,
    context: str,
    municipality_type: Optional[str] = None,
    budget_range: Optional[str] = None,
    time_horizon: Optional[str] = None,
    key_partners: Optional[list[str]] = None,
) -> Dict[str, Any]:
    """
    Funkcja Asystenta Adaptacji (Middleman AI) generująca plan wdrożenia innowacji
    dla konkretnej gminy/instytucji z jawną proweniencją (Gemini -> OpenAI -> Fallback szablonowy).
    Wskaźniki budżetu, grantów i KPI są dostosowane do podanego kontekstu i opatrzone notą doradczą.
    """
    muni_type_text = municipality_type or "Gmina / CUS"
    budget_text = budget_range or "15 000 – 25 000 PLN (szacunkowy koszt fazy pilotażowej)"
    grants_proposals = _get_consistent_grants_proposals()
    kpis_proposals = _get_consistent_kpis(muni_type_text)

    # 1. Próba z Gemini
    if settings.GEMINI_API_KEY:
        gemini_plan = _generate_gemini_plan(
            innovation_title=innovation_title,
            innovation_desc=innovation_desc,
            context=context,
            municipality_type=municipality_type,
            budget_range=budget_range,
            time_horizon=time_horizon,
            key_partners=key_partners,
        )
        if gemini_plan:
            return {
                "adaptation_plan": gemini_plan,
                "estimated_budget_pln": budget_text,
                "recommended_grants": grants_proposals,
                "key_kpis": kpis_proposals,
                "is_ai_generated": True,
                "generation_source": "gemini",
                "disclaimer": DISCLAIMER_ADAPTATION_PROPOSALS,
            }

    # 2. Próba z OpenAI
    client = get_openai_client()
    if client:
        try:
            prompt = _build_adaptation_prompt(
                innovation_title=innovation_title,
                innovation_desc=innovation_desc,
                context=context,
                municipality_type=municipality_type,
                budget_range=budget_range,
                time_horizon=time_horizon,
                key_partners=key_partners,
            )

            response: Any = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=1500,
            )
            openai_text = response.choices[0].message.content or ""
            if openai_text.strip():
                return {
                    "adaptation_plan": openai_text.strip(),
                    "estimated_budget_pln": budget_text,
                    "recommended_grants": grants_proposals,
                    "key_kpis": kpis_proposals,
                    "is_ai_generated": True,
                    "generation_source": "openai",
                    "disclaimer": DISCLAIMER_ADAPTATION_PROPOSALS,
                }
        except Exception as e:
            logger.warning("OpenAI completion error: %s", e)

    # 3. Szablon awaryjny (jawnie oznaczony jako template_fallback)
    fallback_text = _build_fallback_adaptation_plan(
        innovation_title=innovation_title,
        context=context,
        municipality_type=municipality_type,
        budget_range=budget_range,
        time_horizon=time_horizon,
        key_partners=key_partners,
    )

    return {
        "adaptation_plan": fallback_text,
        "estimated_budget_pln": budget_text,
        "recommended_grants": grants_proposals,
        "key_kpis": kpis_proposals,
        "is_ai_generated": False,
        "generation_source": "template_fallback",
        "disclaimer": DISCLAIMER_ADAPTATION_PROPOSALS,
    }


def evaluate_query_with_gemini(query: str) -> Dict[str, Any]:
    """
    Wykorzystuje Google Gemini do semantycznej i kontekstowej analizy zapytania użytkownika w wyszukiwarce HubMI.
    To model AI decyduje:
    1. Czy tekst jest bełkotem / losowym ciągiem znaków (is_gibberish).
    2. Czy tekst dotyczy rzeczywistego problemu/wyzwania społecznego (is_social_problem).
    3. Jakie kategorie ROPS odpowiadają potrzebie (suggested_categories).
    4. Podsumowanie intencji użytkownika (intent_summary).
    5. Spersonalizowana rada i informacja zwrotna (advice).
    """
    clean_query = " ".join(query.strip().split())
    if not clean_query:
        return {
            "is_gibberish": True,
            "is_social_problem": False,
            "intent_summary": "Puste zapytanie.",
            "suggested_categories": [],
            "advice": "Wprowadzony opis nie przypomina opisu wyzwania społecznego. Prosimy o wpisanie opisu problemu społecznego.",
        }

    # 1. Próba odpytania Gemini AI
    if settings.GEMINI_API_KEY:
        prompt = f"""Jesteś inteligentnym modułem klasyfikacji i doradztwa w wyszukiwarce innowacji społecznych ROPS Kraków (HubMI).
Twoim zadaniem jest przeanalizowanie tekstu wpisanego przez użytkownika w polu opisu problemu.

Oceń:
1. `is_gibberish` (bool): True jeśli tekst to losowe klepanie w klawiaturę (np. "awdawdawdawd", "asdfghjkl", powtórzone znaki, bełkot bez sensownych słów), False jeśli tekst składa się z czytelnych słów.
2. `is_social_problem` (bool): True jeśli tekst dotyczy wyzwania społecznego, problemu mieszkańców, seniorów, osób z niepełnosprawnościami, wykluczenia, edukacji, zdrowia, integracji lub rozwoju społeczności lokalnej. False jeśli tekst pyta o rzeczy całkowicie niezwiązane (np. "ile kosztuje pizza hawajska", "opony do traktora", spam komercyjny) lub jest bełkotem.
3. `intent_summary` (str): Krótkie podsumowanie zidentyfikowanej potrzeby (1 zdanie po polsku).
4. `suggested_categories` (list of str): Lista 1-3 pasujących kategorii z listy: ["Seniorzy", "Dostępność", "Zdrowie psychiczne", "Włączenie cyfrowe", "Usługi publiczne", "Integracja społeczna", "Młodzież", "Pomoc społeczna", "Wsparcie rodziny"].
5. `advice` (str): Profesjonalna, życzliwa porada dla użytkownika po polsku. Jeśli tekst to bełkot (np. losowe litery) lub brak słów, w advice ZAWSZE zawrzyj sformułowanie "Wprowadzony opis nie przypomina opisu wyzwania społecznego" oraz podpowiedz prosty przykład (np. samotność seniorów, brak dostępności architektonicznej, wykluczenie transportowe). Jeśli tekst dotyczy tematu niezwiązanego ze sprawami społecznymi, wyjaśnij to uprzejmie i skieruj na tematykę ROPS. Jeśli tekst jest poprawnym problemem społecznym, krótko potwierdź intencję.

Zwróć WYŁĄCZNIE obiekt JSON o schemacie:
{{
  "is_gibberish": false,
  "is_social_problem": true,
  "intent_summary": "...",
  "suggested_categories": ["..."],
  "advice": "..."
}}

TEKST UŻYTKOWNIKA:
"{clean_query}"
"""
        for model_name in ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"]:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={settings.GEMINI_API_KEY}"
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "temperature": 0.1,
                    },
                }
                res = requests.post(url, json=payload, timeout=6)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        text_part = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        parsed = json.loads(text_part)
                        return {
                            "is_gibberish": bool(parsed.get("is_gibberish", False)),
                            "is_social_problem": bool(parsed.get("is_social_problem", True)),
                            "intent_summary": str(parsed.get("intent_summary", clean_query)),
                            "suggested_categories": list(parsed.get("suggested_categories", [])),
                            "advice": str(parsed.get("advice", "")),
                        }
            except Exception as e:
                logger.warning("Gemini query evaluation error with model %s: %s", model_name, e)

    # 2. Bezpieczny fallback (gdyby API było niedostępne offline)
    from app.services.query_validator import is_gibberish
    gibberish_flag, gibberish_reason = is_gibberish(clean_query)
    if gibberish_flag:
        return {
            "is_gibberish": True,
            "is_social_problem": False,
            "intent_summary": "Nierozpoznany ciąg znaków.",
            "suggested_categories": [],
            "advice": (
                f"Wprowadzony opis nie przypomina opisu wyzwania społecznego ({gibberish_reason or 'wykryto losowe znaki'}). "
                "Opisz problem prostymi słowami (np. 'samotność seniorów', 'brak dostępności architektonicznej', 'wykluczenie transportowe') "
                "lub wybierz jedną z rekomendowanych kategorii tematycznych ROPS."
            ),
        }

    return {
        "is_gibberish": False,
        "is_social_problem": True,
        "intent_summary": clean_query,
        "suggested_categories": ["Seniorzy", "Dostępność", "Usługi publiczne"],
        "advice": "Wyszukiwanie pasujących innowacji społecznych w bazie ROPS Kraków...",
    }


def tailor_relevance_with_gemini(query: str, items: List[dict]) -> Dict[str, str]:
    """
    Generuje spersonalizowane uzasadnienia 'why_relevant' dla znalezionych innowacji ROPS
    w oparciu o specyficzne potrzeby wskazane przez użytkownika w zapytaniu.
    Zwraca słownik: {id_innowacji: "uzasadnienie why_relevant"}.
    """
    if not settings.GEMINI_API_KEY or not items:
        return {}

    try:
        mini_items = [
            {
                "id": str(it.get("id")),
                "title": str(it.get("title")),
                "description": str(it.get("description", ""))[:200],
            }
            for it in items[:4]
        ]
        prompt = f"""Dla poniższego problemu użytkownika:
"{query}"

Oraz listy innowacji ROPS Kraków:
{json.dumps(mini_items, ensure_ascii=False)}

Dla każdej innowacji napisz dokładnie jedno zwięzłe, rzeczowe zdanie po polsku (why_relevant), wyjaśniające jak to konkretne rozwiązanie bezpośrednio odpowiada na zgłoszoną przez użytkownika potrzebę.
Zwróć wyłącznie JSON w formacie:
[
  {{"id": "...", "why_relevant": "..."}}
]
"""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key={settings.GEMINI_API_KEY}"
        res = requests.post(
            url,
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.2,
                },
            },
            timeout=4,
        )
        if res.status_code == 200:
            parsed = res.json()
            candidates = parsed.get("candidates", [])
            if candidates:
                text_part = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                arr = json.loads(text_part)
                if isinstance(arr, list):
                    return {
                        str(item["id"]): str(item["why_relevant"])
                        for item in arr
                        if isinstance(item, dict) and "id" in item and "why_relevant" in item
                    }
    except Exception as e:
        logger.warning("Tailor relevance with Gemini error: %s", e)
    return {}

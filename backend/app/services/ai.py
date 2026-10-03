import hashlib
import logging
import math
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

    # Tryb awaryjny wyłącznie w środowisku testowym bez skonfigurowanych kluczy
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


def _build_fallback_adaptation_plan(
    innovation_title: str,
    context: str,
    municipality_type: Optional[str] = None,
    budget_range: Optional[str] = None,
    time_horizon: Optional[str] = None,
    key_partners: Optional[list[str]] = None,
) -> str:
    muni_type = municipality_type or "Gmina wiejska / miejsko-wiejska"
    budget = budget_range or "12 000 – 25 000 PLN"
    horizon = time_horizon or "3 miesiące"
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
| Koordynator projektu | Wynagrodzenie koordynatora lokalnego (3 mies. x 1/2 etatu) | 7 500 PLN |
| Materiały warsztatowe | Pakiety edukacyjne, materiały sensoryczne / techniczne | 3 200 PLN |
| Transport i dostępność | Dowozy OSP dla seniorów i osób z niepełnosprawnościami | 2 300 PLN |
| Poczęstunek i integracja | Przygotowanie poczęstunku przez KGW na 6 spotkań | 1 800 PLN |
| Audyt dostępności i promocja | Opracowanie materiałów ETR (Easy to Read) i promocja lokalna | 1 200 PLN |
| **SUMA CAŁKOWITA** | **Kompletny pilotaż w gminie** | **16 000 PLN** |

#### 4. Rekomendowane Źródła Finansowania
- **Inkubator Innowacji Społecznych ROPS Kraków**: Dotacje i granty testujące (do 20 000 PLN).
- **FERS (Fundusze Europejskie dla Rozwoju Społecznego)**: Projekty deinstytucjonalizacji usług społecznych.
- **PFRON**: Środki na dostępność architektoniczną i cyfrową dla gmin.
- **Fundusz Sołecki / GKRPA**: Wsparcie profilaktyki i aktywizacji lokalnej.

#### 5. Standard Dostępności i Włączenia Społecznego (WCAG 2.1 AA)
- Wszystkie materiały informacyjne przygotowane w standardzie **tekstu łatwego do czytania (ETR)** z kontrastem minimum 4.5:1.
- Sale warsztatowe z podjazdem dla wózków, pętlą indukcyjną lub asystentem osoby niesłyszącej/niewidomej.
- Możliwość dojazdu „door-to-door” zapewniona we współpracy z lokalną jednostką OSP.

#### 6. Kluczowe Wskaźniki Sukcesu (KPI)
1. **Liczba bezpośrednich odbiorców**: Minimum 20 mieszkańców objętych działaniami.
2. **Wskaźnik zadowolenia**: Co najmniej 85% pozytywnych ocen w ankiecie testera ROPS.
3. **Zaangażowanie partnerów**: Trwałe partnerstwo z co najmniej 2 organizacjami (OSP i KGW).
4. **Wskaźnik wdrożeniowy**: Rekomendacja wdrożenia stałego rozwiązania do lokalnej strategii społecznej."""


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
    budget_text = budget_range or "15 000 – 30 000 PLN (orientacyjny koszt fazy pilotażowej)"
    
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
                "recommended_grants": [
                    "Inkubator Innowacji Społecznych ROPS Kraków (orientacyjny grant testujący)",
                    "FERS - Fundusze Europejskie dla Rozwoju Społecznego (potencjalny nabór)",
                    "PFRON - Dostępność i wyrównywanie szans",
                    "Fundusze Sołeckie / GKRPA",
                ],
                "key_kpis": [
                    f"Objęcie działaniami min. 15-25 mieszkańców w zgłaszającej się jednostce ({muni_type_text})",
                    "Min. 85% pozytywnych ocen w formularzu ewaluacyjnym testera ROPS",
                    "Sformalizowanie partnerstwa z lokalnymi organizacjami (np. CUS, OSP, KGW)",
                    "Zgodność rozwiązań ze standardami dostępności WCAG 2.1 AA / ETR",
                ],
                "is_ai_generated": True,
                "generation_source": "gemini",
                "disclaimer": "Przedstawione źródła finansowania oraz szacunki budżetowe mają charakter orientacyjny i doradczy. Dostępność naborów wymaga weryfikacji w aktualnych harmonogramach ROPS Kraków.",
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
                    "recommended_grants": [
                        "Inkubator Innowacji Społecznych ROPS Kraków (orientacyjny grant testujący)",
                        "FERS - Fundusze Europejskie dla Rozwoju Społecznego",
                        "PFRON - Dostępność i wyrównywanie szans",
                    ],
                    "key_kpis": [
                        f"Objęcie działaniami min. 15-25 mieszkańców w jednostce ({muni_type_text})",
                        "Min. 85% zadowolenia w ankiecie ewaluacyjnej ROPS",
                        "Zgodność ze standardami dostępności WCAG 2.1 AA",
                    ],
                    "is_ai_generated": True,
                    "generation_source": "openai",
                    "disclaimer": "Przedstawione źródła finansowania oraz szacunki budżetowe mają charakter orientacyjny i doradczy. Dostępność naborów wymaga weryfikacji w aktualnych harmonogramach ROPS Kraków.",
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
        "recommended_grants": [
            "Inkubator Innowacji Społecznych ROPS Kraków (orientacyjny grant testujący)",
            "FERS - Fundusze Europejskie dla Rozwoju Społecznego",
            "PFRON - Dostępność i wyrównywanie szans",
        ],
        "key_kpis": [
            f"Objęcie działaniami min. 15-25 mieszkańców w jednostce ({muni_type_text})",
            "Min. 85% zadowolenia w ankiecie ewaluacyjnej ROPS",
            "Zgodność ze standardami dostępności WCAG 2.1 AA",
        ],
        "is_ai_generated": False,
        "generation_source": "template_fallback",
        "disclaimer": "Plan wygenerowano na podstawie ustandaryzowanego szablonu adaptacyjnego ROPS Kraków (brak aktywnego połączenia z modelem AI). Dane budżetowe i grantowe mają charakter poglądowy.",
    }

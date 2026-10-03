import hashlib
import math
import re
from functools import lru_cache
from typing import List, Optional, Any
import requests

from app.core.config import settings

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
            print(f"Warning: Failed to initialize OpenAI client: {e}")
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
            print(f"Gemini API returned status {res.status_code}: {res.text}")
    except Exception as e:
        print(f"Gemini embedding error: {e}")
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


@lru_cache(maxsize=1024)
def _get_embedding_tuple(clean_text: str) -> tuple:
    """Pobiera embedding jako niezmienną krotkę z buforowaniem LRU (Gemini -> OpenAI -> Fallback)."""
    # 1. Próba z Google Gemini
    if settings.GEMINI_API_KEY:
        gemini_vec = _get_gemini_embedding(clean_text)
        if gemini_vec:
            return tuple(gemini_vec)

    # 2. Próba z OpenAI
    client = get_openai_client()
    if client:
        try:
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=clean_text,
            )
            return tuple(response.data[0].embedding)
        except Exception as e:
            print(f"OpenAI embedding error: {e}. Falling back to deterministic embedding.")

    # 3. Zapasowy silnik deterministyczny
    return tuple(_fallback_deterministic_embedding(clean_text))


def create_embedding(text: str) -> List[float]:
    """
    Tworzy embedding dla danego tekstu za pomocą Google Gemini / OpenAI
    z LRU cache (1024 wpisy) i fallbackiem deterministycznym.
    """
    clean_text = " ".join(text.strip().split())
    if not clean_text:
        return [0.0] * 1536
    return list(_get_embedding_tuple(clean_text))


def _generate_gemini_plan(innovation_title: str, innovation_desc: str, context: str) -> Optional[str]:
    """Generuje plan adaptacji za pomocą Google Gemini 1.5 Flash."""
    if not settings.GEMINI_API_KEY:
        return None
    try:
        prompt = f"""Jesteś doradcą ds. innowacji społecznych w Małopolskim Hubie Innowacji Społecznych (ROPS Kraków).
Dostosuj poniższą innowację społeczną do potrzeb i zasobów zgłaszającej się instytucji:

Innowacja: {innovation_title}
Opis: {innovation_desc}
Lokalny kontekst/potrzeba instytucji: {context}

Przygotuj zwięzły, konkretny plan wdrożenia w markdown:
1. Rekomendowana forma prawno-organizacyjna (np. współpraca z CUS / NGO / GOPS)
2. Etapy wdrożenia (miesiąc 1, 2, 3)
3. Szacunkowe zapotrzebowanie budżetowe i kadrowe
4. Potencjalne źródła dofinansowania (np. Małopolski ROPS, FERS, fundusze sołeckie)
5. Rekomendacja zminimalizowania barier dla seniorów i osób z niepełnosprawnościami (WCAG)."""

        for model_name in ["gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"]:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={settings.GEMINI_API_KEY}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2000},
            }
            res = requests.post(url, json=payload, timeout=15)
            if res.status_code == 200:
                data = res.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    full_text = "".join(p.get("text", "") for p in parts)
                    if full_text.strip():
                        return full_text.strip()
    except Exception as e:
        print(f"Gemini completion error: {e}")
    return None



def generate_adaptation_plan(innovation_title: str, innovation_desc: str, context: str) -> str:
    """
    Funkcja Asystenta Adaptacji (Middleman AI) generująca plan wdrożenia innowacji
    dla konkretnej gminy/instytucji (Gemini -> OpenAI -> Fallback).
    """
    # 1. Próba z Gemini
    if settings.GEMINI_API_KEY:
        gemini_plan = _generate_gemini_plan(innovation_title, innovation_desc, context)
        if gemini_plan:
            return gemini_plan

    # 2. Próba z OpenAI
    client = get_openai_client()
    if client:
        try:
            prompt = f"""Jesteś doradcą ds. innowacji społecznych w Małopolskim Hubie Innowacji Społecznych (ROPS Kraków).
Dostosuj poniższą innowację społeczną do potrzeb i zasobów zgłaszającej się instytucji:

Innowacja: {innovation_title}
Opis: {innovation_desc}
Lokalny kontekst/potrzeba instytucji: {context}

Przygotuj zwięzły, konkretny plan wdrożenia:
1. Rekomendowana forma prawno-organizacyjna (np. współpraca z CUS / NGO / GOPS)
2. Etapy wdrożenia (miesiąc 1, 2, 3)
3. Szacunkowe zapotrzebowanie budżetowe i kadrowe
4. Potencjalne źródła dofinansowania (np. Małopolski ROPS, FERS, fundusze sołeckie)
5. Rekomendacja zminimalizowania barier dla seniorów i osób z niepełnosprawnościami (WCAG)."""

            response: Any = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=800,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            print(f"OpenAI completion error: {e}")

    # 3. Fallbackowy szkielet planu
    return f"""### Plan Adaptacji Innowacji: {innovation_title}
**Dla kontekstu**: {context}

1. **Forma organizacyjna**:
   - Rekomendowane wdrożenie przy Ośrodku Pomocy Społecznej / Centrum Usług Społecznych we współpracy z lokalną organizacją pozarządową (NGO).

2. **Harmonogram wdrożenia (3 miesiące)**:
   - **Miesiąc 1**: Diagnoza lokalna i nabór uczestników / wolontariuszy.
   - **Miesiąc 2**: Szkolenie kadr na bazie podręcznika dobrych praktyk ROPS Kraków.
   - **Miesiąc 3**: Pilotażowe uruchomienie usługi w wybranej miejscowości.

3. **Zasoby i szacunkowy koszt**:
   - 1 koordynator na 1/2 etatu + materiały edukacyjne.
   - Szacunkowy koszt wdrożenia pilotażu: 8 000 – 15 000 PLN.

4. **Źródła finansowania**:
   - Granty mikroinnowacji ROPS Kraków, programy wsparcia JST z budżetu Województwa Małopolskiego, fundusze sołeckie.
"""

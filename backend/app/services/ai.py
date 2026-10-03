import hashlib
import math
from typing import List, Optional
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


def _fallback_deterministic_embedding(text: str, dim: int = 1536) -> List[float]:
    """
    Zapasowy generator wektorów (gdy brak klucza OpenAI lub brak środków na koncie).
    Generuje znormalizowany wektor 1536D na bazie słów kluczowych i hashowania,
    zapewniając poprawne działanie operacji wektorowych w pgvector bez błędów.
    """
    words = text.lower().split()
    vector = [0.0] * dim
    
    for word in words:
        # Hashing każdego słowa do kilku indeksów w wektorze
        h = int(hashlib.sha256(word.encode("utf-8")).hexdigest(), 16)
        idx1 = (h) % dim
        idx2 = (h >> 16) % dim
        idx3 = (h >> 32) % dim
        weight = 1.0 / (1.0 + len(word) * 0.1)
        vector[idx1] += weight
        vector[idx2] += weight * 0.5
        vector[idx3] += weight * 0.25

    # Normalizacja L2 (długość wektora = 1.0)
    norm = math.sqrt(sum(x * x for x in vector))
    if norm > 0:
        vector = [round(x / norm, 6) for x in vector]
    else:
        vector[0] = 1.0
    return vector


def create_embedding(text: str) -> List[float]:
    """
    Tworzy embedding dla danego tekstu za pomocą OpenAI text-embedding-3-small.
    W przypadku braku klucza używa bezpiecznego fallbacku deterministycznego.
    """
    client = get_openai_client()
    if client:
        try:
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=text.replace("\n", " "),
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"OpenAI embedding error: {e}. Falling back to deterministic embedding.")

    return _fallback_deterministic_embedding(text)


def generate_adaptation_plan(innovation_title: str, innovation_desc: str, context: str) -> str:
    """
    Funkcja Asystenta Adaptacji (Middleman AI) generująca plan wdrożenia innowacji
    dla konkretnej gminy/instytucji.
    """
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

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=800,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            print(f"OpenAI completion error: {e}")

    # Fallbackowy szkielet planu
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

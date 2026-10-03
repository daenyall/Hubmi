import math
import pytest
from app.services.ai import (
    create_embedding,
    calculate_cosine_similarity,
    _fallback_deterministic_embedding,
    _get_embedding_tuple,
)


class TestVectorEmbeddings:
    """Zestaw testów jednostkowych weryfikujący silnik wektorowy AI i procedury embeddingu."""

    def test_embedding_dimension(self):
        """Wektor embeddingu musi mieć dokładnie 1536 wymiarów (zgodnie z OpenAI/pgvector)."""
        vector = create_embedding("Mobilny asystent seniora")
        assert isinstance(vector, list)
        assert len(vector) == 1536
        assert all(isinstance(val, float) for val in vector)

    def test_embedding_l2_normalization(self):
        """Wektor musi być znormalizowany (długość L2 bliska 1.0), co jest kluczowe dla odległości cosinusowej."""
        vector = create_embedding("Wsparcie psychiczne dla młodzieży")
        l2_norm = math.sqrt(sum(x * x for x in vector))
        assert math.isclose(l2_norm, 1.0, rel_tol=1e-2)

    def test_embedding_determinism(self):
        """Identyczne zapytanie tekstowe musi zawsze generować identyczny wektor."""
        text = "Pomoc dla rodzin wielodzietnych na terenach wiejskich"
        v1 = create_embedding(text)
        v2 = create_embedding(text)
        assert v1 == v2

    def test_embedding_lru_cache(self):
        """Powtórzone zapytanie powinno korzystać z szybkiego bufora LRU."""
        cache_before = _get_embedding_tuple.cache_info()
        text = "Unikalne zapytanie testowe LRU Cache 2026"
        _ = create_embedding(text)
        _ = create_embedding(text)
        cache_after = _get_embedding_tuple.cache_info()
        assert cache_after.hits > cache_before.hits

    def test_polish_diacritics_and_special_chars(self):
        """Poprawna obsługa polskich znaków (zażółć gęślą jaźń) i znaków interpunkcyjnych."""
        text = "Zażółć gęślą jaźń! Przemoc domowa, CUS & GOPS w Małopolsce - 2026..."
        vector = create_embedding(text)
        assert len(vector) == 1536
        assert not any(math.isnan(x) for x in vector)

    def test_empty_and_whitespace_input(self):
        """Pusty tekst lub spacje nie powinny powodować wyjątku ani załamania serwisu."""
        v_empty = create_embedding("")
        v_spaces = create_embedding("     \n\t   ")
        assert len(v_empty) == 1536
        assert len(v_spaces) == 1536

    def test_cosine_similarity_identity_and_orthogonality(self):
        """Weryfikacja funkcji calculate_cosine_similarity: identyczność i wektory prostopadłe."""
        vec1 = [1.0, 0.0, 0.0]
        vec2 = [1.0, 0.0, 0.0]
        vec3 = [0.0, 1.0, 0.0]

        assert math.isclose(calculate_cosine_similarity(vec1, vec2), 1.0)
        assert math.isclose(calculate_cosine_similarity(vec1, vec3), 0.0)

    def test_semantic_ranking_relevance(self):
        """
        Kluczowy test wektorów: zapytanie o seniorów musi wykazywać wyższe podobieństwo
        do innowacji senioralnej niż do innowacji dotyczącej sensoryki/autyzmu.
        """
        query_text = "Samotny senior na wsi bez dojazdu do lekarza i apteki"
        senior_inv = "Mobilny Asystent Seniora transport i wsparcie w sprawach urzędowych dla osób starszych"
        sensory_inv = "Sensoryczna Przystań Pokój Wyciszeń dla dzieci w spektrum autyzmu w szkole podstawowej"

        v_query = create_embedding(query_text)
        v_senior = create_embedding(senior_inv)
        v_sensory = create_embedding(sensory_inv)

        sim_senior = calculate_cosine_similarity(v_query, v_senior)
        sim_sensory = calculate_cosine_similarity(v_query, v_sensory)

        assert sim_senior > sim_sensory, (
            f"Błąd semantyki wektorów: podobieństwo do innowacji senioralnej ({sim_senior:.4f}) "
            f"powinno być wyższe niż do sali wyciszeń ({sim_sensory:.4f})"
        )

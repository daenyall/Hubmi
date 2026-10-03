# Hubmi - Backend (FastAPI & AI)

Backend REST API dla Małopolskiego Hubu Innowacji Społecznych (ROPS Kraków).
Zbudowany w oparciu o FastAPI, silnik wektorowy Supabase (pgvector) oraz OpenAI Embeddings (z deterministycznym fallbackiem offline).

## Kluczowe Moduły i Endpointy

- **Healthcheck**: `GET /api/health` — status serwera i weryfikacja połączenia z Supabase.
- **Matchmaking (Wyszukiwarka Wektorowa)**: `POST /api/match` — semantyczne dopasowywanie innowacji do zgłoszonego problemu za pomocą wektorów 1536D i procedury RPC `match_innovations`.
- **Katalog Innowacji**: `GET /api/innovations` — przeglądanie i filtrowanie bazy innowacji społecznych.
- **Middleman AI**: `POST /api/adapt` — asystent generujący spersonalizowany plan adaptacji innowacji dla gminy/instytucji.

## Struktura Katalogów

```
backend/
├── app/
│   ├── api/
│   │   ├── endpoints/
│   │   │   ├── health.py        # Healthcheck (/api/health)
│   │   │   ├── match.py         # Matchmaking wektorowy (/api/match)
│   │   │   ├── innovations.py   # Przeglądanie innowacji (/api/innovations)
│   │   │   ├── middleman.py     # Asystent adaptacji (/api/adapt)
│   │   │   └── example.py       # Przykładowe endpointy
│   │   └── router.py            # Główny router API
│   ├── core/
│   │   └── config.py            # Konfiguracja środowiska (pydantic-settings)
│   ├── db/
│   │   └── supabase.py          # Klient bazy Supabase
│   ├── models/
│   │   └── schemas.py           # Modele danych Pydantic z walidacją
│   ├── services/
│   │   └── ai.py                # Embeddingi 1536D, LRU cache i generowanie planu
│   └── main.py                  # Inicjalizacja FastAPI + CORS
├── scripts/
│   ├── data/
│   │   └── innovations.json     # Baza 15 sprawdzonych innowacji ROPS Kraków
│   └── seed_data.py             # Skrypt importu & wektoryzacji z walidacją
├── tests/
│   ├── test_vectors.py          # Testy jednostkowe wektorów i odległości cosinusowej
│   └── test_match_api.py        # Testy integracyjne API i walidacji
├── pytest.ini                   # Konfiguracja środowiska testowego
├── requirements.txt             # Zależności produkcyjne i testowe
└── run.py                       # Uruchomienie lokalne
```

## Uruchomienie Lokalne

1. **Aktywacja środowiska:**
```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
```

2. **Seedowanie bazy innowacji:**
```bash
python scripts/seed_data.py --verbose
```
Możliwe flagi:
- `--dry-run` — testowa walidacja pliku JSON bez modyfikowania bazy
- `--verbose` — szczegółowe logowanie każdego rekordu

3. **Uruchomienie testów automatycznych:**
```bash
pytest -v
```

4. **Start serwera deweloperskiego:**
```bash
python run.py
# lub:
uvicorn app.main:app --reload --port 8000
```

- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

# Hubmi - Backend (FastAPI & AI)

Backend REST API dla Małopolskiego Hubu Innowacji Społecznych (ROPS Kraków).
Zbudowany w oparciu o FastAPI, silnik wektorowy Supabase (pgvector) oraz OpenAI Embeddings (z deterministycznym fallbackiem offline).

## Kluczowe Moduły i Endpointy

- **Healthcheck**: `GET /api/health` — status serwera i weryfikacja połączenia z Supabase.
- **Matchmaking (Wyszukiwarka Wektorowa)**: `POST /api/match` — semantyczne dopasowywanie innowacji do zgłoszonego problemu za pomocą wektorów 1536D i procedury RPC `match_innovations`.
- **Katalog Innowacji**: `GET /api/innovations` — przeglądanie i filtrowanie bazy innowacji społecznych z paginacją.
- **Middleman AI**: `POST /api/adapt` — asystent generujący spersonalizowany plan adaptacji innowacji dla gminy/instytucji.
- **Panel Administratora ROPS**: `GET /api/admin/submissions` — lista fiszek innowacji z filtrami statusu i wyszukiwaniem; dostępna dla roli `rops_admin`.
- **Zarządzanie Statusem Fiszki**: `PATCH /api/admin/submissions/{id}/status` — formalna zmiana statusu (`nowe`, `weryfikacja`, `zaakceptowane`, `odrzucone`), odpowiedź oficjalna ROPS i notatka urzędowa.
- **Dziennik Audytowy i Webhooki**: `GET /api/admin/events`, `POST /api/admin/webhooks/test` — historia zmian i dispatcher powiadomień HTTP POST / email.
- **Wątek Konsultacji Fiszki (Czat)**: `GET / POST /api/submissions/{id}/messages` — dwustronny dialog innowator <-> ekspert ROPS.

## Bezpieczeństwo i Izolacja Danych (RBAC & RLS)

- **Rola Wnioskodawcy (`applicant`)**: Użytkownik widzi i edytuje wyłącznie własne fiszki oraz bierze udział w wątku konsultacyjnym własnego zgłoszenia.
- **Rola Administratora ROPS (`rops_admin`)**: Autoryzowana domeną `@rops.krakow.pl`, rolą w tokenie Supabase JWT lub nagłówkiem `X-Admin-Role: rops_admin` (tryb deweloperski/demo). Posiada pełen wgląd do wszystkich fiszek, prawo do ich akceptacji/odrzucania i podglądu audytu zdarzeń.

## Struktura Katalogów

```
backend/
├── app/
│   ├── api/
│   │   ├── endpoints/
│   │   │   ├── health.py             # Healthcheck (/api/health)
│   │   │   ├── match.py              # Matchmaking wektorowy (/api/match) + doradca
│   │   │   ├── innovations.py        # Przeglądanie innowacji (/api/innovations)
│   │   │   ├── middleman.py          # Asystent adaptacji (/api/adapt)
│   │   │   ├── admin.py              # Panel Administratora ROPS (/api/admin/submissions)
│   │   │   ├── submissions.py        # Zgłoszenia i czat konsultacyjny (/api/submissions)
│   │   │   └── example.py            # Przykładowe endpointy
│   │   └── router.py                 # Główny router API
│   ├── core/
│   │   ├── config.py                 # Konfiguracja środowiska (pydantic-settings)
│   │   └── security.py               # Weryfikacja tożsamości i ról RBAC
│   ├── db/
│   │   └── supabase.py               # Klient bazy Supabase
│   ├── models/
│   │   └── schemas.py                # Modele danych Pydantic z walidacją
│   ├── services/
│   │   ├── ai.py                     # Embeddingi 1536D, Gemini i generowanie planu
│   │   └── notifications.py          # Dyspozytor webhooków i powiadomień email
│   └── main.py                       # Inicjalizacja FastAPI + CORS
├── migrations/
│   ├── 02_enhanced_match_innovations.sql  # Procedura RPC z filtrowaniem kategorii
│   └── 03_submissions_roles_and_stages.sql# Kolumny tytułu, etapów i tabela submission_events
├── scripts/
│   ├── data/
│   │   └── innovations.json          # Baza 15 sprawdzonych innowacji ROPS Kraków
│   ├── seed_data.py                  # Skrypt importu & wektoryzacji z walidacją
│   └── verify_rls.py                 # Narzędzie audytu uprawnień i polityk RLS
├── tests/
│   ├── test_vectors.py               # Testy jednostkowe wektorów i odległości cosinusowej
│   ├── test_match_api.py             # Testy integracyjne API i walidacji
│   ├── test_rls_security.py          # Testy bezpieczeństwa polityk RLS
│   ├── test_no_match_handling.py     # Testy obsługi braku dopasowań i rekomendacji
│   ├── test_roles_security.py        # Testy uprawnień RBAC (autor vs admin ROPS)
│   ├── test_submissions_status.py   # Testy cyklu życia i statusów zgłoszeń
│   └── test_webhooks.py              # Testy webhooków i dziennika audytowego
├── pytest.ini                        # Konfiguracja środowiska testowego
├── requirements.txt                  # Zależności produkcyjne i testowe
└── run.py                            # Uruchomienie lokalne
```

## Uruchomienie Lokalne i Weryfikacja

1. **Aktywacja środowiska:**
```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
```

2. **Uruchomienie kompletnego pakietu 38 testów:**
```bash
pytest -v
```

3. **Start serwera deweloperskiego:**
```bash
python run.py
# lub:
uvicorn app.main:app --reload --port 8000
```

- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

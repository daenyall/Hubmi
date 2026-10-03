# Hubmi - Backend (FastAPI)

FastAPI REST API z obsługą bazy danych Supabase.

## Struktura katalogów
```
backend/
├── app/
│   ├── api/
│   │   ├── endpoints/
│   │   │   ├── health.py       # Healthcheck (/api/health)
│   │   │   └── example.py      # Przykładowe endpointy (/api/example/...)
│   │   └── router.py           # Agregacja tras API
│   ├── core/
│   │   └── config.py           # Konfiguracja środowiska (pydantic-settings)
│   ├── db/
│   │   └── supabase.py         # Klient bazy Supabase
│   ├── models/
│   │   └── schemas.py          # Modele danych Pydantic
│   └── main.py                 # Inicjalizacja FastAPI + CORS
├── .env.example
├── requirements.txt
└── run.py
```

## Uruchomienie lokalne

1. **Utworzenie wirtualnego środowiska Python:**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

2. **Instalacja zależności:**
```bash
pip install -r requirements.txt
```

3. **Konfiguracja zmiennych środowiskowych:**
```bash
cp .env.example .env
# Uzupełnij SUPABASE_URL i SUPABASE_KEY w pliku .env
```

4. **Start serwera deweloperskiego:**
```bash
python run.py
# lub:
uvicorn app.main:app --reload --port 8000
```

- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

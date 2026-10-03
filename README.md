# Hubmi (HackYeah 2026) 🚀

Monorepo projektu **Hubmi** z jasnym podziałem ról i folderów:
- 🖥️ **`frontend/`** – Aplikacja Next.js (App Router), Tailwind CSS v4, shadcn/ui, Supabase SSR client
- ⚙️ **`backend/`** – REST API w FastAPI (Python), Supabase client, CORS, OpenAPI Swagger

---

## 📁 Struktura projektu

```text
hackyeah2026/
├── frontend/             # Przestrzeń pracy Frontend Developera
│   ├── src/
│   │   ├── app/          # Strony i layouty Next.js (App Router)
│   │   ├── components/ui/# Komponenty shadcn/ui
│   │   └── lib/          # Klient Supabase i funkcja komunikacji z FastAPI
│   ├── .env.example
│   ├── package.json
│   └── README.md
│
├── backend/              # Przestrzeń pracy Backend Developera
│   ├── app/
│   │   ├── api/          # Trasy i routery API (/api/...)
│   │   ├── core/         # Konfiguracja środowiskowa (pydantic-settings)
│   │   ├── db/           # Inicjalizacja klienta Supabase
│   │   ├── models/       # Schematy Pydantic
│   │   └── main.py       # Aplikacja FastAPI + CORS
│   ├── .env.example
│   ├── requirements.txt
│   ├── run.py
│   └── README.md
│
└── README.md
```

---

## 🚀 Szybki start

### 1. Frontend (`frontend/`)
```bash
cd frontend
npm install        # jeśli pierwszy raz
npm run dev        # start na http://localhost:3000
```
- Konfiguracja zmiennych: skopiuj `.env.example` do `.env.local` i podaj klucze Supabase oraz URL backendu (`http://localhost:8000`).

### 2. Backend (`backend/`)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py      # start na http://localhost:8000
```
- Dokumentacja Swagger: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)
- Konfiguracja zmiennych: skopiuj `.env.example` do `.env` i podaj `SUPABASE_URL` i `SUPABASE_KEY`.

---

## 🗄️ Baza danych (Supabase)
Oba komponenty mają przygotowanych klientów Supabase:
- **Frontend**: `@supabase/ssr` w `frontend/src/lib/supabase/client.ts` oraz `server.ts`
- **Backend**: `supabase-py` w `backend/app/db/supabase.py`

# Instrukcja Wdrożenia Backendu HubMI (ROPS Kraków)

Niniejszy dokument opisuje procedurę wdrożenia serwisu FastAPI na publiczne platformy chmurowe oraz spięcia go z frontendem Next.js na Vercelu.

---

## 1. Wymagane Zmienne Środowiskowe (Environment Variables)

Podczas konfiguracji w chmurze (Render / Fly.io / Railway / Cloud Run) należy skonfigurować następujące zmienne:

| Zmienna | Wartość produkcyjna | Opis |
|---|---|---|
| `ENVIRONMENT` | `production` | Wyłącza hot-reload i tryb deweloperski |
| `PORT` | Ustawiane automatycznie przez platformę (lub `8000`) | Port nasłuchiwania HTTP |
| `SUPABASE_URL` | `https://sctlcicbbfppbfqewziu.supabase.co` | Adres projektu Supabase |
| `SUPABASE_KEY` | *(Klucz `service_role` z panelu Supabase)* | Dostęp administracyjny do bazy i pgvector |
| `OPENAI_API_KEY` | `sk-proj-...` | Klucz OpenAI dla modelu `text-embedding-3-small` i `gpt-4o-mini` |
| `GEMINI_API_KEY` | `AIzaSy...` | Alternatywny, bezpłatny klucz Google Gemini |
| `WORKERS` | `2` (lub auto przez `WEB_CONCURRENCY`) | Liczba procesów roboczych Uvicorn |
| `CORS_ORIGIN_REGEX` | `https://.*(\.vercel\.app\|\.trycloudflare\.com\|\.onrender\.com)` | Akceptuje domeny Vercel, Cloudflare i Render |

---

## 2. Opcje Wdrożenia (Deployment Options)

### Opcja A: Render.com (Zalecana - 1-Click z Git)
1. Zaloguj się na [render.com](https://render.com).
2. Wybierz **New +** -> **Blueprint** i wskaż repozytorium `Hubmi`.
3. Render automatycznie wykryje plik [backend/render.yaml](file:///Users/spok0jny/AntigravityProjects/hackyeah2026/backend/render.yaml).
4. Wprowadź brakujące sekrety (`SUPABASE_URL`, `SUPABASE_KEY`, `OPENAI_API_KEY` lub `GEMINI_API_KEY`).
5. Kliknij **Apply** – serwis wstanie pod publicznym adresem HTTPS: `https://hubmi-backend.onrender.com`.

### Opcja B: Dowolny hosting kontenerowy (Fly.io, Railway, GCP Cloud Run)
W repozytorium znajduje się gotowy, utwardzony plik [backend/Dockerfile](file:///Users/spok0jny/AntigravityProjects/hackyeah2026/backend/Dockerfile):
- Bazuje na `python:3.11-slim` (lekki, ~150MB).
- Działa na użytkowniku bez uprawnień roota (`appuser`).
- Posiada wbudowany `HEALTHCHECK` pod endpoint `/api/health`.

### Opcja C: Natychmiastowy Tunel Cloudflare / ngrok
Jeśli potrzebujesz natychmiast połączyć Vercel Daniela z działającą lokalnie instancją bez czekania na build w chmurze:
```bash
# Cloudflare Tunnel (darmowy, natychmiastowy HTTPS, bez rejestracji konta)
cloudflared tunnel --url http://localhost:8000

# Alternatywnie ngrok:
ngrok http 8000
```
Otrzymany adres HTTPS (np. `https://xyz-demo.trycloudflare.com`) przekazujesz Danielowi jako `NEXT_PUBLIC_BACKEND_URL`.

---

## 3. Konfiguracja Frontendu na Vercelu (Dla Daniela)

W dashboardzie Vercela (Settings -> Environment Variables) należy ustawić:
```env
NEXT_PUBLIC_BACKEND_URL=https://hubmi-backend.onrender.com
```
*(lub inny adres uzyskany z wybranej platformy hostingu)*.

---

## 4. Weryfikacja Działania (Health & CORS Check)

Po wdrożeniu wykonaj testy z terminala:

1. **Test dostępności**:
   ```bash
   curl -s https://<backend-domain>/api/health
   # Oczekiwana odpowiedź: {"status":"ok","app_name":"Hubmi Backend","environment":"production","supabase_connected":true}
   ```

2. **Test preflight CORS dla Vercela**:
   ```bash
   curl -I -X OPTIONS https://<backend-domain>/api/match \
     -H "Origin: https://hubmi-rops.vercel.app" \
     -H "Access-Control-Request-Method: POST"
   # Oczekiwany nagłówek: access-control-allow-origin: https://hubmi-rops.vercel.app
   ```

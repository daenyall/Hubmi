# HubMI – Deploy, Kontrola Dostępu i Kosztorys Regionalny

> Oficjalna dokumentacja wdrożeniowa i specyfikacja zasobów dla projektu **HubMI – Małopolski Inkubator Innowacji Społecznych ROPS Kraków** (HackYeah 2026).

---

## 1. Dostępne Środowiska i Adresy Demo Online

| Komponent | Adres URL | Opis i Funkcja |
| :--- | :--- | :--- |
| **Backend REST API (Publiczny Tunel HTTPS)** | `https://blocking-suspension-tractor-samuel.trycloudflare.com` | Zabezpieczony tunel Cloudflare z szyfrowaniem TLS do silnika FastAPI. |
| **Interaktywna dokumentacja Swagger UI** | `https://blocking-suspension-tractor-samuel.trycloudflare.com/docs` | Pełna konsola testowa wszystkich endpointów REST z walidacją JSON Schema. |
| **API Health Check** | `https://blocking-suspension-tractor-samuel.trycloudflare.com/api/health` | Status połączenia z bazą pgvector Supabase i usługami wektoryzacji. |
| **Frontend Web Application (Lokalne / Staging)** | `http://localhost:3000` | Interfejs Next.js 15 (App Router, Tailwind CSS, shadcn/ui, WCAG 2.1 AA). |
| **Backend Lokalny** | `http://localhost:8000` | Serwer developerski FastAPI z automatycznym przeładowaniem. |

---

## 2. Kontrola Dostępu i Architektura Bezpieczeństwa (RLS)

Dostęp do danych w HubMI opiera się na zasadzie **Least Privilege** i jest wymuszany na dwóch niezależnych warstwach: **FastAPI Gatekeeper** oraz **PostgreSQL Row Level Security (RLS)** w Supabase.

### 2.1. Macierz Uprawnień

| Rola Użytkownika | Publiczny Katalog Innowacji | Wyszukiwarka Semantyczna (Match) | Fiszki Zgłoszeń (Submissions) | Wiadomości i Dyskusja | Publikacja i Edycja Innowacji |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Gość / Niezalogowany (Anonimowy)** | Tylko `sprawdzone` | Zawsze filtrowane do `sprawdzone` | Brak dostępu do odczytu cudzych fiszek | Brak dostępu | ❌ Zabronione (HTTP 401) |
| **Autor Fiszki (Mieszkaniec / NGO)** | Tylko `sprawdzone` | Dostęp pełny | Tylko własna fiszka (filtr `author_session_token`) | Wątek własnej fiszki | ❌ Zabronione (HTTP 403) |
| **Pracownik ROPS (`rops_admin`)** | Wszystkie statusy (w tym szkice) | Dostęp pełny | Pełny wgląd w panelu `/panel` | Odpowiedź oficjalna i czat | ✅ Pełne uprawnienia (POST, PATCH, publikacja) |
| **Mentor Innowacji (`mentor`)** | Wszystkie statusy | Dostęp pełny | Wszystkie zgłoszenia do zaopiniowania | Komentarze doradcze | Odczyt + sugerowanie zmian |

### 2.2. Zabezpieczenia Przed Atakami
1. **Ochrona przed wyciekiem szkiców**: Parametr `status=all` w publicznym API jest zablokowany – publiczny odczyt zwraca wyłącznie innowacje zatwierdzone przez ROPS.
2. **Klucz Service Role jest odizolowany**: Klucz administracyjny Supabase znajduje się wyłącznie na backendzie i nigdy nie wycieka do przeglądarki klienta.
3. **Ochrona przed Keyboard Mash i Spamem**: Model **Google Gemini AI** weryfikuje każde zapytanie w wyszukiwarce (`evaluate_query_with_gemini`), filtrując bełkot i komercyjny spam.

---

## 3. Szacowany Koszt Utrzymania i Wymagane Zasoby (Kryterium Formalne)

Wycena została skalkulowana dla regionalnego wdrożenia w Województwie Małopolskim przy założeniu obsługi **10 000 – 30 000 zapytań mieszkańców i 200–500 zgłoszeń fiszek miesięcznie**.

### 3.1. Tabela Miesięcznych Kosztów Eksploatacji

| Usługa / Zasób | Dostawca | Rekomendowany Plan / Konfiguracja | Szacowany Koszt Miesięczny (USD / PLN) | Rola w Systemie |
| :--- | :--- | :--- | :--- | :--- |
| **Baza Relacyjno-Wektorowa** | Supabase Cloud | Plan **Pro** (8 GB pamięci dyskowej, baza PostgreSQL 15 z rozszerzeniem `pgvector`, backup dzienny, RLS) | **$25.00** (~100 PLN) | Przechowywanie innowacji, wektorów 1536D, fiszek, wiadomości i audytu. |
| **Wektoryzacja i Klasyfikacja AI** | Google Cloud (Gemini API) | Model **gemini-embedding-2** (1536D) oraz **gemini-3.5-flash-lite** do ewaluacji zapytań | **$10.00 – $20.00** (~40 – 80 PLN) | Wektoryzacja zapytań w locie, scoring `why_relevant`, doradztwo braku dopasowań. |
| **Generowanie Planów Adaptacji** | Google Cloud (Gemini API) | Model **gemini-3.5-flash** (generowanie 6-sekcyjnych planów wdrożenia dla samorządów) | **$8.00 – $15.00** (~32 – 60 PLN) | Asystent Middleman AI dla gmin i NGO. |
| **Hosting Backend API** | Render / Google Cloud Run | Instancja 1 vCPU, 1 GB RAM (auto-scaling 1–3 instancje) z certyfikatem SSL | **$7.00 – $15.00** (~28 – 60 PLN) | Uruchomienie aplikacji FastAPI, rate limiting, routing hybrydowy. |
| **Hosting Frontend Next.js** | Vercel / Cloudflare Pages | Plan Standard / Pro (Edge CDN w Warszawie, kompresja Brotli) | **$0.00 – $20.00** (~0 – 80 PLN) | Szybki rendering interfejsu WCAG, obsługa urządzeń mobilnych. |
| **SUMA MIESIĘCZNA** | | **Kompletny ekosystem regionalny HubMI** | **~$50 – $90 USD** (**ok. 200 – 360 PLN netto / miesięcznie**) |

### 3.2. Wnioski Ekonomiczne dla ROPS Kraków
- Koszt rocznego utrzymania całego systemu wynosi **poniżej 4 500 PLN brutto**, co mieści się w standardowym budżecie bieżącym dowolnego wydziału JST bez konieczności uruchamiania kosztownych procedur przetargowych.
- Architektura serverless/managed eliminuje potrzebę zatrudniania dedykowanego administratora systemów (DevOps) po stronie urzędu.

---

## 4. Instrukcja Uruchomienia i Weryfikacji (Dla Ewaluatorów)

### 4.1. Szybkie Uruchomienie Lokalne

```bash
# 1. Klonowanie repozytorium
git clone https://github.com/daenyall/Hubmi.git
cd Hubmi

# 2. Uruchomienie Backend API (Python 3.12+)
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py  # Serwer startuje na http://localhost:8000

# 3. Uruchomienie Frontendu (w osobnym oknie terminala)
cd ../frontend
npm install
npm run dev    # Interfejs startuje na http://localhost:3000
```

### 4.2. Zautomatyzowane Testy Jakościowe i Bezpieczeństwa

Projekt posiada 100% pokrycia kluczowych ścieżek krytycznych testami jednostkowymi i integracyjnymi:

```bash
# Testy Backend (96 testów: bezpieczeństwo RLS, wektory, Gemini AI, odporność)
cd backend
.venv/bin/pytest tests/ -v

# Testy Frontend (115 testów: walidacja formularzy, timeouty, obsługa kontraktów, A11y)
cd ../frontend
node --test tests/*.mjs
```
Wynik: **211 testów przechodzi pomyślnie (0 błędów, 0 regresji).**

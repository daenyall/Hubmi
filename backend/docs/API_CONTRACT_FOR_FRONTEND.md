# Kontrakt API Backendu dla Frontendu HubMI (Dla Daniela & Claude'a)

Ten dokument zawiera specyfikację kontraktów endpointów FastAPI w `backend/` dla zespołu frontendowego HubMI.

---

## 1. Architektura Podziału Ról (SDK vs FastAPI)

1. **Supabase PostgREST (Direct Client SDK)**:
   - Fiszki i formularze (`submissions`): tworzenie i odczyt własnych zgłoszeń (RLS chroni dane).
   - Wiadomości (`submission_messages`): komunikacja autor <-> ekspert ROPS (RLS + trigger serwerowy).
   - Publiczna lista sprawdzonych innowacji (`innovations` where `status = 'sprawdzone'`).

2. **FastAPI (`http://localhost:8000` / URL Produkcyjny)**:
   - Wyszukiwanie wektorowe i ranking AI (`POST /api/match`).
   - Asystent adaptacji lokalnej Middleman AI (`POST /api/adapt`).
   - Panel Administratora ROPS (tworzenie, edycja i publikacja innowacji z auto-przeliczaniem wektorów 1536D): `/api/admin/innovations`.
   - Moduł testowania innowacji w gminach (Punkt IV wyzwania): `/api/testing/*`.

---

## 2. Autoryzacja i Nagłówki

Do endpointów administracyjnych (`/api/admin/*` oraz `/api/testing/applications`):
- **Wersja z logowaniem Supabase (Zalecana)**:
  `Authorization: Bearer <supabase_access_token>`
  *(Użytkownik musi posiadać rolę `rops_admin` w `app_metadata.hubmi_role`)*.
- **Wersja Developerska / Szybkie Testy**:
  `X-Admin-Role: rops_admin`
  *(Działa automatycznie w trybie `ENVIRONMENT=development` bez konieczności przekazywania tokenu)*.

---

## 3. CORS i Domeny Vercel
Backend posiada włączone wsparcie dla:
- `http://localhost:3000` oraz `http://127.0.0.1:3000`
- Wszystkich podglądów i domen Vercela: `allow_origin_regex=r"https://.*\.vercel\.app"`

---

## 4. Specyfikacja Endpointów

### A. Wyszukiwanie Semantyczne i Rekomendacja AI (Kreator)
- **Metoda i URL**: `POST /api/match`
- **Request Body**:
  ```json
  {
    "problem_description": "Szukamy sposobu na aktywizację samotnych seniorów w małej gminie wiejskiej, którzy nie wychodzą z domów.",
    "category": "Seniorzy", 
    "target_group": "Seniorzy 65+",
    "limit": 3
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "matches": [
      {
        "id": "inv_01",
        "title": "Kawiarnia Międzypokoleniowa",
        "similarity_score": 0.884,
        "why_relevant": "Rozwiązanie bezpośrednio przeciwdziała izolacji społecznej osób starszych poprzez integrację z młodzieżą.",
        "source_url": "https://rops.krakow.pl/innowacje/kawiarnia",
        "target_group": "Seniorzy i młodzież",
        "category": "Seniorzy",
        "description": "Przestrzeń spotkań łącząca pokolenia...",
        "status": "sprawdzone"
      }
    ],
    "ai_recommendation": "Zalecamy adaptację Kawiarni Międzypokoleniowej lub wykorzystanie mobilnych animatorów w sołectwach.",
    "total_matched": 1
  }
  ```

---

### B. Moduł Middleman AI (Dostosowanie do Gminy)
- **Metoda i URL**: `POST /api/adapt`
- **Request Body**:
  ```json
  {
    "innovation_title": "Kawiarnia Międzypokoleniowa",
    "innovation_description": "Przestrzeń spotkań seniorów z młodzieżą w remizie lub domu kultury.",
    "municipality_context": "Gmina wiejska Lipnica Wielka, rozproszona zabudowa, brak kawiarni, silne Koło Gospodyń Wiejskich i OSP.",
    "municipality_type": "wiejska",
    "budget_range": "20-50k PLN",
    "time_horizon": "6 miesięcy",
    "key_partners": ["OSP", "KGW", "Szkoła Podstawowa"]
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "innovation_title": "Kawiarnia Międzypokoleniowa",
    "adaptation_plan": "### 1. Diagnoza barier...\n### 2. Plan wdrożenia...",
    "estimated_budget_pln": "25 000 - 35 000 PLN",
    "recommended_grants": ["FERS Działanie 05.01", "Fundusz Sołecki", "Program Aktywni Błękitni"],
    "key_kpis": [
      "Min. 40 unikalnych seniorów uczestniczących w spotkaniach miesięcznie",
      "Min. 2 warsztaty międzypokoleniowe w miesiącu",
      "Trwałość partnerstwa z lokalnym KGW i OSP"
    ]
  }
  ```

---

### C. Administracja Wiedzą (Panel ROPS)

#### 1. Dodanie Nowej Innowacji (z auto-wektorem)
- **Metoda i URL**: `POST /api/admin/innovations`
- **Nagłówek**: `X-Admin-Role: rops_admin` lub `Authorization: Bearer <jwt>`
- **Request Body**:
  ```json
  {
    "title": "Mobilny Animator Społeczny",
    "description": "Mobilny zespół wsparcia docierający do wykluczonych komunikacyjnie wsi.",
    "target_group": "Mieszkańcy wsi wykluczeni komunikacyjnie",
    "category": "Wykluczenie terytorialne",
    "why_relevant": "Rozwiązuje problem braku transportu publicznego w gminach górskich.",
    "source_url": "https://rops.krakow.pl/innowacje/mobilny-animator",
    "status": "sprawdzone",
    "author_or_institution": "ROPS Kraków"
  }
  ```
- **Response (200 OK)**: Obiekt innowacji z identyfikatorem i wyliczonym embeddingiem w bazie pgvector.

#### 2. Edycja Istniejącej Innowacji (z auto-aktualizacją wektora)
- **Metoda i URL**: `PUT /api/admin/innovations/{innovation_id}`
- **Nagłówek**: `X-Admin-Role: rops_admin` lub `Authorization: Bearer <jwt>`
- **Request Body**: Dowolne pola do aktualizacji (`title`, `description`, `target_group`, `category`, `why_relevant`, `status`).
  *(Jeśli zmienisz tytuł lub opis, backend automatycznie przelicza wektor w pgvector!)*

#### 3. Publikacja Innowacji (status 'sprawdzone')
- **Metoda i URL**: `POST /api/admin/innovations/{innovation_id}/publish`
- **Nagłówek**: `X-Admin-Role: rops_admin` lub `Authorization: Bearer <jwt>`
- **Response (200 OK)**: Obiekt innowacji ze statusem `sprawdzone`.

---

### D. Testowanie Innowacji w Gminach (Punkt IV Wyzwania ROPS)

#### 1. Zgłoszenie Chęci Przetestowania Rozwiązania przez JST/CUS
- **Metoda i URL**: `POST /api/testing/apply`
- **Request Body**:
  ```json
  {
    "innovation_id": "inv_01",
    "institution_name": "Centrum Usług Społecznych w Myślenicach",
    "contact_person": "Jan Kowalski, Koordynator Usług",
    "contact_email": "j.kowalski@cus.myslenice.pl",
    "contact_phone": "+48 12 372 00 00",
    "testing_scope": "pilotaz_3m",
    "target_audience_count": 30,
    "notes": "Chcemy pilotażowo wdrożyć spotkania w 2 świetlicach wiejskich."
  }
  ```

#### 2. Wystawienie Opinii / Oceny z Pilotażu
- **Metoda i URL**: `POST /api/testing/feedback`
- **Request Body**:
  ```json
  {
    "innovation_id": "inv_01",
    "application_id": "optional_app_id",
    "rating_usability": 5,
    "rating_effectiveness": 4,
    "rating_accessibility": 5,
    "pros": "Prosta organizacja, olbrzymi entuzjazm seniorów i młodzieży.",
    "cons_and_barriers": "Konieczność zapewnienia dojazdu dla seniorów z odległych przysiółków.",
    "suggested_improvements": "Warto połączyć z lokalnymi przewozami gminnymi.",
    "would_recommend": true,
    "author_name": "Anna Nowak, CUS Myślenice"
  }
  ```

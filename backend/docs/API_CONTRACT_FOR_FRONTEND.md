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

#### 3. Aktualizacja Statusu Pilotażu przez ROPS Kraków (Zabezpieczone)
- **Metoda i URL**: `PATCH /api/testing/applications/{application_id}/status`
- **Nagłówek**: `Authorization: Bearer <jwt>` (użytkownik ROPS) lub `X-Admin-Role: rops_admin` w dev
- **Request Body**:
  ```json
  {
    "status": "zaakceptowane",
    "rops_notes": "Zatwierdzono dofinansowanie pilotażu ze środków ROPS Kraków."
  }
  ```
  *(Dla kompatybilności wstecznej pole `notes` w body jest traktowane jako `rops_notes`)*.
- **Dozwolone statusy (`status`)**:
  - `"nowe"`, `"zaakceptowane"`, `"w_trakcie"`, `"zakonczone"`, `"odrzucone"`.
  - Każda wartość spoza tej listy zwraca kod `422 Unprocessable Entity`.
- **Zasada nienaruszalności uwag wnioskodawcy**:
  - `TestApplicationResponse.notes` zawiera wyłącznie uwagi instytucji zgłaszającej z formularza `apply`.
  - `TestApplicationResponse.rops_notes` zawiera notatkę urzędową ROPS dodaną podczas `PATCH`.
  - Notatka ROPS nigdy nie nadpisuje uwag zgłaszającego!

#### 4. Raport Ewaluacji i Oceny Innowacji
- **Metoda i URL**: `GET /api/testing/feedback/{innovation_id}`
- **Response (200 OK)**:
  ```json
  {
    "innovation_id": "inv_01",
    "total_reviews": 0,
    "avg_usability": 0.0,
    "avg_effectiveness": 0.0,
    "avg_accessibility": 0.0,
    "overall_rating": 0.0,
    "recommendation_percentage": 0.0,
    "recent_reviews": []
  }
  ```
  *Uwaga: Przy `total_reviews == 0`, pole `recommendation_percentage` wynosi `0.0%` (nie sugeruje 100% poleceń).*

---

### E. Generator Wniosków Grantowych (Załącznik nr 3 ROPS Kraków)
Wzór: *Załącznik nr 3 do Ogłoszenia projektu „Inkubator Włączenia Społecznego 2.0” (Działanie 5.1 FERS 2021-2027)*

#### 1. Lista Dostępnych Naborów i Wzorów
- **Metoda i URL**: `GET /api/grant-calls` oraz `GET /api/grant-calls/{call_id}`
- **Response (200 OK)**:
  ```json
  [
    {
      "id": "c0000000-0000-0000-0000-000000000001",
      "name": "Inkubator Włączenia Społecznego 2.0 – Nabór Pomysłów na Innowacje Społeczne (ROPS Kraków)",
      "template_name": "za._3._Formularz_aplikacyjny_wzor.pdf",
      "template_version": "1.0",
      "status": "demonstracyjny",
      "description": "Oficjalny wzór naboru grantowego na innowacje społeczne...",
      "max_grant_amount": 100000.0,
      "max_prep_months": 3,
      "max_test_months": 9
    }
  ]
  ```

#### 2. Tworzenie i Trwały Zapis Roboczego Wniosku (Draft)
- **Tworzenie**: `POST /api/grant-applications` (wymaga nagłówka `Authorization: Bearer <jwt>`)
- **Request Body**:
  ```json
  {
    "call_id": "c0000000-0000-0000-0000-000000000001",
    "title": "Mobilna Kawiarnia Senioralna w Małopolsce",
    "applicant_type": "osoba_fizyczna",
    "applicant_data": {
      "first_name": "Jan",
      "last_name": "Kowalski",
      "email": "jan.kowalski@example.com",
      "phone": "+48 12 345 67 89",
      "address": { "street": "ul. Krakowska 1", "postal_code": "30-001", "city": "Kraków" }
    }
  }
  ```
- **Zapis roboczy / aktualizacja**: `PUT /api/grant-applications/{application_id}`
  *(Autor może aktualizować dowolne sekcje wniosku w trakcie pracy. Złożony wniosek zostaje zablokowany przed modyfikacją).*

#### 3. Moje Wnioski (Izolacja Danych Autorów)
- **Metoda i URL**: `GET /api/grant-applications/my`
- **Nagłówek**: `Authorization: Bearer <jwt>`
- **Response**: Zwraca wyłącznie wnioski należące do zalogowanego użytkownika (`user_id = auth.uid()`). Próba odczytu lub edycji cudzego wniosku zwraca `403 Forbidden`.

#### 4. Oficjalne Złożenie Wniosku w Naborze
- **Metoda i URL**: `POST /api/grant-applications/{application_id}/submit`
- **Walidacje**:
  1. **Stan naboru**: jeśli nabór ma stan `"zamkniety"`, zwracany jest błąd `400 Bad Request` z blokadą zgłoszeń.
  2. **Kompletność**: weryfikacja wypełnienia sekcji 1–8 oraz 11.
  3. **Zgodność kosztów (Pkt 9 i 10)**: suma pozycji budżetowych w planie działania (`prep_period` + `test_period`) MUSI być dokładnie równa `grant_amount`. W przypadku różnicy zwracany jest błąd `422 Unprocessable Entity` z kwotą różnicy.
  4. **Świadome potwierdzenie oświadczeń (Pkt 12)**: pole `declarations.all_confirmed` musi wynosić `true` (odpowiedzialność karna art. 297 § 1 k.k.).
- **Response (200 OK)**: Wniosek ze statusem `"zlozony"` oraz polem `submitted_at`.

#### 5. Podgląd i Eksport Wniosku (Wydruk / PDF)
- **Metoda i URL**: `GET /api/grant-applications/{application_id}/export` (oraz `/preview`)
- **Response (200 OK)**:
  ```json
  {
    "application_id": "...",
    "call_name": "Inkubator Włączenia Społecznego 2.0 (ROPS Kraków)",
    "template_name": "za._3._Formularz_aplikacyjny_wzor.pdf",
    "template_version": "1.0",
    "status": "zlozony",
    "submitted_at": "2026-10-04T02:40:00Z",
    "structured_data": { ... },
    "formatted_document_text": "================================================================================\nZAŁĄCZNIK NR 3 DO OGŁOSZENIA\nFORMULARZ APLIKACYJNY – INKUBATOR WŁĄCZENIA SPOŁECZNEGO 2.0\n...\n"
  }
  ```
  *(Pole `formatted_document_text` zawiera sformatowaną, pełną treść wniosku gotową do wyświetlenia w oknie podglądu lub bezpośredniego wydruku).*

#### 6. Panel Administratora ROPS Kraków
- **Lista wszystkich wniosków**: `GET /api/admin/grant-applications` (filtry: `call_id`, `status`)
- **Szczegóły wniosku**: `GET /api/admin/grant-applications/{application_id}`
- **Ocena i zmiana statusu**: `PATCH /api/admin/grant-applications/{application_id}/status`
  ```json
  {
    "status": "zaakceptowany",
    "rops_notes": "Rekomendacja Komisji Oceny Innowacji: pozytywna."
  }
  ```



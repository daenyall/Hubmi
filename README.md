# Splot — innowacje dla potrzeb społecznych

Projekt na HackYeah 2026, przygotowany dla wyzwania Regionalnego Ośrodka Polityki Społecznej w Krakowie. Splot łączy opis lokalnej potrzeby z katalogiem innowacji społecznych, pomaga przygotować plan adaptacji i obsługuje zgłoszenia kierowane do ROPS. Repozytorium zachowuje nazwę **Hubmi**; w interfejsie aplikacji używana jest nazwa **Splot**.

Frontend działa w Next.js 16 i React 19, backend w FastAPI. Supabase zapewnia bazę PostgreSQL, logowanie i uprawnienia do danych. Backend korzysta z usług AI do dopasowania innowacji i generowania planów adaptacji.

## Od czego zacząć ocenę

1. Uruchom aplikację według [instrukcji poniżej](#uruchomienie-lokalne) i otwórz [stronę główną](http://localhost:3000).
2. Wpisz potrzebę, np. „W naszej gminie osoby starsze mieszkające samotnie potrzebują regularnych spotkań i wsparcia”. Sprawdź dopasowania, ich uzasadnienia i linki źródłowe. Przy wybranym rozwiązaniu rozwiń „Plan adaptacji AI” i podaj lokalny kontekst.
3. Otwórz [Zasobnik Wiedzy](http://localhost:3000/baza-wiedzy): przejrzyj innowacje, materiały i wyzwania regionalne. Sprawdź wyszukiwanie oraz filtry.
4. Zaloguj się kontem autora. W [kreatorze pomysłu](http://localhost:3000/kreator) zapisz fiszkę, następnie odczytaj ją w [Moich zgłoszeniach](http://localhost:3000/moje-zgloszenia), także po odświeżeniu strony.
5. W osobnej sesji przeglądarki zaloguj się kontem ROPS. W [panelu ROPS](http://localhost:3000/rops) otwórz tę fiszkę, zmień status, dodaj oficjalną odpowiedź i wiadomość w rozmowie. Wróć do konta autora i sprawdź odpowiedzi.
6. Przejdź przez pozostałe ścieżki: zgłoszenie potrzeby, zgłoszenie do pilotażu oraz wniosek w naborze. Odpowiadające im widoki pracownika ROPS są opisane w tabeli poniżej.

Do pełnego przebiegu potrzebne są skonfigurowana baza oraz konta autora i pracownika ROPS przygotowane przez zespół. Hasła nie są częścią repozytorium. Nabór oznaczony jako demonstracyjny służy do prezentacji — złożenie w nim wniosku nie oznacza udziału w oficjalnym konkursie.

## Mapa aplikacji

Adresy w tabeli zakładają lokalny frontend na porcie 3000. `[id]` oznacza identyfikator zapisanego rekordu; do szczegółów prowadzą linki na listach.

| Ekran | Adres | Co można sprawdzić |
| --- | --- | --- |
| Znajdź rozwiązania | [/#wyszukaj](http://localhost:3000/#wyszukaj) | Opis potrzeby, dopasowane innowacje, uzasadnienia, źródła i plan adaptacji AI. |
| Zasobnik Wiedzy | [/baza-wiedzy](http://localhost:3000/baza-wiedzy) | Katalog innowacji i materiałów, wyszukiwanie, kategorie i wyzwania regionalne. |
| Zgłoś potrzebę | [/zglos-potrzebe](http://localhost:3000/zglos-potrzebe) | Formularz lokalnej potrzeby oraz odczyt własnych zgłoszeń po zalogowaniu. |
| Zgłoś pomysł | [/kreator](http://localhost:3000/kreator) | Fiszka: potrzeba, rozwiązanie, odbiorcy, etap i opcjonalne powiązanie z innowacją. |
| Moje zgłoszenia | [/moje-zgloszenia](http://localhost:3000/moje-zgloszenia) | Własne fiszki; szczegóły, status, oficjalna odpowiedź i rozmowa w `/moje-zgloszenia/[id]`. |
| Tester innowacji | [/tester](http://localhost:3000/tester) | Zgłoszenie instytucji do pilotażu, własne zgłoszenia, opinie i podsumowania ocen. |
| Wniosek w naborze | [/wnioski](http://localhost:3000/wnioski) | Nabory i własne wnioski; edycja w `/wnioski/[id]`, druk i eksport TXT w `/wnioski/[id]/podglad`. |
| Logowanie | [/logowanie](http://localhost:3000/logowanie) | Logowanie istniejącym kontem Supabase przez email i hasło. |
| Panel ROPS | [/rops](http://localhost:3000/rops) | Lista fiszek z filtrami; szczegóły, zmiana statusu i kontakt z autorem w `/rops/zgloszenia/[id]`. |
| ROPS: baza wiedzy | [/rops/innowacje](http://localhost:3000/rops/innowacje) | Tworzenie i edycja innowacji oraz zarządzanie materiałami: weryfikacja, publikacja i wycofanie. |
| ROPS: potrzeby regionu | [/rops/potrzeby](http://localhost:3000/rops/potrzeby) | Lista potrzeb, zestawienia, statusy i wewnętrzne notatki. |
| ROPS: pilotaże | [/rops/tester](http://localhost:3000/rops/tester) | Obsługa zgłoszeń testowych, zmiana statusów i notatki ROPS. |
| ROPS: wnioski | [/rops/wnioski](http://localhost:3000/rops/wnioski) | Lista z filtrami i odczyt wniosku w `/rops/wnioski/[id]`. |

Gość może korzystać z wyszukiwarki i publicznych materiałów. Zapisy oraz prywatne listy wymagają logowania. Panel pracownika wymaga roli `app_metadata.hubmi_role=rops_admin` nadanej po stronie serwera. Sam adres email ani przejście na `/rops` nie nadają uprawnień.

## Uruchomienie lokalne

Wymagania: Node.js 20.9 lub nowszy (zalecany 22), npm, Python 3.11 lub nowszy oraz projekt Supabase. Pełna ocena wymaga tabel, migracji, danych katalogu i kont Supabase Auth. Pliki `.env.example` zawierają przykłady konfiguracji, bez danych dostępowych.

### Backend

W katalogu głównym repozytorium:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Przed uruchomieniem uzupełnij `backend/.env`:

| Zmienna | Znaczenie |
| --- | --- |
| `SUPABASE_URL` | Adres projektu Supabase używanego również przez frontend. |
| `SUPABASE_KEY` | Klucz serwerowy do operacji backendu; dla pełnej obsługi administracyjnej klucz `service_role`. |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | Klucze dostawców AI. Przebieg opisany w raporcie końcowym korzystał z Gemini. |
| `GEMINI_EMBEDDING_MODEL`, `GEMINI_GENERATION_MODEL`, `GEMINI_GENERATION_FALLBACK_MODELS` | Wybór modeli; wartości domyślne są w pliku przykładowym i konfiguracji backendu. |
| `CORS_ORIGINS` | Dozwolone adresy frontendu; przykład obejmuje `http://localhost:3000`. |

Następnie:

```bash
python run.py
```

API: [http://localhost:8000](http://localhost:8000). [Swagger](http://localhost:8000/docs) zawiera aktualne endpointy i schematy żądań. [Health check](http://localhost:8000/api/health) pozwala sprawdzić m.in. `supabase_connected`.

### Frontend

W drugim terminalu, z katalogu głównego repozytorium:

```bash
cd frontend
npm ci
cp .env.example .env.local
```

Uzupełnij `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_USE_MOCK_MATCHING=false
NEXT_PUBLIC_SUPABASE_URL=https://TWOJ-PROJEKT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=PUBLICZNY_KLUCZ_PROJEKTU
NEXT_PUBLIC_SUBMISSIONS_ENABLED=true
NEXT_PUBLIC_ROPS_COMMUNICATION_ENABLED=true
```

Publiczny klucz `NEXT_PUBLIC_SUPABASE_ANON_KEY` jest obsługiwany jako alternatywa dla publishable key. Klucz `service_role` pozostaje wyłącznie w backendzie. Adres backendu podaj bez końcowego `/api`.

Flagi zapisu fiszek i komunikacji włączaj w środowisku z wdrożonym schematem, triggerami i politykami RLS. W pliku przykładowym są wyłączone. Po zmianie zmiennych zrestartuj serwer; dla wersji produkcyjnej wykonaj ponownie build.

```bash
npm run dev
```

Otwórz [http://localhost:3000](http://localhost:3000).

### Baza i dane

Schemat początkowy znajduje się w [backend/supabase_schema.sql](backend/supabase_schema.sql), a kolejne zmiany w [backend/migrations/](backend/migrations/), numerowane od `02` do `12`. Obejmują m.in. fiszki i wiadomości, role i RLS, pilotaże, potrzeby, nabory i materiały wiedzy. Przy przygotowywaniu nowej bazy zastosuj schemat i migracje w kolejności numerów; samo uruchomienie serwerów nie tworzy tych tabel ani kont.

Dane katalogu są w [backend/scripts/data/innovations.json](backend/scripts/data/innovations.json), a import w [backend/scripts/seed_data.py](backend/scripts/seed_data.py). Z katalogu `backend/` można najpierw sprawdzić plik bez zapisu:

```bash
python scripts/seed_data.py --dry-run
```

Import do skonfigurowanej bazy wykonuje `python scripts/seed_data.py`. Tworzy embeddingi i zapisuje rekordy, więc wymaga dostępu do bazy i dostawcy AI. Konta użytkowników i rolę pracownika ROPS przygotowuje się oddzielnie w Supabase Auth.

### Podgląd wyszukiwarki bez backendu

Z katalogu `frontend/`:

```bash
NEXT_PUBLIC_USE_MOCK_MATCHING=true npm run dev
```

Wybierz przykład „Samotność seniorów” lub „Dostępność wsparcia”. Ten tryb pokazuje oznaczone, fikcyjne dopasowania z [mock-matching.ts](frontend/src/lib/mock-matching.ts). Obejmuje wyłącznie wyszukiwarkę; plan AI, logowanie i zapisy wymagają rzeczywistych usług. Błąd prawdziwego API nie przełącza aplikacji na dane demonstracyjne.

## Gdzie szukać implementacji

| Obszar | Frontend | Backend |
| --- | --- | --- |
| Strony i nawigacja | [src/app/](frontend/src/app/), [site-header.tsx](frontend/src/components/site-header.tsx) | [app/main.py](backend/app/main.py), [router.py](backend/app/api/router.py) |
| Dopasowania i adaptacja | [matching-form.tsx](frontend/src/components/matching-form.tsx), [adaptation-form.tsx](frontend/src/components/adaptation-form.tsx), [lib/api.ts](frontend/src/lib/api.ts) | [match.py](backend/app/api/endpoints/match.py), [middleman.py](backend/app/api/endpoints/middleman.py), [services/ai.py](backend/app/services/ai.py) |
| Fiszki i rozmowy | [features/submissions/](frontend/src/features/submissions/), [features/messages/](frontend/src/features/messages/), [features/rops/](frontend/src/features/rops/) | [submissions.py](backend/app/api/endpoints/submissions.py), [admin.py](backend/app/api/endpoints/admin.py) |
| Potrzeby regionu | [features/needs/](frontend/src/features/needs/) | [needs.py](backend/app/api/endpoints/needs.py), [services/needs.py](backend/app/services/needs.py) |
| Pilotaże i oceny | [features/tester/](frontend/src/features/tester/) | [testing.py](backend/app/api/endpoints/testing.py), [services/testing.py](backend/app/services/testing.py) |
| Wnioski w naborach | [features/grants/](frontend/src/features/grants/) | [grant_applications.py](backend/app/api/endpoints/grant_applications.py), [services/grant_applications.py](backend/app/services/grant_applications.py) |
| Zasobnik Wiedzy | [features/knowledge/](frontend/src/features/knowledge/) | [innovations.py](backend/app/api/endpoints/innovations.py), [knowledge_resources.py](backend/app/api/endpoints/knowledge_resources.py) |
| Logowanie i uprawnienia | [features/auth/](frontend/src/features/auth/), [lib/supabase/](frontend/src/lib/supabase/) | [core/security.py](backend/app/core/security.py), [migrations/](backend/migrations/) |
| Kontrakt danych | Modele i serwisy w poszczególnych `features/` | [models/schemas.py](backend/app/models/schemas.py) |
| Testy | [tests/](frontend/tests/), [tests/e2e/](frontend/tests/e2e/) | [tests/](backend/tests/) |

Frontend odczytuje i zapisuje fiszki oraz rozmowy przez klienta Supabase. Pozostałe moduły korzystają z FastAPI; autoryzowane żądania przekazują sesję Supabase. Z tego powodu ocena uprawnień obejmuje zarówno backend, jak i polityki RLS bazy.

## Weryfikacja i dokumentacja

[Raport końcowego przebiegu z 4 października 2026](frontend/docs/stage-7-verification.md) opisuje testy na rzeczywistym Supabase i Gemini: dopasowanie, plan adaptacji, obieg fiszki, potrzeby, pilotaże, wnioski oraz publikację materiałów. Zawiera wyniki kontroli izolacji kont autora A/B i ROPS oraz rozróżnia testy integracyjne od testów na atrapach. Są to wyniki zapisane w raporcie, nie automatyczne potwierdzenie dowolnego nowego środowiska.

Raport odnotowuje poprawne demo lokalne oraz blokadę publicznego dostępu do wdrożenia przez ekran logowania Vercel. Do odtworzenia oceny służą adresy lokalne podane wyżej; wcześniejsze linki do tymczasowych tuneli nie są stałym adresem projektu.

Kontrole frontendu, wykonywane w `frontend/`:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Izolowane regresje końcowego przebiegu, wykonywane w `backend/` z aktywnym środowiskiem Python:

```bash
pytest -q tests/test_demo_readiness.py tests/test_embedding_failure_regression.py tests/test_knowledge_edit_regressions.py
```

Pełny zestaw backendu jest w `backend/tests/`; część testów sprawdza rzeczywiste połączenie lub RLS i wymaga przygotowanej bazy testowej. Scenariusze przeglądarkowe w `frontend/tests/e2e/` wymagają uruchomionych usług, Playwright/Chromium i kont testowych — opis przygotowania i zakres wyników znajduje się w raportach.

Dokumenty pomocnicze:

- [Etap 6: Zasobnik Wiedzy i ROPS](frontend/docs/stage-6-verification.md) — publikacja i wycofywanie materiałów, widoczność szkiców, źródła i izolacja kont.
- [Generator wniosków](frontend/docs/grant-application.md) — pola wzoru, zapis, podgląd, eksport i scenariusze naborów.
- [Potrzeby regionu — kontrakt API](backend/docs/NEEDS_AGGREGATION_CONTRACT_PUNKT_7.md) — zgłaszanie potrzeb i zestawienia dla ROPS.
- [Wdrożenie backendu](backend/docs/DEPLOYMENT_GUIDE.md) — konfiguracja hostingu, CORS i kontrola połączenia.
- [Szacunek kosztów utrzymania](backend/docs/TCO_ESTIMATE.md) — założenia kosztorysu.

Dokumenty z wcześniejszych etapów zachowują stan integracji z chwili ich napisania. Przy rozbieżnościach dotyczących gotowości funkcji korzystaj z raportu etapu 7, a dla endpointów, pól i zmiennych — z bieżącego kodu oraz Swaggera uruchomionego backendu.

# Etap 7 — końcowy przebieg

4 października 2026. **Pełne demo w sprawdzonym środowisku lokalnym: PASS. Gotowość funkcjonalna do polishu: PASS. Publiczna dostępność demo na Vercel: BLOCKED przez ekran logowania Vercel.**

Aktualny `main`: `ad351fe`, po scaleniu PR #22; drzewo identyczne z wcześniej sprawdzonym `ff2b5d8`. Kontynuacja na `fix/stage7-demo-readiness`, bez ponownego audytu. Istniejące Next.js 16.3.8 (`localhost:3000`), FastAPI 1.0.0 (`localhost:8000`) i prawdziwy Supabase. Health: `supabase_connected=true`; konfiguracje wskazują ten sam projekt, matching mock wyłączony, fiszki i rozmowa włączone. Konta A/B/ROPS z ignorowanego `.env.test.local`. Zwykłe sesje użytkowników w przeglądarce; klucz serwerowy wyłącznie do własnych fixture i kontrolowanego sprzątania.

Odtworzono branch, commity, lokalne zmiany, procesy, raporty etapów 2/generatora/6 i rozpoczęte logi etapu 7. Zachowano poprawne wyniki niezależnych modułów. Ponowiono tylko naprawione ścieżki AI, innowacji, walidacji wniosku oraz konieczne regresje. Przejście do aktualnego main przez `fetch` i fast-forward; bez reset/stash, instalacji zależności i zmiany env.

## Wyniki rzeczywistej integracji

| Scenariusz | Wynik | Dowód |
| --- | --- | --- |
| Problem → rzeczywiste dopasowania | PASS | Przeglądarka: POST `/api/match` → 200, niepuste wyniki z opublikowanych innowacji Supabase. Rzeczywiste embeddingi Gemini, bez atrap wektorów i sztucznych wyników. |
| Szczegóły, źródło i demonstracyjność | PASS | Oznaczenia i link źródłowy w wynikach, katalogu oraz powiązanej fiszce. |
| Rzeczywisty plan adaptacji i pochodzenie | PASS | Z wyników dopasowania: POST `/api/adapt` → 200, `generation_source=gemini`, `is_ai_generated=true`, treść planu i oznaczenie „Treść wygenerowana przez AI” w UI. Szablon awaryjny nie spełnia warunku testu. |
| Fiszka → F5 → ROPS → F5 autora | PASS | Zapis w Supabase, odczyt po odświeżeniu, odczyt ROPS, oficjalna odpowiedź i osobna wiadomość; autor odczytuje obie po F5. |
| Potrzeba → F5 → lista/zestawienie ROPS → status → autor | PASS | Trwały zapis, zgodne zestawienie, status `analizowane` bez F5 w ROPS, odczyt autora po F5; wewnętrzna notatka ROPS niewidoczna autorowi. |
| Tester: zgłoszenie → ROPS → ponowny odczyt | PASS | Wcześniejszy poprawny przebieg: Supabase, F5, status `zaakceptowane`, osobne `rops_notes`, oryginalne `notes` niezmienione. Ten kod nie zmienił się. |
| Publiczne podsumowanie ocen | PASS | Własna rzeczywista opinia 3/3/3, brak rekomendacji; API i UI pokazują opinię i 3/5. Opinię usunięto. Wynik zachowany. |
| Wniosek: szkic → zapis → F5 → podgląd/eksport → złożenie → ROPS | PASS | Ponowiony przebieg po poprawce: baza potwierdza szkic, eksport TXT zawiera oznaczenie demonstracyjności; poprawne złożenie przez UI i odczyt ROPS. |
| Zamknięty nabór i edycja po złożeniu | PASS | API odrzuca oba działania kodem 400. Zamykano wyłącznie własny nabór o nowym UUID, bez zmiany wspólnego naboru. |
| Wymagane oświadczenia wniosku | PASS | Kompletny szkic z samym `all_confirmed=true`: POST `/submit` → 422, nadal `roboczy`. Sześć indywidualnych potwierdzeń pozwala złożyć wniosek przez frontend. |
| Innowacja: utworzenie szkicu → edycja → publikacja | PASS | Wszystkie operacje przez UI ROPS i rzeczywisty dostawca embeddingów. Szkic publicznie 404; edycja opisu potwierdzona odczytem; publikacja → widoczny „Sprawdzone” bez F5 i publiczny GET 200. |
| Widoczność szkicu w API i RLS | PASS | Wcześniejszy własny fixture: GET po ID 404, parametr `status=nowa` nie ujawnia szkicu, anon/B przez RLS widzą 0 wierszy. Nowy szkic utworzony przez UI również publicznie 404. |
| Zasób: szkic → edycja/weryfikacja → publikacja → wycofanie → usunięcie | PASS | Zachowany rzeczywisty cykl przez ROPS: publiczne API 404/200/404, obecność w Zasobniku, aktualizacje bez F5, brak rekordu po usunięciu. Kod zasobów nie zmienił się. |
| Izolacja A/B oraz odmowa operacji ROPS | PASS | Ponowiono: B nie odczytuje fiszki A, potrzeby A ukryte przez RLS, odczyt/edycja wniosku A → 403. Zachowano wcześniejsze potwierdzenie odmowy gościa/autora dla odczytu i tworzenia ROPS → 401/403 oraz blokady edycji fiszki B. |
| Główna ścieżka: klawiatura, 375 px, tekst 200% | PASS | Tab/Enter uruchamia dopasowanie; rzeczywiste wyniki i wygenerowany plan nie powodują poziomego przewijania. Brak błędów JavaScript. |

## Usunięte blokady i poprawki

- Wyczerpany limit `gemini-embedding-2` dawał 429/503, a poprzednie modele planu zwracały 429 i jedynie szablon. Bez zmiany kluczy wybrano dostępne, rzeczywiście sprawdzone modele: embedding `gemini-embedding-001`, generowanie `gemini-3.1-flash-lite`, rezerwa `gemini-3.6-flash,gemini-3.7-flash`. Są konfigurowalne w backendzie; przykład w `.env.example`.
- Nie porównujemy wektorów różnych modeli. Matching pobiera opublikowaną treść z Supabase i wylicza dokumenty oraz zapytanie tym samym aktywnym modelem, z buforem LRU po treści/modelu i czterema równoległymi wywołaniami. Nie zmieniano istniejących wektorów ani schematu bazy. Przy obecnym małym katalogu limit wynosi 1000 rekordów; większy katalog wymaga osobnego rozwiązania indeksowania. Niezgodność przestrzeni modeli opisuje [dokumentacja Gemini](https://ai.google.dev/gemini-api/docs/embeddings).
- Generowanie ma wspólny limit czasu dla prób, pomija przez 60 s modele zwracające 429/404, ogranicza długość planu i odrzuca odpowiedzi urwane przez `MAX_TOKENS`. Poziom myślenia dobrano zgodnie z [dokumentacją modeli](https://ai.google.dev/gemini-api/docs/generate-content/thinking). Brak odpowiedzi nadal daje jawnie oznaczony szablon, bez udawania wyniku AI.
- Ponowny smoke ujawnił chwilowe 503 dostawcy: pomocnicze uzasadnienie matchingu blokowało wszystkie modele na minutę, także dla planu. Usunięto wspólną blokadę dla przejściowego 503, podzielono limit czasu tak, by pierwsza próba nie zużywała czasu rezerwy, i ustawiono 30 s całego generowania. Bufor 128 kompletnych planów po pełnym prompcie ogranicza powtarzane wywołania dostawcy; nie zapisuje błędów ani szablonów. Cache przechowuje wyłącznie rzeczywiste treści Gemini, a inny kontekst ma osobny klucz. Pełna ścieżka przeszła ponownie 17/17; regresje potwierdzają ponowienie po 503 oraz sukces/błąd/zmianę kontekstu bufora.
- Blokujące wywołania dostawcy/bazy w matchingu, adaptacji oraz tworzeniu/edycji innowacji przeniesiono z pętli async do standardowego wykonania FastAPI dla funkcji synchronicznych. Frontend pozwala na 45 s oczekiwania zamiast 20 s, obejmując zimny bufor embeddingów.
- Tworzenie i edycja innowacji przy awarii embeddingów zwracają kontrolowane 503 przed zapisem, zamiast nieobsłużonego 500. Regresja potwierdza brak zapisu.
- Backend wymaga sześciu wartości logicznych `true`: `criminal_liability`, `no_double_funding`, `accept_procedures`, `no_fees`, `accessibility_dnsh`, `gdpr`. Sama flaga zbiorcza, pominięcie pola, tekst lub liczba nie wystarczają.
- Naprawiono wyścig edycji i publikacji innowacji: publikacja jest dostępna po zamknięciu edycji, a potwierdzony zapis zamyka formularz. Wcześniej równoległy zapis ze starym statusem mógł cofnąć właśnie wykonaną publikację. Rzeczywista regresja potwierdza kartę i API bez F5.
- Zachowano poprawki z PR #22: pochodzenie powiązanej innowacji, komunikat widoczności szkiców, import `sys` i regresję awarii embeddingów. Runner E2E wymaga rzeczywistego planu AI i rejestruje fiszkę do sprzątania także przy odpowiedzi zapisu w postaci pojedynczego obiektu.

## Kontrole końcowe i dowody

| Kontrola | Wynik |
| --- | --- |
| Główne E2E demo/potrzeby | 17/17 PASS — przeglądarka, prawdziwy backend/Supabase/Gemini |
| Wniosek i obejście oświadczeń | PASS — rzeczywiste API i przeglądarka; 422 dla obejścia, prawidłowe złożenie działa |
| Innowacja: tworzenie/edycja/publikacja | PASS — rzeczywisty backend, embeddingi i Supabase |
| `npm test` | 170/170 PASS — izolowane testy frontendu na atrapach |
| `npm run lint` | PASS, bez ostrzeżeń |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| Backend: `pytest -q tests/test_demo_readiness.py tests/test_embedding_failure_regression.py tests/test_knowledge_edit_regressions.py` | 24/24 PASS — izolowane regresje, bez zapisów do rzeczywistej bazy; ostrzeżenie biblioteki o nazwie stałej HTTP 422 |
| Sprzątanie i zachowanie środowiska | PASS — usunięto wyłącznie własne oznaczone rekordy; ponowny odczyt potwierdza brak; sumy env i zastanych zmian zgodne |

Aktualne dowody lokalne, ignorowane: `frontend/node_modules/.cache/hubmi-demo-fix/` — `main-e2e.log`, `affected-e2e.log` (poprawny odcinek wniosku), `innovation-e2e.log` (poprawny późniejszy odcinek innowacji), `backend-tests.log`, `frontend-tests.log`, `lint.log`, `types.log`, `build.log`, `cleanup-check.log`. `frontend/node_modules/.cache/hubmi-stage7/result.json` zawiera 17 potwierdzonych kontroli. Starsze dowody w `hubmi-stage7-final-check/final-paths.log`, `remaining.log`, `visibility-mobile.log` dokumentują zachowane wyniki niezależnych modułów. Starsze FAIL dla AI i publikacji zostały zastąpione późniejszymi poprawnymi przebiegami; nie są aktualnymi blokadami.

Atrapy/symulacje: testy jednostkowe oraz wcześniejszy kontrolowany 503 zapisu potrzeby (treść zachowana, bez komunikatu sukcesu). Wielokrotne `requestSubmit` potrzeby wysłały jeden rzeczywisty POST. Wcześniejszy fixture szkicu bez embeddingu sprawdzał tylko widoczność; obecny test tworzenia/edycji innowacji korzysta już z rzeczywistego dostawcy. Wskaźnik szablonu awaryjnego nie został zaliczony jako sukces AI.

`tests/e2e/stage7-main.mjs` obejmuje demo, potrzeby i podstawową obsługę klawiaturą/małego ekranu; wymaga istniejącego Playwright/Chromium oraz serwerów. Nie jest nową pełną macierzą audytu. Pozostałe moduły mają zachowane dowody zakończonych odcinków, z ponowieniem tylko dotkniętych zmianami testów.

Nie pozostają zgłoszenia blokujące wymagające dostępu Radka. Nie uruchamiano ręcznego deployu ani automatycznego merge. Istniejąca integracja GitHub–Vercel automatycznie wykonała deployment po pushu (check Vercel: SUCCESS, „Deployment has completed”); nie zastępuje to weryfikacji finalnego publicznego wdrożenia. Env oraz zastane zmiany `frontend/package-lock.json` i `frontend/tests/grants.test.mjs` zachowano i wyłączono z commitu. Cudzych PDF/PPTX i danych nie zmieniano.

Dodatkowa kontrola dostępności publicznej była wyłącznie odczytem istniejących deploymentów. Deployment PR #23 (`7987b01`) i aktualnego main (`ad351fe`) po przekierowaniu pokazują `Login – Vercel`, mimo checka SUCCESS. Publicznego demo nie zaliczono jako PASS. Udostępnienie publicznego adresu wymaga dostępu do ochrony deploymentu Vercel lub użycia autoryzowanej sesji prezentera; nie zmieniano konfiguracji ochrony ani nie wykonywano ręcznego deployu. Powtórzenia rzeczywistego planu: `hubmi-demo-fix/last-smoke.json`; aktualny E2E i regresje backendu mają późniejsze logi PASS.

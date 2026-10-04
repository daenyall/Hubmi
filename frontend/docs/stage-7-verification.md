# Etap 7 — końcowy przebieg

4 października 2026. **Pełne demo: BLOCKED. Polish może trwać; finalne wdrożenie wymaga usunięcia poniższych blokad.**

Kod bazowy: `main` / PR #20, `10b621a`. Gałąź zmian: `fix/stage7-final-verification`. Pobranie przez `fetch` i fast-forward, bez reset/stash. Środowisko: istniejący Next.js 16.3.8 na `localhost:3000`, FastAPI 1.0.0 na `localhost:8000`, rzeczywisty Supabase. Health: `supabase_connected=true`; frontend i backend wskazują ten sam projekt. Flagi fiszek i rozmowy włączone, matching mock wyłączony. Konta A/B/ROPS z ignorowanego `.env.test.local`; zwykłe sesje w przeglądarce. Klucz serwerowy służył wyłącznie do przygotowania własnego naboru/rekordu widoczności i kontrolowanego sprzątania.

Wykorzystano raporty etapów 2, generatora i 6, ich helpery oraz rozpoczęty `tests/e2e/stage7-main.mjs`. Zachowano wcześniejsze wyniki, a po błędach selektorów ponowiono tylko niepotwierdzone odcinki. Nie wykonywano ponownie całej macierzy zamkniętych etapów.

## Wyniki rzeczywistej integracji

| Scenariusz | Wynik | Dowód |
| --- | --- | --- |
| Problem → dopasowania | BLOCKED | POST `/api/match` → 503. Bezpośrednia próba dostawcy embeddingów Gemini → 429 `RESOURCE_EXHAUSTED`. UI pokazuje awarię i zachowuje opis. |
| Katalog, szczegóły i pochodzenie innowacji | PASS | Dane z API/Supabase; oznaczenie demonstracyjności i źródło pozostają widoczne również w kreatorze powiązanej fiszki. |
| Rzeczywisty plan AI i jego oznaczenie w pełnej ścieżce | BLOCKED | POST `/api/adapt` → 200, lecz `generation_source=template_fallback`, `is_ai_generated=false`. To rzeczywisty wynik usługi, ale szablon awaryjny, nie wygenerowany plan AI. Formularza planu w wynikach nie potwierdzono end-to-end z powodu niedostępnego matchingu. |
| Fiszka autora → F5 → odpowiedź ROPS → F5 autora | PASS | Zapis w `submissions`, odczyt po odświeżeniu, odczyt i odpowiedź ROPS, ponowny odczyt autora; wcześniejszy przebieg potwierdził także rozmowę. Odcinek sprawdzono niezależnie, zaczynając od prawdziwego katalogu. |
| Potrzeba autora → lista/zestawienie ROPS → status → autor | PASS | Właściciel A, ponowny odczyt po F5; zestawienie zgodne z liczbą rekordów bazy; ROPS ustawia `analizowane`, UI aktualizuje się bez F5; autor odczytuje nowy status po F5. |
| Tester: zapis → ROPS → ponowny odczyt | PASS | Zgłoszenie w Supabase; po F5 status `zaakceptowane`, osobne `rops_notes`, oryginalne `notes` niezmienione. |
| Publiczne podsumowanie ocen | PASS | Własna opinia 3/3/3, brak rekomendacji; ponowny odczyt API i UI pokazuje opinię oraz wynik 3/5. Opinię usunięto. |
| Wniosek: szkic → F5 → podgląd/eksport → złożenie → ROPS | PASS | Zapis potwierdzony bazą, eksport TXT z zastrzeżeniem demonstracyjności, złożenie przez frontend, odczyt ROPS. |
| Zamknięty nabór i edycja po złożeniu | PASS | API odrzuca oba działania kodem 400. Zamykano wyłącznie własny nabór testowy o nowym UUID; wspólnego naboru nie zmieniano. |
| Szkic innowacji: utworzenie i edycja treści | BLOCKED | POST `/api/admin/innovations` → 500 przy niedostępnym embeddingu; przeglądarka zgłasza błąd połączenia. Edycja semantyczna używa tego samego dostawcy i nie została potwierdzona w tym przebiegu. |
| Ukrycie szkicu i publikacja innowacji | PASS | Dla oznaczonego własnego szkicu przygotowanego bez embeddingu: GET po ID → 404; lista także przy `status=nowa` bez szkicu; RLS anon/B → 0 wierszy. Edycja samego URL przez API ROPS → 200; publikacja przez UI → status `sprawdzone` bez F5 i publiczny GET 200. Ten test nie potwierdza tworzenia ani przeliczania embeddingu. |
| Zasób: szkic → weryfikacja → publikacja → wycofanie → usunięcie | PASS | Cały cykl przez panel ROPS; publiczne API 404/200/404 zgodnie ze stanem; publikacja widoczna w Zasobniku; aktualizacje bez F5; po usunięciu brak rekordu w bazie. |
| Izolacja A/B i operacje ROPS | PASS | B: odczyt/edycja wniosku A → 403, RLS fiszki A ukrywa rekord i blokuje edycję. Gość/autor: odczyt potrzeb ROPS i tworzenie innowacji ROPS → 401/403. |
| Oświadczenia zatwierdzone samym `all_confirmed` | FAIL | Na kompletnym własnym szkicu PUT `declarations={"all_confirmed":true}` → 200; POST `/submit` → 200 i trwały `zlozony`, bez sześciu indywidualnych oświadczeń. |

## Poprawki i weryfikacja

- Dokończono rozpoczętą poprawkę pochodzenia powiązanej innowacji: odczyt `is_demonstrative`/`source_label`, oznaczenie w kreatorze i szczegółach fiszki, regresja utraty metadanych.
- Poprawiono nieaktualny komunikat administracji sugerujący publiczny odczyt szkiców. Rzeczywiste API i RLS je ukrywają.
- Zachowano i zweryfikowano rozpoczętą poprawkę `import sys` w backendzie. Regresja symuluje brak odpowiedzi Gemini poza trybem testowym: oczekiwany `RuntimeError`, bez `NameError` i bez testowych wektorów. Działający backend przy awarii matchingu zwraca kontrolowane 503.
- Naprawiono selektory E2E odmowy autora B i nazwę pola zestawienia (`total_needs_reported`). Timeouty helperów nie są zgłaszane jako błędy produktu; odpowiednie odcinki mają późniejsze poprawne wyniki.

| Kontrola końcowa | Wynik |
| --- | --- |
| `npm test` | 170/170 PASS — testy jednostkowe na atrapach |
| `npm run lint` | PASS; usunięte ostrzeżenie nieużywanej stałej potwierdzone osobnym ESLint pliku E2E |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| Backend: `pytest -q tests/test_embedding_failure_regression.py tests/test_knowledge_edit_regressions.py` | 7/7 PASS — izolowane regresje |
| Główna strona: 375 px, tekst 200%, Tab/Enter | PASS; brak poziomego przewijania, widoczna awaria rzeczywistego matchingu, opis zachowany |
| Błędy JavaScript w sprawdzonych ścieżkach | 0 |
| Własne rekordy testowe | Usunięte; brak potwierdzony ponownym odczytem |

Symulacją były wyłącznie kontrolowane 503 zapisu potrzeby (treść zachowana, bez sukcesu) i backendowe testy jednostkowe. Wielokrotne `requestSubmit` potrzeby wysłały jeden rzeczywisty POST. Test widoczności innowacji korzystał z jawnego własnego rekordu przygotowanego kluczem serwerowym; pozostałe operacje produktu korzystały ze zwykłych sesji i rzeczywistej bazy. Nie wykonywano nowego szerokiego audytu dostępności; kontrole pozostałych modułów pozostają w raportach wcześniejszych etapów.

Dowody lokalne (ignorowane): `node_modules/.cache/hubmi-stage7/main.log`, `result.json`, `retry.log`, `declaration-bypass-update.json`, `declaration-bypass-submit.json` oraz `node_modules/.cache/hubmi-stage7-final-check/` — `final-paths.log`, `remaining.log`, `visibility-mobile.log`, `cleanup-check.log`, logi testów/lintu/typów/builda. `tests/e2e/stage7-main.mjs` obejmuje demo i potrzeby; nie jest kompletną macierzą wszystkich modułów. Ponowienie wymaga istniejącego Playwright/Chromium i działających serwerów; nie wymaga zmiany env ani instalacji aplikacji.

## Zbiorcza lista dla Radka

**Blokujące demo lub poprawność danych:**

1. **Dostawca AI/embeddingów.** Wpisać opis samotności seniorów, uruchomić dopasowanie. POST `/api/match` z `problem_description` → 503, dostawca Gemini → 429 `RESOURCE_EXHAUSTED`. Oczekiwane: rzeczywiste dopasowania na tej samej przestrzeni embeddingów. Przywrócić limit/dostęp dostawcy lub poprawną konfigurację, bez maskowania awarii sztucznymi wektorami. Ponowić tylko problem → dopasowania → plan oraz tworzenie/edycję innowacji. Adaptacja obecnie zwraca wyłącznie jawny szablon awaryjny.
2. **Oświadczenia.** Utworzyć kompletny własny szkic, PUT `/api/grant-applications/{id}` z `{"declarations":{"all_confirmed":true}}`, następnie POST `/api/grant-applications/{id}/submit`. Wynik: 200/200, `zlozony`. Oczekiwane: odmowa 400/422 aż do jawnego potwierdzenia `criminal_liability`, `no_double_funding`, `accept_procedures`, `no_fees`, `accessibility_dnsh`, `gdpr`. Obecne `all_confirmed or individual_confirmed` pozwala obejść formalną walidację przez API; poprawny frontend nie zabezpiecza backendu.

**Pozostałe:**

- Tworzenie innowacji przy awarii embeddingów kończy się nieobsłużonym 500 zamiast kontrolowanego 503. Żądanie ROPS: POST `/api/admin/innovations` z poprawnymi `title`, `description`, `target_group`, `category`, `status=nowa`; odpowiedź 500. Oczekiwane: czytelna odmowa bez zapisu. Wpływ: administracja nie utworzy szkicu; po przywróceniu Gemini nadal warto poprawić obsługę przyszłej awarii.
- Brak importu `sys` został naprawiony i ma regresję; nie pozostaje czynnością blokującą.

Nie wykonano deployu ani merge. Env, pierwotne zmiany `frontend/package-lock.json` i `frontend/tests/grants.test.mjs` zachowały porównane sumy; nie włączono ich do commitu. Cudze PDF/PPTX i zastane dane pozostawiono bez zmian.

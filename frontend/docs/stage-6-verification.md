# Etap 6 — integracja i weryfikacja

Stan: 2026-10-04. Kryteria funkcjonalne etapu spełnione na lokalnym frontendzie, rzeczywistym FastAPI i testowym Supabase. Bazą jest aktualny `origin/main` (`617ea16`, PR #19); po `git fetch` nie było nowszych zmian. Lokalny branch `feat/frontend-knowledge-repository` zaktualizowano przez fast-forward. Podczas integracji nie wykonano reset, stash ani wdrożenia. Raport opisuje kontrole przed publikacją zmian na gałęzi.

## Środowisko i trwałość

- Frontend: `http://localhost:3000`, istniejący Next.js dev z bieżącym kodem. Backend: `http://localhost:8000`, istniejący proces uruchomiony z `backend/run.py`, przeładowany po aktualizacji kodu. Health potwierdza połączenie z Supabase; OpenAPI zawiera POST `/unpublish` i DELETE zasobu. Odrzucenie publikacji szkicu oraz unieważnienie audytu po edycji potwierdzono rzeczywistymi żądaniami.
- Frontend i backend używają tego samego projektu Supabase (adresy różnią się końcowym ukośnikiem). Potwierdzono tabelę `knowledge_resources`, wszystkie pola jej odpowiedzi, dziewięć ID danych startowych migracji 11 oraz kolumny `innovations.is_demonstrative` / `source_label` i oznaczone rekordy. Potwierdzono skutki migracji w bazie; nie odczytywano prywatnego rejestru migracji SQL i nie uruchamiano ponownie migracji 11.
- Wykorzystano istniejące konta autora A, autora B i ROPS. Hasła czytano wyłącznie z ignorowanego `.env.test.local`, konfigurację z istniejącego `.env.local`. Test przeglądarkowy korzysta z publicznego klucza i zwykłych sesji tych kont, bez service role i nagłówków testowych.
- Nowe rekordy testowe miały unikalne tytuły/ID; po próbach usunięto wyłącznie własne rekordy. Zastane dodatkowe dane testowe pozostawiono. Nie zmieniano env, wcześniejszych zmian `package-lock.json`, `tests/grants.test.mjs` ani nieśledzonych PDF/PPTX.

## Zmiany integracyjne

- Tworzenie i edycja wysyłają tylko treść, bez statusu i audytu. Zapis potwierdza ponowny odczyt tego samego ID i wszystkich wysłanych pól.
- Weryfikacja i publikacja korzystają z osobnych POST. Publikacja w UI wymaga `zweryfikowany` oraz audytu `verified_by` / `verified_at`; brak audytu pozwala wykonać formalną weryfikację. Szkic nie ma przycisku publikacji.
- Wycofanie używa POST `/unpublish` i pokazuje rzeczywisty status `zweryfikowany`, z zachowaniem weryfikacji i wyczyszczeniem publikacji.
- Edycja opublikowanego lub zweryfikowanego materiału pokazuje zwrócony przez backend szkic oraz konieczność ponownej weryfikacji. Usunięto remount formularza, który gubił komunikat sukcesu; nie można zamknąć edytora w trakcie zapisu ani równolegle wykonać operacji statusu.
- Usuwanie pokazuje tytuł i ID, ostrzeżenie o trwałości, checkbox i osobny przycisk potwierdzający. Anulowanie nie wysyła DELETE. Frontend wymaga odpowiedzi `success: true` z wybranym ID oraz 404 z ponownego GET; dopiero wtedy usuwa kartę.
- Bramka ROPS sprawdza zaufane `app_metadata.hubmi_role` przed montowaniem obu paneli. Autorzy A/B widzą odmowę; API i RLS niezależnie odrzucają nieuprawnione operacje.
- Karty katalogu i dopasowań pokazują istniejącą etykietę demonstracyjności oraz `source_label`. Nie odtwarzano katalogu, raportów ani gotowych modułów.

W trakcie rzeczywistego testu wykryto i naprawiono błędy backendu: jawne `caveat: null` nie usuwało zastrzeżenia; zmiana zastrzeżenia/nazwy grupy nie unieważniała weryfikacji; błąd odczytu po DELETE mógł skutkować odpowiedzią sukcesu. Regresje mają oddzielne testy jednostkowe.

## Źródła regionalne i naprawa danych startowych

Dwa istniejące źródła danych 2025 pobrano z ROPS (HTTP 200, rzeczywiste PDF), odczytano przez `pdftotext` i porównano z dziewięcioma istniejącymi ustaleniami w `challenges.ts`: demografia, seniorzy, klienci/przyczyny pomocy, powiaty, usługi, kadra, koszty i piecza. Liczby i okresy są zgodne; wartości dla Polski pozostają osobnym porównaniem.

- [OZPS 2025 — wybrane dane](https://rops.krakow.pl/pliki-do-pobrania/wpis,alternatywa-tekstowa-do-ozps-wm-za-rok-2025-wybrane-dane,1487)
- [Piecza zastępcza 2025 — wybrane dane](https://rops.krakow.pl/pliki-do-pobrania/wpis,alternatywa-tekstowa-do-piecza-zastepcza-w-malopolsce-w-2025-r-wybrane-dane,1486)

Seed `video-inkubator-iws` wskazywał nieistniejący adres `/innowacje-spoleczne/filmy-i-dobre-praktyki` (HTTP 404). Zastąpiono go [istniejącą stroną ROPS o finaliście REGIOSTARS Awards 2025](https://rops.krakow.pl/innowacje-spoleczne/regiostars-awards-2025/pl-inkubator-wlaczenia-spolecznego) (HTTP 200). Tytuł/opis odpowiadają zawartości; rodzaj to `Strona tematyczna`, bez twierdzenia o filmie. Przygotowano migrację danych `backend/migrations/12_correct_knowledge_source.sql`, ograniczoną do ID i oryginalnego URL/tytułu, zachowującą cudze edycje i wymagającą ponownej weryfikacji.

Na podłączonej bazie testowej tę samą korektę wykonano przez autoryzowane API ROPS po sprawdzeniu zgodności oryginalnego rekordu, następnie jawnie POST `/verify` i `/publish`. Ponowny odczyt Supabase potwierdził treść i audyt. Pliku SQL 12 nie uruchamiano bezpośrednio; po wykonanej korekcie jego warunek pomija już poprawiony rekord.

## Wyniki końcowe

| Kontrola | Wynik |
| --- | --- |
| `npm run lint` | PASS |
| `npm test` | 169/169 PASS |
| `npm run build` | PASS, TypeScript i trasy |
| Backend: `pytest -q tests/test_knowledge_resources.py tests/test_knowledge_admin.py tests/test_knowledge_edit_regressions.py` | 22/22 PASS; dwa ostrzeżenia deprecacji klienta Supabase |
| Chromium: `tests/e2e/knowledge-stage6.mjs` | 42/42 PASS |
| Axe WCAG 2/2.1 A/AA: Zasobnik i ROPS | 0 naruszeń w badanych stanach |
| 375 px, tekst 200%: Zasobnik i ROPS | bez poziomego przewijania |
| Błędy JavaScript w badanym przepływie | 0 |

Przeglądarka sprawdza tworzenie bez audytu/statusu, blokadę podwójnego POST, trwałość w tabeli, formalną weryfikację i publikację, odczyt publiczny po F5, edycję opublikowanej treści oraz zweryfikowanego źródła, utratę audytu, usunięcie zastrzeżenia, ponowną weryfikację/publikację, wycofanie, potwierdzenie/anulowanie DELETE i brak rekordu w API/bazie. Autorzy A/B oraz anon mają odmowę na wszystkich endpointach zarządzania; bezpośrednie RLS ukrywa szkic i blokuje jego edycję. Obaj autorzy nie widzą formularzy ROPS.

Kontrolowane 503 przy edycji potwierdza zachowanie tekstu i brak fałszywego sukcesu; kontrolowane 503/pusta lista zasobów sprawdzają komunikat i retry. Tylko te awarie/pusta odpowiedź są przechwytywane; cały cykl życia i uprawnienia korzystają z rzeczywistego API/Supabase. Testy usług używają atrap, a backendowe regresje edycji/usuwania nie korzystają z sieci. Axe nie stanowi pełnego audytu zgodności WCAG. Publiczne/API listy nadal mają istniejące limity (ROPS 100, grupy backendu 200); nie potwierdzamy przeglądania dużej bazy poza tym zakresem.

## Ponowienie kontroli

Frontend/backend muszą działać z istniejącą konfiguracją. Potrzebne są Playwright z Chromium i axe-core; test jest opt-in, nie należy do zwykłego `npm test`.

```bash
# Izolowane narzędzia w ignorowanym cache; nie zmienia package-lock aplikacji.
npm install --prefix node_modules/.cache/stage6-tools --no-package-lock playwright axe-core
node node_modules/.cache/stage6-tools/node_modules/playwright/cli.js install chromium
NODE_PATH="$PWD/node_modules/.cache/stage6-tools/node_modules" node tests/e2e/knowledge-stage6.mjs
```

Opcjonalne ustawienia: `HUBMI_E2E_FRONTEND_URL`, `HUBMI_CHROMIUM_PATH`, `TEST_AUTHOR_A_EMAIL`, `TEST_AUTHOR_B_EMAIL`, `TEST_ROPS_EMAIL`. Hasła pozostają w `.env.test.local`. Test sprząta własny rekord również po awarii. Logi wykonanej kontroli znajdują się w ignorowanym `node_modules/.cache/hubmi-stage6/`.

Zmiany przygotowano na gałęzi `fix/frontend-stage6-integration`. Wyniki opisują lokalną integrację; nie wdrażano aplikacji.

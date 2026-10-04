# Etap 2 — Potrzeby i Tester: wynik weryfikacji

**Status: zamknięty.** Pełne ścieżki autora i ROPS przechodzą na prawdziwej bazie, zapisy przetrwają odświeżenie i ponowne logowanie, uprawnienia działają, a dane testowe są posprzątane.

- Kod: `main` = `aa04c08` (PR #13 i #14). Frontend bez zmian względem `main` — weryfikacja nie wykazała błędów frontendu; zmienia się tylko ten raport.
- Data kontroli: 4 października 2026.
- Środowisko integracji: lokalny frontend `http://localhost:3000` (`next dev`) → lokalny backend `http://localhost:8000` uruchomiony z `aa04c08` (przeładowany po zmianie plików, sprawdzone w logu i `openapi.json`) → prawdziwy Supabase. Konta: autor A, autor B, ROPS (`app_metadata.hubmi_role = rops_admin`). Hasła są w nieśledzonym `frontend/.env.test.local`, poza Gitem.

## Migracje — stan sprawdzony w bazie

Opisy PR nie są dowodem. Stan ustalono odczytem i próbami na danych:

| Migracja | Stan | Dowód |
| :--- | :--- | :--- |
| 07 `community_needs` | działa | zapis, odczyt, RLS autora |
| 08 blokada `user_id` | działa (efekt zabezpieczeń) | anonimowy `INSERT` przez PostgREST z `user_id` autora A → zapisany z `user_id = NULL`; wstrzyknięty status `zaadresowane` → `nowe`; ścieżka backendu (`service_role`) zachowuje właściciela. Plik 07 po PR #10 ma ten sam wyzwalacz i politykę co 08, więc nie da się odróżnić, który plik je wdrożył — działanie potwierdzono. Rekordy próby usunięte. |
| 09 `rops_notes` | działa | kolumna istnieje; notatka zapisana w `rops_notes`, `notes` bez zmian i bez prefiksu `[Notatka ROPS]` |

## Prawdziwa integracja — 50/50

| Funkcja | Wynik | Środowisko | Dowód |
| :--- | :--- | :--- | :--- |
| Walidacja formularza potrzeby | działa | integracja | 5+ pól z `aria-invalid`, fokus na pierwszym błędzie |
| Zapis potrzeby jako autor A | działa | integracja | rekord w `community_needs`, `user_id` = autor A, status `nowe`; potwierdzenie „Odczytaliśmy je ponownie z Twojego konta” |
| Blokada podwójnego wysłania potrzeby | działa | integracja | 1 `POST` mimo 3 prób |
| Błąd zapisu potrzeby nie daje sukcesu | działa | symulacja (HTTP 500 w przeglądarce) | komunikat błędu, brak potwierdzenia, treść zachowana |
| „Moje zgłoszenia” — po F5 i ponownym logowaniu | działa | integracja | potrzeba widoczna w obu przypadkach |
| Autor B nie widzi potrzeby autora A | działa | integracja | UI: brak; `GET /api/needs/my` (B): 0 rekordów; PostgREST z sesją B: 0 wierszy |
| Odmowa operacji ROPS — gość | działa | integracja | 7 endpointów (`/api/admin/needs*`, `PATCH` statusu, `/api/testing/applications*`) → 403 |
| Odmowa operacji ROPS — autor A | działa | integracja | te same 7 endpointów → 403; `UPDATE` statusu przez PostgREST → 0 wierszy, status bez zmian; `/rops/potrzeby` i `/rops/tester` → „nie ma potwierdzonych uprawnień” |
| Panel ROPS potrzeb: zestawienie bez fikcyjnych danych | działa | integracja | suma = liczba rekordów w bazie; brak dawnych rekordów z magazynu w pamięci |
| Panel ROPS potrzeb: filtry zestawienia (kategoria, powiat, okres) | działa | integracja | wynik = liczba z bazy dla tych samych filtrów |
| Porównanie okresów | działa | integracja | oba okresy z datami; przy małej próbie „Za mało zgłoszeń…”, bez etykiety „wzrostowy” |
| Lista potrzeb: filtry i wyszukiwanie | działa | integracja | powiat+status zawiera rekord; `odrzucone` go wyklucza; wyszukiwanie tekstowe go znajduje |
| Zmiana statusu i notatki potrzeby | działa | integracja | 1 `PATCH` mimo prób powtórzenia; widok bez F5; w bazie `analizowane` + notatka, właściciel bez zmian; po F5 zgodne; autor widzi status, nie widzi notatki ROPS |
| Błąd zmiany statusu potrzeby | działa | symulacja (HTTP 500) | komunikat, notatka w formularzu, baza bez zmian |
| Tester: walidacja i zgłoszenie publiczne | działa | integracja | 4 błędy walidacji; zgłoszenie w bazie z uwagami zgłaszającego; 1 `POST` mimo 3 prób |
| Tester: błąd zapisu zgłoszenia | działa | symulacja (HTTP 503) | brak sukcesu, treść zachowana |
| Tester: podsumowanie ocen | działa | integracja | tymczasowa opinia: liczba 1, średnia 3,0, poleca 0%; status zgłoszenia pozostał `nowe`; opinię usunięto zaraz po sprawdzeniu |
| Panel ROPS Testera: lista i filtry | działa | integracja | status+innowacja zawiera rekord; `zakonczone` go wyklucza |
| Sama zmiana statusu | działa | integracja + baza | `zaakceptowane`; `notes` bez zmian; `rops_notes = null`; 1 `PATCH` |
| Dodanie notatki ROPS | działa | integracja + baza | `rops_notes` w osobnej kolumnie; `notes` bez zmian; widok bez F5 |
| Zmiana notatki ROPS | działa | integracja + baza | nowa treść, `notes` bez zmian, 1 `PATCH` |
| Błąd zapisu notatki | działa | symulacja (HTTP 500) | komunikat, treść w polu, baza bez zmian |
| Trwałość statusu i notatki | działa | integracja | po F5 i po ponownym logowaniu ROPS |
| Wyczyszczenie notatki ROPS | działa | integracja + baza | `rops_notes = ""`, `notes` bez zmian; po F5 „brak” |
| `/rops/tester` przy 375 px i tekście 200% | działa | integracja | brak przewijania poziomego przy rozwiniętych szczegółach |
| Klawiatura w `/rops/tester` | działa | integracja | rozwinięcie szczegółów `Enter`, `Tab` do notatki ROPS i „Zapisz status” |
| Błędy JavaScript w przeglądarce | brak | integracja | 0 |

## Testy automatyczne (atrapy — logika, nie integracja)

- `npm test`: **149/149** — w tym 13 testów Testera (rozdzielenie `notes`/`rops_notes`) i 10 testów potrzeb, na atrapie sesji.
- `npm run lint`, `tsc --noEmit`, `npm run build`: bez błędów.

## Rekordy testowe — utworzone i usunięte

Wszystkie usunięte kluczem serwisowym po weryfikacji, z kontrolą znacznika „TEST HubMI”. W bazie nie pozostał żaden rekord testowy z tej pracy.

- `community_needs`: `5e035402-9f16-4604-a850-b9f0720bd0f3`, `17dc092a-454e-454c-8a3d-0c97b0582834`, `1091dd53-a07a-4f17-9a39-580d23dd33a5`, `8fef2164-3de5-4df3-8978-40b548d7efa6`; cztery rekordy próby migracji 08.
- `innovation_test_applications`: `54efb3e3-4f68-49d4-a74b-d56c16baea4e`.
- `innovation_feedback`: `4e092836-…` (tymczasowa opinia do podsumowania).

Dwa cudze zgłoszenia testowe „Gmina Test” (`eb25c6f2…`, `4c6028fb…`) pozostawiono bez zmian.

## Uwagi poza zakresem etapu 2

- Zmień hasła kont testowych: zostały przekazane w czacie.
- Publiczne zgłoszenie do testowania i opinia nie wymagają logowania (stan kontraktu backendu).

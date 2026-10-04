# Etap 2 — Potrzeby i Tester: wynik weryfikacji

Branch `feat/frontend-stage2-closure`, baza `origin/main` = `f1f71d6` (PR #10, #11, #12 scalone). Data kontroli: 4 października 2026.

Środowisko integracji: lokalny frontend (`next dev`, port 3000) → lokalny backend z `f1f71d6` (sprawdzone w `openapi.json`: `rops_notes` w schematach Testera) → prawdziwy Supabase. Tunel Radka (`pros-oil-sacred-turbo.trycloudflare.com`) działał i miał ten sam kontrakt, ale nie służył do zapisów.

**Opis PR nie jest dowodem migracji.** Stan bazy sprawdzono bezpośrednio odczytem:

| Migracja | Stan w Supabase | Dowód |
| :--- | :--- | :--- |
| 07 `community_needs` | wdrożona | tabela istnieje, zapis i odczyt rekordu |
| 08 blokada `user_id` | **nie potwierdzono** | wyzwalacza i polityk nie da się odczytać przez PostgREST |
| 09 `rops_notes` | **niewdrożona** | `select rops_notes` → `42703 column … does not exist` |

Bez migracji 09 backend przy zapisie notatki ROPS przechodzi w tryb awaryjny i dokleja ją do `notes` (`[Notatka ROPS]: …`). Odczyt API rozdziela ją z powrotem, więc frontend tego nie widzi, ale w bazie uwagi zgłaszającego zostają zmienione. Dlatego testów notatki ROPS na prawdziwej bazie nie wykonano.

## Wyniki

| Funkcja | Wynik | Środowisko | Dowód |
| :--- | :--- | :--- | :--- |
| Zgłoszenie potrzeby — rzeczywisty zapis | działa | integracja (gość) | `5e035402-9f16-4604-a850-b9f0720bd0f3` w `community_needs`, status `nowe`, `user_id = null`; 1 żądanie POST mimo 3 prób wysłania |
| Potrzeba jako autor → „Moje zgłoszenia” po F5 | nie sprawdzono | — | brak konta autora |
| Panel ROPS potrzeb: lista, filtry, zestawienie, porównanie okresów | nie sprawdzono | — | brak konta ROPS |
| Panel ROPS potrzeb: zmiana statusu i ponowny odczyt | nie sprawdzono | — | brak konta ROPS |
| Odmowa operacji ROPS dla gościa, `X-Admin-Role`, sfałszowanego JWT | działa | integracja (API) | `/api/admin/needs`, `/summary`, `PATCH …/status`, `/api/testing/applications` → 403/403/401; status rekordu bez zmian |
| Odmowa operacji ROPS dla zalogowanego autora | nie sprawdzono | — | brak konta autora |
| Tester — zgłoszenie, opinia, podsumowanie, trwałość po F5 | działa | integracja (PR #11) | rekordy testowe posprzątane przez osobę A; nie powtarzano, by nie dodawać publicznych opinii |
| Panel ROPS Testera: lista, filtry | nie sprawdzono | — | brak konta ROPS |
| Panel ROPS Testera: sam status, notatka dodaj/zmień/wyczyść, `notes` bez zmian, F5 | nie sprawdzono | — | brak konta ROPS **i** migracji 09 |
| Rozdzielenie `notes` / `rops_notes` w parserze, formularzu i PATCH | działa | testy na atrapie sesji | `tests/tester.test.mjs`: parser (`null` i brak pola → `null`), `ropsNoteChange`, sam status bez `notes`/`rops_notes`, dodanie/zmiana/wyczyszczenie (`""`), wykrycie zmienionych `notes` w odczycie po zapisie |
| Błąd zapisu statusu (400/422) i brak potwierdzenia | działa | testy na atrapie sesji | komunikat z przyczyną, bez odczytu potwierdzającego |
| Blokada podwójnego wysłania formularza statusu ROPS | nie sprawdzono w przeglądarce | — | blokada w kodzie (`request` ref) jak w pozostałych formularzach; panel wymaga sesji ROPS |

## Testy automatyczne

- `npm test`: **149/149** — w tym 13 testów Testera (6 nowych dla rozdzielenia notatek) i 10 testów potrzeb. Testy modułów używają **atrapy sesji** i nie potwierdzają integracji.
- `npm run lint`, `tsc --noEmit`, `npm run build`: bez błędów.

## Rekordy testowe do usunięcia

- `community_needs`: `5e035402-9f16-4604-a850-b9f0720bd0f3` (tytuł zaczyna się od „TEST HubMI etap 2”). Niepubliczny — widoczny tylko w panelu ROPS. Usunięcie: `delete from community_needs where id = '5e035402-9f16-4604-a850-b9f0720bd0f3';` (osoba A).

## Co zamyka etap 2

1. Osoba A: wdrożyć migrację 09 w Supabase i potwierdzić 08.
2. Przekazać konta testowe: autor oraz `app_metadata.hubmi_role = "rops_admin"`.
3. Wykonać brakujące wiersze tabeli: autor → „Moje zgłoszenia” po F5, panel ROPS potrzeb (lista, filtry, zestawienie, status), panel ROPS Testera (lista, filtry, status, notatka ×3 z kontrolą `notes`, F5), odmowa dla autora.

# Wniosek w naborze — frontend generatora wniosków

Ścieżka „Wniosek w naborze” obok fiszki pomysłu. Fiszka pozostaje bez zmian i nie jest nazywana wnioskiem grantowym.

- Baza: `main` = `7cf7154`; kontrakt z `backend/app/api/endpoints/grant_applications.py` i `services/grant_applications.py` (PR #13). Branch `feat/backend-grant-application-generator` ma nowszy commit `8c41a96`, ale zawiera tylko poprawki typów, bez zmian kontraktu.
- Migracja 10 jest w bazie: tabele `grant_calls` i `grant_applications` istnieją, jest jeden nabór (demonstracyjny, wzór 1.0).

## Co dodano

| Ścieżka | Zawartość |
| :--- | :--- |
| `/wnioski` | Nabory ze statusem (otwarty / zamknięty / demonstracyjny) i wyjaśnieniem, wzorem i limitami; „Rozpocznij wniosek”; lista własnych wniosków; odróżnienie od fiszki. |
| `/wnioski/[id]` | Formularz według wzoru 1.0, punkty 1–12, z podpowiedziami. Dane wnioskodawcy zależą od typu. Plan działania z pozycjami, bieżąca suma kosztorysu i różnica względem kwoty. Każde oświadczenie zaznacza się osobno. Zapis roboczy potwierdzany ponownym odczytem. Lista braków przed złożeniem. Złożenie wymaga dodatkowego potwierdzenia, którego treść zależy od stanu naboru. Ostrzeżenie przy niezapisanych zmianach. |
| `/wnioski/[id]/podglad` | Podgląd zapisanej wersji, druk (bez nagłówka i stopki), pobranie `.txt` w układzie wzoru. Przy naborze innym niż otwarty plik zaczyna się od zastrzeżenia „WERSJA DEMONSTRACYJNA… nie jest wnioskiem złożonym w oficjalnym konkursie”. |
| `/rops/wnioski`, `/rops/wnioski/[id]` | Lista dla ROPS z filtrami (domyślnie „Złożony”) i pełny odczyt wniosku. |

Wzory w innej wersji niż 1.0 blokują rozpoczęcie i złożenie wniosku z jawnym komunikatem.

## Weryfikacja

**Prawdziwa integracja — 36/36.** Lokalny frontend → lokalny backend z `main` → prawdziwy Supabase. Konta: autor A, autor B, ROPS.

| Funkcja | Wynik | Dowód |
| :--- | :--- | :--- |
| Nabór demonstracyjny i odróżnienie od fiszki | działa | status, wzór 1.0, zastrzeżenie; kreator fiszki działa i odsyła do osobnej ścieżki |
| Utworzenie szkicu | działa | rekord w `grant_applications`, właściciel A, `roboczy` |
| Zapis roboczy, F5, edycja | działa | 1 `PUT` mimo 2 prób; w bazie tytuł, kwota i plan; po F5 pola odczytane z bazy; edycja zapisana |
| Kontrola kosztorysu | działa | różnica 999,50 zł pokazana na bieżąco |
| Błędy walidacji | działa | złożenie bez oświadczeń → lista błędów backendu (422), wniosek nadal `roboczy` |
| Oświadczenia | działa | każde zapisane osobno; `all_confirmed` tylko przy wszystkich |
| Podgląd, eksport, druk | działa | podgląd zgodny z zapisaną wersją; `.txt` z zastrzeżeniem i układem wzoru; druk bez nagłówka i stopki |
| Złożenie (demonstracyjne) | działa | 1 `POST`; w bazie `zlozony` i `submitted_at`; komunikat „nie trafił do oficjalnego konkursu”; po F5 bez formularza; `PUT` po złożeniu → 400 |
| Złożenie w naborze otwartym | działa | testowy nabór `otwarty` → „Wniosek złożony w naborze.” |
| Nabór zamknięty | działa | po zamknięciu przez ROPS (API): brak „Rozpocznij wniosek”; szkic bez formularza, z podglądem; API odrzuca złożenie i nowy wniosek (400/400) |
| Brak dostępu autora B | działa | 6 operacji na wniosku A → 403; lista B bez wniosku A; UI: „nie możesz wyświetlić wniosku innego autora”; panel ROPS niedostępny |
| Gość | działa | `GET` wniosku → 401, lista ROPS → 403 |
| Odczyt ROPS | działa | wniosek na liście i pełny podgląd z danymi oraz oświadczeniami |
| 375 px i tekst 200% | działa | `/wnioski`, formularz, podgląd i `/rops/wnioski` bez przewijania poziomego |
| Klawiatura | działa | od tytułu przez wszystkie pola do zapisu; zapis klawiszem `Enter` |
| axe-core (wcag2a/aa, 21a/aa) | 0 naruszeń | `/wnioski`, formularz, podgląd, `/rops/wnioski` — jeden sygnał, nie deklaracja zgodności |
| Błąd zapisu | działa | **symulacja** (HTTP 500 w przeglądarce): komunikat, treść w formularzu, baza bez zmian |

**Testy na atrapach (logika):** `npm test` 160/160, w tym 11 testów `tests/grants.test.mjs` — kompletność zgodna z regułami backendu, oświadczenia, mapowanie danych, kwoty, błędy 422/400/403, potwierdzanie ponownym odczytem, komunikat przy awarii sieci. `lint`, `tsc --noEmit` i `build` bez błędów.

**Dane testowe:** wszystkie wnioski z przebiegów oraz testowy nabór `c0000000-0000-4000-8000-0000000e2e01` (utworzony kluczem serwisowym, bo API nie tworzy naborów) zostały usunięte; w bazie nic nie zostało. Naboru demonstracyjnego nie zmieniano.

## Braki kontraktu backendu (osoba A)

1. **Cichy zapis w pamięci.** Przy dowolnym błędzie Supabase `create`, `update`, `submit`, odczyty i lista ROPS przełączają się na `_memory_applications_store` i zwracają sukces. Frontend potwierdza zapis ponownym odczytem, ale odczyt też korzysta z pamięci, więc awarii nie wykryje. To ten sam problem, który w PR #10 usunięto z potrzeb — prośba o zwracanie 5xx.
2. **Brak definicji pól wzoru.** Backend podaje tylko `template_name` i `template_version`. Pola wersji 1.0 są zapisane we frontendzie; inna wersja blokuje formularz. Prośba: endpoint ze schematem pól dla wersji albo potwierdzenie, że 1.0 jest stała.
3. **Oświadczenia sprawdzane jedną flagą.** Backend sprawdza tylko `declarations.all_confirmed`, więc klient może ją ustawić bez pojedynczych oświadczeń. Prośba: walidacja każdego klucza (`criminal_liability`, `no_double_funding`, `accept_procedures`, `no_fees`, `accessibility_dnsh`, `gdpr`).
4. **Struktura `partners` grupy nieformalnej** nie jest określona. Frontend wysyła `[{ name }]`, a eksport tylko liczy partnerów.
5. **Lista ROPS zwraca wersje robocze** wszystkich autorów. Frontend domyślnie filtruje „Złożony”. Prośba o decyzję, czy ROPS powinien widzieć szkice.
6. **Brak tworzenia naborów przez API** — jest tylko zmiana statusu. W bazie nie ma naboru otwartego; test otwartego naboru wymagał wstawienia rekordu kluczem serwisowym.
7. **Tekst eksportu wygląda jak oficjalny dokument ROPS** i nie ma zastrzeżenia dla naboru demonstracyjnego. Frontend dopisuje je przy pobieraniu; lepiej, by dodawał je backend.
8. **Terminy planu** to dowolny tekst; zgodność z limitami miesięcy naboru nie jest sprawdzana.

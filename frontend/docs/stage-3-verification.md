# Etap 3 — wynik i granice weryfikacji

**Najnowsza kontrola integracyjna, 3 października 2026, HEAD ebb3241:** [przekazanie A+B](rops/integration-handoff.md) zawiera aktualne zmiany, wymagania SDK i wyniki kontroli. Dodano automatyczny odczyt listy ROPS bez odświeżania formularzy. Publiczna konfiguracja, konta testowe i wdrożenie zabezpieczeń na rzeczywistej bazie nadal nie są potwierdzone; integracja pozostaje wyłączona. Poniższe wyniki przy starszych commitach zachowano jako historię, a testy na atrapach nie są potwierdzeniem prawdziwego Supabase.

## Ukończone funkcje

- `/rops`: lista z tytułem, datą i statusem, filtr istniejących statusów i odświeżenie.
- `/rops/zgloszenia/[id]`: pełna fiszka, rzeczywista powiązana innowacja, potwierdzenie dostępu przed wyświetleniem danych, formularz zmiany statusu i osobny formularz oficjalnej odpowiedzi.
- Wspólna rozmowa w widoku autora i ROPS: historia, etykiety nadawców, daty, walidacja, blokada równoległego wysłania, zachowanie tekstu przy awarii, aktualizacja historii po potwierdzonym zapisie i ręczne odświeżenie.
- Oficjalna odpowiedź autora odczytywana osobno z bazy; odświeżenie rozmowy ponawia także jej odczyt.
- Istniejący Auth, publiczny klient Supabase, style i komponenty. Prywatne dane nie są prerenderowane na serwerze ani wspólnie cache'owane. Zmiana konta usuwa poprzednie prywatne komponenty.
- Serwisy sprawdzają sesję przy każdej operacji; panel wymaga proponowanej roli nadawanej przez serwer, nigdy samej domeny email ani user_metadata. Domyślnie integracja jest zablokowana do uzgodnienia kontraktu przez A.

## Wcześniejsze kontrole — atrapy i frontend (bez prawdziwej bazy)

- `npm run lint`: kod zakończenia 0, brak błędów i ostrzeżeń.
- `npm test`: **55/55** testów, w tym 19 nowych testów etapu 3; brak regresji w 36 istniejących testach. Testy używają atrap SDK i nie weryfikują rzeczywistej bazy.
- `npm run build`: kod zakończenia 0; Next.js 16.3.8 poprawnie zbudował wszystkie trasy, w tym `/rops` i `/rops/zgloszenia/[id]`.
- Chromium/Playwright: **17 zakończonych sprawdzeń** na SDK z przechwyconymi odpowiedziami HTTP Auth/PostgREST. Scenariusz: autor tworzy fiszkę i wysyła wiadomość → ROPS czyta, filtruje, zmienia status, publikuje oficjalną odpowiedź i odpisuje w rozmowie → autor odczytuje po odświeżeniu → drugi autor nie widzi fiszki ani rozmowy po UUID. Test obejmuje też pustą treść, fokus, blokadę przy wysyłaniu, awarię wiadomości i oficjalnej odpowiedzi bez utraty tekstu/sukcesu, ręczne odświeżenie, brak błędów JavaScript.
- Telefon 375 px z tekstem 200%: brak przewijania poziomego. Axe na głównych obszarach szczegółów ROPS i autora: brak wykrytych naruszeń wybranego zestawu WCAG 2 A/AA i 2.1 AA. Nie jest to pełny audyt ani deklaracja zgodności WCAG.
- `git diff --check`: bez problemów. Istniejący zmodyfikowany package-lock zachował SHA-256 `a34c102a3b0d3f2f843de87fbbc9785afb225eb1ea2180b7cccfe3a1e5e1935e`; istniejące usunięcie backend/.env.example zachowano. Nie edytowano backendu/SQL/migracji/RLS, nie wykonano pull/merge/push/deploy ani dodania bibliotek.

Artefakty przeglądarki są lokalnie w ignorowanym `node_modules/.cache/hubmi-verification/stage3-*` (skrypt testu, raport JSON, raporty axe i zrzut mobilny). Testowa kopia źródeł miała jawnie włączone flagi i fikcyjną publiczną konfigurację wyłącznie na potrzeby przechwyconego HTTP; konfiguracja normalnego frontendu pozostaje wyłączona.

## Co działało ponad godzinę

Polecenie `next dev --webpack --port 3121` uruchomione w odizolowanej kopii `frontend/coverage/hubmi-stage3-project`, proces PID 80117 (Next worker PID 80162), było **serwerem deweloperskim oczekującym na żądania**. To proces z założenia długotrwały, nie test ani zawieszony lint/build. Przy kontroli po przerwaniu działał około 64 minut; lint, testy i build były już zakończone. Serwera nie restartowano; użyto go do krótkiego testu przeglądarkowego, następnie zatrzymano i usunięto wyłącznie jego oznaczoną kopię roboczą. Istniejącego wcześniej serwera użytkownika na porcie 3000 (PID 52943/52955) nie zatrzymano.

## Ponowna kontrola integracji — 3 października 2026

### Potwierdzone działanie na prawdziwym Supabase

**Brak potwierdzonego scenariusza.** Nie wykonano prywatnych odczytów ani zapisów na prawdziwej bazie i nie zmieniono żadnych zgłoszeń. Nie można zastąpić brakujących kont/kontraktu kluczem serwerowym.

### Aktualnie dostępne środowisko

Sprawdzono git status, lokalny kod/SQL/kontrakty, pliki konfiguracji i obecność zmiennych procesu. HEAD nadal `49a8b47`. W `backend/.env` istnieje URL Supabase i klucz typu **secret, tylko dla serwera**; żadna wartość nie została ujawniona ani skopiowana do frontendu. W frontendzie brak `.env.local` i publicznego publishable/anon key; nie znaleziono konfiguracji trzech kont testowych. Brak nowego uzgodnionego kontraktu roli lub nadawcy w lokalnych plikach. Stan wdrożenia rzeczywistej bazy pozostaje nieznany — brak pól w lokalnym SQL nie jest dowodem braku tych pól w zdalnej bazie.

`app_metadata.hubmi_role` pozostaje **propozycją**, nie potwierdzonym wymaganiem backendu. Jeżeli A dostarczy inne bezpieczne źródło roli, trzeba dostosować `src/features/rops/access.ts` do rzeczywistego kontraktu przed włączeniem. Obie flagi integracji są nadal domyślnie wyłączone, konfiguracji lokalnej nie utworzono.

### Niezależne poprawki dokończone teraz

- Wspólny `src/lib/uuid.ts` zastępuje bezpośrednie `crypto.randomUUID()` przy wiadomościach i istniejący lokalny generator kreatora. HTTP w sieci lokalnej może nie udostępniać randomUUID: używamy wtedy `crypto.getRandomValues()` z poprawnymi bitami UUID v4. Bez bezpiecznego generatora odmawiamy operacji; nie używamy Math.random.
- Prywatne operacje fiszek, panelu i rozmowy odrzucają konto Auth z `is_anonymous=true`, także przy podstawionej roli ROPS. Wymagane są przygotowane konta email/hasło.
- Gotowych stron i formularzy nie implementowano ponownie. Nie dodano modułów, bibliotek, backendu ani migracji.

### Kontrole wykonane teraz

- `node --test tests/stage3.test.mjs tests/uuid.test.mjs`: **23/23** testy przechodzą (20 etapu 3, 3 UUID).
- `node --test --test-name-pattern 'anonimowe konto Auth' tests/submissions.test.mjs`: **1/1**, blokada anonimowego odczytu/zapisu fiszki.
- Po poprawieniu nazwy zmiennej pomocniczej w teście UUID (wymaganej przez ESLint Next.js) ponownie uruchomiono `node --test tests/uuid.test.mjs`: **3/3**. Łącznie sprawdzono 24 różne testy, bez powtarzania całego zestawu.
- `npm run lint`: kod 0, brak błędów/ostrzeżeń.
- `npm run build`: kod 0, poprawne typy i wszystkie trasy. Build był uzasadniony zmianą współdzielonego generatora oraz kontroli sesji w serwisach.
- `git diff --check`: poprawny; cudzy package-lock zachował wcześniejszy SHA-256, istniejące usunięcie backend/.env.example pozostało.
- Pełnych wcześniejszych 55 testów i testów przeglądarkowych nie powtarzano. Nie rozbudowano atrap HTTP. Wcześniejsze wyniki nie są dowodem działania nowego kodu na prawdziwej bazie.
- Nie uruchomiono nowych serwerów; istniejącego serwera użytkownika nie zatrzymano. Nie wykonano pull, merge, commit, push ani deploy.

### Rzeczy niezweryfikowane

Wszystkie wymagane scenariusze na rzeczywistym Supabase: zapis fiszki, trwałość po odświeżeniu, wysłanie/odczyt wiadomości autora i ROPS, zmiana statusu, oficjalna odpowiedź, odmowa drugiemu autorowi po URL i bezpośrednim requestcie, odrzucenie podszycia oraz zmian chronionych pól. Powód: brak publicznej konfiguracji, kont testowych i potwierdzonego kontraktu/bezpieczeństwa po stronie A. Nie wykonywano operacji service_role ani sondowania prywatnych danych.

## Krótka lista blokad dla A — element, format, miejsce użycia

| Brakujący element | Oczekiwany format / potwierdzenie | Gdzie używa frontend |
| --- | --- | --- |
| Publiczna konfiguracja | URL projektu oraz publishable key albo starszy anon JWT; dostarczyć bezpiecznie, nie service_role/secret | lokalny `.env.local`, `src/lib/supabase/config.ts` |
| Konta testowe | Trzy istniejące konta email/hasło: autor A, autor B i pracownik; wskazać bezpieczny zestaw danych testowych, przekazać hasła poza dokumentacją/logami | istniejący formularz `/logowanie` i wspólny test |
| Pełna fiszka i właściciel | Potwierdzony schemat etapu 2: `user_id UUID NOT NULL DEFAULT auth.uid()`, tytuł, rozwiązanie, odbiorcy, etap i istniejące pola; opisać różnice, jeśli użyto innych nazw | `src/features/submissions/model.ts`, `service.ts`; model/serwis ROPS |
| Zaufana rola | Uzgodnione źródło, wartości i zasady weryfikacji/uprawnień serwerowych; proponowany hubmi_role nie jest wymagany, dopóki A go nie zaakceptuje | `src/features/rops/access.ts`, bramka panelu oraz RLS |
| Bezpieczny nadawca wiadomości | Potwierdzony zapis `{id, submission_id, message}` z serwerowymi `sender_id UUID`, `sender_role`, `sender_name`; albo uzgodniona inna bezpieczna operacja | `src/features/messages/model.ts`, `service.ts` |
| Operacje i uprawnienia | Własny odczyt autora, odczyt ROPS; statusy `nowe/weryfikacja/zaakceptowane/odrzucone`; UPDATE status/oficjalnej odpowiedzi tylko ROPS; izolacja rozmów i odrzucenie sender_role podanego przez autora | serwisy ROPS/wiadomości oraz bezpośrednie testy RLS A+B |

Nie należy przesyłać sekretów w commitach, raporcie lub logach. Po dostarczeniu powyższego wykonać test wyłącznie na testowych kontach/rekordach; do tego czasu integracja pozostaje wyłączona.

## Brakujące elementy po stronie A

**Nie potwierdzono zapisu ani komunikacji na prawdziwym Supabase.** Brak publicznej konfiguracji i kont testowych; nie ma uzgodnionego źródła roli ROPS, pełnych pól fiszki i bezpiecznego serwerowego nadawcy wiadomości w lokalnym SQL. Wymagania, istniejące/proponowane pola oraz błędy opisuje [stage-3-contract.md](stage-3-contract.md).

A musi:

1. Wdrożyć pola fiszki i właściciela z etapu 2.
2. Uzgodnić/nadać zaufaną rolę (propozycja `app_metadata.hubmi_role=rops_admin`) oraz dopasować RLS; usunąć autoryzację opartą wyłącznie na domenie email.
3. Dodać `sender_id` i serwerowe ustalanie `sender_id`, `sender_role`, `sender_name`; klient wysyła tylko ID, ID zgłoszenia i treść.
4. Chronić status/oficjalną odpowiedź przed autorem, a fiszkę/rozmowę przed innym autorem i anon. Potwierdzić to bezpośrednimi requestami do bazy, nie samymi filtrami UI.
5. Dostarczyć publiczną konfigurację oraz trzy testowe konta: autor A, autor B, pracownik ROPS.

Frontend jest przygotowany do wspólnego testu **po uzgodnieniu i wdrożeniu kontraktu**. Etap nie jest jeszcze zamknięty jako działająca integracja end-to-end na prawdziwej bazie. Do tego czasu `NEXT_PUBLIC_ROPS_COMMUNICATION_ENABLED=false`; brak mocków w zwykłym działaniu zgłoszeń/rozmów. Po gotowości A włączyć obie flagi etapu 2 i 3 oraz restart/rebuild, wyłącznie dla odpowiednio przygotowanego środowiska.

## Demonstracja i decyzje dla jury

Na testowych danych: autor `/kreator` → potwierdzony zapis → `/moje-zgloszenia/[id]` i pytanie → ROPS `/rops` filtr „Nowe” → szczegóły, status „W weryfikacji”, wiadomość i oficjalna odpowiedź → autor odświeża, widzi obie odpowiedzi → drugi autor próbuje UUID i otrzymuje odmowę. Pokazać także, że awaria zachowuje treść i nie daje sukcesu.

Najważniejsze decyzje: jeden Supabase Auth; uprawnienia serwera/RLS zamiast przełącznika roli; nadawca ustalany przez serwer; rozdzielenie rozmowy od oficjalnej decyzji; sukces dopiero po sprawdzeniu zapisanego rekordu; stabilny UUID wiadomości zabezpiecza retry przed duplikatem; filtry poprzedniej wartości chronią zmiany przed cichym nadpisaniem; proste odświeżenie wystarcza bez realtime.

## Pliki implementacji tego etapu (frontend/)

```text
.env.example
README.md
docs/stage-3-contract.md
docs/stage-3-verification.md
src/app/rops/page.tsx
src/app/rops/zgloszenia/[id]/page.tsx
src/components/site-header.tsx
src/features/auth/return-path.ts
src/features/submissions/views.tsx
src/features/submissions/creator.tsx
src/features/submissions/service.ts
src/lib/uuid.ts
src/features/rops/access.ts
src/features/rops/actions.tsx
src/features/rops/gate.tsx
src/features/rops/model.ts
src/features/rops/service.ts
src/features/rops/views.tsx
src/features/messages/author-communication.tsx
src/features/messages/conversation.tsx
src/features/messages/model.ts
src/features/messages/service.ts
tests/stage3.test.mjs
tests/submissions.test.mjs
tests/uuid.test.mjs
```


## Aktualizacja po pullu `83e1988`

Pobrano i scalono 5 nowych commitów A bez konfliktów w kodzie frontendu. A dodał migrację `backend/migrations/03_submissions_roles_and_stages.sql` z tytułem, rozwiązaniem, odbiorcami i etapem fiszki oraz endpointy zgłoszeń, wiadomości i panelu administracyjnego. Wcześniejszy opis braku tych elementów dotyczył stanu sprzed tego pulla. Migracja nie dodaje defaultu właściciela ani `sender_id` potrzebnych proponowanemu bezpośredniemu zapisowi SDK; wdrożenia na prawdziwej bazie nie potwierdzono.

Backend ustala sender_role w endpointzie wiadomości, ale `backend/app/core/security.py` akceptuje nagłówek X-Admin-Role wybrany przez klienta, dekoduje JWT bez weryfikacji podpisu oraz przyjmuje uprawnienia z user_metadata i domeny email. Tych sposobów nie używamy we frontendzie. Nowe endpointy nie są jeszcze bezpiecznym kontraktem do włączenia integracji; wymagają poprawy autoryzacji przez A. `app_metadata.hubmi_role` nadal jest propozycją, a obecny frontend SDK pozostaje domyślnie wyłączony. Po dostarczeniu bezpiecznej weryfikacji sesji/roli należy uzgodnić integrację z faktycznymi endpointami zamiast zakładać wdrożenie proponowanych triggerów.

Operacje Git w tej aktualizacji są jawnie zlecone przez użytkownika: pull/rebase, commit frontendu i push. Wcześniejsze wzmianki „bez pull/push” odnoszą się do poprzednich kontroli. Nowe commity A nie zmieniły kodu frontendu; dotychczasowe wyniki lint/build i ukierunkowanych testów pozostają wynikami ostatniej weryfikacji. Sprawdzono dodatkowo git diff --check i brak nierozwiązanych konfliktów. Cudze zmiany package-lock i lokalne usunięcie backend/.env.example pozostają poza commitem frontendu.

# Etap 3 — kontrakt ROPS i komunikacji do uzgodnienia z A

**To propozycja, nie wdrożony kontrakt backendu.** Przejrzano lokalne `backend/supabase_schema.sql`, `backend/fix_rls_policies.sql`, modele FastAPI, kontrakt etapu 2 i jego raport. HEAD przy rozpoczęciu: `49a8b47`. Nie wykonano pull/merge/pusha. Frontend korzysta dalej z istniejącego Supabase SDK / PostgREST i Auth; nie dodaje endpointów, klucza service_role ani pozorowanych sesji.

## Faktyczny stan i blokady

- Są tabele `submissions` i `submission_messages`. `submissions.status` ma nazwy `nowe`, `weryfikacja`, `zaakceptowane`, `odrzucone`. `official_response` jest osobnym nullable TEXT.
- Pola etapu 2 (`title`, `solution_description`, `target_group`, `implementation_stage`) nadal nie występują w lokalnym SQL. `user_id` dodaje skrypt naprawczy, lecz bez NOT NULL/defaultu `auth.uid()`; główny CREATE TABLE nie zawiera tego pola.
- Lokalny SQL identyfikuje admina m.in. domeną email lub JWT `role`. Brak uzgodnionego pola roli aplikacyjnej Auth i procesu nadania roli. Frontend **nie używa domeny email, user_metadata, localStorage ani przełącznika roli**.
- `submission_messages`: istnieją `id UUID`, `submission_id UUID`, `sender_role TEXT DEFAULT applicant`, `sender_name TEXT NOT NULL`, `message TEXT NOT NULL`, `created_at TIMESTAMPTZ`. Brak `sender_id` i mechanizmu serwerowego ustalania nadawcy. Aktualna polityka uczestnika nie blokuje podania `sender_role=rops_admin` przez autora.
- INSERT zgłoszeń jest publiczny WITH CHECK true; UPDATE w skrypcie naprawczym dopuszcza autora ze statusem nowe bez ochrony pól urzędowych. Główny schemat i skrypt naprawczy mają różne definicje polityk.
- Ponowna kontrola lokalnego środowiska: backend ma URL i tajny klucz serwerowy; frontend nadal nie ma publicznego publishable/anon key ani kont testowych. Klucza backendu nie wolno użyć w przeglądarce. Nie potwierdzono migracji ani RLS na rzeczywistej bazie; stan zdalnego schematu jest nieznany.

Dlatego `NEXT_PUBLIC_ROPS_COMMUNICATION_ENABLED=false` domyślnie blokuje prywatne odczyty ROPS, zmianę statusu, oficjalną odpowiedź i rozmowę. Ta flaga oznacza gotowość wdrożenia, nie uprawnienie użytkownika. Nie włączać jej, dopóki A nie uzgodni i wdroży poniższego kontraktu oraz testów izolacji. Flaga mock matchmakingu nie ma związku z tym etapem.

## 1. Wiarygodna rola (propozycja)

W istniejącym Supabase Auth użyć **`app_metadata.hubmi_role`** nadawanego wyłącznie administracyjnie przez serwer:

- `rops_admin`: pracownik ROPS;
- `author` lub brak pola: zwykły autor;
- inne wartości: frontend odmawia dostępu.

To nowa proponowana nazwa do akceptacji A, nie istniejące pole kontraktu. Frontend sprawdza użytkownika przez `auth.getUser()` (odpowiedź serwera), następnie rolę. Nie używa samego `getSession()` do autoryzacji. A musi spójnie używać tej roli w RLS / serwerze, odrzucać anonimowe konta i uniemożliwić samodzielne nadanie app_metadata. Role postgres `authenticated`/`service_role` nie są rolami aplikacyjnymi ROPS.

RLS musi weryfikować właściciela i rolę również przy bezpośrednich requestach. Uwzględnić odświeżenie JWT po nadaniu/odebraniu roli i sposób odwołania uprawnień; na potrzeby demonstracji ponownie zalogować użytkownika. Publiczny link /rops nie daje dostępu do danych. UI potwierdza rolę przed zamontowaniem prywatnych widoków; każda operacja potwierdza ją ponownie.

## 2. Zgłoszenia — odczyt ROPS i autora

Wymagane pola etapu 2 są opisane w [submissions-contract.md](submissions-contract.md). Etap 3 nie tworzy zastępczych tytułów i opisów. Pełny rekord odczytu ROPS:

```text
id UUID, user_id UUID NOT NULL, title TEXT,
problem_description TEXT, solution_description TEXT, target_group TEXT,
implementation_stage TEXT (pomysl/prototyp/pilotaz/wdrozenie),
institution_name TEXT|null, applicant_type TEXT,
matched_innovation_id TEXT|null, status TEXT, created_at TIMESTAMPTZ,
official_response TEXT|null
```

Lista: `submissions.select(powyższe pola).order(created_at DESC).order(id DESC)`, opcjonalnie `.eq(status, wybrany_status)`. ROPS widzi wszystkie dozwolone zgłoszenia, autor tylko własne. W tym etapie nie dodano paginacji; przed produkcyjną dużą bazą uzgodnić stronicowanie i limit PostgREST.

Szczegóły ROPS: te same pola i `.eq(id, UUID).maybeSingle()`. Brak danych oznacza „nie istnieje lub brak dostępu”, bez ujawniania istnienia cudzej fiszki. `matched_innovation_id` rozwiązywany publicznym odczytem rzeczywistej innowacji przez istniejący serwis.

Oficjalna odpowiedź autora: SELECT `id,user_id,official_response`, filtry `id` i `user_id=getUser().id`, sprawdzenie właściciela także w odpowiedzi. Dane prywatne nie są serwerowo prerenderowane ani współdzielone w cache między kontami.

## 3. Status i oficjalna odpowiedź

Dozwolone nazwy statusów **już istnieją**: `nowe`, `weryfikacja`, `zaakceptowane`, `odrzucone`. Proponowana operacja pracownika ROPS: UPDATE tylko `status` albo tylko `official_response` po ID; SELECT pełnego rekordu potwierdza wynik. Jeśli A ma ograniczenia przejść, musi je opisać i wymusić w bazie — frontend obecnie dopuszcza wybór każdego istniejącego statusu przez potwierdzonego pracownika.

- Status: `{ status: wybrany_status }`, filtr `id` i dotychczasowy `status`.
- Oficjalna odpowiedź: `{ official_response: trim(treść) }`, 1–10000 znaków (proponowany limit do CHECK po stronie A), filtr `id` i poprzednia wartość `official_response` (`IS NULL`, jeśli nie było odpowiedzi).
- Zapis odpowiedzi zastępuje poprzednią; nie zmienia statusu ani nie wysyła zwykłej wiadomości. Nie zaimplementowano kasowania oficjalnej odpowiedzi, historii wersji ani panelu kolejnych modułów.
- Brak zwróconego rekordu po UPDATE: brak dostępu lub konflikt aktualizacji; odświeżyć widok. Nie powtarzamy ślepo zapisu.
- Sukces dopiero po zgodności ID, właściciela i zapisanego pola. Awaria pozostawia treść w formularzu. Stara wersja pozostaje punktem porównania do czasu potwierdzenia zapisu.

A musi ograniczyć UPDATE tych kolumn do zaufanego ROPS. Autor nie może zatwierdzać zgłoszeń ani wpisywać official_response, również przez bezpośredni PostgREST. Uprawnienia kolumn/trigger powinny chronić user_id, pola oficjalne i status na INSERT i UPDATE; samo UI lub szerokie USING nie wystarczy.

## 4. Wiadomości — odczyt i bezpieczne wysłanie

Proponowane uzupełnienie istniejącej tabeli:

| Pole | Stan | Kontrakt |
| --- | --- | --- |
| `id` | UUID PK już istnieje | UUID v4 podawany przez frontend dla retry, unikalny |
| `submission_id` | UUID FK istnieje | NOT NULL, wskazuje dostępne zgłoszenie |
| `sender_id` | **Nowe, propozycja** | UUID NOT NULL FK Auth, serwer ustala z auth.uid() |
| `sender_role` | TEXT istnieje | Serwer ustala `applicant` lub `rops_admin`; klient nie może tego nadać |
| `sender_name` | TEXT NOT NULL istnieje | Serwer ustala etykietę/nazwę z zaufanych danych; klient nie podaje |
| `message` | TEXT NOT NULL istnieje | trim, 1–5000 znaków, CHECK po stronie A |
| `created_at` | TIMESTAMPTZ istnieje | NOT NULL nadawane przez bazę |

Frontend wysyła **wyłącznie**:

```json
{
  "id": "UUID-v4-proby",
  "submission_id": "UUID-zgloszenia",
  "message": "Treść wiadomości"
}
```

A powinien dostarczyć trigger/defaulty/ograniczenia, które przed INSERT ustalają **sender_id, sender_role, sender_name** według rzeczywistej sesji i zaufanej roli. Nie polegamy na domyślnym `sender_role=applicant`, ponieważ pracownik wymaga odmiennej etykiety. Bez tego obecny sender_name NOT NULL spowoduje odmowę, a frontend nie poda wymyślonej tożsamości dla obejścia błędu. Trigger/granty muszą odrzucać lub ignorować próby przesłania nadawcy przez bezpośredniego klienta; role ROPS nie można przyjąć z JSON użytkownika. Ustalenie nazwy nie wymaga publikowania email wszystkich uczestników.

Operacje SDK:

1. Potwierdzić sesję i, dla widoku ROPS, zaufaną rolę.
2. SELECT `submissions(id,user_id)` po ID; w widoku autora dodatkowo filtr własnego user_id. Odmowa kończy operację **przed odczytem historii**.
3. Historia: `submission_messages.select(id,submission_id,sender_id,sender_role,sender_name,message,created_at).eq(submission_id, UUID).order(created_at ASC).order(id ASC)`.
4. Wysłanie: SELECT wymaganych kolumn z limit 0 (brak kolumn → brak INSERT), INSERT payloadu powyżej, SELECT tych samych kolumn `.single()`. Potwierdzić ID, wątek, tekst i serwerowo ustaloną tożsamość zgodną z getUser().
5. Retry niezmienionej wiadomości zachowuje UUID w pamięci formularza. `23505` → odczyt tego ID, wątku i sender_id; sukces tylko przy zgodności wszystkich danych. Po niepewnym potwierdzeniu najpierw odświeżyć historię. Bez upsert i bez automatycznego ponawiania mutacji.

RLS: autor czyta/pisze tylko we własnym zgłoszeniu; ROPS według zaufanej roli; anon bez dostępu. Historyczne wiadomości wymagają wiarygodnego backfill sender_id, bez zgadywania autora na podstawie nazw. `mentor` istnieje w komentarzu starego schematu, lecz nie ma kontraktu dostępu w tym etapie — frontend odrzuca nieuzgodnioną rolę zamiast przedstawiać ją jako ROPS. Nie ma realtime, WebSocketów, załączników, edycji ani usuwania wiadomości.

## 5. Format błędów i odpowiedzi

Preferujemy standardowe Supabase SDK: `{data, error}`; błąd PostgREST zawiera `{code: string, message: string, details?: string, hint?: string}`. Frontend nie ujawnia technicznych szczegółów ani tokenów użytkownikowi.

| Kod / stan | Zachowanie frontendu |
| --- | --- |
| Auth getUser bez użytkownika / błąd | Sesja wygasła; ponowne logowanie/sprawdzenie sesji, brak operacji bazy |
| `42501` | Brak uprawnień; bez obchodzenia RLS |
| `PGRST301`, `PGRST302` | Błąd sesji |
| `42703`, `42P01`, `PGRST204`, `PGRST205` | Brak uzgodnionego schematu, blokada integracji |
| SELECT maybeSingle null | Brak zgłoszenia lub dostępu |
| UPDATE maybeSingle null | Zmiana wersji lub brak dostępu; odświeżyć |
| `23505` przy wiadomości | Kontrolowany odczyt do potwierdzenia retry |
| Sieć / inne błędy / timeout | Brak sukcesu, tekst zachowany, odświeżyć przed retry |
| Niepoprawna odpowiedź, inny wątek/tożsamość/treść | Odrzucona odpowiedź, bez fałszywego sukcesu |

Limit pojedynczego żądania SDK: istniejące 20 sekund, także body. Operacja może zawierać kilka żądań. Nawigacja/wylogowanie anuluje żądania danych; zmiana konta usuwa prywatne komponenty. Nie ma automatycznego fallbacku na mock.

## 6. Test integracyjny A+B przed włączeniem

Na osobnym zestawie **testowych** fiszek: autor A zapisuje fiszkę i widzi ją po odświeżeniu; potwierdzony ROPS otwiera listę i szczegóły, zmienia status, publikuje oficjalną odpowiedź; A wysyła wiadomość, ROPS czyta i odpowiada, A widzi odpowiedź po odświeżeniu. Autor B nie widzi fiszki ani rozmowy A nawet po samym UUID i bez frontendowych filtrów. Podstawione user_metadata/domena email/sender_role=rops_admin nie dają uprawnień. Anon i autor nie mogą aktualizować statusu/official_response. Odebranie roli blokuje kolejne operacje. Awaria, brak kolumn i RLS zachowują tekst, nie dają sukcesu ani duplikatów.

Dopiero po uzgodnieniu tego dokumentu, wdrożeniu schematu/triggera/RLS i kont ustawić obie flagi `NEXT_PUBLIC_SUBMISSIONS_ENABLED=true`, `NEXT_PUBLIC_ROPS_COMMUNICATION_ENABLED=true`, następnie restart/rebuild. Jeśli A wybierze inne źródło roli lub operację wiadomości, zmienić wydzielone serwisy/access; nie włączać niezgodnej integracji.

Źródła zasad SDK i zabezpieczeń: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [UPDATE z filtrami](https://supabase.com/docs/reference/javascript/update).


## Aktualizacja po pullu `83e1988`

Pobrano i scalono 5 nowych commitów A bez konfliktów w kodzie frontendu. A dodał migrację `backend/migrations/03_submissions_roles_and_stages.sql` z tytułem, rozwiązaniem, odbiorcami i etapem fiszki oraz endpointy zgłoszeń, wiadomości i panelu administracyjnego. Wcześniejszy opis braku tych elementów dotyczył stanu sprzed tego pulla. Migracja nie dodaje defaultu właściciela ani `sender_id` potrzebnych proponowanemu bezpośredniemu zapisowi SDK; wdrożenia na prawdziwej bazie nie potwierdzono.

Backend ustala sender_role w endpointzie wiadomości, ale `backend/app/core/security.py` akceptuje nagłówek X-Admin-Role wybrany przez klienta, dekoduje JWT bez weryfikacji podpisu oraz przyjmuje uprawnienia z user_metadata i domeny email. Tych sposobów nie używamy we frontendzie. Nowe endpointy nie są jeszcze bezpiecznym kontraktem do włączenia integracji; wymagają poprawy autoryzacji przez A. `app_metadata.hubmi_role` nadal jest propozycją, a obecny frontend SDK pozostaje domyślnie wyłączony. Po dostarczeniu bezpiecznej weryfikacji sesji/roli należy uzgodnić integrację z faktycznymi endpointami zamiast zakładać wdrożenie proponowanych triggerów.

Operacje Git w tej aktualizacji są jawnie zlecone przez użytkownika: pull/rebase, commit frontendu i push. Wcześniejsze wzmianki „bez pull/push” odnoszą się do poprzednich kontroli. Nowe commity A nie zmieniły kodu frontendu; dotychczasowe wyniki lint/build i ukierunkowanych testów pozostają wynikami ostatniej weryfikacji. Sprawdzono dodatkowo git diff --check i brak nierozwiązanych konfliktów. Cudze zmiany package-lock i lokalne usunięcie backend/.env.example pozostają poza commitem frontendu.

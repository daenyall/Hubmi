# Fiszki — propozycja integracji etapu 2 dla osoby A

**To propozycja wymagająca uzgodnienia i wdrożenia przez A, a nie istniejący kontrakt bazy.** Po pullu przeanalizowano `backend/supabase_schema.sql` oraz `backend/fix_rls_policies.sql` z commita `4ba1b65`. Frontend nie zmienia SQL, migracji ani RLS. Obecny schemat nie pozwala zapisać całej fiszki i nie zapewnia prywatności. Integracja zgłoszeń jest domyślnie wyłączona (`NEXT_PUBLIC_SUBMISSIONS_ENABLED=false`). Nie ma mocków zgłoszeń ani zastępczego zapisu w localStorage.

## Pola `public.submissions`

| Pole | Obecny stan | Wymaganie dla etapu 2 |
| --- | --- | --- |
| `id` | UUID PK, default `gen_random_uuid()` | Zachować. Frontend podaje stabilny UUID v4, aby ponowienie nie utworzyło duplikatu. |
| `user_id` | Dodawany w `fix_rls_policies.sql`: nullable UUID FK do Auth, ON DELETE SET NULL, bez defaultu; brak w CREATE TABLE głównego schematu | Uzupełnić NOT NULL i default `auth.uid()` oraz spójną migrację istniejących rekordów. Polityka musi sprawdzać zgodność z autoryzowanym UID. |
| `title` | **Brak** | TEXT NOT NULL, po trim 1–160 znaków. |
| `problem_description` | TEXT NOT NULL | Po trim 1–10000 znaków. |
| `solution_description` | **Brak** | TEXT NOT NULL, po trim 1–10000 znaków. |
| `target_group` | **Brak** | TEXT NOT NULL, po trim 1–4000 znaków. |
| `implementation_stage` | **Brak** | TEXT NOT NULL, CHECK: `pomysl`, `prototyp`, `pilotaz`, `wdrozenie`. |
| `matched_innovation_id` | Nullable TEXT FK do `innovations.id`, ON DELETE SET NULL | Zachować; null oznacza własny pomysł bez powiązania. |
| `institution_name` | Nullable TEXT | Zachować; maks. 200 znaków po trim, puste pole → null. |
| `applicant_type` | TEXT NOT NULL DEFAULT 'JST' | Uzgodnić CHECK: `JST`, `NGO`, `CUS`, `Mieszkaniec`, `Nieokreślony`. Ostatnia wartość oznacza pominięcie opcjonalnego pola; frontend nie zakłada, że autor jest JST. |
| `status` | TEXT NOT NULL DEFAULT 'nowe' | Baza nadaje `nowe`. Autor nie może nadać innego statusu. Odczyt obsługuje też `weryfikacja`, `zaakceptowane`, `odrzucone`. |
| `created_at`, `updated_at` | TIMESTAMPTZ z defaultem | Niepuste, nadawane przez bazę. `created_at` zwracane do listy. |
| `applicant_name`, `applicant_email` | Nullable TEXT | Frontend tego etapu nie wysyła; konto pochodzi z Auth. |
| `official_response`, `notes` | Nullable TEXT | Nie wysyłane ani edytowane przez autora; oficjalna odpowiedź wyłącznie przez uprawnionego administratora. |

A musi zdecydować o migracji istniejących rekordów bez właściciela i bez pełnych pól. Frontend nie przypisuje publicznych starych fiszek bieżącemu użytkownikowi i nie pakuje nowych pól do `problem_description` ani `notes`.

## Operacje (SDK Supabase / PostgREST)

Przed prywatną operacją frontend potwierdza użytkownika przez `auth.getUser()`. Następnie wykonuje SELECT wszystkich wymaganych kolumn z filtrem `user_id` i `limit(0)`; brak kolumn powoduje komunikat konfiguracji, bez INSERT. Ten odczyt nie dowodzi poprawności RLS.

INSERT wysyła wyłącznie:

```json
{
  "id": "UUID-v4-wygenerowany-dla-tej-proby",
  "title": "Tytuł pomysłu",
  "problem_description": "Opis potrzeby",
  "solution_description": "Opis rozwiązania",
  "target_group": "Odbiorcy",
  "implementation_stage": "pomysl",
  "institution_name": null,
  "applicant_type": "Nieokreślony",
  "matched_innovation_id": null
}
```

Nie wysyłamy `user_id`, `status`, roli ani oficjalnej odpowiedzi. `user_id` musi pochodzić z domyślnego `auth.uid()`, status z bazy. INSERT z `select(...).single()` musi zwrócić pełny rekord: `id,user_id,title,problem_description,solution_description,target_group,implementation_stage,institution_name,applicant_type,matched_innovation_id,status,created_at`. Sukces następuje po sprawdzeniu właściciela, typów i zgodności zwróconej treści. Potrzebna jest także polityka SELECT własnego nowego rekordu.

Lista: SELECT powyższych kolumn, `user_id = getUser().id`, sortowanie `created_at DESC, id DESC`. Szczegóły: te same kolumny, filtry `id` i `user_id`, `maybeSingle()`. Brak rekordu i cudzy rekord dają ten sam komunikat braku dostępu/istnienia. Filtr klienta stanowi dodatkową kontrolę, **nie zastępuje RLS**.

Powiązanie: publiczny SELECT `innovations(id,title,description,target_group,source_url)` po ID przed zapisem; lista wyboru pobiera pierwsze 100 rekordów alfabetycznie. ID z karty nie jest dowodem istnienia rekordu. Rekordy `demo-*` nie mogą być powiązane. Źródła tylko HTTP/HTTPS lub null.

Retry niezmienionej fiszki zachowuje UUID w obrębie otwartego formularza. Konflikt PK (`23505`) skutkuje odczytem własnej fiszki i porównaniem całej wysłanej treści. Inna treść nie daje sukcesu. Timeout lub awaria po INSERT może oznaczać zapis bez potwierdzenia: użytkownik dostaje polecenie sprawdzenia listy przed ponowieniem. Limit pojedynczego żądania SDK to 20 s wraz z odczytem odpowiedzi; cała operacja może zawierać kilka żądań. Przełączenie konta/nawigacja anuluje żądania danych. Tekst formularza pozostaje w pamięci po błędzie; niezapisany szkic nie przetrwa odświeżenia.

## Auth i RLS — zadania A przed włączeniem

1. Dostarczyć adres projektu, **publiczny publishable lub anon key** i dwa przygotowane konta email/hasło. Frontend nie tworzy kont ani ról. Nigdy nie przekazywać `service_role`/secret key do frontendu.
2. Wdrożyć powyższe pola, wartości domyślne, ograniczenia i indeks właściciela/dat. Odświeżyć cache schematu PostgREST po migracji.
3. A dostarczył `fix_rls_policies.sql`, który usuwa dawne publiczne FOR ALL i dodaje polityki odczytu autora/administratora. Potwierdzić wdrożenie w bazie. Nadal zastąpić `Anyone can create submission ... TO public WITH CHECK (true)` polityką INSERT wymagającą rzeczywistej sesji, własnego `user_id` i chroniącą początkowy status/pola urzędowe. Dodanie restrykcyjnej polityki obok otwartej nie wystarczy — polityki permissive są łączone OR.
4. Zgłoszenia: anon bez odczytu/zapisu; authenticated SELECT tylko `user_id = auth.uid()` (oraz administrator według zaufanej roli); INSERT tylko własny rekord z początkowym statusem `nowe`, pustą oficjalną odpowiedzią/notatkami. W etapie 2 autor nie potrzebuje UPDATE ani DELETE. Obecny `fix_rls_policies.sql` dopuszcza w polityce UPDATE autora z `status = nowe`, bez ochrony poszczególnych kolumn: może on zmienić `official_response` przy pozostawieniu statusu nowe. Usunąć tę gałąź albo ograniczyć dopuszczalne kolumny; główny schemat i skrypt naprawczy mają różne definicje tej polityki. Uprawnienia kolumn/trigger/ograniczenia muszą chronić pola urzędowe również przy bezpośrednim wywołaniu API; ukryty przycisk ich nie zabezpiecza.
5. Administrator wyłącznie ze źródła kontrolowanego przez serwer (np. osobna zabezpieczona tabela ról lub zaufane `app_metadata`), nigdy z edytowalnego `user_metadata`. Autor nie może awansować własnego konta, zatwierdzić fiszki ani wpisać odpowiedzi ROPS.
6. Wiadomości: właściciel przez powiązane zgłoszenie i administrator; autor nie może podać `sender_role=rops_admin`. Interfejs wiadomości/panel ROPS pozostają następnym etapem.
7. Obecna polityka `Service role manages innovations` dopuszcza także `authenticated`; ograniczyć zapis innowacji do uprawnionej administracji/backendu. Publiczny SELECT może pozostać.
8. Wykonać testy bezpośrednio na Supabase: dwa konta, cudzy UUID (także bez filtra właściciela), anonimowy odczyt, cudzy owner przy INSERT, zmiana statusu/official_response i eskalacja roli. Wszystkie nieuprawnione operacje mają być odrzucone przez bazę.

Dopiero po potwierdzeniu przez A schematu i RLS ustawiamy `NEXT_PUBLIC_SUBMISSIONS_ENABLED=true` i restartujemy/rebudujemy frontend. Flaga jest blokadą wdrożeniową, **nie mechanizmem autoryzacji** ani automatyczną weryfikacją polityk.

## Wspólny test zamknięcia etapu

Konto A → zapis pełnej fiszki → szczegóły/lista → odświeżenie → wylogowanie → ponowne logowanie → ta sama fiszka. Konto B → bezpośredni URL fiszki A i bezpośredni request do bazy → odmowa. Awaria API/RLS/schema → tekst zachowany, brak sukcesu i podwójnych zapisów. Testy z przechwyconym HTTP lub atrapą SDK weryfikują frontend, nie trwałość prawdziwej bazy ani jej RLS.


## Wynik przeglądu po pullu `4ba1b65`

Dodano częściowe RLS, `user_id`, tokenowy dostęp i testy bezpieczeństwa — wcześniejsza informacja o całkowitym braku tych zmian jest nieaktualna. Nadal brak tytułu, rozwiązania, odbiorców i etapu, brak domyślnego przypisania `user_id = auth.uid()`, otwarty INSERT i szeroki UPDATE autora w skrypcie naprawczym. Główny schemat odwołuje się do `user_id` i `access_token`, lecz ich nie tworzy; trzeba uzgodnić kolejność migracji i spójny schemat. Repozytorium nie stanowi dowodu wdrożenia SQL na rzeczywistej bazie. Frontend używa teraz istniejącej nazwy `user_id`, zamiast proponować drugi identyfikator właściciela.

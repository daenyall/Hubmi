# Przekazanie integracji B → A, 3 października 2026

Stan odczytany z lokalnego repozytorium przy HEAD `ebb324125d1f471cc2efcc4b79f1b700610e66b2`. Zachowano zastane zmiany, w tym lokalny Zasobnik Wiedzy, materiały ROPS, package-lock i usunięcie backendowego `.env.example`. W tej pracy nie wykonywano pull/merge/push/deploy ani zmian backendu, SQL i RLS.

## Decyzja i wykonane funkcje

Decyzja zespołu: **jeden Supabase Auth i bezpośrednie SDK/PostgREST** dla fiszek, panelu ROPS i rozmów. FastAPI pozostaje dla matchmakingu, adaptacji AI i istniejącego odczytu katalogu `GET /api/innovations`. Endpointy prywatnych zgłoszeń FastAPI nie są alternatywną ścieżką tego frontendu. Nie przepisano gotowych modułów i nie dodano bibliotek.

- Lista `/rops` sprawdza dane po 30 sekundach od zakończenia poprzedniego odczytu. Odczyty ręczne i automatyczne są szeregowe; podwójne kliknięcie nie uruchamia drugiego żądania.
- Pierwszy odczyt ustala punkt odniesienia. Nowe ID otrzymują tekst „Nowe na liście” i dostępny komunikat liczby nowych pozycji. Oznaczenie dotyczy bieżącego filtra i wizyty; nie oznacza statusu fiszki ani globalnej liczby nowych zgłoszeń. Zmiana filtra ustala nowy punkt odniesienia.
- Odczyt w tle zachowuje karty oraz fokus. Błąd sieci pokazuje ostatnią poprawną listę i umożliwia ponowienie. Utrata sesji/uprawnień lub brak schematu usuwa prywatną listę i wstrzymuje zegar. Wylogowanie lub opuszczenie listy anuluje jej aktywny odczyt; niewidoczna karta przeglądarki pomija kolejne odczyty.
- Polling dotyczy wyłącznie listy: nie odświeża formularzy statusu, oficjalnej odpowiedzi ani rozmowy. To informacja w otwartym panelu, **nie email** ani powiadomienie poza aplikacją.
- Kreator ma konkretniejsze podpowiedzi dotyczące diagnozy, rozwiązania i odbiorców oraz opis etapów powiązany z polem. Nie zmieniono walidacji, payloadów, UUID, zachowania treści po awarii ani potwierdzania sukcesu.
- Zachowano katalog, lokalne wyszukiwanie, filtr serwerowy i paginację. Pusty katalog/brak wyników daje przejście do kreatora bez fikcyjnego powiązania; poprawiono ograniczenie szerokości kontrolek na telefonie.
- Nie dodano niezweryfikowanych innowacji, linków ani materiałów. Dostarczone brief, prezentacja i wzór wniosku nie zastępują rzeczywistych rekordów katalogu, raportów, Mapy Wyzwań i pliku Canvas. Podpowiedzi są pomocą redakcyjną, nie oznaczoną jako oficjalna metodologia ROPS.

## Konfiguracja i warunki włączenia

**Brak potwierdzonej integracji na prawdziwym Supabase.** Nie ma lokalnego `.env.local`, publicznej konfiguracji w środowisku procesu ani przygotowanych kont testowych. Nie wykonano prywatnych zapisów/odczytów na prawdziwej bazie. Nie użyto klucza serwerowego.

Po potwierdzeniu wdrożenia przez A, konfiguracja lokalna w `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<URL projektu testowego>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publiczny publishable key>
# Zamiast publishable można użyć NEXT_PUBLIC_SUPABASE_ANON_KEY (publiczny JWT role=anon).
NEXT_PUBLIC_SUBMISSIONS_ENABLED=true
NEXT_PUBLIC_ROPS_COMMUNICATION_ENABLED=true
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_USE_MOCK_MATCHING=false
```

To wzór do włączenia **dopiero po potwierdzeniu A**, nie utworzona konfiguracja. `.env.example` zachował domyślne `false`. Zmiana `NEXT_PUBLIC_*` wymaga restartu dev/rebuild. Nie zapisywać w repozytorium service_role, sb_secret_, haseł i tokenów. Uruchomienie: `cd frontend`, `npm ci`, `npm run dev`; serwer jest procesem długotrwałym, testujemy konkretne żądania, nie czekamy na jego zakończenie.

## Dokładny istniejący model oczekiwany przez SDK

To zestawienie **obecnego kodu i wcześniej zapisanych kontraktów**, bez nowych nazw pól i endpointów. Źródła: `src/features/submissions/model.ts`, `src/features/rops/model.ts`, `src/features/messages/model.ts`, [kontrakt fiszek](../submissions-contract.md), [kontrakt etapu 3](../stage-3-contract.md). Stan wdrożenia tych wymagań musi potwierdzić A.

| Tabela / pola odczytu | Typ i wymagana wartość | Zapis frontendu / odpowiedzialność bazy |
| --- | --- | --- |
| submissions: `id` | UUID PK | Stabilny UUID v4 klienta dla jednej niezmienionej próby |
| `user_id` | UUID NOT NULL, FK Auth | Klient nie wysyła; baza ustala `auth.uid()` i chroni właściciela |
| `title` | niepusty TEXT, do 160 znaków | Autor |
| `problem_description`, `solution_description` | niepusty TEXT, do 10000 znaków każde | Autor |
| `target_group` | niepusty TEXT, do 4000 znaków | Autor |
| `implementation_stage` | `pomysl`, `prototyp`, `pilotaz`, `wdrozenie` | Autor; wartości istnieją w migracji 03 |
| `institution_name` | TEXT do 200 znaków lub NULL | Autor, opcjonalnie |
| `applicant_type` | TEXT: `JST`, `NGO`, `CUS`, `Mieszkaniec`; niewybrany = `Nieokreślony` | Autor; A musi dopuścić istniejący wariant opcjonalny |
| `matched_innovation_id` | TEXT FK innovations.id lub NULL | Wyłącznie rzeczywisty ID; brak powiązania = NULL |
| `status` | `nowe`, `weryfikacja`, `zaakceptowane`, `odrzucone` | Przy INSERT baza ustala `nowe`; zmienia wyłącznie ROPS |
| `official_response` | TEXT lub NULL; formularz 1–10000 znaków | Osobny UPDATE wyłącznie ROPS, niezależny od wiadomości |
| `created_at` | TIMESTAMPTZ NOT NULL, poprawna data | Baza, nie klient |
| submission_messages: `id`, `submission_id` | UUID PK, UUID FK submissions.id | Stabilny UUID próby i ID wątku |
| `sender_id` | UUID NOT NULL FK Auth | Baza ustala rzeczywiste `auth.uid()` |
| `sender_role` | `applicant` lub `rops_admin` | Baza ustala z sesji i zaufanej roli; nie z JSON klienta |
| `sender_name` | niepusty TEXT | Baza ustala etykietę z zaufanych danych |
| `message` | niepusty TEXT, trim, do 5000 znaków | Uczestnik dostępnego wątku |
| `created_at` | TIMESTAMPTZ NOT NULL | Baza |

Frontend wysyła fiszkę tylko z `id,title,problem_description,solution_description,target_group,implementation_stage,institution_name,applicant_type,matched_innovation_id`. Wiadomość tylko z `id,submission_id,message`. Nie wysyła właściciela, nadawcy, roli, czasu, statusu ani oficjalnej odpowiedzi przy tworzeniu fiszki.

Wiarygodna rola oczekiwana przez istniejący frontend: `auth.getUser()` → **`app_metadata.hubmi_role=rops_admin`**. `author` lub brak tego pola oznacza autora, inne wartości są odrzucane. A ma potwierdzić administracyjne nadanie oraz identyczną interpretację w RLS. Backend w aktualnym HEAD rozpoznaje już `hubmi_role`, lecz nie dowodzi to wdrożenia roli/RLS w bazie. Nie rozszerzono frontendowych uprawnień o domenę email, user_metadata ani alternatywne pole na podstawie domysłu.

Odczyt ROPS: SELECT pełnej fiszki + official_response, kolejność created_at DESC/id DESC, opcjonalny filtr statusu. Odczyt autora: dodatkowy filtr własnego user_id, również sprawdzony w odpowiedzi. Historia: SELECT wymienionych pól wiadomości po submission_id, created_at ASC/id ASC. Wszystkie operacje ponownie potwierdzają sesję; prywatny panel montowany dopiero po potwierdzeniu roli.

Zmiana statusu wysyła tylko `{status}` z filtrem ID i poprzedniego statusu. Oficjalna odpowiedź wysyła tylko `{official_response}` z filtrem ID i poprzedniej wartości (IS NULL, gdy brak). Zwrócony pełny rekord musi potwierdzić właściciela, ID i zapisane pole. Brak rekordu oznacza konflikt lub odmowę, nie sukces. Każde żądanie SDK ma istniejący limit 20 sekund wraz z body. Błędy pozostają standardowymi błędami SDK/PostgREST; nie wyświetlamy surowych szczegółów.

Lista ROPS nie ma jeszcze paginacji: odświeża zakres zwracany przez PostgREST, podlegający limitowi projektu. Nie deklarujemy monitorowania całej dużej bazy. Paginacja istnieje w publicznym katalogu; jej wyszukiwanie obejmuje pobrane rekordy, a lista kategorii może być niepełna.

## Blokady i zadania A

| Element | Konkretny oczekiwany wynik | Miejsce użycia |
| --- | --- | --- |
| Konfiguracja i testowe konta | Publiczny URL/klucz; autor A, autor B i ROPS z hasłami przekazanymi poza raportem/repo; potwierdzony zestaw wyłącznie testowych danych | `.env.local`, `/logowanie`, wspólny test |
| Właściciel i pełna fiszka | Pola powyżej; `user_id NOT NULL` ustalany z auth.uid(); INSERT bez user_id ma działać i zwracać własny rekord | serwis fiszek i listy/szczegóły ROPS |
| Zaufana rola i RLS | Potwierdzone hubmi_role; autor wyłącznie własne fiszki/rozmowy, ROPS uprawniony do obsługi; anon bez dostępu; usunięte stare otwarte i domenowe polityki | bramka ROPS oraz bezpośrednie żądania SDK |
| Nadawca wiadomości | `sender_id` oraz serwerowe ustalanie id/role/name przy payloadzie z trzema polami; próba podstawienia roli nie daje uprawnień | serwis rozmowy, potwierdzenie INSERT i retry UUID |
| Ochrona pól urzędowych | Autor nie ustawia/zmienia statusu, official_response, właściciela; wyłącznie zaufany ROPS zmienia pola urzędowe; uczestnik nie edytuje nadawcy | bezpieczeństwo INSERT/UPDATE, testy bezpośrednie |

Lokalna migracja `03_submissions_roles_and_stages.sql` zawiera już tytuł, rozwiązanie, odbiorców, etapy i statusy. Nie raportujemy ich jako brakujących w repozytorium. Nie ma jednak w lokalnym SQL defaultu właściciela potrzebnego temu INSERT ani sender_id/triggera wiadomości. Skrypt naprawczy nadal zawiera publiczny INSERT, autoryzację domeną/top-level role oraz UPDATE autora w statusie nowe bez ochrony kolumn. **Nieznany stan zdalnej bazy**: A ma potwierdzić, co faktycznie wdrożył; sam lokalny SQL nie dowodzi stanu Supabase. Backendowe ustalanie nadawcy nie zabezpiecza bezpośredniego INSERT SDK.

## Wykonane kontrole i granice

- `npm run lint`: kod 0, bez błędów i ostrzeżeń.
- `npm run build`: kod 0; TypeScript i wszystkie istniejące trasy, w tym katalog, kreator i ROPS, zbudowane.
- `node --test tests/rops-list.test.mjs tests/stage3.test.mjs tests/knowledge.test.mjs`: **40/40**; 8 nowych testów monitora, 20 istniejących testów serwisów/roli etapu 3, 12 katalogu. Testy korzystają z atrap SDK/HTTP i kontrolowanego zegara; nie potwierdzają trwałości ani RLS.
- Wynik ukierunkowanych kontroli Chromium zostanie dopisany po zakończeniu. Flagi włączono jedynie w odizolowanej, ignorowanej kopii testowej z fikcyjną publiczną konfiguracją i przechwyconymi odpowiedziami HTTP.
- Wcześniejsze próby przeglądarkowe etapu 3 opisuje [stage-3-verification.md](../stage-3-verification.md). To wyniki historyczne na atrapach; nie zastępują obecnej kontroli ani rzeczywistego testu.
- Na prawdziwej bazie niezweryfikowane pozostają: trwały zapis, odczyt po odświeżeniu/ponownym loginie, rozmowa autor↔ROPS, oficjalna odpowiedź, izolacja drugiego autora i ochrona przed podszyciem/zmianą pól urzędowych. Powód: brak publicznej konfiguracji, kont i potwierdzenia wdrożenia od A. **Etap nie jest zamknięty end-to-end.**

## Następny wspólny krok

Po potwierdzeniu A włączyć flagi lokalnie i zrestartować frontend. Na nowych testowych danych:

1. Autor A loguje się, zapisuje fiszkę i odczytuje ją po odświeżeniu; wysyła wiadomość.
2. ROPS ma otwarty `/rops`. Po kolejnej kontroli widzi oznaczoną nową fiszkę; może też odświeżyć ręcznie. Otwiera ją, zmienia status, wysyła wiadomość i osobno oficjalną odpowiedź.
3. Autor A odświeża szczegóły/rozmowę, widzi status i obie odpowiedzi, a następnie powtarza odczyt po ponownym zalogowaniu.
4. A+B sprawdzają autora B po bezpośrednim URL i przez PostgREST bez filtra właściciela, anon, podszycie sender_role oraz próby zmiany pól urzędowych. Odmowa ma wynikać z bazy.
5. Kontrolowana awaria nie usuwa tekstu, nie daje sukcesu i retry niezmienionej treści nie duplikuje UUID.

## Pliki tego zadania do przeglądu / commita

```text
frontend/src/features/rops/list-monitor.ts
frontend/src/features/rops/use-live-list.ts
frontend/src/features/rops/views.tsx
frontend/src/features/submissions/creator.tsx
frontend/src/features/knowledge/browser.tsx
frontend/tests/rops-list.test.mjs
frontend/docs/rops/integration-handoff.md
frontend/docs/stage-3-contract.md
frontend/docs/stage-3-verification.md
```

Katalog wiedzy był już lokalną niezacommitowaną pracą: `browser.tsx` wymaga zachowania pozostałych plików tego modułu, trasy i wcześniejszych zmian nawigacji/API. Nie traktować całego katalogu docs/rops ani package-lock jako nowych zmian tego zadania. Artefakty kontrolne są w ignorowanym `node_modules/.cache/hubmi-verification/`.

# Zasobnik Wiedzy — implementacja i weryfikacja

Stan lokalny: 2026-10-03, baza kodu `11bdee1`. Nie wykonywano pull, merge, rebase, push ani wdrożenia. Zachowano wcześniejszą zmianę `package-lock.json` oraz usunięcie `backend/.env.example`.

## Działanie

`/baza-wiedzy` korzysta z publicznego `GET {NEXT_PUBLIC_BACKEND_URL}/api/innovations`. Domyślny adres pochodzi z istniejącego klienta: `http://localhost:8000`. Nie wymaga konfiguracji prywatnych zgłoszeń, roli ROPS ani klucza Supabase w przeglądarce. Flaga mocka matchmakingu nie włącza atrap katalogu; nie ma fallbacku po błędzie.

Potwierdzony w **kodzie backendu** kontrakt (`backend/app/api/endpoints/innovations.py`, `backend/app/models/schemas.py`):

- Odpowiedź jest tablicą `MatchItem`, bez opakowania i bez liczby wszystkich rekordów.
- `category` jest opcjonalnym dokładnym filtrem serwera; `limit` wynosi domyślnie 50 i dopuszcza 1–100; `offset` jest całkowity i nieujemny.
- Karta używa `id`, `title`, opcjonalnych `description`, `target_group`, `category`, `source_url`. Brak tekstu jest jawnie oznaczony. Pola opcjonalne mogą mieć `null`.
- `similarity_score` katalogu jest ustawiany przez endpoint na `1.0`; frontend go nie pokazuje. Nie prezentuje również `status` jako certyfikacji ani potwierdzenia skuteczności.
- Backend nie udostępnia pełnej listy kategorii ani parametru wyszukiwania tekstowego dla tego endpointu.

Wyszukiwanie nazwy, opisu i odbiorców jest lokalne, obejmuje tylko pobrane rekordy aktualnego widoku, ignoruje wielkość liter i polskie znaki. UI opisuje ten zakres. Kategorie są zbierane z dotychczas pobranych stron i mogą być niepełne. Wybranie kategorii rozpoczyna odczyt od `offset=0`; tekst wyszukiwania pozostaje lokalnym filtrem tej listy.

„Wczytaj więcej” pobiera strony po 50 rekordów. Pełna strona pozwala wykonać następne zapytanie; krótsza kończy aktualny widok. Dokładna wielokrotność 50 wymaga dodatkowego odczytu, który może zwrócić pustą listę. Powtarzające się ID na styku stron nie dublują kart, a offset liczy rekordy odpowiedzi serwera. Błąd następnej strony zachowuje pobrane pozycje i pozwala ponowić ten sam offset. Zmiana kategorii anuluje poprzednie żądania. Limit 20 s obejmuje pobranie oraz odczyt JSON.

Źródła dopuszczają tylko bezwzględne HTTP/HTTPS bez danych logowania w URL. Niebezpieczny lub błędny adres nie tworzy odnośnika; rekord pozostaje widoczny z komunikatem. Brak źródła jest opisany osobno. Nie sprawdzano dostępności ani treści zewnętrznych źródeł. Rzeczywista karta z ID obsługiwanym przez istniejący kreator prowadzi do `/kreator?innowacja=ID`; rekordy `demo-*` nie tworzą powiązania. Istniejący kreator sam odczytuje innowację z Supabase — nie zmieniano jego serwisu.

## Zakończone kontrole

- `npm run lint`: exit 0.
- `npm run build`: exit 0; `/baza-wiedzy` znajduje się w wygenerowanych trasach App Router.
- `node --test tests/knowledge.test.mjs tests/matching.test.mjs`: **32/32 PASS**. Nowe 12 testów obejmuje rzeczywisty kod modelu/klienta katalogu, parametry, walidację odpowiedzi, bezpieczne adresy, wyszukiwanie, kategorie, offset, błędy, timeout nagłówków/body i anulowanie. Pozostałe 20 sprawdza regresję istniejącego klienta API. Fetch w tych testach jest atrapą.
- Chromium/Playwright, lokalny produkcyjny frontend na porcie 3130: testowe odpowiedzi HTTP przechwycone przez runner; **7 grup kontroli PASS**: pobranie i karty, wyszukiwanie i brak wyników, kolejne strony/retry, kategorie/pusty filtr, telefon/klawiatura, błąd pierwszej strony/pusty katalog, błędny kontrakt JSON. Kontrola paginacji potwierdziła zachowanie 50 kart po 503, ponowienie `offset=50` i następnie 51 kart.
- Przeglądarka: link kreatora z ID, brak linków `javascript:`, źródło HTTP/HTTPS, oznaczenia braków, brak procentów i statusu „sprawdzone”; brak błędów JavaScript w badanym przepływie.
- Szerokość 375 px, tekst powiększony do 200%: brak poziomego przewijania. Klawiatura: widoczny link pomijający nawigację. Axe dla WCAG 2 A/AA i 2.1 AA: 0 naruszeń w badanym stanie. To **nie jest potwierdzenie pełnej zgodności WCAG** ani audyt wszystkich stanów.

Skrypt lokalnego przeglądarkowego sprawdzenia i jego dane testowe znajdują się w ignorowanym `node_modules/.cache/hubmi-verification/knowledge-browser.cjs`. Aplikacja nie zawiera demonstracyjnego katalogu. Własny proces `npm start -- --port 3130` uruchomiono tylko do weryfikacji i zatrzymano po niej; istniejącego serwera użytkownika na 3000 nie zatrzymywano.

## Prawdziwy backend i ograniczenia

Rzeczywiste żądanie `GET http://localhost:8000/api/innovations?limit=50&offset=0` nie uzyskało połączenia (`URLError`, limit 5 s). **Nie potwierdzono katalogu end-to-end z FastAPI i Supabase.** Testy z przechwyconym HTTP nie dowodzą importu danych ani działania bazy.

Do wspólnego testu A musi uruchomić backend pod skonfigurowanym `NEXT_PUBLIC_BACKEND_URL`, zapewnić dostęp do tabeli `innovations` i CORS dla adresu frontendu. Po zmianie publicznego adresu trzeba zrestartować dev lub przebudować frontend. Test: otworzyć `/baza-wiedzy` bez przechwytywania HTTP, sprawdzić pierwszą stronę, filtr z `category`, kolejne `offset` i rzeczywiste źródło. Odczyt powiązania w kreatorze wymaga także jego dotychczasowej konfiguracji publicznego Supabase; nie był tutaj potwierdzony.

Endpoint nie ustawia stabilnego sortowania przed `range`. Przy zmianach danych między żądaniami paginacja może pomijać lub powtarzać rekordy; frontend usuwa powtórki, ale nie naprawi pominięć. A powinien zapewnić stały porządek, np. po unikalnym `id`, jeżeli katalog będzie zmieniany podczas przeglądania. Nie zmieniano backendu.

Nie potwierdzono pełnego importu biblioteki ROPS. Ten widok obejmuje innowacje dostępne w endpointcie; nie dodano materiałów edukacyjnych ani raportów, których obecny kontrakt nie dostarcza. Pełne kategorie lub wyszukiwanie całej bazy wymagałyby dodatkowego uzgodnionego kontraktu, nie są udawane lokalnym filtrem.

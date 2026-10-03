# HubMI — frontend, etapy 1 i 2

Polski interfejs wyszukiwania innowacji społecznych na HackYeah 2026. Formularz opisuje potrzebę, pokazuje dopasowane innowacje, odbiorców, uzasadnienia oraz powiązane materiały i dostępne linki źródłowe. Frontend nie oblicza procentów skuteczności.

## Uruchomienie

W katalogu `frontend/`:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Otwórz http://localhost:3000. Adres FastAPI ustawia `NEXT_PUBLIC_BACKEND_URL` (domyślnie `http://localhost:8000`, bez końcowego `/api`). Konfiguracja publiczna jest wbudowywana w frontend; po zmianach zrestartuj serwer deweloperski, a dla produkcji ponownie wykonaj build. Interfejs używa systemowych fontów i nie pobiera czcionek podczas budowania.

## Jawna demonstracja

W `.env.local` ustaw:

```dotenv
NEXT_PUBLIC_USE_MOCK_MATCHING=true
```

Możesz też uruchomić bez edycji pliku:

```bash
NEXT_PUBLIC_USE_MOCK_MATCHING=true npm run dev
```

Wybierz przykład „Samotność seniorów” lub „Dostępność wsparcia”, następnie „Znajdź rozwiązania”. Mock znajduje przykłady po słowach dotyczących seniorów, samotności, dostępności, opieki lub młodzieży. Inny temat, np. „Potrzebujemy ogrodu społecznego”, pokazuje brak dopasowań. Materiał pomocniczy pojawia się tylko przy demonstracyjnych dopasowaniach.

Mock znajduje się wyłącznie w `src/lib/mock-matching.ts`. Wszystkie rekordy są fikcyjne, oznaczone jako demonstracyjne i mają `source_url: null`; nie są to zweryfikowane innowacje ani materiały ROPS. Osoba A dodała dane seedujące w `backend/scripts/data/innovations.json`; mock pozostaje osobnym zestawem fikcyjnych przykładów. Demonstracja nie potwierdza działania AI, Supabase ani rzeczywistego matchmakingu.

`false` lub brak flagi oznacza rzeczywiste wywołanie API. Błąd API nigdy nie powoduje przejścia na mock.

## Integracja z backendem

Frontend korzysta z kontraktu `backend/app/models/schemas.py`, pobranego z gita razem z endpointami `/api/match` i `/api/adapt`. Typy sieciowe i normalizacja kart są w `src/lib/matching.ts`; klient w `src/lib/api.ts`.

Żądanie `POST {NEXT_PUBLIC_BACKEND_URL}/api/match`, `Content-Type: application/json`:

```json
{
  "problem_description": "Opis lokalnej potrzeby społecznej"
}
```

Opis wymaga minimum 3 znaków po usunięciu otaczających spacji. Frontend domyślnie pomija opcjonalne `threshold` i `limit`, pozostawiając wartości backendu.

Odpowiedź zgodna z backendem:

```json
{
  "matches": [
    {
      "id": "identyfikator-z-bazy",
      "title": "Tytuł rozwiązania",
      "description": "Opis ze źródła",
      "source_url": null,
      "why_relevant": "Uzasadnienie dopasowania do potrzeby",
      "target_group": "Grupa odbiorców",
      "category": "Temat",
      "similarity_score": 0.2,
      "status": "sprawdzone"
    }
  ],
  "query": "Opis lokalnej potrzeby społecznej",
  "total_found": 1
}
```

- `why_relevant` jest mapowane na uzasadnienie karty, `target_group` na odbiorców, `category` na temat. Opcjonalne pola mogą być pominięte lub mieć `null`; brakujących opisów i uzasadnień nie wymyślamy.
- `similarity_score` jest walidowane jako liczba, ale nie jest pokazywane jako procent skuteczności. Status backendu nie jest prezentowany jako certyfikacja ani weryfikacja ROPS.
- Źródła wymagają bezwzględnego adresu HTTP/HTTPS; brak adresu oznacza brak linku. Błędne JSON, listy i rekordy powodują błąd odpowiedzi.
- Backend obecnie nie zwraca `related_resources`. Obsługa tej opcjonalnej listy jest rozszerzeniem frontendu **do uzgodnienia z osobą A**. Rekord materiału: niepuste `id`, `title`, `description`, `reason`; `source_url` HTTP/HTTPS albo `null`, opcjonalne `audience` i `tags`. W demonstracji lista zawiera fikcyjny materiał bez źródła.
- Limit zapytania wynosi 20 sekund i obejmuje odczyt odpowiedzi. Błąd nie uruchamia mocku. Edycja opisu usuwa poprzednie wyniki.

### Plan adaptacji AI

Przy rzeczywistej innowacji rozwiń „Plan adaptacji AI”, opisz lokalny kontekst (minimum 5 znaków) i wybierz „Wygeneruj plan adaptacji”. Zachowano funkcję Middleman AI dodaną na zdalnej gałęzi. Żądanie `POST /api/adapt` zawiera `innovation_title`, `municipality_context` i dostępne `innovation_description`. Odpowiedź zawiera `innovation_title` oraz `adaptation_plan`. Formularz obsługuje błędy, blokadę wysłania, limit 20 sekund i anulowanie. Zmiana kontekstu usuwa stary plan. W trybie mock plan AI jest niedostępny.

Osoba A musi skonfigurować AI, bazę, CORS oraz dostarczyć rzeczywiste, zweryfikowane materiały i źródła. Po pullu backend nie zwraca już hardkodowanych dopasowań po błędzie bazy. Nadal sama odpowiedź HTTP nie dowodzi weryfikacji źródeł. Do zamknięcia pełnego matchmakingu potrzebny jest wspólny test: opis potrzeby → FastAPI/AI/baza → dopasowania i działające źródła. Rozszerzenie materiałów wymaga wspólnego uzgodnienia.

## Sprawdzenia

```bash
npm run lint
npm test
npm run build
npm start
```

Testy obejmują także aktualny kontrakt backendu i generowanie planu adaptacji. Testy klienta używają wbudowanego runnera Node i istniejącego TypeScript, bez nowych zależności. Wymagany Node co najmniej 20.9, zalecany 22. Obejmują walidację, żądanie, błędy HTTP i sieci, błędną odpowiedź, bezpieczne źródła, limit czasu, anulowanie oraz jawne włączanie mocku.

Ręcznie sprawdź pusty opis, ładowanie i blokadę wysłania, wyniki i materiały, brak dopasowań, awarię backendu, zachowanie tekstu oraz usuwanie starych wyników. Sprawdź także klawiaturę, fokus, komunikaty czytnika ekranu, telefon i powiększenie do 200%. Etykiety, semantyczne nagłówki, link pomijający nawigację, live region i kontrast wspierają dostępność; nie stanowią deklaracji pełnej zgodności z WCAG.


## Etap 2: kreator i własne zgłoszenia

- `/kreator`: tytuł, potrzeba, rozwiązanie, odbiorcy i etap; opcjonalna instytucja, typ autora i powiązanie z rzeczywistą innowacją.
- `/moje-zgloszenia`: lista własnych fiszek z datą i statusem, pobierana z Supabase; `/moje-zgloszenia/[id]`: szczegóły z bazy.
- `/logowanie`: email/hasło istniejących kont demonstracyjnych przygotowanych przez A. Wylogowanie usuwa sesję tego klienta; prywatne widoki znikają. Sesję obsługuje rzeczywisty Supabase Auth, nie własna atrapa localStorage.
- Karty rzeczywistych dopasowań prowadzą do `/kreator?innowacja=ID`. Dane powiązania są odczytywane z tabeli `innovations`; demonstracyjne karty nie mają tej akcji.

**Po pullu `4ba1b65` A dostarczył częściowe RLS i migrację `user_id`. Nadal brakuje pełnych pól fiszki, automatycznego przypisania właściciela i ograniczenia INSERT/UPDATE w skrypcie naprawczym. Zapis pozostaje wyłączony.** Dokładna propozycja pól, operacji i zabezpieczeń dla A: [docs/submissions-contract.md](docs/submissions-contract.md). Brak konfiguracji, kolumn, sesji lub uprawnień daje czytelny komunikat; nie ma zastępczego zapisu ani pozorowanego sukcesu.

Po przygotowaniu bazy/Auth/RLS przez A w `.env.local` ustaw:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://TWOJ-PROJEKT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=PUBLICZNY_KLUCZ_OD_A
NEXT_PUBLIC_SUBMISSIONS_ENABLED=true
```

Starszy publiczny `NEXT_PUBLIC_SUPABASE_ANON_KEY` jest również obsługiwany; publishable ma pierwszeństwo. Wpisy wyżej są placeholderami — potrzebne są rzeczywiste publiczne wartości. Nigdy nie używaj klucza `service_role` ani `sb_secret_`. Po zmianie konfiguracji zrestartuj dev lub wykonaj nowy build. `NEXT_PUBLIC_USE_MOCK_MATCHING` dotyczy wyłącznie wyszukiwarki etapu 1; nie włącza mocka Auth ani zgłoszeń.

Logowanie jest wymagane przy zapisie i prywatnych odczytach. Treść szkicu można przygotować wcześniej. Błąd zachowuje tekst; podczas zapisu formularz blokuje ponowne wysłanie. Sukces oznacza zwrócony i sprawdzony rekord bazy. Po utracie potwierdzenia sprawdź listę przed ponowieniem; niezmieniony formularz ponawia zapis z tym samym UUID. Niezapisany szkic jest tylko w pamięci i nie przetrwa odświeżenia; zapisane fiszki mają być trwałe w Supabase.

Serwis i model są w `src/features/submissions/`, Auth w `src/features/auth/`. Klient używa wyłącznie publicznego klucza, potwierdza użytkownika przez `getUser()`, nie wysyła statusu/roli/oficjalnej odpowiedzi, dodatkowo sprawdza właściciela odpowiedzi. RLS musi chronić bazę również poza frontendem.

### Weryfikacja etapu 2

`npm test` obejmuje walidację fiszki, brak eskalacji w payloadzie, blokadę bez sesji/schematu, błędy uprawnień i odpowiedzi, filtrowanie właściciela, powiązania tylko z bazą oraz retry bez duplikacji. Testy SDK/HTTP korzystają z danych testowych i nie potwierdzają rzeczywistego Supabase.

Po dostarczeniu konfiguracji wykonaj wspólnie z A: zapis → odświeżenie → wylogowanie i logowanie → odczyt tej samej fiszki; drugim kontem sprawdź cudzy bezpośredni URL i bezpośredni request do bazy. Sprawdź awarię podczas zapisu, brak utraty treści, telefon, klawiaturę i powiększenie 200%. Panel ROPS i wiadomości nie są częścią tego etapu.

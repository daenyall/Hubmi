# HubMI — frontend, etap 1

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

Mock znajduje się wyłącznie w `src/lib/mock-matching.ts`. Wszystkie rekordy są fikcyjne, oznaczone jako demonstracyjne i mają `source_url: null`; nie są to zweryfikowane innowacje ani materiały ROPS. W repozytorium nie znaleziono danych źródłowych. Demonstracja nie potwierdza działania AI, Supabase ani rzeczywistego matchmakingu.

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

Osoba A musi skonfigurować AI, bazę, CORS oraz dostarczyć rzeczywiste, zweryfikowane materiały i źródła. Backend ma obecnie przykładowe fallbacki, więc sama odpowiedź HTTP nie dowodzi wykonania wyszukiwania wektorowego ani weryfikacji źródeł. Do zamknięcia pełnego matchmakingu potrzebny jest wspólny test: opis potrzeby → FastAPI/AI/baza → dopasowania i działające źródła. Rozszerzenie materiałów wymaga wspólnego uzgodnienia.

## Sprawdzenia

```bash
npm run lint
npm test
npm run build
npm start
```

Testy obejmują także aktualny kontrakt backendu i generowanie planu adaptacji. Testy klienta używają wbudowanego runnera Node i istniejącego TypeScript, bez nowych zależności. Wymagany Node co najmniej 20.9, zalecany 22. Obejmują walidację, żądanie, błędy HTTP i sieci, błędną odpowiedź, bezpieczne źródła, limit czasu, anulowanie oraz jawne włączanie mocku.

Ręcznie sprawdź pusty opis, ładowanie i blokadę wysłania, wyniki i materiały, brak dopasowań, awarię backendu, zachowanie tekstu oraz usuwanie starych wyników. Sprawdź także klawiaturę, fokus, komunikaty czytnika ekranu, telefon i powiększenie do 200%. Etykiety, semantyczne nagłówki, link pomijający nawigację, live region i kontrast wspierają dostępność; nie stanowią deklaracji pełnej zgodności z WCAG.

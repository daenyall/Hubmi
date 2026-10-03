# Etap 2 — zakres zmian i weryfikacja

## Zaimplementowane

Kreator dostępny przez `/kreator`, rzeczywiste logowanie email/hasło Supabase, wylogowanie, lista `/moje-zgloszenia` i szczegóły `/moje-zgloszenia/[id]`. Wszystkie prywatne operacje potwierdzają Auth. Formularz waliduje pola, zachowuje tekst po awarii, blokuje równoległe wysyłanie i potwierdza zwrócony rekord przed sukcesem. Retry niezmienionej fiszki używa tego samego UUID. Nawigacja i karty innowacji prowadzą do kreatora; powiązanie wymaga rekordu odczytanego z bazy, rekordy demo są odrzucane.

## Zmienione i dodane pliki

Wszystkie zmiany implementacji dotyczą `frontend/`:

```text
.env.example
README.md
docs/submissions-contract.md
docs/stage-2-verification.md
src/app/layout.tsx
src/app/page.tsx
src/app/kreator/page.tsx
src/app/logowanie/page.tsx
src/app/moje-zgloszenia/page.tsx
src/app/moje-zgloszenia/[id]/page.tsx
src/components/match-card.tsx
src/components/page-frame.tsx
src/components/site-header.tsx
src/components/status-message.tsx
src/features/auth/auth-provider.tsx
src/features/auth/login-form.tsx
src/features/auth/return-path.ts
src/features/submissions/creator.tsx
src/features/submissions/innovation-picker.tsx
src/features/submissions/model.ts
src/features/submissions/service.ts
src/features/submissions/use-query.ts
src/features/submissions/views.tsx
src/lib/supabase/client.ts
src/lib/supabase/config.ts
tests/submissions.test.mjs
```

Istniejące niezacommitowane `backend/.env.example` i `frontend/package-lock.json` pozostawiono bez zmian (sprawdzone sumami SHA-256). Nie zmieniono backendu, SQL, migracji, RLS ani głównego README. Nie dodano zależności.

## Sprawdzenia

- `npm run lint`: bez błędów i ostrzeżeń.
- `npm test`: 36 testów, wszystkie przechodzą (20 istniejących matching/AI i 16 zgłoszeń).
- `npm run build`: poprawny build Next.js 16.3.8, wszystkie nowe trasy obecne.
- Chromium/Playwright: publiczny build bez konfiguracji oraz osobna kopia projektu z przechwyconymi odpowiedziami HTTP Auth/PostgREST. Test używa rzeczywistego SDK Supabase, ale **testowych odpowiedzi, nie prawdziwej bazy**.
- Przeglądarka: brak konfiguracji blokuje zapis, logowanie, pusta lista, karta → kreator z ID, walidacja i fokus, awaria zapisu/kolumn/RLS bez utraty tekstu, blokada wysyłania, potwierdzony rekord, szczegóły i lista po odświeżeniu, wylogowanie i ponowne logowanie, zmiana konta po zapisie nie ujawnia starej treści, cudzy bezpośredni URL bez danych.
- Telefon 320/375 px i tekst 200%: brak przewijania poziomego; widoczny fokus i semantyczne etykiety/nagłówki, komunikaty status/alert. Axe na głównych obszarach kreatora bez konfiguracji, skonfigurowanego kreatora i szczegółów: brak wykrytych naruszeń reguł WCAG 2 A/AA i 2.1 AA. Nie jest to certyfikacja WCAG; automatyczny skan ma ograniczony zakres.
- Testy przeglądarkowe wykonano przed pullem i zmianą nazwy właściciela z `owner_id` na `user_id`; po tej zmianie ponownie uruchomiono testy jednostkowe, lint i build.
- Brak błędów JavaScript w testowanych przepływach. Zrzuty i raporty testu przeglądarkowego są lokalnie w ignorowanym `node_modules/.cache/hubmi-verification/stage2-*`.

## Stan integracji

**Nie potwierdzono trwałego zapisu, ponownego odczytu ani RLS na rzeczywistym Supabase.** Po pullu `4ba1b65` skrypt naprawczy dodaje `user_id` i zastępuje publiczne FOR ALL politykami odczytu autora/administratora. Nadal brakuje `title`, `solution_description`, `target_group`, `implementation_stage`, defaultu `user_id = auth.uid()`, konfiguracji Auth/Supabase i ochrony INSERT/pól urzędowych. Frontend został dostosowany do istniejącej nazwy `user_id`. Domyślna flaga integracji pozostaje wyłączona. Fiszki nie mają mocka ani lokalnego zastępczego magazynu.

Osoba A musi dostarczyć migrację, bezpieczne polityki właściciela/administratora, publiczną konfigurację i dwa konta demonstracyjne, następnie wspólnie sprawdzić trwałość i izolację na prawdziwej bazie. Szczegóły i wymagane operacje w [submissions-contract.md](submissions-contract.md). Panel ROPS oraz wiadomości to kolejny etap.

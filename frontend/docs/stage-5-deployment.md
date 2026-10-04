# Etap 5 — wdrożenie frontendu, dostępność i stabilność demo

Stan odczytany z lokalnego repozytorium na branchu `feat/frontend-stage5-a11y-deploy`, założonym na `origin/main` w commicie `203e88e`. Poprzedni branch `feat/frontend-middleman-metadata` jest już scalony do `main` (PR #7), więc etap 5 startuje z aktualnego `main`.

Zachowano zastane zmiany, których nie commitujemy: lokalną modyfikację `frontend/package-lock.json` (różnica dotyczy wyłącznie pól `libc` dodawanych przez inną wersję npm), usunięcie `backend/.env.example` (zmiana cudza, poza zakresem frontendu) oraz materiały źródłowe PDF/PPTX w `docs/rops/`. Nie zmieniano backendu, SQL, RLS ani ustawień Supabase.

## 1. Wdrożenie online — zablokowane

**Etapu 5 nie można zamknąć.** Publiczne demo nie istnieje, a blokady są poza frontendem:

| Blokada | Dowód | Kto odblokowuje |
| :--- | :--- | :--- |
| **Brak działającego publicznego backendu** | `https://blocking-suspension-tractor-samuel.trycloudflare.com/api/health` → najpierw **HTTP 530** (tunel Cloudflare nie żyje), przy powtórnej kontroli nazwa już się nie rozwiązuje. `https://hubmi-backend.onrender.com` → **HTTP 404** na `/`, `/docs`, `/api/health`, `/openapi.json`, czyli usługa nie jest wdrożona. | Radek / osoba A |
| **Brak dostępu do Vercel** | `npx vercel whoami` → `Logged out`. Brak `~/.vercel/auth.json` i tokenu, brak `VERCEL_TOKEN` w środowisku. Repozytorium nie ma integracji Vercel↔GitHub: `gh api repos/daenyall/Hubmi/deployments` → `0`, brak webhooków i statusów commita. | Daniel (logowanie jest operacją interaktywną) |
| **Brak potwierdzonych kont testowych i Auth** | Scenariusz online wymaga istniejących kont (autor + `rops_admin`) na przygotowanym Supabase. Nie zostały przekazane. | Radek / osoba A |

Adresów nie wymyślono i nie podstawiono mocków. `NEXT_PUBLIC_USE_MOCK_MATCHING` pozostaje `false`.

Adresy `https://hubmi-rops.vercel.app` i `https://hubmi-git-feat-frontend-daenyalls-projects.vercel.app`, obecne w dokumentacji i testach backendu, zwracają **HTTP 404** — to przykłady, nie istniejące wdrożenia. Nie należy ich traktować jako URL frontendu.

## 2. Co zrobić, gdy blokady znikną

Kolejność ma znaczenie: `NEXT_PUBLIC_*` są wczytywane **w czasie buildu**, więc każda zmiana wymaga ponownego wdrożenia.

1. **Projekt na Vercel**: zaimportuj `daenyall/Hubmi` i ustaw **Root Directory = `frontend`**. To monorepo — bez tego build nie znajdzie `package.json`. Framework: Next.js (wykrywany automatycznie); nie trzeba nadpisywać build/install command.
2. **Zmienne środowiskowe** (Production + Preview), wyłącznie wartości publiczne:

   | Zmienna | Wartość |
   | :--- | :--- |
   | `NEXT_PUBLIC_BACKEND_URL` | rzeczywisty publiczny adres **HTTPS** FastAPI, bez końcowego `/` i bez `/api` |
   | `NEXT_PUBLIC_USE_MOCK_MATCHING` | `false` |
   | `NEXT_PUBLIC_SUPABASE_URL` | publiczny URL projektu Supabase |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | klucz `sb_publishable_…` (albo starszy publiczny `NEXT_PUBLIC_SUPABASE_ANON_KEY` z `role=anon`) |
   | `NEXT_PUBLIC_SUBMISSIONS_ENABLED` | `true` dla przygotowanego Supabase |
   | `NEXT_PUBLIC_ROPS_COMMUNICATION_ENABLED` | `true` dla przygotowanego Supabase |

   **Nigdy** `service_role`, `sb_secret_`, kluczy backendu ani kluczy modeli AI — wszystko z prefiksem `NEXT_PUBLIC_` trafia do przeglądarki.
3. **Deploy**, następnie przekaż Radkowi dokładny adres frontendu.
4. **Sprawdź na publicznym adresie**: logowanie i powrót do aplikacji, a potem scenariusz z sekcji 5.

## 3. Zadania dla Radka / osoby A

1. **Wdróż backend na trwały publiczny HTTPS** (Render według `backend/render.yaml` albo stabilny tunel) i podaj dokładny URL. Szybki tunel `trycloudflare.com` wygasa i nie nadaje się pod demo — obecny już nie odpowiada.
2. **Potwierdź, że `/api/health` zwraca `supabase_connected: true`** na tym adresie.
3. **CORS — prawdopodobnie bez zmian.** `backend/app/core/config.py` ma już `CORS_ORIGIN_REGEX = https://.*(\.vercel\.app|\.trycloudflare\.com|\.onrender\.com)`, więc domena `*.vercel.app` jest objęta. Jeśli frontend dostanie domenę własną, dopisz ją do `CORS_ORIGINS`.
4. **Supabase Auth**: dodaj adres frontendu do **Site URL** i **Redirect URLs**, inaczej powrót po logowaniu nie zadziała.
5. **Przekaż konta testowe**: jedno konto autora i jedno z `app_metadata.hubmi_role = "rops_admin"`. Frontend czyta rolę wyłącznie z `app_metadata` (nadawane po stronie serwera), nigdy z `user_metadata` ani z domeny email.
6. **Potwierdź RLS.** Brama ROPS w przeglądarce jest tylko informacyjna — rzeczywistej ochrony prywatnych fiszek musi pilnować RLS po stronie bazy.

## 4. Dostępność i stabilność — wykonane poprawki

Naprawiono problemy znalezione podczas kontroli, nie z odłożonego audytu.

- **Czytelny kontrast stanów nieaktywnych.** `disabled:opacity-50` z shadcn/ui wygaszało cały przycisk razem z tekstem. Zmierzone na wyrenderowanych pikselach (Chromium, `deviceScaleFactor: 3`): przycisk wysyłania w trakcie żądania **2,35:1**, przyciski `outline` **2,83:1**, a główny przycisk „Zapisz fiszkę” na `/kreator` dla niezalogowanego gościa **2,38:1** — stan stały, nie chwilowy. Dotyczyło to też komunikatów postępu („Szukamy rozwiązań…”, „Zapisujemy fiszkę…”, „Logujemy…”, „Generujemy plan…”), czyli jedynej informacji, że coś się dzieje. Zamiast wygaszania przez `opacity` wprowadzono tokeny `--primary-disabled`, `--disabled-surface`, `--disabled-foreground` i kolory stanu `disabled` dla każdego wariantu przycisku oraz pola `Input`. Po zmianie: **5,04:1**, **5,22:1**, **5,04:1**. WCAG 1.4.3 wyłącza nieaktywne kontrolki z wymagań kontrastu, ale te stany przenoszą treść, więc traktujemy je jak tekst.
- **Błąd planu adaptacji powiązany z polem.** `adaptation-form.tsx` pokazywał komunikat walidacji w `role="alert"`, ale bez `aria-invalid` i bez `aria-describedby`, więc czytnik ekranu nie łączył błędu z polem kontekstu. Dodano jedno i drugie, widoczną ramkę błędu oraz `aria-busy` na formularzu — jak w `matching-form.tsx`. `aria-invalid` ustawiamy tylko wtedy, gdy odrzucono treść pola; awaria usługi nie unieważnia tego, co użytkownik wpisał.
- **Publiczne wdrożenie z backendem na localhost mówi wprost o błędzie konfiguracji.** Bez `NEXT_PUBLIC_BACKEND_URL` kod cofał się do `http://localhost:8000`. Na publicznym HTTPS przeglądarka blokuje taką treść mieszaną, a użytkownik widział tylko „Nie udało się połączyć z usługą” — mylące przy właśnie wdrożonym demo. Nowa funkcja `backendUrlProblem()` w `src/lib/api.ts` wykrywa ten przypadek (host lokalny albo protokół inny niż HTTPS na stronie HTTPS) i zatrzymuje żądanie przed wysłaniem, z komunikatem wskazującym zmienną i potrzebę ponownego wdrożenia. Nie dotyczy lokalnego dev po HTTP, renderu serwerowego ani trybu mock.

## 5. Weryfikacja — wyniki rozdzielone

### 5.1. Lokalnie, bez przeglądarki

- `npm test`: **126/126** (119 zastanych bez regresji + 7 nowych dla `backendUrlProblem()`).
- `npm run lint`: kod zakończenia 0, bez błędów i ostrzeżeń.
- `npm run build`: kod zakończenia 0, TypeScript bez błędów, wszystkie 10 tras zbudowane.

### 5.2. Przeglądarka, serwer lokalny i atrapy odpowiedzi

Chromium przez Playwright, przeciw `next dev` i `next start`. Odpowiedzi backendu przechwycone — **to nie jest potwierdzenie prawdziwego backendu ani Supabase.**

- **Brak przewijania poziomego** na `/`, `/baza-wiedzy`, `/kreator`, `/moje-zgloszenia`, `/rops`, `/rops/innowacje`, `/logowanie` w trzech trybach: **375 px**, **320 px** oraz **375 px z tekstem 200%**. Zero elementów wychodzących poza szerokość okna; sprawdzone także z wyrenderowanymi wynikami matchmakingu.
- **Klawiatura**: pierwszy `Tab` trafia na „Przejdź do treści”, `Enter` przenosi fokus na `#main-content`. Wszystkie 14 elementów w kolejności `Tab` na stronie głównej ma widoczny wskaźnik fokusu. Pełna ścieżka wyłącznie klawiaturą: opis → wyniki → rozwinięcie „Plan adaptacji” przez `Enter` → wygenerowany plan. Po sukcesie fokus ląduje na nagłówku wyników.
- **Stan „szukamy”**: przycisk `disabled`, `aria-busy="true"`, pole `readOnly`, komunikat w `role="status"`. Podwójne wysłanie zablokowane — przy wstrzymanym żądaniu `Enter` w polu i `form.requestSubmit()` dały **1 żądanie**.
- **Błąd sieci** (backend nieuruchomiony): „Nie udało się połączyć z usługą…”, stan ładowania zakończony, wpisana treść zachowana (109 znaków), pole znów edytowalne, ponowienie możliwe.
- **Timeout**: matchmaking i katalog kończą się po **20 s** czytelnym komunikatem i przyciskiem ponowienia; treść zachowana.
- **Brak wyników**: porada `no_match_advice` z backendu, kategorie tematyczne i dalsze kroki; nie podstawiamy własnej interpretacji.
- **Katalog `/baza-wiedzy`**: pusty katalog, błąd API z „Ponów wczytanie katalogu” (ponowienie zakończone sukcesem w drugim żądaniu), timeout 20 s, częściowa awaria kolejnej strony zachowuje już pobrane rekordy.
- **Pochodzenie planu adaptacji** — trzy rozłączne stany renderowane poprawnie: „Treść wygenerowana przez AI” (`is_ai_generated: true`, `gemini`), „Szablon awaryjny, nie AI” (`false`, `template_fallback`) oraz „Źródło planu niepotwierdzone” przy braku metadanej. Brak metadanych nie jest przedstawiany jako wynik AI.
- **Brama ROPS**: `/rops` bez logowania pokazuje formularz logowania, nie ujawnia zgłoszeń, `robots: noindex, nofollow`.
- **Publiczne HTTPS z backendem na localhost**: aplikacja z builda produkcyjnego, podana pod origin `https://`, pokazuje komunikat o błędzie konfiguracji, **0** prób żądania do localhost, zachowaną treść i aktywny przycisk.
- `axe-core` 4.10.2, zestawy `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`: **0 naruszeń** na siedmiu trasach przy 375 px. To jeden sygnał, **nie** deklaracja zgodności WCAG — axe nie ocenia stanów `disabled`, sensu komunikatów ani ścieżek dynamicznych, które sprawdzono ręcznie powyżej.

### 5.3. Online, z prawdziwym backendem i Supabase

**Nie wykonano — brak publicznego demo** (sekcja 1). Niesprawdzone pozostają: problem → wyniki → plan adaptacji → zapis fiszki → odczyt po odświeżeniu → odpowiedź ROPS → odczyt przez autora, logowanie i powrót na publicznym adresie, odmowa dostępu autora do panelu ROPS na prawdziwych rolach oraz publikacja innowacji bez odświeżania strony. Nowe dane z tego scenariusza należy oznaczyć jako testowe.

## 6. Granice tej pracy

Nie wykonano `reset`, automatycznego `stash` ani `force push`. Nie zmieniano backendu, SQL, RLS, migracji ani ustawień Supabase. Nie dodano bibliotek do `package.json` (Playwright, axe-core i pngjs użyto wyłącznie w katalogu tymczasowym sesji, poza repozytorium). Nie dodano przycisków A/A+/kontrast — nie są dowodem zgodności WCAG i nie zastępują napraw rzeczywistych problemów. Nie rozpoczęto etapu 6 ani redesignu. Odłożony audyt pozostaje odłożony.

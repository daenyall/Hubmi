# HubMI – Kompletny Pakiet Zgłoszeniowy (Opis Techniczny, Prezentacja, Kosztorys)

> Oficjalny dokument zgłoszeniowy projektu **HubMI – Małopolski Ekosystem Innowacji Społecznych** dla Regionalnego Ośrodka Polityki Społecznej w Krakowie (HackYeah 2026).
> Gotowy do wklejenia w formularz zgłoszeniowy na platformie oraz wykorzystania podczas prezentacji.

---

## 1. Metryka i Nazwa Projektu

- **Nazwa projektu**: **HubMI – Małopolski Cyfrowy Ekosystem Innowacji Społecznych**
- **Wyzwanie**: Regionalny Ośrodek Polityki Społecznej w Krakowie (ROPS Kraków) / Województwo Małopolskie
- **Kategoria**: Innowacje Społeczne & GovTech z AI
- **Repozytorium GitHub**: [https://github.com/daenyall/Hubmi](https://github.com/daenyall/Hubmi)
- **Działające Demo API (Publiczny HTTPS)**: [https://blocking-suspension-tractor-samuel.trycloudflare.com](https://blocking-suspension-tractor-samuel.trycloudflare.com)
- **Interaktywna dokumentacja Swagger**: [https://blocking-suspension-tractor-samuel.trycloudflare.com/docs](https://blocking-suspension-tractor-samuel.trycloudflare.com/docs)
- **Status testów automatycznych**: **215/215 testów zdanych (100% pass)**

---

## 2. Zwięzły Opis Projektu (Lead / Teaser do Formularza)

> **HubMI** to inteligentna platforma nowej generacji łącząca mieszkańców, organizacje pozarządowe i małopolskie samorządy z bazą sprawdzonych innowacji społecznych ROPS Kraków. Wykorzystując model wektorowy **1536D pgvector** oraz **Google Gemini AI**, HubMI natychmiast tłumaczy naturalny opis życiowej potrzeby mieszkańca (np. samotność seniora, bariery architektoniczne) na gotowe rozwiązania, generując dynamiczne uzasadnienia relevancji. Dodatkowo wbudowany **Middleman AI** automatycznie tworzy dla gmin i CUS gotowe, 6-sekcyjne plany wdrożenia innowacji uwzględniające lokalne zasoby (OSP, KGW, CUS), standardy dostępności WCAG 2.1 AA oraz małopolskie źródła grantowe (FERS, PFRON, mikrogranty ROPS). Całość działa w architekturze Zero-Trust (PostgreSQL RLS) przy koszcie eksploatacji zaledwie **~200–360 PLN/miesięcznie**.

---

## 3. Pełny Opis Techniczny Rozwiązania (Dla Jury Technicznego)

### 3.1. Architektura Hybrydowa i Komponenty
1. **Frontend (Next.js 15 App Router & Tailwind CSS & shadcn/ui)**:
   - Dostępność cyfrowa **WCAG 2.1 AA**: pełna obsługa klawiatury, wysoki kontrast, semantic HTML, brak barier dla osób starszych i słabowidzących.
   - Płynna integracja z bazą przez `@supabase/ssr` oraz dedykowany fallback resilience w przypadku niedostępności sieci.
2. **Backend (FastAPI & Python 3.12+)**:
   - Lekkie, wysoce skalowalne mikroserwisy asynchroniczne zintegrowane z Pydantic v2 i OpenAPI.
   - Wbudowany rate limiter (60 req/min) chroniący przed przeciążeniami i atakami DDoS.
   - Pełna separacja środowiskowa CORS (wsparcie dla Vercel, Render i Cloudflare Tunnel).
3. **Baza Danych i Wektory (Supabase PostgreSQL 15 & pgvector)**:
   - Hybrydowe wyszukiwanie wektorowe oparte o przestrzeń cosinusową 1536D (`gemini-embedding-2`).
   - Rygorystyczna ochrona danych **Row Level Security (RLS)**: niezweryfikowane szkice innowacji i prywatne dane autorów fiszek są fizycznie niewidoczne dla zapytań publicznych.

### 3.2. Silnik Sztucznej Inteligencji – Koniec z "Ifologią"
- **Arbitraż i Ocena Intencji (`evaluate_query_with_gemini`)**:
  Zamiast sztywnych wyrażeń regularnych, każde zapytanie jest ewaluowane przez **Google Gemini 3.5 Flash Lite**. Model odróżnia przypadkowy keyboard-mash (`awdawdawdawd`) i spam od realnych problemów społecznych, automatycznie dobierając kategorie tematyczne ROPS i formułując empatyczne porady.
- **Dynamiczne Uzasadnienia Dopasowań (`tailor_relevance_with_gemini`)**:
  Dla każdej znalezionej innowacji Gemini analizuje w locie wpisany problem i generuje zwięzłe zdanie wyjaśniające, w jaki sposób to konkretne rozwiązanie odpowiada na sytuację mieszkańca.
- **Asystent Adaptacji Społecznej (Middleman AI)**:
  Generuje profesjonalny plan wdrożenia innowacji dla samorządu:
  1. Diagnoza i role partnerów lokalnych (np. OSP jako transport, KGW jako animacja, CUS jako koordynacja).
  2. 3-etapowy harmonogram (przygotowanie, pilotaż, ewaluacja).
  3. Tabela kosztorysowa pilotażu (Markdown).
  4. Regionalne źródła finansowania (ROPS Kraków, FERS, PFRON, Fundusze Sołeckie).
  5. Standardy włączenia i dostępności (teksty łatwe do czytania ETR, asystentura).
  6. Wskaźniki sukcesu (KPI) dla ewaluacji przez ROPS.

---

## 4. Szacowany Koszt Utrzymania i Wymagane Zasoby (Kryterium Formalne)

Wdrożenie regionalne dla Małopolski (10 000 – 30 000 zapytań mieszkańców/miesiąc):

| Pozycja | Dostawca | Rekomendowany Plan | Koszt Miesięczny (PLN) |
| :--- | :--- | :--- | :---: |
| **Baza Wektorowa i Relacyjna** | Supabase Cloud | Plan Pro (pgvector, backup dzienny, RLS) | ~100 PLN ($25) |
| **Modele Wektoryzacji i Klasyfikacji** | Google Gemini API | gemini-embedding-2 & gemini-3.5-flash-lite | ~40 – 80 PLN ($10–$20) |
| **Middleman AI (Plany Adaptacji)** | Google Gemini API | gemini-3.5-flash (faza pilotaży) | ~30 – 60 PLN ($8–$15) |
| **Hosting API Backend** | Google Cloud Run / Render | 1 vCPU, 1 GB RAM (auto-scaling 1-3) | ~30 – 60 PLN ($7–$15) |
| **Hosting Frontend** | Vercel / Cloudflare Pages | Plan Standard / CDN Warszawa | 0 – 60 PLN |
| **SUMA MIESIĘCZNA** | | **Kompletny ekosystem regionalny HubMI** | **~200 – 360 PLN netto / mies.** |

- **Zasoby ludzkie**: 0 dedykowanych administratorów DevOps – architektura w pełni zarządzana (serverless / managed).
- **Roczny koszt eksploatacji**: poniżej **4 500 PLN brutto** (mieści się w bieżących wydatkach biurowych JST).

---

## 5. Scenariusz 3-Minutowego Filmu Wideo (Dla Próby o 07:15)

- **0:00 – 0:35 | Wstęp i Problem**:
  *„W Małopolsce setki wspaniałych innowacji społecznych wypracowanych przez ROPS trafia na półki, a mieszkańcy gmin wciąż mierzą się z samotnością seniorów czy wykluczeniem transportowym. Przedstawiamy HubMI – cyfrowy most łączący potrzeby Małopolan z gotowymi rozwiązaniami.”*
- **0:35 – 1:20 | Matchmaking Społeczny w Akcji**:
  Wpisujemy na żywo: *„W naszej gminie osoby starsze mieszkające samotnie rzadko wychodzą z domu. Szukamy sposobu na regularne spotkania i wsparcie.”*
  *Pokazujemy*: Błyskawiczny wynik AI, score >0.92, spersonalizowane `why_relevant` dopasowane do seniorów. Pokazujemy odporność na bełkot (`awdawd`) – Gemini kulturalnie doradza.
- **1:20 – 2:05 | Middleman AI dla Samorządów**:
  Kliknięcie *„Zaadaptuj innowację dla mojej gminy”*. Wybieramy gminę wiejską, budżet 20 tys. PLN.
  *Pokazujemy*: Gotowy plan z udziałem OSP (transport) i KGW (animacja), tabelę kosztów, standard ETR i granty ROPS.
- **2:05 – 2:40 | Kreator Fiszki i Panel ROPS**:
  Wypełnienie prostej fiszki pomysłu. Przejście do panelu pracownika ROPS (`/panel`).
  *Pokazujemy*: Fiszka pojawia się natychmiast, pracownik ROPS zatwierdza status i wysyła oficjalną odpowiedź do mieszkańca.
- **2:40 – 3:00 | Podsumowanie i Koszty**:
  *„HubMI to 215 testów automatycznych, pełne bezpieczeństwo RLS i koszt wdrożenia poniżej 350 PLN miesięcznie. Gotowe do pilotażu w Małopolsce od zaraz!”*

---

## 6. Prezentacja 10 Slajdów (Struktura do PDF)

1. **Slajd 1**: Tytuł projektu, HubMI – Małopolski Cyfrowy Ekosystem Innowacji Społecznych ROPS Kraków.
2. **Slajd 2**: Diagnoza wyzwania – luka pomiędzy bazą innowacji ROPS a realnymi potrzebami w małych gminach Małopolski.
3. **Slajd 3**: Nasza odpowiedź – HubMI: inteligentny matchmaking, Middleman AI i bezpieczna platforma komunikacji.
4. **Slajd 4**: Silnik Matchmakingu AI – pgvector 1536D + Google Gemini arbitraż intencji + dynamiczne uzasadnienia relevancji.
5. **Slajd 5**: Middleman Innowacji – asystent adaptacji dla samorządów (włączający OSP, KGW i CUS, z kosztorysem i KPI).
6. **Slajd 6**: Kreator Pomysłów i Zasobnik Wiedzy – metodyka Social Innovation Canvas ROPS i bezpieczne fiszki zgłoszeń.
7. **Slajd 7**: Obieg Sprawy i Panel ROPS – dwustronny kanał komunikacji, powiadomienia i moderacja bazy wiedzy.
8. **Slajd 8**: Architektura Techniczna i Bezpieczeństwo – Next.js 15, FastAPI, Supabase RLS Zero-Trust, 215 testów (100% pass).
9. **Slajd 9**: Kosztorys Regionalny i Skalowalność – analiza TCO: ~200-360 PLN/miesięcznie, brak narzutu DevOps.
10. **Slajd 10**: Zespół i Gotowość Wdrożeniowa – działające demo online, link do repozytorium, zaproszenie do pilotażu w ROPS.

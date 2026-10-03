# Szacunek Kosztów Utrzymania Systemu HubMI (TCO — Total Cost of Ownership)
**Instytucja docelowa:** Regionalny Ośrodek Polityki Społecznej w Krakowie (ROPS Kraków)  
**Horyzont czasowy kalkulacji:** 12 miesięcy (1 rok eksploatacji produkcyjnej)  
**Skala operacyjna:** Obsługa 182 gmin i 22 powiatów Województwa Małopolskiego (~3.4 mln mieszkańców)  
**Wymóg formalny:** Regulamin HackYeah 2026 §4 ust. 9 (Wycena TCO i zasobów)

---

## 1. Założenia Wolumetryczne (Roczna Skala Użytkowania)

* **Liczba zapytań o matchmaking problemów społecznych:** ~60 000 zapytań rocznie (~5 000 miesięcznie).
* **Liczba wygenerowanych planów adaptacji Middleman AI:** ~2 400 planów rocznie (~200 miesięcznie).
* **Liczba złożonych fiszek innowacji społecznych:** ~1 200 fiszek rocznie (~100 miesięcznie).
* **Liczba zgłoszeń testowania w gminach (pilotaże):** ~300 aplikacji rocznie.
* **Aktywne sesje urzędników i innowatorów:** ~150 stałych kont instytucjonalnych (CUS, OPS, JST, NGO).

---

## 2. Zestawienie Kosztów Infrastruktury Chmurowej (Cloud & SaaS)

| Pozycja kosztowa | Dostawca / Usługa | Parametry techniczne | Koszt miesięczny (USD / PLN) | Koszt roczny (PLN netto) |
| :--- | :--- | :--- | :---: | :---: |
| **Baza Relacyjna & pgvector** | Supabase Pro / Team | Dedykowana instancja Postgres, rozszerzenie pgvector, 8 GB RAM, 100 GB storage, PITR backup 7 dni | $59 / ~235 PLN | 2 820 PLN |
| **Backend API & Silnik AI** | Render / Railway / Hetzner Cloud | Kontenery Docker FastAPI (2x vCPU, 4 GB RAM, High-Availability, autoscaling) | $45 / ~180 PLN | 2 160 PLN |
| **Frontend & CDN Edge** | Vercel Pro (Team) | Globalny CDN Edge, wsparcie Next.js 16 SSR/ISR, nielimitowany transfer, ochrona DDoS | $40 / ~160 PLN | 1 920 PLN |
| **Poczta Transakcyjna & Webhooki** | Resend / SendGrid Pro | Powiadomienia e-mail dla autorów i ROPS (do 50 000 wysyłek miesięcznie) | $20 / ~80 PLN | 960 PLN |
| **Monitoring & Logi** | Sentry Team + BetterStack | APM, monitorowanie błędów w czasie rzeczywistym, SLA 99.9% uptime | $26 / ~105 PLN | 1 260 PLN |
| **SUMA INFRASTRUKTURY** | — | — | **~760 PLN / mies.** | **9 120 PLN / rok** |

---

## 3. Koszty Modeli Sztucznej Inteligencji (AI API Inference)

Architektura HubMI wykorzystuje wysoce zoptymalizowane modele o najniższym koszcie tokena na rynku:
1. **Wyszukiwanie semantyczne (Embeddings)**: `text-embedding-3-small` (OpenAI) – koszt $0.02 za 1 mln tokenów.
2. **Asystent Middleman AI (Generacja planu)**: `gemini-1.5-flash` / `gpt-4o-mini` – koszt średnio $0.15 za 1 mln tokenów wejściowych i $0.60 za 1 mln tokenów wyjściowych.

| Operacja AI | Liczba wywołań rocznie | Zużycie tokenów | Koszt jednostkowy | Koszt roczny (PLN netto) |
| :--- | :---: | :---: | :---: | :---: |
| **Indeksowanie bazy innowacji** | 200 innowacji x 5 wersji | ~500 000 tokenów | $0.02 / 1M | ~0.05 PLN |
| **Wyszukiwanie (Matchmaking)** | 60 000 zapytań | ~6 000 000 tokenów | $0.02 / 1M | ~0.50 PLN |
| **Generowanie planów adaptacji** | 2 400 planów | ~12 000 000 tokenów | $0.60 / 1M | ~30.00 PLN |
| **Bufor na wzrost zapotrzebowania** | Zapas 10x | — | — | ~300.00 PLN |
| **SUMA MODELI AI** | — | — | — | **~330 PLN / rok** |

*(Dzięki zastosowaniu wektorów 1536D i modeli typu Flash/Mini koszty generatywne są marginalne i wynoszą poniżej 1 zł dziennie!)*

---

## 4. Koszty Obsługi Technicznej, Wsparcia i Utrzymania (SLA)

| Zakres usługi | Częstotliwość | Zakres prac | Koszt roczny (PLN netto) |
| :--- | :---: | :--- | :---: |
| **Utrzymanie bieżące & SLA (L1/L2)** | Miesięcznie | Nadzór nad dostępnością 99.5%, aktualizacje bibliotek, łaty bezpieczeństwa | 14 400 PLN (1 200 PLN/msc) |
| **Audyt Dostępności WCAG 2.1 AA** | Raz w roku | Certyfikowany audyt zgodności z ustawą o dostępności cyfrowej stron instytucji publicznych | 3 500 PLN |
| **Audyt Bezpieczeństwa & RODO** | Raz w roku | Weryfikacja polityk RLS, testy penetracyjne API, audyt ochrony danych osobowych | 4 500 PLN |
| **SUMA WSPARCIA I AUDYTÓW** | — | — | **22 400 PLN / rok** |

---

## 5. Podsumowanie Całkowitego Kosztu Posiadania (TCO)

| Kategoria wydatków | Koszt roczny (PLN netto) | Udział w budżecie |
| :--- | :---: | :---: |
| 1. Infrastruktura chmurowa (Baza, Backend, Frontend) | **9 120 PLN** | 28.6% |
| 2. Licencje modeli sztucznej inteligencji (AI API) | **330 PLN** | 1.0% |
| 3. Wsparcie techniczne, SLA, audyty WCAG i bezpieczeństwa | **22 400 PLN** | 70.4% |
| **ŁĄCZNY KOSZT ROCZNY TCO (I ROK)** | **31 850 PLN netto** | **100%** |
| **Średni miesięczny koszt utrzymania** | **~2 650 PLN netto / miesiąc** | — |

---

## 6. Efektywność Finansowa (Wskaźnik ROI dla Województwa)

* **Oszczędność czasu urzędników ROPS**: Automatyzacja wstępnej kwalifikacji problemów i kojarzenia z innowacjami oszczędza szacunkowo ~600 roboczogodzin rocznie (~45 000 PLN wartości pracy zespołu).
* **Wyższy wskaźnik absorpcji funduszy FERS**: Gotowe plany adaptacji innowacji dla samorządów (Middleman AI) ułatwiają małopolskim gminom pozyskiwanie grantów testujących z puli regionalnej.
* **Ekonomia skali**: Koszt wdrożenia i utrzymania rozwiązania (31.8k PLN rocznie) stanowi promil budżetu regionalnych programów społecznych, zapewniając cyfryzację całego ekosystemu innowacji Małopolski.

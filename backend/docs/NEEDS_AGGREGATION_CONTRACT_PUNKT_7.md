# Propozycja Kontraktu: Moduł Zbierania Potrzeb i Agregacji Regionalnej (Punkt 7 Audytu)

**Dokument roboczy dla Osoby B (Frontend / Daniel) oraz Osoby A (Backend / Supabase)**  
**Projekt:** HubMI — Małopolski Inkubator Innowacji Społecznych ROPS Kraków  
**Status:** Propozycja architektoniczna i kontrakt API do uzgodnienia (Wersja MVP)

---

## 1. Cel i Uzasadnienie Biznesowe (Wyzwanie ROPS Kraków)

Regionalny Ośrodek Polityki Społecznej w Krakowie pełni rolę koordynatora i animatora innowacji społecznych w całym województwie małopolskim. Aby skutecznie kierować granty testujące, planować nabory w Inkubatorze oraz wspierać deinstytucjonalizację usług, ROPS potrzebuje **agregacji oddolnych potrzeb zgłaszanych przez jednostki samorządu terytorialnego (gminy, CUS, OPS, PCPR) oraz organizacje pozarządowe**.

### Kluczowe cele modułu:
1. **Identyfikacja „białych plam”**: Wykrywanie problemów społecznych, dla których w portfolio ROPS nie ma jeszcze sprawdzonych innowacji.
2. **Klastrowanie potrzeb**: Łączenie samorządów borykających się z analogicznymi wyzwaniami (np. wykluczenie transportowe seniorów na terenach górskich).
3. **Decyzje oparte na danych (Data-driven ROPS)**: Dostarczanie kadrze ROPS gotowych zestawień ilościowych i jakościowych do projektowania naborów FERS / PFRON.

---

## 2. Źródła Danych (Data Ingestion)

Moduł agreguje dane z trzech źródeł:
1. **Dedykowany formularz zgłoszenia potrzeby lokalnej** (`POST /api/needs`) – proste zgłoszenie wyzwania przez gminę/NGO (bez konieczności posiadania gotowego pomysłu na innowację).
2. **Istniejące fiszki wyzwań** (`submissions`) – odfiltrowane rekordy na etapie `pomysl` lub `diagnoza_potrzeb`.
3. **Analiza zapytań bez dopasowań** (`unmatched_queries`) – zanonimizowane trendy z wyszukiwarki semantycznej (gdy użytkownicy szukają rozwiązań, których brak w katalogu ROPS).

---

## 3. Schemat Bazy Danych (Supabase DDL)

```sql
-- Tabela potrzeb i wyzwań regionalnych zgłaszanych przez samorządy i NGO
CREATE TABLE public.community_needs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Dane jednostki zgłaszającej
    institution_name TEXT NOT NULL,
    institution_type TEXT NOT NULL DEFAULT 'JST', -- 'JST', 'CUS', 'OPS', 'NGO', 'Mieszkaniec'
    powiat TEXT NOT NULL,                         -- np. 'krakowski', 'tarnowski', 'nowosądecki'
    gmina TEXT,                                  -- np. 'Wieliczka', 'Skała'
    contact_email TEXT,                          -- opcjonalne (zabezpieczone RLS)
    
    -- Treść wyzwania
    category TEXT NOT NULL,                       -- np. 'Seniorzy', 'Zdrowie psychiczne', 'Dostępność'
    target_group TEXT NOT NULL,                  -- np. 'Młodzież 13-18 lat', 'Seniorzy 75+'
    problem_summary TEXT NOT NULL,               -- Krótki tytuł/teza problemu (max 200 znaków)
    detailed_description TEXT NOT NULL,          -- Szczegółowy opis luki w usługach
    estimated_affected_count INT DEFAULT 0,      -- Szacunkowa liczba osób dotkniętych problemem
    urgency_level TEXT DEFAULT 'sredni',         -- 'niski', 'sredni', 'wysoki', 'krytyczny'
    
    -- Status procesowania przez ROPS (widok admina)
    status TEXT NOT NULL DEFAULT 'nowe',         -- 'nowe', 'analizowane', 'uwzglednione_w_naborze', 'zaadresowane'
    rops_internal_notes TEXT                     -- Notatki analityczne koordynatora ROPS
);

-- RLS: Publiczny zapis (INSERT), odczyt i modyfikacja WYŁĄCZNIE dla ROPS Admin
ALTER TABLE public.community_needs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public insert community needs"
ON public.community_needs FOR INSERT TO public
WITH CHECK (true);

CREATE POLICY "ROPS Admin full management on community needs"
ON public.community_needs FOR ALL TO authenticated, service_role
USING (
    auth.role() = 'service_role'
    OR (COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin')
)
WITH CHECK (
    auth.role() = 'service_role'
    OR (COALESCE(auth.jwt()->'app_metadata'->>'hubmi_role', '') = 'rops_admin')
);
```

---

## 4. Kontrakt API (REST)

### 4.1. Publiczne zgłoszenie potrzeby przez Samorząd / CUS / NGO
`POST /api/needs`  
**Dostęp:** Publiczny (z ochroną przed spamem i walidacją długości)

**Payload żądania:**
```json
{
  "institution_name": "Centrum Usług Społecznych w Myślenicach",
  "institution_type": "CUS",
  "powiat": "myślenicki",
  "gmina": "Myślenice",
  "contact_email": "kontakt@cus.myslenice.pl",
  "category": "Zdrowie psychiczne",
  "target_group": "Młodzież w wieku 12-19 lat z terenów wiejskich",
  "problem_summary": "Brak mobilnego wsparcia psychotraumatologicznego po sytuacjach kryzysowych",
  "detailed_description": "Na terenie 14 sołectw obserwujemy wzrost stanów lękowych i depresyjnych wśród młodzieży szkolnej. Dojazd do poradni w Krakowie jest barierą finansową i logistyczną dla rodzin ubogich.",
  "estimated_affected_count": 80,
  "urgency_level": "wysoki"
}
```

**Odpowiedź (201 Created):**
```json
{
  "id": "7f9c8d5a-4b2e-4b67-91a3-112233445566",
  "status": "nowe",
  "message": "Potrzeba została pomyślnie zarejestrowana i przekazana do analizy regionalnej ROPS Kraków."
}
```

---

### 4.2. Panel Agregacji dla ROPS: Podsumowanie Zagregowane
`GET /api/admin/needs/summary`  
**Dostęp:** Wymaga roli `rops_admin` (`X-Admin-Role: rops_admin` lub token JWT z `hubmi_role: rops_admin`).

**Przykładowa odpowiedź (200 OK):**
```json
{
  "total_needs_reported": 42,
  "needs_by_status": {
    "nowe": 12,
    "analizowane": 18,
    "uwzglednione_w_naborze": 8,
    "zaadresowane": 4
  },
  "top_categories": [
    { "category": "Zdrowie psychiczne", "count": 16, "percentage": 38.1 },
    { "category": "Seniorzy", "count": 13, "percentage": 31.0 },
    { "category": "Dostępność", "count": 8, "percentage": 19.0 },
    { "category": "Włączenie cyfrowe", "count": 5, "percentage": 11.9 }
  ],
  "top_powiats": [
    { "powiat": "tarnowski", "count": 9 },
    { "powiat": "nowosądecki", "count": 8 },
    { "powiat": "krakowski", "count": 7 },
    { "powiat": "myślenicki", "count": 5 }
  ],
  "emerging_hotspots": [
    {
      "theme": "Kryzys psychiczny dzieci i młodzieży na obszarach wiejskich",
      "reported_count": 7,
      "recommended_action": "Rekomendowane ogłoszenie ścieżki grantowej w naborze inkubatora 2026/2027"
    },
    {
      "theme": "Wykluczenie transportowe osób 80+ z dostępem do POZ/CUS",
      "reported_count": 6,
      "recommended_action": "Rekomendowane upowszechnienie innowacji 'Mobilny Punkt Usług Społecznych' (inv_06)"
    }
  ]
}
```

---

### 4.3. Panel Agregacji dla ROPS: Lista i Filtrowanie Szczegółowe
`GET /api/admin/needs?powiat=tarnowski&category=Seniorzy&status=nowe&limit=20`  
**Dostęp:** Wymaga roli `rops_admin`.

**Zwraca:** Ustrukturyzowaną listę rekordów wraz z danymi kontaktowymi koordynatorów gminnych do podjęcia dialogu.

---

### 4.4. Zarządzanie Statusem i Notatką ROPS
`PATCH /api/admin/needs/{id}/status`  
**Dostęp:** Wymaga roli `rops_admin`.

**Payload żądania:**
```json
{
  "status": "uwzglednione_w_naborze",
  "rops_internal_notes": "Włączono do założeń naboru grantów testujących FERS 2026/Q4. Koordynator CUS zaproszony na grupę roboczą."
}
```

---

## 5. Rekomendacja wdrożeniowa

- **Faza bieżąca (przed Okienkiem C):** Niniejszy kontrakt stanowi uzgodnioną specyfikację techniczną. Kod backendowy i migracja mogą zostać wdrożone natychmiast po akceptacji ze strony Daniela.
- **Frontend (Zakres B):** Prosty widok tabelaryczno-wykresowy w sekcji `/admin/potrzeby-regionalne` prezentujący powyższe wskaźniki (kategorie, powiaty, hotspoty).

"""
Oficjalna 5-slajdowa prezentacja techniczna dla Jury HackYeah 2026.
Projekt: Splot — Małopolski Hub Innowacji Społecznych
Wyzwanie: Regionalny Ośrodek Polityki Społecznej w Krakowie (ROPS Kraków)
Autorzy: Radosław Basta & Daniel Bałuszyński
Format: 16:9 (960 x 540 pt)
"""

import sys
import textwrap
from reportlab.lib import colors  # type: ignore
from reportlab.lib.colors import HexColor  # type: ignore
from reportlab.pdfbase import pdfmetrics  # type: ignore
from reportlab.pdfbase.ttfonts import TTFont  # type: ignore
from reportlab.pdfgen import canvas  # type: ignore

# Czcionki z polskimi znakami
FONT_REGULAR = "Arial"
FONT_BOLD = "Arial-Bold"
FONT_ITALIC = "Arial-Italic"

pdfmetrics.registerFont(TTFont("Arial", "/System/Library/Fonts/Supplemental/Arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Italic", "/System/Library/Fonts/Supplemental/Arial Italic.ttf"))

# Paleta instytucjonalna ROPS Kraków / Splot
PRIMARY = HexColor("#176348")       # Głęboka zieleń ROPS
PRIMARY_DARK = HexColor("#0F3D2E")  # Ciemna zieleń nagłówkowa
PRIMARY_LIGHT = HexColor("#EAF2ED") # Jasne tło akcentowe
SECONDARY = HexColor("#2D7A5B")     # Zieleń pomocnicza
BG_PAGE = HexColor("#F5F7F5")       # Tło strony
BG_CARD = HexColor("#FFFFFF")       # Białe tło kart
TEXT_MAIN = HexColor("#19352B")     # Tekst główny
TEXT_MUTED = HexColor("#52655C")    # Tekst pomocniczy
ACCENT_GOLD = HexColor("#D97706")   # Złoty akcent grantów
BORDER = HexColor("#D6E0D9")        # Ramka kart
BORDER_MUTED = HexColor("#E2E8E4")  # Delikatna linia
SUCCESS = HexColor("#16A34A")       # Zielony wskaźnik
CARD_DARK = HexColor("#142E25")     # Ciemna belka wyróżniająca

WIDTH = 960
HEIGHT = 540


class SlideDeck:
    def __init__(self, filename):
        self.filename = filename
        self.c = canvas.Canvas(filename, pagesize=(WIDTH, HEIGHT))
        self.total_slides = 5

    def start_slide(self, title, category_tag, slide_num):
        # Tło
        self.c.setFillColor(BG_PAGE)
        self.c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)

        # Górny akcent kolorystyczny (belka 6pt)
        self.c.setFillColor(PRIMARY)
        self.c.rect(0, HEIGHT - 6, WIDTH, 6, fill=1, stroke=0)

        # Kategoria slajdu (Pill badge)
        self.c.setFillColor(PRIMARY_LIGHT)
        badge_w = self.c.stringWidth(category_tag.upper(), FONT_BOLD, 9) + 24
        self.c.roundRect(40, HEIGHT - 46, badge_w, 22, 6, fill=1, stroke=0)
        self.c.setFont(FONT_BOLD, 9)
        self.c.setFillColor(PRIMARY)
        self.c.drawString(52, HEIGHT - 38, category_tag.upper())

        # Tytuł główny slajdu
        self.c.setFont(FONT_BOLD, 19)
        self.c.setFillColor(PRIMARY_DARK)
        self.c.drawString(40, HEIGHT - 76, title)

        # Numer slajdu w prawym górnym rogu
        self.c.setFont(FONT_BOLD, 10)
        self.c.setFillColor(TEXT_MUTED)
        self.c.drawRightString(WIDTH - 40, HEIGHT - 38, f"SLAJD {slide_num} / {self.total_slides}")

        # Dolna linia stopki
        self.c.setStrokeColor(BORDER)
        self.c.setLineWidth(1)
        self.c.line(40, 32, WIDTH - 40, 32)

        # Treść stopki
        self.c.setFont(FONT_REGULAR, 8)
        self.c.setFillColor(TEXT_MUTED)
        self.c.drawString(40, 20, "Województwo Małopolskie · ROPS Kraków · HackYeah 2026 | Splot — Małopolski Hub Innowacji Społecznych")
        self.c.drawRightString(WIDTH - 40, 20, "Autorzy: Radosław Basta & Daniel Bałuszyński | Działające MVP online")

    def draw_card(self, x, y, w, h, bg_color=BG_CARD, border_color=BORDER, radius=8):
        self.c.setFillColor(bg_color)
        self.c.setStrokeColor(border_color)
        self.c.setLineWidth(1)
        self.c.roundRect(x, y, w, h, radius, fill=1, stroke=1)

    def draw_badge(self, x, y, text, bg=PRIMARY_LIGHT, text_color=PRIMARY, font_size=8, pad_x=8, pad_y=4):
        self.c.setFont(FONT_BOLD, font_size)
        text_w = self.c.stringWidth(text, FONT_BOLD, font_size)
        badge_w = text_w + pad_x * 2
        badge_h = font_size + pad_y * 2
        self.c.setFillColor(bg)
        self.c.roundRect(x, y - pad_y + 2, badge_w, badge_h, 4, fill=1, stroke=0)
        self.c.setFillColor(text_color)
        self.c.drawString(x + pad_x, y + 2, text)
        return badge_w

    def draw_check_icon(self, x, y, size=11, color=SUCCESS):
        self.c.saveState()
        self.c.setStrokeColor(color)
        self.c.setLineWidth(1.8)
        self.c.setLineCap(1)
        self.c.setLineJoin(1)
        self.c.line(x, y + size * 0.45, x + size * 0.35, y + size * 0.1)
        self.c.line(x + size * 0.35, y + size * 0.1, x + size * 0.95, y + size * 0.85)
        self.c.restoreState()

    def draw_multiline(self, x, y, text, font=FONT_REGULAR, size=8.5, color=TEXT_MUTED, width_chars=60, line_height=14):
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        lines = textwrap.wrap(text, width=width_chars)
        cur_y = y
        for line in lines:
            self.c.drawString(x, cur_y, line)
            cur_y -= line_height
        return len(lines)

    def end_slide(self):
        self.c.showPage()

    def save(self):
        self.c.save()


def build_presentation(output_pdf):
    deck = SlideDeck(output_pdf)

    # =========================================================================
    # SLAJD 1: TYTUŁOWY — PROJEKT, ZESPÓŁ I GŁÓWNE FAKTY
    # =========================================================================
    deck.c.setFillColor(PRIMARY_DARK)
    deck.c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)

    # Panel lewy dekoracyjny
    deck.c.setFillColor(PRIMARY)
    deck.c.rect(0, 0, 330, HEIGHT, fill=1, stroke=0)

    deck.c.setStrokeColor(HexColor("#1D543E"))
    deck.c.setLineWidth(1.5)
    deck.c.line(0, 110, 330, 110)
    deck.c.line(0, HEIGHT - 100, 330, HEIGHT - 100)

    # Główna karta biała po prawej
    deck.c.setFillColor(BG_PAGE)
    deck.c.roundRect(310, 26, WIDTH - 336, HEIGHT - 52, 12, fill=1, stroke=0)

    # Lewa kolumna: identyfikacja wyzwania
    deck.c.setFont(FONT_BOLD, 11)
    deck.c.setFillColor(HexColor("#A7F3D0"))
    deck.c.drawString(45, HEIGHT - 68, "HACKYEAH 2026")
    deck.c.setFont(FONT_REGULAR, 9)
    deck.c.setFillColor(HexColor("#D1FAE5"))
    deck.c.drawString(45, HEIGHT - 84, "Kraków · 3-4 października 2026")

    deck.c.setFont(FONT_BOLD, 12)
    deck.c.setFillColor(colors.white)
    deck.c.drawString(45, HEIGHT - 138, "ORGANIZATOR WYZWANIA:")
    deck.c.setFont(FONT_REGULAR, 10)
    deck.c.drawString(45, HEIGHT - 158, "Województwo Małopolskie")
    deck.c.drawString(45, HEIGHT - 174, "Regionalny Ośrodek")
    deck.c.drawString(45, HEIGHT - 190, "Polityki Społecznej w Krakowie")

    # Informacja o kategorii wyzwania
    deck.c.setFont(FONT_BOLD, 10.5)
    deck.c.setFillColor(HexColor("#A7F3D0"))
    deck.c.drawString(45, 230, "KATEGORIA ZADANIA:")
    deck.c.setFont(FONT_REGULAR, 9.5)
    deck.c.setFillColor(HexColor("#EAF2ED"))
    deck.c.drawString(45, 212, "GovTech & Pomoc Społeczna")
    deck.c.drawString(45, 196, "Innowacje dla Małopolski")

    deck.c.setFont(FONT_REGULAR, 8.5)
    deck.c.setFillColor(HexColor("#93C5FD"))
    deck.c.drawString(45, 54, "Demo: HTTPS Cloudflare + Vercel")
    deck.c.drawString(45, 41, "Repozytorium: github.com/daenyall/Hubmi")

    # Prawa strona - Tytuł i autorzy
    deck.c.setFont(FONT_BOLD, 11)
    deck.c.setFillColor(PRIMARY)
    deck.c.drawString(345, HEIGHT - 72, "MAŁOPOLSKI HUB INNOWACJI SPOŁECZNYCH")

    deck.c.setFont(FONT_BOLD, 42)
    deck.c.setFillColor(PRIMARY_DARK)
    deck.c.drawString(345, HEIGHT - 118, "Splot")

    deck.c.setFont(FONT_REGULAR, 11)
    deck.c.setFillColor(TEXT_MUTED)
    deck.c.drawString(345, HEIGHT - 142, "Zintegrowana platforma wymiany wiedzy, adaptacji innowacji")
    deck.c.drawString(345, HEIGHT - 158, "i kojarzenia potrzeb mieszkańców Małopolski ze sprawdzonymi rozwiązaniami")

    # Karta misji i założeń
    deck.draw_card(345, HEIGHT - 275, WIDTH - 390, 95, bg_color=PRIMARY_LIGHT, border_color=PRIMARY)
    deck.c.setFont(FONT_BOLD, 9.5)
    deck.c.setFillColor(PRIMARY)
    deck.c.drawString(365, HEIGHT - 198, "CEL PROJEKTU W RAMACH WYZWANIA ROPS:")
    deck.c.setFont(FONT_BOLD, 13)
    deck.c.setFillColor(PRIMARY_DARK)
    deck.c.drawString(365, HEIGHT - 220, "„Od empatii do technologii — realne wsparcie dla gmin, instytucji i mieszkańców”")
    deck.c.setFont(FONT_REGULAR, 9)
    deck.c.setFillColor(TEXT_MUTED)
    deck.c.drawString(365, HEIGHT - 242, "Połączenie diagnozy potrzeb społecznych, semantycznego matchmakingu AI,")
    deck.c.drawString(365, HEIGHT - 256, "automatycznego asystenta adaptacji lokalnej oraz generatora urzędowych wniosków grantowych.")

    # Karta Autorów
    deck.draw_card(345, 50, WIDTH - 390, 130, bg_color=BG_CARD, border_color=BORDER)
    deck.c.setFont(FONT_BOLD, 10)
    deck.c.setFillColor(PRIMARY)
    deck.c.drawString(365, 157, "AUTORZY PROJEKTU:")

    deck.c.setFont(FONT_BOLD, 10)
    deck.c.setFillColor(TEXT_MAIN)
    deck.c.drawString(365, 136, "• Radosław Basta")
    deck.c.setFont(FONT_REGULAR, 8.5)
    deck.c.setFillColor(TEXT_MUTED)
    deck.c.drawString(490, 136, "— Architektura backendu (FastAPI), AI (Gemini 1536D), Baza SQL (Supabase RLS), TCO")

    deck.c.setFont(FONT_BOLD, 10)
    deck.c.setFillColor(TEXT_MAIN)
    deck.c.drawString(365, 115, "• Daniel Bałuszyński")
    deck.c.setFont(FONT_REGULAR, 8.5)
    deck.c.setFillColor(TEXT_MUTED)
    deck.c.drawString(490, 115, "— Architektura frontendu (Next.js 16 App Router), UX/UI, Dostępność (WCAG 2.1 AA)")

    deck.draw_card(365, 62, WIDTH - 430, 36, bg_color=PRIMARY_LIGHT, border_color=PRIMARY)
    deck.draw_check_icon(378, 74, size=11, color=SUCCESS)
    deck.c.setFont(FONT_BOLD, 8.5)
    deck.c.setFillColor(PRIMARY_DARK)
    deck.c.drawString(396, 75, "Stan realizacji: Działająca produkcyjna integracja chmurowa · 314/314 testów przechodzi (100%)")

    deck.end_slide()

    # =========================================================================
    # SLAJD 2: MODUŁY I EKOSYSTEM PLATFORMY SPLOT
    # =========================================================================
    deck.start_slide("Architektura i Moduły Platformy Splot", "Zakres Merytoryczny", 2)

    deck.draw_card(40, 400, WIDTH - 80, 45, bg_color=PRIMARY_LIGHT, border_color=PRIMARY)
    deck.c.setFont(FONT_BOLD, 10)
    deck.c.setFillColor(PRIMARY_DARK)
    deck.c.drawString(55, 426, "KOMPLEKSOWY EKOSYSTEM WSPARCIA INNOWACJI SPOŁECZNYCH W REGIONIE:")
    deck.c.setFont(FONT_REGULAR, 8.5)
    deck.c.setFillColor(TEXT_MUTED)
    deck.c.drawString(55, 412, "Połączyliśmy wszystkie kluczowe elementy w jeden spójny obieg — od zgłoszenia potrzeby, przez dobór innowacji i testy, aż po wniosek o grant.")

    # 6 Kart Modułów w układzie 2x3 w naturalnym, luźniejszym tonie
    modules = [
        ("I. INTELIGENTNE DOPASOWANIE",
         "Opisujesz problem po swojemu, codziennym językiem. Silnik AI błyskawicznie dobiera sprawdzone innowacje z Małopolski i jasno wyjaśnia, jak mogą pomóc w Twojej okolicy."),
        ("II. PRAKTYCZNY ZASOBNIK WIEDZY",
         "15 rzetelnych innowacji ROPS Kraków, interaktywna mapa wyzwań dla regionu oraz proste materiały i dobre praktyki gotowe do wdrożenia od zaraz."),
        ("III. KREATOR POMYSŁÓW I GRANTY",
         "Wygodny formularz prowadzi za rękę z podpowiedziami z Canwy ROPS, a generator wniosków automatycznie wypełnia urzędowy Załącznik nr 3 (FERS/EFS+)."),
        ("IV. TESTOWANIE W GMINACH (PILOTAŻ)",
         "Każda gmina czy placówka może jednym kliknięciem zgłosić chęć przetestowania innowacji u siebie, sprawdzić ją w boju i dodać recenzję."),
        ("V. BEZPOŚREDNI CZAT Z ROPS",
         "Prosty, dwustronny kontakt z koordynatorem przy każdym zgłoszeniu. Szybkie odpowiedzi, zero urzędniczego gubienia pism i jasne ustalenia w jednym miejscu."),
        ("VI. PANEL DLA ZESPOŁU ROPS",
         "Przejrzysty pulpit koordynatora: szybki rzut oka na napływające pomysły, ocena wniosków grantowych, pilotaże i bieżące potrzeby Małopolski.")
    ]

    card_w = (WIDTH - 80 - 30) / 3
    card_h = 135

    for idx, (m_title, m_desc) in enumerate(modules):
        col = idx % 3
        row = idx // 3
        x = 40 + col * (card_w + 15)
        y = 250 - row * (card_h + 15)

        deck.draw_card(x, y, card_w, card_h)
        deck.c.setFont(FONT_BOLD, 9)
        deck.c.setFillColor(PRIMARY_DARK)
        deck.c.drawString(x + 12, y + card_h - 20, m_title)

        deck.draw_multiline(x + 12, y + card_h - 40, m_desc, width_chars=45, line_height=14)

    # Belka dolna: Moduł VII (Middleman AI)
    deck.draw_card(40, 50, WIDTH - 80, 44, bg_color=CARD_DARK, border_color=PRIMARY)
    deck.c.setFont(FONT_BOLD, 9.5)
    deck.c.setFillColor(HexColor("#A7F3D0"))
    deck.c.drawString(55, 71, "VII. ASYSTENT ADAPTACJI (MIDDLEMAN AI):")
    deck.c.setFont(FONT_REGULAR, 8.5)
    deck.c.setFillColor(colors.white)
    deck.c.drawString(335, 71, "Zamienia ogólny pomysł w konkretny plan działania dla gminy: dobiera partnerów (OSP, KGW), liczy budżet i wskazuje granty.")

    deck.end_slide()

    # =========================================================================
    # SLAJD 3: SZCZEGÓŁY AI — MATCHMAKING I MIDDLEMAN
    # =========================================================================
    deck.start_slide("Silnik AI: Wyszukiwanie Semantyczne i Asystent Adaptacji", "Technologia & AI", 3)

    # Karta lewa: Matchmaking wektorowy
    deck.draw_card(40, 50, 430, 395)
    deck.c.setFont(FONT_BOLD, 12)
    deck.c.setFillColor(PRIMARY_DARK)
    deck.c.drawString(60, 420, "1. MATCHMAKING SPOŁECZNY (WEKTORY 1536D)")

    match_details = [
        ("Model Wektorowy `gemini-embedding-2`",
         "1536-wymiarowe wektory znormalizowane L2. Model przetwarza opisy potrzeb w języku naturalnym, precyzyjnie rozpoznając specyfikę problemów społecznych."),
        ("Wyszukiwanie Hybrydowe w PostgreSQL (pgvector)",
         "Kalkulacja podobieństwa cosinusowego wzbogacona o leksykalne wagi kluczowe (kategoria, grupa docelowa, powiat), eliminując błędy czystego wektora."),
        ("Ochrona Przed Spamem i Bełkotem (`query_validator`)",
         "Analiza entropii tekstu odrzuca przypadkowe uderzenia w klawisze (`asdfgh`, `awdawd`), zwracając porady strukturalne zamiast halucynacji AI."),
        ("Uzasadnienie Dopasowania (Why Relevant)",
         "Algorytm generuje konkretne wyjaśnienie, w jaki sposób zidentyfikowana innowacja ROPS odpowiada na zdiagnozowaną potrzebę użytkownika.")
    ]
    cur_y = 385
    for title, desc in match_details:
        deck.c.setFont(FONT_BOLD, 9.5)
        deck.c.setFillColor(PRIMARY)
        deck.c.drawString(60, cur_y, f"•  {title}")
        deck.draw_multiline(72, cur_y - 14, desc, width_chars=58, line_height=13)
        cur_y -= 64

    # Karta prawa: Middleman AI
    deck.draw_card(490, 50, 430, 395, bg_color=PRIMARY_LIGHT, border_color=PRIMARY)
    deck.c.setFont(FONT_BOLD, 12)
    deck.c.setFillColor(PRIMARY_DARK)
    deck.c.drawString(510, 420, "2. MIDDLEMAN INNOWACJI (ASYSTENT ADAPTACJI)")

    middleman_details = [
        ("Adaptacja do Realiów Małej Gminy w 1.5 sekundy",
         "Model `gemini-3.5-flash-lite` przekształca teoretyczny opis innowacji w gotowy, praktyczny plan wdrożenia uwzględniający budżet i ograniczenia kadrowe."),
        ("Włączenie Zasobów Lokalnych (OSP, KGW, CUS)",
         "Plan operacyjny bazuje na istniejącej infrastrukturze: angażuje Ochotnicze Straże Pożarne, Koła Gospodyń Wiejskich i świetlice wiejskie."),
        ("Etapowy Kosztorys i Źródła Finansowania",
         "Struktura budżetu (pilotaż 3-5 tys. PLN, materiały, koordynacja) z przypisaniem do programów: Fundusz Sołecki, granty ROPS, FERS, PFRON."),
        ("Transparentność AI i Szablon Awaryjny",
         "Oznaczenie `is_ai_generated: true`, nota doradcza oraz certyfikowany szablon awaryjny działający w razie awarii sieci lub wyczerpania quota.")
    ]
    cur_y = 385
    for title, desc in middleman_details:
        deck.draw_check_icon(510, cur_y + 1, size=10, color=PRIMARY_DARK)
        deck.c.setFont(FONT_BOLD, 9.5)
        deck.c.setFillColor(PRIMARY_DARK)
        deck.c.drawString(524, cur_y + 2, title)
        deck.draw_multiline(524, cur_y - 14, desc, width_chars=58, line_height=13, color=TEXT_MAIN)
        cur_y -= 64

    deck.end_slide()

    # =========================================================================
    # SLAJD 4: DOSTĘPNOŚĆ CYFROWA (WCAG 2.1 AA) I GENERATOR WNIOSKÓW
    # =========================================================================
    deck.start_slide("Dostępność Cyfrowa (WCAG 2.1 AA) i Generator Wniosków FERS", "Dostępność & Finansowanie", 4)

    # Lewa kolumna: Dostępność Cyfrowa
    deck.draw_card(40, 50, 430, 395)
    deck.c.setFont(FONT_BOLD, 12)
    deck.c.setFillColor(PRIMARY_DARK)
    deck.c.drawString(60, 420, "STANDARD DOSTĘPNOŚCI CYFROWEJ WCAG 2.1 AA")

    a11y_points = [
        ("Kontrast Tekstu > 4.5:1 i Stany Nieaktywne",
         "Wszystkie elementy spełniają normy kontrastu. Dedykowany token `--primary-disabled: #4a7865` zapobiega nieczytelnym szarościom w trakcie operacji asynchronicznych."),
        ("Kompletna Nawigacja Klawiaturą",
         "100% interfejsu dostępne bez myszy. Wyraźny obrys `:focus-visible` (3px, offset 4px) oraz widoczny po naciśnięciu Tab skip-link `#main-content`."),
        ("Przyjazność dla Seniorów i Urządzeń Dotykowych",
         "Minimalne pole dotykowe 44x44 px (`min-h-11`) dla przycisków i linków. Płynne skalowanie fontu do 200% bez utraty zawartości i poziomego paska przewijania."),
        ("Semantyka HTML5 i Język Prosty (Plain Polish)",
         "Semantyczne tagi, atrybuty ARIA dla błędów formularzy (`aria-describedby`). Usunięcie żargonu technicznego na rzecz czytelnych pojęć społecznych.")
    ]
    cur_y = 385
    for title, desc in a11y_points:
        deck.c.setFont(FONT_BOLD, 9.5)
        deck.c.setFillColor(PRIMARY)
        deck.c.drawString(60, cur_y, f"•  {title}")
        deck.draw_multiline(72, cur_y - 14, desc, width_chars=58, line_height=13)
        cur_y -= 64

    # Prawa kolumna: Generator Wniosków Grantowych (Załącznik nr 3)
    deck.draw_card(490, 50, 430, 395, bg_color=PRIMARY_LIGHT, border_color=PRIMARY)
    deck.c.setFont(FONT_BOLD, 12)
    deck.c.setFillColor(PRIMARY_DARK)
    deck.c.drawString(510, 420, "GENERATOR WNIOSKÓW GRANTOWYCH (ZAŁĄCZNIK NR 3)")

    grant_points = [
        ("Odwzorowanie Urzędowego Formularza FERS/EFS+",
         "Zgodność ze wzorem `za._3._Formularz_aplikacyjny_wzor.pdf` ROPS Kraków: metryczka, diagnoza, grupa docelowa, harmonogram, budżet, oświadczenia."),
        ("Automatyczna Walidacja Sum Kosztorysowych",
         "System weryfikuje poprawność sumaryczną kosztów bezpośrednich i pośrednich oraz limity dofinansowania przed formalnym złożeniem wniosku."),
        ("Świadome Oświadczenia Prawne Wnioskodawcy",
         "AI nie zatwierdza oświadczeń za człowieka. Wnioskodawca świadomie potwierdza klauzule o braku podwójnego finansowania i reguły FERS."),
        ("Urzędowy Widok Podglądu i Druku A4",
         "Dedykowana ścieżka `/wnioski/[id]/podglad` przygotowuje dokument w standardzie formalnym gotowym do druku lub archiwizacji w ROPS.")
    ]
    cur_y = 385
    for title, desc in grant_points:
        deck.draw_check_icon(510, cur_y + 1, size=10, color=PRIMARY_DARK)
        deck.c.setFont(FONT_BOLD, 9.5)
        deck.c.setFillColor(PRIMARY_DARK)
        deck.c.drawString(524, cur_y + 2, title)
        deck.draw_multiline(524, cur_y - 14, desc, width_chars=58, line_height=13, color=TEXT_MAIN)
        cur_y -= 64

    deck.end_slide()

    # =========================================================================
    # SLAJD 5: POTENCJAŁ WDROŻENIOWY, TCO I BEZPIECZEŃSTWO
    # =========================================================================
    deck.start_slide("Potencjał Wdrożeniowy: Realistyczny Kosztorys TCO i Bezpieczeństwo", "Wdrożenie & Budżet", 5)

    # Lewa strona: TCO
    deck.draw_card(40, 50, 470, 395)
    deck.c.setFont(FONT_BOLD, 12)
    deck.c.setFillColor(PRIMARY_DARK)
    deck.c.drawString(60, 420, "SZACUNEK KOSZTÓW OBSŁUGI I UTRZYMANIA (TCO)")
    deck.c.setFont(FONT_REGULAR, 8.5)
    deck.c.setFillColor(TEXT_MUTED)
    deck.c.drawString(60, 404, "Roczna kalkulacja dla skali całego Województwa Małopolskiego")

    tco_items = [
        ("Baza danych i Auth (Supabase Pro)", "PostgreSQL, rozszerzenie pgvector, codzienne backupy, RLS, 100k MAU", "1 400 PLN / rok"),
        ("Hosting aplikacji i API (Cloud Run / Vercel Pro)", "Architektura bezstanowa, SLA 99.9%, ochrona DDoS, SSL", "1 950 PLN / rok"),
        ("Silnik AI Wektory i Gemini API", "Szacunek 50 000 zapytań/rok (embeddingi + asystent adaptacji)", "3 500 PLN / rok"),
        ("Domena rządowa `.malopolska.pl` i certyfikaty", "Utrzymanie adresu w domenie urzędowej", "0 PLN (zasoby WM)"),
        ("Nadzór techniczny i utrzymanie SLA (10h/mc)", "Wsparcie powdrożeniowe, aktualizacje zabezpieczeń", "25 000 PLN / rok"),
    ]

    cur_y = 370
    for service, desc, price in tco_items:
        deck.draw_card(60, cur_y - 28, 430, 48, bg_color=BG_CARD, border_color=BORDER)
        deck.c.setFont(FONT_BOLD, 9)
        deck.c.setFillColor(TEXT_MAIN)
        deck.c.drawString(75, cur_y + 4, service)
        deck.c.setFont(FONT_REGULAR, 7.5)
        deck.c.setFillColor(TEXT_MUTED)
        deck.c.drawString(75, cur_y - 12, desc)
        deck.c.setFont(FONT_BOLD, 9)
        deck.c.setFillColor(PRIMARY)
        deck.c.drawRightString(475, cur_y - 2, price)
        cur_y -= 56

    # Podsumowanie TCO
    deck.draw_card(60, 58, 430, 42, bg_color=PRIMARY_LIGHT, border_color=PRIMARY)
    deck.c.setFont(FONT_BOLD, 10)
    deck.c.setFillColor(PRIMARY_DARK)
    deck.c.drawString(75, 80, "ŁĄCZNY KOSZT ROCZNY WDROŻENIA:")
    deck.c.setFont(FONT_BOLD, 12)
    deck.c.setFillColor(PRIMARY)
    deck.c.drawRightString(475, 78, "~31 850 PLN brutto / rok")

    # Prawa strona: Gotowość i Bezpieczeństwo
    deck.draw_card(530, 50, 390, 395, bg_color=PRIMARY_LIGHT, border_color=PRIMARY)
    deck.c.setFont(FONT_BOLD, 12)
    deck.c.setFillColor(PRIMARY_DARK)
    deck.c.drawString(550, 420, "BEZPIECZEŃSTWO I GOTOWOŚĆ OPERACYJNA")

    readiness = [
        ("Czysta Integracja Chmurowa (Zero Atrap w Kodzie)",
         "Brak magazynów pamięciowych w RAM. Wszystkie operacje (fiszki, wnioski, opinie testera) zapisują się trwale w Supabase."),
        ("Izolacja Danych na Poziomie Bazy (RLS)",
         "Polityki Row Level Security w PostgreSQL gwarantują, że wnioskodawca ma dostęp wyłącznie do własnych dokumentów."),
        ("Zaufana Autoryzacja Ról ROPS Kraków",
         "Uprawnienia koordynatora ROPS weryfikowane z bezpiecznego tokenu `app_metadata` (odporność na manipulacje w przeglądarce)."),
        ("Pełna Zgodność z RODO",
         "Brak przetwarzania wrażliwych danych osobowych w modelach LLM. Bezpieczne haszowanie i anonimowe identyfikatory.")
    ]
    cur_y = 385
    for title, desc in readiness:
        deck.draw_check_icon(550, cur_y + 1, size=10, color=PRIMARY_DARK)
        deck.c.setFont(FONT_BOLD, 9.5)
        deck.c.setFillColor(PRIMARY_DARK)
        deck.c.drawString(565, cur_y + 2, title)
        deck.draw_multiline(565, cur_y - 12, desc, width_chars=50, line_height=13, color=TEXT_MAIN)
        cur_y -= 64

    deck.end_slide()

    # Zapis
    deck.save()
    print(f"Prezentacja pomyślnie wygenerowana: {output_pdf}")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "Splot_Prezentacja_ROPS_Krakow.pdf"
    build_presentation(out)


import math
import re
from typing import Tuple, Optional

# Samogłoski w języku polskim
POLISH_VOWELS = set("aąeęioóuyAĄEĘIOÓUY")

# Typowe sekwencje klawiaturowe (keyboard mash)
KEYBOARD_MASH_PATTERNS = [
    r"asdf",
    r"qwer",
    r"zxcv",
    r"hjkl",
    r"uiop",
    r"12345",
]


def calculate_char_entropy(text: str) -> float:
    """Oblicza entropię Shannona dla ciągu znaków (miara losowości/zróżnicowania)."""
    if not text:
        return 0.0
    frequencies = {}
    for char in text:
        frequencies[char] = frequencies.get(char, 0) + 1
    entropy = 0.0
    text_len = len(text)
    for count in frequencies.values():
        p = count / text_len
        entropy -= p * math.log2(p)
    return entropy


def is_gibberish(text: str) -> Tuple[bool, Optional[str]]:
    """
    Weryfikuje czy tekst wpisany przez użytkownika nie jest bełkotem,
    przypadkowym klikaniem w klawiaturę (keyboard mash) ani ciągiem bez sensu.
    
    Zwraca: (True, "powód") jeśli to bełkot, lub (False, None) jeśli tekst ma sens.
    """
    clean = text.strip()
    if len(clean) < 3:
        return True, "Tekst jest zbyt krótki (wymagane min. 3 znaki)."

    # 1. Sprawdzenie znaków alfanumerycznych
    letters = [c for c in clean if c.isalpha()]
    if not letters:
        return True, "Wprowadzony tekst nie zawiera żadnych liter."

    letters_str = "".join(letters).lower()

    # 2. Powtórzony ten sam znak 4+ razy (np. 'aaaaa', '......')
    if re.search(r"(.)\1{3,}", clean.lower()):
        return True, "Wykryto nienaturalne powtórzenie tych samych znaków."

    # 3. Powtórzone podciągi (np. 'awd' w 'awdawdawdawd' lub 'qwe' w 'qweqweqwe')
    if len(clean) >= 6 and re.search(r"(.{2,4})\1{2,}", clean.lower()):
        return True, "Wykryto zapętlony, powtarzający się wzorzec klawiatury."

    # 4. Proporcja unikalnych znaków do długości (dla ciągów >= 8 znaków)
    # Bełkot typu 'awdawdawdawd' ma 13 znaków, ale tylko 3 unikalne litery (ratio = 0.23)
    if len(letters_str) >= 8:
        unique_ratio = len(set(letters_str)) / len(letters_str)
        if unique_ratio < 0.35:
            return True, "Wprowadzony ciąg znaków charakteryzuje się zbyt małym zróżnicowaniem liter."

    # 5. Sprawdzenie samogłosek w długich tokenach (w języku polskim słowo >= 6 liter bez samogłoski to bełkot)
    words = re.findall(r"\b[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+\b", clean)
    for word in words:
        if len(word) >= 6:
            vowels_count = sum(1 for c in word if c in POLISH_VOWELS)
            if vowels_count == 0:
                return True, f"Słowo '{word}' nie zawiera żadnych samogłosek i przypomina losowy ciąg znaków."

    # 6. Typowe wzorce keyboard mash w pojedynczym tokenie bez spacji
    if len(words) == 1 and len(clean) >= 8:
        for pattern in KEYBOARD_MASH_PATTERNS:
            if pattern in clean.lower():
                return True, "Wykryto sekwencję przypadkowych klawiszy klawiatury."

    return False, None

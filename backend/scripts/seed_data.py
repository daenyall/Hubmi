import argparse
import json
import os
import sys
import time
from typing import List, Dict, Any, Tuple

# Dodanie ścieżki głównej backendu do sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.db.supabase import get_supabase_client
from app.services.ai import create_embedding


def validate_innovation_item(item: Dict[str, Any], index: int) -> Tuple[bool, List[str]]:
    """Sprawdza poprawność pojedynczego rekordu innowacji przed seedowaniem."""
    errors = []
    if not isinstance(item, dict):
        return False, [f"Pozycja #{index}: nie jest obiektem JSON."]

    required_keys = ["id", "title", "category", "target_group", "why_relevant", "description", "source_url"]
    for key in required_keys:
        val = item.get(key)
        if not val or not isinstance(val, str) or not val.strip():
            errors.append(f"Pozycja #{index} ({item.get('id', 'brak ID')}): brak lub puste pole '{key}'.")

    # Sprawdzenie poprawności URL
    url = str(item.get("source_url", "")).strip()
    if url and not (url.startswith("http://") or url.startswith("https://")):
        errors.append(f"Pozycja #{index} ({item.get('id')}): niepoprawny format source_url: {url}")

    return len(errors) == 0, errors


def seed_innovations(json_path: Optional[str] = None, dry_run: bool = False, verbose: bool = False) -> int:
    """Główna funkcja importu innowacji z pliku JSON i generowania wektorów."""
    print("=" * 65)
    print("  Małopolski Hub Innowacji Społecznych (ROPS Kraków)")
    print("  Import bazy innowacji (JSON) & generowanie embeddingów 1536D")
    print("=" * 65)

    if not json_path:
        json_path = os.path.join(os.path.dirname(__file__), "data", "innovations.json")

    if not os.path.exists(json_path):
        print(f"BŁĄD: Nie znaleziono pliku: {json_path}")
        return 1

    with open(json_path, "r", encoding="utf-8") as f:
        try:
            innovations: List[Dict[str, Any]] = json.load(f)
        except Exception as e:
            print(f"BŁĄD PARSOWANIA JSON: {e}")
            return 1

    print(f"Wczytano {len(innovations)} innowacji z: {json_path}")

    # 1. Walidacja wszystkich rekordów
    all_errors = []
    seen_ids = set()
    for idx, item in enumerate(innovations):
        valid, errs = validate_innovation_item(item, idx)
        if not valid:
            all_errors.extend(errs)
        inv_id = item.get("id")
        if inv_id in seen_ids:
            all_errors.append(f"Zduplikowane ID innowacji: '{inv_id}'")
        if inv_id:
            seen_ids.add(inv_id)

    if all_errors:
        print(f"\nBŁĄD WALIDACJI DANYCH ({len(all_errors)} problemów):")
        for err in all_errors:
            print(f"  - {err}")
        return 1

    print("✓ Walidacja strukturalna zakończona pomyślnie. Wszystkie rekordy są poprawne.")

    if dry_run:
        print("\n[TRYB DRY-RUN]: Nie modyfikujemy bazy danych Supabase.")
        print(f"Gotowe do zaimportowania {len(innovations)} unikalnych innowacji.")
        return 0

    supabase = get_supabase_client()
    if not supabase:
        print("BŁĄD: Klient Supabase nie został zainicjalizowany! Sprawdź SUPABASE_URL i SUPABASE_KEY w .env")
        return 1

    start_time = time.time()
    success_count = 0
    fail_count = 0

    print(f"\nRozpoczynanie zapisu do Supabase (pgvector)...")
    for item in innovations:
        inv_id = item["id"]
        title = item["title"]

        # Przygotowanie tekstu semantycznego pod wektor 1536D
        text_for_embedding = (
            f"{title}. Kategoria: {item.get('category')}. "
            f"Grupa docelowa: {item.get('target_group')}. "
            f"Dlaczego warto: {item.get('why_relevant')}. "
            f"Opis: {item.get('description')}"
        )

        # Wyliczenie embeddingu
        embedding = create_embedding(text_for_embedding)

        row = {
            "id": inv_id,
            "title": title,
            "description": item.get("description", "").strip(),
            "target_group": item.get("target_group", "").strip(),
            "category": item.get("category", "Inne").strip(),
            "why_relevant": item.get("why_relevant", "").strip(),
            "source_url": item.get("source_url", "").strip(),
            "status": item.get("status", "sprawdzone").strip(),
            "author_or_institution": "ROPS Kraków",
            "embedding": embedding,
        }

        try:
            supabase.table("innovations").upsert(row).execute()
            success_count += 1
            if verbose:
                print(f"  ✓ [{inv_id}] {title[:40]}... (wektor: {len(embedding)}D)")
            else:
                sys.stdout.write(".")
                sys.stdout.flush()
            time.sleep(1.0)

        except Exception as e:
            fail_count += 1
            print(f"\n  ✗ Błąd podczas zapisu {inv_id}: {e}")

    if not verbose:
        sys.stdout.write("\n")

    elapsed = time.time() - start_time
    print("=" * 65)
    print(f"PODSUMOWANIE IMPORTU:")
    print(f"  ✓ Zapisano pomyślnie: {success_count}/{len(innovations)}")
    if fail_count > 0:
        print(f"  ✗ Błędy zapisu:     {fail_count}")
    print(f"  ⏱ Czas wykonania:   {elapsed:.2f} s")
    print("=" * 65)

    return 0 if fail_count == 0 else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import bazy innowacji ROPS Kraków do Supabase pgvector.")
    parser.add_argument("--json-path", type=str, default=None, help="Ścieżka do alternatywnego pliku JSON")
    parser.add_argument("--dry-run", action="store_true", help="Uruchom tylko walidację bez zapisu do bazy")
    parser.add_argument("--verbose", "-v", action="store_true", help="Szczegółowe logowanie każdego rekordu")

    args = parser.parse_args()
    code = seed_innovations(json_path=args.json_path, dry_run=args.dry_run, verbose=args.verbose)
    sys.exit(code)

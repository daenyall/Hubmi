import json
import os
import sys

# Dodanie ścieżki głównej backendu do sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.db.supabase import get_supabase_client
from app.services.ai import create_embedding


def seed_innovations():
    print("=== Rozpoczynanie seedowania bazy innowacji ROPS Kraków ===")
    
    supabase = get_supabase_client()
    if not supabase:
        print("BŁĄD: Klient Supabase nie został zainicjalizowany! Sprawdź SUPABASE_URL i SUPABASE_KEY w .env")
        return

    json_path = os.path.join(os.path.dirname(__file__), "data", "innovations.json")
    if not os.path.exists(json_path):
        print(f"BŁĄD: Nie znaleziono pliku {json_path}")
        return

    with open(json_path, "r", encoding="utf-8") as f:
        innovations = json.load(f)

    print(f"Wczytano {len(innovations)} innowacji z pliku JSON.")

    success_count = 0
    for item in innovations:
        inv_id = item["id"]
        title = item["title"]
        print(f"Przetwarzanie [{inv_id}]: {title}...")

        # Przygotowanie bogatego tekstu pod wektor
        text_for_embedding = f"{title}. Kategoria: {item.get('category')}. Grupa docelowa: {item.get('target_group')}. Dlaczego warto: {item.get('why_relevant')}. Opis: {item.get('description')}"
        
        # Wyliczenie embeddingu (OpenAI lub fallback)
        embedding = create_embedding(text_for_embedding)

        row = {
            "id": inv_id,
            "title": title,
            "description": item.get("description", ""),
            "target_group": item.get("target_group", ""),
            "category": item.get("category", "Inne"),
            "why_relevant": item.get("why_relevant", ""),
            "source_url": item.get("source_url", ""),
            "status": item.get("status", "sprawdzone"),
            "author_or_institution": "ROPS Kraków",
            "embedding": embedding,
        }

        try:
            res = supabase.table("innovations").upsert(row).execute()
            success_count += 1
            print(f"  ✓ Zapisano do Supabase.")
        except Exception as e:
            print(f"  ✗ Błąd podczas zapisu {inv_id}: {e}")

    print(f"\nZakończono seedowanie! Pomyślnie zaktualizowano: {success_count}/{len(innovations)} innowacji.")


if __name__ == "__main__":
    seed_innovations()

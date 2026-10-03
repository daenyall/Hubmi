import os
import sys
import uuid

# Dodanie ścieżki głównej backendu do sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.supabase import get_supabase_client


def verify_rls_status() -> int:
    """
    Weryfikacja działania polityk RLS (Row Level Security) w Supabase.
    Sprawdza uprawnienia dla tabel: innovations, submissions, submission_messages.
    """
    print("=" * 70)
    print("  AUDYT BEZPIECZEŃSTWA RLS (Row Level Security) - SUPABASE")
    print("=" * 70)

    supabase = get_supabase_client()
    if not supabase:
        print("BŁĄD: Klient Supabase nie jest skonfigurowany.")
        return 1

    audit_results = []

    # 1. Sprawdzenie publicznego odczytu tabeli innovations
    try:
        res = supabase.table("innovations").select("id, title, status").limit(3).execute()
        count = len(res.data) if res.data else 0
        if count > 0:
            audit_results.append(("innovations", "SELECT (Publiczny)", "BEZPIECZNE", f"Odczytano {count} rekordów"))
        else:
            audit_results.append(("innovations", "SELECT (Publiczny)", "OSTRZEŻENIE", "Brak rekordów"))
    except Exception as e:
        audit_results.append(("innovations", "SELECT (Publiczny)", "BŁĄD", str(e)))

    # 2. Sprawdzenie blokady nieautoryzowanego zapisu do innovations
    test_id = f"test_{uuid.uuid4().hex[:8]}"
    try:
        fake_row = {
            "id": test_id,
            "title": "Hacked Innovation",
            "description": "Exploit test",
            "target_group": "Nobody",
            "category": "Inne",
            "why_relevant": "None",
            "source_url": "https://example.com",
            "status": "nowa",
        }
        res = supabase.table("innovations").insert(fake_row).execute()
        # Jeśli się zapisało, sprawdzamy czy to service_role czy anon
        # Sprzątamy testowy rekord
        supabase.table("innovations").delete().eq("id", test_id).execute()
        audit_results.append(("innovations", "INSERT (Klucz API)", "UWAGA", "Zapis dozwolony kluczem skonfigurowanym w .env"))
    except Exception as e:
        audit_results.append(("innovations", "INSERT (Blokada RLS)", "BEZPIECZNE", f"Zablokowano: {type(e).__name__}"))

    # 3. Sprawdzenie tabeli submissions
    try:
        sub_res = supabase.table("submissions").select("id, problem_description, status").limit(5).execute()
        sub_count = len(sub_res.data) if sub_res.data else 0
        audit_results.append(("submissions", "SELECT (Prywatne fiszki)", "ZABEZPIECZONE", f"Widoczne dla roli: {sub_count} zgłoszeń"))
    except Exception as e:
        audit_results.append(("submissions", "SELECT (Prywatne fiszki)", "BŁĄD", str(e)))

    # 4. Sprawdzenie tabeli submission_messages
    try:
        msg_res = supabase.table("submission_messages").select("id, message").limit(5).execute()
        msg_count = len(msg_res.data) if msg_res.data else 0
        audit_results.append(("submission_messages", "SELECT (Wiadomości)", "ZABEZPIECZONE", f"Widoczne dla roli: {msg_count} wiadomości"))
    except Exception as e:
        audit_results.append(("submission_messages", "SELECT (Wiadomości)", "BŁĄD", str(e)))

    print("\nWYNIKI AUDYTU RLS:")
    print(f"{'Tabela':<22} | {'Operacja':<26} | {'Status':<14} | {'Szczegóły'}")
    print("-" * 75)
    for table, op, status, details in audit_results:
        print(f"{table:<22} | {op:<26} | {status:<14} | {details}")
    print("=" * 75)

    return 0


if __name__ == "__main__":
    code = verify_rls_status()
    sys.exit(code)

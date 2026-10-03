import os
import time
import requests
from typing import Optional, Dict, Any
from app.db.supabase import get_supabase_client
from app.models.schemas import NotificationResult

# Pamięć podręczna zdarzeń w razie braku połączenia lub przed migracją
_IN_MEMORY_EVENTS = []


def record_submission_event(
    submission_id: str,
    old_status: Optional[str],
    new_status: str,
    changed_by: str = "rops_admin",
    comment: Optional[str] = None,
    webhook_dispatched: bool = False,
) -> Optional[str]:
    """
    Zapisuje zdarzenie zmiany statusu w tabeli submission_events (audit log).
    W razie braku migracji w Supabase zapisuje zdarzenie w bezpiecznym rejestrze pamięci.
    """
    event_data = {
        "submission_id": submission_id,
        "old_status": old_status,
        "new_status": new_status,
        "changed_by": changed_by,
        "comment": comment,
        "webhook_dispatched": webhook_dispatched,
    }

    supabase = get_supabase_client()
    if supabase:
        try:
            res = supabase.table("submission_events").insert(event_data).execute()
            data_list = [d for d in res.data if isinstance(d, dict)] if isinstance(res.data, list) else []
            if data_list:
                return str(data_list[0].get("id", ""))
        except Exception as e:
            print(f"Uwaga: Nie udało się zapisać zdarzenia do Supabase (być może brak tabeli submission_events): {e}")

    # Fallback in-memory
    event_id = f"evt_{int(time.time() * 1000)}"
    event_record = {**event_data, "id": event_id, "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")}
    _IN_MEMORY_EVENTS.append(event_record)
    return event_id


def get_recent_events(limit: int = 50) -> list:
    """Zwraca listę ostatnich zdarzeń audytowych z Supabase lub pamięci."""
    supabase = get_supabase_client()
    if supabase:
        try:
            res = supabase.table("submission_events").select("*").order("created_at", desc=True).limit(limit).execute()
            rows = [d for d in res.data if isinstance(d, dict)] if isinstance(res.data, list) else []
            if rows:
                return rows
        except Exception:
            pass
    return list(reversed(_IN_MEMORY_EVENTS[-limit:]))


def send_email_notification_stub(
    to_email: Optional[str],
    submission_title: str,
    new_status: str,
    official_response: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generator powiadomienia e-mail (stub/mock pod SMTP / Resend / SendGrid).
    Przygotowuje oficjalną treść pisma z ROPS Kraków.
    """
    status_display = {
        "nowe": "Nowe (przyjęte do rejestru)",
        "weryfikacja": "W trakcie oceny merytorycznej",
        "zaakceptowane": "Zaakceptowane do wdrożenia / katalogu innowacji",
        "odrzucone": "Wymaga uzupełnienia / odrzucone",
    }.get(new_status, new_status)

    subject = f"[ROPS Kraków] Zmiana statusu Twojego zgłoszenia: {submission_title}"
    body = (
        f"Dzień dobry,\n\n"
        f"Informujemy, że status Twojego zgłoszenia w Małopolskim Hubie Innowacji Społecznych (ROPS Kraków) "
        f"został zaktualizowany na: {status_display.upper()}.\n\n"
    )
    if official_response:
        body += f"Uzasadnienie / informacja zwrotna od eksperta ROPS:\n\"{official_response}\"\n\n"

    body += (
        f"Szczegóły zgłoszenia oraz wątek komunikacji możesz śledzić w panelu innowatora.\n\n"
        f"Z poważaniem,\n"
        f"Zespół Regionalnego Ośrodka Polityki Społecznej w Krakowie"
    )

    print(f"\n[EMAIL NOTIFICATION STUB] To: {to_email or 'kontakt@jst.pl'}")
    print(f"Subject: {subject}")
    print(f"Content:\n{body}\n{'-'*50}")

    return {
        "to": to_email or "kontakt@jst.pl",
        "subject": subject,
        "body": body,
        "status": "sent_stub",
    }


def dispatch_webhook(
    submission_id: str,
    title: str,
    old_status: Optional[str],
    new_status: str,
    comment: Optional[str] = None,
    webhook_url: Optional[str] = None,
) -> bool:
    """
    Wysyła zdarzenie webhook (HTTP POST) do zewnętrznego systemu (np. Slack urzędu, system obiegu dokumentów JST).
    """
    target_url = webhook_url or os.getenv("WEBHOOK_STATUS_CHANGE_URL")
    if not target_url:
        return False

    payload = {
        "event": "submission_status_changed",
        "submission_id": submission_id,
        "title": title,
        "old_status": old_status,
        "new_status": new_status,
        "comment": comment,
        "source": "Hubmi ROPS Backend",
        "timestamp": time.time(),
    }

    try:
        res = requests.post(target_url, json=payload, timeout=5)
        return res.status_code in (200, 201, 202, 204)
    except Exception as e:
        print(f"Webhook dispatch failed to {target_url}: {e}")
        return False


def notify_status_change(
    submission_id: str,
    old_status: Optional[str],
    new_status: str,
    title: str = "Fiszka innowacji",
    applicant_email: Optional[str] = None,
    official_response: Optional[str] = None,
    changed_by: str = "rops_admin",
    webhook_url: Optional[str] = None,
) -> NotificationResult:
    """
    Główny dyspozytor powiadomień:
    1. Rejestruje zdarzenie w audit logu.
    2. Wysyła powiadomienie e-mail (stub).
    3. Dispatchuje webhook HTTP (jeśli skonfigurowany).
    """
    webhook_sent = dispatch_webhook(
        submission_id=submission_id,
        title=title,
        old_status=old_status,
        new_status=new_status,
        comment=official_response,
        webhook_url=webhook_url,
    )

    event_id = record_submission_event(
        submission_id=submission_id,
        old_status=old_status,
        new_status=new_status,
        changed_by=changed_by,
        comment=official_response,
        webhook_dispatched=webhook_sent,
    )

    send_email_notification_stub(
        to_email=applicant_email,
        submission_title=title,
        new_status=new_status,
        official_response=official_response,
    )

    return NotificationResult(
        success=True,
        email_sent=True,
        webhook_sent=webhook_sent,
        message=f"Powiadomienie o zmianie statusu na '{new_status}' zostało przetworzone.",
        event_id=event_id,
    )

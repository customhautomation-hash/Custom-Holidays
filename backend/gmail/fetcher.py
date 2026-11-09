"""
Gmail message fetcher.
Uses a broad query to fetch ALL emails, then lets the AI classifier decide
what is relevant supplier data. This avoids missing emails.
"""
import base64
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"
PROCESSED_TABLE = "gmail_processed_emails"

# Fetch ALL emails — the AI classifier handles relevance filtering.
# Previously this was too narrow and missed most supplier emails.
SUPPLIER_QUERY = "-category:promotions -category:social -category:forums -in:chats -in:spam -in:sent -in:drafts"   # skip newsletters, social mail and our own sent mail


def _gmail_get(path: str, access_token: str, params: dict = None) -> dict:
    import requests
    resp = requests.get(
        f"{GMAIL_API}/{path}",
        headers={"Authorization": f"Bearer {access_token}"},
        params=params or {},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def get_already_processed_ids(user_id: str) -> set:
    """Every email already looked at. Read in pages: Supabase returns at most 1,000 rows per request,
    so without paging, emails beyond the first 1,000 were checked again and again."""
    from supabase_client import supabase
    ids: set = set()
    try:
        start, size = 0, 1000
        while True:
            rows = (
                supabase.table(PROCESSED_TABLE)
                .select("gmail_message_id")
                .eq("user_id", user_id)
                .order("gmail_message_id")
                .range(start, start + size - 1)
                .execute()
            ).data or []
            ids.update(r["gmail_message_id"] for r in rows)
            if len(rows) < size:
                break
            start += size
        return ids
    except Exception as e:
        logger.error("Could not fetch processed IDs: %s", e)
        return ids


_has_detail_columns = True


def mark_processed(user_id: str, message_id: str, thread_id: str, status: str, supplier_name: str = "", extraction_type: str = "",
                   subject: str = "", sender: str = "", note: str = "") -> None:
    """Remember an email was looked at. Subject, sender and a short note feed the 'Recent emails' list;
    they are left out automatically if those columns haven't been added to the table yet."""
    global _has_detail_columns
    from supabase_client import supabase
    row = {
        "user_id": user_id,
        "gmail_message_id": message_id,
        "gmail_thread_id": thread_id,
        "status": status,
        "supplier_name": supplier_name,
        "extraction_type": extraction_type,
    }
    if _has_detail_columns:
        try:
            supabase.table(PROCESSED_TABLE).insert({**row, "subject": (subject or "")[:300], "sender": (sender or "")[:300], "note": (note or "")[:300]}).execute()
            return
        except Exception as e:
            if "column" not in str(e).lower():
                logger.error("Could not mark message as processed: %s", e)
                return
            _has_detail_columns = False
    try:
        supabase.table(PROCESSED_TABLE).insert(row).execute()
    except Exception as e:
        logger.error("Could not mark message as processed: %s", e)


def delete_processed(message_id: str, user_id: str) -> None:
    from supabase_client import supabase
    try:
        supabase.table(PROCESSED_TABLE).delete().eq("gmail_message_id", message_id).eq("user_id", user_id).execute()
    except Exception as e:
        logger.error("Could not delete processed record: %s", e)


def list_messages(access_token: str, query: str = "", max_results: int = 50, page_token: str = None) -> dict:
    params = {"maxResults": max_results}
    if query:
        params["q"] = query
    if page_token:
        params["pageToken"] = page_token
    return _gmail_get("messages", access_token, params)


def get_message(access_token: str, message_id: str) -> dict:
    return _gmail_get(f"messages/{message_id}", access_token, {"format": "full"})


def get_attachment(access_token: str, message_id: str, attachment_id: str) -> bytes:
    data = _gmail_get(f"messages/{message_id}/attachments/{attachment_id}", access_token)
    encoded = data.get("data", "")
    return base64.urlsafe_b64decode(encoded + "==")


def extract_email_body(message: dict) -> str:
    payload = message.get("payload", {})
    return _extract_body_recursive(payload)


def _extract_body_recursive(part: dict) -> str:
    mime = part.get("mimeType", "")
    if mime == "text/plain":
        data = part.get("body", {}).get("data", "")
        if data:
            try:
                return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
            except Exception:
                return ""
    if mime == "text/html":
        data = part.get("body", {}).get("data", "")
        if data:
            try:
                html = base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
                clean = re.sub(r"<[^>]+>", " ", html)
                clean = re.sub(r"\s+", " ", clean).strip()
                return clean
            except Exception:
                return ""
    text_parts = []
    for sub_part in part.get("parts", []):
        text = _extract_body_recursive(sub_part)
        if text:
            text_parts.append(text)
    return "\n\n".join(text_parts)


def extract_attachments(message: dict) -> list:
    attachments = []
    payload = message.get("payload", {})
    _extract_attachments_recursive(payload, message["id"], attachments)
    return attachments


def _extract_attachments_recursive(part: dict, message_id: str, result: list) -> None:
    filename = part.get("filename", "")
    mime = part.get("mimeType", "")
    attachment_id = part.get("body", {}).get("attachmentId")
    if filename and attachment_id:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext in ("pdf", "xlsx", "xls", "docx", "doc", "txt", "csv"):
            result.append({
                "filename": filename,
                "mime_type": mime,
                "attachment_id": attachment_id,
                "message_id": message_id,
                "size": part.get("body", {}).get("size", 0),
            })
    for sub_part in part.get("parts", []):
        _extract_attachments_recursive(sub_part, message_id, result)


def get_message_metadata(message: dict) -> dict:
    headers = {h["name"].lower(): h["value"] for h in message.get("payload", {}).get("headers", [])}
    return {
        "from":       headers.get("from", ""),
        "subject":    headers.get("subject", ""),
        "date":       headers.get("date", ""),
        "message_id": message.get("id", ""),
        "thread_id":  message.get("threadId", ""),
        "list_unsubscribe": headers.get("list-unsubscribe", ""),
        "precedence": headers.get("precedence", "").lower(),
        "auto_submitted": headers.get("auto-submitted", "").lower(),
        "labels":     message.get("labelIds", []) or [],
    }


# ── Quick filter: emails that are clearly not from suppliers never reach the AI ──
_SKIP_SENDER = re.compile(r"^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|alerts?|mailer-daemon|postmaster|bounces?|newsletters?|news|marketing|promo(tions)?|digest|updates?|support-noreply|calendar-notification)([+.\-]|@)", re.I)
_SKIP_DOMAINS = (
    "google.com", "googlemail.com", "youtube.com", "linkedin.com", "facebookmail.com", "facebook.com", "instagram.com", "meta.com",
    "twitter.com", "x.com", "amazon.in", "amazon.com", "apple.com", "microsoft.com", "office.com", "outlook.com", "zoom.us",
    "notion.so", "vercel.com", "render.com", "github.com", "supabase.io", "supabase.com", "openai.com", "anthropic.com",
    "canva.com", "slack.com", "hubspot.com", "mailchimp.com", "razorpay.com", "paytm.com", "phonepe.com", "swiggy.in",
    "zomato.com", "uber.com", "olacabs.com", "netflix.com", "spotify.com", "quora.com", "medium.com", "substack.com",
    "pinterest.com", "naukri.com", "indeed.com", "glassdoor.com", "dropbox.com", "figma.com", "openrouter.ai", "cloudflare.com",
)
_SKIP_SUBJECT = re.compile(
    r"^(invitation|updated invitation|accepted|declined|tentative|canceled event|cancelled event)\b|"
    r"security alert|verification code|verify your|one[- ]time password|\botp\b|password reset|reset your password|"
    r"sign[- ]in attempt|new sign[- ]in|delivery status notification|undeliverable|out of office|automatic reply|"
    r"your (order|receipt|subscription|statement)|weekly digest|newsletter|webinar", re.I)


def sender_address(sender: str) -> str:
    m = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", sender or "")
    return m.group(0).lower() if m else ""


def quick_skip_reason(meta: dict, own_email: str = "") -> str:
    """Returns why an email is obviously not a supplier email, or "" if the AI should look at it."""
    addr = sender_address(meta.get("from", ""))
    local, _, domain = addr.partition("@")
    if own_email and addr == own_email.lower():
        return "sent by us"
    if "SENT" in meta.get("labels", []) and "INBOX" not in meta.get("labels", []):
        return "sent by us"
    if addr and _SKIP_SENDER.match(local + "@"):
        return "automatic sender"
    if domain and any(domain == d or domain.endswith("." + d) for d in _SKIP_DOMAINS):
        return "app or service notification"
    if meta.get("precedence") in ("bulk", "list", "junk") and meta.get("list_unsubscribe"):
        return "newsletter"
    if meta.get("auto_submitted") and meta["auto_submitted"] != "no":
        return "automatic reply"
    if _SKIP_SUBJECT.search(meta.get("subject", "") or ""):
        return "notification, invite or auto-reply"
    return ""

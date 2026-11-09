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
SUPPLIER_QUERY = "-category:promotions -category:social -in:chats -in:spam"   # skip newsletters and social mail


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
    from supabase_client import supabase
    try:
        result = (
            supabase.table(PROCESSED_TABLE)
            .select("gmail_message_id")
            .eq("user_id", user_id)
            .execute()
        )
        return {r["gmail_message_id"] for r in (result.data or [])}
    except Exception as e:
        logger.error("Could not fetch processed IDs: %s", e)
        return set()


def mark_processed(user_id: str, message_id: str, thread_id: str, status: str, supplier_name: str = "", extraction_type: str = "") -> None:
    from supabase_client import supabase
    try:
        supabase.table(PROCESSED_TABLE).insert({
            "user_id": user_id,
            "gmail_message_id": message_id,
            "gmail_thread_id": thread_id,
            "status": status,
            "supplier_name": supplier_name,
            "extraction_type": extraction_type,
        }).execute()
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
    }

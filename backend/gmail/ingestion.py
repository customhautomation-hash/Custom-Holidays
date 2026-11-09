"""
Gmail ingestion pipeline — runs automatically in background.
Polls every POLL_INTERVAL_SECONDS (default 600 = 10 minutes).
Also populates the `suppliers` table so Supplier Reachout / Active Deals
pages stay in sync with incoming emails.
"""
import logging
import time
import threading
from datetime import datetime
from typing import Optional, Callable

from supabase_client import supabase
from .auth import get_valid_access_token
from .fetcher import (
    list_messages, get_message, get_attachment,
    extract_email_body, extract_attachments,
    get_message_metadata, get_already_processed_ids,
    mark_processed, SUPPLIER_QUERY,
)
from .extractor import classify_email, extract_supplier_data, extract_text_from_attachment

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 600   # poll every 10 minutes
EXTRACTABLE_CATEGORIES = {
    "HOTEL_RATE", "ACTIVITY_RATE", "TRANSFER_RATE",
    "CONTRACT", "GENERAL_SUPPLIER",
}

# Global auto-poll state
_auto_poll_thread: Optional[threading.Thread] = None
_auto_poll_stop   = threading.Event()
_latest_result: dict = {}
_is_syncing       = False
_sync_log: list[str] = []


def get_auto_poll_status() -> dict:
    return {
        "running":     _auto_poll_thread is not None and _auto_poll_thread.is_alive(),
        "is_syncing":  _is_syncing,
        "latest":      _latest_result,
        "log":         _sync_log[-30:],
        "interval_s":  POLL_INTERVAL_SECONDS,
    }


def start_auto_poll(user_id: str) -> None:
    """Start the background auto-poll thread for a user. Idempotent."""
    global _auto_poll_thread
    if _auto_poll_thread and _auto_poll_thread.is_alive():
        logger.info("[Gmail] Auto-poll already running")
        return
    _auto_poll_stop.clear()
    _auto_poll_thread = threading.Thread(
        target=_auto_poll_loop,
        args=(user_id,),
        daemon=True,
        name="gmail-auto-poll",
    )
    _auto_poll_thread.start()
    logger.info("[Gmail] Auto-poll started for user %s (interval %ds)", user_id, POLL_INTERVAL_SECONDS)


def stop_auto_poll() -> None:
    """Signal the background thread to stop."""
    _auto_poll_stop.set()
    logger.info("[Gmail] Auto-poll stopped")


def _auto_poll_loop(user_id: str) -> None:
    """Main loop — run ingestion, sleep, repeat."""
    while not _auto_poll_stop.is_set():
        logger.info("[Gmail] Auto-poll: running ingestion for user %s", user_id)
        run_ingestion(user_id, max_emails=50)
        # Sleep in small increments so stop signal is responsive
        for _ in range(POLL_INTERVAL_SECONDS * 2):
            if _auto_poll_stop.is_set():
                break
            time.sleep(0.5)
    logger.info("[Gmail] Auto-poll loop exited")


class IngestionResult:
    def __init__(self):
        self.fetched = 0
        self.skipped_already_processed = 0
        self.skipped_irrelevant = 0
        self.extracted = 0
        self.hotels_added = 0
        self.activities_added = 0
        self.transfers_added = 0
        self.suppliers_created = 0
        self.errors = 0
        self.log: list[str] = []

    def to_dict(self) -> dict:
        return {
            "fetched":                    self.fetched,
            "skipped_already_processed":  self.skipped_already_processed,
            "skipped_irrelevant":         self.skipped_irrelevant,
            "extracted":                  self.extracted,
            "hotels_added":               self.hotels_added,
            "activities_added":           self.activities_added,
            "transfers_added":            self.transfers_added,
            "suppliers_created":          self.suppliers_created,
            "errors":                     self.errors,
            "log":                        self.log[-50:],
        }


CATEGORY_TYPE = {"HOTEL_RATE": "Hotel", "ACTIVITY_RATE": "Activity Provider", "TRANSFER_RATE": "Transport"}


def _sender_email(sender: str) -> str:
    import re
    m = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", sender or "")
    return m.group(0).lower() if m else ""


def _upsert_supplier(supplier_name: str, sender: str, category: str = "", classification: Optional[dict] = None) -> Optional[str]:
    """
    Make sure this supplier is in the `suppliers` table (Suppliers page).
    New suppliers get their type (DMC, Hotel, ...), destination and email from the email.
    Existing ones only get empty fields filled in, never overwritten.
    """
    if not supplier_name or supplier_name.lower() in ("unknown supplier", "unknown", ""):
        return None
    classification = classification or {}
    email = _sender_email(sender)
    stype = (classification.get("supplier_type") or CATEGORY_TYPE.get(category) or "DMC").strip()
    place = (classification.get("destination") or "").strip() or None
    try:
        existing = supabase.table("suppliers").select("id, email, place, supplier_type").ilike("name", supplier_name).limit(1).execute()
        if not existing.data and email:
            existing = supabase.table("suppliers").select("id, email, place, supplier_type").eq("email", email).limit(1).execute()
        if existing.data:
            row = existing.data[0]
            fill = {}
            if not row.get("email") and email: fill["email"] = email
            if not row.get("place") and place: fill["place"] = place
            if (not row.get("supplier_type") or row.get("supplier_type") == "Tour Operator") and stype: fill["supplier_type"] = stype
            if fill: supabase.table("suppliers").update(fill).eq("id", row["id"]).execute()
            return row["id"]
        result = supabase.table("suppliers").insert({
            "name": supplier_name, "email": email or None, "supplier_type": stype, "place": place,
            "onboarding_status": "new", "internal_notes": "Added from Gmail",
        }).execute()
        if result.data:
            return result.data[0]["id"]
    except Exception as e:
        logger.warning("Could not upsert supplier %s: %s", supplier_name, e)
    return None


def _insert_hotels(hotels: list[dict], result: IngestionResult) -> None:
    for hotel in hotels:
        if not hotel.get("hotel_name") or not hotel.get("destination"):
            continue
        try:
            price = float(hotel.get("price_per_night", 0))
            if price <= 0:
                continue
            supabase.table("supplier_hotels").insert({
                "supplier_name":      hotel.get("supplier_name", "Unknown"),
                "hotel_name":         hotel["hotel_name"],
                "destination":        hotel["destination"],
                "star_rating":        hotel.get("star_rating"),
                "room_type":          hotel.get("room_type"),
                "meal_plan":          hotel.get("meal_plan"),
                "price_per_night":    price,
                "currency":           hotel.get("currency", "INR"),
                "valid_from":         hotel.get("valid_from"),
                "valid_to":           hotel.get("valid_to"),
                "cancellation_policy": hotel.get("cancellation_policy"),
                "inclusions":         hotel.get("inclusions", []),
                "source_email":       hotel.get("source_email", ""),
                "source_date":        hotel.get("source_date"),
            }).execute()
            result.hotels_added += 1
            result.log.append(f"  ✓ Hotel: {hotel['hotel_name']} — {hotel.get('currency','INR')} {price}/night")
        except Exception as e:
            logger.error("Insert hotel failed: %s", e)
            result.errors += 1


def _insert_activities(activities: list[dict], result: IngestionResult) -> None:
    for act in activities:
        if not act.get("activity_name") or not act.get("destination"):
            continue
        try:
            price = float(act.get("price", 0))
            if price <= 0:
                continue
            supabase.table("supplier_activities").insert({
                "supplier_name":  act.get("supplier_name", "Unknown"),
                "activity_name":  act["activity_name"],
                "destination":    act["destination"],
                "description":    act.get("description"),
                "duration_hours": act.get("duration_hours"),
                "price":          price,
                "currency":       act.get("currency", "INR"),
                "price_basis":    act.get("price_basis", "per_person"),
                "valid_from":     act.get("valid_from"),
                "valid_to":       act.get("valid_to"),
                "inclusions":     act.get("inclusions", []),
                "source_email":   act.get("source_email", ""),
                "source_date":    act.get("source_date"),
            }).execute()
            result.activities_added += 1
            result.log.append(f"  ✓ Activity: {act['activity_name']} — {act.get('currency','INR')} {price}")
        except Exception as e:
            logger.error("Insert activity failed: %s", e)
            result.errors += 1


def _insert_transfers(transfers: list[dict], result: IngestionResult) -> None:
    for tr in transfers:
        if not tr.get("transfer_type") or not tr.get("destination"):
            continue
        try:
            price = float(tr.get("price", 0))
            if price <= 0:
                continue
            supabase.table("supplier_transfers").insert({
                "supplier_name":  tr.get("supplier_name", "Unknown"),
                "transfer_type":  tr["transfer_type"],
                "destination":    tr["destination"],
                "route":          tr.get("route"),
                "vehicle_type":   tr.get("vehicle_type"),
                "price":          price,
                "currency":       tr.get("currency", "INR"),
                "price_basis":    tr.get("price_basis", "per_vehicle"),
                "valid_from":     tr.get("valid_from"),
                "valid_to":       tr.get("valid_to"),
                "source_email":   tr.get("source_email", ""),
                "source_date":    tr.get("source_date"),
            }).execute()
            result.transfers_added += 1
            result.log.append(f"  ✓ Transfer: {tr['transfer_type']} {tr['destination']} — {tr.get('currency','INR')} {price}")
        except Exception as e:
            logger.error("Insert transfer failed: %s", e)
            result.errors += 1


def run_ingestion(
    user_id: str,
    max_emails: int = 50,
    status_callback: Optional[Callable[[str], None]] = None,
) -> IngestionResult:
    global _is_syncing, _latest_result

    result = IngestionResult()
    _is_syncing = True
    _sync_log.clear()

    def _log(msg: str):
        result.log.append(msg)
        _sync_log.append(msg)
        if len(_sync_log) > 200:
            _sync_log[:] = _sync_log[-200:]
        if status_callback:
            status_callback(msg)
        logger.info("[Gmail] %s", msg)

    try:
        access_token = get_valid_access_token(user_id)
        if not access_token:
            _log("No valid Gmail token — skipping ingestion")
            return result

        already_processed = get_already_processed_ids(user_id)
        _log(f"Already processed: {len(already_processed)} emails")

        messages, page_token, pages = [], None, 0
        while len([m for m in messages if m["id"] not in already_processed]) < max_emails and pages < 30:
            page = list_messages(access_token, query=SUPPLIER_QUERY, max_results=100, page_token=page_token)
            messages += page.get("messages", [])
            page_token = page.get("nextPageToken"); pages += 1
            if not page_token:
                break
        messages = [m for m in messages if m["id"] not in already_processed][:max_emails]
        result.fetched = len(messages)
        _log(f"Found {len(messages)} new messages to check")

        for msg_ref in messages:
            msg_id = msg_ref["id"]

            if msg_id in already_processed:
                result.skipped_already_processed += 1
                continue

            try:
                message = get_message(access_token, msg_id)
                meta = get_message_metadata(message)
                body = extract_email_body(message)
                attachments = extract_attachments(message)

                _log(f"\nProcessing: {meta['subject'][:60]}")

                classification = classify_email(
                    subject=meta["subject"],
                    body=body,
                    sender=meta["from"],
                )
                category      = classification.get("category", "IRRELEVANT")
                supplier_name = classification.get("supplier_name", "Unknown Supplier")
                confidence    = classification.get("confidence", 0)

                _log(f"  → {category} ({confidence:.0%}) — {supplier_name}")

                if category == "IRRELEVANT" or confidence < 0.5:
                    mark_processed(user_id, msg_id, meta["thread_id"], "irrelevant", supplier_name)
                    result.skipped_irrelevant += 1
                    continue

                # Upsert into suppliers table — links to SupplierReachout / ActiveDeals
                supplier_id = _upsert_supplier(supplier_name, meta["from"], category, classification)
                if supplier_id:
                    result.suppliers_created += 1

                if category not in EXTRACTABLE_CATEGORIES:
                    mark_processed(user_id, msg_id, meta["thread_id"], category.lower(), supplier_name)
                    continue

                # Process attachments
                attachment_text = ""
                for att in attachments:
                    try:
                        att_bytes = get_attachment(access_token, msg_id, att["attachment_id"])
                        att_text = extract_text_from_attachment(att_bytes, att["filename"])
                        if att_text:
                            attachment_text += f"\n\n--- {att['filename']} ---\n{att_text}"
                        _log(f"  ↳ Attachment: {att['filename']}")
                    except Exception as e:
                        _log(f"  ⚠ Attachment error {att['filename']}: {e}")

                source_date = meta["date"][:10] if meta.get("date") else None
                extracted = extract_supplier_data(
                    body=body,
                    subject=meta["subject"],
                    sender=meta["from"],
                    supplier_name=supplier_name,
                    source_email_id=msg_id,
                    source_date=source_date,
                    attachment_text=attachment_text,
                )

                hotels     = extracted.get("hotels", [])
                activities = extracted.get("activities", [])
                transfers  = extracted.get("transfers", [])
                total      = len(hotels) + len(activities) + len(transfers)

                _log(f"  Extracted: {len(hotels)} hotels, {len(activities)} activities, {len(transfers)} transfers")

                if total > 0:
                    _insert_hotels(hotels, result)
                    _insert_activities(activities, result)
                    _insert_transfers(transfers, result)
                    result.extracted += 1
                    mark_processed(user_id, msg_id, meta["thread_id"], "processed", supplier_name, category)
                else:
                    _log("  No structured data extracted")
                    mark_processed(user_id, msg_id, meta["thread_id"], "no_data", supplier_name, category)

            except Exception as e:
                logger.error("Error processing %s: %s", msg_id, e)
                _log(f"  ERROR: {e}")
                result.errors += 1

        summary = (
            f"\n✓ Done: {result.extracted} extracted | "
            f"{result.hotels_added}H {result.activities_added}A {result.transfers_added}T | "
            f"{result.suppliers_created} suppliers | "
            f"{result.errors} errors"
        )
        _log(summary)
        _latest_result = result.to_dict()
        _latest_result["last_run"] = datetime.utcnow().isoformat()

    finally:
        _is_syncing = False

    return result

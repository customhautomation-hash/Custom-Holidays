"""
Gmail routes — /api/gmail/...
Heartbeat-based polling. All exceptions logged explicitly.
"""
import logging
import os
import threading
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import RedirectResponse

from supabase_client import supabase
from .auth import (
    get_auth_url, exchange_code_for_tokens, get_gmail_user_email,
    save_tokens, get_tokens, get_valid_access_token, disconnect,
    GOOGLE_CLIENT_ID,
)
from .ingestion import run_ingestion, get_auto_poll_status
from .fetcher import delete_processed

logger = logging.getLogger(__name__)
router = APIRouter()

FRONTEND_URL          = os.getenv("FRONTEND_URL", "https://custom-holidays.vercel.app")
POLL_INTERVAL_SECONDS = 600

_last_sync:  dict[str, float]          = {}
_sync_locks: dict[str, threading.Lock] = {}
sync_jobs:   dict[str, dict]           = {}


def _get_user_id(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        resp = supabase.auth.get_user(token)
        if not resp or not resp.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return resp.user.id
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth failed: {e}")


@router.get("/status")
def gmail_status(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    if not GOOGLE_CLIENT_ID:
        return {"connected": False, "configured": False,
                "message": "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env"}
    tokens = get_tokens(user_id)
    if not tokens or not tokens.get("connected"):
        return {"connected": False, "configured": True, "gmail_email": None}
    poll = get_auto_poll_status()
    last = _last_sync.get(user_id, 0)
    next_in = max(0, POLL_INTERVAL_SECONDS - (time.time() - last)) if last else 0
    return {
        "connected": True, "configured": True,
        "gmail_email": tokens.get("gmail_email"),
        "auto_polling": True,
        "is_syncing": poll["is_syncing"],
        "interval_min": POLL_INTERVAL_SECONDS // 60,
        "next_sync_in_secs": int(next_in),
        "latest": poll["latest"],
    }


@router.get("/live-log")
def live_log(authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    poll = get_auto_poll_status()
    return {"is_syncing": poll["is_syncing"], "log": poll["log"], "latest": poll["latest"]}


@router.get("/debug")
def gmail_debug(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    tokens = get_tokens(user_id)
    poll = get_auto_poll_status()
    last = _last_sync.get(user_id, 0)
    token_ok = False
    token_error = None
    try:
        tok = get_valid_access_token(user_id)
        token_ok = tok is not None
    except Exception as e:
        token_error = str(e)
    try:
        from .fetcher import get_already_processed_ids
        processed_count = len(get_already_processed_ids(user_id))
    except Exception:
        processed_count = -1
    return {
        "gmail_email": tokens.get("gmail_email") if tokens else None,
        "token_valid": token_ok,
        "token_error": token_error,
        "refresh_token_set": bool(tokens.get("refresh_token")) if tokens else False,
        "already_processed": processed_count,
        "last_sync_ago_secs": int(time.time() - last) if last else None,
        "is_syncing": poll["is_syncing"],
        "log_lines": len(poll["log"]),
        "log_tail": poll["log"][-15:],
        "latest_result": poll["latest"],
    }


@router.post("/heartbeat")
def heartbeat(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    now = time.time()
    last = _last_sync.get(user_id, 0)
    if now - last < POLL_INTERVAL_SECONDS:
        remaining = int(POLL_INTERVAL_SECONDS - (now - last))
        return {"synced": False, "reason": "too_soon", "next_in_secs": remaining}
    lock = _sync_locks.setdefault(user_id, threading.Lock())
    if not lock.acquire(blocking=False):
        return {"synced": False, "reason": "already_running"}
    _last_sync[user_id] = now

    def _run():
        try:
            logger.info("[Heartbeat] ingestion start user=%s", user_id[:8])
            result = run_ingestion(user_id, max_emails=50)
            logger.info("[Heartbeat] done: %s", result.to_dict())
        except Exception as e:
            logger.error("[Heartbeat] FAILED: %s", e, exc_info=True)
        finally:
            lock.release()

    threading.Thread(target=_run, daemon=True, name=f"hb-{user_id[:8]}").start()
    return {"synced": True, "message": "Ingestion started"}


@router.get("/oauth/url")
def get_oauth_url(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Google OAuth not configured")
    return {"url": get_auth_url(state=user_id)}


@router.get("/oauth/callback")
def oauth_callback(code: str = Query(...), state: str = Query(""), error: str = Query(None)):
    if error:
        return RedirectResponse(url=f"{FRONTEND_URL}/profile?gmail_error={error}")
    if not state:
        return RedirectResponse(url=f"{FRONTEND_URL}/profile?gmail_error=missing_state")
    try:
        tokens = exchange_code_for_tokens(code)
        access_token = tokens.get("access_token")
        if not access_token:
            raise ValueError("No access token")
        gmail_email = get_gmail_user_email(access_token)
        save_tokens(state, tokens, gmail_email)
        logger.info("Gmail connected: %s → %s", state[:8], gmail_email)
        _last_sync[state] = 0
        return RedirectResponse(url=f"{FRONTEND_URL}/profile?gmail_connected=1")
    except Exception as e:
        logger.error("OAuth callback failed: %s", e)
        return RedirectResponse(url=f"{FRONTEND_URL}/profile?gmail_error={str(e)[:100]}")


@router.post("/sync-now")
def sync_now(authorization: Optional[str] = Header(None), max_emails: int = Query(50, ge=1, le=200)):
    user_id = _get_user_id(authorization)
    access_token = get_valid_access_token(user_id)
    if not access_token:
        raise HTTPException(status_code=400,
            detail="Gmail token invalid. Please disconnect and reconnect Gmail.")
    job_id = str(uuid.uuid4())
    sync_jobs[job_id] = {"status": "running", "progress": "Starting...", "result": None}
    _last_sync[user_id] = time.time()

    def _run():
        try:
            logger.info("[SyncNow] start user=%s max=%d", user_id[:8], max_emails)
            result = run_ingestion(user_id, max_emails=max_emails)
            sync_jobs[job_id]["status"] = "done"
            sync_jobs[job_id]["progress"] = (
                f"Done — {result.hotels_added}H {result.activities_added}A "
                f"{result.transfers_added}T from {result.extracted} emails"
            )
            sync_jobs[job_id]["result"] = result.to_dict()
            logger.info("[SyncNow] done: %s", result.to_dict())
        except Exception as e:
            logger.error("[SyncNow] FAILED: %s", e, exc_info=True)
            sync_jobs[job_id]["status"] = "error"
            sync_jobs[job_id]["progress"] = str(e)

    threading.Thread(target=_run, daemon=True, name=f"syncnow-{user_id[:8]}").start()
    return {"success": True, "job_id": job_id}


@router.get("/sync/status/{job_id}")
def sync_status(job_id: str):
    job = sync_jobs.get(job_id)
    if not job:
        return {"success": False, "error": "Job not found"}
    return {"success": True, **job}


@router.post("/start-polling")
def start_polling(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    _last_sync[user_id] = 0
    return {"success": True, "message": "Next heartbeat will trigger sync"}


@router.post("/stop-polling")
def stop_polling(authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    return {"success": True}


@router.post("/disconnect")
def gmail_disconnect(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    _last_sync.pop(user_id, None)
    disconnect(user_id)
    return {"success": True, "message": "Gmail disconnected"}


@router.get("/processed")
def list_processed(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    try:
        result = (
            supabase.table("gmail_processed_emails")
            .select("*").eq("user_id", user_id)
            .order("created_at", desc=True).limit(100).execute()
        )
        return {"success": True, "emails": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/processed/{message_id}")
def delete_processed_email(message_id: str, authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    try:
        delete_processed(message_id, user_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/processed")
def clear_all_processed(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    try:
        supabase.table("gmail_processed_emails").delete().eq("user_id", user_id).execute()
        _last_sync[user_id] = 0
        return {"success": True, "message": "Cleared — next sync re-processes everything"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/suppliers-overview")
def suppliers_overview(authorization: Optional[str] = Header(None)):
    """Everything the Suppliers page needs in one call: suppliers, their rates and their emails."""
    _get_user_id(authorization)
    def rows(table, cols="*", order="created_at", limit=3000):
        try:
            return supabase.table(table).select(cols).order(order, desc=True).limit(limit).execute().data or []
        except Exception as e:
            logger.warning("suppliers-overview: %s %s", table, e)
            return []
    return {
        "suppliers":  rows("suppliers"),
        "hotels":     rows("supplier_hotels"),
        "activities": rows("supplier_activities"),
        "transfers":  rows("supplier_transfers"),
        "emails":     rows("gmail_processed_emails", "supplier_name, status, extraction_type, created_at", limit=5000),
    }

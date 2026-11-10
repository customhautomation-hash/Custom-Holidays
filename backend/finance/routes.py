"""
Finance routes — /api/finance/...
Figures come from Tally through the Tally Connector on the finance PC (see tally.py).

  POST /tally/push      the connector sends Tally's figures (needs the connector key)
  GET  /summary         the Finance page reads the latest figures (signed-in staff)
  POST /connector       an Owner makes a new connector key to download the connector
  POST /targets         an Owner sets the monthly sales target and margin target
"""
import json
import logging
import secrets
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Header, HTTPException, Request

from supabase_client import supabase
from .tally import summarise

logger = logging.getLogger(__name__)
router = APIRouter()

_cache: dict = {}


def _config(key: str, ttl: int = 300) -> Optional[str]:
    hit = _cache.get(key)
    if hit and time.time() - hit[1] < ttl:
        return hit[0]
    try:
        rows = supabase.table("app_config").select("value").eq("key", key).limit(1).execute().data or []
        val = rows[0]["value"] if rows else None
    except Exception as e:
        logger.warning("app_config %s: %s", key, e)
        val = None
    _cache[key] = (val, time.time())
    return val


def _set_config(key: str, value: str) -> None:
    supabase.table("app_config").upsert({"key": key, "value": value}).execute()
    _cache[key] = (value, time.time())


def _user(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please sign in again")
    try:
        u = supabase.auth.get_user(authorization.split(" ", 1)[1]).user
    except Exception:
        u = None
    if not u:
        raise HTTPException(status_code=401, detail="Please sign in again")
    role = "member"
    try:
        rows = supabase.table("profiles").select("role").eq("id", u.id).limit(1).execute().data or []
        role = (rows[0].get("role") if rows else None) or "member"
    except Exception:
        pass
    return {"id": u.id, "role": role.lower()}


def _owner(authorization: Optional[str]) -> dict:
    u = _user(authorization)
    if u["role"] not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only an Owner can do this")
    return u


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.post("/tally/push")
async def tally_push(request: Request, x_connector_key: Optional[str] = Header(None)):
    expected = _config("tally_connector_key", ttl=60)
    if not expected or not x_connector_key or not secrets.compare_digest(expected, x_connector_key):
        raise HTTPException(status_code=401, detail="This connector's key isn't valid any more. Download a new connector from the Finance page")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Couldn't read what the connector sent")

    ping = {"at": _now(), "status": payload.get("status") or "ok", "message": (payload.get("message") or "")[:300],
            "company": payload.get("company") or "", "version": payload.get("version") or ""}
    if ping["status"] != "ok":
        _set_config("tally_last_ping", json.dumps(ping))
        return {"ok": True, "saved": False}

    try:
        summary = summarise(payload)
    except Exception as e:
        logger.warning("Tally figures couldn't be read: %s", e, exc_info=True)
        ping.update(status="unreadable", message=str(e)[:300])
        _set_config("tally_last_ping", json.dumps(ping))
        return {"ok": False, "saved": False, "message": str(e)}

    supabase.table("tally_snapshots").insert({"company": summary["company"], "as_of": summary["as_of"], "summary": summary}).execute()
    _set_config("tally_last_ping", json.dumps(ping))
    # keep the table small: the latest 200 uploads are plenty
    try:
        old = supabase.table("tally_snapshots").select("id").order("received_at", desc=True).range(200, 400).execute().data or []
        if old:
            supabase.table("tally_snapshots").delete().in_("id", [r["id"] for r in old]).execute()
    except Exception:
        pass
    return {"ok": True, "saved": True, "as_of": summary["as_of"]}


@router.get("/summary")
def finance_summary(authorization: Optional[str] = Header(None)):
    u = _user(authorization)
    latest = None
    setup_needed = False
    try:
        rows = supabase.table("tally_snapshots").select("summary, received_at").order("received_at", desc=True).limit(1).execute().data or []
        latest = rows[0] if rows else None
    except Exception as e:
        logger.warning("tally_snapshots: %s", e)
        setup_needed = True
    ping = _config("tally_last_ping", ttl=30)
    targets = _config("finance_targets", ttl=60)
    return {
        "summary": latest["summary"] if latest else None,
        "received_at": latest["received_at"] if latest else None,
        "last_ping": json.loads(ping) if ping else None,
        "targets": json.loads(targets) if targets else {},
        "connector_set_up": bool(_config("tally_connector_key", ttl=60)),
        "setup_needed": setup_needed,
        "is_owner": u["role"] in ("owner", "admin"),
    }


@router.post("/connector")
def new_connector_key(authorization: Optional[str] = Header(None)):
    """Makes a new key for the Tally Connector. Any connector installed with an older key stops working."""
    _owner(authorization)
    key = secrets.token_urlsafe(32)
    try:
        _set_config("tally_connector_key", key)
    except Exception:
        raise HTTPException(status_code=500, detail="Run supabase/finance_tally.sql in Supabase first (see Help → Company guide)")
    return {"key": key}


@router.post("/targets")
def set_targets(payload: dict = Body(...), authorization: Optional[str] = Header(None)):
    _owner(authorization)
    clean = {}
    for k in ("monthly_sales", "gross_margin"):
        try:
            v = float(payload.get(k)) if payload.get(k) not in (None, "") else None
        except (TypeError, ValueError):
            v = None
        if v is not None and v >= 0:
            clean[k] = v
    _set_config("finance_targets", json.dumps(clean))
    return {"ok": True, "targets": clean}

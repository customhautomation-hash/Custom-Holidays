"""
Price Compare routes — /api/prices/...

  GET  /status    → is SerpApi configured?
  GET  /roe       → today's exchange rate (₹ per 1 unit of a currency), fetched automatically
  POST /search    → prices for ONE hotel from every booking site Google Hotels knows (via SerpApi)
  POST /discover  → top hotels in a city (e.g. 5★ Ubud) with their lowest price
  POST /excel     → CustomHolidays costing sheet (team's standard layout) as .xlsx

Needs env var SERPAPI_KEYS (comma-separated; SERPAPI_KEY also works). Keys are used in order and the
next key is used when one runs out of monthly searches.
Results are cached in memory for 1 hour so repeating a search doesn't use extra credits.
"""
import difflib
import logging
import os
import tempfile
import time
from datetime import date
from typing import Optional, List

import requests
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from supabase_client import supabase
from .costing_sheet import build as build_costing_sheet

logger = logging.getLogger(__name__)
router = APIRouter()

SERPAPI_URL = "https://serpapi.com/search.json"
CACHE_SECONDS = 3600          # 1 hour; "Refresh" skips it and asks Google for live prices
_cache: dict = {}


# ── API key pool ───────────────────────────────────────────────────────────────
# SERPAPI_KEYS = "key1,key2,key3" (or a single SERPAPI_KEY). Keys are used in order:
# when one has no searches left this month we move to the next one. SerpApi resets each
# key's allowance monthly, so the pool starts again from key 1 automatically.
ACCOUNT_URL = "https://serpapi.com/account.json"
_left: dict = {}          # key -> (checked_at, searches_left)
LEFT_TTL = 15 * 60


def _keys() -> list:
    raw = os.getenv("SERPAPI_KEYS", "") + "," + os.getenv("SERPAPI_KEY", "")
    out = []
    for k in raw.replace("\n", ",").replace(";", ",").split(","):
        k = k.strip()
        if k and k not in out: out.append(k)
    return out


def _searches_left(key: str, fresh: bool = False) -> int:
    """Searches left on a key this month (SerpApi account API — free, doesn't use a search)."""
    hit = _left.get(key)
    if hit and not fresh and time.time() - hit[0] < LEFT_TTL:
        return hit[1]
    try:
        d = requests.get(ACCOUNT_URL, params={"api_key": key}, timeout=15).json()
        left = int(d.get("total_searches_left", d.get("plan_searches_left", 0)) or 0)
    except Exception:
        left = hit[1] if hit else 1          # unknown → try it
    _left[key] = (time.time(), left)
    return left


def _key() -> str:
    for k in _keys():
        if _searches_left(k) > 0: return k
    return ""


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


def _serp(params: dict, fresh: bool = False) -> dict:
    """One SerpApi call (cached). Moves to the next key when a key runs out. fresh=True → live prices."""
    if not _keys():
        raise HTTPException(status_code=503, detail="Price search isn't set up yet: add SERPAPI_KEYS on the server.")
    ck = tuple(sorted(params.items()))
    hit = _cache.get(ck)
    if hit and not fresh and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    extra = {"no_cache": "true"} if fresh else {}
    last_err = "All SerpApi keys have used their searches for this month."
    for key in _keys():
        if _searches_left(key) <= 0: continue
        try:
            r = requests.get(SERPAPI_URL, params={**params, **extra, "engine": "google_hotels", "api_key": key}, timeout=40)
            data = r.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Price search failed: {e}")
        err = data.get("error")
        if err and ("run out" in err.lower() or "searches" in err.lower() and "limit" in err.lower() or "invalid api key" in err.lower()):
            _left[key] = (time.time(), 0)          # skip this key, try the next one
            last_err = err
            continue
        if err and "hasn't returned any results" in err.lower():
            data = {"properties": []}
        elif err:
            raise HTTPException(status_code=502, detail=err)
        n, left = _left.get(key, (time.time(), 1))
        _left[key] = (n, max(0, left - 1))
        _cache[ck] = (time.time(), data)
        return data
    raise HTTPException(status_code=429, detail=last_err)


def _num(v) -> Optional[float]:
    if isinstance(v, (int, float)): return float(v)
    if isinstance(v, dict):
        for k in ("extracted_lowest", "extracted_before_taxes_fees"):
            if isinstance(v.get(k), (int, float)): return float(v[k])
    return None


def _nights(ci: str, co: str) -> int:
    try:
        return max(1, (date.fromisoformat(co) - date.fromisoformat(ci)).days)
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD and check-out after check-in")


# Only these websites are shown (plus the hotel's own website). Edit this list to add/remove sites.
ALLOWED_SITES = {"bookingcom": "Booking.com", "agoda": "Agoda", "expedia": "Expedia",
                 "hotelscom": "Hotels.com", "makemytrip": "MakeMyTrip"}


def _site(item: dict, hotel_name: str = "") -> Optional[str]:
    """Allowed site name for a price row, or None to hide it."""
    src = (item.get("source") or "").strip()
    key = "".join(ch for ch in src.lower() if ch.isalnum())
    for k, name in ALLOWED_SITES.items():
        if key.startswith(k):
            return name
    if item.get("official") or "official" in src.lower() or (hotel_name and _similar(src, hotel_name) >= 0.6):
        return "Hotel website"
    return None


def _totals(obj: dict, nights: int):
    total = _num(obj.get("total_rate"))
    per = _num(obj.get("rate_per_night"))
    if total is None and per is not None: total = per * nights
    if per is None and total is not None: per = total / nights
    return total, per


def extract_rooms(prop: dict, nights: int) -> dict:
    """Every named room Google lists, per site: {source: [{name, total, per_night, free_cancellation, link}]} cheapest first."""
    out = {}
    for item in (prop.get("featured_prices") or []) + (prop.get("prices") or []):
        src = _site(item, prop.get("name") or "")
        if not src: continue
        for rm in (item.get("rooms") or []):
            rt, rp = _totals(rm, nights)
            name = str(rm.get("name") or "").strip()
            if rt is None or not name: continue
            lst = out.setdefault(src, [])
            if any(x["name"] == name and abs(x["total"] - rt) < 1 for x in lst): continue
            lst.append({"name": name, "total": round(rt), "per_night": round(rp or rt / max(nights, 1)),
                        "free_cancellation": bool(rm.get("free_cancellation")), "link": rm.get("link") or item.get("link")})
    for v in out.values(): v.sort(key=lambda x: x["total"])
    return out


def extract_prices(prop: dict, nights: int) -> List[dict]:
    """All booking-site prices for one property → [{source, total, per_night, room, free_cancellation, link}] cheapest first.
    Google lists the individual rooms (name + price) for its featured sites; for those we keep the cheapest room's name."""
    best = {}
    for item in (prop.get("featured_prices") or []) + (prop.get("prices") or []):
        src = _site(item, prop.get("name") or "")
        if not src: continue
        free = bool(item.get("free_cancellation")) or any(bool(rm.get("free_cancellation")) for rm in (item.get("rooms") or []))
        cands = []
        total, per = _totals(item, nights)
        if total is not None:
            cands.append((total, per, None, item.get("link")))
        for rm in (item.get("rooms") or []):
            rt, rp = _totals(rm, nights)
            if rt is not None and rm.get("name"):
                cands.append((rt, rp, str(rm.get("name")).strip(), rm.get("link") or item.get("link")))
        if not cands: continue
        # cheapest; if the item price and a named room cost the same, keep the room name
        cands.sort(key=lambda c: (round(c[0]), c[2] is None))
        t, pn, room, link = cands[0]
        if room is None:
            same = [c for c in cands if c[2] and abs(c[0] - t) <= max(1.0, t * 0.005)]
            if same: room = same[0][2]
        tr = item.get("total_rate") if isinstance(item.get("total_rate"), dict) else {}
        before = tr.get("extracted_before_taxes_fees")
        row = {"source": src, "total": round(t), "per_night": round(pn), "link": link, "room": room,
               "before_tax": round(before) if isinstance(before, (int, float)) and before < t else None,
               "free_cancellation": free}
        old = best.get(src)
        if not old or row["total"] < old["total"] or (row["total"] == old["total"] and room and not old.get("room")):
            best[src] = row
    return sorted(best.values(), key=lambda x: x["total"])


def _similar(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()


class Room(BaseModel):
    adults: int = 2
    children_ages: List[int] = []


class SearchIn(BaseModel):
    hotel: str
    city: str = ""
    check_in: str
    check_out: str
    adults: int = 2
    children: int = 0
    currency: str = "INR"
    property_token: Optional[str] = None
    rooms: Optional[List[Room]] = None        # several rooms → priced per room and added up
    fresh: bool = False                       # True → skip caches, live prices from Google


def _occupancy(adults: int, ages: List[int]) -> dict:
    """SerpApi guests for ONE room (Google Hotels prices one room at a time)."""
    ages = [max(1, min(17, int(a or 1))) for a in (ages or [])]
    out = {"adults": max(1, int(adults or 1)), "children": len(ages)}
    if ages: out["children_ages"] = ",".join(str(a) for a in ages)
    return out


def _room_groups(body) -> list:
    """Identical rooms are searched once: [(occupancy_params, how_many_rooms)]."""
    rooms = body.rooms or [Room(adults=body.adults, children_ages=[])]
    groups: dict = {}
    for r in rooms:
        occ = _occupancy(r.adults, r.children_ages)
        k = tuple(sorted(occ.items()))
        groups[k] = (occ, groups.get(k, (occ, 0))[1] + 1)
    return list(groups.values())


# ── ROE (exchange rate) ────────────────────────────────────────────────────────
# Free, keyless sources tried in order: European Central Bank reference rates (via Frankfurter),
# then open.er-api.com (covers AED etc. that the ECB doesn't publish). Cached 1 hour.
_roe_cache: dict = {}
ROE_TTL = 3600


def _fetch_roe(ccy: str) -> dict:
    ccy = ccy.upper()
    if ccy == "INR":
        return {"ccy": "INR", "roe": 1.0, "source": "—", "date": date.today().isoformat()}
    hit = _roe_cache.get(ccy)
    if hit and time.time() - hit[0] < ROE_TTL:
        return hit[1]
    tries = [
        ("ECB (European Central Bank)", f"https://api.frankfurter.dev/v1/latest?from={ccy}&to=INR",
         lambda d: (d["rates"]["INR"], d.get("date"))),
        ("ECB (European Central Bank)", f"https://api.frankfurter.app/latest?from={ccy}&to=INR",
         lambda d: (d["rates"]["INR"], d.get("date"))),
        ("ExchangeRate-API", f"https://open.er-api.com/v6/latest/{ccy}",
         lambda d: (d["rates"]["INR"], (d.get("time_last_update_utc") or "")[5:16])),
    ]
    for name, url, pick in tries:
        try:
            r = requests.get(url, timeout=12)
            r.raise_for_status()
            rate, day = pick(r.json())
            out = {"ccy": ccy, "roe": round(float(rate), 4), "source": name, "date": day or date.today().isoformat()}
            _roe_cache[ccy] = (time.time(), out)
            return out
        except Exception as e:
            logger.warning("ROE source %s failed for %s: %s", name, ccy, e)
    if hit:                                     # every source down → last known rate
        return {**hit[1], "stale": True}
    raise HTTPException(status_code=502, detail=f"Couldn't fetch today's {ccy} rate. Try again in a minute.")


@router.get("/roe")
def roe(ccy: str = "USD", authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    return _fetch_roe(ccy)


@router.get("/status")
def status(authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    keys = _keys()
    lefts = [_searches_left(k, fresh=True) for k in keys]
    active = next((i + 1 for i, l in enumerate(lefts) if l > 0), None)
    return {"configured": bool(keys), "keys": len(keys), "searches_left": sum(lefts), "active_key": active}


def _search_one(body: SearchIn, occ: dict, nights: int, token: Optional[str]) -> dict:
    """Prices for ONE room with the given guests."""
    base = {"check_in_date": body.check_in, "check_out_date": body.check_out, **occ,
            "currency": body.currency.upper(), "gl": "in", "hl": "en"}
    if token:                      # hotel picked from "Find hotels" → 1 search instead of 2
        data = _serp({**base, "q": body.hotel, "property_token": token}, body.fresh)
    else:
        data = _serp({**base, "q": f"{body.hotel} {body.city}".strip()}, body.fresh)
    searches = 1
    prop = data
    if not (data.get("prices") or data.get("featured_prices")):
        props = data.get("properties") or []
        if not props:
            return {"found": False, "hotel": body.hotel, "prices": [], "searches_used": searches}
        prop = max(props, key=lambda p: _similar(p.get("name", ""), body.hotel))
        if _similar(prop.get("name", ""), body.hotel) < 0.45:
            return {"found": False, "hotel": body.hotel, "prices": [], "searches_used": searches,
                    "suggestions": [p.get("name") for p in props[:5]]}
        if prop.get("property_token"):
            prop = {**prop, **_serp({**base, "q": body.hotel, "property_token": prop["property_token"]}, body.fresh)}
            searches += 1
    prices = extract_prices(prop, nights)
    imgs = prop.get("images") or []
    return {"found": True, "hotel": body.hotel, "name": prop.get("name") or body.hotel,
            "stars": prop.get("extracted_hotel_class"), "rating": prop.get("overall_rating"),
            "reviews": prop.get("reviews"), "image": (imgs[0].get("thumbnail") if imgs else None),
            "link": prop.get("link"), "property_token": prop.get("property_token"),
            "nights": nights, "currency": body.currency.upper(), "prices": prices, "site_rooms": extract_rooms(prop, nights),
            "lowest": prices[0] if prices else None, "searches_used": searches}


@router.post("/search")
def search(body: SearchIn, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    nights = _nights(body.check_in, body.check_out)
    groups = _room_groups(body)
    first = _search_one(body, groups[0][0], nights, body.property_token)
    n_rooms = sum(n for _, n in groups)
    if not first.get("found") or (len(groups) == 1 and groups[0][1] == 1):
        return {**first, "rooms": n_rooms}
    token = first.get("property_token") or body.property_token
    parts = [(first["prices"], groups[0][1])]
    used = first["searches_used"]
    for occ, n in groups[1:]:
        r = _search_one(body, occ, nights, token)
        used += r.get("searches_used", 1)
        parts.append((r.get("prices") or [], n))
    # a site counts only if it has a price for every room type; total = sum of all rooms
    combined = []
    for p in parts[0][0]:
        rows = [next((x for x in prices if x["source"] == p["source"]), None) for prices, _ in parts]
        if any(x is None for x in rows): continue
        total = sum(x["total"] * n for x, (_, n) in zip(rows, parts))
        bt = [x.get("before_tax") or x["total"] for x in rows]
        before = sum(b * n for b, (_, n) in zip(bt, parts))
        combined.append({"source": p["source"], "total": round(total), "per_night": round(total / nights),
                         "before_tax": round(before) if before < total else None,
                         "link": p.get("link"), "room": p.get("room"),
                         "free_cancellation": all(x["free_cancellation"] for x in rows)})
    combined.sort(key=lambda x: x["total"])
    return {**first, "prices": combined, "lowest": combined[0] if combined else None,
            "searches_used": used, "rooms": n_rooms}


class DiscoverIn(BaseModel):
    city: str
    check_in: str
    check_out: str
    adults: int = 2
    stars: Optional[int] = 5
    currency: str = "INR"
    limit: int = 25
    rooms: Optional[List[Room]] = None


@router.post("/discover")
def discover(body: DiscoverIn, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    nights = _nights(body.check_in, body.check_out)
    rooms = body.rooms or [Room(adults=body.adults)]
    occ = _occupancy(rooms[0].adults, rooms[0].children_ages)
    params = {"q": f"hotels in {body.city}", "check_in_date": body.check_in, "check_out_date": body.check_out,
              **occ, "currency": body.currency.upper(), "gl": "in", "hl": "en"}
    if body.stars: params["hotel_class"] = str(body.stars)
    data = _serp(params)
    out = []
    for p in (data.get("properties") or []):
        if (p.get("type") or "hotel").lower() != "hotel": continue
        cls = p.get("extracted_hotel_class")
        if body.stars and cls and int(cls) < int(body.stars): continue   # Google mixes in lower-class hotels → keep only the stars asked for
        total = _num(p.get("total_rate")) or ((_num(p.get("rate_per_night")) or 0) * nights) or None
        if not total: continue                 # Google has no price for these dates → don't show it
        imgs = p.get("images") or []
        # cheapest of YOUR sites (Booking.com, Agoda, Expedia, Hotels.com, MakeMyTrip, hotel website), if Google lists it
        src, src_total, src_link = None, None, None
        for item in (p.get("prices") or []):
            name = _site(item, p.get("name") or "")
            if not name: continue
            t = _num(item.get("total_rate")) or ((_num(item.get("rate_per_night")) or 0) * nights) or None
            if t and (src_total is None or t < src_total):
                src, src_total, src_link = name, t, item.get("link")
        best = src_total or total
        out.append({"name": p.get("name"), "stars": p.get("extracted_hotel_class"), "rating": p.get("overall_rating"),
                    "reviews": p.get("reviews"), "lowest_total": round(best * len(rooms)),
                    "lowest_source": src, "lowest_link": src_link,
                    "image": imgs[0].get("thumbnail") if imgs else None, "property_token": p.get("property_token")})
        if len(out) >= body.limit: break
    out.sort(key=lambda h: h["lowest_total"] or 9e12)
    return {"city": body.city, "hotels": out, "searches_used": 1}


@router.post("/excel")
def excel(body: dict, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    name = ((body.get("trip") or {}).get("name") or "Trip").replace("/", "-")
    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False); tmp.close()
    os.unlink(tmp.name)                       # builder must create a fresh workbook
    try:
        build_costing_sheet(body, tmp.name)
    except Exception as e:
        logger.exception("costing sheet failed")
        raise HTTPException(status_code=400, detail=f"Could not build the sheet: {e}")
    return FileResponse(tmp.name, filename=f"{name} costing.xlsx",
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        background=BackgroundTask(lambda: os.path.exists(tmp.name) and os.unlink(tmp.name)))


# ── Vision check: read the price from a screenshot of the booking site (Gemini) ─────────────────
# Env: GEMINI_API_KEY (free key from aistudio.google.com), optional GEMINI_MODEL (default gemini-flash-latest).
# The extension screenshots the price box of the checker window; Price Compare sends it here and compares the
# answer with what the page reader found. The key never leaves the server.
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
VISION_PROMPT = """You are reading a screenshot of a hotel booking website ({site}).
We expect: hotel "{hotel}", check-in {check_in}, check-out {check_out} ({nights} nights), {adults} adults, {rooms} room(s).
Find the FINAL TOTAL price for the whole stay as shown on this page (including taxes and fees if the page shows a total that includes them).
Do NOT use per-night prices, crossed-out prices, savings/discount amounts, deposits, "pay today" amounts of 0, or prices of other hotels.
Return ONLY JSON with these keys:
{{"found": true/false, "total": number or null, "currency": "INR"/"USD"/... or null,
 "total_incl_taxes": number (the total WITH taxes and fees, usually labelled "Total") or null,
 "total_excl_taxes": number (price before taxes, if shown separately) or null,
 "taxes": number (taxes and fees amount, if shown) or null,
 "per_night": number or null, "includes_taxes": true/false/null,
 "room": string or null, "hotel_name": string or null,
 "check_in": "YYYY-MM-DD" or null, "check_out": "YYYY-MM-DD" or null, "nights": number or null, "adults": number or null,
 "cancellation": short text exactly as the site states it (e.g. "Free cancellation until 20 Oct 2026, 18:00", "Non-refundable") or null,
 "cxl_type": "free" | "partial" | "non-refundable" | null,
 "free_until": "YYYY-MM-DD" (last day you can cancel for free) or null,
 "cxl_fee": number (what you pay if you cancel after the free period, or the fee for a partially refundable rate) or null,
 "cxl_fee_currency": "INR"/... or null,
 "cxl_fee_from": "YYYY-MM-DD" (from when that fee applies) or null,
 "cxl_fee_note": short text (e.g. "first night's rate plus taxes", "100% of the stay") or null,
 "cxl_fee_percent": number (fee as % of the total, e.g. 50, 100) or null,
 "noshow": short ("100%", "same as cancellation fee", "₹13,123") or null,
 "cxl_summary": ONE short line with ONLY dates, amounts and percentages – no sentences. Use the stay currency for amounts.
   Examples: "Free till 18 Nov 2026 · after: fee ₹4,375 (1st night) · no-show: same"
             "50% fee (₹1,14,423) if cancelled · no-show: 100%"
             "Non-refundable · 100% charged (₹13,123)"
   or null,
 "meal": short text (e.g. "Breakfast included", "Room only") or null,
 "page": "checkout" | "hotel page" | "list of hotels" | "robot check" | "other",
 "confidence": "high" | "medium" | "low"}}
Write numbers without commas or currency symbols. If the page shows no clear total for this stay, set found=false."""


class VisionIn(BaseModel):
    image: str                       # data URL or base64 JPEG/PNG
    image2: str = ""                 # optional 2nd screenshot (cancellation section)
    policy_text: str = ""            # the cancellation policy text read from the page
    site: str = ""
    hotel: str = ""
    check_in: str = ""
    check_out: str = ""
    nights: int = 0
    adults: int = 2
    rooms: int = 1


def _gemini_key() -> str:
    return (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()


def _openrouter_key() -> str:
    return (os.getenv("OPENROUTER_API_KEY") or "").strip()


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _json_from(text: str) -> dict:
    import json as _json
    return _json.loads(text[text.find("{"): text.rfind("}") + 1])


def _ai_json(prompt: str, images: list = None, timeout: int = 60):
    """Ask Gemini; if it isn't set up, is over its free limit or fails → OpenRouter (backup). Returns (answer dict, model)."""
    images = images or []            # [(mime, base64)]
    errors = []
    gk = _gemini_key()
    if gk:
        model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
        payload = {"contents": [{"parts": [{"text": prompt}, *[{"inline_data": {"mime_type": m, "data": d}} for m, d in images]]}],
                   "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
        try:
            r = requests.post(GEMINI_URL.format(model=model), json=payload, timeout=timeout,
                              headers={"x-goog-api-key": gk, "Content-Type": "application/json"})
            if r.status_code < 400:
                return _json_from(r.json()["candidates"][0]["content"]["parts"][0]["text"]), model
            errors.append(f"Gemini {r.status_code}" + (" (free limit reached)" if r.status_code == 429 else ""))
            logger.warning("Gemini error %s: %s", r.status_code, r.text[:300])
        except Exception as e:
            errors.append(f"Gemini: {e}")
    ok = _openrouter_key()
    if ok:
        model = os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-super-vl:free")
        content = [{"type": "text", "text": prompt + "\nAnswer with the JSON only."}] + \
                  [{"type": "image_url", "image_url": {"url": f"data:{m};base64,{d}"}} for m, d in images]
        try:
            r = requests.post(OPENROUTER_URL, timeout=timeout + 30,
                              headers={"Authorization": f"Bearer {ok}", "Content-Type": "application/json",
                                       "HTTP-Referer": "https://businessos-roan-iota.vercel.app", "X-Title": "Custom Holidays Price Compare"},
                              json={"model": model, "temperature": 0, "messages": [{"role": "user", "content": content}]})
            if r.status_code < 400:
                return _json_from(r.json()["choices"][0]["message"]["content"] or ""), "openrouter:" + model
            errors.append(f"OpenRouter {r.status_code}")
            logger.warning("OpenRouter error %s: %s", r.status_code, r.text[:300])
        except Exception as e:
            errors.append(f"OpenRouter: {e}")
    if not gk and not ok:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY isn't set on the server (and no OPENROUTER_API_KEY backup)")
    raise HTTPException(status_code=502, detail="AI reading failed: " + "; ".join(errors))


@router.get("/vision/status")
def vision_status(authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    return {"configured": bool(_gemini_key() or _openrouter_key()), "model": os.getenv("GEMINI_MODEL", "gemini-flash-latest"),
            "backup": os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-super-vl:free") if _openrouter_key() else None}


@router.post("/vision")
def vision(body: VisionIn, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    def _part(img: str):
        mime = "image/jpeg"
        if img.startswith("data:"):
            head, img = img.split(",", 1)
            mime = head[5:].split(";")[0] or mime
        if len(img) > 6_000_000:
            raise HTTPException(status_code=413, detail="Screenshot too large")
        return (mime, img)
    images = [_part(body.image)] + ([_part(body.image2)] if body.image2 else [])
    prompt = VISION_PROMPT.format(site=body.site or "a booking site", hotel=body.hotel, check_in=body.check_in or "?",
                                  check_out=body.check_out or "?", nights=body.nights or "?", adults=body.adults, rooms=body.rooms)
    if body.policy_text:
        prompt += "\nThe page's own cancellation-policy text (use it for the cxl_* fields):\n" + body.policy_text[:1500]
    if len(images) > 1:
        prompt += "\nThere are 2 screenshots of the same page: the price area and the cancellation-policy area."
    try:
        out, model = _ai_json(prompt, images, 45)
    except HTTPException as e:
        if e.status_code == 502 and "429" in str(e.detail): raise HTTPException(status_code=429, detail="Free vision limit reached for today")
        raise
    for k in ("total", "per_night", "cxl_fee", "total_incl_taxes", "total_excl_taxes", "taxes"):
        try:
            out[k] = float(str(out.get(k)).replace(",", "")) if out.get(k) not in (None, "") else None
        except Exception:
            out[k] = None
    out["model"] = model
    return out


# ── Room types: the same room on different sites, grouped (Gemini reads the names; the page falls back to word matching) ──
class RoomName(BaseModel):
    site: str
    name: str


class RoomGroupIn(BaseModel):
    hotel: str
    rooms: List[RoomName]


ROOM_GROUP_PROMPT = """These are the room names that different booking sites show for the hotel "{hotel}".
Sites name the same room differently (extras, offers and meal plans are added to names).
Group the names that are the SAME physical room type (same category, same bed type, same view).
Ignore meal plans, offers and perks ("with breakfast", "20% off spa", "happy hours", "lounge access" etc.) when grouping.
Give each group a short clean name like "Superior Room, King bed" or "Deluxe Suite, Sea view".
Return JSON only: {{"groups": [{{"type": "<short name>", "ids": [<numbers>]}}]}} — every id exactly once.
Names:
{names}"""


@router.post("/rooms/group")
def rooms_group(body: RoomGroupIn, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    rooms = body.rooms[:150]
    names = "\n".join(f"{i}. [{r.site}] {r.name[:160]}" for i, r in enumerate(rooms))
    out, model = _ai_json(ROOM_GROUP_PROMPT.format(hotel=body.hotel, names=names), [], 45)
    try:
        groups = []
        seen = set()
        for g in out.get("groups") or []:
            ids = [int(i) for i in (g.get("ids") or []) if str(i).lstrip("-").isdigit() and 0 <= int(i) < len(rooms) and int(i) not in seen]
            seen.update(ids)
            if ids: groups.append({"type": str(g.get("type") or rooms[ids[0]].name)[:80], "ids": ids})
        for i in range(len(rooms)):
            if i not in seen: groups.append({"type": rooms[i].name[:80], "ids": [i]})
    except Exception:
        raise HTTPException(status_code=502, detail="Gemini gave an unreadable answer")
    return {"groups": groups, "model": model}


# ── Hotel website: read its rooms and rates from the page text (every booking engine looks different) ──
class SiteTextIn(BaseModel):
    hotel: str
    text: str
    check_in: str = ""
    check_out: str = ""
    nights: int = 0
    adults: int = 2


SITE_ROOMS_PROMPT = """This is the text of the booking page of the hotel "{hotel}" on its own website.
The stay: check-in {check_in}, check-out {check_out} ({nights} nights), {adults} adults, 1 room.
List EVERY bookable rate shown (each room type x each rate plan). For each:
- "room": the room name exactly as written
- "rate": the rate plan name as written (e.g. "Flexible rate - breakfast included")
- "meal": one of "Room only", "Breakfast", "Half board", "Full board", "All inclusive"
- "cxl": short cancellation in numbers only, e.g. "Non-refundable", "Free till 2026-10-25", "Free till 24h before arrival", "" if not shown
- "cxl_full": the cancellation / pricing conditions text if shown, else ""
- "per_night": the price per night if the page shows one, else null
- "total": the price for the WHOLE stay of {nights} nights INCLUDING VAT, taxes, fees and local / city tax (add them if shown separately).
  If the page only shows a per-night price, total = per-night price x {nights}. Never return a per-night or "from" price as the total.
- "taxes_included": true if "total" includes the taxes, false if the page only gave a price before taxes
- "price_shown": the exact price text you used, as written on the page (e.g. "€1,482.00 total, local tax €32 extra")
- "currency": ISO code (INR, EUR, ...)
Use the public / non-member price when both are shown. Only rates for {adults} adults: skip "single use" / 1-guest rates. Do not invent rooms or prices that aren't on the page.
Return JSON only: {{"rooms": [...], "dates_on_page": "<check-in to check-out as shown, or empty>"}}
Page text:
{text}"""


@router.post("/rooms/read")
def rooms_read(body: SiteTextIn, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    prompt = SITE_ROOMS_PROMPT.format(hotel=body.hotel, check_in=body.check_in or "?", check_out=body.check_out or "?",
                                      nights=body.nights or "?", adults=body.adults, text=body.text[:40000])
    out, model = _ai_json(prompt, [], 60)
    rooms = []
    for x in out.get("rooms") or []:
        try:
            t = float(str(x.get("total")).replace(",", ""))
        except Exception:
            continue
        if t <= 0 or not x.get("room"): continue
        pn = None
        try:
            pn = float(str(x.get("per_night")).replace(",", "")) if x.get("per_night") not in (None, "") else None
        except Exception:
            pn = None
        if pn and body.nights and t < pn * body.nights * 0.9:      # a per-night price was given as the total
            t = round(pn * body.nights, 2)
        rooms.append({"price_shown": str(x.get("price_shown") or "")[:120], "room": str(x.get("room"))[:120], "rate": str(x.get("rate") or "")[:80], "meal": str(x.get("meal") or "Room only"),
                      "cxl": str(x.get("cxl") or "")[:60], "cxl_full": str(x.get("cxl_full") or "")[:1200], "total": round(t, 2),
                      "taxes_included": bool(x.get("taxes_included", True)), "currency": str(x.get("currency") or "INR").upper()[:3]})
    return {"rooms": rooms, "dates_on_page": out.get("dates_on_page") or "", "model": model}

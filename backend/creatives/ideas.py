"""
ideas.py - fresh reel ideas every day, based on what people are looking at right now.

Where "trending" comes from (all free, no keys; each one is optional, so one being down never breaks it):
  1. Google Trends, India: today's top searches (we keep the travel-related ones)
  2. Google News, India: this week's travel headlines (new routes, visa news, festivals, hot destinations)
  3. Reddit r/travel and r/IndiaTravel: what travellers are talking about this week
  4. The calendar: today's date, the season, and Indian holidays and long weekends coming up

The AI turns these into 6 ready-to-use reel briefs for Custom Holidays. Ideas are saved for the day
(so the page loads instantly) and every idea ever suggested is remembered, so the same destination or
angle isn't suggested again for a long time. "New ideas" makes another fresh set on demand.
"""
import json
import re
import random
import threading
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

import requests

from creatives.qwen import _chat, REEL_MODEL

UA = {"User-Agent": "Mozilla/5.0 (CustomHolidays-Dashboard/1.0)"}
IST = timezone(timedelta(hours=5, minutes=30))
_lock = threading.Lock()
_memory: dict = {}          # used if the app_config table isn't there


# ── Saved state (Supabase app_config, falls back to memory) ───────────────

def _get(key: str):
    try:
        from supabase_client import supabase
        rows = supabase.table("app_config").select("value").eq("key", key).limit(1).execute().data or []
        return json.loads(rows[0]["value"]) if rows else None
    except Exception:
        return _memory.get(key)


def _set(key: str, value) -> None:
    _memory[key] = value
    try:
        from supabase_client import supabase
        supabase.table("app_config").upsert({"key": key, "value": json.dumps(value)}).execute()
    except Exception as e:
        print("Saving reel ideas failed (kept in memory):", e)


# ── Trend sources ─────────────────────────────────────────────────────────

def _rss_titles(url: str, limit: int) -> list:
    r = requests.get(url, headers=UA, timeout=10)
    r.raise_for_status()
    root = ET.fromstring(r.content)
    out = []
    for item in root.iter("item"):
        t = (item.findtext("title") or "").strip()
        if t:
            out.append(re.sub(r"\s+-\s+[^-]{2,40}$", "", t))   # drop " - Source name"
        if len(out) >= limit:
            break
    return out


def _google_trends() -> list:
    return _rss_titles("https://trends.google.com/trending/rss?geo=IN", 25)


def _travel_news() -> list:
    out = []
    for q in ["travel trend when:7d", "tourism destination Indians when:7d", "visa free Indians when:14d", "luxury travel when:7d"]:
        try:
            out += _rss_titles(f"https://news.google.com/rss/search?q={requests.utils.quote(q)}&hl=en-IN&gl=IN&ceid=IN:en", 8)
        except Exception as e:
            print("News feed failed:", e)
    return out


def _reddit() -> list:
    out = []
    for sub in ["travel", "IndiaTravel", "solotravel"]:
        try:
            r = requests.get(f"https://www.reddit.com/r/{sub}/top.json?t=week&limit=12", headers=UA, timeout=10)
            r.raise_for_status()
            out += [c["data"]["title"] for c in r.json().get("data", {}).get("children", []) if c.get("data", {}).get("title")]
        except Exception as e:
            print("Reddit failed:", sub, e)
    return out


def gather_trends() -> dict:
    """Collects today's signals from every source that answers."""
    found = {"searches": [], "news": [], "travellers": []}
    for key, fn in (("searches", _google_trends), ("news", _travel_news), ("travellers", _reddit)):
        try:
            found[key] = list(dict.fromkeys(fn()))[:30]
        except Exception as e:
            print("Trend source failed:", key, e)
    return found


# ── Ideas ─────────────────────────────────────────────────────────────────

FORMATS = ["slow cinematic destination film", "numbered top-5 list", "day-by-day itinerary", "hotel or villa tour",
           "limited-time offer", "travel tips / things nobody tells you", "fast trend reel with quick cuts",
           "POV reel", "before-you-go checklist", "hidden gems", "budget vs luxury comparison", "festival or event reel",
           "honeymoon special", "family trip special", "food trail", "myth vs fact"]


def _make_ideas(trends: dict, avoid: list, now: datetime) -> list:
    formats = random.sample(FORMATS, 8)
    prompt = f"""
You are the head of social media at Custom Holidays, a luxury travel company in Mumbai that sells
international and Indian holidays to well-off Indian couples and families.

Today is {now.strftime('%A, %d %B %Y')} in India. Suggest 6 Instagram reel ideas to post in the next few days
that ride on what is trending RIGHT NOW. Use these real signals from today:

Top Google searches in India today: {json.dumps(trends.get('searches', [])[:25], ensure_ascii=False)}
Travel news this week: {json.dumps(trends.get('news', [])[:25], ensure_ascii=False)}
What travellers are talking about this week: {json.dumps(trends.get('travellers', [])[:25], ensure_ascii=False)}

Also think about: the season right now and the next 6-8 weeks (weather at popular destinations), Indian
festivals, school holidays and long weekends coming up, and when people book (usually 1-3 months ahead).

Rules:
- Each idea must clearly connect to something real above (a trending search, a news story, a travel
  conversation) or to the season / an upcoming holiday. Say which in "why".
- Mix the formats. Use several of these: {', '.join(formats)}.
- 6 DIFFERENT destinations or angles. Do NOT repeat any of these recent ideas (destinations or angles):
  {json.dumps(avoid[-80:], ensure_ascii=False)}
- Ignore trends that have nothing to do with travel or that are sad, political or controversial.
- "brief" is ready to paste into our reel maker: 1-3 sentences naming the places or shots, the mood,
  who it's for, and a closing line. No prices unless it's an offer (then use a believable "From ₹..." price).

Return ONLY a JSON array of 6 objects, nothing else:
[{{"label": "2-3 word button name", "brief": "...", "why": "Trending: <the signal, under 12 words>", "topic": "main destination or angle"}}]
"""
    last = None
    for _ in range(2):
        try:
            text = _chat([{"role": "user", "content": prompt}], timeout=120, model=REEL_MODEL)
            text = re.sub(r"<think>.*?</think>|```json|```", "", text, flags=re.DOTALL)
            s, e = text.find("["), text.rfind("]") + 1
            ideas = [i for i in json.loads(text[s:e]) if isinstance(i, dict) and i.get("brief")]
            if ideas:
                return [{"label": str(i.get("label") or i.get("topic") or "Idea")[:28], "brief": str(i["brief"]).strip(),
                         "why": str(i.get("why") or "").strip()[:120], "topic": str(i.get("topic") or i.get("label") or "")[:60]}
                        for i in ideas[:6]]
        except Exception as e:
            last = e
            print("Reel ideas attempt failed:", e)
    raise Exception(f"Ideas couldn't be made just now ({last})")


def todays_ideas(fresh: bool = False) -> dict:
    """Today's ideas. Made once a day (or again when `fresh`), never repeating recent ones."""
    now = datetime.now(IST)
    day = now.strftime("%Y-%m-%d")
    with _lock:
        saved = _get("reel_ideas_today")
        if saved and saved.get("day") == day and saved.get("ideas") and not fresh:
            return saved
        history = _get("reel_ideas_history") or []
        trends = gather_trends()
        ideas = _make_ideas(trends, [h.get("topic", "") + ": " + h.get("label", "") for h in history], now)
        sources = [n for n, k in (("Google searches", "searches"), ("travel news", "news"), ("traveller talk", "travellers")) if trends.get(k)]
        result = {"day": day, "made": now.strftime("%H:%M"), "ideas": ideas, "sources": sources + ["the season and upcoming holidays"]}
        _set("reel_ideas_today", result)
        _set("reel_ideas_history", (history + [{"day": day, "label": i["label"], "topic": i["topic"]} for i in ideas])[-150:])
        return result

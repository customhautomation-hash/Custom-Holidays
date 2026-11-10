"""
stock.py - real photos, real video clips and free music for the Reel maker.

Photos and video clips come from Pexels (free for commercial use; set PEXELS_API_KEY on Render,
free from pexels.com/api). Without a key, photos fall back to Openverse (Creative Commons, no key).
Music comes from Openverse (Creative Commons music, mostly from Jamendo; no key needed).
Only CC0 and CC BY are used, which allow business use; CC BY needs the credit line we return.

Every file is copied into our own Supabase storage so the browser can draw it on the reel canvas.
"""
import os
import uuid
from urllib.parse import urlparse

import requests

from creatives.flux import ensure_bucket

PEXELS_KEY = os.getenv("PEXELS_API_KEY", "")
UA = {"User-Agent": "CustomHolidays-Dashboard/1.0"}
OPENVERSE = "https://api.openverse.org/v1"
MUSIC_HOSTS = ("jamendo.com", "freesound.org", "ccmixter.org", "wikimedia.org")
MAX_BYTES = 40 * 1024 * 1024
MAX_VIDEO_BYTES = 22 * 1024 * 1024   # a few seconds of 720p is ~5-15MB; bigger files are skipped


def _store(content: bytes, bucket: str, ext: str, content_type: str) -> str:
    from supabase_client import supabase
    ensure_bucket(bucket)
    name = f"{uuid.uuid4()}{ext}"
    supabase.storage.from_(bucket).upload(path=name, file=content, file_options={"content-type": content_type})
    return f"{os.getenv('SUPABASE_URL', '').rstrip('/')}/storage/v1/object/public/{bucket}/{name}"


def _download(url: str, timeout: int = 60, limit: int = MAX_BYTES) -> bytes:
    """Downloads a file in one go, with a hard limit on size and on total time, so one slow or
    huge file can never hang the server (the free server has very little memory)."""
    import time
    started = time.time()
    with requests.get(url, headers=UA, timeout=(10, 20), stream=True) as r:
        r.raise_for_status()
        size = int(r.headers.get("Content-Length") or 0)
        if size and size > limit:
            raise Exception("That file is too large")
        data = bytearray()
        for chunk in r.iter_content(256 * 1024):
            data.extend(chunk)
            if len(data) > limit:
                raise Exception("That file is too large")
            if time.time() - started > timeout:
                raise Exception("That file took too long to download")
    return bytes(data)


# ── Photos and video clips ────────────────────────────────────────────────

import re as _re

_STOP = {"the", "a", "an", "of", "in", "at", "and", "with", "on", "to", "for"}


def _words(text: str) -> set:
    return {w for w in _re.findall(r"[a-z0-9]+", (text or "").lower()) if w not in _STOP and len(w) > 1}


def _describe(url: str) -> str:
    """Pexels pages are named after what they show: /photo/aerial-view-of-fushimi-inari-12345/"""
    return " ".join(_re.findall(r"[a-z]+", (urlparse(url).path or "").replace("-", " ").lower()))


def _score(item: dict, query: str, seconds: float = 0) -> float:
    q = _words(query)
    words = _words(item.get("about", ""))
    match = len(q & words) / max(1, len(q))                     # how much of the search it actually shows
    w, h = item.get("w") or 0, item.get("h") or 0
    portrait = 1.0 if h >= w * 1.2 else 0.5 if h >= w else 0.0  # vertical shots fill a reel best
    sharp = min(1.0, min(w, h) / 1080) if w and h else 0.5
    fits = 1.0
    if item.get("duration") is not None:                        # clips must last long enough
        d = item["duration"] or 0
        fits = 0.0 if d < seconds else 1.0 if d <= max(30, seconds * 4) else 0.6
    return match * 3 + portrait * 1.5 + sharp + fits * 1.5 - item.get("rank", 0) * 0.04


def _pexels_photos(query: str) -> list:
    r = requests.get("https://api.pexels.com/v1/search", headers={"Authorization": PEXELS_KEY, **UA},
                     params={"query": query, "per_page": 40}, timeout=20)
    r.raise_for_status()
    return [{"id": f"pexels-photo-{p['id']}", "url": p["src"].get("large2x") or p["src"]["original"], "w": p.get("width"), "h": p.get("height"),
             "about": f"{p.get('alt', '')} {_describe(p.get('url', ''))}", "rank": n,
             "credit": f"Photo: {p.get('photographer', 'Pexels')} on Pexels", "link": p.get("url", "")}
            for n, p in enumerate(r.json().get("photos", []))]


def _pexels_videos(query: str) -> list:
    r = requests.get("https://api.pexels.com/v1/videos/search", headers={"Authorization": PEXELS_KEY, **UA},
                     params={"query": query, "per_page": 40}, timeout=20)
    r.raise_for_status()
    out = []
    for n, v in enumerate(r.json().get("videos", [])):
        files = [f for f in v.get("video_files", []) if f.get("file_type") == "video/mp4" and f.get("width") and f.get("height")]
        if not files:
            continue
        # A light HD file: the smallest one that is at least ~720 on its short side (sharp enough for a
        # phone screen, a fraction of the size of 1080p/4K). Small files keep the free server fast.
        good = sorted([f for f in files if min(f["width"], f["height"]) >= 700], key=lambda f: f["width"] * f["height"])
        f = good[0] if good else max(files, key=lambda f: f["width"] * f["height"])
        out.append({"id": f"pexels-video-{v['id']}", "url": f["link"], "w": v.get("width") or f["width"], "h": v.get("height") or f["height"],
                    "about": _describe(v.get("url", "")), "rank": n, "duration": v.get("duration"),
                    "credit": f"Video: {v.get('user', {}).get('name', 'Pexels')} on Pexels", "link": v.get("url", "")})
    return out


def _openverse_photos(query: str) -> list:
    r = requests.get(f"{OPENVERSE}/images/", headers=UA, timeout=25,
                     params={"q": query, "license": "cc0,by,pdm", "size": "large", "page_size": 20})
    r.raise_for_status()
    out = []
    for n, x in enumerate(r.json().get("results", [])):
        if not x.get("url"):
            continue
        lic = (x.get("license") or "").upper()
        out.append({"id": f"ov-{x.get('id')}", "url": x["url"], "w": x.get("width"), "h": x.get("height"), "about": f"{x.get('title', '')} {' '.join(t.get('name', '') for t in (x.get('tags') or [])[:10])}",
                    "rank": n, "credit": f"Photo: {x.get('creator') or 'unknown'} ({'CC ' + lic if lic not in ('CC0', 'PDM') else 'public domain'}) via Openverse",
                    "link": x.get("foreign_landing_url", "")})
    return out


def _creator(credit: str) -> str:
    m = _re.match(r"(?:Photo|Video): (.+?)(?: on Pexels| \(| via |$)", credit or "")
    return (m.group(1) if m else "").strip().lower()


def find_stock(query: str, kind: str = "photo", pick: int = 0, alt: str = "", exclude: list | None = None, seconds: float = 0,
               avoid_credits: list | None = None) -> dict:
    """Finds the best real photo (or video clip) for a scene: it must show what was searched for, be
    vertical and sharp, (for clips) last long enough, and not already be used elsewhere in the reel.
    `pick` steps through the next-best ones for Swap clip. The file is copied to our storage."""
    query = (query or "").strip()[:100]
    if not query:
        raise Exception("Nothing to search for")
    exclude = set(exclude or [])
    avoid = {_creator(c) for c in (avoid_credits or [])} - {""}
    searches = [q for q in dict.fromkeys([query, (alt or "").strip(), " ".join(query.split()[:2])]) if q]
    pool, seen, source = [], set(), ""
    for q in searches:
        found = []
        if PEXELS_KEY:
            try:
                found = _pexels_videos(q) if kind == "video" else _pexels_photos(q)
                source = "pexels"
            except Exception as e:
                print("Pexels search failed:", e)
        if not found and kind != "video":
            try:
                found = _openverse_photos(q); source = source or "openverse"
            except Exception as e:
                print("Openverse search failed:", e)
        for it in found:
            if it["id"] in seen or it["id"] in exclude:
                continue
            seen.add(it["id"])
            it["score"] = _score(it, query, seconds) - (0.8 if q != query else 0)   # backups rank a little lower
            if _creator(it["credit"]) and _creator(it["credit"]) in avoid:          # same person, often the same shoot
                it["score"] -= 2.5
            pool.append(it)
        if len([p for p in pool if p["score"] >= 4]) >= 6:
            break
    if not pool:
        if kind == "video" and not PEXELS_KEY:
            raise Exception("Real video clips need a free Pexels key (PEXELS_API_KEY on Render)")
        raise Exception("No match found for this scene")
    pool.sort(key=lambda it: -it["score"])
    # Try the chosen one; if it is too big, too slow or broken, quietly use the next best (up to 3 tries)
    last = None
    for step in range(min(3, len(pool))):
        choice = pool[(pick + step) % len(pool)]
        try:
            data = _download(choice["url"], timeout=45, limit=MAX_VIDEO_BYTES if kind == "video" else MAX_BYTES)
        except Exception as e:
            print("Stock download skipped:", choice["id"], e)
            last = e
            continue
        url = _store(data, "stock", ".mp4" if kind == "video" else ".jpg", "video/mp4" if kind == "video" else "image/jpeg")
        del data
        return {"url": url, "id": choice["id"], "credit": choice["credit"], "link": choice.get("link", ""), "source": source,
                "options": len(pool), "pick": (pick + step) % len(pool)}
    raise Exception("No usable clip found for this scene" if kind == "video" else "No usable photo found for this scene")


# ── Music ─────────────────────────────────────────────────────────────────

JAMENDO_ID = os.getenv("JAMENDO_CLIENT_ID", "")
_SPEED = {"calm": "verylow low", "medium": "medium", "high": "high veryhigh"}   # Jamendo takes space-separated values
_JUNK = ("loop", "sfx", "sound effect", "jingle", "ringtone", "intro", "stinger", "demo", "test")


def _business_ok(url: str) -> str:
    """'CC0' or 'CC BY' when a Jamendo/CC licence allows business use in a video, else ''."""
    u = (url or "").lower()
    if "publicdomain" in u or "/zero/" in u:
        return "CC0"
    if "/by/" in u:                       # not -nc (no business use), -nd (no edits) or -sa (share-alike)
        return "CC BY"
    return ""


def _jamendo(tags: list, energy: str, min_seconds: int, page: int) -> list:
    base = {"client_id": JAMENDO_ID, "format": "json", "limit": 50, "offset": page * 50, "include": "musicinfo licenses",
            "audioformat": "mp32", "order": "popularity_total", "vocalinstrumental": "instrumental",
            "durationbetween": f"{max(20, min_seconds)}_400"}
    attempts = [dict(fuzzytags=" ".join(tags[:4]), speed=_SPEED.get(energy, "")), dict(fuzzytags=" ".join(tags[:2])), dict(tags=tags[0] if tags else "")]
    out = []
    for extra in attempts:
        params = {**base, **{k: v for k, v in extra.items() if v}}
        r = requests.get("https://api.jamendo.com/v3.0/tracks/", params=params, timeout=20)
        r.raise_for_status()
        for n, x in enumerate(r.json().get("results", [])):
            lic = _business_ok(x.get("license_ccurl", ""))
            if not lic or not x.get("audio") or any(t["id"] == f"jam-{x['id']}" for t in out):
                continue
            mi = x.get("musicinfo") or {}
            tg = mi.get("tags") or {}
            words = set((tg.get("genres") or []) + (tg.get("vartags") or []) + (tg.get("instruments") or []))
            out.append({"id": f"jam-{x['id']}", "title": x.get("name") or "Untitled", "creator": x.get("artist_name") or "unknown",
                        "seconds": int(x.get("duration") or 0), "license": lic, "url": x["audio"], "link": x.get("shareurl", ""),
                        "tags": sorted(words), "rank": n, "speed": mi.get("speed", ""),
                        "credit": f"Music: \"{x.get('name') or 'Untitled'}\" by {x.get('artist_name') or 'unknown'}" + ("" if lic == "CC0" else " (CC BY) via Jamendo")})
        if len(out) >= 12:
            break
    return out


def _openverse_music(tags: list, query: str) -> list:
    out = []
    for q in list(dict.fromkeys([" ".join(tags[:2]), *(tags[:3]), query]))[:4]:
        if not q:
            continue
        r = requests.get(f"{OPENVERSE}/audio/", headers=UA, timeout=25,
                         params={"q": q, "license": "cc0,by", "category": "music", "page_size": 30})
        r.raise_for_status()
        for n, x in enumerate(r.json().get("results", [])):
            if not x.get("url") or any(t["id"] == x["id"] for t in out):
                continue
            lic = (x.get("license") or "").upper()
            words = {str(t.get("name", "")).lower() for t in (x.get("tags") or [])} | {str(g).lower() for g in (x.get("genres") or [])}
            out.append({"id": x["id"], "title": x.get("title") or "Untitled", "creator": x.get("creator") or "unknown",
                        "seconds": round((x.get("duration") or 0) / 1000), "license": "CC0" if lic == "CC0" else "CC BY",
                        "url": x["url"], "link": x.get("foreign_landing_url", ""), "tags": sorted(w for w in words if w)[:12], "rank": n,
                        "credit": f"Music: \"{x.get('title') or 'Untitled'}\" by {x.get('creator') or 'unknown'}" + ("" if lic == "CC0" else f" (CC BY {x.get('license_version') or ''})".replace(" )", ")"))})
    return out


def find_music(query: str, min_seconds: int = 0, tags: list | None = None, energy: str = "", page: int = 0) -> list:
    """Music that fits the reel's vibe (CC0 / CC BY only, safe for business use).
    With a free Jamendo key it searches Jamendo directly: instrumental tracks, by genre/mood tags and tempo,
    most popular first (the best-produced tracks). Otherwise Openverse. Every track is then scored on how many
    of the wanted tags it really has, the right tempo, being long enough, and not being a jingle or loop."""
    tags = [t for t in (tags or []) if t] or [w for w in _re.findall(r"[a-z]+", (query or "").lower()) if w not in _STOP][:4] or ["cinematic"]
    tracks = []
    if JAMENDO_ID:
        try:
            tracks = _jamendo(tags, energy, min_seconds, page)
        except Exception as e:
            print("Jamendo failed:", e)
    if len(tracks) < 5:
        tracks += [t for t in _openverse_music(tags, query) if t["id"] not in {x["id"] for x in tracks}]
    want = set(tags)
    for t in tracks:
        have = set(t.get("tags") or []) | _words(t["title"])
        t["matches"] = sorted(want & have)
        fits = 1.0 if t["seconds"] >= min_seconds else 0.3
        junk = any(j in t["title"].lower() for j in _JUNK) or t["seconds"] < 20
        tempo = 0.0
        if energy and t.get("speed"):
            tempo = 1.0 if t["speed"] in _SPEED.get(energy, "").split() else -0.5
        t["score"] = len(t["matches"]) * 2 + fits * 2 + tempo - t.get("rank", 0) * 0.03 - (4 if junk else 0)
    tracks.sort(key=lambda t: -t["score"])
    if not JAMENDO_ID and page:
        tracks = tracks[page * 12:] or tracks
    for t in tracks:
        t.pop("rank", None); t.pop("score", None)
    return tracks[:12]


def fetch_music(url: str) -> str:
    host = urlparse(url).hostname or ""
    if not any(host == h or host.endswith("." + h) for h in MUSIC_HOSTS):
        raise Exception("That music source isn't allowed")
    data = _download(url)
    return _store(data, "music", ".mp3", "audio/mpeg")

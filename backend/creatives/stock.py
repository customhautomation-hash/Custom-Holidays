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


def find_stock(query: str, kind: str = "photo", pick: int = 0, alt: str = "", exclude: list | None = None, seconds: float = 0) -> dict:
    """Finds the best real photo (or video clip) for a scene: it must show what was searched for, be
    vertical and sharp, (for clips) last long enough, and not already be used elsewhere in the reel.
    `pick` steps through the next-best ones for Swap clip. The file is copied to our storage."""
    query = (query or "").strip()[:100]
    if not query:
        raise Exception("Nothing to search for")
    exclude = set(exclude or [])
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

def find_music(query: str, min_seconds: int = 0) -> list:
    """Creative Commons music (CC0 / CC BY, safe for business use) matching a mood, longest-fitting first."""
    tracks = []
    for q in [query, " ".join((query or "").split()[:1])]:
        if not q:
            continue
        r = requests.get(f"{OPENVERSE}/audio/", headers=UA, timeout=25,
                         params={"q": q, "license": "cc0,by", "category": "music", "page_size": 20})
        r.raise_for_status()
        for x in r.json().get("results", []):
            if not x.get("url") or any(t["id"] == x["id"] for t in tracks):
                continue
            secs = round((x.get("duration") or 0) / 1000)
            lic = (x.get("license") or "").upper()
            tracks.append({
                "id": x["id"], "title": x.get("title") or "Untitled", "creator": x.get("creator") or "unknown",
                "seconds": secs, "license": "CC0" if lic == "CC0" else f"CC BY {x.get('license_version') or ''}".strip(),
                "url": x["url"], "link": x.get("foreign_landing_url", ""),
                "credit": f"Music: \"{x.get('title') or 'Untitled'}\" by {x.get('creator') or 'unknown'}" + ("" if lic == "CC0" else f" (CC BY {x.get('license_version') or ''})".replace(" )", ")")),
            })
        if len(tracks) >= 6:
            break
    tracks.sort(key=lambda t: (t["seconds"] < min_seconds, abs(t["seconds"] - max(min_seconds, 60))))
    return tracks[:12]


def fetch_music(url: str) -> str:
    host = urlparse(url).hostname or ""
    if not any(host == h or host.endswith("." + h) for h in MUSIC_HOSTS):
        raise Exception("That music source isn't allowed")
    data = _download(url)
    return _store(data, "music", ".mp3", "audio/mpeg")

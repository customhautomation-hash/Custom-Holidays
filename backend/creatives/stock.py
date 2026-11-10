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


def _store(content: bytes, bucket: str, ext: str, content_type: str) -> str:
    from supabase_client import supabase
    ensure_bucket(bucket)
    name = f"{uuid.uuid4()}{ext}"
    supabase.storage.from_(bucket).upload(path=name, file=content, file_options={"content-type": content_type})
    return f"{os.getenv('SUPABASE_URL', '').rstrip('/')}/storage/v1/object/public/{bucket}/{name}"


def _download(url: str, timeout: int = 90) -> bytes:
    r = requests.get(url, headers=UA, timeout=timeout, stream=True)
    r.raise_for_status()
    data = b""
    for chunk in r.iter_content(256 * 1024):
        data += chunk
        if len(data) > MAX_BYTES:
            raise Exception("That file is too large")
    return data


# ── Photos and video clips ────────────────────────────────────────────────

def _pexels_photos(query: str) -> list:
    r = requests.get("https://api.pexels.com/v1/search", headers={"Authorization": PEXELS_KEY, **UA},
                     params={"query": query, "orientation": "portrait", "per_page": 15}, timeout=20)
    r.raise_for_status()
    return [{"url": p["src"].get("large2x") or p["src"]["original"], "credit": f"Photo: {p.get('photographer', 'Pexels')} on Pexels",
             "link": p.get("url", "")} for p in r.json().get("photos", [])]


def _pexels_videos(query: str) -> list:
    r = requests.get("https://api.pexels.com/v1/videos/search", headers={"Authorization": PEXELS_KEY, **UA},
                     params={"query": query, "orientation": "portrait", "size": "medium", "per_page": 15}, timeout=20)
    r.raise_for_status()
    out = []
    for v in r.json().get("videos", []):
        files = [f for f in v.get("video_files", []) if f.get("file_type") == "video/mp4" and f.get("width") and f.get("height")]
        portrait = [f for f in files if f["height"] >= f["width"]] or files
        # closest to 1080 wide, never bigger than needed
        portrait.sort(key=lambda f: (abs(min(f["width"], f["height"]) - 1080), f["width"] * f["height"]))
        if portrait:
            out.append({"url": portrait[0]["link"], "credit": f"Video: {v.get('user', {}).get('name', 'Pexels')} on Pexels",
                        "link": v.get("url", ""), "duration": v.get("duration")})
    return out


def _openverse_photos(query: str) -> list:
    r = requests.get(f"{OPENVERSE}/images/", headers=UA, timeout=25,
                     params={"q": query, "license": "cc0,by,pdm", "size": "large", "page_size": 15})
    r.raise_for_status()
    out = []
    for x in r.json().get("results", []):
        if not x.get("url"):
            continue
        lic = (x.get("license") or "").upper()
        out.append({"url": x["url"], "credit": f"Photo: {x.get('creator') or 'unknown'} ({'CC ' + lic if lic not in ('CC0', 'PDM') else 'public domain'}) via Openverse",
                    "link": x.get("foreign_landing_url", "")})
    return out


def find_stock(query: str, kind: str = "photo", pick: int = 0) -> dict:
    """Finds a real photo (or video clip) for a scene, copies it to our storage and returns its address and credit."""
    query = (query or "").strip()[:100]
    if not query:
        raise Exception("Nothing to search for")
    results, source = [], ""
    if PEXELS_KEY:
        try:
            results = _pexels_videos(query) if kind == "video" else _pexels_photos(query)
            source = "pexels"
        except Exception as e:
            print("Pexels search failed:", e)
    if not results and kind == "video":
        raise Exception("Real video clips need a free Pexels key (PEXELS_API_KEY on Render)" if not PEXELS_KEY else "No video clip found for this scene")
    if not results:
        results, source = _openverse_photos(query), "openverse"
    if not results:
        raise Exception("No photo found for this scene")
    choice = results[pick % len(results)]
    data = _download(choice["url"])
    if kind == "video":
        url = _store(data, "stock", ".mp4", "video/mp4")
    else:
        url = _store(data, "stock", ".jpg", "image/jpeg")
    return {"url": url, "credit": choice["credit"], "link": choice.get("link", ""), "source": source, "options": len(results)}


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

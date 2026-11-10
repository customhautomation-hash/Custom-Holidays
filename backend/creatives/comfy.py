"""
comfy.py — one place for talking to ComfyUI (the video AI) on the office's main PC.

The main PC runs ComfyUI and a small gate (tools/video-studio/comfy-gate.py) that only lets in
requests carrying the right key. A permanent public address (Tailscale Funnel or ngrok) points at
the gate. Set on Render:
    COMFY_URL  the permanent address, e.g. https://main-pc.your-tailnet.ts.net
    COMFY_KEY  the key printed by the gate on the main PC
"""
import os
import re
import time

import requests

COMFY_URL = os.getenv("COMFY_URL", "").rstrip("/")
COMFY_KEY = os.getenv("COMFY_KEY", "")
HEADERS = {
    "X-CH-Key": COMFY_KEY,
    "ngrok-skip-browser-warning": "1",           # only matters if the address is an ngrok one
    "User-Agent": "CustomHolidays-Dashboard/1.0",
}

_status_cache: dict = {"at": 0.0, "value": None}


def configured() -> bool:
    return bool(COMFY_URL)


def url(path: str) -> str:
    if path.startswith("http"):
        return path
    return f"{COMFY_URL}/{path.lstrip('/')}"


def get(path: str, **kw) -> requests.Response:
    kw.setdefault("timeout", 30)
    return requests.get(url(path), headers={**HEADERS, **kw.pop("headers", {})}, **kw)


def post(path: str, **kw) -> requests.Response:
    kw.setdefault("timeout", 30)
    return requests.post(url(path), headers={**HEADERS, **kw.pop("headers", {})}, **kw)


def status(max_age: float = 20.0) -> dict:
    """Is the video PC reachable right now? Cached for a few seconds."""
    if _status_cache["value"] and time.time() - _status_cache["at"] < max_age:
        return _status_cache["value"]
    if not configured():
        value = {"online": False, "reason": "not_set_up"}
    else:
        try:
            r = get("/system_stats", timeout=8)
            if r.status_code == 401:
                value = {"online": False, "reason": "wrong_key"}
            elif not r.ok:
                value = {"online": False, "reason": "offline"}
            else:
                d = r.json()
                dev = (d.get("devices") or [{}])[0]
                q = {}
                try:
                    q = get("/queue", timeout=8).json()
                except Exception:
                    pass
                value = {"online": True, "gpu": re.sub(r"^\w+:\d+\s+", "", (dev.get("name") or "").split(" : ")[0]).strip(),
                         "queue": len(q.get("queue_running", [])) + len(q.get("queue_pending", []))}
        except Exception:
            value = {"online": False, "reason": "offline"}
    _status_cache.update(at=time.time(), value=value)
    return value


def require_online() -> None:
    s = status(max_age=5)
    if not s["online"]:
        raise Exception({
            "not_set_up": "The video studio isn't connected yet. See Help → Company guide → Video studio.",
            "wrong_key": "The video PC refused the dashboard's key. Check COMFY_KEY on Render.",
        }.get(s.get("reason"), "The video PC is switched off or ComfyUI isn't running. Start it on the main PC and try again."))

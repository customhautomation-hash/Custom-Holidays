import os
import uuid
import base64
import requests
import threading
import time


CF_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CF_EMAIL = os.getenv("CLOUDFLARE_EMAIL")
CF_GLOBAL_KEY = os.getenv("CLOUDFLARE_GLOBAL_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


KEEP_DAYS = 3   # pictures and videos made on the Creatives page are kept this long, then removed to save space


def delete_old_files():
    """Remove generated pictures and videos older than KEEP_DAYS. Newer ones are never touched."""
    from datetime import datetime, timedelta, timezone
    try:
        from supabase_client import supabase
    except Exception:
        return
    cutoff = datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)
    for bucket in ("generated-images", "videos"):
        try:
            files = supabase.storage.from_(bucket).list(options={"limit": 1000}) or []
            old = []
            for f in files:
                stamp = f.get("created_at") or f.get("updated_at")
                if not stamp:
                    continue
                try:
                    when = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
                except ValueError:
                    continue
                if when < cutoff:
                    old.append(f["name"])
            if old:
                supabase.storage.from_(bucket).remove(old)
                print(f"Removed {len(old)} files older than {KEEP_DAYS} days from {bucket}")
        except Exception as e:
            print(f"Cleanup of {bucket} skipped: {e}")


def cleanup_loop():
    time.sleep(120)   # let the server finish starting first
    while True:
        delete_old_files()
        time.sleep(6 * 3600)


# Start cleanup thread
threading.Thread(target=cleanup_loop, daemon=True).start()


def _crop_to_ratio(image_bytes: bytes, ratio: str) -> bytes:
    """The picture model always makes a square. Cut it to the shape asked for (centre crop)."""
    try:
        w_r, h_r = [float(x) for x in (ratio or "1:1").split(":")]
        if not w_r or not h_r or abs(w_r / h_r - 1) < 0.01:
            return image_bytes
        import io
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = img.size
        target = w_r / h_r
        if w / h > target:
            nw = int(h * target); left = (w - nw) // 2; img = img.crop((left, 0, left + nw, h))
        else:
            nh = int(w / target); top = (h - nh) // 2; img = img.crop((0, top, w, top + nh))
        out = io.BytesIO(); img.save(out, "JPEG", quality=92)
        return out.getvalue()
    except Exception as e:
        print(f"Crop skipped: {e}")
        return image_bytes


def generate_image(image_prompt: str, ratio: str = "1:1") -> str:
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell"

    response = requests.post(
        url,
        headers={
            "X-Auth-Email": CF_EMAIL,
            "X-Auth-Key": CF_GLOBAL_KEY,
            "Content-Type": "application/json",
        },
        json={"prompt": image_prompt.strip()},
        timeout=60,
    )

    if not response.ok:
        raise Exception(f"Cloudflare failed: {response.text}")

    data = response.json()
    image_b64 = data["result"]["image"]
    image_bytes = base64.b64decode(image_b64)
    image_bytes = _crop_to_ratio(image_bytes, ratio)

    filename = f"{uuid.uuid4()}.jpg"
    upload_url = f"{SUPABASE_URL}/storage/v1/object/generated-images/{filename}"

    upload_res = requests.post(
        upload_url,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "image/jpeg",
        },
        data=image_bytes,
        timeout=30,
    )

    if not upload_res.ok:
        raise Exception(f"Supabase upload failed: {upload_res.text}")

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/generated-images/{filename}"
    return public_url
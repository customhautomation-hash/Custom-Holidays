import os
import time
import uuid
import json
import threading
import requests

from creatives.utils import submit, wait
from creatives.workflows import load_workflow

from creatives import comfy

OUTPUT = "outputs/videos"
os.makedirs(OUTPUT, exist_ok=True)

RATIO_PRESETS = {
    "16:9": {"width": 1280, "height": 720},
    "9:16": {"width": 720,  "height": 1280},
    "1:1":  {"width": 768,  "height": 768},
    "4:3":  {"width": 1024, "height": 768},
}

WIDTH_NODE    = "267:257"
HEIGHT_NODE   = "267:258"
DURATION_NODE = "267:225"


def _extract_public_url(get_public_url_result, bucket: str, filename: str) -> str:
    result = get_public_url_result
    if isinstance(result, str) and result:
        return result
    if isinstance(result, dict):
        candidate = (
            result.get("publicUrl")
            or result.get("publicURL")
            or result.get("public_url")
        )
        if candidate:
            return candidate
        nested = result.get("data")
        if isinstance(nested, dict):
            candidate = (
                nested.get("publicUrl")
                or nested.get("publicURL")
                or nested.get("public_url")
            )
            if candidate:
                return candidate
    for attr in ("public_url", "publicUrl", "publicURL"):
        candidate = getattr(result, attr, None)
        if candidate:
            return candidate
    raise Exception(
        f"Could not resolve a public URL from Supabase for '{filename}' in bucket "
        f"'{bucket}'. get_public_url() returned: {result!r}."
    )


def _upload_video_to_supabase(local_path: str, new_filename: str) -> str:
    from supabase_client import supabase
    bucket = "videos"
    from creatives.flux import ensure_bucket
    ensure_bucket(bucket)
    with open(local_path, "rb") as f:
        upload_response = supabase.storage.from_(bucket).upload(
            path=new_filename,
            file=f,
            file_options={"content-type": "video/mp4"},
        )
    upload_error = None
    if isinstance(upload_response, dict):
        upload_error = upload_response.get("error")
    else:
        upload_error = getattr(upload_response, "error", None)
    if upload_error:
        raise Exception(f"Supabase upload failed for '{new_filename}': {upload_error}")
    public_url_result = supabase.storage.from_(bucket).get_public_url(new_filename)
    public_url = _extract_public_url(public_url_result, bucket, new_filename)
    print("\nSUPABASE PUBLIC URL:")
    print(public_url)
    return public_url


def generate_video_from_text(
    prompt: str,
    ratio: str = "9:16",
    duration_seconds: int = 5,
):
    print("\n")
    print("=" * 100)
    print("TEXT-TO-VIDEO GENERATION")
    print("=" * 100)
    print("RATIO:   ", ratio)
    print("DURATION:", duration_seconds, "seconds")
    print("PROMPT:  ", prompt[:120])

    workflow = load_workflow("ttv.json")

    # Patch resolution
    preset = RATIO_PRESETS.get(ratio, RATIO_PRESETS["9:16"])
    if WIDTH_NODE in workflow:
        workflow[WIDTH_NODE]["inputs"]["value"] = preset["width"]
        print(f"WIDTH  node {WIDTH_NODE} → {preset['width']}")
    else:
        print(f"WARNING: width node {WIDTH_NODE} not found in ttv.json")

    if HEIGHT_NODE in workflow:
        workflow[HEIGHT_NODE]["inputs"]["value"] = preset["height"]
        print(f"HEIGHT node {HEIGHT_NODE} → {preset['height']}")
    else:
        print(f"WARNING: height node {HEIGHT_NODE} not found in ttv.json")

    # Patch duration
    if DURATION_NODE in workflow:
        workflow[DURATION_NODE]["inputs"]["value"] = max(1, duration_seconds)
        print(f"DURATION node {DURATION_NODE} → {duration_seconds}s")
    else:
        print(f"WARNING: duration node {DURATION_NODE} not found in ttv.json")

    final_prompt = f"""
{prompt}

Ultra photorealistic.
Luxury commercial quality.
Cinematic. Smooth. Meditative.
Natural, smooth, physically accurate motion.
8K. HDR. Perfect temporal consistency — no flickering, no morphing.
No watermark. No logos. No subtitles. No on-screen text.
"""

    prompt_node = None
    switch_node = None

    for key, value in workflow.items():
        if not isinstance(value, dict):
            continue
        if value.get("class_type") == "PrimitiveStringMultiline":
            prompt_node = key
        if (
            value.get("class_type") == "PrimitiveBoolean"
            and value.get("_meta", {}).get("title") == "Switch to Text to Video?"
        ):
            switch_node = key

    if prompt_node is None:
        raise Exception("PrimitiveStringMultiline node not found in workflow.")

    workflow[prompt_node]["inputs"]["value"] = final_prompt

    if switch_node is not None:
        workflow[switch_node]["inputs"]["value"] = True

    print("\n")
    print("=" * 100)
    print("WORKFLOW READY")
    print("=" * 100)
    print("PROMPT NODE:", prompt_node)
    print("SWITCH NODE:", switch_node)

    prompt_id = submit(workflow)
    print(f"\n[ttv] Submitted prompt_id: {prompt_id}")
    print("WAITING FOR TTV VIDEO GENERATION...\n")

    result = wait(prompt_id)

    outputs = result.get("outputs", {})

    print("\n")
    print("=" * 100)
    print("COMFY OUTPUTS")
    print("=" * 100)
    print(json.dumps(outputs, indent=4))

    for node_id, node in outputs.items():
        video = None
        if "videos" in node:
            video = node["videos"][0]
        elif "gifs" in node:
            video = node["gifs"][0]
        elif "images" in node:
            for item in node["images"]:
                fname = item.get("filename", "")
                if fname.lower().endswith(".mp4"):
                    video = item
                    break

        if video is None:
            continue

        print("\n")
        print("=" * 100)
        print("VIDEO FOUND")
        print("=" * 100)
        print(video)

        filename = video["filename"]
        subfolder = video.get("subfolder", "")

        url = (
            "/view?"
            f"filename={filename}"
            f"&subfolder={subfolder}"
            f"&type=output"
        )

        print("\nDOWNLOAD URL:")
        print(url)

        response = comfy.get(url, timeout=300)
        response.raise_for_status()

        new_filename = f"{uuid.uuid4()}.mp4"
        save_path = os.path.join(OUTPUT, new_filename)

        with open(save_path, "wb") as f:
            f.write(response.content)

        print("\n")
        print("=" * 100)
        print("VIDEO SAVED")
        print("=" * 100)
        print(save_path)

        public_url = _upload_video_to_supabase(save_path, new_filename)

        # Old videos are tidied up by the storage cleanup in flux.py (after 3 days)

        try:

            os.remove(save_path)

        except Exception:

            pass

        print("\nRETURNING:")
        print(public_url)

        return public_url

    print("\n")
    print("=" * 100)
    print("VIDEO ERROR")
    print("=" * 100)
    print("No video found in ComfyUI outputs.")
    print("Raw outputs:", json.dumps(outputs, indent=2))

    raise Exception("No video found in ComfyUI outputs.")
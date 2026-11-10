import os
import time
import uuid
import json
import threading
import requests

from creatives.utils import submit, wait, push_image
from creatives.workflows import load_workflow

from creatives import comfy

OUTPUT = "outputs/videos"

os.makedirs(OUTPUT, exist_ok=True)

# Resolution presets — these are the raw values fed into PrimitiveInt nodes
# The workflow internally divides width and height by 2
RATIO_PRESETS = {
    "16:9": {"width": 1280, "height": 720},
    "9:16": {"width": 720,  "height": 1280},
    "1:1":  {"width": 768,  "height": 768},
    "4:3":  {"width": 1024, "height": 768},
}


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


def generate_video_from_image(
    image_path: str,
    image_prompt: str,
    video_prompt: str,
    ratio: str = "9:16",
    duration_seconds: int = 5,
):
    print("\n")
    print("=" * 100)
    print("VIDEO GENERATION")
    print("=" * 100)
    print("IMAGE PATH:", image_path)
    print("RATIO:", ratio)
    print("DURATION:", duration_seconds, "seconds")
    print("IMAGE PROMPT:", image_prompt[:100])
    print("VIDEO PROMPT:", video_prompt[:100])

    workflow = load_workflow("ltx23.json")

    filename = push_image(image_path)

    final_prompt = f"""
You are animating an EXISTING IMAGE into a slow, cinematic luxury travel video.

The uploaded image is the ONLY reference. Do not change anything about it.

STRICT RULES — NEVER VIOLATE:

Do NOT speed up any motion.
Do NOT create fast cuts or transitions.
Do NOT add people or crowds that are not in the original image.
Do NOT change the location, architecture, landscape, or objects.
Do NOT change the colors, lighting, or atmosphere.
Do NOT change the composition or framing.
Do NOT morph, hallucinate, or replace any element.
Do NOT create any artificial or CGI-looking motion.
The first frame MUST be identical to the uploaded photograph.

MOTION STYLE — STRICTLY SLOW AND CINEMATIC:

All motion must be extremely slow, smooth, and graceful.
Think: luxury hotel commercial, National Geographic documentary, Condé Nast Traveller film.
Motion speed should feel like time is moving at 0.3x normal speed.
Every movement should feel deliberate, peaceful, and meditative.
The video should feel like a living photograph, not an animation.

ALLOWED MOTION TYPES (choose only what fits the scene):

- Extremely slow camera push forward — barely perceptible drift into the scene
- Gentle, almost imperceptible camera tilt upward revealing sky
- Ultra-slow parallax effect — foreground elements drift slightly slower than background
- Clouds drifting slowly across the sky — very slow, like watching a time-lapse in reverse
- Water surface shimmering slowly — subtle light reflections moving gently
- River or waterfall flowing — slow and smooth, not rushing
- Leaves or trees swaying gently in a soft breeze — very minimal movement
- Flags or fabric rippling slowly in wind — smooth and graceful
- Steam or mist rising slowly — ethereal, dreamlike
- Golden light slowly shifting — as if the sun is moving just slightly
- Shadows creeping very slowly across architecture
- Birds gliding silently in the distance — far away, slow arcs

IMAGE DESCRIPTION (what is in the photograph):
{image_prompt}

SPECIFIC ANIMATION REQUIRED:
{video_prompt}

FINAL QUALITY REQUIREMENTS:

Ultra photorealistic.
Luxury travel commercial quality.
Cinematic. Slow. Meditative. Peaceful.
8K. HDR. Natural physics.
Perfect temporal consistency — no flickering, no morphing.
The scene must feel alive but completely still at the same time.
Like a photograph that learned to breathe.
"""

    image_node = None
    prompt_node = None

    for key, value in workflow.items():
        if not isinstance(value, dict):
            continue
        if value.get("class_type") == "LoadImage":
            image_node = key
        if value.get("class_type") == "PrimitiveStringMultiline":
            prompt_node = key

    if image_node is None:
        raise Exception("LoadImage node not found in workflow.")
    if prompt_node is None:
        raise Exception("PrimitiveStringMultiline node not found in workflow.")

    # Set image and prompt
    workflow[image_node]["inputs"]["image"] = filename
    workflow[prompt_node]["inputs"]["value"] = final_prompt

    # Set ratio (width and height PrimitiveInt nodes)
    preset = RATIO_PRESETS.get(ratio, RATIO_PRESETS["9:16"])
    if "320:312" in workflow:
        workflow["320:312"]["inputs"]["value"] = preset["width"]
    if "320:299" in workflow:
        workflow["320:299"]["inputs"]["value"] = preset["height"]

    # Set duration (seconds → PrimitiveInt node 320:301)
    # frames = duration_seconds * frame_rate + 1 (handled by workflow math)
    if "320:301" in workflow:
        workflow["320:301"]["inputs"]["value"] = max(1, duration_seconds)

    print("\n")
    print("=" * 100)
    print("WORKFLOW READY")
    print("=" * 100)
    print("IMAGE NODE:", image_node)
    print("PROMPT NODE:", prompt_node)
    print("UPLOADED IMAGE:", filename)
    print("WIDTH NODE VALUE:", preset["width"])
    print("HEIGHT NODE VALUE:", preset["height"])
    print("DURATION NODE VALUE:", duration_seconds)

    prompt_id = submit(workflow)

    print("\nWAITING FOR LTX VIDEO GENERATION...\n")

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

        # Upload to Supabase and return public URL
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

    raise Exception("No video found in ComfyUI outputs.")
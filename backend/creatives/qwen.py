import os
import re
import json
import base64
import requests

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Free model on OpenRouter — swap to any other free model if needed
MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"


def safe_parse(text):
    text = re.sub(r"```json", "", text)
    text = re.sub(r"```", "", text)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = text.strip()
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise Exception("No JSON array found.\n\nReturned:\n" + text)
    return json.loads(text[start:end + 1])


def _chat(messages, timeout=120):
    response = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={"model": MODEL, "messages": messages},
        timeout=timeout,
    )
    if not response.ok:
        raise Exception(f"OpenRouter error: {response.text}")
    return response.json()["choices"][0]["message"]["content"]


def generate_storyboard(destination):
    print("\nGenerating storyboard for:", destination)

    system_prompt = f"""
You are a world-class luxury travel cinematographer who has personally visited {destination} many times.

Create a 10-scene visual storyboard for a high-end travel campaign about {destination}.

Return ONLY a valid JSON array. No markdown. No explanation. No preamble.

Format:
[
  {{
    "scene": 1,
    "image_prompt": "",
    "video_prompt": ""
  }}
]

STRICT RULES FOR image_prompt:
- Use EXACT real names of famous landmarks/locations specific to {destination}
- Include time of day, camera details, lighting, weather, color palette
- NO people, NO tourists, NO crowds, NO faces
- Only real, photographic, documentary-style travel imagery

STRICT RULES FOR video_prompt:
- Start with "Animate:"
- Only natural physical motion (water, wind, clouds, camera drift)
- 2-3 sentences max

SCENE VARIETY:
1. Most iconic landmark - wide shot at golden hour
2. Famous natural landscape or water body
3. Renowned architectural interior or detail
4. Famous local cuisine - extreme close up
5. Historic street or market - empty, dawn light
6. Aerial drone cityscape or landscape
7. Sacred or cultural site
8. Famous viewpoint or panoramic vista
9. {destination} at night - lit landmark
10. Hidden gem or lesser-known beautiful location
"""

    content = _chat([{"role": "user", "content": system_prompt}], timeout=180)
    print("Raw response preview:", content[:300])
    result = safe_parse(content)
    print(f"Parsed {len(result)} scenes successfully")
    return result


def analyze_uploaded_image(image_path: str) -> dict:
    print("\nAnalyzing uploaded image:", image_path)

    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    ext = image_path.lower().split(".")[-1]
    mime = "image/jpeg" if ext in ("jpg", "jpeg") else "image/png"

    prompt = """
Analyze this travel photograph and return ONLY a valid JSON object. No markdown.

Format:
{
  "image_prompt": "",
  "video_prompt": ""
}

For image_prompt: describe the specific location, architecture, landscape, lighting, colors,
camera angle. Write as a detailed photographic description. NO people or faces.

For video_prompt: Start with "Animate:" then describe subtle natural motion (water, wind,
clouds, gentle camera drift). 2-3 sentences max.
"""

    try:
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_data}"}},
                    {"type": "text", "text": prompt},
                ],
            }
        ]
        content = _chat(messages, timeout=120)
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
        content = re.sub(r"```json|```", "", content).strip()
        start = content.find("{")
        end = content.rfind("}") + 1
        if start != -1 and end > 0:
            result = json.loads(content[start:end])
            if result.get("image_prompt") and result.get("video_prompt"):
                return result
    except Exception as e:
        print("Vision analysis failed:", e)

    # Fallback
    return {
        "image_prompt": "Breathtaking travel destination at golden hour. Wide aerial perspective. Ultra photorealistic RAW photograph. 8K. No people.",
        "video_prompt": "Animate: Gentle wind moves through the scene. Clouds drift slowly. Camera slowly pushes forward.",
    }

REEL_STYLES = {
    "film": ("Destination film", 4.0,
             "A slow, cinematic mood piece. On-screen text is a short, evocative line per clip."),
    "list": ("Top list", 3.5,
             "A numbered list reel, e.g. '5 experiences in Kyoto'. The title states the list. "
             "on_screen_text for each clip is '<number> · <name of the place or experience>', e.g. '1 · Fushimi Inari'. "
             "Number every clip in order, starting at 1."),
    "days": ("Day by day", 3.5,
             "A day-by-day itinerary reel. on_screen_text for each clip is 'Day <n> · <place or highlight>', e.g. 'Day 2 · Hakone'. "
             "Follow the order of a real trip."),
    "hotel": ("Hotel spotlight", 3.5,
              "One hotel or resort only: arrival, the view, the room or villa, the pool, dining, spa, a signature experience. "
              "Use the real hotel name from the brief. on_screen_text names each feature, e.g. 'Overwater villa'."),
    "offer": ("Offer", 3.0,
              "A package or offer announcement. Use ONLY prices, dates and inclusions written in the brief; never invent any. "
              "The title is the offer's hook. on_screen_text is short and bold, e.g. '5 nights', 'Private transfers', 'Breakfast daily'. "
              "end_line is the call to action, e.g. 'Message us to book'. Put the price line from the brief in end_sub if there is one."),
    "fast": ("Fast and punchy", 2.0,
             "A fast, energetic reel with quick cuts. on_screen_text is 1 to 3 punchy words per clip. Use more clips, each short."),
}


def plan_reel(brief: str, seconds: int = 30, clip_count: int = 0, style: str = "film") -> dict:
    """Plan a short vertical reel from a brief: scenes with on-screen text, a title, an end line,
    an Instagram caption, hashtags and the kind of music that fits. `style` picks the kind of reel."""
    seconds = max(10, min(int(seconds or 30), 90))
    style = style if style in REEL_STYLES else "film"
    style_name, per_clip, style_rules = REEL_STYLES[style]
    scenes = clip_count or max(3, min(14, round((seconds - 3) / per_clip)))
    prompt = f"""
You are the social media lead of Custom Holidays, a luxury travel company in Mumbai.
Plan a {seconds}-second vertical Instagram reel (9:16), style "{style_name}", from this brief:

"{brief}"

Return ONLY a valid JSON object. No markdown, no explanation.

{{
  "title": "short hook shown on the first clip, max 6 words",
  "scenes": [
    {{
      "image_prompt": "photographic description of the shot: exact real place names, time of day, light, lens, colours. NO people, NO faces, NO text",
      "video_prompt": "Animate: subtle natural motion only, 1-2 sentences",
      "on_screen_text": "max 6 words shown on this clip, or empty",
      "seconds": 3.5
    }}
  ],
  "end_line": "closing line for the end card, max 8 words",
  "end_sub": "second line for the end card (only a price or date from the brief), or empty",
  "caption": "Instagram caption, 2-4 short lines, warm and refined, one call to action to message us",
  "hashtags": ["#luxurytravel", "..."],
  "music_mood": "e.g. calm piano, upbeat acoustic"
}}

Style "{style_name}": {style_rules}

Rules:
- Exactly {scenes} scenes. Their seconds add up to about {seconds - 3} (the end card adds 3 seconds).
- Open with the most striking shot. Vary wide, detail and aerial shots. End on a calm, beautiful shot.
- On-screen text is short and specific to the place. No emojis in on-screen text.
- 8 to 14 hashtags, mixing destination and luxury-travel tags.
"""
    content = _chat([{"role": "user", "content": prompt}], timeout=180)
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
    content = re.sub(r"```json|```", "", content).strip()
    start, end = content.find("{"), content.rfind("}") + 1
    if start == -1 or end <= 0:
        raise Exception("The reel plan couldn't be read. Please try again")
    plan = json.loads(content[start:end])
    clean = []
    for s in (plan.get("scenes") or [])[:12]:
        if not isinstance(s, dict) or not s.get("image_prompt"):
            continue
        try:
            sec = float(s.get("seconds") or 3.5)
        except (TypeError, ValueError):
            sec = 3.5
        clean.append({
            "image_prompt": str(s["image_prompt"]).strip(),
            "video_prompt": str(s.get("video_prompt") or "Animate: very slow camera push forward.").strip(),
            "on_screen_text": str(s.get("on_screen_text") or "").strip(),
            "seconds": max(1.2, min(sec, 8.0)),
        })
    if not clean:
        raise Exception("The reel plan came back empty. Please try again")
    tags = plan.get("hashtags") or []
    if isinstance(tags, str):
        tags = tags.split()
    return {
        "title": str(plan.get("title") or "").strip(),
        "scenes": clean,
        "end_line": str(plan.get("end_line") or "").strip(),
        "end_sub": str(plan.get("end_sub") or "").strip(),
        "style": style,
        "caption": str(plan.get("caption") or "").strip(),
        "hashtags": [("#" + str(t).lstrip("#")).strip() for t in tags if str(t).strip()][:20],
        "music_mood": str(plan.get("music_mood") or "").strip(),
    }

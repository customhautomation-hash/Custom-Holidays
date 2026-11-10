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


def _chat(messages, timeout=120, model=None):
    response = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={"model": model or MODEL, "messages": messages},
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

FORMAT_CHOICES = {
    "transition": ("dissolve", "slide", "zoom", "cut"),
    "text_position": ("bottom", "middle", "top"),
    "text_font": ("serif", "sans"),
    "text_size": ("small", "medium", "large"),
    "pace": ("slow", "medium", "fast"),
}


REEL_MODEL = os.getenv("REEL_MODEL", "") or MODEL


def plan_reel(brief: str, seconds: int = 30, clip_count: int = 0, style: str = "") -> dict:
    """Plan a short vertical reel from whatever the brief asks for. The AI works out the kind of reel
    (mood film, numbered list, day-by-day, hotel tour, offer, tips, trend reel, anything else) and
    returns the scenes, the on-screen text, how it should look, the pace, the caption and hashtags."""
    seconds = max(10, min(int(seconds or 30), 90))
    body = seconds - 3
    count_rule = (f"Exactly {clip_count} scenes (the user's own clips, in this order)." if clip_count
                  else f"Pick the number of scenes for the kind of reel: about {max(4, round(body / 3.8))} for a calm reel, "
                       f"about {max(5, round(body / 2.8))} for a lively one, up to {min(16, round(body / 1.7))} for a fast one.")
    prompt = f"""
You are the head of social media at Custom Holidays, a luxury travel company in Mumbai, and an experienced
short-form video editor. Plan a {seconds}-second vertical Instagram reel (9:16) for this request:

"{brief}"

STEP 1. Work out what KIND of reel this is, in the user's own terms (a slow destination film, a numbered
top list, a day-by-day itinerary, a hotel tour, an offer, travel tips, "things nobody tells you", a fast
trend reel, a before-and-after, or anything else), and follow exactly what the request asks for: its places,
order, number of items, mood and ending.

STEP 2. Edit it like a professional:
- HOOK: the first scene is the single most striking image, and the title is a scroll-stopping hook.
- ARC: open wide and grand, move into details and experiences, build to an emotional high point,
  end on a calm, beautiful closing shot before the end card.
- VARIETY: mix aerial or wide shots, mid shots and close-up details (food, textures, water, light).
  Never show the same place twice in a row. Keep one consistent light and colour mood across scenes.
- TEXT: specific and useful (real names, numbers, what you'll feel or do). Never generic ("Beautiful
  views", "Amazing place"). Never repeat the title. Max 8 words, no emojis, no hashtags.
- TIMING: calm reels 3-5 s per scene, lively 2-3 s, fast 1.2-2 s. Scenes with more text get more time.

STEP 3. For every scene write a stock-footage search ("photo_query") that a site like Pexels can match:
2-4 plain words naming the real landmark or subject and place (e.g. "Fushimi Inari torii",
"Santorini Oia sunset", "matcha tea ceremony", "Maldives overwater villa"). No adjectives like luxury,
cinematic, beautiful, 4K. Add "photo_query_alt": a broader backup (e.g. "Kyoto shrine", "Japanese tea").

Return ONLY a valid JSON object. No markdown, no explanation.

{{
  "kind": "the kind of reel in 2-5 words",
  "title": "hook on the first scene, max 7 words, or empty if the kind doesn't need one",
  "format": {{
    "text_position": "bottom | middle | top",
    "text_font": "serif (elegant) | sans (modern, punchy)",
    "text_size": "small | medium | large",
    "pace": "slow | medium | fast",
    "transition": "dissolve (soft, calm) | slide (smooth, modern) | zoom (energetic) | cut (fast, trendy)"
  }},
  "scenes": [
    {{
      "image_prompt": "photographic description of the shot: exact real place, time of day, light, lens, colours. NO people, NO faces, NO text in the image",
      "video_prompt": "Animate: subtle natural motion only, 1-2 sentences",
      "photo_query": "2-4 words",
      "photo_query_alt": "broader 1-3 words",
      "on_screen_text": "words on this scene. For labels use 'Label · Main', e.g. 'Day 2 · Hakone' or '3 · Uluwatu at sunset'",
      "seconds": 3.0
    }}
  ],
  "end_line": "closing line for the end card, max 8 words",
  "end_sub": "second end-card line ONLY if the request gives a price, date or contact; otherwise empty",
  "caption": "Instagram caption, 2-4 short lines, warm and refined, one call to action to message us",
  "hashtags": ["#luxurytravel", "..."],
  "music_mood": "e.g. calm piano, warm acoustic, upbeat electronic",
  "music_query": "1-2 plain genre words for a music library: piano, ambient, acoustic, chill, cinematic, electronic, lounge, jazz, world"
}}

Rules:
- {count_rule} Scene seconds add up to about {body} (the end card adds 3 seconds).
- Use ONLY prices, dates, hotel names and inclusions that appear in the request. Never invent prices or offers.
- 8 to 14 hashtags, mixing destination and luxury-travel tags.
"""
    plan = None
    for attempt in range(2):   # the free model sometimes returns broken JSON; ask once more
        content = _chat([{"role": "user", "content": prompt}], timeout=180, model=REEL_MODEL)
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
        content = re.sub(r"```json|```", "", content).strip()
        start, end = content.find("{"), content.rfind("}") + 1
        if start == -1 or end <= 0:
            continue
        try:
            plan = json.loads(content[start:end]); break
        except json.JSONDecodeError:
            continue
    if plan is None:
        raise Exception("The reel plan couldn't be read. Please try again")
    clean = []
    for s in (plan.get("scenes") or [])[:16]:
        if not isinstance(s, dict) or not s.get("image_prompt"):
            continue
        try:
            sec = float(s.get("seconds") or 3)
        except (TypeError, ValueError):
            sec = 3.0
        clean.append({
            "image_prompt": str(s["image_prompt"]).strip(),
            "video_prompt": str(s.get("video_prompt") or "Animate: very slow camera push forward.").strip(),
            "on_screen_text": str(s.get("on_screen_text") or "").strip(),
            "photo_query": str(s.get("photo_query") or "").strip(),
            "photo_query_alt": str(s.get("photo_query_alt") or "").strip(),
            "seconds": max(1.0, min(sec, 8.0)),
        })
    if not clean:
        raise Exception("The reel plan came back empty. Please try again")
    # Make the scene lengths add up to the reel length the user chose
    if not clip_count:
        total = sum(c["seconds"] for c in clean) or 1
        k = (seconds - 3) / total
        if abs(k - 1) > 0.08:
            for c in clean:
                c["seconds"] = round(max(1.0, min(8.0, c["seconds"] * k)), 2)
    fmt = plan.get("format") if isinstance(plan.get("format"), dict) else {}
    fmt = {k: (str(fmt.get(k, "")).split()[0].lower() if fmt.get(k) else "") for k in FORMAT_CHOICES}
    fmt = {k: (v if v in FORMAT_CHOICES[k] else FORMAT_CHOICES[k][0 if k != "text_size" else 1]) for k, v in fmt.items()}
    tags = plan.get("hashtags") or []
    if isinstance(tags, str):
        tags = tags.split()
    return {
        "kind": str(plan.get("kind") or "").strip(),
        "title": str(plan.get("title") or "").strip(),
        "format": fmt,
        "scenes": clean,
        "end_line": str(plan.get("end_line") or "").strip(),
        "end_sub": str(plan.get("end_sub") or "").strip(),
        "caption": str(plan.get("caption") or "").strip(),
        "hashtags": [("#" + str(t).lstrip("#")).strip() for t in tags if str(t).strip()][:20],
        "music_mood": str(plan.get("music_mood") or "").strip(),
        "music_query": str(plan.get("music_query") or "").strip(),
    }

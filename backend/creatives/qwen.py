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

FORMAT_CHOICES = {
    "text_position": ("bottom", "middle", "top"),
    "text_font": ("serif", "sans"),
    "text_size": ("small", "medium", "large"),
    "pace": ("slow", "medium", "fast"),
}


def plan_reel(brief: str, seconds: int = 30, clip_count: int = 0, style: str = "") -> dict:
    """Plan a short vertical reel from whatever the brief asks for. The AI works out the kind of reel
    (mood film, numbered list, day-by-day, hotel tour, offer, tips, trend reel, anything else) and
    returns the scenes, the on-screen text, how the text should look, the pace, the caption and hashtags."""
    seconds = max(10, min(int(seconds or 30), 90))
    count_rule = (f"Exactly {clip_count} scenes (the user's own clips, in this order)." if clip_count
                  else f"Choose the number of scenes to suit the kind of reel: about {max(3, round((seconds - 3) / 4))} for a calm reel, "
                       f"up to {min(16, round((seconds - 3) / 1.8))} for a fast one.")
    prompt = f"""
You are the social media lead of Custom Holidays, a luxury travel company in Mumbai.
Plan a {seconds}-second vertical Instagram reel (9:16) for this request:

"{brief}"

First work out what KIND of reel the request is asking for, in the user's own terms (for example: a slow
destination film, a numbered top list, a day-by-day itinerary, a hotel tour, an offer, travel tips, a
packing list, "things nobody tells you", a fast trend reel, a before-and-after, or anything else).
Then plan every scene, the on-screen text and the look to fit that kind of reel.

Return ONLY a valid JSON object. No markdown, no explanation.

{{
  "kind": "the kind of reel in 2-5 words, e.g. 'Numbered top 5 list'",
  "title": "hook shown on the first clip, max 7 words, or empty if the kind doesn't need one",
  "format": {{
    "text_position": "bottom | middle | top",
    "text_font": "serif (elegant) | sans (modern, punchy)",
    "text_size": "small | medium | large",
    "pace": "slow | medium | fast"
  }},
  "scenes": [
    {{
      "image_prompt": "photographic description of the shot: exact real place names, time of day, light, lens, colours. NO people, NO faces, NO text in the image",
      "video_prompt": "Animate: subtle natural motion only, 1-2 sentences",
      "on_screen_text": "the words on this clip (max 8). For labels use 'Label · Main', e.g. 'Day 2 · Hakone' or '3 · Uluwatu at sunset'",
      "seconds": 3.0
    }}
  ],
  "end_line": "closing line for the end card, max 8 words",
  "end_sub": "a second end-card line ONLY if the request gives a price, date or contact; otherwise empty",
  "caption": "Instagram caption, 2-4 short lines, warm and refined, one call to action to message us",
  "hashtags": ["#luxurytravel", "..."],
  "music_mood": "e.g. calm piano, upbeat acoustic"
}}

Rules:
- {count_rule} Scene seconds add up to about {seconds - 3} (the end card adds 3 seconds).
- Fast reels: 1.2-2.2 seconds per scene, 1-3 punchy words, large sans text. Calm reels: 3-5 seconds, elegant serif.
- Use ONLY prices, dates, hotel names and inclusions that appear in the request. Never invent prices or offers.
- Open with the most striking shot and end on a strong one. No emojis in on-screen text.
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
            "seconds": max(1.0, min(sec, 8.0)),
        })
    if not clean:
        raise Exception("The reel plan came back empty. Please try again")
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
    }

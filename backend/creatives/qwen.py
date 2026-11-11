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
    "text_style": ("classic", "label", "meme", "handwritten", "bold", "none"),
    "grade": ("natural", "warm", "film", "moody", "vibrant", "dreamy"),
    "frame": ("full", "cinematic"),
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
                       f"about {max(5, round(body / 2.8))} for a lively one, up to {min(24, round(body / 1.1))} for a fast trend reel, "
                       f"and just 1-3 for a pure scenery reel.")
    prompt = f"""
You are the head of social media at Custom Holidays, a luxury travel company in Mumbai, and an experienced
short-form video editor. Plan a {seconds}-second vertical Instagram reel (9:16) for this request:

"{brief}"

STEP 1. Work out what KIND of reel this is, in the user's own terms, and follow exactly what the request asks
for: its places, order, number of items, mood and ending. Reels are NOT always many clips stitched together.
Some kinds and how to build them (use these as patterns, or invent the right structure for something new):
- Pure scenery / "just vibes": 1 to 3 long shots (8-30 s each) of one breathtaking view, little or no text,
  text_style "none" or "label", no title, slow, transition dissolve. A single POV shot is just 1 scene.
- Luxury hotel / resort tour: 6-10 calm shots, each with a tiny elegant label ("The pool", "The suite",
  "The sunset"), text_style "label", position middle, no title, grade "warm", slow.
- Trend / meme hook ("bro let's go to Japan" / "me: which one?"): a hook title on the first scene in
  text_style "meme" (use \n between the two lines), then SECTIONS: several fast clips per section, each
  section named ("Cyberpunk Tokyo", "Ancient Kyoto", "Luxurious Japan"); repeat the SAME on_screen_text on
  every clip of a section so it stays on screen; text_style "bold" or "meme"; cuts on the beat; pace fast.
- Chapter cards (calm, cinematic): a black title card naming each place ("和歌山\nWakayama, Japan",
  local script on the first line if the place has one), then 1-3 shots of that place, and so on.
  Use scene "type": "card" for the black cards (no picture needed), text_style "label", grade "film".
- Travel diary: handheld-feeling quick cuts with one short handwritten line that stays across several clips
  (repeat the same on_screen_text), text_style "handwritten", grade "film", frame "cinematic".
- Classic destination film, numbered top list, day-by-day itinerary, offer, tips: as before, text_style
  "classic".

STEP 2. Edit it like a professional:
- HOOK: the first scene is the single most striking image, and the title is a scroll-stopping hook.
- ARC: open wide and grand, move into details and experiences, build to an emotional high point,
  end on a calm, beautiful closing shot before the end card.
- VARIETY: mix aerial or wide shots, mid shots and close-up details (food, textures, water, light).
  Never show the same place twice in a row. Keep one consistent light and colour mood across scenes.
- TEXT: specific and useful (real names, numbers, what you'll feel or do). Never generic ("Beautiful
  views", "Amazing place"). Never repeat the title. Max 8 words, no emojis, no hashtags.
- TIMING: calm reels 3-5 s per scene, lively 2-3 s, fast 0.8-2 s, single scenery shots 8-30 s, cards 1.5-2.5 s.
  Scenes with more text get more time.
- OUTDOORS FIRST: travel reels sell the place, so choose outdoor shots (landscapes, streets, skylines, beaches,
  water, landmarks, terraces, pools under the sky). Use an indoor shot ONLY when the scene is truly about an indoor
  thing (a hotel suite, a spa, a restaurant table, a temple interior, a shopping mall) and say "indoor" nowhere else.
  Put "outdoor" or a sky/street/view word in the photo_query when a place could be shown inside or outside.
- ONE SHOT PER SCENE: never ask for split screens, collages, side-by-side or before/after images. For a
  comparison ("them vs you", "expectation vs reality") show each side as its own scene, one after another.
- TEXT THAT STAYS: to keep the same words on screen over several clips, give those scenes exactly the
  same on_screen_text. Leave on_screen_text empty when a scene should have no words.

STEP 3. For every scene write a stock-footage search ("photo_query") that a site like Pexels can match:
2-4 plain words naming the real landmark or subject and place (e.g. "Fushimi Inari torii",
"Santorini Oia sunset", "matcha tea ceremony", "Maldives overwater villa"). No adjectives like luxury,
cinematic, beautiful, 4K. Add "photo_query_alt": a broader backup (e.g. "Kyoto shrine", "Japanese tea").
The query must capture the LOOK the scene needs, not just the place: time of day and the defining visual,
e.g. for a "Cyberpunk Tokyo" section: "Shinjuku neon night", "Tokyo neon alley rain", "Akihabara lights";
for "Ancient Kyoto": "Kyoto pagoda", "Fushimi Inari gates", "Gion old street"; for "Rural Japan":
"Japan rice terraces", "Shirakawa-go village". Every scene in a section gets a DIFFERENT query.
"image_prompt" must describe that same look precisely (it is also used to check that the clip matches).
When the scene is about a THING or an ACTIVITY (a car, a coffee, a yacht breakfast, a pool, a spa), the query
names that subject first and leaves the city out if the city would pull in skyline shots: "Rolls-Royce
chauffeur", "luxury car interior", "yacht breakfast table", "infinity pool skyline". Only use the city name
when the scene is the city itself.

Return ONLY a valid JSON object. No markdown, no explanation.

{{
  "kind": "the kind of reel in 2-5 words",
  "title": "hook on the first scene, max 7 words, or empty if the kind doesn't need one",
  "format": {{
    "text_position": "bottom | middle | top",
    "text_font": "serif (elegant) | sans (modern, punchy)",
    "text_size": "small | medium | large",
    "pace": "slow | medium | fast",
    "transition": "dissolve (soft, calm) | slide (smooth, modern) | zoom (energetic) | cut (fast, trendy)",
    "text_style": "classic (words on a soft shade) | label (tiny elegant label, luxury) | meme (white words with a black outline, trend/meme) | handwritten (casual diary) | bold (big chunky display words) | none",
    "grade": "natural | warm (golden) | film (soft, grainy, nostalgic) | moody (dark, rich) | vibrant | dreamy (soft, bright)",
    "frame": "full | cinematic (black bars top and bottom)",
    "end_card": true,
    "logo": true
  }},
  "scenes": [
    {{
      "type": "shot | card (a black title card with only words, no picture)",
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
  "music_query": "1-2 plain genre words for a music library: piano, ambient, acoustic, chill, cinematic, electronic, lounge, jazz, world",
  "music_tags": ["3-5 single-word music library tags that fit THIS reel's place and mood: one genre (cinematic, ambient, lounge, deephouse, acoustic, pop, electronic, orchestral, jazz, world, chillout, tropical), one or two moods (uplifting, romantic, dreamy, energetic, happy, epic, peaceful, festive, inspiring), optionally an instrument or local flavour (piano, guitar, strings, oud, sitar, koto, ukulele)"],
  "music_energy": "calm | medium | high, matching the pace and the feeling of the reel"
}}

Rules:
- {count_rule} Scene seconds add up to about {body} (the end card adds 3 seconds).
  (A pure scenery reel may use just 1-3 scenes; a fast trend reel up to 24.)
- Use ONLY prices, dates, hotel names and inclusions that appear in the request. Never invent prices or offers.
- 8 to 14 hashtags, mixing destination and luxury-travel tags.
"""
    result = _finish_plan(prompt, seconds, clip_count)
    problems = _plan_problems(result, seconds, clip_count)
    if problems:     # ask once more, saying exactly what was wrong; keep whichever plan is better
        fix = prompt + "\n\nIMPORTANT: your previous plan had these problems. Fix them:\n- " + "\n- ".join(problems)
        try:
            again = _finish_plan(fix, seconds, clip_count)
            if len(_plan_problems(again, seconds, clip_count)) < len(problems):
                result = again
        except Exception as e:
            print("Reel re-plan failed:", e)
    return result


_MERGED = re.compile(r"\b(split[- ]?screen|split image|side[- ]by[- ]side|collage|diptych|left half|right half|two images|before and after in one)\b", re.I)


def _plan_problems(plan: dict, seconds: int, clip_count: int) -> list:
    """Things that make a reel look wrong, checked after planning."""
    out = []
    scenes = plan.get("scenes") or []
    shots = [x for x in scenes if x.get("type") != "card"]
    if any(_MERGED.search(x.get("image_prompt", "")) for x in shots):
        out.append("A scene asks for a split screen / collage / side-by-side image. Every scene must be ONE single shot; "
                   "show each side of a comparison as its own scene, one after the other.")
    pace = (plan.get("format") or {}).get("pace", "")
    if not clip_count and len(shots) > 3 and pace in ("medium", "fast"):
        avg = sum(x.get("seconds", 0) for x in shots) / len(shots)
        if avg > (2.6 if pace == "fast" else 4.2):
            out.append(f"The scenes are too long for a {pace} reel (about {avg:.1f} s each). Use more, shorter scenes "
                       f"({'1-2.5' if pace == 'fast' else '2-3.5'} s each) so it feels lively.")
    return out


def _finish_plan(prompt: str, seconds: int, clip_count: int) -> dict:
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
    for s in (plan.get("scenes") or [])[:24]:
        if not isinstance(s, dict):
            continue
        card = str(s.get("type") or "").strip().lower() == "card"
        if not card and not s.get("image_prompt"):
            continue
        try:
            sec = float(s.get("seconds") or 3)
        except (TypeError, ValueError):
            sec = 3.0
        clean.append({
            "type": "card" if card else "shot",
            "image_prompt": str(s.get("image_prompt") or "").strip(),
            "video_prompt": str(s.get("video_prompt") or "Animate: very slow camera push forward.").strip(),
            "on_screen_text": str(s.get("on_screen_text") or "").strip(),
            "photo_query": str(s.get("photo_query") or "").strip(),
            "photo_query_alt": str(s.get("photo_query_alt") or "").strip(),
            "seconds": max(0.6, min(sec, 40.0)),
        })
    if not clean:
        raise Exception("The reel plan came back empty. Please try again")
    # the hook is the title; don't repeat it as the first clip's words
    norm = lambda x: re.sub(r"\W+", "", str(x or "").lower())
    if norm(plan.get("title")) and norm(clean[0]["on_screen_text"]) == norm(plan.get("title")):
        clean[0]["on_screen_text"] = ""
    # Make the scene lengths add up to the reel length the user chose
    if not clip_count:
        total = sum(c["seconds"] for c in clean) or 1
        k = (seconds - 3) / total
        if abs(k - 1) > 0.08:
            for c in clean:
                c["seconds"] = round(max(0.6, min(40.0, c["seconds"] * k)), 2)
    fmt = plan.get("format") if isinstance(plan.get("format"), dict) else {}
    fmt = {k: (str(fmt.get(k, "")).split()[0].lower() if fmt.get(k) else "") for k in FORMAT_CHOICES}
    fmt = {k: (v if v in FORMAT_CHOICES[k] else FORMAT_CHOICES[k][0 if k != "text_size" else 1]) for k, v in fmt.items()}
    raw_fmt = plan.get("format") if isinstance(plan.get("format"), dict) else {}
    for k in ("end_card", "logo"):
        v = raw_fmt.get(k, True)
        fmt[k] = v if isinstance(v, bool) else str(v).strip().lower() not in ("false", "no", "0")
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
        "music_tags": [re.sub(r"[^a-z]", "", str(x).lower()) for x in (plan.get("music_tags") or []) if re.sub(r"[^a-z]", "", str(x).lower())][:5]
                      if isinstance(plan.get("music_tags"), list) else [],
        "music_energy": str(plan.get("music_energy") or "").strip().lower() if str(plan.get("music_energy") or "").strip().lower() in ("calm", "medium", "high") else "",
    }

import os
import json
import shutil
import threading
import time
import uuid
import requests
from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import APIRouter, Body, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

from supabase_client import supabase

from creatives.flux import generate_image
from creatives.ltx import generate_video_from_image
from creatives.ttv import generate_video_from_text
from creatives.qwen import analyze_uploaded_image, generate_storyboard, plan_reel


router = APIRouter()

jobs: dict = {}
automation_results: dict = {}

COMFYUI_URL = "http://127.0.0.1:8188"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MXAI_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

presence_store: Dict[str, float] = {}
PRESENCE_TTL_SECONDS = 25
presence_lock = threading.Lock()

known_users_store: Dict[str, float] = {}
known_users_lock = threading.Lock()

groups_lock = threading.Lock()
groups_store: Dict[str, dict] = {
    "General":      {"id": "General",      "label": "General",      "avatar": "GN", "lastMessage": "Daily updates and team announcements"},
    "Operations":   {"id": "Operations",   "label": "Operations",   "avatar": "OP", "lastMessage": "Operations updates"},
    "Content Team": {"id": "Content Team", "label": "Content Team", "avatar": "CT", "lastMessage": "Content updates"},
    "Sales":        {"id": "Sales",        "label": "Sales",        "avatar": "SL", "lastMessage": "Sales updates"},
}

CHAT_UPLOAD_DIR = "outputs/chat-uploads"
os.makedirs(CHAT_UPLOAD_DIR, exist_ok=True)

PUBLIC_BASE_URL_FALLBACK_HOST = "localhost:8000"


# ===========================================================
# MODELS
# ===========================================================

class StopGenerationRequest(BaseModel):
    workflow: str = ""
    job_id: str = ""

class StoryboardRequest(BaseModel):
    destination: str
    ratio: str = "9:16"
    duration_seconds: int = 5

class ImageRequest(BaseModel):
    prompt: str
    ratio: str = "9:16"

class TextVideoRequest(BaseModel):
    prompt: str
    ratio: str = "9:16"
    duration_seconds: int = 5

class VideoRequest(BaseModel):
    image_path: str
    image_prompt: str
    video_prompt: str
    ratio: str = "9:16"
    duration_seconds: int = 5

class ChatMessageRequest(BaseModel):
    text: str
    sender: str = "Daily Digest Bot"
    channel: str = "General"
    self: bool = False

class SendMessageRequest(BaseModel):
    text: str
    sender: str
    channel: str = "General"
    attachment: Optional[Dict[str, Any]] = None

class AutomationTriggerRequest(BaseModel):
    webhook_path: str
    triggered_by: str = "automations_page"
    triggered_at: str = ""

class AutomationResultRequest(BaseModel):
    webhook_path: str
    success: bool
    summary: str
    details: str = ""

class SupplierRequest(BaseModel):
    name: str
    designation: str = ""
    company: str = ""
    place: str = ""
    phone: str = ""
    email: str = ""
    supplier_type: str = ""
    event: str = ""
    url: str = ""

class FinanceKPIRequest(BaseModel):
    month_start: str
    month_end: str
    revenue: dict
    expenses: dict
    profit: dict
    bookings: dict
    targets: dict
    generated_at: str

class MXAIMessageRequest(BaseModel):
    conversation_id: str
    user_name: str
    message: str
    docs_mode: str = "auto"   # auto | on | off  (CH Assistant: use uploaded documents?)

class MXAIConversationRequest(BaseModel):
    user_name: str
    title: str = "New Chat"

class ContentGenerateRequest(BaseModel):
    content_type: str
    tone: str
    topic: str
    audience: str = "luxury travel clients"
    destination: str = ""


# ===========================================================
# HELPERS
# ===========================================================

def format_chat_message(row: dict) -> dict:
    created_at = row.get("created_at")
    if created_at:
        try:
            formatted_time = datetime.fromisoformat(
                created_at.replace("Z", "+00:00")
            ).astimezone().strftime("%I:%M %p")
        except Exception:
            formatted_time = ""
    else:
        formatted_time = ""

    attachment = row.get("attachment")
    if isinstance(attachment, str):
        try:
            attachment = json.loads(attachment)
        except Exception:
            attachment = None
    if not isinstance(attachment, dict):
        attachment = None

    return {
        "id": str(row.get("id", "")),
        "sender": row.get("sender", "Daily Digest Bot"),
        "text": row.get("text", ""),
        "time": formatted_time,
        "self": row.get("is_self", False),
        "channel": row.get("channel", "General"),
        "attachment": attachment,
    }


def format_supplier(row: dict) -> dict:
    raw_notion_data = row.get("raw_notion_data") or {}
    if not isinstance(raw_notion_data, dict):
        raw_notion_data = {}
    supabase_id = str(row.get("id", ""))
    return {
        "id": supabase_id,
        "notion_id": supabase_id,
        "name": row.get("name") or "",
        "designation": row.get("designation") or "",
        "company": row.get("company_name") or "",
        "place": row.get("place") or "",
        "phone": row.get("phone") or "",
        "email": row.get("email") or "",
        "supplier_type": row.get("supplier_type") or "",
        "event": row.get("internal_notes") or "",
        "url": raw_notion_data.get("url") or "",
    }


def clean_think_tags(text: str) -> str:
    import re
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    return text.replace("<think>", "").replace("</think>", "").strip()


def format_mxai_message(row: dict) -> dict:
    options = row.get("options")
    if not isinstance(options, list):
        options = []
    return {
        "id": str(row.get("id", "")),
        "role": row.get("role", "assistant"),
        "content": row.get("content", ""),
        "image_url": row.get("image_url"),
        "created_at": row.get("created_at"),
        "options": options,
    }


def openrouter_headers() -> dict:
    return {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }


# ===========================================================
# HEALTH
# ===========================================================

@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/creatives/status")
def creatives_status():
    """What the Creatives page can do right now: pictures (cloud) and videos (the main PC)."""
    from creatives import comfy
    return {
        "images": bool(os.getenv("CLOUDFLARE_ACCOUNT_ID") and os.getenv("CLOUDFLARE_GLOBAL_KEY")),
        "prompts": bool(os.getenv("OPENROUTER_API_KEY")),
        "video": comfy.status(),
    }

@router.get("/test")
def test():
    return {"success": True, "message": "Backend working."}


# ===========================================================
# STORYBOARD
# ===========================================================

@router.post("/generate-full-storyboard")
def generate_full_storyboard(req: StoryboardRequest):
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "running",
        "scenes": [],
        "total": 10,
        "error": None,
    }

    def run():
        try:
            storyboard = generate_storyboard(req.destination)
            jobs[job_id]["total"] = len(storyboard)

            for scene in storyboard:
                if jobs[job_id]["status"] == "stopped":
                    break
                try:
                    image_path = generate_image(scene["image_prompt"], req.ratio)
                except Exception:
                    image_path = None

                jobs[job_id]["scenes"].append({
                    "scene": scene["scene"],
                    "image_prompt": scene["image_prompt"],
                    "video_prompt": scene["video_prompt"],
                    "image_path": image_path,
                    "video_path": None,
                })

            if jobs[job_id]["status"] != "stopped":
                jobs[job_id]["status"] = "done"
        except Exception as error:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = str(error)

    threading.Thread(target=run, daemon=True).start()
    return {"success": True, "job_id": job_id}


@router.get("/storyboard-status/{job_id}")
def storyboard_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        return {"success": False, "error": "Job not found"}
    return {
        "success": True,
        "status": job["status"],
        "scenes": job["scenes"],
        "total": job["total"],
        "error": job.get("error"),
    }


# ===========================================================
# IMAGE + VIDEO
# ===========================================================

@router.post("/generate-image")
def generate_image_route(req: ImageRequest):
    try:
        image_path = generate_image(req.prompt, req.ratio)
        return {"success": True, "imagePath": image_path}
    except Exception as error:
        return {"success": False, "error": str(error)}


@router.post("/generate-video")
def generate_video(req: VideoRequest):
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "running", "result": None, "error": None, "type": "video"}

    def run():
        try:
            video_path = generate_video_from_image(
                image_path=req.image_path,
                image_prompt=req.image_prompt,
                video_prompt=req.video_prompt,
                ratio=req.ratio,
                duration_seconds=req.duration_seconds,
            )
            jobs[job_id]["status"] = "done"
            jobs[job_id]["result"] = video_path
        except Exception as error:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = str(error)

    threading.Thread(target=run, daemon=True).start()
    return {"success": True, "job_id": job_id}


@router.get("/video-status/{job_id}")
def video_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        return {"success": False, "error": "Job not found"}
    return {
        "success": True,
        "status": job["status"],
        "videoPath": job.get("result"),
        "error": job.get("error"),
    }


@router.post("/generate-video-text")
def generate_video_text(req: TextVideoRequest):
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "running", "result": None, "error": None, "type": "video"}

    def run():
        try:
            video_path = generate_video_from_text(
                req.prompt,
                ratio=req.ratio,
                duration_seconds=req.duration_seconds,
            )
            jobs[job_id]["status"] = "done"
            jobs[job_id]["result"] = video_path
        except Exception as error:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = str(error)

    threading.Thread(target=run, daemon=True).start()
    return {"success": True, "job_id": job_id}


@router.post("/analyze-image")
async def analyze_image(file: UploadFile = File(...)):
    os.makedirs("outputs/uploads", exist_ok=True)
    extension = file.filename.split(".")[-1] if file.filename and "." in file.filename else "jpg"
    temp_path = f"outputs/uploads/upload_{uuid.uuid4()}.{extension}"

    try:
        with open(temp_path, "wb") as output_file:
            shutil.copyfileobj(file.file, output_file)
        result = analyze_uploaded_image(temp_path)
        return {
            "success": True,
            "imagePath": temp_path,
            "image_prompt": result.get("image_prompt", ""),
            "video_prompt": result.get("video_prompt", ""),
        }
    except Exception:
        return {
            "success": False,
            "imagePath": temp_path,
            "image_prompt": "Breathtaking travel destination at golden hour. Ultra photorealistic. No people.",
            "video_prompt": "Animate: Gentle wind moves through the scene. Camera slowly pushes forward.",
        }


class ReelPlanRequest(BaseModel):
    brief: str
    seconds: int = 30
    clip_count: int = 0
    style: str = "film"


@router.post("/reel/plan")
def reel_plan(req: ReelPlanRequest):
    """Plans a reel from a brief (scenes, on-screen text, caption, hashtags, music mood)."""
    if not req.brief.strip():
        raise HTTPException(status_code=400, detail="Describe the reel first")
    try:
        return {"success": True, "plan": plan_reel(req.brief.strip(), req.seconds, req.clip_count, req.style)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e) if "reel" in str(e).lower() else "The reel couldn't be planned just now. Please try again in a minute")


class StockRequest(BaseModel):
    query: str
    kind: str = "photo"
    pick: int = 0


@router.post("/reel/stock")
def reel_stock(req: StockRequest):
    """A real photo or video clip for a reel scene (Pexels, or Openverse for photos without a key)."""
    from creatives.stock import find_stock
    try:
        return {"success": True, **find_stock(req.query, "video" if req.kind == "video" else "photo", req.pick)}
    except Exception as e:
        raise HTTPException(status_code=404 if "found" in str(e) else 502, detail=str(e))


@router.get("/reel/music")
def reel_music(q: str = "calm cinematic", seconds: int = 30):
    """Free Creative Commons music for a mood (CC0 / CC BY)."""
    from creatives.stock import find_music
    try:
        return {"success": True, "tracks": find_music(q, seconds)}
    except Exception as e:
        raise HTTPException(status_code=502, detail="The music library didn't answer. Try again in a minute")


class MusicFetchRequest(BaseModel):
    url: str


@router.post("/reel/music/use")
def reel_music_use(req: MusicFetchRequest):
    """Copies a chosen track to our storage so the reel can be recorded with it."""
    from creatives.stock import fetch_music
    try:
        return {"success": True, "url": fetch_music(req.url)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e) or "The track couldn't be loaded")


@router.post("/stop-generation")
async def stop_generation(payload: StopGenerationRequest):
    stopped_job = False
    if payload.job_id and payload.job_id in jobs:
        jobs[payload.job_id]["status"] = "stopped"
        stopped_job = True
    interrupted = False
    try:
        from creatives import comfy
        if comfy.configured():
            interrupted = comfy.post("/interrupt", timeout=10).ok
    except Exception:
        pass
    return {
        "success": True,
        "comfy_interrupted": interrupted,
        "job_stopped": stopped_job,
        "workflow": payload.workflow,
    }


# ===========================================================
# MXAI CONTENT GENERATION
# ===========================================================

@router.post("/mxai/generate-content")
async def generate_content(payload: ContentGenerateRequest):
    try:
        prompt = f"""
You are an expert travel agency content writer.

Write the following content and return it in clean, well-structured markdown format.

Content Type: {payload.content_type}
Tone: {payload.tone}
Topic/Instructions: {payload.topic}
Audience: {payload.audience}
Destination: {payload.destination}

FORMATTING RULES:
- Use proper markdown headers (##, ###)
- Use bullet points for lists
- Use **bold** for key terms
- Add line breaks between sections
- Keep paragraphs short (2-3 sentences max)
- Do NOT return one big paragraph
- Return ONLY the content, no preamble like "Here is your content:"
"""
        response = requests.post(
            OPENROUTER_URL,
            headers=openrouter_headers(),
            json={
                "model": MXAI_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are an expert travel agency content writer. Always respond in clean, well-structured markdown. Never write one big paragraph. Use headers, bullets and short paragraphs."
                    },
                    {"role": "user", "content": prompt.strip()},
                ],
                "stream": False,
            },
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        if not content:
            raise RuntimeError("Empty response from OpenRouter")
        return {"success": True, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===========================================================
# MXAI CHAT
# ===========================================================

@router.get("/mxai/conversations/{user_name}")
async def get_conversations(user_name: str):
    try:
        result = (
            supabase.table("mxai_conversations")
            .select("*")
            .eq("user_name", user_name)
            .order("updated_at", desc=True)
            .execute()
        )
        return {"success": True, "conversations": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mxai/conversations")
async def create_conversation(payload: MXAIConversationRequest):
    try:
        result = (
            supabase.table("mxai_conversations")
            .insert({"user_name": payload.user_name, "title": payload.title})
            .execute()
        )
        return {"success": True, "conversation": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/mxai/conversations/{conversation_id}")
async def update_conversation_title(conversation_id: str, payload: dict = Body(...)):
    try:
        result = (
            supabase.table("mxai_conversations")
            .update({"title": payload.get("title"), "updated_at": datetime.utcnow().isoformat()})
            .eq("id", conversation_id)
            .execute()
        )
        return {"success": True, "conversation": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/mxai/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    try:
        supabase.table("mxai_messages").delete().eq("conversation_id", conversation_id).execute()
        supabase.table("mxai_conversations").delete().eq("id", conversation_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mxai/messages/{conversation_id}")
async def get_mxai_messages(conversation_id: str):
    try:
        result = (
            supabase.table("mxai_messages")
            .select("*")
            .eq("conversation_id", conversation_id)
            .order("created_at", desc=False)
            .execute()
        )
        messages = [format_mxai_message(row) for row in (result.data or [])]
        return {"success": True, "messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not load messages: {str(e)}")


# Phrases that mean "look in my documents"
DOC_HINTS = ("my document", "my documents", "the document", "the documents", "uploaded", "the pdf", "the file",
             "contract", "rate sheet", "according to", "in the brochure", "policy says")
AUTO_DOC_SCORE = 0.45   # in Auto mode, only use passages that are clearly relevant


def _find_doc_passages(message: str, mode: str, authorization: Optional[str]) -> list:
    """CH Assistant document search (the old Document Search / RAG page, merged into chat)."""
    if mode == "off" or not authorization or not authorization.startswith("Bearer "):
        return []
    try:
        user = supabase.auth.get_user(authorization.split(" ", 1)[1])
        user_id = user.user.id if user and user.user else None
        if not user_id:
            return []
        from rag.embeddings import embed_text
        from rag.retrieval import retrieve_text_chunks
        chunks = retrieve_text_chunks(embed_text(message, task="retrieval.query"), str(user_id), top_k=8)
    except Exception as e:
        print("CH Assistant document search skipped:", e)
        return []
    if mode == "on":
        return chunks[:6]
    return [c for c in chunks if c.get("score", 0) >= AUTO_DOC_SCORE][:5]


@router.post("/mxai/chat")
async def mxai_chat(payload: MXAIMessageRequest, authorization: Optional[str] = Header(None)):
    conversation_id = payload.conversation_id
    user_message = payload.message.strip()

    # /docs forces documents, /chat ignores them; certain phrases switch Auto to documents
    docs_mode = (payload.docs_mode or "auto").lower()
    low = user_message.lower()
    if low.startswith("/docs"):
        docs_mode, user_message = "on", user_message[5:].strip()
    elif low.startswith("/chat"):
        docs_mode, user_message = "off", user_message[5:].strip()
    elif docs_mode == "auto" and any(h in low for h in DOC_HINTS):
        docs_mode = "on"
    doc_passages = _find_doc_passages(user_message, docs_mode, authorization) if user_message else []

    if not user_message:
        raise HTTPException(status_code=422, detail="message is required")

    try:
        supabase.table("mxai_messages").insert({
            "conversation_id": conversation_id,
            "role": "user",
            "content": user_message,
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save user message: {str(e)}")

    try:
        history_result = (
            supabase.table("mxai_messages")
            .select("*")
            .eq("conversation_id", conversation_id)
            .order("created_at", desc=False)
            .execute()
        )
        history_rows = history_result.data or []
    except Exception:
        history_rows = []

    messages = [
        {
            "role": "system",
            "content": (
                "You are CH Assistant, the in-house AI assistant of Custom Holidays, a luxury travel "
                "company in Mumbai. Help the team with trips, clients, suppliers, quotes and writing. "
                "Be helpful, concise, and use clean markdown inside the 'reply' field.\n\n"
                "You MUST respond with ONLY a single JSON object, no other text before or "
                "after it, matching exactly this shape:\n"
                '{"reply": "your markdown reply text here", "options": ["opt1", "opt2"]}\n\n'
                "Rules:\n"
                "- \"reply\" is always required: your normal conversational answer, in markdown.\n"
                "- \"options\" is an array of short strings (1-4 words each), at most 6 items.\n"
                "- Only put items in \"options\" when you just asked a clarifying question "
                "that has a small set of obvious discrete answers.\n"
                "- If your reply does not end in that kind of question, \"options\" MUST be [].\n"
                "- Do not wrap the JSON in a code fence. Output raw JSON only."
            ),
        }
    ]
    for row in history_rows:
        role = row.get("role")
        content = row.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    sources_line = ""
    if doc_passages:
        context = "\n\n".join(
            f"[{c.get('filename', 'Document')} p.{c.get('page_number', 0)}]\n{(c.get('text') or '').strip()}"
            for c in doc_passages
        )
        messages.insert(1, {"role": "system", "content": (
            "Passages from the team's uploaded documents that may answer the latest question:\n\n"
            f"{context}\n\n"
            "Base your answer on these passages and mention the document name and page in brackets, "
            "e.g. [Rates 2026.pdf p.3]. If they do not contain the answer, say so briefly, then help "
            "from general knowledge if you can."
        )})
        seen = []
        for c in doc_passages:
            tag = f"{c.get('filename', 'Document')} p.{c.get('page_number', 0)}"
            if tag not in seen:
                seen.append(tag)
        sources_line = "\n\n_Sources: " + ", ".join(seen) + "_"
    elif docs_mode == "on":
        messages.insert(1, {"role": "system", "content": (
            "The user asked you to answer from their uploaded documents, but nothing relevant was found "
            "(or no documents are uploaded). Say that clearly and suggest uploading the document."
        )})

    def event_stream():
        full_content = ""
        try:
            with requests.post(
                OPENROUTER_URL,
                headers=openrouter_headers(),
                json={"model": MXAI_MODEL, "messages": messages, "stream": True},
                stream=True,
                timeout=300,
            ) as response:
                response.raise_for_status()

                for line in response.iter_lines():
                    if not line:
                        continue
                    decoded = line.decode("utf-8")
                    if decoded.startswith("data: "):
                        decoded = decoded[6:]
                    if decoded.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(decoded)
                    except Exception:
                        continue

                    token = chunk.get("choices", [{}])[0].get("delta", {}).get("content") or ""
                    if token:
                        full_content += token
                        yield f"data: {json.dumps({'raw_token': token})}\n\n"

                    finish_reason = chunk.get("choices", [{}])[0].get("finish_reason")
                    if finish_reason:
                        break

            cleaned_raw = clean_think_tags(full_content)
            reply_text = ""
            options: list = []
            try:
                parsed = json.loads(cleaned_raw)
                reply_text = str(parsed.get("reply", "")).strip()
                raw_options = parsed.get("options", [])
                if isinstance(raw_options, list):
                    options = [
                        str(o).strip() for o in raw_options
                        if isinstance(o, (str, int, float)) and str(o).strip()
                    ][:6]
            except Exception:
                reply_text = cleaned_raw.strip()
                options = []

            if not reply_text:
                reply_text = "Sorry, I couldn't generate a response. Please try again."
            reply_text += sources_line

            try:
                supabase.table("mxai_conversations").update({
                    "updated_at": datetime.utcnow().isoformat(),
                }).eq("id", conversation_id).execute()
            except Exception:
                pass

            try:
                supabase.table("mxai_messages").insert({
                    "conversation_id": conversation_id,
                    "role": "assistant",
                    "content": reply_text,
                    "options": options,
                }).execute()
            except Exception:
                try:
                    supabase.table("mxai_messages").insert({
                        "conversation_id": conversation_id,
                        "role": "assistant",
                        "content": reply_text,
                    }).execute()
                except Exception:
                    pass

            yield f"data: {json.dumps({'done': True, 'reply': reply_text, 'options': options})}\n\n"

        except Exception as error:
            yield f"data: {json.dumps({'error': f'Could not reach CH Assistant — {str(error)}'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ===========================================================
# PRESENCE
# ===========================================================

@router.post("/presence")
async def presence_heartbeat(payload: dict = Body(...)):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    now = time.time()
    with presence_lock:
        presence_store[name] = now
    with known_users_lock:
        known_users_store[name] = now
    return {"success": True}


@router.get("/presence")
async def get_presence():
    now = time.time()
    with presence_lock:
        stale = [n for n, ts in presence_store.items() if now - ts > PRESENCE_TTL_SECONDS]
        for n in stale:
            presence_store.pop(n, None)
        active = [{"name": n, "lastSeen": ts} for n, ts in presence_store.items()]
    with known_users_lock:
        everyone = [{"name": n, "lastSeen": ts} for n, ts in known_users_store.items()]
    return {"users": active, "all_users": everyone}


@router.post("/presence/leave")
async def presence_leave(payload: dict = Body(...)):
    name = (payload.get("name") or "").strip()
    with presence_lock:
        presence_store.pop(name, None)
    return {"success": True}


# ===========================================================
# CHAT GROUPS
# ===========================================================

@router.get("/chat-groups")
async def get_chat_groups():
    with groups_lock:
        return {"groups": list(groups_store.values())}


@router.post("/chat-groups")
async def upsert_chat_group(payload: dict = Body(...)):
    group_id = (payload.get("id") or "").strip()
    if not group_id:
        raise HTTPException(status_code=422, detail="id is required")
    label = (payload.get("label") or group_id).strip()
    avatar = (payload.get("avatar") or label[:2].upper())
    with groups_lock:
        existing = groups_store.get(group_id)
        groups_store[group_id] = {
            "id": group_id, "label": label, "avatar": avatar,
            "lastMessage": existing["lastMessage"] if existing else "No messages yet",
        }
        saved = groups_store[group_id]
    return {"success": True, "group": saved}


@router.delete("/chat-groups/{group_id}")
async def delete_chat_group(group_id: str):
    with groups_lock:
        groups_store.pop(group_id, None)
    return {"success": True}


# ===========================================================
# CHAT FILE / IMAGE UPLOADS
# ===========================================================

@router.post("/chat-upload")
async def upload_chat_file(
    request: Request,
    file: UploadFile = File(...),
    channel: str = Form(...),
    sender: str = Form(""),
):
    original_name = file.filename or "file"
    ext = os.path.splitext(original_name)[1]
    stored_name = f"{uuid.uuid4()}{ext}"
    dest_path = os.path.join(CHAT_UPLOAD_DIR, stored_name)

    size = 0
    try:
        with open(dest_path, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                out.write(chunk)
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(error)}")

    mime = file.content_type or "application/octet-stream"
    host = request.headers.get("host") or PUBLIC_BASE_URL_FALLBACK_HOST
    url = f"{request.url.scheme}://{host}/api/chat-uploads/{stored_name}"

    return {"url": url, "name": original_name, "size": size, "mime": mime}


@router.get("/chat-uploads/{filename}")
async def get_chat_upload(filename: str, download: bool = False, name: Optional[str] = None):
    safe_name = os.path.basename(filename)
    path = os.path.join(CHAT_UPLOAD_DIR, safe_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
    if download:
        display_name = os.path.basename(name) if name else safe_name
        return FileResponse(path, filename=display_name)
    return FileResponse(path)


# ===========================================================
# CHAT MESSAGES
# ===========================================================

@router.post("/n8n-result")
async def receive_n8n_result(payload: ChatMessageRequest = Body(...)):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Message text is required")

    row_to_insert = {
        "sender": payload.sender,
        "text": text,
        "channel": payload.channel,
        "is_self": payload.self,
    }

    try:
        result = supabase.table("chat_messages").insert(row_to_insert).execute()
        if not result.data:
            raise RuntimeError("Supabase did not return the newly saved message.")
        saved_message = format_chat_message(result.data[0])
        return {"success": True, "message": saved_message}
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Could not save chat message: {str(error)}")


@router.get("/chat-messages")
async def get_chat_messages(channel: str = "General"):
    try:
        result = (
            supabase.table("chat_messages")
            .select("*")
            .eq("channel", channel)
            .order("created_at", desc=False)
            .execute()
        )
        messages = [format_chat_message(row) for row in (result.data or [])]
        return {"messages": messages}
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Could not load chat messages: {str(error)}")


@router.post("/chat-messages")
async def send_chat_message(payload: SendMessageRequest):
    text = payload.text.strip()
    if not text and not payload.attachment:
        raise HTTPException(status_code=422, detail="Message text or attachment is required")

    row_to_insert = {
        "sender": payload.sender,
        "text": text,
        "channel": payload.channel,
        "is_self": False,
        "attachment": payload.attachment,
    }

    try:
        try:
            result = supabase.table("chat_messages").insert(row_to_insert).execute()
        except Exception as insert_error:
            if payload.attachment is None:
                row_without_attachment = {k: v for k, v in row_to_insert.items() if k != "attachment"}
                result = supabase.table("chat_messages").insert(row_without_attachment).execute()
            else:
                raise insert_error

        if not result.data:
            raise RuntimeError("Supabase did not return the saved message.")

        saved_message = format_chat_message(result.data[0])

        with groups_lock:
            if payload.channel in groups_store:
                if text:
                    preview = text
                elif payload.attachment:
                    preview = f"📎 {payload.attachment.get('name', 'Attachment')}"
                else:
                    preview = groups_store[payload.channel]["lastMessage"]
                groups_store[payload.channel]["lastMessage"] = preview

        return {"success": True, "message": saved_message}
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


# ===========================================================
# FINANCE / SUPPLIERS
# ===========================================================

@router.post("/trigger-automation")
async def trigger_automation(payload: AutomationTriggerRequest):
    webhook_path = payload.webhook_path.strip()
    if not webhook_path:
        raise HTTPException(status_code=422, detail="webhook_path is required")

    try:
        response = requests.post(
            f"http://127.0.0.1:5678/webhook/{webhook_path}",
            json={"triggered_by": payload.triggered_by, "triggered_at": payload.triggered_at},
            timeout=15,
        )
        return {"success": response.ok, "status_code": response.status_code, "response": response.text[:300]}
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=503, detail="Could not reach n8n — make sure it is running on localhost:5678")
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="n8n did not respond in time")
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@router.post("/automation-result")
async def receive_automation_result(payload: AutomationResultRequest):
    automation_results[payload.webhook_path] = {
        "success": payload.success,
        "summary": payload.summary,
        "details": payload.details,
        "completed_at": datetime.now().strftime("%I:%M:%S %p"),
    }
    return {"success": True}


@router.get("/automation-result/{webhook_path}")
async def get_automation_result(webhook_path: str):
    result = automation_results.get(webhook_path)
    if not result:
        return {"ready": False}
    del automation_results[webhook_path]
    return {"ready": True, **result}


@router.get("/suppliers")
async def get_suppliers():
    try:
        result = supabase.table("suppliers").select("*").order("created_at", desc=True).execute()
        suppliers = [format_supplier(row) for row in (result.data or [])]
        return {"success": True, "suppliers": suppliers}
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Could not load suppliers: {str(error)}")


@router.post("/suppliers")
async def create_supplier(payload: SupplierRequest):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Supplier name is required")

    row_to_insert = {
        "name": name,
        "designation": payload.designation.strip() or None,
        "company_name": payload.company.strip() or None,
        "place": payload.place.strip() or None,
        "phone": payload.phone.strip() or None,
        "email": payload.email.strip() or None,
        "supplier_type": payload.supplier_type.strip() or None,
        "onboarding_status": "new",
        "onboarding_started_at": None,
        "onboarding_completed_at": None,
        "onboarding_email_sent": False,
        "onboarding_whatsapp_sent": False,
        "contract_status": "approved",
        "bank_details_status": "pending",
        "compliance_docs_status": "pending",
        "internal_notes": payload.event.strip() or None,
        "raw_notion_data": {"url": payload.url.strip()},
    }

    try:
        result = supabase.table("suppliers").insert(row_to_insert).execute()
        if not result.data:
            raise RuntimeError("Supabase did not return the created supplier.")
        supplier = format_supplier(result.data[0])
        try:
            requests.post("http://127.0.0.1:5678/webhook/supplier-onboarding", json={"supplier": supplier}, timeout=10)
        except Exception:
            pass
        return {"success": True, "supplier": supplier}
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Could not create supplier: {str(error)}")


@router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, payload: SupplierRequest):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Supplier name is required")

    row_to_update = {
        "name": name,
        "designation": payload.designation.strip() or None,
        "company_name": payload.company.strip() or None,
        "place": payload.place.strip() or None,
        "phone": payload.phone.strip() or None,
        "email": payload.email.strip() or None,
        "supplier_type": payload.supplier_type.strip() or None,
        "internal_notes": payload.event.strip() or None,
        "raw_notion_data": {"url": payload.url.strip()},
    }

    try:
        result = supabase.table("suppliers").update(row_to_update).eq("id", supplier_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Supplier not found")
        supplier = format_supplier(result.data[0])
        return {"success": True, "supplier": supplier}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Could not update supplier: {str(error)}")


@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str):
    try:
        result = supabase.table("suppliers").delete().eq("id", supplier_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Supplier not found")
        return {"success": True, "deleted_id": supplier_id}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Could not delete supplier: {str(error)}")


@router.post("/finance-kpis")
async def receive_finance_kpis(payload: FinanceKPIRequest):
    try:
        data = payload.dict()
        result = supabase.table("finance_kpis").insert(data).execute()
        return {"success": True, "data": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/finance-kpis/latest")
async def get_latest_finance_kpis():
    result = (
        supabase.table("finance_kpis")
        .select("*")
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return {}
    return result.data[0]


@router.get("/finance-entries")
async def get_finance_entries():
    result = (
        supabase.table("finance_entries")
        .select("*")
        .order("booking_date", desc=True)
        .limit(100)
        .execute()
    )
    return result.data
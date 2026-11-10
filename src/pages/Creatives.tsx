/**
 * Creatives — pictures and short videos for social media.
 * Pictures are made in the cloud (Cloudflare) and are always available.
 * Videos are made by ComfyUI on the office's main PC (see tools/video-studio and backend/creatives/comfy.py),
 * so they work while that PC is on. The top bar says which is available.
 */
import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Image as ImageIcon, Film, Wand2, LayoutGrid, Download, Loader2, Square, Upload, RefreshCw, Copy, Check, ArrowRight, ExternalLink } from "lucide-react";
import { API_ROOT } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Page, Card, Btn, Muted, Dot, useT, T } from "@/components/ch/kit";

type Mode = "picture" | "text-video" | "image-video" | "storyboard";
type Ratio = "9:16" | "16:9" | "1:1" | "4:3";
type Studio = { images: boolean; prompts: boolean; video: { online: boolean; reason?: string; gpu?: string; queue?: number } };
type Scene = { scene: number; image_prompt: string; video_prompt: string; image_path: string | null; preview: string | null; video_path: string | null; busy: "" | "image" | "video" | "upload"; error: string };

const RATIOS: { v: Ratio; l: string }[] = [{ v: "9:16", l: "Story 9:16" }, { v: "1:1", l: "Square 1:1" }, { v: "4:3", l: "Post 4:3" }, { v: "16:9", l: "Wide 16:9" }];
const DURATIONS = [3, 5, 8];
const VIDEO_WAIT = "Videos usually take 3 to 8 minutes";

async function post(path: string, body: any) {
  const r = await fetch(`${API_ROOT}${path}`, { method: "POST", headers: body instanceof FormData ? {} : { "Content-Type": "application/json" }, body: body instanceof FormData ? body : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || d.error || `Something went wrong (${r.status})`);
  return d;
}
const stopOnServer = (job_id?: string, workflow?: string) => post("/stop-generation", { job_id, workflow }).catch(() => {});
const srcOf = (p: string | null) => (!p ? "" : p.startsWith("http") || p.startsWith("data:") ? p : `${API_ROOT.replace(/\/api$/, "")}/${p}`);

async function downloadUrl(url: string, name: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch { window.open(url, "_blank"); }
}

/** Starts a video job and waits for it (the server answers with a job number straight away). */
async function runVideo(path: string, body: any, onJob: (id: string) => void, cancelled: () => boolean): Promise<string> {
  const { job_id, error } = await post(path, body);
  if (!job_id) throw new Error(error || "The video couldn't be started");
  onJob(job_id);
  for (;;) {
    await new Promise(r => setTimeout(r, 4000));
    if (cancelled()) throw new Error("stopped");
    const s = await fetch(`${API_ROOT}/video-status/${job_id}`).then(r => r.json()).catch(() => null);
    if (!s) continue;
    if (!s.success) throw new Error("The server restarted while making the video. Please try again");
    if (s.status === "done" && s.videoPath) return s.videoPath;
    if (s.status === "error") throw new Error(s.error || "The video couldn't be made");
    if (s.status === "stopped") throw new Error("stopped");
  }
}

function useClock(running: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => { if (!running) { setS(0); return; } const t0 = Date.now(); const i = setInterval(() => setS(Math.round((Date.now() - t0) / 1000)), 1000); return () => clearInterval(i); }, [running]);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Creatives() {
  const t = useT();
  const nav = useNavigate();
  const { profile } = useAuth();
  const [mode, setMode] = useState<Mode>("picture");
  const [studio, setStudio] = useState<Studio | null>(null);
  const [handoff, setHandoff] = useState<{ path: string; prompt: string } | null>(null);

  // Only trust a proper answer: an older server (or one still waking up) answers differently
  const check = async () => {
    try {
      const r = await fetch(`${API_ROOT}/creatives/status`);
      const d = r.ok ? await r.json() : null;
      setStudio(d && typeof d === "object" && d.video && typeof d.video === "object"
        ? { images: d.images !== false, prompts: d.prompts !== false, video: { online: !!d.video.online, reason: d.video.reason, gpu: d.video.gpu, queue: d.video.queue } }
        : { images: true, prompts: true, video: { online: false, reason: r.status === 404 ? "not_set_up" : "offline" } });
    } catch { setStudio(null); }
  };
  useEffect(() => { check(); const i = setInterval(check, 30000); return () => clearInterval(i); }, []);
  const videoOn = !!studio?.video.online;
  const owner = /^(owner|admin)$/i.test(profile?.role || "");

  const tabs: { k: Mode; l: string; I: any }[] = [
    { k: "picture", l: "Picture", I: ImageIcon }, { k: "text-video", l: "Video from text", I: Film },
    { k: "image-video", l: "Video from a picture", I: Wand2 }, { k: "storyboard", l: "Storyboard", I: LayoutGrid }];

  const offlineText = !studio ? "Checking the video studio…"
    : studio.video.reason === "not_set_up" ? "Videos aren't connected yet. Pictures work as normal."
    : studio.video.reason === "wrong_key" ? "The video PC refused the dashboard's key. Check COMFY_KEY on Render."
    : "The video PC is off or ComfyUI isn't running, so videos are paused. Pictures work as normal.";

  return (
    <Page title="Creatives" sub="Pictures and short videos for social media">
      <Card pad="12px 18px">
        <div className="flex items-center gap-5 flex-wrap" style={{ fontSize: 13 }}>
          <span><Dot color={studio?.images === false ? t.RED : t.TEAL} />Pictures {studio?.images === false ? "not set up" : "ready"}</span>
          <span style={{ color: videoOn ? t.INK : t.MUTED }}><Dot color={videoOn ? t.TEAL : studio ? t.GOLD : t.FAINT} />
            {videoOn ? <>Video studio online{studio!.video.gpu ? ` · ${studio!.video.gpu}` : ""}{studio!.video.queue ? ` · ${studio!.video.queue} in the queue` : ""}</> : offlineText}</span>
          <span style={{ flex: 1 }} />
          {!videoOn && studio && owner && <button onClick={() => nav("/help?topic=co-video")} style={{ background: "none", border: "none", color: t.TEAL, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>How to connect it</button>}
          <button onClick={check} title="Check again" style={{ background: "none", border: "none", color: t.MUTED, cursor: "pointer" }}><RefreshCw size={14} /></button>
        </div>
      </Card>

      <div className="flex gap-7 flex-wrap" style={{ borderBottom: `1px solid ${t.LINE}` }}>
        {tabs.map(({ k, l, I }) => (
          <button key={k} onClick={() => setMode(k)} className="flex items-center gap-2"
            style={{ background: "none", border: "none", borderRadius: 0, padding: "0 2px 12px", marginBottom: -1, cursor: "pointer", fontSize: 13.5,
              color: mode === k ? t.TEAL : t.MUTED, fontWeight: mode === k ? 600 : 400, borderBottom: `2px solid ${mode === k ? t.GOLD : "transparent"}` }}>
            <I size={15} />{l}</button>))}
      </div>

      {/* All modes stay mounted so work isn't lost when switching tabs */}
      <div style={{ display: mode === "picture" ? "block" : "none" }}><Picture t={t} videoOn={videoOn} onAnimate={(path, prompt) => { setHandoff({ path, prompt }); setMode("image-video"); }} /></div>
      <div style={{ display: mode === "text-video" ? "block" : "none" }}><TextVideo t={t} videoOn={videoOn} /></div>
      <div style={{ display: mode === "image-video" ? "block" : "none" }}><ImageVideo t={t} videoOn={videoOn} handoff={handoff} /></div>
      <div style={{ display: mode === "storyboard" ? "block" : "none" }}><Storyboard t={t} videoOn={videoOn} /></div>
    </Page>
  );
}

/* ── shared pieces ── */
function Layout({ left, right }: { left: ReactNode; right: ReactNode }) {
  return <div className="grid gap-6 grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] items-start">{left}{right}</div>;
}
function Label({ t, children }: { t: T; children: ReactNode }) { return <div style={{ fontSize: 12.5, color: t.MUTED, marginBottom: 6 }}>{children}</div>; }
function Prompt({ t, value, onChange, placeholder, rows = 4 }: { t: T; value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{ width: "100%", borderRadius: 12, boxShadow: t.IN, border: "none", outline: "none", background: t.BG, color: t.INK, padding: "10px 14px", fontSize: 13, lineHeight: 1.55, resize: "vertical", fontFamily: "inherit" }} />;
}
function Chips<V extends string | number>({ t, value, options, onChange }: { t: T; value: V; options: { v: V; l: string }[]; onChange: (v: any) => void }) {
  return <div className="flex flex-wrap gap-2">{options.map(o => (
    <button key={String(o.v)} onClick={() => onChange(o.v)} style={{ height: 30, padding: "0 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
      background: value === o.v ? (t.dark ? "#1F6F72" : "#13585B") : t.BG, color: value === o.v ? "#fff" : t.MUTED, boxShadow: value === o.v ? "none" : t.BTN }}>{o.l}</button>))}</div>;
}
function ErrorNote({ t, text }: { t: T; text: string }) { return text ? <div style={{ fontSize: 12.5, color: t.RED, lineHeight: 1.5 }}>{text}</div> : null; }
function Stage({ t, ratio, children }: { t: T; ratio: Ratio; children: ReactNode }) {
  const [w, h] = ratio.split(":").map(Number);
  return <div style={{ aspectRatio: `${w} / ${h}`, maxHeight: "68vh", maxWidth: "100%", margin: "0 auto", borderRadius: 14, boxShadow: t.IN, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>{children}</div>;
}
function Waiting({ t, label, clock }: { t: T; label: string; clock?: string }) {
  return <div className="flex flex-col items-center gap-2" style={{ color: t.MUTED, fontSize: 13, textAlign: "center", padding: 20 }}>
    <Loader2 size={22} className="animate-spin" color={t.TEAL} /><div>{label}</div>{clock && <div style={{ fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{clock} · {VIDEO_WAIT.toLowerCase()}</div>}</div>;
}
function Placeholder({ t, I, text }: { t: T; I: any; text: string }) {
  return <div className="flex flex-col items-center gap-2" style={{ color: t.FAINT, fontSize: 13, padding: 20, textAlign: "center" }}><I size={30} strokeWidth={1.2} />{text}</div>;
}
const fill: CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };

/* ── Picture ── */
function Picture({ t, videoOn, onAnimate }: { t: T; videoOn: boolean; onAnimate: (path: string, prompt: string) => void }) {
  const [prompt, setPrompt] = useState(""); const [ratio, setRatio] = useState<Ratio>("4:3");
  const [busy, setBusy] = useState(false); const [img, setImg] = useState<string | null>(null); const [err, setErr] = useState(""); const [copied, setCopied] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const go = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true); setErr(""); ctl.current = new AbortController();
    try {
      const r = await fetch(`${API_ROOT}/generate-image`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt.trim(), ratio }), signal: ctl.current.signal });
      const d = await r.json();
      if (!d.success || !d.imagePath) throw new Error(d.error ? "The picture couldn't be made. Try different wording" : "The picture couldn't be made");
      setImg(d.imagePath);
    } catch (e: any) { if (e?.name !== "AbortError") setErr(e?.message || "The picture couldn't be made"); }
    finally { setBusy(false); }
  };
  return (
    <Layout
      left={<Card pad="20px">
        <div className="flex flex-col gap-4">
          <div><Label t={t}>Describe the picture</Label><Prompt t={t} value={prompt} onChange={setPrompt} placeholder="An overwater villa in the Maldives at sunrise, calm turquoise water, soft golden light" /></div>
          <div><Label t={t}>Shape</Label><Chips t={t} value={ratio} options={RATIOS.map(r => ({ v: r.v, l: r.l }))} onChange={setRatio} /></div>
          <div className="flex gap-2">
            <Btn kind="primary" onClick={go} disabled={busy || !prompt.trim()} style={{ flex: 1 }}>{busy ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}{busy ? "Making the picture…" : "Make picture"}</Btn>
            {busy && <Btn onClick={() => { ctl.current?.abort(); setBusy(false); stopOnServer(); }} title="Stop"><Square size={14} /></Btn>}
          </div>
          <ErrorNote t={t} text={err} />
          <Muted>Takes 10 to 30 seconds. Pictures are kept for 3 days, so download the ones you want to keep.</Muted>
        </div>
      </Card>}
      right={<Card pad="18px">
        <Stage t={t} ratio={ratio}>{busy ? <Waiting t={t} label="Making the picture" /> : img ? <img src={srcOf(img)} alt={prompt} style={fill} /> : <Placeholder t={t} I={ImageIcon} text="Your picture appears here" />}</Stage>
        {img && !busy && <div className="flex gap-2 flex-wrap justify-center" style={{ marginTop: 14 }}>
          <Btn onClick={() => downloadUrl(srcOf(img), "custom-holidays-picture.jpg")}><Download size={15} />Download</Btn>
          <Btn onClick={() => { navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={15} /> : <Copy size={15} />}Copy description</Btn>
          <Btn onClick={() => onAnimate(img, prompt)} disabled={!videoOn} title={videoOn ? "" : "The video studio is offline"}><Film size={15} />Turn into a video<ArrowRight size={14} /></Btn>
        </div>}
      </Card>} />
  );
}

/* ── Video from text ── */
function TextVideo({ t, videoOn }: { t: T; videoOn: boolean }) {
  const [prompt, setPrompt] = useState(""); const [ratio, setRatio] = useState<Ratio>("9:16"); const [dur, setDur] = useState(5);
  const [busy, setBusy] = useState(false); const [vid, setVid] = useState<string | null>(null); const [err, setErr] = useState("");
  const job = useRef<string>(); const cancel = useRef(false); const clock = useClock(busy);
  const go = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true); setErr(""); cancel.current = false;
    try { setVid(await runVideo("/generate-video-text", { prompt: prompt.trim(), ratio, duration_seconds: dur }, id => (job.current = id), () => cancel.current)); }
    catch (e: any) { if (e?.message !== "stopped") setErr(e?.message || "The video couldn't be made"); }
    finally { setBusy(false); }
  };
  return (
    <Layout
      left={<Card pad="20px"><div className="flex flex-col gap-4">
        <div><Label t={t}>Describe the video</Label><Prompt t={t} value={prompt} onChange={setPrompt} placeholder="Slow drone shot over Santorini's white houses at sunset, gentle sea below" /></div>
        <div><Label t={t}>Shape</Label><Chips t={t} value={ratio} options={RATIOS.map(r => ({ v: r.v, l: r.l }))} onChange={setRatio} /></div>
        <div><Label t={t}>Length</Label><Chips t={t} value={dur} options={DURATIONS.map(d => ({ v: d, l: `${d} sec` }))} onChange={setDur} /></div>
        <div className="flex gap-2">
          <Btn kind="primary" onClick={go} disabled={busy || !prompt.trim() || !videoOn} style={{ flex: 1 }}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Film size={15} />}{busy ? "Making the video…" : "Make video"}</Btn>
          {busy && <Btn onClick={() => { cancel.current = true; setBusy(false); stopOnServer(job.current, "ttv.json"); }} title="Stop"><Square size={14} /></Btn>}
        </div>
        <ErrorNote t={t} text={err} />
        <Muted>{videoOn ? `${VIDEO_WAIT}. You can use other pages meanwhile; come back to this tab.` : "The video studio is offline, so videos are paused."}</Muted>
      </div></Card>}
      right={<Card pad="18px">
        <Stage t={t} ratio={ratio}>{busy ? <Waiting t={t} label="Making the video on the main PC" clock={clock} /> : vid ? <video src={vid} controls autoPlay loop muted playsInline style={fill} /> : <Placeholder t={t} I={Film} text="Your video appears here" />}</Stage>
        {vid && !busy && <div className="flex gap-2 justify-center" style={{ marginTop: 14 }}><Btn onClick={() => downloadUrl(vid, "custom-holidays-video.mp4")}><Download size={15} />Download</Btn></div>}
      </Card>} />
  );
}

/* ── Video from a picture ── */
function ImageVideo({ t, videoOn, handoff }: { t: T; videoOn: boolean; handoff: { path: string; prompt: string } | null }) {
  const [path, setPath] = useState<string | null>(null); const [preview, setPreview] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState(""); const [motion, setMotion] = useState("");
  const [ratio, setRatio] = useState<Ratio>("9:16"); const [dur, setDur] = useState(5);
  const [reading, setReading] = useState(false); const [busy, setBusy] = useState(false); const [vid, setVid] = useState<string | null>(null); const [err, setErr] = useState("");
  const job = useRef<string>(); const cancel = useRef(false); const clock = useClock(busy);
  useEffect(() => { if (handoff) { setPath(handoff.path); setPreview(srcOf(handoff.path)); setImagePrompt(handoff.prompt); setMotion(m => m || "Very slow camera push forward, water shimmering gently, soft light shifting"); setVid(null); } }, [handoff]);
  const pick = async (f?: File) => {
    if (!f) return;
    setErr(""); setVid(null); setPath(null); setPreview(URL.createObjectURL(f)); setReading(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const d = await post("/analyze-image", fd);
      setPath(d.imagePath || null); setImagePrompt(d.image_prompt || ""); setMotion(d.video_prompt || "");
      if (!d.imagePath) setErr("The picture couldn't be uploaded. Try again");
    } catch (e: any) { setErr(e?.message || "The picture couldn't be uploaded"); }
    finally { setReading(false); }
  };
  const go = async () => {
    if (!path || !motion.trim() || busy) return;
    setBusy(true); setErr(""); cancel.current = false;
    try { setVid(await runVideo("/generate-video", { image_path: path, image_prompt: imagePrompt, video_prompt: motion.trim(), ratio, duration_seconds: dur }, id => (job.current = id), () => cancel.current)); }
    catch (e: any) { if (e?.message !== "stopped") setErr(e?.message || "The video couldn't be made"); }
    finally { setBusy(false); }
  };
  return (
    <Layout
      left={<Card pad="20px"><div className="flex flex-col gap-4">
        <div><Label t={t}>Picture</Label>
          <label style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 14, border: `1.5px dashed ${t.dark ? "rgba(95,179,174,.35)" : "rgba(19,88,91,.35)"}`, cursor: "pointer" }}>
            {preview ? <img src={preview} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10 }} /> : <span style={{ width: 64, height: 64, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: t.TEAL, boxShadow: t.IN }}><Upload size={20} /></span>}
            <span style={{ fontSize: 13, color: t.MUTED }}>{reading ? "Reading the picture…" : preview ? "Choose a different picture" : "Choose a photo from your computer"}</span>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => pick(e.target.files?.[0])} />
          </label></div>
        <div><Label t={t}>How should it move?</Label><Prompt t={t} rows={3} value={motion} onChange={setMotion} placeholder="Slow push forward, palm leaves swaying, gentle waves" /></div>
        <div><Label t={t}>Shape</Label><Chips t={t} value={ratio} options={RATIOS.map(r => ({ v: r.v, l: r.l }))} onChange={setRatio} /></div>
        <div><Label t={t}>Length</Label><Chips t={t} value={dur} options={DURATIONS.map(d => ({ v: d, l: `${d} sec` }))} onChange={setDur} /></div>
        <div className="flex gap-2">
          <Btn kind="primary" onClick={go} disabled={busy || reading || !path || !motion.trim() || !videoOn} style={{ flex: 1 }}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}{busy ? "Making the video…" : "Bring it to life"}</Btn>
          {busy && <Btn onClick={() => { cancel.current = true; setBusy(false); stopOnServer(job.current, "ltx23.json"); }} title="Stop"><Square size={14} /></Btn>}
        </div>
        <ErrorNote t={t} text={err} />
        <Muted>{videoOn ? `${VIDEO_WAIT}. The picture stays exactly as it is; only gentle movement is added.` : "The video studio is offline, so videos are paused."}</Muted>
      </div></Card>}
      right={<Card pad="18px">
        <Stage t={t} ratio={ratio}>{busy ? <Waiting t={t} label="Making the video on the main PC" clock={clock} /> : vid ? <video src={vid} controls autoPlay loop muted playsInline style={fill} /> : preview ? <img src={preview} alt="" style={{ ...fill, opacity: 0.85 }} /> : <Placeholder t={t} I={Wand2} text="Choose a picture to bring to life" />}</Stage>
        {vid && !busy && <div className="flex gap-2 justify-center" style={{ marginTop: 14 }}><Btn onClick={() => downloadUrl(vid, "custom-holidays-video.mp4")}><Download size={15} />Download</Btn></div>}
      </Card>} />
  );
}

/* ── Storyboard ── */
function Storyboard({ t, videoOn }: { t: T; videoOn: boolean }) {
  const [dest, setDest] = useState(""); const [ratio, setRatio] = useState<Ratio>("9:16"); const [dur, setDur] = useState(5);
  const [busy, setBusy] = useState(false); const [scenes, setScenes] = useState<Scene[]>([]); const [total, setTotal] = useState(0); const [err, setErr] = useState("");
  const jobId = useRef<string>(); const poll = useRef<any>(); const cancels = useRef<Record<number, boolean>>({});
  useEffect(() => () => clearInterval(poll.current), []);
  const upd = (n: number, p: Partial<Scene>) => setScenes(l => l.map(s => (s.scene === n ? { ...s, ...p } : s)));

  const start = async () => {
    if (!dest.trim() || busy) return;
    setBusy(true); setErr(""); setScenes([]); setTotal(0); clearInterval(poll.current);
    try {
      const d = await post("/generate-full-storyboard", { destination: dest.trim(), ratio, duration_seconds: dur });
      if (!d.job_id) throw new Error("The storyboard couldn't be started");
      jobId.current = d.job_id;
      poll.current = setInterval(async () => {
        const s = await fetch(`${API_ROOT}/storyboard-status/${d.job_id}`).then(r => r.json()).catch(() => null);
        if (!s) return;
        if (!s.success) { clearInterval(poll.current); setBusy(false); setErr("The server restarted. Please start again"); return; }
        setTotal(s.total || 0);
        setScenes(prev => {
          const have = new Set(prev.map(p => p.scene));
          const add = (s.scenes || []).filter((x: any) => !have.has(x.scene)).map((x: any) => ({ scene: x.scene, image_prompt: x.image_prompt, video_prompt: x.video_prompt, image_path: x.image_path, preview: null, video_path: null, busy: "", error: x.image_path ? "" : "The picture couldn't be made. Try New picture" } as Scene));
          return add.length ? [...prev, ...add].sort((a, b) => a.scene - b.scene) : prev;
        });
        if (s.status !== "running") { clearInterval(poll.current); setBusy(false); if (s.status === "error") setErr(s.error ? "The storyboard couldn't be written. Try again in a minute" : ""); }
      }, 3000);
    } catch (e: any) { setErr(e?.message || "The storyboard couldn't be started"); setBusy(false); }
  };
  const stopAll = () => { clearInterval(poll.current); setBusy(false); stopOnServer(jobId.current); };

  const newPicture = async (s: Scene) => {
    upd(s.scene, { busy: "image", error: "", video_path: null });
    try { const d = await post("/generate-image", { prompt: s.image_prompt, ratio }); if (!d.imagePath) throw new Error(); upd(s.scene, { image_path: d.imagePath, preview: null, busy: "" }); }
    catch { upd(s.scene, { busy: "", error: "The picture couldn't be made. Try again" }); }
  };
  const ownPicture = async (s: Scene, f?: File) => {
    if (!f) return;
    upd(s.scene, { busy: "upload", error: "", preview: URL.createObjectURL(f), video_path: null });
    try { const fd = new FormData(); fd.append("file", f); const d = await post("/analyze-image", fd);
      upd(s.scene, { image_path: d.imagePath || null, image_prompt: d.image_prompt || s.image_prompt, video_prompt: d.video_prompt || s.video_prompt, busy: "" }); }
    catch { upd(s.scene, { busy: "", error: "The picture couldn't be uploaded" }); }
  };
  const makeVideo = async (s: Scene) => {
    if (!s.image_path) return;
    cancels.current[s.scene] = false;
    upd(s.scene, { busy: "video", error: "" });
    try { const v = await runVideo("/generate-video", { image_path: s.image_path, image_prompt: s.image_prompt, video_prompt: s.video_prompt, ratio, duration_seconds: dur }, () => {}, () => !!cancels.current[s.scene]); upd(s.scene, { video_path: v, busy: "" }); }
    catch (e: any) { upd(s.scene, { busy: "", error: e?.message === "stopped" ? "" : e?.message || "The video couldn't be made" }); }
  };
  const allVideos = async () => { for (const s of scenes.filter(x => x.image_path && !x.video_path)) await makeVideo(s); };

  return (
    <div className="flex flex-col gap-6">
      <Card pad="20px">
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] items-end">
          <div><Label t={t}>Destination or idea</Label>
            <input value={dest} onChange={e => setDest(e.target.value)} onKeyDown={e => e.key === "Enter" && start()} placeholder="A week in Kyoto in cherry blossom season"
              style={{ width: "100%", height: 38, borderRadius: 12, boxShadow: t.IN, border: "none", outline: "none", background: t.BG, color: t.INK, padding: "0 14px", fontSize: 13 }} /></div>
          <div><Label t={t}>Shape</Label><Chips t={t} value={ratio} options={RATIOS.map(r => ({ v: r.v, l: r.v }))} onChange={setRatio} /></div>
          <div><Label t={t}>Each clip</Label><Chips t={t} value={dur} options={DURATIONS.map(d => ({ v: d, l: `${d}s` }))} onChange={setDur} /></div>
          <div className="flex gap-2">
            <Btn kind="primary" onClick={start} disabled={busy || !dest.trim()}>{busy ? <Loader2 size={15} className="animate-spin" /> : <LayoutGrid size={15} />}{busy ? `Scene ${scenes.length + 1} of ${total || "…"}` : "Make storyboard"}</Btn>
            {busy && <Btn onClick={stopAll} title="Stop"><Square size={14} /></Btn>}
          </div>
        </div>
        <ErrorNote t={t} text={err} />
        <div style={{ marginTop: 10 }}><Muted>Writes a short film plan scene by scene and makes a picture for each. Then make each clip into a video, or all of them at once.</Muted></div>
      </Card>

      {scenes.length > 0 && <div className="flex items-center justify-between gap-3 flex-wrap">
        <b style={{ fontSize: 15 }}>{scenes.length} scene{scenes.length === 1 ? "" : "s"}</b>
        <Btn onClick={allVideos} disabled={!videoOn || scenes.some(s => s.busy === "video")} title={videoOn ? "" : "The video studio is offline"}><Film size={15} />Make all videos</Btn>
      </div>}

      <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${ratio === "16:9" ? 360 : 260}px, 1fr))` }}>
        {scenes.map(s => (
          <Card key={s.scene} pad="14px">
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}><b style={{ fontSize: 13 }}>Scene {s.scene}</b>
              {s.video_path ? <Muted>Video ready</Muted> : s.busy === "video" ? <Muted>Making video…</Muted> : null}</div>
            <Stage t={t} ratio={ratio}>
              {s.busy === "image" || s.busy === "upload" ? <Waiting t={t} label={s.busy === "image" ? "Making the picture" : "Reading the picture"} />
                : s.busy === "video" ? <Waiting t={t} label="Making the video" />
                : s.video_path ? <video src={s.video_path} controls loop muted playsInline style={fill} />
                : s.preview || s.image_path ? <img src={s.preview || srcOf(s.image_path)} alt={`Scene ${s.scene}`} style={fill} />
                : <Placeholder t={t} I={ImageIcon} text="No picture yet" />}
            </Stage>
            <textarea value={s.video_prompt} onChange={e => upd(s.scene, { video_prompt: e.target.value })} rows={3} title="How this clip should move"
              style={{ width: "100%", marginTop: 10, borderRadius: 10, boxShadow: t.IN, border: "none", outline: "none", background: t.BG, color: t.INK, padding: "8px 10px", fontSize: 12, lineHeight: 1.5, resize: "vertical", fontFamily: "inherit" }} />
            <ErrorNote t={t} text={s.error} />
            <div className="flex gap-2 flex-wrap" style={{ marginTop: 10 }}>
              {s.busy === "video"
                ? <Btn onClick={() => { cancels.current[s.scene] = true; upd(s.scene, { busy: "" }); stopOnServer(undefined, "ltx23.json"); }} style={{ height: 32 }}><Square size={13} />Stop</Btn>
                : <Btn kind="primary" onClick={() => makeVideo(s)} disabled={!s.image_path || !!s.busy || !videoOn} style={{ height: 32 }}><Film size={14} />{s.video_path ? "Again" : "Make video"}</Btn>}
              <Btn onClick={() => newPicture(s)} disabled={!!s.busy} style={{ height: 32 }}><RefreshCw size={13} />New picture</Btn>
              <label title="Use your own photo" style={{ display: "inline-flex" }}><input type="file" accept="image/*" style={{ display: "none" }} disabled={!!s.busy} onChange={e => ownPicture(s, e.target.files?.[0])} />
                <span style={{ height: 32, width: 36, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: t.BTN, color: t.TEAL, cursor: "pointer" }}><Upload size={14} /></span></label>
              {(s.video_path || s.image_path) && <button onClick={() => s.video_path ? downloadUrl(s.video_path, `scene-${s.scene}.mp4`) : downloadUrl(srcOf(s.image_path), `scene-${s.scene}.jpg`)} title="Download"
                style={{ height: 32, width: 36, borderRadius: 12, border: "none", background: t.BG, boxShadow: t.BTN, color: t.TEAL, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Download size={14} /></button>}
              {s.video_path && <a href={s.video_path} target="_blank" rel="noreferrer" title="Open" style={{ height: 32, width: 36, borderRadius: 12, background: t.BG, boxShadow: t.BTN, color: t.TEAL, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ExternalLink size={14} /></a>}
            </div>
          </Card>))}
      </div>
    </div>
  );
}

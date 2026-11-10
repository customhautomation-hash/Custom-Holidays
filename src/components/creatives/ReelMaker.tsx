/**
 * ReelMaker — a vertical Instagram reel from a brief, or from the Storyboard's clips.
 * 1. The brief is turned into a plan (scenes, on-screen text, caption, hashtags, music mood).
 * 2. A picture is made for each scene in the cloud; with the video studio on, each becomes a moving clip.
 * 3. Text, title, logo, end card and music are switched on or off with buttons, previewed live,
 *    and the reel is recorded in the browser as an MP4 (1080×1920).
 */
import { CSSProperties, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PageVisible } from "@/components/AppGuards";
import { Upload, RefreshCw, Clapperboard, Play, Pause, Download, Loader2, Square, ArrowUp, ArrowDown, X, Copy, Check, Music, Type, Image as ImageIcon, Film, Captions, Stamp, LayoutTemplate } from "lucide-react";
import { Card, Btn, Muted, T } from "@/components/ch/kit";
import { Label, Prompt, Chips, ErrorNote } from "@/components/creatives/ui";
import { API_ROOT } from "@/lib/api";
import { analyseTrack, bestParts, bestStart, fitToBeat, gainAt, MusicFit, TrackInfo } from "@/lib/musicFit";
import { post, srcOf, runVideo, makePicture, downloadBlob, stopOnServer } from "@/lib/creativesApi";
import { W, H, END, ReelLook, TextFormat, TextStyle, Grade, FrameStyle, Transition, PACE_FADE, loadReelFonts, Loaded, Item, ReelPlayer, loadImage, loadVideo, exportReel, exportReelFrames, recordFormat, totalOf } from "@/lib/reelEngine";

type BoardScene = { scene: number; image_prompt: string; video_prompt: string; image_path: string | null; video_path: string | null };
type Clip = { id: string; image_prompt: string; video_prompt: string; photo_query: string; text: string; seconds: number; image: string | null; video: string | null; status: "waiting" | "picture" | "video" | "ready" | "error"; note: string; credit: string; pick: number; kind?: Visuals; alt?: string; ref?: string; card?: boolean };
type Track = { id: string; title: string; creator: string; seconds: number; license: string; url: string; link: string; credit: string; matches?: string[] };
type Visuals = "ai" | "photo" | "video";
type Plan = { kind: string; title: string; end_line: string; caption: string; hashtags: string[]; music_mood: string; music_query: string; music_tags: string[]; music_energy: string };

/** Ideas to start from. They only fill in the brief: any kind of reel can be typed. */
type Idea = { label: string; brief: string; why?: string };
type IdeasState = { ideas: Idea[]; day?: string; sources?: string[]; loading: boolean; failed?: boolean };
/** Used only if today's trending ideas can't be loaded. */
const IDEAS: { l: string; brief: string }[] = [
  { l: "Destination film", brief: "A slow, cinematic Kyoto reel for couples in cherry blossom season: Fushimi Inari at dawn, the Philosopher's Path, a private tea ceremony, a ryokan garden. End with: Plan your spring escape." },
  { l: "Top 5 list", brief: "5 unforgettable experiences in Bali for couples, numbered: Ubud rice terraces, a private villa breakfast, Uluwatu temple at sunset, a jungle swing, a beach club day." },
  { l: "Day by day", brief: "7 days in Switzerland for a family, day by day: Zurich, Lucerne, the Glacier Express, Zermatt and the Matterhorn, Interlaken, Jungfraujoch." },
  { l: "Offer", brief: "Dubai long weekend offer: 4 nights at Atlantis The Royal, private transfers, desert safari and breakfast daily. From ₹1.85L per couple. Valid till 31 March. Bold and simple." },
  { l: "Travel tips", brief: "Things nobody tells you before your first trip to Japan: carry cash, buy an IC card, trains are silent, tipping isn't done, convenience store food is great. Punchy and fun." },
  { l: "Fast trend reel", brief: "Fast, energetic Santorini reel with quick cuts and one or two words per clip: white houses, blue domes, boat trip, sunset in Oia, cliffside pool." },
];

const uid = () => Math.random().toString(36).slice(2, 9);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function ReelMaker({ t, videoOn, board, active = true }: { t: T; videoOn: boolean; board: { dest: string; scenes: BoardScene[] }; active?: boolean }) {
  const [brief, setBrief] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [fmt, setFmt] = useState<TextFormat>({ position: "bottom", font: "serif", size: "medium", style: "classic" });
  const [grade, setGrade] = useState<Grade>("natural");
  const [frame, setFrame] = useState<FrameStyle>("full");
  const [pace, setPace] = useState<keyof typeof PACE_FADE>("slow");
  const [transition, setTransition] = useState<Transition>("dissolve");
  const [source, setSource] = useState<"new" | "board">("new");
  const [opt, setOpt] = useState({ text: true, title: true, logo: true, end: true, music: false, moving: false });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [endSub, setEndSub] = useState("");
  const [music, setMusic] = useState<File | null>(null);
  const [musicCredit, setMusicCredit] = useState("");
  const [visuals, setVisuals] = useState<Visuals>("photo");
  const [volume, setVolume] = useState(0.8);
  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [musicStart, setMusicStart] = useState(0);
  const [onBeat, setOnBeat] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const cancel = useRef(false);
  // Today's trending ideas (new every day, never repeating); the fixed ones are only a fallback
  const [ideas, setIdeas] = useState<IdeasState>({ ideas: [], loading: false });
  const [picked, setPicked] = useState<Idea | null>(null);
  const loadIdeas = async (fresh = false) => {
    setIdeas(s => ({ ...s, loading: true, failed: false }));
    try {
      const r = await fetch(`${API_ROOT}/reel/ideas${fresh ? "?fresh=true" : ""}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(d.ideas) || !d.ideas.length) throw new Error(d.detail || "no ideas");
      setIdeas({ ideas: d.ideas, day: d.day, sources: d.sources, loading: false });
    } catch { setIdeas(s => ({ ...s, loading: false, failed: true })); }
  };
  const ideasAsked = useRef(false);
  useEffect(() => { if (active && !ideasAsked.current) { ideasAsked.current = true; loadIdeas(); } }, [active]);
  // Every clip search can be cancelled by Stop, and gives up on its own if it takes too long
  const aborts = useRef(new Set<AbortController>());
  const boardReady = board.scenes.filter(s => s.image_path || s.video_path);

  useEffect(() => { if (!videoOn) setOpt(o => ({ ...o, moving: false })); }, [videoOn]);
  // Read the beat of the chosen track and start it at its best part
  useEffect(() => {
    let alive = true; setTrack(null);
    if (!music) return;
    (async () => {
      try {
        const ac = new AudioContext(); const buf = await ac.decodeAudioData(await music.arrayBuffer()); ac.close();
        const info = analyseTrack(buf);
        if (alive) { setTrack(info); setMusicStart(bestStart(info, Math.max(10, totalRef.current))); }
      } catch { /* an unreadable track simply isn't beat-matched */ }
    })();
    return () => { alive = false; };
  }, [music]);
  const toggle = (k: keyof typeof opt) => setOpt(o => ({ ...o, [k]: !o[k] }));
  const clipsRef = useRef<Clip[]>([]); clipsRef.current = clips;
  const upd = (id: string, p: Partial<Clip>) => setClips(l => l.map(c => (c.id === id ? { ...c, ...p } : c)));

  const make = async () => {
    setErr(""); cancel.current = false; aborts.current = new Set();
    if (source === "board" && !boardReady.length) { setErr("Make a storyboard first, or choose New clips"); return; }
    if (source === "new" && !brief.trim()) { setErr("Describe the reel first"); return; }
    setBusy("Planning the reel"); setClips([]); setPlan(null);
    try {
      const n = source === "board" ? boardReady.length : 0;
      const { plan: p } = await post("/reel/plan", { brief: brief.trim() || `A luxury travel reel about ${board.dest}`, seconds, clip_count: n });
      setPlan({ kind: p.kind || "", title: p.title, end_line: p.end_line, caption: p.caption, hashtags: p.hashtags || [], music_mood: p.music_mood, music_query: p.music_query || "", music_tags: p.music_tags || [], music_energy: p.music_energy || (p.format?.pace === "fast" ? "high" : p.format?.pace === "slow" ? "calm" : "medium") });
      if (p.format) {
        setFmt({ position: p.format.text_position || "bottom", font: p.format.text_font || "serif", size: p.format.text_size || "medium", style: p.format.text_style || "classic" });
        setPace(p.format.pace || "slow"); setTransition(p.format.transition || "dissolve");
        setGrade(p.format.grade || "natural"); setFrame(p.format.frame || "full");
        // the kind of reel decides whether it ends on our card, shows the logo, has an opening title
        setOpt(o => ({ ...o, end: p.format.end_card !== false, logo: p.format.logo !== false, title: !!p.title, text: p.format.text_style !== "none" || p.scenes.some((x: any) => x.type === "card") }));
      }
      if (p.end_sub) setEndSub(p.end_sub);
      if (source === "board") {
        setClips(boardReady.map((s, i) => ({ id: uid(), image_prompt: s.image_prompt, video_prompt: s.video_prompt, text: p.scenes[i]?.on_screen_text || "",
          seconds: p.scenes[i]?.seconds || Math.max(2, (seconds - END) / n), image: s.image_path, video: s.video_path, status: "ready", note: "", photo_query: "", credit: "", pick: 0 })));
        return;
      }
      const list: Clip[] = p.scenes.map((s: any) => ({ id: uid(), image_prompt: s.image_prompt, video_prompt: s.video_prompt, text: s.on_screen_text, seconds: s.seconds, image: null, video: null,
        status: s.type === "card" ? "ready" : "waiting", note: "", photo_query: s.photo_query || "", alt: s.photo_query_alt || "", credit: "", pick: 0, kind: visuals, card: s.type === "card" }));
      setClips(list);
      for (let i = 0; i < list.length; i++) {
        if (cancel.current) return;
        if (list[i].card) continue;                    // title cards need no picture
        setBusy(`${visuals === "ai" ? "Making picture" : visuals === "video" ? "Finding a real video clip" : "Finding a real photo"} ${i + 1} of ${list.length}`);
        upd(list[i].id, { status: "picture" });
        const got = await getVisual(list[i], visuals, 0, list);
        Object.assign(list[i], got);
        upd(list[i].id, got);
      }
      if (opt.moving && videoOn) {
        for (let i = 0; i < list.length; i++) {
          if (cancel.current || list[i].card || !list[i].image || list[i].video) continue;
          setBusy(`Making moving clip ${i + 1} of ${list.length} on the main PC`);
          upd(list[i].id, { status: "video" });
          try {
            const v = await runVideo("/generate-video", { image_path: list[i].image, image_prompt: list[i].image_prompt, video_prompt: list[i].video_prompt, ratio: "9:16", duration_seconds: Math.max(3, Math.ceil(list[i].seconds)) }, () => {}, () => cancel.current);
            upd(list[i].id, { video: v, status: "ready" });
          } catch (e: any) { upd(list[i].id, { status: "ready", note: e?.message === "stopped" ? "" : "Moving clip failed, the picture is used instead" }); }
        }
      }
    } catch (e: any) { setErr(e?.message || "The reel couldn't be made"); }
    finally { setBusy(""); }
  };
  const stop = () => { cancel.current = true; setBusy(""); aborts.current.forEach(a => a.abort()); aborts.current.clear(); stopOnServer(undefined, "ltx23.json"); setClips(l => l.map(c => (c.status === "picture" || c.status === "video" ? { ...c, status: c.image ? "ready" : "error" } : c))); };

  /** A picture or clip for one scene: real photo / real video clip (falls back to an AI picture), or an AI picture. */
  const getVisual = async (c: Clip, kind: Visuals, pick: number, others: Clip[] = clipsRef.current): Promise<Partial<Clip>> => {
    const ctl = new AbortController(); aborts.current.add(ctl);
    const opts = { signal: ctl.signal };
    const aiPicture = async (note: string): Promise<Partial<Clip>> => {
      try { return { image: await makePicture(c.image_prompt, "9:16", { ...opts, limit: 75_000 }), video: null, credit: "", status: "ready", note }; }
      catch (e: any) {
        if (e?.message === "stopped") return { status: c.image || c.video ? "ready" : "error", note: "" };
        return { status: "error", note: e?.message === "This took too long" ? "This took too long. Press Swap clip to try again" : "Nothing could be found or made for this clip. Press Swap clip to try again" };
      }
    };
    try {
      if (kind !== "ai") {
        try {
          // Don't reuse a photo or clip that's already in this reel
          // (the list being made is passed in, because the screen may not have caught up with the last clip yet)
          const rest = others.filter(x => x.id !== c.id);
          const used = rest.filter(x => x.ref).map(x => x.ref!);
          const credits = rest.filter(x => x.credit).map(x => x.credit);
          const d = await post("/reel/stock", { query: c.photo_query || c.text || c.image_prompt.slice(0, 60), alt: c.alt || "", kind: kind === "video" ? "video" : "photo", pick, exclude: used, avoid_credits: credits, seconds: c.seconds },
            { ...opts, limit: kind === "video" ? 90_000 : 60_000 });
          const p = typeof d.pick === "number" ? d.pick : pick;
          return kind === "video" ? { video: d.url, image: null, credit: d.credit, ref: d.id, pick: p, status: "ready", note: "" } : { image: d.url, video: null, credit: d.credit, ref: d.id, pick: p, status: "ready", note: "" };
        } catch (e: any) {
          if (e?.message === "stopped") return { status: c.image || c.video ? "ready" : "error", note: "" };
          const why = e?.message === "This took too long" ? `No real ${kind === "video" ? "clip" : "photo"} came back in time` : (e?.message || "No real one found");
          return await aiPicture(`${why}. An AI picture is used instead`);
        }
      }
      return await aiPicture("");
    } finally { aborts.current.delete(ctl); }
  };
  /** Swap one clip: the next result for the same search, or the first result for a new search or kind. */
  const swapClip = async (c: Clip, kind: Visuals = clipKind(c), query = c.photo_query) => {
    const fresh = kind !== clipKind(c) || query !== c.photo_query;
    const next = { ...c, photo_query: query };
    upd(c.id, { status: "picture", note: "", photo_query: query });
    const got = await getVisual(next, kind, fresh ? 0 : c.pick + 1);
    upd(c.id, { ...got, kind });
  };
  const clipKind = (c: Clip): Visuals => c.kind || (c.video && c.credit ? "video" : c.credit ? "photo" : "ai");
  const move = (i: number, d: number) => setClips(l => { const c = [...l]; const j = i + d; if (j < 0 || j >= c.length) return l; [c[i], c[j]] = [c[j], c[i]]; return c; });

  const look: ReelLook = { title: plan?.title || "", showTitle: opt.title, showText: opt.text, showLogo: opt.logo, endCard: opt.end, endLine: plan?.end_line || "", endSub, text: fmt, fade: PACE_FADE[pace], transition, grade, frame };
  const usableRaw = clips.filter(c => c.card || c.video || c.image);
  const beatSeconds = useMemo(() => (opt.music && music && track && onBeat ? fitToBeat(usableRaw.map(c => c.seconds), track, musicStart) : null),
    [opt.music, music, track, onBeat, musicStart, usableRaw.map(c => c.seconds).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const usable = beatSeconds ? usableRaw.map((c, i) => ({ ...c, seconds: beatSeconds[i] ?? c.seconds })) : usableRaw;
  const visualCredits = [...new Set(clips.filter(c => c.credit).map(c => c.credit.replace(/^(Photo|Video): /, "")))];
  const creditLine = [visualCredits.length ? `${clips.some(c => c.credit.startsWith("Video")) ? "Footage" : "Photos"}: ${visualCredits.join(", ")}` : "", opt.music && musicCredit ? musicCredit : ""].filter(Boolean).join(" · ");
  const total = usable.reduce((a, c) => a + c.seconds, 0) + (opt.end ? END : 0);
  const totalRef = useRef(total); totalRef.current = total;
  const fit: MusicFit = { start: musicStart, volume, fadeIn: musicStart > 0 ? 0.25 : 0.6, fadeOut: opt.end ? 3.2 : 2.5, loop: !!track && track.duration - musicStart < total };
  // The strongest stretches of the song for this reel's length; "Best part" steps through them
  const parts = useMemo(() => (track ? bestParts(track, Math.max(10, total), 3) : []), [track, Math.round(total)]);
  const partNo = parts.findIndex(p => Math.abs(p - musicStart) < 0.05);

  return (
    <div className="flex flex-col gap-6">
      <Card pad="20px">
        <div className="grid gap-5 grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <div><Label t={t}>Describe the reel you want, in your own words</Label>
              <Prompt t={t} rows={4} value={brief} onChange={setBrief} placeholder="Any kind of reel: a slow destination film, a numbered top 5, a day-by-day itinerary, an offer with your price, travel tips, a hotel tour, a fast trend reel... Say the place, the mood and how it should end." />
              <TrendingIdeas t={t} state={ideas} picked={picked} onMore={() => loadIdeas(true)}
                onPick={x => { setBrief(x.brief); setPicked(x); }} />
            </div>
            <div className="flex gap-6 flex-wrap">
              <div><Label t={t}>Length</Label><Chips t={t} value={seconds} options={[15, 30, 45, 60].map(v => ({ v, l: `${v} sec` }))} onChange={setSeconds} /></div>
              <div><Label t={t}>Pictures</Label><Chips t={t} value={visuals} options={[{ v: "photo", l: "Real photos" }, { v: "video", l: "Real video clips" }, { v: "ai", l: "AI-made" }]} onChange={setVisuals} /></div>
              <div><Label t={t}>Clips</Label><Chips t={t} value={source} options={[{ v: "new", l: "New clips from the brief" }, { v: "board", l: `Storyboard clips${boardReady.length ? ` · ${boardReady.length}` : ""}` }]} onChange={setSource} /></div>
            </div>
          </div>
          <div>
            <Label t={t}>Include</Label>
            <div className="flex flex-wrap gap-2">
              <Toggle t={t} on={opt.title} onClick={() => toggle("title")} I={Type} label="Opening title" />
              <Toggle t={t} on={opt.text} onClick={() => toggle("text")} I={Captions} label="Text on each clip" />
              <Toggle t={t} on={opt.logo} onClick={() => toggle("logo")} I={Stamp} label="Logo" />
              <Toggle t={t} on={opt.end} onClick={() => toggle("end")} I={LayoutTemplate} label="End card" />
              <Toggle t={t} on={opt.music} onClick={() => toggle("music")} I={Music} label="Music" />
              <Toggle t={t} on={opt.moving} onClick={() => videoOn && toggle("moving")} I={Film} label={videoOn ? "Moving clips (main PC)" : "Moving clips · studio offline"} disabled={!videoOn || source === "board"} />
            </div>
            <div style={{ marginTop: 10 }}><Muted>{opt.moving ? "Moving clips take 3 to 8 minutes each on the main PC. Pictures appear first so you can preview straight away." : "Pictures get a slow, cinematic zoom. Turn on Moving clips for real motion when the video studio is online."}</Muted></div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 16 }}>
          <Btn kind="primary" onClick={make} disabled={!!busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Clapperboard size={15} />}{busy ? busy : clips.length ? "Make a new reel" : "Make reel"}</Btn>
          {busy && <Btn onClick={stop} title="Stop"><Square size={14} />Stop</Btn>}
          <ErrorNote t={t} text={err} />
        </div>
      </Card>

      {clips.length > 0 && (
        <div className="grid gap-6 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] items-start">
          <div className="flex flex-col gap-6 min-w-0">
            <Card pad="18px 20px">
              <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: 6 }}>
                <b style={{ fontSize: 15 }}>Clips</b><Muted>{usable.length} of {clips.length} ready · {clock(total)} with the end card</Muted>
              </div>
              {plan?.kind && <div style={{ fontSize: 12.5, color: t.MUTED, marginBottom: 8 }}>Planned as: <b style={{ color: t.INK, fontWeight: 600 }}>{plan.kind}</b></div>}
              <Row t={t} label="Look"><div className="flex flex-wrap gap-x-5 gap-y-2 items-center">
                <Mini t={t} label="Words" value={fmt.style || "classic"} options={[["classic", "Classic"], ["label", "Label"], ["meme", "Meme"], ["handwritten", "Handwritten"], ["bold", "Bold"], ["none", "None"]]} onChange={v => setFmt(f => ({ ...f, style: v as TextStyle }))} />
                <Mini t={t} label="Colour" value={grade} options={[["natural", "Natural"], ["warm", "Warm"], ["film", "Film"], ["moody", "Moody"], ["vibrant", "Vibrant"], ["dreamy", "Dreamy"]]} onChange={v => setGrade(v as Grade)} />
                <Mini t={t} label="Frame" value={frame} options={[["full", "Full"], ["cinematic", "Cinematic bars"]]} onChange={v => setFrame(v as FrameStyle)} />
                <Mini t={t} label="Text" value={fmt.position} options={[["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]]} onChange={v => setFmt(f => ({ ...f, position: v as any }))} />
                <Mini t={t} label="Font" value={fmt.font} options={[["serif", "Elegant"], ["sans", "Modern"]]} onChange={v => setFmt(f => ({ ...f, font: v as any }))} />
                <Mini t={t} label="Size" value={fmt.size} options={[["small", "S"], ["medium", "M"], ["large", "L"]]} onChange={v => setFmt(f => ({ ...f, size: v as any }))} />
                <Mini t={t} label="Transition" value={transition} options={[["dissolve", "Dissolve"], ["slide", "Slide"], ["zoom", "Zoom"], ["cut", "Cut"]]} onChange={v => setTransition(v as Transition)} />
                <Mini t={t} label="Pace" value={pace} options={[["slow", "Slow"], ["medium", "Medium"], ["fast", "Fast"]]} onChange={v => setPace(v as any)} />
              </div></Row>
              {opt.title && <Row t={t} label="Opening title"><input value={plan?.title || ""} onChange={e => setPlan(p => p && { ...p, title: e.target.value })} placeholder="Short hook on the first clip" style={field(t)} /></Row>}
              {clips.map((c, i) => (
                <div key={c.id} className="flex gap-3 items-start" style={{ padding: "12px 0", borderTop: `1px solid ${t.LINE}` }}>
                  <div style={{ width: 54, height: 96, borderRadius: 8, overflow: "hidden", flexShrink: 0, boxShadow: t.IN, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {c.card ? <div style={{ width: "100%", height: "100%", background: "#070707", color: "#fff", fontSize: 7.5, lineHeight: 1.3, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 4, whiteSpace: "pre-line" }}>{c.text.replace(/\\n/g, "\n")}</div>
                      : c.video ? <video src={c.video} muted playsInline style={thumb} /> : c.image ? <img src={srcOf(c.image)} alt="" style={thumb} /> : c.status === "error" ? <X size={16} color={t.RED} /> : <Loader2 size={16} className={c.status === "waiting" ? "" : "animate-spin"} color={t.FAINT} />}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.card ? "Title card" : `Clip ${i + 1}`}<span style={{ fontWeight: 400, color: t.MUTED, marginLeft: 8 }}>{c.card ? "words on black" :
                        { waiting: "waiting", picture: "making the picture…", video: "making the moving clip…", ready: c.video ? "moving clip" : "picture", error: "needs a retry" }[c.status]}</span></span>
                      <div className="flex items-center gap-1">
                        <IconBtn t={t} title="Earlier" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={13} /></IconBtn>
                        <IconBtn t={t} title="Later" onClick={() => move(i, 1)} disabled={i === clips.length - 1}><ArrowDown size={13} /></IconBtn>
                        <IconBtn t={t} title="Remove" onClick={() => setClips(l => l.filter(x => x.id !== c.id))}><X size={13} /></IconBtn>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input value={c.text} onChange={e => upd(c.id, { text: e.target.value })} placeholder={c.card ? "Words on the card" : opt.text ? "Text on this clip (optional)" : "Text on clips is switched off"} disabled={!opt.text && !c.card} style={{ ...field(t), flex: 1 }} />
                      <select value={c.seconds} onChange={e => upd(c.id, { seconds: Number(e.target.value) })} title="How long this clip shows" style={{ ...field(t), width: 96, flex: "none" }}>
                        {[0.8, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30].concat(c.seconds).filter((v, k, a) => a.indexOf(v) === k).sort((a, b) => a - b).map(v => <option key={v} value={v}>{v} sec</option>)}
                      </select>
                    </div>
                    {c.note && <div style={{ fontSize: 12, color: c.status === "error" ? t.RED : t.MUTED }}>{c.note}</div>}
                    {!c.card && <SwapRow t={t} c={c} kind={clipKind(c)} busy={c.status === "picture" || c.status === "video"} onSwap={(k, q) => swapClip(c, k, q)} />}
                    {c.credit && <div style={{ fontSize: 11.5, color: t.FAINT }}>{c.credit}</div>}
                  </div>
                </div>))}
              {opt.end && <Row t={t} label="End card"><div className="flex flex-col gap-2 w-full">
                <input value={plan?.end_line || ""} onChange={e => setPlan(p => p && { ...p, end_line: e.target.value })} placeholder="Closing line" style={field(t)} />
                <input value={endSub} onChange={e => setEndSub(e.target.value)} placeholder="Website or phone, e.g. +91 98200 00000" style={field(t)} /></div></Row>}
              {opt.music && <Row t={t} label="Music"><MusicPicker t={t} tags={plan?.music_tags || []} energy={plan?.music_energy || (pace === "fast" ? "high" : pace === "slow" ? "calm" : "medium")} query={plan?.music_tags?.length ? plan.music_tags.join(" ") : plan?.music_query || plan?.music_mood || "cinematic"} mood={plan?.music_mood || ""} seconds={Math.ceil(total)} music={music} credit={musicCredit}
                onPick={(f, credit) => { setMusic(f); setMusicCredit(credit); }} volume={volume} setVolume={setVolume} /></Row>}
              {opt.music && music && <Row t={t} label="Timing"><div className="flex flex-col gap-2 w-full" style={{ fontSize: 12.5 }}>
                {!track ? <Muted>Reading the beat…</Muted> : <>
                  <div style={{ color: t.MUTED }}>About {track.bpm} beats a minute · {Math.floor(track.duration / 60)}:{String(Math.round(track.duration % 60)).padStart(2, "0")} long{fit.loop ? " · repeats to fill the reel" : ""}</div>
                  <label className="flex items-center gap-3">Music starts at
                    <input type="range" min={0} max={Math.max(0, Math.floor(track.duration - 2))} step={0.1} value={musicStart} onChange={e => setMusicStart(Number(e.target.value))} style={{ flex: 1, accentColor: "#13585B" }} />
                    <span style={{ fontVariantNumeric: "tabular-nums", width: 36 }}>{Math.floor(musicStart / 60)}:{String(Math.floor(musicStart % 60)).padStart(2, "0")}</span>
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Btn onClick={() => parts.length && setMusicStart(parts[(partNo + 1) % parts.length])} style={{ height: 30 }}>
                      {partNo < 0 ? "Best part" : parts.length > 1 ? `Next best part (${partNo + 1} of ${parts.length})` : "Best part"}</Btn>
                    <ListenPart t={t} music={music} start={musicStart} seconds={total} fit={fit} />
                    {partNo >= 0 && <Muted>{partNo === 0 ? "The strongest part of the song" : `Option ${partNo + 1}`}</Muted>}
                  </div>
                  <Muted>Best part looks at how loud and full the song is moment by moment, and picks the stretch the length of your reel that stays strongest the whole way (usually the chorus or the drop), starting on a beat where the song lifts. Press it again for the next option, and Listen to hear exactly what the reel will use.</Muted>
                  <label className="flex items-center gap-2" style={{ cursor: "pointer" }}><input type="checkbox" checked={onBeat} onChange={e => setOnBeat(e.target.checked)} style={{ accentColor: "#13585B" }} />Cut the clips on the beat</label>
                  <Muted>The music fades in, then fades out smoothly over the end card and finishes exactly when the reel ends.</Muted></>}
              </div></Row>}
            </Card>

            {plan && (plan.caption || plan.hashtags.length > 0) && (
              <Card pad="18px 20px">
                <div className="flex items-center justify-between gap-3"><b style={{ fontSize: 15 }}>Instagram caption</b>
                  <Btn onClick={() => { navigator.clipboard.writeText(`${plan.caption}\n\n${plan.hashtags.join(" ")}${creditLine ? `\n\n${creditLine}` : ""}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{ height: 32 }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</Btn></div>
                <textarea value={plan.caption} onChange={e => setPlan(p => p && { ...p, caption: e.target.value })} rows={4} style={{ ...field(t), height: "auto", padding: "10px 12px", marginTop: 10, lineHeight: 1.55, resize: "vertical", fontFamily: "inherit" }} />
                <div style={{ marginTop: 8, fontSize: 12.5, color: t.TEAL, lineHeight: 1.6 }}>{plan.hashtags.join(" ")}</div>
                {creditLine && <div style={{ marginTop: 8, fontSize: 12, color: t.MUTED, lineHeight: 1.5 }}>{creditLine}<div style={{ color: t.FAINT, marginTop: 2 }}>Credits are added when you copy. Creative Commons music needs this credit when you post.</div></div>}
              </Card>)}
          </div>

          <Preview t={t} active={active} clips={usable} look={look} music={opt.music ? music : null} fit={fit} name={(brief || board.dest || "reel").slice(0, 40)} />
        </div>)}
    </div>
  );
}

const thumb: CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
const field = (t: T): CSSProperties => ({ height: 36, borderRadius: 10, boxShadow: t.IN, border: "none", outline: "none", background: t.BG, color: t.INK, padding: "0 12px", fontSize: 13, minWidth: 0, width: "100%" });

function Row({ t, label, children }: { t: T; label: string; children: ReactNode }) {
  return <div className="flex gap-3 items-start" style={{ padding: "12px 0", borderTop: `1px solid ${t.LINE}` }}><span style={{ width: 54, flexShrink: 0, fontSize: 12.5, fontWeight: 600, paddingTop: 9 }}>{label}</span><div className="flex-1 min-w-0 flex">{children}</div></div>;
}
/** "Swap clip" plus what to look for and which kind (real video, real photo or AI picture). */
function SwapRow({ t, c, kind, busy, onSwap }: { t: T; c: Clip; kind: Visuals; busy: boolean; onSwap: (kind: Visuals, query: string) => void }) {
  const [q, setQ] = useState(c.photo_query || c.text || "");
  const [k, setK] = useState<Visuals>(kind);
  useEffect(() => { setQ(c.photo_query || c.text || ""); }, [c.photo_query]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setK(kind); }, [kind]);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Btn onClick={() => onSwap(k, q.trim())} disabled={busy} style={{ height: 32 }} title="Bring in a different clip for this scene">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Swap clip</Btn>
      <div className="flex items-center gap-1">
        {([["video", "Video"], ["photo", "Photo"], ["ai", "AI"]] as [Visuals, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setK(v)} aria-pressed={k === v} title={v === "ai" ? "AI-made picture" : `Real ${l.toLowerCase()}`}
            style={{ height: 26, padding: "0 9px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600,
              background: k === v ? (t.dark ? "#1F6F72" : "#13585B") : t.BG, color: k === v ? "#fff" : t.MUTED, boxShadow: k === v ? "none" : t.BTN }}>{l}</button>))}
      </div>
      {k !== "ai" && <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && !busy && onSwap(k, q.trim())} placeholder="What to look for, e.g. Fushimi Inari at night"
        title="Change this and press Enter or Swap clip" style={{ ...field(t), height: 32, flex: 1, minWidth: 160, fontSize: 12.5 }} />}
    </div>
  );
}

/** Free Creative Commons music (CC0 / CC BY, fine for business use), or your own track. */
function MusicPicker({ t, tags, energy, query, mood, seconds, music, credit, onPick, volume, setVolume }: { t: T; tags: string[]; energy: string; query: string; mood: string; seconds: number; music: File | null; credit: string; onPick: (f: File | null, credit: string) => void; volume: number; setVolume: (v: number) => void }) {
  const [q, setQ] = useState(query);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { setQ(query); }, [query]);
  const [page, setPage] = useState(0);
  const [src, setSrc] = useState("");
  const search = async (term = q, pg = 0) => {
    setBusy("search"); setErr(""); setPage(pg);
    // The planner's tags when the search is still its suggestion; otherwise the words typed
    const useTags = term.trim() === query.trim() && tags.length ? tags : term.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2);
    try { const r = await fetch(`${API_ROOT}/reel/music?q=${encodeURIComponent(term)}&seconds=${seconds}&tags=${encodeURIComponent(useTags.join(","))}&energy=${energy}&page=${pg}`); const d = await r.json(); if (!r.ok) throw new Error(d.detail); setTracks(d.tracks || []); setSrc(d.source || ""); }
    catch (e: any) { setErr(e?.message || "The music library didn't answer"); setTracks([]); }
    finally { setBusy(""); }
  };
  useEffect(() => { search(query); return () => audio.current?.pause(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A new plan with a different vibe: search again for it
  const lastQuery = useRef(query);
  useEffect(() => { if (query !== lastQuery.current) { lastQuery.current = query; search(query); } }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  const listen = (tr: Track) => {
    if (playing === tr.id) { audio.current?.pause(); setPlaying(null); return; }
    audio.current?.pause(); audio.current = new Audio(tr.url); audio.current.volume = 0.7; audio.current.play().catch(() => {}); setPlaying(tr.id);
  };
  const use = async (tr: Track) => {
    setBusy(tr.id); setErr(""); audio.current?.pause(); setPlaying(null);
    try {
      const d = await post("/reel/music/use", { url: tr.url });
      const blob = await (await fetch(d.url)).blob();
      onPick(new File([blob], `${tr.title}.mp3`, { type: "audio/mpeg" }), tr.credit);
    } catch (e: any) { setErr(e?.message || "The track couldn't be loaded"); }
    finally { setBusy(""); }
  };
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return (
    <div className="flex flex-col gap-2 w-full">
      {music && <div style={{ fontSize: 12.5 }}>Using: <b style={{ fontWeight: 600 }}>{music.name.replace(/\.mp3$/, "")}</b>{credit && <span style={{ color: t.FAINT }}> · {credit.replace(/^Music: /, "")}</span>}
        <button onClick={() => onPick(null, "")} style={{ marginLeft: 8, background: "none", border: "none", color: t.TEAL, fontWeight: 600, cursor: "pointer", fontSize: 12.5 }}>Remove</button></div>}
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Mood, e.g. calm piano" style={{ ...field(t), flex: 1 }} />
        <Btn onClick={() => search()} disabled={busy === "search"} style={{ height: 36 }}>{busy === "search" ? <Loader2 size={14} className="animate-spin" /> : <Music size={14} />}Find music</Btn>
      </div>
      {mood && <Muted>Suggested for this reel: {mood}{energy ? ` · ${energy} energy` : ""}</Muted>}
      <div style={{ maxHeight: 230, overflowY: "auto" }}>
        {tracks?.map(tr => (
          <div key={tr.id} className="flex items-center gap-2" style={{ padding: "7px 0", borderTop: `1px solid ${t.LINE}`, fontSize: 12.5 }}>
            <IconBtn t={t} title={playing === tr.id ? "Stop listening" : "Listen"} onClick={() => listen(tr)}>{playing === tr.id ? <Pause size={12} /> : <Play size={12} />}</IconBtn>
            <div className="flex-1 min-w-0"><div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tr.title}</div>
              <div style={{ color: t.FAINT, fontSize: 11.5 }}>{tr.creator} · {mm(tr.seconds)} · {tr.license}{tr.seconds < seconds ? " · shorter than the reel" : ""}{tr.matches?.length ? <span style={{ color: t.TEAL }}> · {tr.matches.join(", ")}</span> : null}</div></div>
            <Btn onClick={() => use(tr)} disabled={!!busy} style={{ height: 30 }}>{busy === tr.id ? <Loader2 size={13} className="animate-spin" /> : null}Use</Btn>
          </div>))}
        {tracks && !tracks.length && !busy && <Muted>No tracks found. Try another mood, like piano, ambient or acoustic.</Muted>}
        {tracks && tracks.length > 0 && <button onClick={() => search(q, page + 1)} disabled={!!busy} style={{ background: "none", border: "none", padding: "8px 0 2px", color: t.TEAL, fontWeight: 600, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={12} />More tracks</button>}
      </div>
      <ErrorNote t={t} text={err} />
      <label className="flex items-center gap-3" style={{ cursor: "pointer", fontSize: 12.5, color: t.TEAL, fontWeight: 600 }}>
        <Upload size={13} />Or upload your own track<input type="file" accept="audio/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f, ""); }} /></label>
      <label className="flex items-center gap-3" style={{ fontSize: 12.5, color: t.MUTED }}>Volume<input type="range" min={0.1} max={1} step={0.05} value={volume} onChange={e => setVolume(Number(e.target.value))} style={{ flex: 1, accentColor: "#13585B" }} /></label>
      <Muted>Instrumental Creative Commons music (CC0 and CC BY only, fine for business use){src === "jamendo" ? ", most popular on Jamendo first" : " via Openverse"}. Teal words show which of the reel's moods a track matches.</Muted>
    </div>
  );
}

/** Plays the part of the song the reel will use, with the same fade in and fade out. */
function ListenPart({ t, music, start, seconds, fit }: { t: T; music: File; start: number; seconds: number; fit: MusicFit }) {
  const [on, setOn] = useState(false);
  const [at, setAt] = useState(0);
  const ref = useRef<{ a: HTMLAudioElement; url: string; timer: number } | null>(null);
  const end = () => {
    const r = ref.current; ref.current = null;
    if (r) { clearInterval(r.timer); r.a.pause(); URL.revokeObjectURL(r.url); }
    setOn(false); setAt(0);
  };
  useEffect(() => end, []);
  useEffect(() => { if (ref.current) end(); }, [start, music]);   // moved the start: stop the old one
  const play = async () => {
    if (ref.current) { end(); return; }
    const url = URL.createObjectURL(music);
    const a = new Audio(url); a.preload = "auto";
    await new Promise<void>(res => { a.onloadedmetadata = () => res(); a.onerror = () => res(); });
    a.currentTime = Math.min(start, Math.max(0, (a.duration || start) - 0.5));
    a.volume = 0;
    const len = Math.max(3, seconds);
    const began = performance.now();
    const timer = window.setInterval(() => {
      const t2 = (performance.now() - began) / 1000;
      if (t2 >= len) { end(); return; }
      if (a.ended && fit.loop) { a.currentTime = 0; a.play().catch(() => {}); }
      a.volume = Math.max(0, Math.min(1, gainAt(t2, len, fit)));
      setAt(t2);
    }, 50);
    ref.current = { a, url, timer };
    setOn(true);
    a.play().catch(() => end());
  };
  return <Btn onClick={play} style={{ height: 30 }}>{on ? <Square size={13} /> : <Play size={13} />}{on ? `Stop ${clock(at)} / ${clock(seconds)}` : "Listen"}</Btn>;
}

/** Today's trending reel ideas: click one to use it, "New ideas" for another fresh set. */
function TrendingIdeas({ t, state, picked, onPick, onMore }: { t: T; state: IdeasState; picked: Idea | null; onPick: (x: Idea) => void; onMore: () => void }) {
  const list: Idea[] = state.ideas.length ? state.ideas : state.failed ? IDEAS.map(x => ({ label: x.l, brief: x.brief })) : [];
  const day = state.day ? new Date(state.day + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
  const link: CSSProperties = { background: "none", border: "none", padding: 0, color: t.TEAL, fontSize: 12, fontWeight: 600, cursor: "pointer" };
  return (
    <div style={{ marginTop: 10 }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span style={{ fontSize: 12, color: t.FAINT }}>{state.ideas.length ? `Trending ideas for today${day ? ` · ${day}` : ""}` : "Need an idea?"}</span>
        {state.loading && !state.ideas.length && <span className="flex items-center gap-1" style={{ fontSize: 12, color: t.MUTED }}><Loader2 size={12} className="animate-spin" />Checking what's trending today…</span>}
        {list.map(x => <button key={x.label + x.brief.slice(0, 12)} title={x.why || x.brief} onClick={() => onPick(x)}
          style={{ ...link, textDecoration: picked?.brief === x.brief ? "underline" : "none", textUnderlineOffset: 3 }}>{x.label}</button>)}
        {(state.ideas.length > 0 || state.failed) && <button onClick={onMore} disabled={state.loading} style={{ ...link, color: t.MUTED, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 4, opacity: state.loading ? 0.6 : 1 }}>
          <RefreshCw size={12} className={state.loading ? "animate-spin" : ""} />{state.loading ? "Finding new ideas…" : state.failed && !state.ideas.length ? "Try trending ideas again" : "New ideas"}</button>}
      </div>
      {picked?.why && <div style={{ fontSize: 12, color: t.MUTED, marginTop: 6 }}>{picked.why}</div>}
      {state.ideas.length > 0 && state.sources?.length ? <div style={{ fontSize: 11.5, color: t.FAINT, marginTop: 4 }}>Based on {state.sources.join(", ")}. New ideas every day, never the same ones twice.</div> : null}
    </div>);
}

function Mini({ t, label, value, options, onChange }: { t: T; label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return <div className="flex items-center gap-1.5"><span style={{ fontSize: 12, color: t.FAINT, marginRight: 2 }}>{label}</span>
    {options.map(([v, l]) => <button key={v} onClick={() => onChange(v)} aria-pressed={value === v} style={{ height: 26, padding: "0 9px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
      background: value === v ? (t.dark ? "#1F6F72" : "#13585B") : t.BG, color: value === v ? "#fff" : t.MUTED, boxShadow: value === v ? "none" : t.BTN }}>{l}</button>)}</div>;
}
function Toggle({ t, on, onClick, I, label, disabled }: { t: T; on: boolean; onClick: () => void; I: any; label: string; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} aria-pressed={on} style={{ height: 32, padding: "0 12px", borderRadius: 99, border: "none", cursor: disabled ? "default" : "pointer", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6,
    background: on ? (t.dark ? "#1F6F72" : "#13585B") : t.BG, color: on ? "#fff" : disabled ? t.FAINT : t.MUTED, boxShadow: on ? "none" : t.BTN, opacity: disabled && !on ? 0.7 : 1 }}><I size={13} />{label}</button>;
}
function IconBtn({ t, title, onClick, disabled, children }: { t: T; title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button title={title} aria-label={title} onClick={onClick} disabled={disabled} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: t.BG, boxShadow: disabled ? "none" : t.BTN, color: disabled ? t.FAINT : t.TEAL, cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{children}</button>;
}

/** Live preview on a canvas, plus export. Media is loaded once and reused while text and timings change. */
function Preview({ t, active, clips, look, music, fit, name }: { t: T; active: boolean; clips: Clip[]; look: ReelLook; music: File | null; fit: MusicFit; name: string }) {
  const pageVisible = useContext(PageVisible);
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<ReelPlayer | null>(null);
  const cache = useRef(new Map<string, Promise<HTMLImageElement | HTMLVideoElement>>());
  const audio = useRef<HTMLAudioElement | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const fmtInfo = useMemo(() => recordFormat(), []);

  const mediaKey = clips.map(c => c.card ? "card" : c.video || c.image).join("|");
  useEffect(() => {
    let alive = true;
    if (!clips.length) { setLoaded(null); return; }
    setLoading(true); setErr("");
    const get = (kind: "image" | "video", src: string) => {
      if (!cache.current.has(src)) cache.current.set(src, kind === "video" ? loadVideo(src) : loadImage(src));
      return cache.current.get(src)!;
    };
    (async () => {
      try {
        await loadReelFonts();
        const items: Item[] = await Promise.all(clips.map(async c => {
          if (c.card) return { el: null, kind: "card" as const, seconds: c.seconds, text: c.text };
          const kind = c.video ? "video" as const : "image" as const;
          return { el: await get(kind, c.video || srcOf(c.image)), kind, seconds: c.seconds, text: c.text };
        }));
        const logo = await loadImage("/ch-mark-peach.png").catch(() => null);
        if (alive) setLoaded({ items, logo });
      } catch (e: any) { if (alive) setErr(e?.message || "The preview couldn't load"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [mediaKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Text and timing changes only redraw
  const L: Loaded | null = useMemo(() => loaded && loaded.items.length === clips.length
    ? { logo: loaded.logo, items: loaded.items.map((it, i) => ({ ...it, seconds: clips[i].seconds, text: clips[i].text })) } : null, [loaded, clips]);

  useEffect(() => {
    if (audio.current) { audio.current.pause(); URL.revokeObjectURL(audio.current.src); audio.current = null; }
    if (music) { audio.current = new Audio(URL.createObjectURL(music)); audio.current.preload = "auto"; }
  }, [music]); // eslint-disable-line react-hooks/exhaustive-deps

  // One player for the life of the preview. New clips, text or settings are swapped in without stopping playback.
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !L) return;
    if (!player.current) { player.current = new ReelPlayer(ctx, L, look, setTime, audio.current, fit); player.current.seek(0); }
    else player.current.update(L, look, audio.current, fit);
  }, [fit.start, fit.volume, fit.loop, fit.fadeOut, L, look.title, look.showTitle, look.showText, look.showLogo, look.endCard, look.endLine, look.endSub, look.text?.position, look.text?.font, look.text?.size, look.text?.style, look.grade, look.frame, look.fade, look.transition, music]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { player.current?.pause(); }, []);
  // Stop the preview (and its music) when you leave the Reel tab or the page
  useEffect(() => { if ((!active || !pageVisible) && player.current?.playing) { player.current.pause(); setPlaying(false); } }, [active, pageVisible]);

  const total = L ? totalOf(L.items, look) : 0;
  const toggle = () => { const p = player.current; if (!p) return; if (p.playing) { p.pause(); setPlaying(false); } else { p.play(() => setPlaying(false)); setPlaying(true); } };
  const doExport = async () => {
    if (!L) return;
    player.current?.pause(); setPlaying(false); setErr(""); setProgress(0);
    try {
      // Frame by frame where the browser can (smooth and complete); otherwise record in real time
      let out: { blob: Blob; ext: string };
      try { out = await exportReelFrames(L, look, music, fit, setProgress); }
      catch (e: any) { if (e?.message !== "NO_WEBCODECS") console.warn("Frame export failed, recording instead:", e); setProgress(0); out = await exportReel(L, look, music, fit, setProgress); }
      const { blob, ext } = out;
      downloadBlob(blob, `${name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "reel"}-reel.${ext}`);
    } catch (e: any) { setErr(e?.message?.includes("tainted") || e?.name === "SecurityError" ? "The browser blocked one of the clips. Try making that clip again" : e?.message || "The reel couldn't be saved"); }
    finally { setProgress(null); }
  };

  return (
    <Card pad="18px" className="xl:sticky xl:top-4">
      <div style={{ position: "relative", width: "100%", maxWidth: 340, margin: "0 auto", aspectRatio: `${W} / ${H}`, borderRadius: 16, overflow: "hidden", background: "#0C2C32", boxShadow: t.IN }}>
        <canvas ref={canvas} width={W} height={H} style={{ width: "100%", height: "100%", display: "block" }} onClick={toggle} />
        {(loading || !L) && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#E6EFEC", fontSize: 13, gap: 8 }}>{clips.length ? <><Loader2 size={16} className="animate-spin" />Loading the preview</> : "The preview appears when the first picture is ready"}</div>}
      </div>
      <div className="flex items-center gap-3" style={{ marginTop: 12 }}>
        <button onClick={toggle} disabled={!L || progress != null} aria-label={playing ? "Pause" : "Play"} style={{ width: 36, height: 36, borderRadius: 99, border: "none", background: "#13585B", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
        <input type="range" min={0} max={total || 1} step={0.05} value={time} disabled={!L || progress != null} onChange={e => { player.current?.pause(); setPlaying(false); player.current?.seek(Number(e.target.value)); }} style={{ flex: 1, accentColor: "#13585B" }} aria-label="Position in the reel" />
        <span style={{ fontSize: 12, color: t.MUTED, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{clock(time)} / {clock(total)}</span>
      </div>
      <Btn kind="primary" onClick={doExport} disabled={!L || progress != null} style={{ width: "100%", marginTop: 14 }}>
        {progress != null ? <><Loader2 size={15} className="animate-spin" />Saving the reel · {Math.round(progress * 100)}%</> : <><Download size={15} />Download reel ({fmtInfo.ext.toUpperCase()})</>}</Btn>
      <div style={{ marginTop: 8 }}><Muted>{progress != null ? "Saving every frame. Keep this tab open until it finishes." : `1080 × 1920, ready for Instagram${fmtInfo.ext === "webm" ? ". This browser saves WebM; use Chrome or Edge for MP4" : ""}.`}</Muted></div>
      <ErrorNote t={t} text={err} />
    </Card>
  );
}

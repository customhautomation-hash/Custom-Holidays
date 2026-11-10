/**
 * reelEngine.ts — draws a reel (1080×1920) on a canvas and records it to a video file, all in the browser.
 * Pictures get a slow zoom ("Ken Burns"), clips cross-fade, text sits on a soft shade, the logo is in the
 * corner and an end card closes the reel. The same drawing is used for the preview and the export.
 */
import { MusicFit, gainAt, scheduleGain } from "./musicFit";

export const W = 1080, H = 1920, FPS = 30, FADE = 0.45, END = 3;

export type ReelClip = { kind: "image" | "video"; src: string; seconds: number; text: string };
/** How the words on each clip look. The planner picks these to suit the kind of reel; people can change them. */
export type TextFormat = { position: "bottom" | "middle" | "top"; font: "serif" | "sans"; size: "small" | "medium" | "large" };
export type Transition = "dissolve" | "slide" | "zoom" | "cut";
export type ReelLook = { title: string; showTitle: boolean; showText: boolean; showLogo: boolean; endCard: boolean; endLine: string; endSub: string; text?: TextFormat; fade?: number; transition?: Transition };
export const PACE_FADE = { slow: 0.5, medium: 0.35, fast: 0.2 } as const;
const SIZES = { serif: { small: 64, medium: 82, large: 104 }, sans: { small: 50, medium: 64, large: 96 } };
const POS_Y = { top: 0.2, middle: 0.5, bottom: 0.8 };
export type Item = { el: HTMLImageElement | HTMLVideoElement; kind: "image" | "video"; seconds: number; text: string };
export type Loaded = { items: Item[]; logo: HTMLImageElement | null };

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => rej(new Error("A picture couldn't be loaded")); i.src = src; });
}
export function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous"; v.muted = true; v.playsInline = true; v.preload = "auto";
    const t = setTimeout(() => rej(new Error("A video clip took too long to load")), 30000);
    v.onloadeddata = () => { clearTimeout(t); res(v); };
    v.onerror = () => { clearTimeout(t); rej(new Error("A video clip couldn't be loaded")); };
    v.src = src;
  });
}

export async function loadReel(clips: ReelClip[]): Promise<Loaded> {
  await (document as any).fonts?.ready;
  const items = await Promise.all(clips.map(async c => ({ el: c.kind === "video" ? await loadVideo(c.src) : await loadImage(c.src), kind: c.kind, seconds: c.seconds, text: c.text })));
  const logo = await loadImage("/ch-mark-peach.png").catch(() => null);
  return { items, logo };
}

export const totalOf = (items: { seconds: number }[], look: ReelLook) => items.reduce((a, c) => a + c.seconds, 0) + (look.endCard ? END : 0);

function cover(ctx: CanvasRenderingContext2D, el: CanvasImageSource, sw: number, sh: number, scale = 1, dx = 0, dy = 0) {
  const r = Math.max(W / sw, H / sh) * scale;
  const w = sw * r, h = sh * r;
  ctx.drawImage(el, (W - w) / 2 + dx, (H - h) / 2 + dy, w, h);
}

function drawItem(ctx: CanvasRenderingContext2D, it: Item, idx: number, lt: number) {
  if (it.kind === "video") {
    const v = it.el as HTMLVideoElement;
    if (v.videoWidth) cover(ctx, v, v.videoWidth, v.videoHeight);
  } else {
    const im = it.el as HTMLImageElement;
    const p = Math.min(1.3, Math.max(0, lt / Math.max(it.seconds, 0.1)));   // keeps moving through the transition
    const dir = idx % 2 ? 1 : -1;
    cover(ctx, im, im.naturalWidth, im.naturalHeight, 1.04 + 0.1 * p, dir * 40 * (p - 0.5), -30 * (p - 0.5));
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let line = "";
  for (const w of words) { const test = line ? line + " " + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function textBlock(ctx: CanvasRenderingContext2D, text: string, font: string, size: number, y: number, alpha: number, color = "#FFFFFF") {
  ctx.save();
  ctx.globalAlpha = alpha; ctx.font = `${font.replace("SIZE", String(size))}`; ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 3;
  const lines = wrap(ctx, text, W - 160);
  const rise = (1 - alpha) * 26;   // words drift up gently as they appear
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + rise + (i - (lines.length - 1) / 2) * size * 1.18));
  ctx.restore();
}

const SERIF = `600 SIZEpx "Playfair Display", Georgia, serif`;
const SANS = `600 SIZEpx "DM Sans", Inter, system-ui, sans-serif`;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const easeIO = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Draws `draw` scaled around the centre and moved by (dx, dy). */
function withTransform(ctx: CanvasRenderingContext2D, scale: number, dx: number, dy: number, alpha: number, draw: () => void) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.translate(W / 2 + dx, H / 2 + dy); ctx.scale(scale, scale); ctx.translate(-W / 2, -H / 2);
  draw(); ctx.restore();
}

/** Draws the reel as it looks at time t (seconds). */
export function drawAt(ctx: CanvasRenderingContext2D, t: number, L: Loaded, look: ReelLook) {
  const items = L.items;
  const fade = look.fade ?? FADE;
  ctx.fillStyle = "#0C2C32"; ctx.fillRect(0, 0, W, H);
  let start = 0, i = 0;
  for (; i < items.length; i++) { if (t < start + items[i].seconds) break; start += items[i].seconds; }
  const clipsEnd = items.reduce((a, c) => a + c.seconds, 0);

  if (i < items.length) {
    const lt = t - start;
    const tr = look.transition || "dissolve";
    if (i > 0 && lt < fade && tr !== "cut") {
      const e = easeIO(lt / fade), prev = () => drawItem(ctx, items[i - 1], i - 1, items[i - 1].seconds + lt), cur = () => drawItem(ctx, items[i], i, lt);
      if (tr === "slide") {          // the new clip pushes the old one up
        withTransform(ctx, 1, 0, -H * e, 1, prev);
        withTransform(ctx, 1, 0, H * (1 - e), 1, cur);
      } else if (tr === "zoom") {    // fly through the old clip into the new one
        withTransform(ctx, 1 + 0.35 * e, 0, 0, 1, prev);
        withTransform(ctx, 1.18 - 0.18 * e, 0, 0, e, cur);
      } else {                       // soft cross-dissolve
        prev();
        withTransform(ctx, 1, 0, 0, e, cur);
      }
    } else drawItem(ctx, items[i], i, lt);

    const it = items[i];
    const showTitle = look.showTitle && i === 0 && look.title && lt < Math.min(it.seconds, 3.4);
    const showText = look.showText && it.text && !showTitle;
    const tf: TextFormat = look.text || { position: "bottom", font: "sans", size: "medium" };
    const shadeTop = showTitle || (showText && tf.position === "top");
    if (showText && !showTitle && tf.position === "middle") {
      ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(0, 0, W, H);
    } else if (showTitle || showText) {
      const g = ctx.createLinearGradient(0, shadeTop ? 0 : H * 0.55, 0, shadeTop ? H * 0.5 : H);
      g.addColorStop(0, shadeTop ? "rgba(0,0,0,.42)" : "rgba(0,0,0,0)");
      g.addColorStop(1, shadeTop ? "rgba(0,0,0,0)" : "rgba(0,0,0,.5)");
      ctx.fillStyle = g; ctx.fillRect(0, shadeTop ? 0 : H * 0.55, W, H * 0.5);
    }
    if (showTitle) {
      const a = Math.min(ease((lt - 0.2) / 0.5), ease((Math.min(it.seconds, 3.4) - lt) / 0.4));
      textBlock(ctx, look.title, SERIF, 96, H * 0.24, a);
    } else if (showText) {
      const a = Math.min(ease((lt - 0.2) / 0.4), ease((it.seconds - lt) / 0.3));
      const size = SIZES[tf.font][tf.size];
      const font = tf.font === "serif" ? SERIF : tf.size === "large" ? SANS.replace("600", "800") : SANS;
      const y = H * POS_Y[tf.position];
      const parts = it.text.split(/\s+[·|]\s+/);
      if (parts.length > 1) {
        ctx.font = font.replace("SIZE", String(size));
        const lines = Math.min(2, Math.ceil(ctx.measureText(parts.slice(1).join(" · ")).width / (W - 160)) || 1);
        textBlock(ctx, parts[0], SANS, 46, y - size * (0.55 + 0.3 * lines), a, "#D4AF5A");
        textBlock(ctx, parts.slice(1).join(" · "), font, size, y, a);
      } else textBlock(ctx, it.text, font, size, y, a);
    }
  } else if (look.endCard) {
    const lt = t - clipsEnd;
    if (items.length && lt < fade) drawItem(ctx, items[items.length - 1], items.length - 1, items[items.length - 1].seconds + lt);
    ctx.save(); ctx.globalAlpha = ease(lt / fade); ctx.fillStyle = "#0C2C32"; ctx.fillRect(0, 0, W, H);
    const a = ease((lt - 0.2) / 0.5);
    ctx.globalAlpha = a;
    if (L.logo) { const s = 260; ctx.drawImage(L.logo, (W - s) / 2, H * 0.36 - s / 2, s, s); }
    ctx.restore();
    textBlock(ctx, "Custom Holidays", SERIF, 70, H * 0.47, a, "#F3EAEA");
    if (look.endLine) textBlock(ctx, look.endLine, SERIF.replace("600", "500"), 54, H * 0.555, a, "#E6EFEC");
    if (look.endSub) textBlock(ctx, look.endSub, SANS, 40, H * 0.64, a, "#D4AF5A");
  }

  if (look.showLogo && L.logo && i < items.length) {
    ctx.save(); ctx.globalAlpha = 0.9; ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 16;
    ctx.drawImage(L.logo, W - 150, 70, 90, 90); ctx.restore();
  }
}

/** A clip shorter than its slot plays in gentle slow motion (down to half speed) instead of freezing. */
function clipRate(v: HTMLVideoElement, slot: number) {
  const d = v.duration || slot;
  return d >= slot ? 1 : Math.max(0.5, d / slot);
}

/** Keeps the video clips in step with the reel's clock. */
function syncVideos(L: Loaded, t: number, playing: boolean, fade = FADE) {
  let start = 0;
  L.items.forEach((it, i) => {
    const s = start; start += it.seconds;
    if (it.kind !== "video") return;
    const v = it.el as HTMLVideoElement;
    const active = t >= s - 0.05 && t < start + fade;
    const rate = clipRate(v, it.seconds);
    const lt = Math.max(0, Math.min((t - s) * rate, (v.duration || it.seconds) - 0.05));
    if (!active) { if (!v.paused) v.pause(); return; }
    if (playing) { if (v.playbackRate !== rate) v.playbackRate = rate; if (v.paused) { v.currentTime = lt; v.play().catch(() => {}); } }
    else { if (!v.paused) v.pause(); if (Math.abs(v.currentTime - lt) > 0.08) v.currentTime = lt; }
  });
}

const NO_FIT: MusicFit = { start: 0, volume: 0.8, fadeIn: 0.5, fadeOut: 3, loop: false };

export class ReelPlayer {
  t = 0; playing = false; private raf = 0; private t0 = 0;
  constructor(private ctx: CanvasRenderingContext2D, public L: Loaded, public look: ReelLook, private onTime?: (t: number) => void,
              public music?: HTMLAudioElement | null, public fit: MusicFit = NO_FIT) {}
  /** Swap in new clips, text, settings or music without stopping playback. */
  update(L: Loaded, look: ReelLook, music?: HTMLAudioElement | null, fit: MusicFit = this.fit) {
    const musicChanged = music !== this.music || fit.start !== this.fit.start;
    this.L = L; this.look = look; this.fit = fit;
    if (musicChanged) { this.music?.pause(); this.music = music; if (this.playing) this.startMusic(); }
    if (this.t > this.total) this.t = this.total;
    if (!this.playing) this.draw();
  }
  get total() { return totalOf(this.L.items, this.look); }
  draw() { drawAt(this.ctx, this.t, this.L, this.look); }
  private musicTime(t: number) {
    const m = this.music; if (!m) return 0;
    const len = (m.duration || 1e9) - this.fit.start;
    return this.fit.start + (this.fit.loop && len > 0 ? t % len : t);
  }
  private startMusic() {
    const m = this.music; if (!m) return;
    m.loop = this.fit.loop; m.currentTime = this.musicTime(this.t); m.volume = gainAt(this.t, this.total, this.fit);
    m.play().catch(() => {});
  }
  seek(t: number) { this.t = Math.max(0, Math.min(t, this.total)); syncVideos(this.L, this.t, false, this.look.fade); if (this.music) this.music.currentTime = this.musicTime(this.t); this.draw(); this.onTime?.(this.t); }
  play(onEnd?: () => void) {
    if (this.t >= this.total - 0.05) this.t = 0;
    this.playing = true; this.t0 = performance.now() - this.t * 1000;
    this.startMusic();
    const tick = () => {
      if (!this.playing) return;
      this.t = (performance.now() - this.t0) / 1000;
      if (this.t >= this.total) { this.t = this.total; this.draw(); this.pause(); this.onTime?.(this.t); onEnd?.(); return; }
      if (this.music) this.music.volume = Math.max(0, Math.min(1, gainAt(this.t, this.total, this.fit)));
      syncVideos(this.L, this.t, true, this.look.fade); this.draw(); this.onTime?.(this.t);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  pause() { this.playing = false; cancelAnimationFrame(this.raf); syncVideos(this.L, this.t, false, this.look.fade); this.music?.pause(); }
}

/** The best format this browser can record: MP4 where possible (Chrome, Edge), otherwise WebM. */
export function recordFormat() {
  const list = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  const mime = list.find(m => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) || "video/webm";
  return { mime, ext: mime.startsWith("video/mp4") ? "mp4" : "webm" };
}

/** Plays the reel once on a hidden canvas and records it. Takes as long as the reel. */
export async function exportReel(L: Loaded, look: ReelLook, music: File | null, fit: MusicFit, onProgress: (p: number) => void): Promise<{ blob: Blob; ext: string }> {
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(FPS);
  let audioCtx: AudioContext | null = null, audio: HTMLAudioElement | null = null, gain: GainNode | null = null;
  const total = totalOf(L.items, look);
  if (music) {
    audioCtx = new AudioContext();
    audio = new Audio(URL.createObjectURL(music));
    const src = audioCtx.createMediaElementSource(audio);
    gain = audioCtx.createGain(); gain.gain.value = 0;
    const dest = audioCtx.createMediaStreamDestination();
    src.connect(gain); gain.connect(dest);
    dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
    scheduleGain(gain.gain, total, fit, audioCtx.currentTime);
  }
  const { mime, ext } = recordFormat();
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise<void>(r => (rec.onstop = () => r()));
  drawAt(ctx, 0, L, look);
  // The gain node does the fades here, so the player keeps the element at full volume
  const player = new ReelPlayer(ctx, L, look, t => onProgress(t / total), audio, { ...fit, volume: 1, fadeIn: 0.0001, fadeOut: 0.0001 });
  rec.start(250);
  await new Promise<void>(r => player.play(r));
  await new Promise(r => setTimeout(r, 200));
  rec.stop(); await done;
  audio?.pause(); audioCtx?.close();
  return { blob: new Blob(chunks, { type: mime.split(";")[0] }), ext };
}

/** Puts every video clip on the exact frame needed for time t (used by the frame-by-frame export). */
async function seekVideos(L: Loaded, t: number, fade: number) {
  let start = 0;
  const waits: Promise<void>[] = [];
  L.items.forEach(it => {
    const s = start; start += it.seconds;
    if (it.kind !== "video") return;
    const v = it.el as HTMLVideoElement;
    if (!v.paused) v.pause();
    if (!(t >= s - 0.05 && t < start + fade)) return;
    const lt = Math.max(0, Math.min((t - s) * clipRate(v, it.seconds), (v.duration || it.seconds) - 0.04));
    if (Math.abs(v.currentTime - lt) < 0.001 && v.readyState >= 2) return;
    waits.push(new Promise<void>(res => {
      const done = () => { clearTimeout(timer); v.removeEventListener("seeked", done); res(); };
      const timer = setTimeout(done, 3000);
      v.addEventListener("seeked", done);
      v.currentTime = lt;
    }));
  });
  await Promise.all(waits);
}

/**
 * Frame-by-frame export with WebCodecs: every one of the 30 frames per second is drawn and encoded,
 * so the file is smooth and complete even on a slow computer or when the tab is in the background.
 * Throws "NO_WEBCODECS" where the browser can't do this (then the real-time recorder is used).
 */
export async function exportReelFrames(L: Loaded, look: ReelLook, music: File | null, fit: MusicFit, onProgress: (p: number) => void): Promise<{ blob: Blob; ext: string }> {
  const w = window as any;
  if (!w.VideoEncoder || !w.VideoFrame) throw new Error("NO_WEBCODECS");
  const fps = 30;
  let vcfg: any = null;
  for (const codec of ["avc1.640034", "avc1.640028", "avc1.4d0034", "avc1.42003e"]) {
    const cfg = { codec, width: W, height: H, bitrate: 10_000_000, framerate: fps };
    try { if ((await w.VideoEncoder.isConfigSupported(cfg)).supported) { vcfg = cfg; break; } } catch { /* try the next */ }
  }
  if (!vcfg) throw new Error("NO_WEBCODECS");
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const total = totalOf(L.items, look);
  const fade = look.fade ?? FADE;

  // Music: mixed offline with the fade in and out, then encoded
  let audioBuf: AudioBuffer | null = null, acfg: any = null;
  const SR = 48000;
  if (music && w.AudioEncoder) {
    const ac = new AudioContext();
    const decoded = await ac.decodeAudioData(await music.arrayBuffer());
    ac.close();
    const off = new OfflineAudioContext(2, Math.ceil(total * SR), SR);
    const src = off.createBufferSource(); src.buffer = decoded;
    const start = Math.min(fit.start, Math.max(0, decoded.duration - 0.5));
    if (fit.loop || decoded.duration - start < total) { src.loop = true; src.loopStart = start; src.loopEnd = decoded.duration; }
    const g = off.createGain();
    scheduleGain(g.gain, total, fit, 0);
    src.connect(g); g.connect(off.destination); src.start(0, start);
    audioBuf = await off.startRendering();
    for (const codec of ["mp4a.40.2", "opus"]) {
      const cfg = { codec, sampleRate: SR, numberOfChannels: 2, bitrate: 160_000 };
      try { if ((await w.AudioEncoder.isConfigSupported(cfg)).supported) { acfg = cfg; break; } } catch { /* try the next */ }
    }
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target, fastStart: "in-memory", firstTimestampBehavior: "offset",
    video: { codec: "avc", width: W, height: H, frameRate: fps },
    ...(acfg ? { audio: { codec: acfg.codec === "opus" ? "opus" : "aac", numberOfChannels: 2, sampleRate: SR } } : {}),
  });
  let failure: any = null;
  const venc = new w.VideoEncoder({ output: (c: any, m: any) => muxer.addVideoChunk(c, m), error: (e: any) => (failure = e) });
  venc.configure(vcfg);

  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const frames = Math.ceil(total * fps);
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    await seekVideos(L, t, fade);
    drawAt(ctx, t, L, look);
    const frame = new w.VideoFrame(canvas, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / fps) });
    venc.encode(frame, { keyFrame: f % (fps * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 5));
    if (failure) throw failure;
    if (f % 6 === 0) { onProgress((f / frames) * (audioBuf ? 0.92 : 1)); await new Promise(r => setTimeout(r, 0)); }
  }
  await venc.flush();

  if (audioBuf && acfg) {
    const aenc = new w.AudioEncoder({ output: (c: any, m: any) => muxer.addAudioChunk(c, m), error: (e: any) => (failure = e) });
    aenc.configure(acfg);
    const L0 = audioBuf.getChannelData(0), L1 = audioBuf.getChannelData(1);
    const step = 4800;
    for (let i = 0; i < audioBuf.length; i += step) {
      const n = Math.min(step, audioBuf.length - i);
      const data = new Float32Array(n * 2); data.set(L0.subarray(i, i + n), 0); data.set(L1.subarray(i, i + n), n);
      const ad = new w.AudioData({ format: "f32-planar", sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SR) * 1e6), data });
      aenc.encode(ad); ad.close();
    }
    await aenc.flush();
    if (failure) throw failure;
  }
  muxer.finalize();
  onProgress(1);
  return { blob: new Blob([target.buffer], { type: "video/mp4" }), ext: "mp4" };
}

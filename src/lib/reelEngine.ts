/**
 * reelEngine.ts — draws a reel (1080×1920) on a canvas and records it to a video file, all in the browser.
 * Pictures get a slow zoom ("Ken Burns"), clips cross-fade, text sits on a soft shade, the logo is in the
 * corner and an end card closes the reel. The same drawing is used for the preview and the export.
 */
export const W = 1080, H = 1920, FPS = 30, FADE = 0.45, END = 3;

export type ReelClip = { kind: "image" | "video"; src: string; seconds: number; text: string };
/** How the words on each clip look. The planner picks these to suit the kind of reel; people can change them. */
export type TextFormat = { position: "bottom" | "middle" | "top"; font: "serif" | "sans"; size: "small" | "medium" | "large" };
export type ReelLook = { title: string; showTitle: boolean; showText: boolean; showLogo: boolean; endCard: boolean; endLine: string; endSub: string; text?: TextFormat; fade?: number };
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
    const p = Math.min(1, Math.max(0, lt / Math.max(it.seconds, 0.1)));
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
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + (i - (lines.length - 1) / 2) * size * 1.18));
  ctx.restore();
}

const SERIF = `600 SIZEpx "Playfair Display", Georgia, serif`;
const SANS = `600 SIZEpx "DM Sans", Inter, system-ui, sans-serif`;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

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
    if (i > 0 && lt < fade) drawItem(ctx, items[i - 1], i - 1, items[i - 1].seconds + lt);
    ctx.save(); ctx.globalAlpha = i > 0 && lt < fade ? ease(lt / fade) : 1; drawItem(ctx, items[i], i, lt); ctx.restore();

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

/** Keeps the video clips in step with the reel's clock. */
function syncVideos(L: Loaded, t: number, playing: boolean, fade = FADE) {
  let start = 0;
  L.items.forEach((it, i) => {
    const s = start; start += it.seconds;
    if (it.kind !== "video") return;
    const v = it.el as HTMLVideoElement;
    const active = t >= s - 0.05 && t < start + fade;
    const lt = Math.max(0, Math.min(t - s, (v.duration || it.seconds) - 0.05));
    if (!active) { if (!v.paused) v.pause(); return; }
    if (playing) { if (v.paused) { v.currentTime = lt; v.play().catch(() => {}); } }
    else { if (!v.paused) v.pause(); if (Math.abs(v.currentTime - lt) > 0.08) v.currentTime = lt; }
  });
}

export class ReelPlayer {
  t = 0; playing = false; private raf = 0; private t0 = 0;
  constructor(private ctx: CanvasRenderingContext2D, public L: Loaded, public look: ReelLook, private onTime?: (t: number) => void, public music?: HTMLAudioElement | null) {}
  /** Swap in new clips, text or settings without stopping playback. */
  update(L: Loaded, look: ReelLook, music?: HTMLAudioElement | null) {
    const musicChanged = music !== this.music;
    if (musicChanged) { this.music?.pause(); this.music = music; if (this.playing && music) { music.currentTime = this.t; music.play().catch(() => {}); } }
    this.L = L; this.look = look;
    if (this.t > this.total) this.t = this.total;
    if (!this.playing) this.draw();
  }
  get total() { return totalOf(this.L.items, this.look); }
  draw() { drawAt(this.ctx, this.t, this.L, this.look); }
  seek(t: number) { this.t = Math.max(0, Math.min(t, this.total)); syncVideos(this.L, this.t, false, this.look.fade); if (this.music) this.music.currentTime = this.t; this.draw(); this.onTime?.(this.t); }
  play(onEnd?: () => void) {
    if (this.t >= this.total - 0.05) this.t = 0;
    this.playing = true; this.t0 = performance.now() - this.t * 1000;
    if (this.music) { this.music.currentTime = this.t; this.music.play().catch(() => {}); }
    const tick = () => {
      if (!this.playing) return;
      this.t = (performance.now() - this.t0) / 1000;
      if (this.t >= this.total) { this.t = this.total; this.draw(); this.pause(); this.onTime?.(this.t); onEnd?.(); return; }
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
export async function exportReel(L: Loaded, look: ReelLook, music: File | null, volume: number, onProgress: (p: number) => void): Promise<{ blob: Blob; ext: string }> {
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
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 1);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime + Math.max(1, total - 1.8));
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + total);
  }
  const { mime, ext } = recordFormat();
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise<void>(r => (rec.onstop = () => r()));
  drawAt(ctx, 0, L, look);
  const player = new ReelPlayer(ctx, L, look, t => onProgress(t / total), audio);
  rec.start(250);
  await new Promise<void>(r => player.play(r));
  await new Promise(r => setTimeout(r, 200));
  rec.stop(); await done;
  audio?.pause(); audioCtx?.close();
  return { blob: new Blob(chunks, { type: mime.split(";")[0] }), ext };
}

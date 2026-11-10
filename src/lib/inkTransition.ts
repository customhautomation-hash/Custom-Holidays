/**
 * inkTransition.ts — the light/dark switch spreads across the screen like ink in water.
 *
 * How it works:
 *  1. The browser takes a picture of the page in the old theme, we switch the theme, and it shows the
 *     new theme on top (the View Transitions API, in Chrome and Edge).
 *  2. A mask on the new theme decides which parts are already visible. The mask comes from one "arrival
 *     time" map: how soon the ink reaches each point. It starts at the button you clicked, and swirling
 *     noise (domain-warped fractal noise, like marbled paper) bends the edge into tendrils and wisps.
 *  3. Each frame of the animation shows everything the ink has reached by then.
 * Browsers without View Transitions, and people who turn off animations in their system, get an
 * instant switch.
 */

const DURATION = 1600;   // ms
const FRAMES = 48;      // 30 frames a second

// ── Small, fast value noise ───────────────────────────────────────────────
function makeNoise(seed: number) {
  const p = new Uint8Array(512);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  let s = seed;
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t: number) => t * t * (3 - 2 * t);
  const h = (x: number, y: number) => p[(p[x & 255] + y) & 511] / 255;
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x: number, y: number, oct = 4) => {
    let sum = 0, amp = 0.5, f = 1;
    for (let o = 0; o < oct; o++) { sum += amp * noise(x * f, y * f); f *= 2.03; amp *= 0.5; }
    return sum / (1 - Math.pow(0.5, oct));      // 0..1
  };
}

/**
 * The arrival-time map: 0 = the ink is there at once, 1 = the ink gets there last.
 * Like a drop of ink spreading on wet paper: a growing blot from the button whose edge is
 *  • feathered into fine streaks that point outwards (noise stretched along the direction of travel),
 *  • gently bent into swirls (domain-warped noise, like marbling),
 *  • with a few thin threads of the old colour left behind that close up last.
 * The bends are kept small, so the ink always spreads as one connected front (no stray blobs ahead of it).
 */
function arrivalMap(w: number, h: number, ox: number, oy: number) {
  const fbm = makeNoise(1 + Math.floor(Math.random() * 1e6));
  const T = new Float32Array(w * h);
  const aspect = w / h;
  const far = Math.max(...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([cx, cy]) => Math.hypot((cx - ox) * aspect, cy - oy)));
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const dx = (u - ox) * aspect, dy = v - oy;
      const r = Math.hypot(dx, dy) / far;                       // 0 at the button, 1 at the farthest corner
      const ang = Math.atan2(dy, dx);
      const px = u * aspect * 1.4, py = v * 1.4;
      // marbling swirl
      const qx = fbm(px + 1.7, py + 9.2, 3), qy = fbm(px + 8.3, py + 2.8, 3);
      const swirl = fbm(px + 2.5 * qx, py + 2.5 * qy, 4);
      // feathered streaks: fine across the direction of travel, long along it
      const streak = fbm(ang * 22 + 5 * qx, r * 3 + 2.5 * qy, 4);
      // thin threads of the old colour, left behind and closing last
      const thread = Math.pow(1 - Math.abs(2 * fbm(px * 2.6 + 6 * qx, py * 2.6 + 6 * qy, 3) - 1), 8);
      const t = r + (swirl - 0.5) * 0.24 + (streak - 0.5) * (0.06 + 0.15 * Math.min(1, r * 2)) + thread * 0.1;
      T[y * w + x] = t;
      if (t < lo) lo = t; if (t > hi) hi = t;
    }
  }
  for (let i = 0; i < T.length; i++) T[i] = (T[i] - lo) / (hi - lo);
  return T;
}

// Starts at once (a drop landing), sweeps steadily, then settles gently as the last threads close
const easeInOut = (x: number) => 1 - Math.pow(1 - x, 1.6);

/**
 * Makes all the mask frames as ONE tall image (a sprite sheet), then stretched to the screen.
 * The animation steps through it by moving it, so no new image has to load mid-animation (no flicker).
 */
type Sprite = { url: string; img: HTMLImageElement; key: string };
async function maskSprite(ox: number, oy: number): Promise<Sprite> {
  const w = 640, h = Math.max(160, Math.round(640 * window.innerHeight / Math.max(1, window.innerWidth)));
  const T = arrivalMap(w, h, ox, oy);
  const c = document.createElement("canvas"); c.width = w; c.height = h * (FRAMES + 1);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const edge = 0.006;                                   // a crisp, slightly soft ink edge
  for (let k = 0; k <= FRAMES; k++) {
    const th = easeInOut(k / FRAMES) * (1 + 2 * edge) - edge;
    for (let i = 0, j = 0; i < T.length; i++, j += 4) {
      const a = k === FRAMES ? 1 : Math.max(0, Math.min(1, (th - T[i]) / edge + 0.5));
      img.data[j + 3] = Math.round(a * 255);
    }
    ctx.putImageData(img, 0, k * h);
  }
  const blob = await new Promise<Blob | null>(res => c.toBlob(res, "image/png"));
  if (!blob) throw new Error("mask");
  const url = URL.createObjectURL(blob);
  const im = new Image(); im.src = url;
  await im.decode();
  return { url, img: im, key: keyOf(ox, oy) };
}
const keyOf = (ox: number, oy: number) => `${Math.round(ox * 20)}:${Math.round(oy * 20)}:${window.innerWidth}x${window.innerHeight}`;

// One ink pattern is made ahead of time (when the pointer comes near the button), so the click is instant
let ready: Promise<Sprite> | null = null;
let readyKey = "";
function prepare(ox: number, oy: number) {
  const key = keyOf(ox, oy);
  if (ready && readyKey === key) return ready;
  readyKey = key;
  ready = maskSprite(ox, oy);
  ready.catch(() => { ready = null; readyKey = ""; });
  return ready;
}

/** Call when the pointer comes over the theme button: makes the ink pattern ahead of time. */
export function warmInk(el?: Element | null) {
  if (!(document as any).startViewTransition || !el) return;
  const b = el.getBoundingClientRect();
  prepare((b.left + b.width / 2) / window.innerWidth, (b.top + b.height / 2) / window.innerHeight);
}

let running = false;

/**
 * Switch the theme with the ink effect. `apply` must switch the theme straight away (class + React state).
 * `from` is where the click was; the ink starts there.
 */
export async function inkSwitch(apply: () => void, from?: { x: number; y: number }) {
  const doc = document as any;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (running || reduce || !doc.startViewTransition) { apply(); return; }
  running = true;
  const x = from?.x ?? window.innerWidth - 60, y = from?.y ?? 40;
  let sprite: Sprite;
  try { sprite = await prepare(x / window.innerWidth, y / window.innerHeight); }
  catch { running = false; apply(); return; }
  ready = null; readyKey = "";                          // a fresh pattern next time

  const root = document.documentElement;
  root.style.setProperty("--ink-mask", `url(${sprite.url})`);
  root.style.setProperty("--ink-size", `100% ${(FRAMES + 1) * 100}%`);
  root.classList.add("ink-switching");
  const finish = () => {
    root.classList.remove("ink-switching");
    root.style.removeProperty("--ink-mask"); root.style.removeProperty("--ink-size");
    setTimeout(() => URL.revokeObjectURL(sprite.url), 200);
    running = false;
    setTimeout(() => prepare(x / window.innerWidth, y / window.innerHeight), 400);   // and get the next one ready
  };
  try {
    const vt = doc.startViewTransition(() => apply());
    vt.ready.then(() => {
      root.animate(
        [{ maskPosition: "0% 0%", WebkitMaskPosition: "0% 0%" } as Keyframe, { maskPosition: "0% 100%", WebkitMaskPosition: "0% 100%" } as Keyframe],
        { duration: DURATION, easing: `steps(${FRAMES}, end)`, fill: "forwards", pseudoElement: "::view-transition-new(root)" } as any);
    }).catch(() => {});
    vt.finished.finally(finish);
  } catch { finish(); apply(); }
}

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

const DURATION = 1500;   // ms
const FRAMES = 45;

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

/** The arrival-time map: 0 = the ink is there at once, 1 = the ink gets there last. */
function arrivalMap(w: number, h: number, ox: number, oy: number) {
  const fbm = makeNoise(1 + Math.floor(Math.random() * 1e6));
  const T = new Float32Array(w * h);
  const aspect = w / h;
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([cx, cy]) => Math.hypot((cx - ox) * aspect, cy - oy));
  const far = Math.max(...corners);
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const px = u * aspect * 1.6, py = v * 1.6;
      // Marbling: noise pushed around by noise pushed around by noise (Inigo Quilez's domain warping),
      // which stretches it into long swirls; ridges of it become thin ink filaments
      const qx = fbm(px + 1.7, py + 9.2, 3), qy = fbm(px + 8.3, py + 2.8, 3);
      const rx = fbm(px + 4 * qx + 1.7, py + 4 * qy + 9.2, 3), ry = fbm(px + 4 * qx + 8.3, py + 4 * qy + 2.8, 3);
      const warp = fbm(px + 4 * rx, py + 4 * ry, 4);
      const ridge = Math.pow(1 - Math.abs(2 * fbm(px * 3 + 7 * rx, py * 3 + 7 * ry, 3) - 1), 4);
      const d = Math.hypot((u - ox) * aspect, v - oy) / far;
      const t = d * 0.85 + (warp - 0.5) * 0.62 - ridge * 0.15;
      T[y * w + x] = t;
      if (t < lo) lo = t; if (t > hi) hi = t;
    }
  }
  for (let i = 0; i < T.length; i++) T[i] = (T[i] - lo) / (hi - lo);
  return T;
}

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/**
 * Makes all the mask frames as ONE tall image (a sprite sheet), small and then stretched to the screen.
 * The animation steps through it by moving it, so no new image has to load mid-animation (no flicker).
 */
async function maskSprite(ox: number, oy: number): Promise<{ url: string; img: HTMLImageElement }> {
  const w = 420, h = Math.max(120, Math.round(420 * window.innerHeight / Math.max(1, window.innerWidth)));
  const T = arrivalMap(w, h, ox, oy);
  const c = document.createElement("canvas"); c.width = w; c.height = h * (FRAMES + 1);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const edge = 0.014;
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
  return { url, img: im };
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
  let sprite: { url: string; img: HTMLImageElement };
  try { sprite = await maskSprite(x / window.innerWidth, y / window.innerHeight); }
  catch { running = false; apply(); return; }

  const root = document.documentElement;
  root.style.setProperty("--ink-mask", `url(${sprite.url})`);
  root.style.setProperty("--ink-size", `100% ${(FRAMES + 1) * 100}%`);
  root.classList.add("ink-switching");
  const finish = () => {
    root.classList.remove("ink-switching");
    root.style.removeProperty("--ink-mask"); root.style.removeProperty("--ink-size");
    setTimeout(() => URL.revokeObjectURL(sprite.url), 200);
    running = false;
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

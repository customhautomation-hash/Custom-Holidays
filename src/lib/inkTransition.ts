/**
 * inkTransition.ts — the light/dark switch spreads across the screen like ink in water.
 *
 * How it works:
 *  1. The browser takes a picture of the page in the old theme, we switch the theme, and it shows the
 *     new theme on top (the View Transitions API, in Chrome and Edge).
 *  2. A mask on the new theme decides how much of it shows at each point. The mask is drawn by the graphics
 *     card (a small WebGL shader): an ink blot that grows from the button you clicked, with a soft, smoky
 *     edge, swirls that flow as it spreads (marbling), and thin veins of the old colour that dissolve last.
 *  3. All the frames are drawn ahead of time (when the pointer comes over the button) into one tall image
 *     that the animation steps through, so the click is instant and nothing loads mid-animation.
 * Browsers without View Transitions or WebGL, and people who turn off animations in their system, get an
 * instant switch.
 */

const DURATION = 1600;   // ms
const FRAMES = 48;      // 30 frames a second

/**
 * The ink, drawn by the graphics card (a WebGL shader) frame by frame, so the shapes really flow:
 *  • a blot grows from the button; its edge is soft and smoky, not a hard cut-out
 *  • the swirls move as it spreads (noise pushed around by noise that changes over time, like marbling)
 *  • thin veins of the old colour run through the ink just behind the edge, then dissolve
 * All frames go into ONE tall image (a sprite sheet) that the animation steps through, so nothing has
 * to load mid-animation.
 */
const FRAG = `
precision highp float;
uniform vec2 uRes; uniform vec2 uO; uniform float uT; uniform float uSeed; uniform float uAspect;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*n(p); p = p*2.03 + 17.0; a *= 0.5; } return s/0.97; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes; uv.y = 1.0 - uv.y;
  vec2 p = vec2(uv.x*uAspect, uv.y);
  vec2 d = p - vec2(uO.x*uAspect, uO.y);
  float far = max(max(length(vec2(0.0,0.0)-vec2(uO.x*uAspect,uO.y)), length(vec2(uAspect,0.0)-vec2(uO.x*uAspect,uO.y))),
                  max(length(vec2(0.0,1.0)-vec2(uO.x*uAspect,uO.y)), length(vec2(uAspect,1.0)-vec2(uO.x*uAspect,uO.y))));
  float r = length(d)/far;
  float t = uT;
  // flowing marbling: the warp itself drifts outwards with the ink
  vec2 q = vec2(fbm(p*2.2 + vec2(0.0, t*0.8)), fbm(p*2.2 + vec2(5.2, 1.3) - vec2(t*0.6, 0.0)));
  vec2 w = vec2(fbm(p*2.0 + 3.5*q + vec2(1.7, 9.2) + t*0.5), fbm(p*2.0 + 3.5*q + vec2(8.3, 2.8) - t*0.4));
  float marble = fbm(p*1.6 + 3.0*w);
  // torn, feathery fringes pointing outwards
  float ang = atan(d.y, d.x);
  float fringe = fbm(vec2(ang*9.0 + 2.0*w.x, r*5.0 - t*2.0));
  float f = r + (marble - 0.5)*0.26 + (fringe - 0.5)*0.12*smoothstep(0.0, 0.3, r);
  // the front: starts at once, sweeps, settles
  float front = -0.06 + 1.3*(1.0 - pow(1.0 - t, 1.35));
  float behind = front - f;                                   // > 0: the ink has arrived here
  float a = smoothstep(-0.012, 0.035, behind);                   // soft, smoky edge
  // translucent smoke just at the edge
  float smoke = fbm(p*4.0 + 3.0*w + t);
  a *= mix(1.0, smoothstep(0.3, 0.7, smoke), 1.0 - smoothstep(0.0, 0.05, behind));
  // veins of the old colour inside the ink, fading as the ink settles
  float vein = 1.0 - abs(2.0*fbm(p*3.0 + 5.0*w) - 1.0);
  vein = smoothstep(0.88, 0.98, vein);
  a *= 1.0 - vein*(1.0 - smoothstep(0.02, 0.18, behind))*0.95;
  if (t >= 1.0) a = 1.0;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}`;

type Sprite = { url: string; img: HTMLImageElement; key: string };
async function maskSprite(ox: number, oy: number): Promise<Sprite> {
  const w = 640, h = Math.max(160, Math.round(640 * window.innerHeight / Math.max(1, window.innerWidth)));
  const gc = document.createElement("canvas"); gc.width = w; gc.height = h;
  const gl = gc.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true }) as WebGLRenderingContext | null;
  if (!gl) throw new Error("no webgl");
  const sh = (type: number, src: string) => { const x = gl.createShader(type)!; gl.shaderSource(x, src); gl.compileShader(x);
    if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) || "shader"); return x; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }"));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (name: string) => gl.getUniformLocation(prog, name);
  gl.uniform2f(U("uRes"), w, h); gl.uniform2f(U("uO"), ox, oy); gl.uniform1f(U("uAspect"), w / h);
  gl.uniform1f(U("uSeed"), Math.random() * 100);
  gl.viewport(0, 0, w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h * (FRAMES + 1);
  const ctx = c.getContext("2d")!;
  for (let k = 0; k <= FRAMES; k++) {
    gl.uniform1f(U("uT"), k / FRAMES);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ctx.drawImage(gc, 0, k * h);
  }
  (gl.getExtension("WEBGL_lose_context") as any)?.loseContext();
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
  try {
    // If the pattern isn't ready within a moment (a slow computer, no hover first), switch plainly this time
    const slow = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("slow")), 700));
    sprite = await Promise.race([prepare(x / window.innerWidth, y / window.innerHeight), slow]);
  }
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

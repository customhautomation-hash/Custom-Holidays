/**
 * serverWake.ts
 * The backend runs on Render's free plan, which goes to sleep after ~15 quiet minutes
 * and takes up to a minute to wake. Without help, the first request after a quiet spell
 * fails and the page looks broken.
 *
 * This wraps window.fetch for calls to our own backend only:
 *  - if a call is slow (> 4s), a small "Waking up the server" note appears
 *  - if a call fails while the server is starting (network error, 502/503/504),
 *    it is retried quietly for up to 90 seconds
 * Calls to Supabase, Google and anything else are left untouched.
 */
import { API_ROOT } from "./api";

const BACKEND = (() => { try { return new URL(API_ROOT).origin; } catch { return ""; } })();
const WAIT_MS = 90_000;
const SLOW_MS = 4_000;

type Listener = (waking: boolean) => void;
const listeners = new Set<Listener>();
let slowCalls = 0;
let waking = false;

function emit() {
  const next = slowCalls > 0;
  if (next !== waking) { waking = next; listeners.forEach(f => { try { f(waking); } catch { /* ignore */ } }); }
}

export function onServerWake(f: Listener) {
  listeners.add(f); f(waking);
  return () => { listeners.delete(f); };
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isBackend(input: RequestInfo | URL) {
  if (!BACKEND) return false;
  try { return new URL(urlOf(input), window.location.href).origin === BACKEND; } catch { return false; }
}

const sleep = (ms: number, signal?: AbortSignal | null) => new Promise<void>((res, rej) => {
  const id = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(id); rej(new DOMException("Aborted", "AbortError")); }, { once: true });
});

let installed = false;
export function installServerWake() {
  if (installed || typeof window === "undefined" || !window.fetch) return;
  installed = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isBackend(input)) return original(input, init);

    // A Request object with a body can only be sent once, so only retry what we can resend
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const canRetry = !(input instanceof Request) || method === "GET" || method === "HEAD";
    const signal = init?.signal || (input instanceof Request ? input.signal : null);

    let marked = false;
    const mark = () => { if (!marked) { marked = true; slowCalls++; emit(); } };
    const unmark = () => { if (marked) { marked = false; slowCalls--; emit(); } };
    const slowTimer = setTimeout(mark, SLOW_MS);

    const started = Date.now();
    let delay = 2000;
    try {
      for (;;) {
        try {
          const res = await original(input, init);
          // A real answer from our server (JSON, e.g. "no clip found") is returned straight away; only Render's
          // own "starting up" pages (HTML or empty) mean the server is asleep and worth retrying
          const ours = (res.headers.get("content-type") || "").includes("application/json");
          if ((res.status === 502 || res.status === 503 || res.status === 504) && !ours && canRetry && Date.now() - started < WAIT_MS) {
            mark(); await sleep(delay, signal); delay = Math.min(delay * 1.5, 8000); continue;
          }
          return res;
        } catch (err) {
          if ((err as Error)?.name === "AbortError" || !canRetry || Date.now() - started >= WAIT_MS) throw err;
          mark(); await sleep(delay, signal); delay = Math.min(delay * 1.5, 8000);
        }
      }
    } finally {
      clearTimeout(slowTimer);
      unmark();
    }
  };
}

/** Nudge the backend awake as soon as someone signs in, so it is ready when they need it. */
export function warmUpServer() {
  if (!BACKEND) return;
  fetch(BACKEND + "/", { cache: "no-store" }).catch(() => { /* fine, it is only a nudge */ });
}

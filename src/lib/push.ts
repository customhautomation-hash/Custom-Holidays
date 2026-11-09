/** Desktop notifications (Web Push): turn on/off for this browser, send a test. */
import { supabase } from "./supabase";

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export type PushState = "unsupported" | "blocked" | "off" | "on";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
};
const register = () => navigator.serviceWorker.register("/sw.js");

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

async function save(sub: PushSubscription) {
  const j = sub.toJSON() as any;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("push_subscriptions").upsert(
    { user_id: data.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: "endpoint" });
}

export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "blocked" : "off";
  const reg = await register(); await navigator.serviceWorker.ready;
  const { data, error } = await supabase.functions.invoke("push-notify", { method: "GET" });
  if (error || !data?.publicKey) throw new Error("Desktop notifications aren't set up on the server yet");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.publicKey) });
  await save(sub);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
  return "off";
}

export async function testPush() {
  const { error } = await supabase.functions.invoke("push-notify", { body: { type: "test" } });
  if (error) throw error;
}

/** Called once after sign-in: keeps this browser's subscription saved if notifications are on. */
export async function refreshPush() {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const reg = await register();
    const sub = await reg.pushManager.getSubscription();
    if (sub) await save(sub);
  } catch { /* offline or not set up yet */ }
}

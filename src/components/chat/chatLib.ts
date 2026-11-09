/** Team Chat data helpers: types, Supabase calls, little formatters. */
import { supabase } from "@/lib/supabase";

export type Profile = { id: string; full_name: string | null; role?: string | null };
export type Room = { id: string; name: string; kind: "group" | "dm"; members: string[] | null; description?: string | null; created_by?: string | null; created_at?: string };
export type Attachment = { path?: string; url?: string; name: string; size: number; mime: string; duration?: number; width?: number; height?: number; thumbPath?: string; items?: Attachment[] };
export const isMedia = (a?: { mime?: string } | null) => !!a?.mime && (a.mime.startsWith("image/") || a.mime.startsWith("video/"));
export const mediaItems = (a?: Attachment | null): Attachment[] => !a ? [] : a.items?.length ? a.items : isMedia(a) ? [a] : [];
export type Msg = {
  id: string; sender: string | null; sender_id: string | null; text: string | null; channel: string; kind: string;
  attachment: Attachment | null; reply_to: string | null; edited_at: string | null; deleted_at: string | null;
  deleted_for: string[]; reactions: Record<string, string[]>; starred_by: string[]; pinned_at: string | null;
  forwarded: boolean; mentions: string[]; created_at: string; pending?: boolean; failed?: boolean;
};
export type Read = { room_id: string; user_id: string; last_read_at: string };

export const BUCKET = "team-chat";
export const EDIT_MINUTES = 15;
export const DELETE_HOURS = 48;
export const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
export const EMOJIS = ["😀","😂","🤣","😊","😍","😘","😎","🤔","😅","😇","🙂","😉","😢","😭","😡","😴","🤗","🤩","🥳","😬",
  "👍","👎","👏","🙏","💪","👌","✌️","🤝","👋","🙌","❤️","🔥","✨","🎉","✅","❌","⭐","📌","📎","📷",
  "✈️","🏝️","🏨","🚗","🗺️","🌍","🍽️","🥂","💰","📅"];

export const dmId = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`;
export const norm = (m: any): Msg => ({
  ...m, id: String(m.id), kind: m.kind || (m.attachment ? "file" : "text"),
  attachment: typeof m.attachment === "string" ? safeJson(m.attachment) : m.attachment ?? null,
  deleted_for: m.deleted_for || [], reactions: m.reactions || {}, starred_by: m.starred_by || [], mentions: m.mentions || [], forwarded: !!m.forwarded,
});
const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

export const initials = (s?: string | null) => (s || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("") || "?";
export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const dayLabel = (iso: string) => {
  const d = new Date(iso); const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  const diff = (t.getTime() - d.getTime()) / 86400000;
  return diff < 7 ? d.toLocaleDateString("en-GB", { weekday: "long" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};
export const listTime = (iso?: string) => {
  if (!iso) return ""; const l = dayLabel(iso);
  return l === "Today" ? timeOf(iso) : l === "Yesterday" ? "Yesterday" : new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
};
export const fileSize = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
export const preview = (m?: Msg, myId?: string) => {
  if (!m) return "";
  if (m.deleted_at) return "This message was deleted";
  if (m.kind === "voice") return "🎤 Voice message";
  if (m.attachment) {
    const items = mediaItems(m.attachment);
    if (items.length) { const vids = items.filter(i => i.mime.startsWith("video/")).length; const imgs = items.length - vids;
      const label = items.length > 1 ? [imgs && `${imgs} photo${imgs > 1 ? "s" : ""}`, vids && `${vids} video${vids > 1 ? "s" : ""}`].filter(Boolean).join(", ") : vids ? "Video" : "Photo";
      return `${vids && !imgs ? "🎥" : "📷"} ${m.text || label}`; }
    return `📎 ${m.text || m.attachment.name}`;
  }
  return m.text || "";
};

// signed links for private files, cached for 50 minutes
const urlCache = new Map<string, { url: string; exp: number }>();
export async function fileUrl(a: Attachment): Promise<string> {
  if (a.url && !a.path) return a.url;
  const hit = urlCache.get(a.path!); if (hit && hit.exp > Date.now()) return hit.url;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.path!, 3600);
  const url = data?.signedUrl || "";
  if (url) urlCache.set(a.path!, { url, exp: Date.now() + 50 * 60000 });
  return url;
}
export async function uploadFile(room: string, file: File | Blob, name: string, mime: string): Promise<Attachment> {
  const path = `${room.replace(/[^\w-]/g, "_")}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${name.replace(/[^\w.\-]/g, "_")}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: mime, upsert: false });
  if (error) throw error;
  return { path, name, size: (file as any).size || 0, mime };
}

export const fmtDuration = (sec?: number) => { if (!sec && sec !== 0) return ""; const s = Math.round(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Gets a photo or video ready to send: smaller photos, a still frame for videos, sizes for the layout. */
export async function prepareMedia(file: File): Promise<{ blob: Blob; name: string; mime: string; width?: number; height?: number; duration?: number; thumb?: Blob }> {
  if (file.type.startsWith("image/") && !/gif|svg/.test(file.type)) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const max = 1920; let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) <= max && file.size < 1.5e6) return { blob: file, name: file.name, mime: file.type, width: w, height: h };
      const k = Math.min(1, max / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
      const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob>(res => c.toBlob(b => res(b || file), "image/jpeg", 0.85));
      return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", mime: "image/jpeg", width: w, height: h };
    } catch { return { blob: file, name: file.name, mime: file.type }; } finally { URL.revokeObjectURL(url); }
  }
  if (file.type.startsWith("video/")) {
    const url = URL.createObjectURL(file);
    try {
      const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "metadata"; v.src = url;
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; setTimeout(res, 6000); });
      const duration = isFinite(v.duration) ? v.duration : undefined; const width = v.videoWidth || undefined, height = v.videoHeight || undefined;
      let thumb: Blob | undefined;
      try {
        v.currentTime = Math.min(0.5, (duration || 1) / 2);
        await new Promise((res, rej) => { v.onseeked = res; v.onerror = rej; setTimeout(res, 4000); });
        const k = Math.min(1, 640 / Math.max(width || 640, height || 640));
        const c = document.createElement("canvas"); c.width = Math.round((width || 640) * k); c.height = Math.round((height || 360) * k);
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        thumb = await new Promise<Blob | undefined>(res => c.toBlob(b => res(b || undefined), "image/jpeg", 0.8));
      } catch { /* no still frame */ }
      return { blob: file, name: file.name, mime: file.type, width, height, duration, thumb };
    } catch { return { blob: file, name: file.name, mime: file.type }; } finally { URL.revokeObjectURL(url); }
  }
  return { blob: file, name: file.name, mime: file.type || "application/octet-stream" };
}

/** Uploads one prepared photo/video (and its still frame) and returns the attachment. */
export async function uploadMedia(room: string, file: File): Promise<Attachment> {
  const p = await prepareMedia(file);
  const a = await uploadFile(room, p.blob, p.name, p.mime);
  a.width = p.width; a.height = p.height; a.duration = p.duration;
  if (p.thumb) { try { a.thumbPath = (await uploadFile(room, p.thumb, p.name.replace(/\.[^.]+$/, "") + "-thumb.jpg", "image/jpeg")).path; } catch { /* plays without a still */ } }
  return a;
}
export const thumbOf = (a: Attachment): Attachment | null => a.mime.startsWith("video/") ? (a.thumbPath ? { path: a.thumbPath, name: "thumb.jpg", size: 0, mime: "image/jpeg" } : null) : a;

/** Team Chat data helpers: types, Supabase calls, little formatters. */
import { supabase } from "@/lib/supabase";

export type Profile = { id: string; full_name: string | null; role?: string | null };
export type Room = { id: string; name: string; kind: "group" | "dm"; members: string[] | null; description?: string | null; created_by?: string | null; created_at?: string };
export type Attachment = { path?: string; url?: string; name: string; size: number; mime: string; duration?: number };
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
  if (m.attachment) return `${m.attachment.mime?.startsWith("image/") ? "📷" : "📎"} ${m.text || m.attachment.name}`;
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

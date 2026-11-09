/**
 * Team Chat — works like WhatsApp for the office.
 * Groups and one-to-one chats, live updates, read ticks, typing, online status, unread counts,
 * reply, react, edit, delete for me / everyone, forward, star, pin, copy, message info,
 * photos / files / voice notes, emoji, @mentions, search, group info.
 * Data lives in Supabase: chat_rooms, chat_messages, chat_reads and the team-chat storage bucket
 * (run supabase/team_chat.sql once).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Search, Plus, Users, Paperclip, Smile, Send, Mic, Square, X, Star, Pin, Info, Pencil, Reply, Loader2, ArrowLeft, Trash2, UserPlus, LogOut } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useT, Btn, Field } from "@/components/ch/kit";
import { MessageBubble, useFileUrl } from "@/components/chat/MessageBubble";
import { MediaComposer, MediaViewer, ViewItem } from "@/components/chat/Media";
import {
  Msg, Room, Read, Profile, Attachment, norm, dmId, initials, timeOf, dayLabel, listTime, preview, uploadFile, uploadMedia, mediaItems, thumbOf, EMOJIS,
} from "@/components/chat/chatLib";

const COLORS = ["#13585B", "#B8913E", "#7A4E9C", "#C0563E", "#2E7D5B", "#3B6FA8", "#A23B6A", "#5D6B2E"];
const colorOf = (id: string) => { let h = 0; for (const c of id || "x") h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };

export default function TeamChat() {
  const t = useT();
  const { user, profile } = useAuth();
  const me = user?.id || "";
  const myName = profile?.full_name || user?.email?.split("@")[0] || "Me";

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [recent, setRecent] = useState<Msg[]>([]);          // latest messages across chats (previews + unread)
  const [msgs, setMsgs] = useState<Msg[]>([]);              // the open chat
  const [reads, setReads] = useState<Read[]>([]);
  const [active, setActive] = useState<string>(() => { try { return localStorage.getItem("chat:active") || "General"; } catch { return "General"; } });
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }[]>>({});

  const [listQ, setListQ] = useState("");
  const [inQ, setInQ] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "info" | "starred" | { msgInfo: Msg }>(null);
  const [dialog, setDialog] = useState<null | "newChat" | "newGroup" | { forward: Msg }>(null);
  const [viewer, setViewer] = useState<{ list: ViewItem[]; i: number } | null>(null);
  const [draft, setDraft] = useState<File[] | null>(null);

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [uploads, setUploads] = useState<{ id: string; name: string; error?: string }[]>([]);
  const [rec, setRec] = useState<{ rec: MediaRecorder; started: number } | null>(null);
  const [recTick, setRecTick] = useState(0);
  const [mention, setMention] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chanRef = useRef<any>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const lastTypingSent = useRef(0);

  const nameOf = useCallback((id?: string | null, fallback?: string | null) =>
    id === me ? "You" : profiles.find(p => p.id === id)?.full_name || fallback || "Someone", [profiles, me]);
  const membersOf = (r?: Room) => r?.members?.length ? r.members : profiles.map(p => p.id);
  const roomName = (r: Room) => r.kind === "dm" ? (profiles.find(p => p.id === r.members?.find(x => x !== me))?.full_name || "Chat") : r.name;
  const isMine = (m: Msg) => (m.sender_id ? m.sender_id === me : m.sender === myName);
  const myRead = (room: string) => reads.find(r => r.room_id === room && r.user_id === me)?.last_read_at;

  // ── load everything once ─────────────────────────────────────────────
  useEffect(() => {
    if (!me) return;
    (async () => {
      const [p, r, m, rd] = await Promise.all([
        supabase.from("profiles").select("id, full_name, role"),
        supabase.from("chat_rooms").select("*").order("created_at"),
        supabase.from("chat_messages").select("*").order("created_at", { ascending: false }).limit(600),
        supabase.from("chat_reads").select("*"),
      ]);
      if (r.error) { setSetupNeeded(true); setLoading(false); return; }
      setProfiles((p.data as Profile[]) || []);
      setRooms(((r.data as Room[]) || []).filter(x => !x.members?.length || x.members.includes(me)));
      setRecent(((m.data as any[]) || []).map(norm).reverse());
      setReads((rd.data as Read[]) || []);
      setLoading(false);
    })();
  }, [me]);

  // ── open chat messages ───────────────────────────────────────────────
  useEffect(() => {
    if (!me || setupNeeded) return;
    try { localStorage.setItem("chat:active", active); } catch { /* ignore */ }
    setMsgs([]); setReplyTo(null); setEditing(null); setInQ(null); setPanel(null);
    supabase.from("chat_messages").select("*").eq("channel", active).order("created_at", { ascending: false }).limit(400)
      .then(({ data }: any) => setMsgs(((data as any[]) || []).map(norm).filter((m: Msg) => m.channel === active).reverse()));
  }, [active, me, setupNeeded]);

  // ── live updates, online and typing ──────────────────────────────────
  useEffect(() => {
    if (!me || setupNeeded) return;
    const ch = supabase.channel("team-chat", { config: { presence: { key: me } } });
    const upsert = (list: Msg[], m: Msg) => { const i = list.findIndex(x => x.id === m.id); if (i < 0) return [...list.filter(x => !(x.pending && x.text === m.text && x.channel === m.channel && isMineRow(m))), m]; const c = [...list]; c[i] = m; return c; };
    const isMineRow = (m: Msg) => m.sender_id === me;
    ch.on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, (e: any) => {
      if (e.eventType === "DELETE") { const id = String(e.old?.id); setMsgs(l => l.filter(x => x.id !== id)); setRecent(l => l.filter(x => x.id !== id)); return; }
      const m = norm(e.new);
      setRecent(l => upsert(l, m));
      if (m.channel === activeRef.current) setMsgs(l => upsert(l, m));
    });
    ch.on("postgres_changes", { event: "*", schema: "public", table: "chat_rooms" }, (e: any) => {
      if (e.eventType === "DELETE") { setRooms(l => l.filter(r => r.id !== e.old?.id)); return; }
      const r = e.new as Room; const visible = !r.members?.length || r.members.includes(me);
      setRooms(l => { const rest = l.filter(x => x.id !== r.id); return visible ? [...rest, r] : rest; });
    });
    ch.on("postgres_changes", { event: "*", schema: "public", table: "chat_reads" }, (e: any) => {
      const r = e.new as Read; if (!r?.room_id) return;
      setReads(l => [...l.filter(x => !(x.room_id === r.room_id && x.user_id === r.user_id)), r]);
    });
    ch.on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(ch.presenceState()))));
    ch.on("broadcast", { event: "typing" }, ({ payload }: any) => {
      if (!payload || payload.id === me) return;
      setTyping(prev => ({ ...prev, [payload.room]: [...(prev[payload.room] || []).filter(x => x.name !== payload.name), { name: payload.name, at: Date.now() }] }));
    });
    ch.subscribe(async (status: string) => { if (status === "SUBSCRIBED") await ch.track({ id: me, name: myName }); });
    chanRef.current = ch;
    const sweep = setInterval(() => setTyping(prev => { const n: typeof prev = {}; for (const k in prev) n[k] = prev[k].filter(x => Date.now() - x.at < 4000); return n; }), 1500);
    return () => { clearInterval(sweep); supabase.removeChannel(ch); };
  }, [me, setupNeeded]);

  // ── mark as read ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!me || setupNeeded || !msgs.length || document.hidden) return;
    const last = msgs[msgs.length - 1]; const mine = myRead(active);
    if (mine && new Date(mine) >= new Date(last.created_at)) return;
    const row = { room_id: active, user_id: me, last_read_at: new Date().toISOString() };
    setReads(l => [...l.filter(x => !(x.room_id === active && x.user_id === me)), row]);
    supabase.from("chat_reads").upsert(row).then(() => {});
  }, [msgs, active, me]);

  // ── scroll to the newest message ────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    if (near || msgs[msgs.length - 1]?.sender_id === me) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);
  useEffect(() => { setTimeout(() => endRef.current?.scrollIntoView(), 50); }, [active]);

  // ── chat list ────────────────────────────────────────────────────────
  const visibleMsgs = (l: Msg[]) => l.filter(m => !m.deleted_for.includes(me));
  const list = useMemo(() => {
    const all = rooms.length ? rooms : [{ id: "General", name: "General", kind: "group", members: null } as Room];
    return all.map(r => {
      const rm = visibleMsgs(recent.filter(m => m.channel === r.id));
      const last = rm[rm.length - 1]; const seen = myRead(r.id);
      const unread = rm.filter(m => !isMine(m) && !m.deleted_at && (!seen || new Date(m.created_at) > new Date(seen))).length;
      return { r, name: roomName(r), last, unread, at: last?.created_at || r.created_at || "" };
    }).filter(x => !listQ || x.name.toLowerCase().includes(listQ.toLowerCase()))
      .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  }, [rooms, recent, reads, profiles, listQ]);
  const room = rooms.find(r => r.id === active) || list.find(x => x.r.id === active)?.r || null;
  const shown = visibleMsgs(msgs);
  const pinned = shown.filter(m => m.pinned_at && !m.deleted_at).sort((a, b) => (b.pinned_at || "").localeCompare(a.pinned_at || ""));
  const others = membersOf(room || undefined).filter(id => id !== me);
  const tickOf = (m: Msg): "pending" | "failed" | "sent" | "some" | "all" => {
    if (m.failed) return "failed"; if (m.pending) return "pending";
    const readers = others.filter(id => { const r = reads.find(x => x.room_id === m.channel && x.user_id === id); return r && new Date(r.last_read_at) >= new Date(m.created_at); });
    return !readers.length ? "sent" : readers.length >= others.length ? "all" : "some";
  };
  const typers = (typing[active] || []).map(x => x.name);
  const headerSub = typers.length ? `${typers.join(", ")} ${typers.length > 1 ? "are" : "is"} typing…`
    : room?.kind === "dm" ? (others[0] && online.has(others[0]) ? "online" : "")
    : `${membersOf(room || undefined).map(id => id === me ? "You" : (profiles.find(p => p.id === id)?.full_name || "").split(" ")[0]).filter(Boolean).slice(0, 6).join(", ")}${online.size > 1 ? ` · ${[...online].filter(id => id !== me && membersOf(room || undefined).includes(id)).length} online` : ""}`;

  // ── actions ──────────────────────────────────────────────────────────
  const sendRow = async (row: Partial<Msg>) => {
    const temp: Msg = norm({ id: `tmp-${Date.now()}-${Math.random()}`, sender: myName, sender_id: me, channel: active, created_at: new Date().toISOString(), pending: true, ...row });
    setMsgs(l => [...l, temp]);
    const { data, error } = await supabase.from("chat_messages").insert({ sender: myName, sender_id: me, channel: active, text: row.text || "", kind: row.kind || "text",
      attachment: row.attachment || null, reply_to: row.reply_to || null, mentions: row.mentions || [], forwarded: !!row.forwarded }).select().single();
    if (error) { setMsgs(l => l.map(x => x.id === temp.id ? { ...x, pending: false, failed: true } : x)); return; }
    if (!data || Array.isArray(data) || !(data as any).created_at) { setMsgs(l => l.map(x => x.id === temp.id ? { ...x, pending: false } : x)); return; }
    const saved = norm(data);
    setMsgs(l => { const without = l.filter(x => x.id !== temp.id); return without.some(x => x.id === saved.id) ? without : [...without, saved]; });
    setRecent(l => l.some(x => x.id === saved.id) ? l : [...l, saved]);
  };
  const mentionsIn = (s: string) => profiles.filter(p => p.full_name && s.toLowerCase().includes(`@${p.full_name.split(" ")[0].toLowerCase()}`)).map(p => p.id);
  const submit = async () => {
    const s = text.trim(); if (!s) return;
    if (editing) {
      const id = editing.id; setEditing(null); setText("");
      setMsgs(l => l.map(x => x.id === id ? { ...x, text: s, edited_at: new Date().toISOString() } : x));
      await supabase.from("chat_messages").update({ text: s, edited_at: new Date().toISOString(), mentions: mentionsIn(s) }).eq("id", id);
      return;
    }
    const reply = replyTo?.id || null; setText(""); setReplyTo(null); setEmoji(false);
    await sendRow({ text: s, reply_to: reply, mentions: mentionsIn(s) });
  };
  const patch = async (m: Msg, p: Partial<Msg>) => {
    setMsgs(l => l.map(x => x.id === m.id ? { ...x, ...p } : x)); setRecent(l => l.map(x => x.id === m.id ? { ...x, ...p } : x));
    await supabase.from("chat_messages").update(p).eq("id", m.id);
  };
  const react = (m: Msg, e: string) => {
    const r: Record<string, string[]> = {}; const had = m.reactions?.[e]?.includes(me);
    for (const [k, v] of Object.entries(m.reactions || {})) { const w = (v || []).filter(x => x !== me); if (w.length) r[k] = w; }
    if (!had) r[e] = [...(r[e] || []), me];
    patch(m, { reactions: r });
  };
  // photos and videos open the preview first (caption, add more, remove); other files go straight away
  const sendFiles = async (files: FileList | File[] | null, caption = "") => {
    if (!files) return;
    const all = Array.from(files);
    const media = all.filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"));
    const docs = all.filter(f => !media.includes(f));
    if (media.length) setDraft(d => [...(d || []), ...media]);
    for (const f of docs) {
      const id = Math.random().toString(36).slice(2); setUploads(u => [...u, { id, name: f.name }]);
      try { const a = await uploadFile(active, f, f.name, f.type || "application/octet-stream"); await sendRow({ kind: "file", attachment: a, text: caption }); setUploads(u => u.filter(x => x.id !== id)); }
      catch (e: any) { setUploads(u => u.map(x => x.id === id ? { ...x, error: e?.message || "Upload failed" } : x)); }
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const sendAlbum = async (files: File[], caption: string) => {
    setDraft(null);
    const id = Math.random().toString(36).slice(2);
    const label = files.length > 1 ? `${files.length} photos and videos` : files[0].name;
    setUploads(u => [...u, { id, name: label }]);
    try {
      const items: Attachment[] = [];
      for (const [n, f] of files.entries()) { setUploads(u => u.map(x => x.id === id ? { ...x, name: files.length > 1 ? `${n + 1} of ${files.length}` : label } : x)); items.push(await uploadMedia(active, f)); }
      const attachment: Attachment = items.length === 1 ? items[0] : { name: label, size: items.reduce((s, a) => s + a.size, 0), mime: "album", items };
      await sendRow({ kind: "media", attachment, text: caption.trim(), mentions: mentionsIn(caption) });
      setUploads(u => u.filter(x => x.id !== id));
    } catch (e: any) { setUploads(u => u.map(x => x.id === id ? { ...x, error: /exceeded|too large|413/i.test(e?.message || "") ? "This file is too big (limit 50 MB)" : e?.message || "Upload failed" } : x)); }
  };
  const openViewer = (m: Msg, index: number) => {
    const list: ViewItem[] = []; let at = 0;
    shown.filter(x => !x.deleted_at).forEach(x => mediaItems(x.attachment).forEach((a, k) => { if (x.id === m.id && k === index) at = list.length; list.push({ a, m: x, who: nameOf(x.sender_id, x.sender) }); }));
    setViewer({ list, i: at });
  };
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); const chunks: Blob[] = [];
      r.ondataavailable = e => chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach(x => x.stop());
        if ((r as any).cancelled) return;
        const blob = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        const id = "voice"; setUploads(u => [...u, { id, name: "Voice message" }]);
        try { const a = await uploadFile(active, blob, `voice-${Date.now()}.webm`, blob.type); await sendRow({ kind: "voice", attachment: a }); } catch { /* shown below */ }
        setUploads(u => u.filter(x => x.id !== id));
      };
      r.start(); setRec({ rec: r, started: Date.now() });
    } catch { alert("Allow the microphone in your browser to record voice messages."); }
  };
  useEffect(() => { if (!rec) return; const i = setInterval(() => setRecTick(x => x + 1), 500); return () => clearInterval(i); }, [rec]);
  const stopRec = (cancel = false) => { if (!rec) return; (rec.rec as any).cancelled = cancel; rec.rec.stop(); setRec(null); };

  const onType = (v: string) => {
    setText(v);
    const m = v.match(/@(\w*)$/); setMention(m ? m[1] : null);
    if (Date.now() - lastTypingSent.current > 2000 && v) { lastTypingSent.current = Date.now(); chanRef.current?.send({ type: "broadcast", event: "typing", payload: { room: active, id: me, name: myName.split(" ")[0] } }); }
  };
  const openDm = async (p: Profile) => {
    const id = dmId(me, p.id);
    if (!rooms.some(r => r.id === id)) {
      const r: Room = { id, name: "", kind: "dm", members: [me, p.id] };
      setRooms(l => [...l, r]); await supabase.from("chat_rooms").upsert(r);
    }
    setActive(id); setDialog(null);
  };
  const createGroup = async (name: string, members: string[], description: string) => {
    const r: Room = { id: crypto.randomUUID(), name, kind: "group", members: [...new Set([me, ...members])], description };
    setRooms(l => [...l, r]); await supabase.from("chat_rooms").insert(r);
    await supabase.from("chat_messages").insert({ sender: myName, sender_id: me, channel: r.id, kind: "system", text: `${myName} created the group "${name}"` });
    setActive(r.id); setDialog(null);
  };
  const updateRoom = async (p: Partial<Room>) => { if (!room) return; setRooms(l => l.map(r => r.id === room.id ? { ...r, ...p } : r)); await supabase.from("chat_rooms").update(p).eq("id", room.id); };
  const forwardTo = async (m: Msg, targets: string[]) => {
    for (const id of targets) await supabase.from("chat_messages").insert({ sender: myName, sender_id: me, channel: id, text: m.text || "", kind: m.kind, attachment: m.attachment, forwarded: true });
    setDialog(null);
  };
  const jump = (id: string) => { const el = document.getElementById(`msg-${id}`); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.animate([{ background: "rgba(212,175,90,.35)" }, { background: "transparent" }], { duration: 1400 }); } };

  // ── render ───────────────────────────────────────────────────────────
  const wall = t.dark ? "#0A262B" : "#EFE4E2";
  const H = "calc(100vh - 56px - 48px)";
  if (setupNeeded) return (
    <DashboardLayout><div style={{ maxWidth: 640, margin: "60px auto", color: t.INK, lineHeight: 1.6 }}>
      <h1 className="font-serif" style={{ fontSize: 28 }}>Team Chat needs a one-time setup</h1>
      <p style={{ color: t.MUTED }}>Open Supabase → SQL Editor, paste the file <b>supabase/team_chat.sql</b> from the dashboard folder and click Run. Old messages are kept. Then refresh this page.</p>
    </div></DashboardLayout>);

  const items: (Msg | { day: string })[] = [];
  let lastDay = "";
  for (const m of shown.filter(m => !inQ || (m.text || "").toLowerCase().includes(inQ.toLowerCase()))) { const d = dayLabel(m.created_at); if (d !== lastDay) { items.push({ day: d }); lastDay = d; } items.push(m); }
  const firstUnreadAt = myRead(active);
  const mentionList = mention !== null ? profiles.filter(p => p.id !== me && (p.full_name || "").toLowerCase().startsWith(mention.toLowerCase())).slice(0, 5) : [];

  return (
    <DashboardLayout>
      <div className="flex" style={{ height: H, borderRadius: 18, overflow: "hidden", boxShadow: t.OUT, color: t.INK, background: t.BG }}>
        {/* chat list */}
        <div style={{ width: 340, flexShrink: 0, borderRight: `1px solid ${t.LINE}`, display: "flex", flexDirection: "column" }}>
          <div className="flex items-center justify-between" style={{ padding: "16px 16px 10px" }}>
            <b className="font-serif" style={{ fontSize: 22, fontWeight: 500 }}>Chats</b>
            <div className="flex gap-1">
              <IconBtn t={t} title="New group" onClick={() => setDialog("newGroup")}><Users size={17} /></IconBtn>
              <IconBtn t={t} title="New chat" onClick={() => setDialog("newChat")}><Plus size={18} /></IconBtn>
            </div>
          </div>
          <div style={{ padding: "0 14px 10px" }}><Field value={listQ} onChange={setListQ} placeholder="Search chats" style={{ width: "100%", height: 36 }} /></div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? <div style={{ padding: 20, color: t.MUTED, fontSize: 13 }}>Loading chats…</div> : list.map(({ r, name, last, unread }) => {
              const on = r.id === active; const tp = (typing[r.id] || []).map(x => x.name);
              const other = r.kind === "dm" ? r.members?.find(x => x !== me) : null;
              return (
                <button key={r.id} onClick={() => setActive(r.id)} className="flex items-center gap-3 w-full text-left"
                  style={{ padding: "10px 14px", border: "none", cursor: "pointer", background: on ? (t.dark ? "#123A40" : "#E9DCDD") : "transparent", color: t.INK }}>
                  <Avatar t={t} id={other || r.id} label={name} group={r.kind === "group"} online={!!other && online.has(other)} />
                  <div style={{ flex: 1, minWidth: 0, borderBottom: `1px solid ${t.LINE}`, paddingBottom: 10, marginBottom: -10 }}>
                    <div className="flex justify-between gap-2"><b style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</b>
                      <span style={{ fontSize: 11, color: unread ? t.TEAL : t.FAINT, flexShrink: 0, fontWeight: unread ? 600 : 400 }}>{listTime(last?.created_at)}</span></div>
                    <div className="flex justify-between gap-2" style={{ marginTop: 2 }}>
                      <span style={{ fontSize: 12.5, color: tp.length ? t.TEAL : t.MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {tp.length ? `${tp[0]} is typing…` : last ? `${r.kind === "group" && last.kind !== "system" ? `${isMine(last) ? "You" : (nameOf(last.sender_id, last.sender) || "").split(" ")[0]}: ` : isMine(last) ? "You: " : ""}${preview(last)}` : "No messages yet"}</span>
                      {!!unread && <span style={{ minWidth: 20, height: 20, borderRadius: 99, background: t.TEAL, color: "#fff", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 6px", flexShrink: 0 }}>{unread}</span>}
                    </div>
                  </div>
                </button>);
            })}
          </div>
        </div>

        {/* open chat */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative" }}
          onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); sendFiles(e.dataTransfer.files); }}>
          <div className="flex items-center gap-3" style={{ padding: "10px 16px", borderBottom: `1px solid ${t.LINE}` }}>
            {room && <Avatar t={t} id={room.kind === "dm" ? others[0] : room.id} label={roomName(room)} group={room.kind === "group"} online={room.kind === "dm" && online.has(others[0])} />}
            <button onClick={() => setPanel(p => p === "info" ? null : "info")} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", color: t.INK }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{room ? roomName(room) : "General"}</div>
              <div style={{ fontSize: 12, color: typers.length ? t.TEAL : t.MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{headerSub}</div>
            </button>
            {inQ !== null ? <div className="flex items-center gap-2"><Field value={inQ} onChange={setInQ} placeholder="Search in this chat" style={{ width: 220, height: 34 }} /><IconBtn t={t} title="Close search" onClick={() => setInQ(null)}><X size={16} /></IconBtn></div>
              : <IconBtn t={t} title="Search in chat" onClick={() => setInQ("")}><Search size={17} /></IconBtn>}
            <IconBtn t={t} title="Starred messages" onClick={() => setPanel(p => p === "starred" ? null : "starred")}><Star size={17} /></IconBtn>
            <IconBtn t={t} title="Chat info" onClick={() => setPanel(p => p === "info" ? null : "info")}><Info size={17} /></IconBtn>
          </div>
          {!!pinned.length && <button onClick={() => jump(pinned[0].id)} className="flex items-center gap-2 text-left" style={{ padding: "8px 16px", border: "none", borderBottom: `1px solid ${t.LINE}`, background: t.dark ? "#10343A" : "#F7F0EF", cursor: "pointer", color: t.INK, fontSize: 12.5 }}>
            <Pin size={14} color={t.TEAL} /><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b style={{ fontWeight: 600 }}>{nameOf(pinned[0].sender_id, pinned[0].sender)}:</b> {preview(pinned[0])}</span>
            {pinned.length > 1 && <span style={{ color: t.MUTED }}>+{pinned.length - 1} pinned</span>}</button>}

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", background: wall, padding: "14px 6%", display: "flex", flexDirection: "column", gap: 2 }}>
            {!shown.length && !loading && <div style={{ margin: "auto", textAlign: "center", color: t.MUTED, fontSize: 13 }}>No messages yet. Say hello 👋</div>}
            {items.map((it, i) => {
              if ("day" in it) return <div key={`d${i}`} style={{ alignSelf: "center", margin: "10px 0 6px", padding: "4px 12px", borderRadius: 8, fontSize: 11.5, background: t.dark ? "#123A40" : "#FFFFFF", color: t.MUTED, boxShadow: "0 1px 1px rgba(0,0,0,.08)" }}>{it.day}</div>;
              const m = it as Msg;
              if (m.kind === "system") return <div key={m.id} style={{ alignSelf: "center", margin: "4px 0", padding: "4px 12px", borderRadius: 8, fontSize: 11.5, background: t.dark ? "#123A40" : "#F6EEDB", color: t.dark ? "#D4AF5A" : "#8A6A24" }}>{m.text}</div>;
              const prev = items[i - 1] as Msg | undefined; const mine = isMine(m);
              const firstOfRun = !prev || "day" in (prev as any) || prev.kind === "system" || (prev.sender_id || prev.sender) !== (m.sender_id || m.sender);
              const quoted = m.reply_to ? msgs.find(x => x.id === m.reply_to) || recent.find(x => x.id === m.reply_to) : null;
              const showUnreadBar = firstUnreadAt && !mine && new Date(m.created_at) > new Date(firstUnreadAt) && prev && !("day" in (prev as any)) && new Date((prev as Msg).created_at) <= new Date(firstUnreadAt);
              return (
                <div key={m.id} style={{ marginTop: firstOfRun ? 6 : 0 }}>
                  {showUnreadBar && <div style={{ textAlign: "center", fontSize: 11.5, color: t.TEAL, margin: "8px 0", fontWeight: 600 }}>Unread messages</div>}
                  <MessageBubble m={m} mine={mine} t={t} myId={me} showName={room?.kind === "group" && firstOfRun} senderName={nameOf(m.sender_id, m.sender)} color={colorOf(m.sender_id || m.sender || "")}
                    quoted={quoted} quotedName={quoted ? nameOf(quoted.sender_id, quoted.sender) : ""} ticks={tickOf(m)} highlight={inQ || undefined}
                    names={profiles.map(p => p.full_name || "").filter(Boolean)}
                    a={{
                      reply: () => { setReplyTo(m); setEditing(null); inputRef.current?.focus(); },
                      react: e => react(m, e), copy: () => navigator.clipboard?.writeText(m.text || ""),
                      forward: () => setDialog({ forward: m }),
                      star: () => patch(m, { starred_by: m.starred_by.includes(me) ? m.starred_by.filter(x => x !== me) : [...m.starred_by, me] }),
                      pin: () => patch(m, { pinned_at: m.pinned_at ? null : new Date().toISOString() }),
                      edit: () => { setEditing(m); setReplyTo(null); setText(m.text || ""); inputRef.current?.focus(); },
                      delMe: () => patch(m, { deleted_for: [...m.deleted_for, me] }),
                      delAll: () => { if (confirm("Delete this message for everyone?")) patch(m, { deleted_at: new Date().toISOString(), text: "", attachment: null, reactions: {}, pinned_at: null }); },
                      info: () => setPanel({ msgInfo: m }), jump, image: (i: number) => openViewer(m, i),
                    }} />
                </div>);
            })}
            {uploads.map(u => <div key={u.id} style={{ alignSelf: "flex-end", fontSize: 12, color: u.error ? t.RED : t.MUTED, padding: "4px 8px" }}>{u.error ? `${u.name}: ${u.error}` : <><Loader2 size={12} className="animate-spin inline" /> Sending {u.name}…</>}</div>)}
            <div ref={endRef} />
          </div>
          {drag && <div style={{ position: "absolute", inset: 0, background: "rgba(19,88,91,.18)", border: `2px dashed ${t.TEAL}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, color: t.TEAL, pointerEvents: "none" }}>Drop to send</div>}

          {/* composer */}
          <div style={{ borderTop: `1px solid ${t.LINE}`, padding: "8px 14px 12px", position: "relative" }}>
            {(replyTo || editing) && (
              <div className="flex items-center gap-3" style={{ padding: "6px 10px", marginBottom: 8, borderLeft: `3px solid ${t.TEAL}`, borderRadius: 8, background: t.dark ? "#10343A" : "#F7F0EF" }}>
                {editing ? <Pencil size={14} color={t.TEAL} /> : <Reply size={14} color={t.TEAL} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.TEAL }}>{editing ? "Edit message" : `Replying to ${nameOf(replyTo!.sender_id, replyTo!.sender)}`}</div>
                  <div style={{ fontSize: 12, color: t.MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview(editing || replyTo!)}</div>
                </div>
                <IconBtn t={t} title="Cancel" onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setText(""); } }}><X size={15} /></IconBtn>
              </div>)}
            {emoji && <div style={{ position: "absolute", bottom: "100%", left: 14, zIndex: 20, width: 330, padding: 10, borderRadius: 14, background: t.dark ? "#10343A" : "#FFFFFF", boxShadow: "0 8px 28px rgba(0,0,0,.18)", display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 2 }}>
              {EMOJIS.map(e => <button key={e} onClick={() => { setText(s => s + e); inputRef.current?.focus(); }} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", padding: 2 }}>{e}</button>)}</div>}
            {!!mentionList.length && <div style={{ position: "absolute", bottom: "100%", left: 60, zIndex: 20, minWidth: 220, borderRadius: 12, background: t.dark ? "#10343A" : "#FFFFFF", boxShadow: "0 8px 28px rgba(0,0,0,.18)", padding: "6px 0" }}>
              {mentionList.map(p => <button key={p.id} onClick={() => { setText(s => s.replace(/@(\w*)$/, `@${(p.full_name || "").split(" ")[0]} `)); setMention(null); inputRef.current?.focus(); }}
                className="flex items-center gap-2 w-full" style={{ padding: "6px 12px", background: "none", border: "none", cursor: "pointer", color: t.INK, fontSize: 13 }}><Avatar t={t} id={p.id} label={p.full_name || ""} size={26} />{p.full_name}</button>)}</div>}
            {rec ? (
              <div className="flex items-center gap-3" style={{ height: 44 }}>
                <IconBtn t={t} title="Cancel" onClick={() => stopRec(true)}><Trash2 size={17} color={t.RED} /></IconBtn>
                <span style={{ width: 10, height: 10, borderRadius: 99, background: "#E05B5B" }} className="animate-pulse" />
                <span style={{ flex: 1, fontVariantNumeric: "tabular-nums", fontSize: 14 }}>{recTick >= 0 && new Date(Date.now() - rec.started).toISOString().slice(14, 19)} · Recording</span>
                <button onClick={() => stopRec(false)} title="Send voice message" style={sendStyle(t)}><Send size={17} /></button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <IconBtn t={t} title="Emoji" onClick={() => setEmoji(v => !v)}><Smile size={20} /></IconBtn>
                <IconBtn t={t} title="Photos and videos" onClick={() => document.getElementById("ch-media-input")?.click()}><ImageIcon size={19} /></IconBtn>
                <IconBtn t={t} title="Documents and other files" onClick={() => fileRef.current?.click()}><Paperclip size={19} /></IconBtn>
                <input ref={fileRef} type="file" multiple hidden onChange={e => sendFiles(e.target.files)} />
                <input id="ch-media-input" type="file" multiple accept="image/*,video/*" hidden onChange={e => { sendFiles(e.target.files); e.target.value = ""; }} />
                <textarea ref={inputRef} value={text} rows={1} placeholder="Type a message"
                  onChange={e => { onType(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(140, e.target.scrollHeight) + "px"; }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (mentionList.length) { setText(s => s.replace(/@(\w*)$/, `@${(mentionList[0].full_name || "").split(" ")[0]} `)); setMention(null); } else submit(); }
                    if (e.key === "Escape") { setReplyTo(null); setEditing(null); setEmoji(false); }
                    if (e.key === "ArrowUp" && !text) { const last = [...shown].reverse().find(m => isMine(m) && m.text && !m.deleted_at && !m.attachment); if (last && Date.now() - new Date(last.created_at).getTime() < 15 * 60000) { e.preventDefault(); setEditing(last); setText(last.text || ""); } }
                  }}
                  onPaste={e => { const f = Array.from(e.clipboardData.files || []); if (f.length) { e.preventDefault(); sendFiles(f); } }}
                  style={{ flex: 1, resize: "none", minHeight: 42, maxHeight: 140, borderRadius: 14, boxShadow: t.IN, border: "none", outline: "none", background: t.BG, color: t.INK, padding: "11px 14px", fontSize: 13.5, fontFamily: "inherit", lineHeight: 1.4 }} />
                {text.trim() ? <button onClick={submit} title={editing ? "Save" : "Send"} style={sendStyle(t)}>{editing ? <Pencil size={16} /> : <Send size={17} />}</button>
                  : <button onClick={startRec} title="Record a voice message" style={sendStyle(t)}><Mic size={18} /></button>}
              </div>)}
          </div>
        </div>

        {/* side panel */}
        {panel && room && (
          <div style={{ width: 330, flexShrink: 0, borderLeft: `1px solid ${t.LINE}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
            <div className="flex items-center gap-2" style={{ padding: "14px 16px", borderBottom: `1px solid ${t.LINE}` }}>
              <IconBtn t={t} title="Close" onClick={() => setPanel(null)}>{typeof panel === "object" ? <ArrowLeft size={17} /> : <X size={17} />}</IconBtn>
              <b style={{ fontSize: 15 }}>{panel === "info" ? (room.kind === "dm" ? "Contact info" : "Group info") : panel === "starred" ? "Starred messages" : "Message info"}</b>
            </div>
            {panel === "info" && <InfoPanel t={t} room={room} name={roomName(room)} me={me} profiles={profiles} online={online} msgs={shown}
              onRename={n => updateRoom({ name: n })} onDescribe={d => updateRoom({ description: d })}
              onMembers={ids => updateRoom({ members: ids })} onLeave={async () => { await updateRoom({ members: (room.members || profiles.map(p => p.id)).filter(x => x !== me) }); setActive("General"); }}
              onImage={(m: Msg, i: number) => openViewer(m, i)} />}
            {panel === "starred" && <div style={{ padding: 12 }}>{shown.filter(m => m.starred_by.includes(me) && !m.deleted_at).map(m => (
              <button key={m.id} onClick={() => jump(m.id)} className="w-full text-left" style={{ display: "block", padding: "10px 8px", border: "none", borderBottom: `1px solid ${t.LINE}`, background: "none", cursor: "pointer", color: t.INK }}>
                <div style={{ fontSize: 12, color: t.MUTED }}>{nameOf(m.sender_id, m.sender)} · {dayLabel(m.created_at)} {timeOf(m.created_at)}</div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{preview(m)}</div></button>))}
              {!shown.some(m => m.starred_by.includes(me)) && <div style={{ color: t.MUTED, fontSize: 13, padding: 8 }}>Tap a message's menu, then Star, to keep it here.</div>}</div>}
            {typeof panel === "object" && <div style={{ padding: 16, fontSize: 13 }}>
              <div style={{ color: t.MUTED, marginBottom: 6 }}>Sent {dayLabel(panel.msgInfo.created_at)} at {timeOf(panel.msgInfo.created_at)}</div>
              <div style={{ padding: 10, borderRadius: 10, background: t.dark ? "#1F5A5C" : "#D7ECE7", marginBottom: 14 }}>{preview(panel.msgInfo)}</div>
              <b style={{ fontSize: 12.5 }}>Read by</b>
              {others.map(id => { const r = reads.find(x => x.room_id === active && x.user_id === id); const seen = r && new Date(r.last_read_at) >= new Date(panel.msgInfo.created_at);
                return <div key={id} className="flex items-center gap-2" style={{ padding: "8px 0", borderBottom: `1px solid ${t.LINE}` }}><Avatar t={t} id={id} label={nameOf(id)} size={28} />
                  <span style={{ flex: 1 }}>{nameOf(id)}</span><span style={{ fontSize: 12, color: seen ? t.TEAL : t.FAINT }}>{seen ? `${dayLabel(r!.last_read_at)} ${timeOf(r!.last_read_at)}` : "Not yet"}</span></div>; })}
            </div>}
          </div>)}
      </div>

      {dialog === "newChat" && <PickDialog t={t} title="New chat" people={profiles.filter(p => p.id !== me)} onClose={() => setDialog(null)} onPick={ids => { const p = profiles.find(x => x.id === ids[0]); if (p) openDm(p); }} single />}
      {dialog === "newGroup" && <PickDialog t={t} title="New group" people={profiles.filter(p => p.id !== me)} onClose={() => setDialog(null)} group onCreate={createGroup} />}
      {dialog && typeof dialog === "object" && <ForwardDialog t={t} rooms={list.map(x => ({ id: x.r.id, name: x.name }))} onClose={() => setDialog(null)} onSend={ids => forwardTo(dialog.forward, ids)} />}
      {draft && <MediaComposer t={t} files={draft} chatName={room ? roomName(room) : "General"} onAdd={f => setDraft(d => [...(d || []), ...f])}
        onRemove={i => setDraft(d => { const n = (d || []).filter((_, k) => k !== i); return n.length ? n : null; })} onClose={() => setDraft(null)} onSend={sendAlbum} />}
      {viewer && <MediaViewer t={t} list={viewer.list} index={viewer.i} onIndex={i => setViewer(v => v && { ...v, i })} onClose={() => setViewer(null)}
        onReply={m => { setViewer(null); setReplyTo(m); inputRef.current?.focus(); }} onForward={m => { setViewer(null); setDialog({ forward: m }); }} />}
    </DashboardLayout>
  );
}

const sendStyle = (t: any) => ({ width: 44, height: 44, borderRadius: 99, border: "none", cursor: "pointer", background: t.dark ? "#1F6F72" : "#13585B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } as const);
function IconBtn({ t, title, onClick, children }: { t: any; title: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} style={{ width: 36, height: 36, borderRadius: 99, border: "none", background: "none", cursor: "pointer", color: t.MUTED, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    onMouseEnter={e => (e.currentTarget.style.background = t.dark ? "#16434A" : "#E9DCDD")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>{children}</button>;
}
function Avatar({ t, id, label, group, online, size = 44 }: { t: any; id?: string; label: string; group?: boolean; online?: boolean; size?: number }) {
  return <div style={{ position: "relative", flexShrink: 0 }}>
    <div style={{ width: size, height: size, borderRadius: 99, background: group ? (t.dark ? "#16434A" : "#E3EFEE") : colorOf(id || label), color: group ? t.TEAL : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.34, fontWeight: 600 }}>
      {group ? <Users size={size * 0.45} /> : initials(label)}</div>
    {online && <span style={{ position: "absolute", right: 0, bottom: 1, width: size * 0.27, height: size * 0.27, borderRadius: 99, background: "#2E9E6B", border: `2px solid ${t.BG}` }} />}
  </div>;
}

function InfoPanel({ t, room, name, me, profiles, online, msgs, onRename, onDescribe, onMembers, onLeave, onImage }: any) {
  const [nm, setNm] = useState(name); const [desc, setDesc] = useState(room.description || ""); const [adding, setAdding] = useState(false);
  useEffect(() => { setNm(name); setDesc(room.description || ""); }, [room.id]);
  const members: string[] = room.members?.length ? room.members : profiles.map((p: Profile) => p.id);
  const media: { m: Msg; a: Attachment; i: number }[] = [];
  msgs.filter((m: Msg) => m.attachment && !m.deleted_at).forEach((m: Msg) => (mediaItems(m.attachment).length ? mediaItems(m.attachment) : [m.attachment!]).forEach((a, i) => media.push({ m, a, i })));
  media.reverse(); media.splice(9);
  const nameOf = (id: string) => id === me ? "You" : profiles.find((p: Profile) => p.id === id)?.full_name || "Someone";
  return <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ textAlign: "center" }}><Avatar t={t} id={room.kind === "dm" ? members.find(x => x !== me) : room.id} label={name} group={room.kind === "group"} size={84} /></div>
    {room.kind === "group" ? <>
      <div><div style={{ fontSize: 12, color: t.MUTED, marginBottom: 4 }}>Group name</div><div className="flex gap-2"><Field value={nm} onChange={setNm} style={{ flex: 1, height: 34 }} />{nm !== name && <Btn onClick={() => onRename(nm)} style={{ height: 34 }}>Save</Btn>}</div></div>
      <div><div style={{ fontSize: 12, color: t.MUTED, marginBottom: 4 }}>Description</div><div className="flex gap-2"><Field value={desc} onChange={setDesc} placeholder="Add a description" style={{ flex: 1, height: 34 }} />{desc !== (room.description || "") && <Btn onClick={() => onDescribe(desc)} style={{ height: 34 }}>Save</Btn>}</div></div>
    </> : <div style={{ textAlign: "center" }}><b style={{ fontSize: 16 }}>{name}</b><div style={{ fontSize: 12, color: t.MUTED }}>{online.has(members.find((x: string) => x !== me)) ? "online" : ""}</div></div>}
    {!!media.length && <div><div style={{ fontSize: 12, color: t.MUTED, marginBottom: 6 }}>Media and files</div>
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>{media.map(x => <MediaThumb key={x.m.id + x.i} t={t} m={x.m} a={x.a} onOpen={() => onImage(x.m, x.i)} />)}</div></div>}
    {room.kind === "group" && <div>
      <div className="flex justify-between items-center" style={{ marginBottom: 6 }}><span style={{ fontSize: 12, color: t.MUTED }}>{room.members?.length ? `${members.length} members` : "Everyone on the team"}</span>
        {room.members?.length ? <button onClick={() => setAdding(a => !a)} className="flex items-center gap-1" style={{ background: "none", border: "none", color: t.TEAL, fontWeight: 600, fontSize: 12, cursor: "pointer" }}><UserPlus size={14} />Add</button> : null}</div>
      {adding && profiles.filter((p: Profile) => !members.includes(p.id)).map((p: Profile) => <button key={p.id} onClick={() => onMembers([...members, p.id])} className="flex items-center gap-2 w-full" style={{ padding: "6px 0", background: "none", border: "none", cursor: "pointer", color: t.INK, fontSize: 13 }}><Plus size={14} color={t.TEAL} />{p.full_name}</button>)}
      {members.map(id => <div key={id} className="flex items-center gap-2" style={{ padding: "7px 0", borderBottom: `1px solid ${t.LINE}` }}>
        <Avatar t={t} id={id} label={nameOf(id)} size={32} online={online.has(id)} /><span style={{ flex: 1, fontSize: 13 }}>{nameOf(id)}</span>
        {room.members?.length && id !== me && room.created_by === me ? <button title="Remove" onClick={() => onMembers(members.filter(x => x !== id))} style={{ background: "none", border: "none", color: t.FAINT, cursor: "pointer" }}><X size={14} /></button> : null}
      </div>)}
      {room.members?.length ? <button onClick={() => { if (confirm("Leave this group?")) onLeave(); }} className="flex items-center gap-2" style={{ marginTop: 14, background: "none", border: "none", color: t.RED, cursor: "pointer", fontSize: 13 }}><LogOut size={15} />Leave group</button> : null}
    </div>}
  </div>;
}
function MediaThumb({ t, m, a, onOpen }: { t: any; m: Msg; a: Attachment; onOpen: () => void }) {
  const isMediaItem = a.mime?.startsWith("image/") || a.mime?.startsWith("video/");
  const url = useFileUrl(isMediaItem ? thumbOf(a) : a);
  return isMediaItem
    ? <div onClick={onOpen} style={{ position: "relative", aspectRatio: "1", borderRadius: 6, overflow: "hidden", cursor: "pointer", background: t.LINE }}>
        {url && <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        {a.mime.startsWith("video/") && <span style={{ position: "absolute", left: 4, bottom: 2, color: "#fff", fontSize: 10, textShadow: "0 1px 2px #000" }}>▶</span>}</div>
    : <a href={url || undefined} target="_blank" rel="noreferrer" style={{ aspectRatio: "1", borderRadius: 6, background: t.dark ? "#16434A" : "#E3EFEE", color: t.TEAL, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 4, textAlign: "center", overflow: "hidden", textDecoration: "none" }}>{m.kind === "voice" ? "🎤" : a.name}</a>;
}

function PickDialog({ t, title, people, onClose, onPick, onCreate, single, group }: any) {
  const [q, setQ] = useState(""); const [sel, setSel] = useState<string[]>([]); const [name, setName] = useState(""); const [desc, setDesc] = useState("");
  const ppl = people.filter((p: Profile) => (p.full_name || "").toLowerCase().includes(q.toLowerCase()));
  return <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 75, background: "rgba(11,59,61,.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div style={{ width: 420, maxHeight: "80vh", display: "flex", flexDirection: "column", background: t.BG, borderRadius: 18, boxShadow: t.OUT, padding: 20, color: t.INK }}>
      <div className="flex justify-between items-center" style={{ marginBottom: 12 }}><b className="font-serif" style={{ fontSize: 22, fontWeight: 500 }}>{title}</b><IconBtn t={t} title="Close" onClick={onClose}><X size={17} /></IconBtn></div>
      {group && <><Field value={name} onChange={setName} placeholder="Group name" style={{ marginBottom: 8 }} /><Field value={desc} onChange={setDesc} placeholder="Description (optional)" style={{ marginBottom: 12 }} /></>}
      <Field value={q} onChange={setQ} placeholder="Search the team" style={{ marginBottom: 8 }} />
      <div style={{ overflowY: "auto", flex: 1 }}>
        {!ppl.length && <div style={{ fontSize: 13, color: t.MUTED, padding: 10 }}>Teammates appear here once they've signed in to the dashboard.</div>}
        {ppl.map((p: Profile) => <button key={p.id} onClick={() => single ? onPick([p.id]) : setSel(s => s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id])}
          className="flex items-center gap-3 w-full" style={{ padding: "8px 6px", background: sel.includes(p.id) ? (t.dark ? "#123A40" : "#E3EFEE") : "none", border: "none", borderRadius: 10, cursor: "pointer", color: t.INK, fontSize: 14 }}>
          <Avatar t={t} id={p.id} label={p.full_name || ""} size={36} /><span style={{ flex: 1, textAlign: "left" }}>{p.full_name || "Unnamed"}</span>{sel.includes(p.id) && <span style={{ color: t.TEAL }}>✓</span>}</button>)}
      </div>
      {group && <Btn kind="primary" disabled={!name.trim() || !sel.length} onClick={() => onCreate(name.trim(), sel, desc.trim())} style={{ marginTop: 12 }}>Create group · {sel.length + 1} members</Btn>}
    </div></div>;
}
function ForwardDialog({ t, rooms, onClose, onSend }: any) {
  const [sel, setSel] = useState<string[]>([]);
  return <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 75, background: "rgba(11,59,61,.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div style={{ width: 400, maxHeight: "80vh", display: "flex", flexDirection: "column", background: t.BG, borderRadius: 18, boxShadow: t.OUT, padding: 20, color: t.INK }}>
      <div className="flex justify-between items-center" style={{ marginBottom: 12 }}><b className="font-serif" style={{ fontSize: 22, fontWeight: 500 }}>Forward to</b><IconBtn t={t} title="Close" onClick={onClose}><X size={17} /></IconBtn></div>
      <div style={{ overflowY: "auto", flex: 1 }}>{rooms.map((r: any) => <button key={r.id} onClick={() => setSel(s => s.includes(r.id) ? s.filter(x => x !== r.id) : [...s, r.id])}
        className="flex items-center gap-3 w-full" style={{ padding: "8px 6px", background: sel.includes(r.id) ? (t.dark ? "#123A40" : "#E3EFEE") : "none", border: "none", borderRadius: 10, cursor: "pointer", color: t.INK, fontSize: 14 }}>
        <Avatar t={t} id={r.id} label={r.name} size={34} group={!r.id.startsWith("dm:")} /><span style={{ flex: 1, textAlign: "left" }}>{r.name}</span>{sel.includes(r.id) && <span style={{ color: t.TEAL }}>✓</span>}</button>)}</div>
      <Btn kind="primary" disabled={!sel.length} onClick={() => onSend(sel)} style={{ marginTop: 12 }}>Forward{sel.length ? ` to ${sel.length}` : ""}</Btn>
    </div></div>;
}

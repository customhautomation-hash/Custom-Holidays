/**
 * Notifications bell — real alerts from the dashboard's own data:
 *  • Team Chat: unread messages, and when someone @mentions you
 *  • Master CRM: new leads
 *  • Active Trips: clients leaving within 7 days, leaving today, coming back today
 * Live: new chat messages and new leads appear without refreshing.
 * Read / dismissed state is remembered in this browser.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, MessageSquare, AtSign, UserPlus, Plane, Home, X, CheckCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/components/ch/kit";
import { pushState, enablePush, PushState } from "@/lib/push";

type Note = { id: string; kind: "chat" | "mention" | "lead" | "trip" | "back"; title: string; body: string; at: string; go: () => void };
const LS = { get: (k: string, d: any) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } }, set: (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } } };
const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400); return d === 1 ? "yesterday" : d < 0 ? "today" : `${d} days ago`;
};

export function NotificationsBell({ btnStyle }: { btnStyle: React.CSSProperties }) {
  const t = useT();
  const nav = useNavigate();
  const { user, profile } = useAuth();
  const me = user?.id || ""; const myFirst = (profile?.full_name || "").split(" ")[0].toLowerCase();
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<any[]>([]);
  const [reads, setReads] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  const [seen, setSeen] = useState<string[]>(() => LS.get("notif:read", []));
  const [hidden, setHidden] = useState<string[]>(() => LS.get("notif:hidden", []));
  const ref = useRef<HTMLDivElement>(null);
  const [push, setPush] = useState<PushState | "busy">("unsupported");
  const [pushErr, setPushErr] = useState("");
  useEffect(() => { pushState().then(setPush).catch(() => {}); }, [open]);

  const load = async () => {
    if (!me) return;
    const week = new Date(Date.now() - 7 * 86400000).toISOString();
    const [m, r, rm, p, c, tr] = await Promise.all([
      supabase.from("chat_messages").select("id, channel, sender, sender_id, text, kind, attachment, mentions, deleted_at, created_at").gte("created_at", week).order("created_at", { ascending: false }).limit(300),
      supabase.from("chat_reads").select("*").eq("user_id", me),
      supabase.from("chat_rooms").select("id, name, kind, members"),
      supabase.from("profiles").select("id, full_name"),
      supabase.from("contacts").select("id, name, source, destination, created_at, deleted_at").gte("created_at", week).order("created_at", { ascending: false }).limit(50),
      supabase.from("trips").select("id, name, client, places, status, start_date, end_date"),
    ]);
    if (!m.error) setChat(m.data || []); if (!r.error) setReads(r.data || []); if (!rm.error) setRooms(rm.data || []);
    if (!p.error) setPeople(p.data || []); if (!c.error) setLeads((c.data || []).filter((x: any) => !x.deleted_at)); if (!tr.error) setTrips(tr.data || []);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (e: any) => setChat(l => [e.new, ...l]))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contacts" }, (e: any) => setLeads(l => [e.new, ...l]))
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads" }, (e: any) => { if (e.new?.user_id === me) setReads(l => [...l.filter(x => x.room_id !== e.new.room_id), e.new]); })
      .subscribe();
    const i = setInterval(load, 5 * 60000);
    return () => { clearInterval(i); supabase.removeChannel(ch); };
  }, [me]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const notes = useMemo<Note[]>(() => {
    const out: Note[] = [];
    const nameOf = (id: string, fb: string) => people.find(p => p.id === id)?.full_name || fb || "Someone";
    const roomName = (id: string) => { const r = rooms.find(x => x.id === id); if (!r) return id === "General" ? "General" : "a chat"; return r.kind === "dm" ? "you" : r.name; };
    const mine = (r: any) => !r || !r.members?.length || r.members.includes(me);
    const openChat = (room: string) => () => nav(`/chat?room=${encodeURIComponent(room)}`);
    // chat: one note per chat with unread messages; mentions get their own note
    const byRoom = new Map<string, any[]>();
    for (const m of chat) {
      if (m.deleted_at || m.kind === "system" || m.sender_id === me || !mine(rooms.find(r => r.id === m.channel))) continue;
      const read = reads.find(r => r.room_id === m.channel)?.last_read_at;
      if (read && new Date(m.created_at) <= new Date(read)) continue;
      const mention = (m.mentions || []).includes(me) || (myFirst && (m.text || "").toLowerCase().includes(`@${myFirst}`));
      if (mention) out.push({ id: `mention:${m.id}`, kind: "mention", title: `${nameOf(m.sender_id, m.sender)} mentioned you`, body: m.text || "", at: m.created_at, go: openChat(m.channel) });
      byRoom.set(m.channel, [...(byRoom.get(m.channel) || []), m]);
    }
    for (const [room, list] of byRoom) {
      const last = list[0]; const n = list.length; const dm = rooms.find(r => r.id === room)?.kind === "dm";
      out.push({ id: `chat:${room}:${last.id}`, kind: "chat", title: dm ? `${nameOf(last.sender_id, last.sender)} sent you ${n > 1 ? `${n} messages` : "a message"}` : `${n} new message${n > 1 ? "s" : ""} in ${roomName(room)}`,
        body: `${dm ? "" : `${nameOf(last.sender_id, last.sender).split(" ")[0]}: `}${last.text || (last.kind === "voice" ? "🎤 Voice message" : last.attachment ? "📷 Photo or file" : "")}`, at: last.created_at, go: openChat(room) });
    }
    // new leads
    for (const c of leads) out.push({ id: `lead:${c.id}`, kind: "lead", title: `New lead: ${c.name || "Unnamed"}`, body: [c.source, c.destination].filter(Boolean).join(" · ") || "Open Master CRM to reply", at: c.created_at, go: () => nav("/leads") });
    // trips
    const today = new Date(); today.setHours(0, 0, 0, 0); const iso = today.toISOString().slice(0, 10);
    for (const x of trips) {
      if (/cancel|enquiry/i.test(x.status || "")) continue;
      const who = x.client || x.name;
      if (x.start_date) {
        const d = Math.round((new Date(x.start_date).getTime() - today.getTime()) / 86400000);
        if (d === 0) out.push({ id: `trip:${x.id}:today`, kind: "trip", title: `${who} leave today`, body: [x.places || x.name, "Send the welcome message"].join(" · "), at: new Date().toISOString(), go: () => nav("/trips") });
        else if (d > 0 && d <= 7) out.push({ id: `trip:${x.id}:${x.start_date}`, kind: "trip", title: `${who} leave in ${d} day${d > 1 ? "s" : ""}`, body: `${x.places || x.name} · check vouchers and the trip folder`, at: new Date(today.getTime() - (7 - d) * 3600000).toISOString(), go: () => nav(`/vouchers?client=${encodeURIComponent(who)}&trip=${encodeURIComponent(x.name)}`) });
      }
      if (x.end_date && x.end_date.slice(0, 10) === iso) out.push({ id: `back:${x.id}`, kind: "back", title: `${who} come back today`, body: "Send a welcome back message and ask for feedback", at: new Date().toISOString(), go: () => nav("/trips") });
    }
    return out.filter(n => !hidden.includes(n.id)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  }, [chat, reads, rooms, people, leads, trips, hidden, me]);

  const unread = notes.filter(n => !seen.includes(n.id)).length;
  const markAll = () => { const ids = [...new Set([...seen, ...notes.map(n => n.id)])].slice(-500); setSeen(ids); LS.set("notif:read", ids); };
  const markOne = (id: string) => { if (seen.includes(id)) return; const ids = [...seen, id].slice(-500); setSeen(ids); LS.set("notif:read", ids); };
  const hide = (id: string) => { const ids = [...hidden, id].slice(-500); setHidden(ids); LS.set("notif:hidden", ids); };
  const ICON = { chat: MessageSquare, mention: AtSign, lead: UserPlus, trip: Plane, back: Home };
  const TINT = { chat: [t.TEAL_BG, t.TEAL], mention: [t.GOLD_BG, t.dark ? "#D4AF5A" : "#8A6A24"], lead: [t.TEAL_BG, t.TEAL], trip: [t.GOLD_BG, t.dark ? "#D4AF5A" : "#8A6A24"], back: [t.TEAL_BG, t.TEAL] } as const;
  const fresh = notes.filter(n => Date.now() - new Date(n.at).getTime() < 86400000);
  const older = notes.filter(n => !fresh.includes(n));

  const row = (n: Note) => {
    const Icon = ICON[n.kind]; const [bg, fg] = TINT[n.kind]; const isNew = !seen.includes(n.id);
    return (
      <div key={n.id} onClick={() => { markOne(n.id); setOpen(false); n.go(); }} className="group"
        style={{ display: "flex", gap: 12, padding: "10px 16px", cursor: "pointer", background: isNew ? (t.dark ? "rgba(95,179,174,.07)" : "rgba(19,88,91,.05)") : "transparent" }}
        onMouseEnter={e => (e.currentTarget.style.background = t.dark ? "#123A40" : "#EDE2E2")} onMouseLeave={e => (e.currentTarget.style.background = isNew ? (t.dark ? "rgba(95,179,174,.07)" : "rgba(19,88,91,.05)") : "transparent")}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={16} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2"><span style={{ fontSize: 13, fontWeight: isNew ? 600 : 500, color: t.INK, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
            {isNew && <span style={{ width: 7, height: 7, borderRadius: 99, background: t.TEAL, flexShrink: 0 }} />}</div>
          {n.body && <div style={{ fontSize: 12, color: t.MUTED, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</div>}
          <div style={{ fontSize: 11, color: t.FAINT, marginTop: 3 }}>{ago(n.at)}</div>
        </div>
        <button title="Dismiss" onClick={e => { e.stopPropagation(); hide(n.id); }} className="opacity-0 group-hover:opacity-100"
          style={{ background: "none", border: "none", color: t.FAINT, cursor: "pointer", alignSelf: "flex-start", padding: 2 }}><X size={13} /></button>
      </div>);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} title="Notifications" style={{ ...btnStyle, ...(open ? { boxShadow: t.IN } : {}) }}>
        <Bell style={{ width: 15, height: 15 }} />
        {unread > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 99, background: t.dark ? "#1F6F72" : "#13585B", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", border: `2px solid ${t.BG}` }}>{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 380, zIndex: 60, background: t.BG, borderRadius: 18, boxShadow: t.dark ? "8px 8px 20px #061A1E, -6px -6px 16px #16434A" : "8px 8px 22px #D3C0C2, -6px -6px 18px #FFFFFF", overflow: "hidden" }}>
          <div className="flex items-center justify-between" style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${t.LINE}` }}>
            <div className="flex items-center gap-2"><b style={{ fontSize: 14, color: t.INK }}>Notifications</b>{unread > 0 && <span style={{ fontSize: 11, color: t.MUTED }}>{unread} new</span>}</div>
            {unread > 0 && <button onClick={markAll} className="flex items-center gap-1" style={{ fontSize: 12, color: t.TEAL, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}><CheckCheck size={14} />Mark all read</button>}
          </div>
          <div style={{ maxHeight: 440, overflowY: "auto", padding: "4px 0 8px" }}>
            {!notes.length ? <div style={{ padding: "36px 16px", textAlign: "center", color: t.MUTED, fontSize: 13 }}>You're all caught up</div> : <>
              {!!fresh.length && <div style={{ fontSize: 11, color: t.FAINT, padding: "8px 16px 2px" }}>Today</div>}
              {fresh.map(row)}
              {!!older.length && <div style={{ fontSize: 11, color: t.FAINT, padding: "10px 16px 2px" }}>This week</div>}
              {older.map(row)}
            </>}
          </div>
          {(push === "off" || push === "blocked" || push === "busy") && (
            <div style={{ borderTop: `1px solid ${t.LINE}`, padding: "10px 16px", fontSize: 12, color: t.MUTED, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1 }}>{push === "blocked" ? "Notifications are blocked for this site. Allow them from the lock icon in the address bar." : pushErr || "Get these on your desktop, even when the dashboard is closed"}</span>
              {push !== "blocked" && <button disabled={push === "busy"} onClick={async () => { setPush("busy"); setPushErr(""); try { setPush(await enablePush()); } catch (e: any) { setPushErr(e?.message || "Could not turn on"); setPush("off"); } }}
                style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: t.dark ? "#1F6F72" : "#13585B", border: "none", borderRadius: 9, padding: "6px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>{push === "busy" ? "Turning on…" : "Turn on"}</button>}
            </div>)}
        </div>)}
    </div>
  );
}

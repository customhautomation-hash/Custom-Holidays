/** One chat bubble with its hover menu: reply, react, copy, forward, star, pin, edit, delete, info. */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Star, Pin, FileText, Download, Check, CheckCheck, Forward, Clock, AlertCircle } from "lucide-react";
import { Msg, Attachment, QUICK, timeOf, fileUrl, fileSize, EDIT_MINUTES, DELETE_HOURS } from "./chatLib";
import { T } from "@/components/ch/kit";

export function useFileUrl(a?: Attachment | null) {
  const [url, setUrl] = useState("");
  useEffect(() => { let on = true; if (a) fileUrl(a).then(u => on && setUrl(u)).catch(() => {}); return () => { on = false; }; }, [a?.path, a?.url]);
  return url;
}

const LINK = /(https?:\/\/[^\s]+)/g;
function RichText({ text, names, t }: { text: string; names: string[]; t: T }) {
  const parts = text.split(LINK);
  return <>{parts.map((p, i) => /^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: t.TEAL, textDecoration: "underline", overflowWrap: "anywhere" }}>{p}</a>
    : <span key={i}>{p.split(/(@[\w.]+)/g).map((s, j) => s.startsWith("@") && names.some(n => s.slice(1).toLowerCase().startsWith(n.split(" ")[0].toLowerCase()))
        ? <b key={j} style={{ color: t.TEAL, fontWeight: 600 }}>{s}</b> : s)}</span>)}</>;
}

export function AttachmentView({ a, kind, t, onImage }: { a: Attachment; kind: string; t: T; onImage: (url: string) => void }) {
  const url = useFileUrl(a);
  if (kind === "voice" || a.mime?.startsWith("audio/")) return <audio controls src={url || undefined} style={{ width: 260, height: 36, display: "block" }} />;
  if (a.mime?.startsWith("image/")) return url
    ? <img src={url} alt={a.name} onClick={() => onImage(url)} style={{ display: "block", maxWidth: 300, maxHeight: 300, borderRadius: 10, cursor: "zoom-in", objectFit: "cover" }} />
    : <div style={{ width: 240, height: 160, borderRadius: 10, background: t.dark ? "#16434A" : "#E8DADB" }} />;
  if (a.mime?.startsWith("video/")) return <video controls src={url || undefined} style={{ maxWidth: 300, borderRadius: 10, display: "block" }} />;
  return (
    <a href={url ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(a.name)}` : undefined} target="_blank" rel="noreferrer"
      className="flex items-center gap-3" style={{ padding: "8px 10px", borderRadius: 10, background: t.dark ? "rgba(0,0,0,.18)" : "rgba(19,88,91,.07)", color: "inherit", textDecoration: "none", minWidth: 220 }}>
      <FileText size={22} color={t.TEAL} strokeWidth={1.5} />
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
        <div style={{ fontSize: 11, color: t.MUTED }}>{fileSize(a.size)} · {(a.name.split(".").pop() || "").toUpperCase()}</div></div>
      <Download size={16} color={t.MUTED} />
    </a>);
}

export type BubbleActions = {
  reply: () => void; react: (e: string) => void; copy: () => void; forward: () => void; star: () => void; pin: () => void;
  edit: () => void; delMe: () => void; delAll: () => void; info: () => void; jump: (id: string) => void; image: (url: string) => void;
};

export function MessageBubble({ m, mine, t, showName, senderName, color, quoted, quotedName, ticks, myId, names, highlight, a }: {
  m: Msg; mine: boolean; t: T; showName: boolean; senderName: string; color: string; quoted?: Msg | null; quotedName?: string;
  ticks: "pending" | "failed" | "sent" | "some" | "all"; myId: string; names: string[]; highlight?: string; a: BubbleActions;
}) {
  const [menu, setMenu] = useState(false);
  const [up, setUp] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  const age = Date.now() - new Date(m.created_at).getTime();
  const canEdit = mine && !m.deleted_at && !!m.text && !m.attachment && age < EDIT_MINUTES * 60000 && !m.forwarded;
  const canDelAll = mine && !m.deleted_at && age < DELETE_HOURS * 3600000;
  const starred = m.starred_by.includes(myId);
  const reacts = Object.entries(m.reactions || {}).filter(([, v]) => v?.length);
  const bg = mine ? (t.dark ? "#1F5A5C" : "#D7ECE7") : (t.dark ? "#123A40" : "#FFFFFF");
  const item = (label: string, fn: () => void, danger = false) => (
    <button onClick={() => { setMenu(false); fn(); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: danger ? t.RED : t.INK }}
      onMouseEnter={e => (e.currentTarget.style.background = t.dark ? "#16434A" : "#F3EAEA")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>{label}</button>);
  const hl = (s: string) => !highlight ? <RichText text={s} names={names} t={t} /> :
    <>{s.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig")).map((p, i) => p.toLowerCase() === highlight.toLowerCase() ? <mark key={i} style={{ background: "#F6E2A8", padding: 0 }}>{p}</mark> : <RichText key={i} text={p} names={names} t={t} />)}</>;

  return (
    <div id={`msg-${m.id}`} className="flex" style={{ justifyContent: mine ? "flex-end" : "flex-start", padding: "1px 0" }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div ref={ref} style={{ position: "relative", maxWidth: "68%", minWidth: 90 }}>
        <div style={{ background: bg, borderRadius: mine ? "14px 4px 14px 14px" : "4px 14px 14px 14px", padding: m.attachment && !m.text && m.attachment.mime?.startsWith("image/") ? 4 : "7px 10px 6px",
          boxShadow: "0 1px 1.5px rgba(11,59,61,.13)", color: t.INK, fontSize: 13.5, lineHeight: 1.45 }}>
          {showName && !mine && <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 2, padding: m.attachment && !m.text ? "4px 6px 0" : 0 }}>{senderName}</div>}
          {m.forwarded && !m.deleted_at && <div className="flex items-center gap-1" style={{ fontSize: 11, color: t.MUTED, fontStyle: "italic", marginBottom: 2 }}><Forward size={11} />Forwarded</div>}
          {m.deleted_at ? <div style={{ fontStyle: "italic", color: t.MUTED, fontSize: 13 }}>🚫 {mine ? "You deleted this message" : "This message was deleted"}</div> : <>
            {quoted && <div onClick={() => a.jump(quoted.id)} style={{ cursor: "pointer", borderLeft: `3px solid ${t.TEAL}`, background: t.dark ? "rgba(0,0,0,.2)" : "rgba(19,88,91,.07)", borderRadius: 6, padding: "4px 8px", marginBottom: 5 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: t.TEAL }}>{quotedName}</div>
              <div style={{ fontSize: 12, color: t.MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 320 }}>{quoted.deleted_at ? "This message was deleted" : quoted.text || (quoted.kind === "voice" ? "🎤 Voice message" : `📎 ${quoted.attachment?.name || "File"}`)}</div>
            </div>}
            {m.attachment && <div style={{ marginBottom: m.text ? 5 : 0 }}><AttachmentView a={m.attachment} kind={m.kind} t={t} onImage={a.image} /></div>}
            {m.text && <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{hl(m.text)}</span>}
          </>}
          <span className="inline-flex items-center gap-1" style={{ float: "right", fontSize: 10.5, color: t.MUTED, margin: "6px 0 -2px 10px", padding: m.attachment && !m.text ? "0 6px 2px" : 0 }}>
            {m.pinned_at && <Pin size={10} />}{starred && <Star size={10} fill="currentColor" />}{m.edited_at && !m.deleted_at && <span>edited</span>}{timeOf(m.created_at)}
            {mine && !m.deleted_at && (ticks === "pending" ? <Clock size={12} /> : ticks === "failed" ? <AlertCircle size={12} color={t.RED} /> :
              ticks === "sent" ? <Check size={14} /> : <CheckCheck size={14} color={ticks === "all" ? "#34B7F1" : undefined} />)}
          </span>
          <div style={{ clear: "both" }} />
        </div>
        {!!reacts.length && <div className="flex gap-1" style={{ position: "relative", marginTop: -4, justifyContent: mine ? "flex-end" : "flex-start", padding: "0 8px" }}>
          {reacts.map(([e, who]) => <button key={e} onClick={() => a.react(e)} title={`${who.length}`} style={{ background: t.dark ? "#16434A" : "#fff", border: who.includes(myId) ? `1px solid ${t.TEAL}` : "1px solid transparent", borderRadius: 99, padding: "0 6px", fontSize: 12, boxShadow: "0 1px 2px rgba(0,0,0,.15)", cursor: "pointer", color: t.INK }}>{e}{who.length > 1 ? ` ${who.length}` : ""}</button>)}
        </div>}
        {!m.deleted_at && !m.pending && (hover || menu) && (
          <button onClick={() => { setUp((ref.current?.getBoundingClientRect().bottom || 0) > window.innerHeight - 380); setMenu(v => !v); }} title="Message options" style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 99, border: "none", cursor: "pointer", background: bg, color: t.MUTED, display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronDown size={15} /></button>)}
        {m.deleted_at && mine && (hover || menu) && <button onClick={() => setMenu(v => !v)} style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 99, border: "none", cursor: "pointer", background: bg, color: t.MUTED }}><ChevronDown size={15} /></button>}
        {menu && (
          <div style={{ position: "absolute", ...(up ? { bottom: "100%" } : { top: 28 }), [mine ? "right" : "left"]: 0, zIndex: 30, minWidth: 200, background: t.dark ? "#10343A" : "#FFFFFF", borderRadius: 12, boxShadow: "0 8px 28px rgba(0,0,0,.18)", padding: "6px 0" } as any}>
            {!m.deleted_at && <div className="flex justify-between" style={{ padding: "4px 10px 8px", borderBottom: `1px solid ${t.LINE}`, marginBottom: 4 }}>
              {QUICK.map(e => <button key={e} onClick={() => { setMenu(false); a.react(e); }} style={{ fontSize: 19, background: m.reactions?.[e]?.includes(myId) ? (t.dark ? "#16434A" : "#E3EFEE") : "none", border: "none", borderRadius: 99, cursor: "pointer", padding: 3 }}>{e}</button>)}
            </div>}
            {!m.deleted_at && <>
              {item("Reply", a.reply)}
              {m.text && item("Copy", a.copy)}
              {item("Forward", a.forward)}
              {item(starred ? "Unstar" : "Star", a.star)}
              {item(m.pinned_at ? "Unpin" : "Pin", a.pin)}
              {canEdit && item("Edit", a.edit)}
              {mine && item("Message info", a.info)}
            </>}
            {item("Delete for me", a.delMe, true)}
            {canDelAll && item("Delete for everyone", a.delAll, true)}
          </div>)}
      </div>
    </div>
  );
}

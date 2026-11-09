/** Photo / video preview before sending, and the full-screen viewer — like WhatsApp. */
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Send, ChevronLeft, ChevronRight, Download, Reply, Forward, Play } from "lucide-react";
import { Attachment, Msg, fileUrl, timeOf, dayLabel, fileSize } from "./chatLib";
import { T } from "@/components/ch/kit";

const MAX_MB = 50;

export function MediaComposer({ t, files, chatName, onAdd, onRemove, onClose, onSend }: {
  t: T; files: File[]; chatName: string; onAdd: (f: File[]) => void; onRemove: (i: number) => void; onClose: () => void; onSend: (files: File[], caption: string) => void;
}) {
  const [i, setI] = useState(0);
  const [caption, setCaption] = useState("");
  const more = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach(u => URL.revokeObjectURL(u)), [urls]);
  useEffect(() => { if (i >= files.length) setI(Math.max(0, files.length - 1)); }, [files.length]);
  const cur = files[i]; const tooBig = files.filter(f => f.size > MAX_MB * 1048576);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  if (!cur) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 85, background: t.dark ? "#071D21" : "#1A2324", display: "flex", flexDirection: "column", color: "#fff" }}>
      <div className="flex items-center gap-3" style={{ padding: "14px 20px" }}>
        <button onClick={onClose} title="Cancel" style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}><X size={22} /></button>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>Send to {chatName}</div><div style={{ fontSize: 12, opacity: .7 }}>{cur.name} · {fileSize(cur.size)}</div></div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 40px" }}>
        {cur.type.startsWith("video/")
          ? <video key={urls[i]} src={urls[i]} controls style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
          : <img src={urls[i]} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, objectFit: "contain" }} />}
      </div>
      {!!tooBig.length && <div style={{ textAlign: "center", fontSize: 12.5, color: "#F3A79B", padding: 6 }}>{tooBig.map(f => f.name).join(", ")} {tooBig.length > 1 ? "are" : "is"} bigger than {MAX_MB} MB. Remove {tooBig.length > 1 ? "them" : "it"} or send a shorter clip.</div>}
      <div style={{ padding: "12px 20px 18px", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Add a caption" autoFocus
          onKeyDown={e => { if (e.key === "Enter" && !tooBig.length) onSend(files, caption); }}
          style={{ width: "min(640px, 100%)", height: 44, borderRadius: 12, border: "none", outline: "none", background: "rgba(255,255,255,.1)", color: "#fff", padding: "0 16px", fontSize: 14 }} />
        <div className="flex items-center gap-2" style={{ maxWidth: "100%", overflowX: "auto" }}>
          {files.map((f, k) => (
            <div key={k} onClick={() => setI(k)} style={{ position: "relative", width: 58, height: 58, borderRadius: 8, overflow: "hidden", cursor: "pointer", flexShrink: 0, outline: k === i ? "2px solid #D4AF5A" : "none", outlineOffset: 1 }}>
              {f.type.startsWith("video/") ? <><video src={urls[k]} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /><Play size={14} fill="#fff" style={{ position: "absolute", left: 4, bottom: 4 }} /></>
                : <img src={urls[k]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              <button title="Remove" onClick={e => { e.stopPropagation(); onRemove(k); }} style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 99, border: "none", background: "rgba(0,0,0,.6)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={11} /></button>
            </div>))}
          <button title="Add more" onClick={() => more.current?.click()} style={{ width: 58, height: 58, borderRadius: 8, border: "1.5px dashed rgba(255,255,255,.4)", background: "none", color: "#fff", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={20} /></button>
          <input ref={more} type="file" multiple accept="image/*,video/*" hidden onChange={e => { if (e.target.files) onAdd(Array.from(e.target.files)); e.target.value = ""; }} />
          <button title="Send" disabled={!!tooBig.length} onClick={() => onSend(files, caption)}
            style={{ width: 54, height: 54, marginLeft: 12, borderRadius: 99, border: "none", background: "#13585B", color: "#fff", cursor: tooBig.length ? "default" : "pointer", opacity: tooBig.length ? .5 : 1, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <Send size={20} />{files.length > 1 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 99, background: "#D4AF5A", color: "#1A2324", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{files.length}</span>}
          </button>
        </div>
      </div>
    </div>);
}

export type ViewItem = { a: Attachment; m: Msg; who: string };
export function MediaViewer({ t, list, index, onIndex, onClose, onReply, onForward }: {
  t: T; list: ViewItem[]; index: number; onIndex: (i: number) => void; onClose: () => void; onReply: (m: Msg) => void; onForward: (m: Msg) => void;
}) {
  const it = list[index]; const [url, setUrl] = useState("");
  useEffect(() => { setUrl(""); if (it) fileUrl(it.a).then(setUrl).catch(() => {}); }, [index]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1); if (e.key === "ArrowRight" && index < list.length - 1) onIndex(index + 1); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [index, list.length]);
  if (!it) return null;
  const video = it.a.mime.startsWith("video/");
  const nav = (dir: -1 | 1) => { const n = index + dir; if (n >= 0 && n < list.length) onIndex(n); };
  const btn = { background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 6, display: "flex" } as const;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(7,20,23,.96)", display: "flex", flexDirection: "column", color: "#fff" }}>
      <div className="flex items-center gap-3" style={{ padding: "12px 20px" }}>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{it.who}</div><div style={{ fontSize: 12, opacity: .7 }}>{dayLabel(it.m.created_at)} at {timeOf(it.m.created_at)}{list.length > 1 ? ` · ${index + 1} of ${list.length}` : ""}</div></div>
        <button title="Reply" style={btn} onClick={() => onReply(it.m)}><Reply size={19} /></button>
        <button title="Forward" style={btn} onClick={() => onForward(it.m)}><Forward size={19} /></button>
        {url && <a title="Download" href={`${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(it.a.name)}`} style={btn}><Download size={19} /></a>}
        <button title="Close" style={btn} onClick={onClose}><X size={22} /></button>
      </div>
      <div onClick={e => e.target === e.currentTarget && onClose()} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: "0 70px" }}>
        {index > 0 && <button title="Previous" onClick={() => nav(-1)} style={{ ...btn, position: "absolute", left: 16, width: 44, height: 44, borderRadius: 99, background: "rgba(255,255,255,.1)", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={24} /></button>}
        {!url ? <div style={{ opacity: .6, fontSize: 13 }}>Loading…</div> : video
          ? <video key={url} src={url} controls autoPlay style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 6 }} />
          : <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 4 }} />}
        {index < list.length - 1 && <button title="Next" onClick={() => nav(1)} style={{ ...btn, position: "absolute", right: 16, width: 44, height: 44, borderRadius: 99, background: "rgba(255,255,255,.1)", alignItems: "center", justifyContent: "center" }}><ChevronRight size={24} /></button>}
      </div>
      {it.m.text && <div style={{ textAlign: "center", padding: "10px 20px", fontSize: 14 }}>{it.m.text}</div>}
      {list.length > 1 && <Strip list={list} index={index} onIndex={onIndex} />}
    </div>);
}
function Strip({ list, index, onIndex }: { list: ViewItem[]; index: number; onIndex: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { (ref.current?.children[index] as HTMLElement)?.scrollIntoView({ inline: "center", block: "nearest" }); }, [index]);
  return <div ref={ref} className="flex gap-2" style={{ padding: "8px 20px 16px", overflowX: "auto", justifyContent: list.length < 12 ? "center" : "flex-start" }}>
    {list.map((x, k) => <StripThumb key={k} a={x.a} on={k === index} onClick={() => onIndex(k)} />)}</div>;
}
function StripThumb({ a, on, onClick }: { a: Attachment; on: boolean; onClick: () => void }) {
  const [u, setU] = useState("");
  const src = a.mime.startsWith("video/") ? (a.thumbPath ? { ...a, path: a.thumbPath } : null) : a;
  useEffect(() => { if (src) fileUrl(src as Attachment).then(setU).catch(() => {}); }, [a.path]);
  return <div onClick={onClick} style={{ width: 52, height: 52, borderRadius: 6, overflow: "hidden", cursor: "pointer", flexShrink: 0, opacity: on ? 1 : .55, outline: on ? "2px solid #D4AF5A" : "none", background: "#16434A", position: "relative" }}>
    {u && <img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
    {a.mime.startsWith("video/") && <Play size={12} fill="#fff" color="#fff" style={{ position: "absolute", left: 4, bottom: 4 }} />}</div>;
}

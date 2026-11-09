/**
 * AssistantPopup — CH Assistant as a chat in the bottom-right corner of every page.
 * Chats normally and uses the uploaded documents when they help (docs_mode "auto").
 * Start a message with /docs to answer only from documents, or /chat to ignore them.
 */
import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Paperclip, Loader2, Square } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { API_ROOT } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/components/ch/kit";

type Msg = { id: string; role: "user" | "assistant"; content: string; error?: boolean };
const uid = () => Math.random().toString(36).slice(2);
async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? `Bearer ${data.session.access_token}` : "";
}

export function AssistantPopup() {
  const t = useT();
  const { user, profile } = useAuth();
  const userName = profile?.full_name || user?.email?.split("@")[0] || "Team Member";
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [uploading, setUploading] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  const ensureConversation = async () => {
    if (convId) return convId;
    const res = await fetch(`${API_ROOT}/mxai/conversations`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: userName, title: "Corner chat" }),
    });
    const data = await res.json();
    const id = data?.conversation?.id;
    if (!id) throw new Error("Could not start a chat");
    setConvId(id);
    return id as string;
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const aid = uid();
    setMsgs(m => [...m, { id: uid(), role: "user", content: text }, { id: aid, role: "assistant", content: "" }]);
    setBusy(true);
    const ctrl = new AbortController(); abortRef.current = ctrl;
    const setReply = (content: string, error = false) => setMsgs(m => m.map(x => x.id === aid ? { ...x, content, error } : x));
    try {
      const conversation_id = await ensureConversation();
      const res = await fetch(`${API_ROOT}/mxai/chat`, {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: await authHeader() },
        body: JSON.stringify({ docs_mode: "auto", conversation_id, user_name: userName, message: text, model: "auto", image_base64: "", image_mime: "" }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader(); const dec = new TextDecoder();
      let soFar = ""; let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.error) { setReply(d.error, true); return; }
            if (typeof d.raw_token === "string") { soFar += d.raw_token; setReply(soFar); }
            if (d.done && typeof d.reply === "string" && d.reply) setReply(d.reply);
          } catch { /* partial line */ }
        }
      }
      if (!soFar) setMsgs(m => m.map(x => x.id === aid && !x.content ? { ...x, content: "No reply came back. Please try again.", error: true } : x));
    } catch (e: any) {
      if (e?.name !== "AbortError") setReply(`Could not reach CH Assistant (${e?.message || "offline"}). The server may be waking up, try again in a minute.`, true);
    } finally { setBusy(false); abortRef.current = null; }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        const form = new FormData(); form.append("file", file);
        const res = await fetch(`${API_ROOT}/rag/upload`, { method: "POST", headers: { Authorization: await authHeader() }, body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Upload failed");
        for (let i = 0; i < 150; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const st = await (await fetch(`${API_ROOT}/rag/status/${data.job_id}`, { headers: { Authorization: await authHeader() } })).json();
          if (st.status === "error") throw new Error(st.error || "Could not read the file");
          if (st.status !== "processing") break;
        }
        setMsgs(m => [...m, { id: uid(), role: "assistant", content: `Added **${file.name}**. I'll use it when your questions need it.` }]);
      } catch (e: any) {
        setMsgs(m => [...m, { id: uid(), role: "assistant", content: `${file.name}: ${e.message}`, error: true }]);
      }
    }
    setUploading("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const bubble = (m: Msg) => m.role === "user"
    ? { alignSelf: "flex-end" as const, background: t.dark ? "#1F6F72" : "#13585B", color: "#fff" }
    : { alignSelf: "flex-start" as const, background: t.BG, color: m.error ? t.RED : t.INK, boxShadow: t.BTN };

  return (
    <>
      {open && (
        <div style={{ position: "fixed", right: 24, bottom: 94, width: 400, height: "min(640px, calc(100vh - 130px))", zIndex: 70,
          background: t.PAPER, borderRadius: 20, boxShadow: "0 12px 40px rgba(11,59,61,.28)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ background: "#0B3B3D", color: "#F6F4EE", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={18} color="#D4AF5A" strokeWidth={1.6} />
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 14 }}>CH Assistant</b>
              <div style={{ fontSize: 11, color: "#C9D8D7" }}>Chats normally · checks your documents when needed</div>
            </div>
            <button onClick={() => setOpen(false)} title="Close" style={{ background: "none", border: "none", color: "#C9D8D7", cursor: "pointer" }}><X size={16} /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {msgs.length === 0 && (
              <div style={{ color: t.MUTED, fontSize: 12.5, lineHeight: 1.6 }}>
                Ask about leads, trips, suppliers or rates. Start with <b>/docs</b> to answer only from your documents, or <b>/chat</b> to ignore them.
              </div>
            )}
            {msgs.map(m => (
              <div key={m.id} style={{ maxWidth: "86%", padding: "10px 13px", borderRadius: 14, fontSize: 12.5, lineHeight: 1.55, ...bubble(m) }}>
                {m.content ? <ReactMarkdown>{m.content}</ReactMarkdown> : <Loader2 size={14} className="animate-spin" />}
              </div>
            ))}
            {uploading && <div style={{ fontSize: 12, color: t.MUTED }}>Reading {uploading}…</div>}
            <div ref={endRef} />
          </div>
          <div style={{ padding: "12px 14px", borderTop: `1px solid ${t.LINE}`, display: "flex", gap: 8, alignItems: "center" }}>
            <input ref={fileRef} type="file" multiple accept=".pdf,.txt,.doc,.docx,.zip" hidden onChange={e => upload(e.target.files)} />
            <button title="Add a document" onClick={() => fileRef.current?.click()}
              style={{ width: 36, height: 40, border: "none", background: "none", color: t.MUTED, cursor: "pointer" }}><Paperclip size={16} /></button>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask anything"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              style={{ flex: 1, height: 40, borderRadius: 12, boxShadow: t.IN, background: t.BG, border: "none", outline: "none", padding: "0 12px", color: t.INK, fontSize: 12.5 }} />
            <button onClick={busy ? () => abortRef.current?.abort() : send} title={busy ? "Stop" : "Send"}
              style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: t.dark ? "#1F6F72" : "#13585B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              {busy ? <Square size={14} /> : <Send size={15} />}
            </button>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} title="CH Assistant"
        style={{ position: "fixed", right: 24, bottom: 24, width: 56, height: 56, borderRadius: 99, zIndex: 70, cursor: "pointer",
          background: "#0B3B3D", color: "#D4AF5A", border: "1.5px solid #D4AF5A", boxShadow: "4px 4px 12px rgba(0,0,0,.25)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
        {open ? <X size={22} /> : <Sparkles size={24} strokeWidth={1.6} />}
      </button>
    </>
  );
}

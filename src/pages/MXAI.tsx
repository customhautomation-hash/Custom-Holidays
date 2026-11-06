import { useState, useEffect, useRef, useCallback } from "react";
import { API_ROOT } from "../lib/api";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Send, Trash2, MessageSquare, Sparkles,
  Loader2, ChevronDown, Pencil, Check, Square,
  AlertCircle, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/hooks/useAuth";

const API = `${API_ROOT}`;

const genId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

interface Conversation { id: string; title: string; updated_at: string; }
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  image_url?: string;
  created_at: string;
  error?: boolean;
  options?: string[];
  question?: string;
}

const models = [
  { id: "llama3.2:3b", label: "Zeno Flash", desc: "Fastest — text only" },
  { id: "qwen3:14b",   label: "Zeno Pro",   desc: "Smartest"            },
];

// ── Markdown ───────────────────────────────────────────────
const MXMarkdown = ({ content }: { content: string }) => (
  <ReactMarkdown components={{
    p: ({ children }) => <p className="mb-3 last:mb-0 leading-7">{children}</p>,
    h1: ({ children }) => <h1 className="text-xl font-semibold mb-3 mt-4">{children}</h1>,
    h2: ({ children }) => <h2 className="text-lg font-semibold mb-2 mt-3">{children}</h2>,
    h3: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-3">{children}</h3>,
    ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
    li: ({ children }) => <li className="leading-6">{children}</li>,
    code: ({ inline, children }: any) =>
      inline
        ? <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
        : <pre className="bg-zinc-950 text-zinc-100 rounded-lg p-4 overflow-x-auto text-xs font-mono mb-3 whitespace-pre-wrap"><code>{children}</code></pre>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    blockquote: ({ children }) => <blockquote className="border-l-4 border-accent pl-4 italic text-muted-foreground mb-3">{children}</blockquote>,
    hr: () => <hr className="border-border my-4" />,
  }}>
    {content}
  </ReactMarkdown>
);

// ── Thinking dots ──────────────────────────────────────────
const ThinkingDots = () => (
  <div className="flex items-center gap-1.5 px-1 py-1">
    {[0, 1, 2].map(i => (
      <motion.div
        key={i}
        className="h-2 w-2 rounded-full bg-fuchsia-400"
        animate={{ y: [0, -6, 0], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
      />
    ))}
  </div>
);

// ── Option cards ───────────────────────────────────────────
const OptionCards = ({
  question,
  options,
  onSelect,
  disabled,
}: {
  question?: string;
  options: string[];
  onSelect: (value: string) => void;
  disabled: boolean;
}) => {
  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState("");

  const handleManualSubmit = () => {
    if (!manualValue.trim()) return;
    onSelect(manualValue.trim());
    setManualMode(false);
    setManualValue("");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 rounded-2xl border border-border bg-card/80 backdrop-blur overflow-hidden"
    >
      {question && (
        <div className="px-4 pt-3 pb-2 border-b border-border/50">
          <p className="text-xs font-semibold text-muted-foreground">{question}</p>
        </div>
      )}
      <div className="divide-y divide-border">
        {options.map((opt, i) => (
          <button
            key={opt}
            disabled={disabled}
            onClick={() => { if (!disabled) onSelect(opt); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <span className="h-6 w-6 rounded-full border border-border flex items-center justify-center text-[11px] font-semibold text-muted-foreground group-hover:border-fuchsia-400 group-hover:text-fuchsia-400 transition-colors shrink-0">
              {i + 1}
            </span>
            <span className="text-sm text-card-foreground">{opt}</span>
          </button>
        ))}
        {!manualMode ? (
          <button
            disabled={disabled}
            onClick={() => setManualMode(true)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <span className="h-6 w-6 rounded-full border border-border flex items-center justify-center shrink-0 group-hover:border-fuchsia-400 transition-colors">
              <Pencil className="h-3 w-3 text-muted-foreground group-hover:text-fuchsia-400" />
            </span>
            <span className="text-sm text-muted-foreground">Something else</span>
          </button>
        ) : (
          <div className="px-4 py-3 flex items-center gap-2">
            <Input
              autoFocus
              value={manualValue}
              onChange={e => setManualValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleManualSubmit();
                if (e.key === "Escape") setManualMode(false);
              }}
              placeholder="Type your answer..."
              className="flex-1 h-8 text-sm"
            />
            <Button
              size="sm"
              className="h-8 px-3 bg-fuchsia-500 hover:bg-fuchsia-600 text-white text-xs"
              onClick={handleManualSubmit}
            >
              Send
            </Button>
            <button onClick={() => setManualMode(false)} className="text-muted-foreground hover:text-card-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ── Main component ─────────────────────────────────────────
export default function MXAI() {
  // Get username from auth instead of localStorage
  const { user, profile } = useAuth();
  const userName = profile?.full_name || user?.email?.split("@")[0] || "Team Member";

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [selectedModel, setSelectedModel] = useState(models[0].id);
  const [modelOpen, setModelOpen] = useState(false);
  const [sendHovered, setSendHovered] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadConversations = useCallback(async () => {
    if (!userName) return;
    try {
      const res = await fetch(`${API}/mxai/conversations/${encodeURIComponent(userName)}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e) { console.error(e); }
    finally { setLoadingConvs(false); }
  }, [userName]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    setLoadingMsgs(true);
    fetch(`${API}/mxai/messages/${activeId}`)
      .then(r => {
        if (!r.ok) {
          setConversations(prev => prev.filter(c => c.id !== activeId));
          setActiveId(null);
          return { messages: [] };
        }
        return r.json();
      })
      .then(d => {
        const loaded: Message[] = (d.messages || []).map((m: any) => ({
          ...m,
          options: Array.isArray(m.options) && m.options.length ? m.options : undefined,
          question: m.question || undefined,
        }));
        setMessages(loaded);
      })
      .catch(console.error)
      .finally(() => setLoadingMsgs(false));
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const createConversation = async () => {
    try {
      const res = await fetch(`${API}/mxai/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_name: userName, title: "New Chat" }),
      });
      const data = await res.json();
      const conv = data.conversation;
      setConversations(prev => [conv, ...prev]);
      setActiveId(conv.id);
      setMessages([]);
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (e) { console.error(e); }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`${API}/mxai/conversations/${id}`, { method: "DELETE" });
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeId === id) { setActiveId(null); setMessages([]); }
    } catch (e) { console.error(e); }
  };

  const saveTitle = async (id: string) => {
    if (!editTitle.trim()) { setEditingId(null); return; }
    try {
      await fetch(`${API}/mxai/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      setConversations(prev => prev.map(c => c.id === id ? { ...c, title: editTitle.trim() } : c));
    } catch (e) { console.error(e); }
    setEditingId(null);
  };

  const stopGeneration = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setLoading(false);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content === "") {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: "_(stopped)_" } : m);
        }
        return prev;
      });
    }
  };

  const sendMessage = async (overrideText?: string) => {
    const textToSend = (overrideText ?? input).trim();
    if (!textToSend || loading || !activeId) return;

    const userMsg: Message = {
      id: genId(),
      role: "user",
      content: textToSend,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const assistantId = genId();
    setMessages(prev => [...prev, {
      id: assistantId,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
    }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API}/mxai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: activeId,
          user_name: userName,
          message: textToSend,
          model: selectedModel,
          image_base64: "",
          image_mime: "",
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let gotContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n").filter(l => l.startsWith("data: "));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.error) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: data.error, error: true } : m
              ));
              setLoading(false);
              return;
            }

            if (data.raw_token) gotContent = true;

            if (data.done) {
              const finalReply = typeof data.reply === "string" ? data.reply : "";
              const finalOptions = Array.isArray(data.options) ? data.options.slice(0, 5) : [];
              const finalQuestion = typeof data.question === "string" ? data.question : undefined;

              setMessages(prev => prev.map(m =>
                m.id === assistantId ? {
                  ...m,
                  content: finalReply || "Sorry, I couldn't generate a response.",
                  options: finalOptions.length ? finalOptions : undefined,
                  question: finalQuestion,
                } : m
              ));

              const conv = conversations.find(c => c.id === activeId);
              if (conv?.title === "New Chat") {
                const newTitle = textToSend.slice(0, 50) + (textToSend.length > 50 ? "..." : "");
                setConversations(prev => prev.map(c =>
                  c.id === activeId ? { ...c, title: newTitle, updated_at: new Date().toISOString() } : c
                ));
              }
            }
          } catch { /* skip */ }
        }
      }

      if (!gotContent) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: "No response received. Please try again.", error: true }
            : m
        ));
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `Could not reach Zeno — ${err.message}`, error: true }
          : m
      ));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString())
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const lastAssistantWithOptions = messages.reduceRight<number>((found, msg, i) => {
    if (found !== -1) return found;
    if (msg.role === "assistant" && msg.options && msg.options.length > 0) return i;
    return -1;
  }, -1);

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-56px)] -m-6 overflow-hidden">

        {/* ── SIDEBAR ─────────────────────────────────────── */}
        <div className="w-64 shrink-0 flex flex-col border-r border-border bg-card">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-card-foreground ">Zeno AI</span>
              <span className="ml-auto text-[11px] text-muted-foreground truncate max-w-[80px]">{userName}</span>
            </div>
            <Button
              onClick={createConversation}
              className="w-full h-8 text-xs bg-primary hover:opacity-90 text-white gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> New Chat
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8 px-3">
                No conversations yet.<br />Start a new chat above.
              </p>
            ) : conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => setActiveId(conv.id)}
                className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                  activeId === conv.id
                    ? "bg-muted text-card-foreground"
                    : "hover:bg-muted/50 text-muted-foreground hover:text-card-foreground"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <div className="flex-1 min-w-0">
                  {editingId === conv.id ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") saveTitle(conv.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      className="w-full text-xs bg-transparent border-b border-accent outline-none text-card-foreground"
                    />
                  ) : (
                    <>
                      <p className="text-xs font-medium truncate">{conv.title}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(conv.updated_at)}</p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {editingId === conv.id ? (
                    <button onClick={e => { e.stopPropagation(); saveTitle(conv.id); }} className="p-1 hover:text-emerald-400">
                      <Check className="h-3 w-3" />
                    </button>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); setEditingId(conv.id); setEditTitle(conv.title); }} className="p-1 hover:text-card-foreground">
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  <button onClick={e => deleteConversation(conv.id, e)} className="p-1 hover:text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CHAT AREA ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          {!activeId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
              <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-card-foreground mb-2">Welcome to Zeno AI</h2>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Your AI assistant. Start a new chat to get help with itineraries, clients, suppliers, campaigns and more.
                </p>
              </div>
              <Button
                onClick={createConversation}
                className="bg-primary hover:opacity-90 text-white gap-2"
              >
                <Plus className="h-4 w-4" /> Start New Chat
              </Button>
              <div className="grid grid-cols-2 gap-3 max-w-lg w-full mt-2">
                {[
                  "Draft a luxury itinerary for Japan",
                  "Write a follow-up email for a lead",
                  "Suggest upsell ideas for Maldives clients",
                  "Summarise today's supplier tasks",
                ].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={async () => {
                      await createConversation();
                      setInput(suggestion);
                      setTimeout(() => inputRef.current?.focus(), 150);
                    }}
                    className="text-left text-xs p-3 rounded-xl border border-border bg-card hover:bg-muted/40 hover:border-fuchsia-300 transition-colors text-muted-foreground hover:text-card-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0">
                <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-sm font-medium text-card-foreground truncate">
                  {conversations.find(c => c.id === activeId)?.title || "Chat"}
                </span>
                {loading && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground animate-pulse">Generating...</span>
                    <button
                      onClick={stopGeneration}
                      className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-500 border border-red-400/30 hover:border-red-400 rounded-md px-2 py-1 transition-colors"
                    >
                      <Square className="h-2.5 w-2.5 fill-current" /> Stop
                    </button>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
                {loadingMsgs ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Sparkles className="h-8 w-8 text-fuchsia-400 mb-3" />
                    <p className="text-sm text-muted-foreground">Send a message to start the conversation.</p>
                  </div>
                ) : messages.map((msg, idx) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-1 ${
                        msg.error
                          ? "bg-red-500/20 border border-red-500/30"
                          : "bg-primary"
                      }`}>
                        {msg.error
                          ? <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                          : <Sparkles className="h-3.5 w-3.5 text-white" />
                        }
                      </div>
                    )}

                    <div className={`${msg.role === "user" ? "max-w-[70%]" : "max-w-[80%] w-full"}`}>
                      <div className={`rounded-2xl px-4 py-3 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-white rounded-br-sm"
                          : msg.error
                          ? "bg-red-500/10 border border-red-500/20 text-red-400 rounded-bl-sm"
                          : msg.content === ""
                          ? "bg-card border border-border rounded-bl-sm"
                          : "bg-card border border-border text-card-foreground rounded-bl-sm"
                      }`}>
                        {msg.content === "" && msg.role === "assistant"
                          ? <ThinkingDots />
                          : msg.role === "assistant"
                          ? <MXMarkdown content={msg.content} />
                          : <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        }
                      </div>
                      <p className={`text-[11px] text-muted-foreground mt-1 ${msg.role === "user" ? "text-right" : ""}`}>
                        {formatDate(msg.created_at)}
                      </p>
                      {msg.role === "assistant" &&
                        msg.options &&
                        msg.options.length > 0 &&
                        idx === lastAssistantWithOptions && (
                          <OptionCards
                            question={msg.question}
                            options={msg.options}
                            onSelect={(val) => sendMessage(val)}
                            disabled={loading}
                          />
                        )
                      }
                    </div>

                    {msg.role === "user" && (
                      <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-1 text-[11px] font-semibold text-card-foreground">
                        {userName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Input area */}
              <div className="border-t border-border p-4 shrink-0">
                <div className="relative mb-2">
                  <button
                    onClick={() => setModelOpen(!modelOpen)}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-card-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50"
                  >
                    <Sparkles className="h-3 w-3 text-fuchsia-400" />
                    <span className="font-medium">{models.find(m => m.id === selectedModel)?.label}</span>
                    <span className="text-[11px] text-muted-foreground/60">
                      · {models.find(m => m.id === selectedModel)?.desc}
                    </span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${modelOpen ? "rotate-180" : ""}`} />
                  </button>

                  <AnimatePresence>
                    {modelOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-0 mb-1 w-56 rounded-xl border border-border bg-card shadow-lg overflow-hidden z-10"
                      >
                        {models.map(m => (
                          <button
                            key={m.id}
                            onClick={() => { setSelectedModel(m.id); setModelOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50 transition-colors ${
                              selectedModel === m.id ? "bg-muted" : ""
                            }`}
                          >
                            <div>
                              <p className="text-xs font-semibold text-card-foreground">{m.label}</p>
                              <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                            </div>
                            {selectedModel === m.id && (
                              <Check className="h-3.5 w-3.5 text-fuchsia-500 shrink-0" />
                            )}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex items-end gap-2 bg-card border border-border rounded-2xl px-3 py-2 focus-within:border-fuchsia-400 transition-colors">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Message Zeno..."
                    disabled={loading}
                    className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent text-sm resize-none p-0 min-h-[28px]"
                  />
                  <button
                    onClick={loading ? stopGeneration : () => sendMessage()}
                    onMouseEnter={() => setSendHovered(true)}
                    onMouseLeave={() => setSendHovered(false)}
                    disabled={!loading && !input.trim()}
                    className={`h-8 w-8 rounded-xl flex items-center justify-center text-white transition-all shrink-0 ${
                      loading
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-primary hover:opacity-90 disabled:opacity-30"
                    }`}
                  >
                    {loading
                      ? sendHovered
                        ? <Square className="h-3.5 w-3.5 fill-current" />
                        : <Loader2 className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />
                    }
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  Zeno · Powered by Custom Holidays AI
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
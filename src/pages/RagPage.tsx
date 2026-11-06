import { useState, useRef, useEffect } from "react";
import { API_ROOT } from "../lib/api";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/lib/supabase";
import {
  Sparkles,
  Upload,
  Globe,
  FileText,
  Mail,
  Loader2,
  X,
  Plus,
  Bot,
  Quote,
  CheckCircle,
  AlertCircle,
  Trash2,
  RefreshCw,
  Database,
} from "lucide-react";

// ─── Config ───────────────────────────────────────────────────────────────────
const API = `${API_ROOT}/rag`;

// ─── Types ───────────────────────────────────────────────────────────────────
type Source = "email" | "pdf" | "web";

interface Citation {
  source: Source;
  title: string;
  snippet: string;
  page?: number;
}

interface RAGResult {
  answer: string;
  citations: Citation[];
}

interface IndexedDocument {
  id: string;
  filename: string;
  file_type: string;
  page_count: number;
  chunk_count: number;
  status: string;
  created_at: string;
}

interface UploadJob {
  job_id: string;
  filename: string;
  status: "processing" | "done" | "error";
  progress: string;
  error?: string;
  document_id?: string;
}

// ─── Auth helper ─────────────────────────────────────────────────────────────
async function getAuthHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return `Bearer ${token}`;
}

// ─── Markdown renderer ────────────────────────────────────────────────────────
const AnswerMarkdown = ({ content }: { content: string }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => <p className="mb-3 last:mb-0 leading-7 text-sm text-foreground">{children}</p>,
      h1: ({ children }) => <h1 className="text-lg font-serif mb-3 mt-4 text-foreground">{children}</h1>,
      h2: ({ children }) => <h2 className="text-base font-serif mb-2 mt-4 text-foreground">{children}</h2>,
      h3: ({ children }) => <h3 className="text-sm font-semibold mb-2 mt-3 text-foreground">{children}</h3>,
      ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-sm text-foreground">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm text-foreground">{children}</ol>,
      li: ({ children }) => <li className="leading-6">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      code: ({ inline, children }: any) =>
        inline ? (
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
        ) : (
          <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-xs font-mono mb-3 whitespace-pre-wrap">
            <code>{children}</code>
          </pre>
        ),
      blockquote: ({ children }) => (
        <blockquote className="border-l-4 border-accent pl-4 italic text-muted-foreground mb-3">
          {children}
        </blockquote>
      ),
    }}
  >
    {content}
  </ReactMarkdown>
);

// ─── Source metadata ──────────────────────────────────────────────────────────
const SOURCE_META: Record<Source, { label: string; icon: React.ReactNode; color: string }> = {
  email: { label: "Emails",     icon: <Mail className="h-3.5 w-3.5" />,     color: "bg-sky-50 text-sky-700 border-sky-200" },
  pdf:   { label: "Documents",  icon: <FileText className="h-3.5 w-3.5" />, color: "bg-amber-50 text-amber-700 border-amber-200" },
  web:   { label: "Web search", icon: <Globe className="h-3.5 w-3.5" />,    color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

// ─── Main component ───────────────────────────────────────────────────────────
const RagPage = () => {
  const [query, setQuery]   = useState("");
  const [notes, setNotes]   = useState("");
  const [sources, setSources] = useState<Source[]>(["pdf"]);
  const [loading, setLoading] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [result, setResult] = useState<RAGResult | null>(null);

  // Document management
  const [documents, setDocuments]   = useState<IndexedDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [showDocs, setShowDocs]     = useState(false);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleSource = (s: Source) =>
    setSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  // ── Load indexed documents ────────────────────────────────────────────────
  const loadDocuments = async () => {
    setDocsLoading(true);
    try {
      const auth = await getAuthHeader();
      const resp = await fetch(`${API}/documents`, {
        headers: { Authorization: auth },
      });
      const data = await resp.json();
      if (data.success) setDocuments(data.documents || []);
    } catch (e) {
      console.error("Failed to load documents:", e);
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => { loadDocuments(); }, []);

  // ── Poll a job until done ─────────────────────────────────────────────────
  const pollJob = async (job_id: string, filename: string) => {
    const poll = async () => {
      try {
        const auth = await getAuthHeader();
        const resp = await fetch(`${API}/status/${job_id}`, {
          headers: { Authorization: auth },
        });
        const data = await resp.json();

        setUploadJobs(prev => prev.map(j =>
          j.job_id === job_id
            ? { ...j, status: data.status, progress: data.progress || j.progress, error: data.error, document_id: data.document_id }
            : j
        ));

        if (data.status === "processing") {
          setTimeout(poll, 2000);
        } else if (data.status === "done") {
          // Refresh documents list
          loadDocuments();
          // Auto-select pdf source
          if (!sources.includes("pdf")) setSources(prev => [...prev, "pdf"]);
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    };
    poll();
  };

  // ── Upload file ───────────────────────────────────────────────────────────
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["pdf", "txt", "docx", "doc"].includes(ext || "")) {
        alert(`"${file.name}" is not a supported format. Please upload PDF, TXT, or DOCX files.`);
        continue;
      }

      const tempJobId = `temp_${Date.now()}`;
      setUploadJobs(prev => [
        { job_id: tempJobId, filename: file.name, status: "processing", progress: "Uploading..." },
        ...prev,
      ]);

      try {
        const auth = await getAuthHeader();
        const formData = new FormData();
        formData.append("file", file);

        const resp = await fetch(`${API}/upload`, {
          method: "POST",
          headers: { Authorization: auth },
          body: formData,
        });

        const data = await resp.json();

        if (!resp.ok) {
          setUploadJobs(prev => prev.map(j =>
            j.job_id === tempJobId
              ? { ...j, status: "error", error: data.detail || "Upload failed" }
              : j
          ));
          continue;
        }

        // Replace temp ID with real job_id
        setUploadJobs(prev => prev.map(j =>
          j.job_id === tempJobId
            ? { ...j, job_id: data.job_id, progress: "Extracting text..." }
            : j
        ));

        // Start polling
        pollJob(data.job_id, file.name);

      } catch (e: any) {
        setUploadJobs(prev => prev.map(j =>
          j.job_id === tempJobId
            ? { ...j, status: "error", error: e.message || "Network error" }
            : j
        ));
      }
    }
  };

  // ── Delete document ───────────────────────────────────────────────────────
  const deleteDocument = async (docId: string) => {
    try {
      const auth = await getAuthHeader();
      await fetch(`${API}/documents/${docId}`, {
        method: "DELETE",
        headers: { Authorization: auth },
      });
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  // ── Generate answer (streaming) ───────────────────────────────────────────
  const handleGenerate = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setStreamingAnswer("");

    try {
      const auth = await getAuthHeader();
      const resp = await fetch(`${API}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
        },
        body: JSON.stringify({ query: query.trim(), notes, sources }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: "Query failed" }));
        throw new Error(err.detail || "Query failed");
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAnswer = "";
      let finalCitations: Citation[] = [];

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));

            if (payload.raw_token) {
              fullAnswer += payload.raw_token;
              setStreamingAnswer(fullAnswer);
            }

            if (payload.done) {
              finalCitations = payload.citations || [];
              setResult({ answer: payload.answer || fullAnswer, citations: finalCitations });
              setStreamingAnswer("");
            }

            if (payload.error) {
              throw new Error(payload.error);
            }
          } catch (parseErr) {
            // ignore malformed lines
          }
        }
      }
    } catch (e: any) {
      setResult({
        answer: `**Error:** ${e.message || "Something went wrong. Please try again."}`,
        citations: [],
      });
    } finally {
      setLoading(false);
      setStreamingAnswer("");
    }
  };

  const handleReset = () => {
    setResult(null);
    setQuery("");
    setNotes("");
    setStreamingAnswer("");
  };

  const EXAMPLE_PROMPTS = [
    "Summarise the key points from the uploaded documents",
    "What are the main financial figures mentioned?",
    "Extract all dates and deadlines mentioned",
    "What are the terms and conditions in this document?",
  ];

  // ── Upload progress banner ────────────────────────────────────────────────
  const activeJobs = uploadJobs.filter(j => j.status === "processing");
  const recentDone = uploadJobs.filter(j => j.status === "done").slice(0, 3);
  const recentErrors = uploadJobs.filter(j => j.status === "error").slice(0, 3);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-serif text-foreground">Document Search</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload documents, then ask questions — powered by Nemotron vector search
            </p>
          </div>
          <button
            onClick={() => { setShowDocs(v => !v); if (!showDocs) loadDocuments(); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition"
          >
            <Database className="h-3.5 w-3.5" />
            {documents.length} document{documents.length !== 1 ? "s" : ""} indexed
          </button>
        </div>

        {/* Active upload jobs */}
        {(activeJobs.length > 0 || recentDone.length > 0 || recentErrors.length > 0) && (
          <div className="space-y-2">
            {activeJobs.map(job => (
              <div key={job.job_id} className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-blue-50 text-blue-700 text-sm">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span className="font-medium truncate">{job.filename}</span>
                <span className="text-blue-500 text-xs">{job.progress}</span>
              </div>
            ))}
            {recentDone.map(job => (
              <div key={job.job_id} className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-emerald-50 text-emerald-700 text-sm">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium truncate">{job.filename}</span>
                <span className="text-emerald-500 text-xs">Indexed successfully</span>
                <button onClick={() => setUploadJobs(prev => prev.filter(j => j.job_id !== job.job_id))} className="ml-auto">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {recentErrors.map(job => (
              <div key={job.job_id} className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-red-50 text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium truncate">{job.filename}</span>
                <span className="text-red-500 text-xs">{job.error}</span>
                <button onClick={() => setUploadJobs(prev => prev.filter(j => j.job_id !== job.job_id))} className="ml-auto">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Document library panel */}
        {showDocs && (
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Indexed Documents</p>
              <button onClick={loadDocuments} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
            {docsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : documents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No documents indexed yet. Upload a PDF, TXT, or DOCX below.
              </p>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-background">
                    <FileText className="h-4 w-4 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.page_count} page{doc.page_count !== 1 ? "s" : ""} · {doc.chunk_count} chunks · {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteDocument(doc.id)}
                      className="text-muted-foreground hover:text-red-500 transition p-1"
                      title="Delete document"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!result && !streamingAnswer ? (
          /* ── Query form ── */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl border bg-card shadow-card p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium text-foreground">Ask anything about your documents</span>
              </div>

              {/* Query */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground ">
                  What do you need?
                </label>
                <textarea
                  rows={4}
                  placeholder="e.g. What are the key terms in this contract? Summarise the financial data. What deadlines are mentioned?"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition resize-none"
                />
              </div>

              {/* Example prompts */}
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map(p => (
                  <button
                    key={p}
                    onClick={() => setQuery(p)}
                    className="text-xs px-3 py-1.5 rounded-full border text-muted-foreground hover:text-foreground hover:border-accent/30 hover:bg-accent/5 transition"
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Additional context */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground ">
                  Additional context <span className="normal-case text-muted-foreground/60">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Any constraints, tone, or specifics I should factor in…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition resize-none"
                />
              </div>

              {/* File upload area */}
              <div
                className="border-2 border-dashed rounded-lg px-4 py-5 flex flex-col items-center gap-2 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drop documents here to index them, or click to browse
                </p>
                <span className="text-xs text-muted-foreground/60">PDF, DOCX, TXT supported</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.txt,.docx,.doc"
                multiple
                onChange={e => handleFileUpload(e.target.files)}
              />

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={!query.trim() || loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching knowledge base…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate answer
                  </>
                )}
              </button>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <div className="rounded-xl border bg-card shadow-card p-5 space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Data sources</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    PDF documents are fully supported. Email and web retrieval coming soon.
                  </p>
                </div>

                {(["pdf", "email", "web"] as Source[]).map(s => {
                  const meta = SOURCE_META[s];
                  const active = sources.includes(s);
                  const comingSoon = s !== "pdf";
                  return (
                    <button
                      key={s}
                      onClick={() => !comingSoon && toggleSource(s)}
                      disabled={comingSoon}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg border text-sm transition ${
                        comingSoon
                          ? "opacity-40 cursor-not-allowed border-border bg-background text-muted-foreground"
                          : active
                          ? "border-accent/40 bg-accent/5 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-accent/20"
                      }`}
                    >
                      <span className={`flex items-center justify-center w-7 h-7 rounded-md border ${meta.color}`}>
                        {meta.icon}
                      </span>
                      <span className="flex-1 text-left">{meta.label}</span>
                      {comingSoon && <span className="text-[11px] text-muted-foreground/60">Soon</span>}
                      {!comingSoon && (
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition ${active ? "border-accent bg-accent" : "border-muted-foreground/40"}`}>
                          {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl border bg-card shadow-card p-5 space-y-3">
                <p className="text-sm font-medium text-foreground">How it works</p>
                {[
                  { icon: <Upload className="h-3.5 w-3.5" />,   text: "Upload PDF, DOCX, or TXT" },
                  { icon: <Database className="h-3.5 w-3.5" />, text: "Documents are chunked and embedded" },
                  { icon: <Bot className="h-3.5 w-3.5" />,      text: "Ask questions in natural language" },
                  { icon: <Sparkles className="h-3.5 w-3.5" />, text: "Nemotron retrieves and generates answers" },
                  { icon: <Quote className="h-3.5 w-3.5" />,    text: "Answers include page citations" },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span className="text-accent">{icon}</span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Result / streaming view ── */
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-serif text-foreground truncate max-w-xl">{query}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {sources.map(s => {
                    const meta = SOURCE_META[s];
                    return (
                      <span key={s} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${meta.color}`}>
                        {meta.icon}{meta.label}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition"
                >
                  <Plus className="h-3.5 w-3.5" /> New query
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Answer panel */}
              <div className="lg:col-span-3 rounded-xl border bg-card shadow-card overflow-hidden">
                <div className="px-6 py-4 border-b bg-muted/30 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-medium text-foreground">Answer</h3>
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                </div>
                <div className="px-6 py-5">
                  {streamingAnswer && !result ? (
                    <div className="text-sm leading-7 text-foreground whitespace-pre-wrap">
                      {streamingAnswer}
                      <span className="inline-block w-1.5 h-4 bg-accent/70 animate-pulse ml-0.5 align-middle" />
                    </div>
                  ) : result ? (
                    <AnswerMarkdown content={result.answer} />
                  ) : null}
                </div>
              </div>

              {/* Citations panel */}
              <div className="lg:col-span-1 space-y-2">
                <p className="text-xs font-medium text-muted-foreground px-1">
                  Sources cited
                </p>
                {loading && !result ? (
                  <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Retrieving…
                  </div>
                ) : result && result.citations.length === 0 ? (
                  <div className="rounded-xl border bg-card shadow-card p-4 text-xs text-muted-foreground">
                    No specific passages cited.
                  </div>
                ) : result ? (
                  result.citations.map((c, i) => {
                    const meta = SOURCE_META[c.source] || SOURCE_META.pdf;
                    return (
                      <div key={i} className="rounded-xl border bg-card shadow-card p-4 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className={`flex items-center justify-center w-6 h-6 rounded-md border shrink-0 ${meta.color}`}>
                            {meta.icon}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{c.title}</p>
                            {c.page && c.page > 0 && (
                              <p className="text-[11px] text-muted-foreground">Page {c.page}</p>
                            )}
                          </div>
                        </div>
                        {c.snippet && (
                          <div className="flex gap-1.5">
                            <Quote className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{c.snippet}</p>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default RagPage;

import { useState, useEffect, useRef, useCallback } from "react";
import { API_ROOT } from "../lib/api";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/lib/supabase";
import {
  Mail, Plus, Trash2, Pencil, Hotel, Activity, Car,
  Check, X, Loader2, AlertCircle, CheckCircle,
  Link2, Link2Off, Search, Star, Clock, Eye,
  Database, Zap, Users, Handshake, ArrowRight,
  RefreshCw, RotateCcw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const API_GMAIL     = `${API_ROOT}/gmail`;
const API_SUPPLIERS = `${API_ROOT}/suppliers`;
const HEARTBEAT_MS  = 5 * 60 * 1000;  // send heartbeat every 5 minutes

async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return `Bearer ${token}`;
}

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function Stars({ n }: { n: number }) {
  return <span className="flex gap-0.5">{Array.from({ length: n || 0 }).map((_, i) => <Star key={i} className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />)}</span>;
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground ">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
function Inp({ ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`w-full px-3 py-1.5 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition ${p.className || ""}`} />;
}
function Sel({ children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`w-full px-3 py-1.5 rounded-lg border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition ${p.className || ""}`}>{children}</select>;
}
function Btn({ variant = "primary", size = "md", loading, children, ...p }: {
  variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "inline-flex items-center justify-center gap-1.5 font-medium transition rounded-lg disabled:opacity-50";
  const sz = { sm: "text-xs px-2.5 py-1.5", md: "text-sm px-4 py-2" };
  const vr = {
    primary:   "bg-accent text-accent-foreground hover:bg-accent/90",
    secondary: "bg-muted text-foreground hover:bg-muted/80 border border-border",
    ghost:     "text-muted-foreground hover:text-foreground hover:bg-muted/50",
    danger:    "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
  };
  return <button {...p} disabled={p.disabled || loading} className={`${base} ${sz[size]} ${vr[variant]} ${p.className || ""}`}>{loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{children}</button>;
}

interface GmailStatus {
  connected: boolean; configured: boolean; gmail_email?: string;
  auto_polling?: boolean; is_syncing?: boolean; interval_min?: number;
  secs_since_last_sync?: number; next_sync_in_secs?: number; latest?: any;
}

export default function KnowledgeBase() {
  const [tab, setTab] = useState<"overview" | "hotels" | "activities" | "transfers">("overview");
  const navigate = useNavigate();
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <Database className="h-6 w-6 text-accent" /> Rates Library
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Supplier rates extracted automatically from Gmail</p>
          </div>
          <div className="flex items-center gap-2">
            <Btn variant="secondary" size="sm" onClick={() => navigate("/suppliers")}><Users className="h-3.5 w-3.5" /> Suppliers <ArrowRight className="h-3 w-3" /></Btn>
            <Btn variant="secondary" size="sm" onClick={() => navigate("/active-deals")}><Handshake className="h-3.5 w-3.5" /> Active Deals <ArrowRight className="h-3 w-3" /></Btn>
          </div>
        </div>
        <div className="flex gap-1 border-b border-border">
          {([
            { key: "overview",   label: "Gmail & Live Sync", icon: <Mail className="h-3.5 w-3.5" /> },
            { key: "hotels",     label: "Hotels",            icon: <Hotel className="h-3.5 w-3.5" /> },
            { key: "activities", label: "Activities",        icon: <Activity className="h-3.5 w-3.5" /> },
            { key: "transfers",  label: "Transfers",         icon: <Car className="h-3.5 w-3.5" /> },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${tab === t.key ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
        {tab === "overview"    && <OverviewPanel />}
        {tab === "hotels"      && <HotelsPanel />}
        {tab === "activities"  && <ActivitiesPanel />}
        {tab === "transfers"   && <TransfersPanel />}
      </div>
    </DashboardLayout>
  );
}

function OverviewPanel() {
  const [status, setStatus]   = useState<GmailStatus | null>(null);
  const [liveLog, setLiveLog] = useState<{ is_syncing: boolean; log: string[]; latest: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [processed, setProcessed] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [nextSyncIn, setNextSyncIn] = useState<number>(0);
  const logRef  = useRef<HTMLDivElement>(null);
  const hbRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API_GMAIL}/status`, { headers: { Authorization: auth } });
      const s = await resp.json();
      setStatus(s);
      if (s.next_sync_in_secs !== undefined) setNextSyncIn(s.next_sync_in_secs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const loadLog = useCallback(async () => {
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API_GMAIL}/live-log`, { headers: { Authorization: auth } });
      const data = await resp.json();
      setLiveLog(data);
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    } catch (e) { console.error(e); }
  }, []);

  const loadProcessed = useCallback(async () => {
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API_GMAIL}/processed`, { headers: { Authorization: auth } });
      const data = await resp.json();
      if (data.success) setProcessed(data.emails || []);
    } catch (e) { console.error(e); }
  }, []);

  const sendHeartbeat = useCallback(async () => {
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API_GMAIL}/heartbeat`, { method: "POST", headers: { Authorization: auth } });
      const data = await resp.json();
      if (data.synced) {
        setNextSyncIn(600);
        await loadLog();
        await loadProcessed();
      } else if (data.next_in_secs !== undefined) {
        setNextSyncIn(data.next_in_secs);
      }
    } catch (e) { console.error(e); }
  }, [loadLog, loadProcessed]);

  useEffect(() => {
    const init = async () => {
      await loadStatus();
      await loadLog();
      await loadProcessed();
      // Trigger immediate sync on first load if connected
      await sendHeartbeat();
    };
    init();

    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail_connected") === "1") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Heartbeat every 5 minutes — drives polling
  useEffect(() => {
    hbRef.current = setInterval(sendHeartbeat, HEARTBEAT_MS);
    return () => { if (hbRef.current) clearInterval(hbRef.current); };
  }, [sendHeartbeat]);

  // Poll log every 4 seconds
  useEffect(() => {
    pollRef.current = setInterval(loadLog, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadLog]);

  // Countdown timer for next sync
  useEffect(() => {
    cdRef.current = setInterval(() => {
      setNextSyncIn(n => Math.max(0, n - 1));
    }, 1000);
    return () => { if (cdRef.current) clearInterval(cdRef.current); };
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API_GMAIL}/oauth/url`, { headers: { Authorization: auth } });
      const data = await resp.json();
      if (data.url) window.location.href = data.url;
    } catch (e) { console.error(e); }
    finally { setConnecting(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Gmail?")) return;
    try {
      const auth = await authHeader();
      await fetch(`${API_GMAIL}/disconnect`, { method: "POST", headers: { Authorization: auth } });
      setStatus(s => s ? { ...s, connected: false, gmail_email: undefined } : s);
    } catch (e) { console.error(e); }
  };

  const handleSyncNow = async () => {
    setSyncingNow(true);
    try {
      const auth = await authHeader();
      // First check debug state
      const dbgResp = await fetch(`${API_GMAIL}/debug`, { headers: { Authorization: auth } });
      const dbg = await dbgResp.json();
      console.log("[Gmail Debug]", dbg);
      if (dbg.already_processed > 0 && !dbg.has_valid_token) {
        alert(`Gmail token issue detected. Please disconnect and reconnect Gmail.`);
        setSyncingNow(false);
        return;
      }
      // Trigger sync
      await fetch(`${API_GMAIL}/sync-now?max_emails=100`, { method: "POST", headers: { Authorization: auth } });
      setNextSyncIn(600);
      // Poll log every second for 30 seconds to catch activity
      let checks = 0;
      const interval = setInterval(async () => {
        await loadLog();
        checks++;
        if (checks >= 30) { clearInterval(interval); await loadProcessed(); setSyncingNow(false); }
      }, 1000);
    } catch (e) { console.error(e); setSyncingNow(false); }
  };

  const handleClearAll = async () => {
    if (!confirm("Clear all processed email records? The next sync will re-scan everything.")) return;
    setClearing(true);
    try {
      const auth = await authHeader();
      await fetch(`${API_GMAIL}/processed`, { method: "DELETE", headers: { Authorization: auth } });
      setProcessed([]);
      setNextSyncIn(0);
      setTimeout(sendHeartbeat, 1000);
    } catch (e) { console.error(e); }
    finally { setClearing(false); }
  };

  const handleDeleteEmail = async (messageId: string) => {
    setDeletingId(messageId);
    try {
      const auth = await authHeader();
      await fetch(`${API_GMAIL}/processed/${messageId}`, { method: "DELETE", headers: { Authorization: auth } });
      setProcessed(prev => prev.filter(e => e.gmail_message_id !== messageId));
    } catch (e) { console.error(e); }
    finally { setDeletingId(null); }
  };

  const latest   = liveLog?.latest || status?.latest || {};
  const isSyncing = liveLog?.is_syncing || status?.is_syncing;

  const fmtCountdown = (s: number) => {
    const m = Math.floor(s / 60), sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  if (loading) return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>;

  return (
    <div className="space-y-5">
      {/* Gmail connection */}
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${status?.connected ? "bg-green-100" : "bg-muted"}`}>
              <Mail className={`h-5 w-5 ${status?.connected ? "text-green-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Gmail Integration</h2>
              <p className="text-sm text-muted-foreground">
                {status?.connected ? `Connected as ${status.gmail_email}` : "Not connected"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status?.connected ? (
              <>
                {/* Sync status pill */}
                <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${isSyncing ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-green-50 text-green-600 border-green-200"}`}>
                  {isSyncing
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Syncing...</>
                    : <><span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" /> Auto-sync active</>
                  }
                </div>
                {/* Next sync countdown */}
                {!isSyncing && nextSyncIn > 0 && (
                  <span className="text-xs text-muted-foreground">Next in {fmtCountdown(nextSyncIn)}</span>
                )}
                <Btn variant="secondary" size="sm" loading={syncingNow} onClick={handleSyncNow}>
                  <Zap className="h-3.5 w-3.5" /> Sync Now
                </Btn>
                <Btn variant="ghost" size="sm" onClick={handleDisconnect}>
                  <Link2Off className="h-3.5 w-3.5" /> Disconnect
                </Btn>
              </>
            ) : (
              status?.configured
                ? <Btn loading={connecting} onClick={handleConnect}><Link2 className="h-4 w-4" /> Connect Gmail</Btn>
                : <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Add GOOGLE_CLIENT_ID to .env</span>
            )}
          </div>
        </div>

        {status?.connected && (
          <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground space-y-1.5">
            <p className="flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-accent" />Emails are automatically fetched every <strong className="text-foreground">{status.interval_min} minutes</strong> while this page is open</p>
            <p className="flex items-center gap-2"><Database className="h-3.5 w-3.5 text-accent" />Supplier rates are extracted and added to Hotels, Activities & Transfers</p>
            <p className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-accent" />New suppliers are automatically added to your <button className="text-accent underline underline-offset-2" onClick={() => window.location.href="/suppliers"}>Suppliers</button> page</p>
          </div>
        )}
      </div>

      {/* Stats */}
      {latest && Object.keys(latest).length > 0 && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Emails checked",  value: latest.fetched || 0,           cls: "text-foreground" },
            { label: "Hotels added",    value: latest.hotels_added || 0,      cls: "text-blue-600" },
            { label: "Activities",      value: latest.activities_added || 0,  cls: "text-emerald-600" },
            { label: "Transfers",       value: latest.transfers_added || 0,   cls: "text-amber-600" },
            { label: "Suppliers found", value: latest.suppliers_created || 0, cls: "text-teal-600" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border bg-card p-4 text-center">
              <p className={`text-2xl font-semibold ${s.cls}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Live log */}
      {status?.connected && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 bg-muted/30 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Live Extraction Log</span>
              {isSyncing && <span className="flex items-center gap-1 text-xs text-accent"><Loader2 className="h-3 w-3 animate-spin" /> Syncing...</span>}
            </div>
            <button onClick={loadLog} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition"><RefreshCw className="h-3 w-3" /> Refresh</button>
          </div>
          <div ref={logRef} className="bg-gray-950 p-4 max-h-56 overflow-y-auto font-mono text-xs space-y-0.5 min-h-20">
            {(liveLog?.log || []).length === 0
              ? <p className="text-gray-600">Waiting for next sync cycle... {nextSyncIn > 0 ? `(${fmtCountdown(nextSyncIn)})` : ""}</p>
              : (liveLog?.log || []).map((line, i) => (
                  <p key={i} className={
                    line.startsWith("  ✓") ? "text-green-400" :
                    line.includes("ERROR") ? "text-red-400" :
                    line.includes("⚠")    ? "text-yellow-400" :
                    line.startsWith("✓") || line.startsWith("\n✓") ? "text-cyan-400 font-semibold" :
                    "text-gray-400"
                  }>{line}</p>
                ))}
            {isSyncing && <p className="text-gray-600 animate-pulse">▌</p>}
          </div>
        </div>
      )}

      {/* Processed emails */}
      {processed.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 bg-muted/30 border-b flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Processed Emails <span className="text-muted-foreground font-normal">({processed.length})</span></p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Remove an email to re-process it on next sync</span>
              <Btn variant="danger" size="sm" loading={clearing} onClick={handleClearAll}>
                <RotateCcw className="h-3.5 w-3.5" /> Clear All & Re-scan
              </Btn>
            </div>
          </div>
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {processed.slice(0, 50).map(email => (
              <div key={email.id} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-muted/20 group">
                <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                  email.status === "processed"  ? "bg-green-50 text-green-600 border-green-200" :
                  email.status === "irrelevant" ? "bg-gray-50 text-gray-400 border-gray-200" :
                  email.status === "no_data"    ? "bg-amber-50 text-amber-600 border-amber-200" :
                  "bg-red-50 text-red-500 border-red-200"
                }`}>{email.status}</span>
                <span className="flex-1 text-muted-foreground truncate">{email.supplier_name || "Unknown"}</span>
                <span className="text-xs text-muted-foreground shrink-0">{email.extraction_type || "—"}</span>
                <span className="text-xs text-muted-foreground shrink-0">{fmtDate(email.created_at)}</span>
                <button
                  onClick={() => handleDeleteEmail(email.gmail_message_id)}
                  disabled={deletingId === email.gmail_message_id}
                  className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-red-500 p-1 rounded hover:bg-red-50"
                  title="Remove record (will re-process on next sync)"
                >
                  {deletingId === email.gmail_message_id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />
                  }
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-links */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { icon: <Users className="h-5 w-5" />, title: "Suppliers", desc: "All suppliers extracted from Gmail", path: "/suppliers", color: "text-blue-600 bg-blue-50" },
          { icon: <Handshake className="h-5 w-5" />, title: "Active Deals", desc: "Track ongoing deals with suppliers", path: "/active-deals", color: "text-emerald-600 bg-emerald-50" },
        ].map(item => (
          <button key={item.path} onClick={() => window.location.href = item.path}
            className="rounded-xl border bg-card p-5 text-left hover:border-accent/40 hover:bg-accent/5 transition group">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${item.color}`}>{item.icon}</div>
            <p className="font-medium text-foreground group-hover:text-accent transition">{item.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
            <div className="flex items-center gap-1 text-xs text-accent mt-3 opacity-0 group-hover:opacity-100 transition">
              Open <ArrowRight className="h-3 w-3" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function HotelsPanel() {
  const [hotels, setHotels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSrc, setShowSrc] = useState<string | null>(null);
  const BLANK = { supplier_name: "", hotel_name: "", destination: "", star_rating: 4, room_type: "Deluxe Room", meal_plan: "BB", price_per_night: 0, currency: "INR", valid_from: "", valid_to: "", cancellation_policy: "", source_email: "", source_date: "" };
  const [form, setForm] = useState<any>(BLANK);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try { const auth = await authHeader(); const resp = await fetch(`${API_SUPPLIERS}/hotels`, { headers: { Authorization: auth } }); const data = await resp.json(); if (data.success) setHotels(data.hotels); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = hotels.filter(h => !search || h.hotel_name?.toLowerCase().includes(search.toLowerCase()) || h.destination?.toLowerCase().includes(search.toLowerCase()) || h.supplier_name?.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async () => {
    if (!form.hotel_name || !form.destination || !form.price_per_night) return;
    setSaving(true);
    try {
      const auth = await authHeader();
      await fetch(editing ? `${API_SUPPLIERS}/hotels/${editing.id}` : `${API_SUPPLIERS}/hotels`, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json", Authorization: auth }, body: JSON.stringify(form) });
      setShowForm(false); setEditing(null); load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this hotel rate?")) return;
    try { const auth = await authHeader(); await fetch(`${API_SUPPLIERS}/hotels/${id}`, { method: "DELETE", headers: { Authorization: auth } }); setHotels(p => p.filter(h => h.id !== id)); }
    catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hotels..." className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition" /></div>
        <Btn onClick={() => { setForm(BLANK); setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Add Manually</Btn>
      </div>
      {showForm && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-medium text-foreground">{editing ? "Edit Hotel" : "Add Hotel Manually"}</h3><button onClick={() => { setShowForm(false); setEditing(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Supplier" required><Inp value={form.supplier_name} onChange={e => set("supplier_name", e.target.value)} placeholder="Emirates Travel Group" /></Field>
            <Field label="Hotel Name" required><Inp value={form.hotel_name} onChange={e => set("hotel_name", e.target.value)} placeholder="JW Marriott" /></Field>
            <Field label="Destination" required><Inp value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="Dubai" /></Field>
            <Field label="Stars"><Sel value={form.star_rating} onChange={e => set("star_rating", parseInt(e.target.value))}>{[3,4,5].map(n=><option key={n} value={n}>{n}★</option>)}</Sel></Field>
            <Field label="Room Type"><Inp value={form.room_type} onChange={e => set("room_type", e.target.value)} /></Field>
            <Field label="Meal Plan"><Sel value={form.meal_plan} onChange={e => set("meal_plan", e.target.value)}>{[["BB","Breakfast"],["MAP","Half Board"],["AP","Full Board"],["EP","Room Only"],["AI","All Inclusive"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</Sel></Field>
            <Field label="Price/Night" required><Inp type="number" value={form.price_per_night} onChange={e => set("price_per_night", parseFloat(e.target.value))} /></Field>
            <Field label="Currency"><Sel value={form.currency} onChange={e => set("currency", e.target.value)}>{["INR","USD","AED","SGD","EUR"].map(c=><option key={c}>{c}</option>)}</Sel></Field>
            <div/>
            <Field label="Valid From"><Inp type="date" value={form.valid_from} onChange={e => set("valid_from", e.target.value)} /></Field>
            <Field label="Valid To"><Inp type="date" value={form.valid_to} onChange={e => set("valid_to", e.target.value)} /></Field>
            <div/>
            <div className="col-span-3"><Field label="Cancellation Policy"><Inp value={form.cancellation_policy} onChange={e => set("cancellation_policy", e.target.value)} /></Field></div>
            <Field label="Source Email"><Inp value={form.source_email} onChange={e => set("source_email", e.target.value)} /></Field>
            <Field label="Source Date"><Inp type="date" value={form.source_date} onChange={e => set("source_date", e.target.value)} /></Field>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Btn>
            <Btn loading={saving} onClick={handleSave} disabled={!form.hotel_name || !form.destination || !form.price_per_night}><Check className="h-4 w-4" /> {editing ? "Save" : "Add"}</Btn>
          </div>
        </div>
      )}
      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>
        : filtered.length === 0 ? <div className="text-center py-12 text-muted-foreground"><Hotel className="h-8 w-8 mx-auto mb-2 opacity-20"/><p className="text-sm">{search ? "No hotels match." : "No hotel rates yet — connect Gmail to auto-extract, or add manually."}</p></div>
        : <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/30">{["Hotel","★","Destination","Room","Meal","Price/Night","Supplier","Valid To","Source",""].map(h=><th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground ">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.map(h => (
                <tr key={h.id} className="hover:bg-muted/20 transition">
                  <td className="px-3 py-2.5 font-medium text-foreground">{h.hotel_name}</td>
                  <td className="px-3 py-2.5"><Stars n={h.star_rating}/></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{h.destination}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{h.room_type}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{h.meal_plan}</td>
                  <td className="px-3 py-2.5 font-medium">{new Intl.NumberFormat("en-IN",{style:"currency",currency:h.currency||"INR",maximumFractionDigits:0}).format(h.price_per_night)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{h.supplier_name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{fmtDate(h.valid_to)}</td>
                  <td className="px-3 py-2.5 relative">
                    {h.source_email && <button onClick={()=>setShowSrc(showSrc===h.id?null:h.id)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Eye className="h-3 w-3"/>Source</button>}
                    {showSrc===h.id && <div className="absolute z-10 bottom-full mb-1 left-0 bg-popover border rounded-lg shadow-lg p-3 w-56 text-xs space-y-1"><p><span className="text-muted-foreground">From:</span> {h.source_email}</p>{h.source_date&&<p><span className="text-muted-foreground">Date:</span> {fmtDate(h.source_date)}</p>}{h.cancellation_policy&&<p><span className="text-muted-foreground">Policy:</span> {h.cancellation_policy}</p>}<button onClick={()=>setShowSrc(null)} className="absolute top-1 right-1 text-muted-foreground"><X className="h-3 w-3"/></button></div>}
                  </td>
                  <td className="px-3 py-2.5"><div className="flex gap-1"><button onClick={()=>{setForm({...h});setEditing(h);setShowForm(true);}} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"><Pencil className="h-3.5 w-3.5"/></button><button onClick={()=>handleDelete(h.id)} className="text-muted-foreground hover:text-red-500 p-1 rounded hover:bg-red-50"><Trash2 className="h-3.5 w-3.5"/></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} hotel rate{filtered.length!==1?"s":""}</p>
    </div>
  );
}

function ActivitiesPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any|null>(null);
  const [saving, setSaving] = useState(false);
  const BLANK = { supplier_name:"", activity_name:"", destination:"", description:"", duration_hours:2, price:0, currency:"INR", price_basis:"per_person", valid_from:"", valid_to:"", source_email:"", source_date:"" };
  const [form, setForm] = useState<any>(BLANK);
  const set = (k:string,v:any)=>setForm((f:any)=>({...f,[k]:v}));

  const load = useCallback(async()=>{setLoading(true);try{const auth=await authHeader();const resp=await fetch(`${API_SUPPLIERS}/activities`,{headers:{Authorization:auth}});const data=await resp.json();if(data.success)setItems(data.activities);}catch(e){console.error(e);}finally{setLoading(false);}}, []);
  useEffect(()=>{load();},[load]);
  const filtered = items.filter(a=>!search||a.activity_name?.toLowerCase().includes(search.toLowerCase())||a.destination?.toLowerCase().includes(search.toLowerCase())||a.supplier_name?.toLowerCase().includes(search.toLowerCase()));
  const handleSave=async()=>{if(!form.activity_name||!form.destination||!form.price)return;setSaving(true);try{const auth=await authHeader();await fetch(editing?`${API_SUPPLIERS}/activities/${editing.id}`:`${API_SUPPLIERS}/activities`,{method:editing?"PUT":"POST",headers:{"Content-Type":"application/json",Authorization:auth},body:JSON.stringify(form)});setShowForm(false);setEditing(null);load();}catch(e){console.error(e);}finally{setSaving(false);}};
  const handleDelete=async(id:string)=>{if(!confirm("Delete?"))return;try{const auth=await authHeader();await fetch(`${API_SUPPLIERS}/activities/${id}`,{method:"DELETE",headers:{Authorization:auth}});setItems(p=>p.filter(a=>a.id!==id));}catch(e){console.error(e);}};

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search activities..." className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"/></div><Btn onClick={()=>{setForm(BLANK);setEditing(null);setShowForm(true);}}><Plus className="h-4 w-4"/>Add Manually</Btn></div>
      {showForm&&<div className="rounded-xl border bg-card p-5 space-y-4"><div className="flex items-center justify-between"><h3 className="font-medium">{editing?"Edit Activity":"Add Activity Manually"}</h3><button onClick={()=>{setShowForm(false);setEditing(null);}} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4"/></button></div><div className="grid grid-cols-3 gap-3"><Field label="Supplier" required><Inp value={form.supplier_name} onChange={e=>set("supplier_name",e.target.value)} placeholder="Gulf Holidays DMC"/></Field><Field label="Activity" required><Inp value={form.activity_name} onChange={e=>set("activity_name",e.target.value)} placeholder="Desert Safari"/></Field><Field label="Destination" required><Inp value={form.destination} onChange={e=>set("destination",e.target.value)} placeholder="Dubai"/></Field><div className="col-span-3"><Field label="Description"><Inp value={form.description} onChange={e=>set("description",e.target.value)}/></Field></div><Field label="Duration (hrs)"><Inp type="number" step="0.5" value={form.duration_hours} onChange={e=>set("duration_hours",parseFloat(e.target.value))}/></Field><Field label="Price" required><Inp type="number" value={form.price} onChange={e=>set("price",parseFloat(e.target.value))}/></Field><Field label="Basis"><Sel value={form.price_basis} onChange={e=>set("price_basis",e.target.value)}><option value="per_person">Per Person</option><option value="per_group">Per Group</option></Sel></Field><Field label="Currency"><Sel value={form.currency} onChange={e=>set("currency",e.target.value)}>{["INR","USD","AED","SGD","EUR"].map(c=><option key={c}>{c}</option>)}</Sel></Field><Field label="Valid From"><Inp type="date" value={form.valid_from} onChange={e=>set("valid_from",e.target.value)}/></Field><Field label="Valid To"><Inp type="date" value={form.valid_to} onChange={e=>set("valid_to",e.target.value)}/></Field><Field label="Source Email"><Inp value={form.source_email} onChange={e=>set("source_email",e.target.value)}/></Field><Field label="Source Date"><Inp type="date" value={form.source_date} onChange={e=>set("source_date",e.target.value)}/></Field></div><div className="flex gap-2 justify-end"><Btn variant="secondary" onClick={()=>{setShowForm(false);setEditing(null);}}>Cancel</Btn><Btn loading={saving} onClick={handleSave} disabled={!form.activity_name||!form.destination||!form.price}><Check className="h-4 w-4"/>{editing?"Save":"Add"}</Btn></div></div>}
      <div className="rounded-xl border bg-card overflow-hidden">
        {loading?<div className="flex items-center justify-center py-12 gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading...</div>:filtered.length===0?<div className="text-center py-12 text-muted-foreground"><Activity className="h-8 w-8 mx-auto mb-2 opacity-20"/><p className="text-sm">No activities yet.</p></div>:<table className="w-full text-sm"><thead><tr className="border-b bg-muted/30">{["Activity","Destination","Duration","Price","Basis","Supplier","Valid To",""].map(h=><th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground ">{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{filtered.map(a=><tr key={a.id} className="hover:bg-muted/20 transition"><td className="px-3 py-2.5"><p className="font-medium text-foreground">{a.activity_name}</p>{a.description&&<p className="text-xs text-muted-foreground truncate max-w-40">{a.description}</p>}</td><td className="px-3 py-2.5 text-muted-foreground">{a.destination}</td><td className="px-3 py-2.5 text-muted-foreground"><span className="flex items-center gap-1"><Clock className="h-3 w-3"/>{a.duration_hours}h</span></td><td className="px-3 py-2.5 font-medium">{new Intl.NumberFormat("en-IN",{style:"currency",currency:a.currency||"INR",maximumFractionDigits:0}).format(a.price)}</td><td className="px-3 py-2.5 text-muted-foreground text-xs">{a.price_basis?.replace("per_","")}</td><td className="px-3 py-2.5 text-muted-foreground text-xs">{a.supplier_name}</td><td className="px-3 py-2.5 text-muted-foreground text-xs">{fmtDate(a.valid_to)}</td><td className="px-3 py-2.5"><div className="flex gap-1"><button onClick={()=>{setForm({...a});setEditing(a);setShowForm(true);}} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"><Pencil className="h-3.5 w-3.5"/></button><button onClick={()=>handleDelete(a.id)} className="text-muted-foreground hover:text-red-500 p-1 rounded hover:bg-red-50"><Trash2 className="h-3.5 w-3.5"/></button></div></td></tr>)}</tbody></table>}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} activit{filtered.length!==1?"ies":"y"}</p>
    </div>
  );
}

function TransfersPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any|null>(null);
  const [saving, setSaving] = useState(false);
  const BLANK = { supplier_name:"", transfer_type:"Airport-Hotel", destination:"", route:"", vehicle_type:"Sedan", price:0, currency:"INR", price_basis:"per_vehicle", valid_from:"", valid_to:"", source_email:"", source_date:"" };
  const [form, setForm] = useState<any>(BLANK);
  const set = (k:string,v:any)=>setForm((f:any)=>({...f,[k]:v}));

  const load = useCallback(async()=>{setLoading(true);try{const auth=await authHeader();const resp=await fetch(`${API_SUPPLIERS}/transfers`,{headers:{Authorization:auth}});const data=await resp.json();if(data.success)setItems(data.transfers);}catch(e){console.error(e);}finally{setLoading(false);}}, []);
  useEffect(()=>{load();},[load]);
  const filtered = items.filter(t=>!search||t.transfer_type?.toLowerCase().includes(search.toLowerCase())||t.destination?.toLowerCase().includes(search.toLowerCase())||t.supplier_name?.toLowerCase().includes(search.toLowerCase()));
  const handleSave=async()=>{if(!form.transfer_type||!form.destination||!form.price)return;setSaving(true);try{const auth=await authHeader();await fetch(editing?`${API_SUPPLIERS}/transfers/${editing.id}`:`${API_SUPPLIERS}/transfers`,{method:editing?"PUT":"POST",headers:{"Content-Type":"application/json",Authorization:auth},body:JSON.stringify(form)});setShowForm(false);setEditing(null);load();}catch(e){console.error(e);}finally{setSaving(false);}};
  const handleDelete=async(id:string)=>{if(!confirm("Delete?"))return;try{const auth=await authHeader();await fetch(`${API_SUPPLIERS}/transfers/${id}`,{method:"DELETE",headers:{Authorization:auth}});setItems(p=>p.filter(t=>t.id!==id));}catch(e){console.error(e);}};

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search transfers..." className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"/></div><Btn onClick={()=>{setForm(BLANK);setEditing(null);setShowForm(true);}}><Plus className="h-4 w-4"/>Add Manually</Btn></div>
      {showForm&&<div className="rounded-xl border bg-card p-5 space-y-4"><div className="flex items-center justify-between"><h3 className="font-medium">{editing?"Edit Transfer":"Add Transfer Manually"}</h3><button onClick={()=>{setShowForm(false);setEditing(null);}} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4"/></button></div><div className="grid grid-cols-3 gap-3"><Field label="Supplier" required><Inp value={form.supplier_name} onChange={e=>set("supplier_name",e.target.value)}/></Field><Field label="Type" required><Sel value={form.transfer_type} onChange={e=>set("transfer_type",e.target.value)}>{["Airport-Hotel","Hotel-Airport","Hotel-Hotel","Sightseeing","Point to Point"].map(t=><option key={t}>{t}</option>)}</Sel></Field><Field label="Destination" required><Inp value={form.destination} onChange={e=>set("destination",e.target.value)}/></Field><div className="col-span-2"><Field label="Route"><Inp value={form.route} onChange={e=>set("route",e.target.value)}/></Field></div><Field label="Vehicle"><Inp value={form.vehicle_type} onChange={e=>set("vehicle_type",e.target.value)}/></Field><Field label="Price" required><Inp type="number" value={form.price} onChange={e=>set("price",parseFloat(e.target.value))}/></Field><Field label="Currency"><Sel value={form.currency} onChange={e=>set("currency",e.target.value)}>{["INR","USD","AED","SGD","EUR"].map(c=><option key={c}>{c}</option>)}</Sel></Field><Field label="Basis"><Sel value={form.price_basis} onChange={e=>set("price_basis",e.target.value)}><option value="per_vehicle">Per Vehicle</option><option value="per_person">Per Person</option></Sel></Field><Field label="Valid From"><Inp type="date" value={form.valid_from} onChange={e=>set("valid_from",e.target.value)}/></Field><Field label="Valid To"><Inp type="date" value={form.valid_to} onChange={e=>set("valid_to",e.target.value)}/></Field><Field label="Source Email"><Inp value={form.source_email} onChange={e=>set("source_email",e.target.value)}/></Field><Field label="Source Date"><Inp type="date" value={form.source_date} onChange={e=>set("source_date",e.target.value)}/></Field></div><div className="flex gap-2 justify-end"><Btn variant="secondary" onClick={()=>{setShowForm(false);setEditing(null);}}>Cancel</Btn><Btn loading={saving} onClick={handleSave} disabled={!form.transfer_type||!form.destination||!form.price}><Check className="h-4 w-4"/>{editing?"Save":"Add"}</Btn></div></div>}
      <div className="rounded-xl border bg-card overflow-hidden">
        {loading?<div className="flex items-center justify-center py-12 gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading...</div>:filtered.length===0?<div className="text-center py-12 text-muted-foreground"><Car className="h-8 w-8 mx-auto mb-2 opacity-20"/><p className="text-sm">No transfers yet.</p></div>:<table className="w-full text-sm"><thead><tr className="border-b bg-muted/30">{["Type","Route","Vehicle","Price","Destination","Supplier","Valid To",""].map(h=><th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground ">{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{filtered.map(t=><tr key={t.id} className="hover:bg-muted/20 transition"><td className="px-3 py-2.5 font-medium text-foreground">{t.transfer_type}</td><td className="px-3 py-2.5 text-muted-foreground text-xs max-w-44 truncate">{t.route||"—"}</td><td className="px-3 py-2.5 text-muted-foreground">{t.vehicle_type}</td><td className="px-3 py-2.5 font-medium">{new Intl.NumberFormat("en-IN",{style:"currency",currency:t.currency||"INR",maximumFractionDigits:0}).format(t.price)}<span className="text-xs font-normal text-muted-foreground">/{t.price_basis?.replace("per_","")}</span></td><td className="px-3 py-2.5 text-muted-foreground">{t.destination}</td><td className="px-3 py-2.5 text-muted-foreground text-xs">{t.supplier_name}</td><td className="px-3 py-2.5 text-muted-foreground text-xs">{fmtDate(t.valid_to)}</td><td className="px-3 py-2.5"><div className="flex gap-1"><button onClick={()=>{setForm({...t});setEditing(t);setShowForm(true);}} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"><Pencil className="h-3.5 w-3.5"/></button><button onClick={()=>handleDelete(t.id)} className="text-muted-foreground hover:text-red-500 p-1 rounded hover:bg-red-50"><Trash2 className="h-3.5 w-3.5"/></button></div></td></tr>)}</tbody></table>}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} transfer{filtered.length!==1?"s":""}</p>
    </div>
  );
}

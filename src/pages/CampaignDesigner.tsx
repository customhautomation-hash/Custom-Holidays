import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Mail, MessageSquare, TrendingUp, Users, CheckCircle2,
  X, Phone, Calendar, ChevronRight, Zap, Target, ArrowRight, Search,
  Check, MapPin, Wallet, FileText, Send, Loader2, ChevronDown, ChevronUp,
  Trash2, Upload, ScanLine, Camera, Pencil, Edit3,
  ListChecks, UserPlus, Truck, Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef } from "react";

// ─── Supabase ────────────────────────────────────────────────────────────────
const SUPABASE_URL      = "https://igytkxcarfezhqgojaan.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlneXRreGNhcmZlemhxZ29qYWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3OTQxMTcsImV4cCI6MjA4ODM3MDExN30.MJ32ci1PNhyiXyTsBbk4QbVqhCqZRFKBq28sfZtqVp4";
const OCR_API_KEY       = import.meta.env.VITE_OCR_API_KEY as string;

const supabase_headers = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "Prefer": "return=representation",
};
const H = supabase_headers;
const sb = {
  get:  (t: string, q = "") => fetch(`${SUPABASE_URL}/rest/v1/${t}?${q}`, { headers: H }).then(r => r.json()),
  post: (t: string, b: any) => fetch(`${SUPABASE_URL}/rest/v1/${t}`, { method: "POST", headers: H, body: JSON.stringify(b) }).then(r => r.json()),
  del:  (t: string, id: string) => fetch(`${SUPABASE_URL}/rest/v1/${t}?id=eq.${id}`, { method: "DELETE", headers: H }),
};

// ─── Leads helpers ────────────────────────────────────────────────────────────
const stageStyle: Record<string, string> = {
  New:       "bg-blue-50 text-blue-500 border border-blue-200",
  Contacted: "bg-orange-50 text-orange-500 border border-orange-200",
  Qualified: "bg-yellow-50 text-yellow-600 border border-yellow-200",
  Proposal:  "bg-teal-50 text-teal-500 border border-teal-200",
  Booked:    "bg-green-50 text-green-600 border border-green-200",
};

interface LeadFull {
  id?: string; name: string; email: string; phone: string; source: string;
  stage: string; destination: string; budget: string; last_contact: string | null;
  whatsapp_sent?: boolean; emails_sent?: number; calls_scheduled?: number;
  company?: string | null; designation?: string | null; website?: string | null; notes?: string | null;
}
const EMPTY_LEAD = { name: "", email: "", phone: "", source: "Manual", destination: "", budget: "", company: "", designation: "", website: "", notes: "", stage: "New" };

// ─── Supplier type (from Supabase) ────────────────────────────────────────────
interface Supplier {
  id: string; name: string; designation: string; company_name: string;
  place: string; country: string; phone: string; email: string;
  supplier_type: string; supplier_category: string;
}

const TYPE_COLORS: Record<string, string> = {
  "Manufacturer":       "bg-blue-50 text-blue-700 border-blue-200",
  "Distributor":        "bg-teal-50 text-teal-700 border-teal-200",
  "Logistics / Transport": "bg-amber-50 text-amber-700 border-amber-200",
  "Service Provider":   "bg-teal-50 text-teal-700 border-teal-200",
  "Consultant / Agency": "bg-pink-50 text-pink-700 border-pink-200",
  "Retailer":           "bg-lime-50 text-lime-700 border-lime-200",
  "Other":              "bg-gray-50 text-gray-600 border-gray-200",
};

async function fetchAllSuppliers(): Promise<Supplier[]> {
  try {
    const res  = await fetch(`${SUPABASE_URL}/rest/v1/suppliers?select=*&order=created_at.desc`, { headers: supabase_headers });
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("fetchAllSuppliers:", e);
    return [];
  }
}

// ─── OCR helpers (unchanged) ─────────────────────────────────────────────────
function parseCardText(text: string) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const full  = text;
  const emailMatch = full.match(/[\w.+\-]+@[\w\-]+\.[a-z]{2,}/i);
  const email = emailMatch ? emailMatch[0] : "";
  const phoneMatch = full.match(/(\+?\d[\d\s\-().]{7,17}\d)/);
  const phone = phoneMatch ? phoneMatch[0].trim() : "";
  const webMatch = full.match(/((?:https?:\/\/)?(?:www\.)?[\w\-]+\.(?:com|in|co|net|org|io)(?:\/[\w\-./?%&=]*)?)/i);
  const website = webMatch ? webMatch[0] : "";
  let name = "";
  for (const line of lines.slice(0, 5)) {
    if (line.includes("@") || /^\+?\d/.test(line) || /www\.|\.(com|in)/.test(line)) continue;
    if (/^[A-Za-z\s.'-]{3,40}$/.test(line)) { name = line; break; }
  }
  const desigRx = /\b(ceo|cto|coo|founder|co-founder|director|manager|executive|consultant|partner|president|head|lead|associate|agent|advisor|analyst|engineer|developer|designer|sales|marketing|hr|account|procurement|purchasing|operations|officer)\b/i;
  let designation = "";
  for (const line of lines) { if (desigRx.test(line) && line.length < 60) { designation = line; break; } }
  const compRx = /\b(pvt|ltd|llp|inc|corp|group|agency|solutions|services|enterprises|company|industries|systems|technologies|\.co)\b/i;
  let company = "";
  for (const line of lines) { if (compRx.test(line) && line.length < 80) { company = line; break; } }
  if (!company) { for (const line of lines.slice(1, 4)) { if (line !== name && !line.includes("@") && !/^\+?\d/.test(line) && line.length > 3) { company = line; break; } } }
  return { name, email, phone, company, designation, website, destination: "", budget: "" };
}
async function scanCardWithOCR(base64: string, mimeType: string) {
  const byteChars = atob(base64); const byteArr = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArr], { type: mimeType }); const formData = new FormData();
  formData.append("file", blob, "card.jpg"); formData.append("apikey", OCR_API_KEY);
  formData.append("language", "eng"); formData.append("isOverlayRequired", "false");
  formData.append("detectOrientation", "true"); formData.append("scale", "true"); formData.append("OCREngine", "2");
  const response = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: formData });
  if (!response.ok) throw new Error("OCR service unreachable");
  const data = await response.json();
  if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage?.[0] || "OCR processing failed");
  const rawText = data?.ParsedResults?.[0]?.ParsedText || "";
  if (!rawText.trim()) throw new Error("No text found in image. Try a clearer photo.");
  return parseCardText(rawText);
}

// ─── Campaign types ───────────────────────────────────────────────────────────
interface Seq  { id?: string; day_number: number; channel: "email"|"whatsapp"|"call"; subject: string; message: string; send_time: string; sequence_order: number; }
interface Tmpl { id: string; name: string; industry: string; description: string; channels: string[]; conversion_rate: string; sequences: any[]; }
interface Camp { id: string; name: string; description: string; status: string; destination: string; target_audience: string; budget: string; start_date: string; end_date: string; channels: string[]; total_leads: number; }

const CH = {
  email:    { icon: Mail,          color: "bg-amber-500", light: "bg-amber-50 text-amber-600 border-amber-200",  label: "Email"    },
  whatsapp: { icon: MessageSquare, color: "bg-green-500", light: "bg-green-50 text-green-600 border-green-200",  label: "WhatsApp" },
  call:     { icon: Phone,         color: "bg-blue-500",  light: "bg-blue-50 text-blue-600 border-blue-200",     label: "Call"     },
};
const ST: Record<string, { color: string; dot: string }> = {
  Active:    { color: "bg-green-100 text-green-700",   dot: "bg-green-500"  },
  Paused:    { color: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-500" },
  Draft:     { color: "bg-slate-100 text-slate-600",   dot: "bg-slate-400"  },
  Completed: { color: "bg-blue-100 text-blue-700",     dot: "bg-blue-500"   },
};
const fade = (d = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.38, delay: d } });
const EMPTY_SEQ = (): Seq => ({ day_number: 0, channel: "email", subject: "", message: "", send_time: "09:00", sequence_order: 0 });
const DEFAULT_STEPS = [
  { label: "Email 1",   day: "Day 0",  color: "bg-amber-500", ch: "email"    as const },
  { label: "WhatsApp",  day: "Day 3",  color: "bg-green-500", ch: "whatsapp" as const },
  { label: "Email 2",   day: "Day 7",  color: "bg-amber-500", ch: "email"    as const },
  { label: "Follow-up", day: "Day 10", color: "bg-blue-500",  ch: "call"     as const },
];

/* ── Campaign mode type ── */
type CampaignMode = "leads" | "suppliers";

// ─── Component ────────────────────────────────────────────────────────────────
export default function CampaignDesigner() {

  /* ── Campaign mode selector ── */
  const [mode, setMode] = useState<CampaignMode | null>(null);

  /* ── Campaign state ── */
  const [campaigns,   setCampaigns]   = useState<Camp[]>([]);
  const [templates,   setTemplates]   = useState<Tmpl[]>([]);
  const [campLoading, setCampLoading] = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [showModal,   setShowModal]   = useState(false);
  const [step,        setStep]        = useState<1|2|3>(1);
  const [draftTab,    setDraftTab]    = useState<"whatsapp"|"email"|"call">("whatsapp");
  const [expanded,    setExpanded]    = useState<string|null>(null);
  const [campSeqs,    setCampSeqs]    = useState<Record<string, Seq[]>>({});
  const [expandedSeq, setExpandedSeq] = useState<number|null>(null);
  const [activeTmpl,  setActiveTmpl]  = useState<Tmpl|null>(null);
  const [form, setForm] = useState({ name: "", description: "", destination: "", target_audience: "", budget: "", start_date: "", end_date: "", channels: [] as string[], status: "Draft" });
  const [drafts, setDrafts] = useState({ whatsapp: "", email_subject: "", email_body: "", call_notes: "" });
  const [selLeads,    setSelLeads]    = useState<string[]>([]);
  const [selSuppliers,setSelSuppliers]= useState<string[]>([]);
  const [leadSearch,  setLeadSearch]  = useState("");
  const [suppSearch,  setSuppSearch]  = useState("");
  const [sequences,   setSequences]   = useState<Seq[]>([]);

  /* ── Leads state ── */
  const [leads,         setLeads]         = useState<LeadFull[]>([]);
  const [leadsLoading,  setLeadsLoading]  = useState(true);
  const [leadStats,     setLeadStats]     = useState({ total_leads: 0, whatsapp_sent: 0, emails_sent: 0, calls_scheduled: 0 });
  const [search,        setSearch]        = useState("");
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [addingLead,    setAddingLead]    = useState(false);
  const [importing,     setImporting]     = useState(false);
  const [scanning,      setScanning]      = useState(false);
  const [scanError,     setScanError]     = useState<string | null>(null);
  const [scannedPreview,setScannedPreview]= useState<string | null>(null);
  const [scanSuccess,   setScanSuccess]   = useState(false);
  const [newLead,       setNewLead]       = useState({ ...EMPTY_LEAD });
  const [isEditing,     setIsEditing]     = useState(false);
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [openMenu,      setOpenMenu]      = useState<string | null>(null);
  const [menuPos,       setMenuPos]       = useState<{ top: number; left: number } | null>(null);

  /* ── Suppliers state ── */
  const [suppliers,     setSuppliers]     = useState<Supplier[]>([]);
  const [suppLoading,   setSuppLoading]   = useState(false);

  const csvRef    = useRef<HTMLInputElement>(null);
  const cardRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const menuRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCampaigns();
    fetchLeads();
  }, []);

  /* Load suppliers when mode = suppliers */
  useEffect(() => {
    if (mode === "suppliers" && suppliers.length === 0) {
      setSuppLoading(true);
      fetchAllSuppliers().then(s => { setSuppliers(s); setSuppLoading(false); });
    }
  }, [mode]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadCampaigns = async () => {
    setCampLoading(true);
    const [c, t] = await Promise.all([
      sb.get("campaigns", "select=*&order=created_at.desc"),
      sb.get("campaign_templates", "select=*"),
    ]);
    if (Array.isArray(c)) setCampaigns(c);
    if (Array.isArray(t)) setTemplates(t);
    setCampLoading(false);
  };
  const loadSeqs = async (id: string) => {
    if (campSeqs[id]) return;
    const s = await sb.get("campaign_sequences", `campaign_id=eq.${id}&order=sequence_order.asc`);
    if (Array.isArray(s)) setCampSeqs(p => ({ ...p, [id]: s }));
  };
  const fetchLeads = async () => {
    setLeadsLoading(true);
    try {
      const res  = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=*&order=created_at.desc`, { headers: supabase_headers });
      const data = await res.json();
      if (Array.isArray(data)) {
        setLeads(data);
        setLeadStats({ total_leads: data.length, whatsapp_sent: data.filter((l: LeadFull) => l.whatsapp_sent).length, emails_sent: data.reduce((s: number, l: LeadFull) => s + (l.emails_sent || 0), 0), calls_scheduled: data.reduce((s: number, l: LeadFull) => s + (l.calls_scheduled || 0), 0) });
      }
    } catch (e) { console.error("fetchLeads:", e); }
    finally     { setLeadsLoading(false); }
  };

  const handleCardScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please select an image file."); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string; const base64 = dataUrl.split(",")[1]; const mimeType = file.type as any;
      setScannedPreview(dataUrl); setScanning(true); setScanError(null); setScanSuccess(false); setShowScanModal(false);
      try {
        const extracted = await scanCardWithOCR(base64, mimeType);
        setNewLead(prev => ({ ...prev, name: extracted.name || prev.name, email: extracted.email || prev.email, phone: extracted.phone || prev.phone, company: extracted.company || prev.company, designation: extracted.designation || prev.designation, website: extracted.website || prev.website, source: "Business Card" }));
        setScanSuccess(true);
      } catch (err: any) { setScanError(err.message || "Scan failed"); }
      finally { setScanning(false); setShowAddModal(true); if (cardRef.current) cardRef.current.value = ""; if (cameraRef.current) cameraRef.current.value = ""; }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveLead = async () => {
    if (!newLead.name.trim()) { alert("Name is required."); return; }
    setAddingLead(true);
    try {
      const payload = { name: newLead.name.trim(), email: newLead.email.trim(), phone: newLead.phone.trim(), source: newLead.source, destination: newLead.destination.trim(), budget: newLead.budget.trim(), company: newLead.company?.trim() || null, designation: newLead.designation?.trim() || null, website: newLead.website?.trim() || null, notes: newLead.notes?.trim() || null, stage: (newLead as any).stage || "New" };
      if (isEditing && editingId) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${editingId}`, { method: "PATCH", headers: supabase_headers, body: JSON.stringify(payload) });
        if (!res.ok) { alert("Update failed."); return; }
      } else {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, { method: "POST", headers: supabase_headers, body: JSON.stringify({ ...payload, stage: "New", follow_up_count: 0, whatsapp_sent: false, emails_sent: 0, calls_scheduled: 0, created_at: new Date().toISOString() }) });
        if (!res.ok) { alert("Failed to save."); return; }
      }
      closeAddModal(); fetchLeads();
    } catch (e) { console.error("Save error:", e); }
    finally     { setAddingLead(false); }
  };

  const handleEdit = (lead: LeadFull) => {
    setIsEditing(true); setEditingId(lead.id || null);
    setNewLead({ name: lead.name || "", email: lead.email || "", phone: lead.phone || "", source: lead.source || "Manual", destination: lead.destination || "", budget: lead.budget || "", company: lead.company || "", designation: lead.designation || "", website: lead.website || "", notes: lead.notes || "", stage: lead.stage || "New" });
    setScanError(null); setScanSuccess(false); setScannedPreview(null); setOpenMenu(null); setShowAddModal(true);
  };
  const handleDelete = async (lead: LeadFull) => {
    if (!confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return;
    setOpenMenu(null);
    await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${lead.id}`, { method: "DELETE", headers: supabase_headers });
    fetchLeads();
  };
  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setImporting(true);
    try {
      const text = await file.text(); const lines = text.split("\n").filter(l => l.trim());
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/ /g, "_")); const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(",").map(v => v.trim()); if (vals.length < 2) continue;
        const row: any = {}; headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
        row.stage = row.stage || "New"; row.source = row.source || "CSV Import"; row.follow_up_count = 0; row.whatsapp_sent = false; row.emails_sent = 0; row.calls_scheduled = 0; row.created_at = new Date().toISOString(); rows.push(row);
      }
      if (!rows.length) { alert("No valid rows found."); return; }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, { method: "POST", headers: supabase_headers, body: JSON.stringify(rows) });
      if (res.ok) { alert(`${rows.length} leads imported`); fetchLeads(); } else { alert("Import failed."); }
    } catch (e) { console.error("CSV error:", e); }
    finally { setImporting(false); if (csvRef.current) csvRef.current.value = ""; }
  };

  const closeAddModal = () => { setShowAddModal(false); setIsEditing(false); setEditingId(null); setScanSuccess(false); setScanError(null); setScannedPreview(null); setNewLead({ ...EMPTY_LEAD }); };
  const filtered = leads.filter(l => l.name?.toLowerCase().includes(search.toLowerCase()) || l.destination?.toLowerCase().includes(search.toLowerCase()));

  const toggleCh = (ch: string) => setForm(p => ({ ...p, channels: p.channels.includes(ch) ? p.channels.filter(c => c !== ch) : [...p.channels, ch] }));
  const applyTmpl = (t: Tmpl) => {
    setActiveTmpl(t);
    const steps = (t.sequences || []).map((s: any, i: number) => ({ day_number: s.day ?? s.day_number ?? 0, channel: s.channel as any, subject: s.subject || "", message: s.message || "", send_time: "09:00", sequence_order: i }));
    setSequences(steps); setForm(p => ({ ...p, channels: [...new Set(steps.map(s => s.channel))] as string[] }));
    const wa = steps.find(s => s.channel === "whatsapp"); const em = steps.find(s => s.channel === "email"); const cl = steps.find(s => s.channel === "call");
    setDrafts({ whatsapp: wa?.message || "", email_subject: em?.subject || "", email_body: em?.message || "", call_notes: cl?.message || "" });
  };
  const addStep = () => { const last = sequences.length > 0 ? sequences[sequences.length - 1].day_number : -1; setSequences(p => [...p, { ...EMPTY_SEQ(), day_number: last + 1, sequence_order: p.length }]); setExpandedSeq(sequences.length); };
  const updStep = (i: number, k: string, v: any) => setSequences(p => p.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  const saveCampaign = async () => {
    if (!form.name.trim()) { alert("Campaign name required."); return; } setSaving(true);
    try {
      const res  = await sb.post("campaigns", { ...form, total_leads: mode === "leads" ? selLeads.length : selSuppliers.length, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      const camp = Array.isArray(res) ? res[0] : res; if (!camp?.id) throw new Error("Save failed");
      if (mode === "leads" && selLeads.length) await sb.post("campaign_leads", selLeads.map(lid => ({ campaign_id: camp.id, lead_id: lid })));
      if (mode === "suppliers" && selSuppliers.length) await sb.post("campaign_suppliers", selSuppliers.map(sid => ({ campaign_id: camp.id, supplier_id: sid })));
      if (sequences.length) await sb.post("campaign_sequences", sequences.map((s, i) => ({ ...s, campaign_id: camp.id, sequence_order: i })));
      setShowModal(false); resetCampaign(); loadCampaigns();
    } catch (e: any) { alert("Error: " + e.message); }
    finally { setSaving(false); }
  };
  const resetCampaign = () => {
    setForm({ name: "", description: "", destination: "", target_audience: "", budget: "", start_date: "", end_date: "", channels: [], status: "Draft" });
    setDrafts({ whatsapp: "", email_subject: "", email_body: "", call_notes: "" });
    setSelLeads([]); setSelSuppliers([]); setSequences([]); setStep(1); setActiveTmpl(null); setExpandedSeq(null); setDraftTab("whatsapp"); setLeadSearch(""); setSuppSearch("");
  };
  const delCamp = async (id: string) => { if (!confirm("Delete campaign?")) return; await sb.del("campaigns", id); setCampaigns(p => p.filter(c => c.id !== id)); };
  const toggleExpand = async (id: string) => { if (expanded === id) { setExpanded(null); return; } setExpanded(id); await loadSeqs(id); };
  const campStats = { active: campaigns.filter(c => c.status === "Active").length, leads: campaigns.reduce((s, c) => s + (c.total_leads || 0), 0) };

  const filteredSuppliers = suppliers.filter(s =>
    s.name?.toLowerCase().includes(suppSearch.toLowerCase()) ||
    s.company_name?.toLowerCase().includes(suppSearch.toLowerCase()) ||
    s.supplier_type?.toLowerCase().includes(suppSearch.toLowerCase())
  );

  /* ══════════════════════════════════════════════════════════════════════════
     MODE SELECTOR — shown when mode is null
  ══════════════════════════════════════════════════════════════════════════ */
  if (mode === null) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-serif text-foreground">Campaign Designer</h1>
            <p className="text-sm text-muted-foreground mt-1">Choose who you want to run a campaign for</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto mt-16">
            {/* Leads Campaign Card */}
            <motion.button
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}
              onClick={() => setMode("leads")}
              className="group relative rounded-2xl border-2 border-border hover:border-emerald-400 bg-card p-8 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-1">
              <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center mb-5 shadow-md transition-transform">
                <Users className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-xl font-serif text-card-foreground mb-2">Campaign for Leads</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Run outreach campaigns targeting your leads — send emails, WhatsApp messages, and schedule follow-up calls.
              </p>
              <div className="flex flex-wrap gap-2 mt-5">
                {["Email", "WhatsApp", "Calls", "Follow-ups"].map(t => (
                  <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">{t}</span>
                ))}
              </div>
              <div className="flex items-center justify-between mt-6 pt-5 border-t border-border">
                <span className="text-sm font-medium text-emerald-600">{leadsLoading ? "—" : leads.length} leads available</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
              </div>
            </motion.button>

            {/* Suppliers Campaign Card */}
            <motion.button
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.12 }}
              onClick={() => setMode("suppliers")}
              className="group relative rounded-2xl border-2 border-border hover:border-blue-400 bg-card p-8 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-1">
              <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center mb-5 shadow-md transition-transform">
                <Truck className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-xl font-serif text-card-foreground mb-2">Campaign for Suppliers</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Reach out to your vendors and suppliers — coordinate, negotiate, and build relationships.
              </p>
              <div className="flex flex-wrap gap-2 mt-5">
                {["Vendors", "Logistics", "Manufacturers", "Service Providers"].map(t => (
                  <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">{t}</span>
                ))}
              </div>
              <div className="flex items-center justify-between mt-6 pt-5 border-t border-border">
                <span className="text-sm font-medium text-blue-600">{suppLoading ? "—" : suppliers.length} suppliers available</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
              </div>
            </motion.button>
          </div>

          {/* Recent campaigns preview */}
          {!campLoading && campaigns.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="mt-12 max-w-3xl mx-auto">
              <p className="text-xs font-semibold text-muted-foreground mb-3">Recent Campaigns</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {campaigns.slice(0, 3).map(c => {
                  const st = ST[c.status] || ST.Draft;
                  return (
                    <div key={c.id} className="rounded-xl border bg-card p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${st.color}`}>
                          <span className={"h-1.5 w-1.5 rounded-full " + st.dot} />{c.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-card-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.total_leads} contacts</p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MAIN CAMPAIGN PAGE (after mode selected)
  ══════════════════════════════════════════════════════════════════════════ */
  const isLeads = mode === "leads";
  const accentColor = isLeads ? "emerald" : "blue";
  const modeLabel   = isLeads ? "Leads" : "Suppliers";
  const ModeIcon    = isLeads ? Users : Truck;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header with mode switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Back / mode toggle */}
            <button onClick={() => setMode(null)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg px-3 py-1.5 hover:bg-muted">
              ← All Modes
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-serif text-foreground">Campaign Designer</h1>
                <span className={"flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border " + (isLeads ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-blue-50 text-blue-700 border-blue-200")}>
                  <ModeIcon className="h-3 w-3" />{modeLabel}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isLeads ? "Multi-channel outreach for your leads" : "Outreach campaigns targeting your suppliers"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Switch mode button */}
            <Button variant="outline" size="sm" className="gap-2 h-9"
              onClick={() => { resetCampaign(); setMode(isLeads ? "suppliers" : "leads"); }}>
              {isLeads ? <Truck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
              Switch to {isLeads ? "Suppliers" : "Leads"}
            </Button>
            <Button size="sm" className={"gap-2 " + (isLeads ? "bg-primary" : "bg-primary") + " text-white hover:opacity-90"}
              onClick={() => { resetCampaign(); setShowModal(true); }}>
              <Plus className="h-3.5 w-3.5" /> New {modeLabel} Campaign
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Active Campaigns", value: String(campStats.active),     icon: CheckCircle2, sub: "running now"       },
            { label: isLeads ? "Total Leads" : "Total Suppliers", value: isLeads ? String(leads.length) : String(suppliers.length), icon: isLeads ? Users : Building2, sub: isLeads ? "in database" : "in database" },
            { label: "Templates",        value: String(templates.length),     icon: FileText,     sub: "ready to use"      },
            { label: "Avg. Performance", value: "10.2%",                      icon: TrendingUp,   sub: "response rate"     },
          ].map((s, i) => (
            <motion.div key={s.label} {...fade(i * 0.05)} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex items-center gap-2 mb-1"><s.icon className="h-4 w-4 text-accent" /><span className="text-xs text-muted-foreground">{s.label}</span></div>
              <p className="text-2xl font-serif text-card-foreground">{campLoading ? "—" : s.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Campaigns list + Templates */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <motion.div {...fade(0.15)} className="lg:col-span-2 rounded-xl border bg-card shadow-card overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-serif text-lg text-card-foreground">Campaigns</h3>
              <span className="text-xs text-muted-foreground">{campaigns.length} total</span>
            </div>
            {campLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center"><Target className="h-6 w-6 text-muted-foreground" /></div>
                <p className="text-sm text-muted-foreground">No campaigns yet</p>
                <Button size="sm" variant="outline" onClick={() => { resetCampaign(); setShowModal(true); }}><Plus className="h-3.5 w-3.5 mr-1" />Create first campaign</Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {campaigns.map((c, i) => {
                  const st = ST[c.status] || ST.Draft; const isExp = expanded === c.id; const seqs = campSeqs[c.id] || [];
                  return (
                    <motion.div key={c.id} {...fade(0.2 + i * 0.04)}>
                      <div className="p-5 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-semibold text-card-foreground truncate">{c.name}</h4>
                              <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${st.color}`}><span className={"h-1.5 w-1.5 rounded-full " + st.dot} />{c.status}</span>
                            </div>
                            {c.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.description}</p>}
                            <div className="flex items-center gap-4 mt-2 flex-wrap">
                              {c.destination && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{c.destination}</span>}
                              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" />{c.total_leads} contacts</span>
                              {c.start_date && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3" />{c.start_date}</span>}
                            </div>
                            <div className="flex gap-1.5 mt-2">
                              {(c.channels || []).map(ch => { const cfg = CH[ch as keyof typeof CH]; if (!cfg) return null; const Icon = cfg.icon; return <span key={ch} className={"flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border " + cfg.light}><Icon className="h-3 w-3" />{cfg.label}</span>; })}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => toggleExpand(c.id)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">{isExp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                            <button onClick={() => delCamp(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      </div>
                      <AnimatePresence>
                        {isExp && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden border-t border-border bg-muted/10">
                            <div className="p-5">
                              <p className="text-xs font-semibold text-muted-foreground mb-4 ">Sequence Timeline</p>
                              {seqs.length === 0 ? <p className="text-xs text-muted-foreground italic">No sequences configured.</p> : (
                                <div className="space-y-3">
                                  {seqs.map((seq, si) => { const cfg = CH[seq.channel as keyof typeof CH] || CH.email; const Icon = cfg.icon; return (
                                    <div key={si} className="flex gap-3 items-start">
                                      <div className="flex flex-col items-center">
                                        <div className={"h-8 w-8 rounded-lg " + cfg.color + " flex items-center justify-center shrink-0"}><Icon className="h-3.5 w-3.5 text-white" /></div>
                                        {si < seqs.length - 1 && <div className="w-px h-full bg-border mt-1 min-h-[20px]" />}
                                      </div>
                                      <div className="flex-1 pb-3">
                                        <div className="flex items-center gap-2"><span className="text-[11px] font-semibold text-white bg-accent px-2 py-0.5 rounded-full">Day {seq.day_number}</span><span className="text-xs font-medium text-card-foreground capitalize">{seq.channel}</span></div>
                                        {seq.subject && <p className="text-xs font-medium text-card-foreground mt-1">{seq.subject}</p>}
                                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{seq.message}</p>
                                      </div>
                                    </div>
                                  ); })}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Templates sidebar */}
          <motion.div {...fade(0.2)} className="rounded-xl border bg-card shadow-card overflow-hidden">
            <div className="p-5 border-b border-border">
              <h3 className="font-serif text-lg text-card-foreground">Templates</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Click any to start a campaign</p>
            </div>
            <div className="divide-y divide-border">
              {templates.length === 0 && !campLoading && <div className="p-6 text-center text-xs text-muted-foreground">Run the SQL file to load templates</div>}
              {templates.map((t, i) => (
                <motion.div key={t.id} {...fade(0.25 + i * 0.05)} className="p-4 hover:bg-muted/20 transition-colors cursor-pointer group"
                  onClick={() => { resetCampaign(); setForm(p => ({ ...p, name: t.name })); applyTmpl(t); setShowModal(true); }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium text-card-foreground truncate">{t.name}</p><p className="text-xs text-muted-foreground mt-0.5">{t.industry}</p></div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-accent shrink-0 mt-0.5" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded-full font-medium">{t.conversion_rate}</span>
                    <span className="text-[11px] text-muted-foreground">{Array.isArray(t.sequences) ? t.sequences.length : 0} steps</span>
                  </div>
                  <div className="flex gap-1 mt-2">
                    {(t.channels || []).map(ch => { const cfg = CH[ch as keyof typeof CH]; if (!cfg) return null; const Icon = cfg.icon; return <span key={ch} className={"flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border " + cfg.light}><Icon className="h-2.5 w-2.5" /></span>; })}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ── LEAD OVERVIEW or SUPPLIER OVERVIEW ── */}
        {isLeads ? (
          <motion.div {...fade(0.28)} className="rounded-xl border bg-card shadow-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-accent" /><h3 className="font-serif text-base text-card-foreground">Lead Overview</h3></div>
              <span className="text-xs text-muted-foreground">{leadsLoading ? "Loading…" : leads.length + " total leads"}</span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label:"Total Leads",     value:leadStats.total_leads,     icon:Users,         color:"text-blue-500",  bg:"bg-blue-50"  },
                  { label:"WhatsApp Sent",   value:leadStats.whatsapp_sent,   icon:MessageSquare, color:"text-green-500", bg:"bg-green-50" },
                  { label:"Emails Sent",     value:leadStats.emails_sent,     icon:Mail,          color:"text-amber-500", bg:"bg-amber-50" },
                  { label:"Calls Scheduled", value:leadStats.calls_scheduled, icon:Phone,         color:"text-blue-400",  bg:"bg-blue-50"  },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-3 p-3 rounded-xl border bg-background">
                    <div className={"h-8 w-8 rounded-lg " + s.bg + " flex items-center justify-center shrink-0"}><s.icon className={"h-4 w-4 " + s.color} /></div>
                    <div><p className="text-xl font-semibold text-card-foreground">{leadsLoading ? "—" : s.value}</p><p className="text-[11px] text-muted-foreground">{s.label}</p></div>
                  </div>
                ))}
              </div>
              {!leadsLoading && leads.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Recent Leads</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {leads.slice(0, 6).map(lead => (
                      <div key={lead.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/20">
                        <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0 text-xs font-semibold text-accent">{lead.name?.charAt(0).toUpperCase()}</div>
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium text-card-foreground truncate">{lead.name}</p><p className="text-[11px] text-muted-foreground truncate">{lead.destination || lead.email || "—"}</p></div>
                        <span className={"text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 " + (stageStyle[lead.stage] || stageStyle["New"])}>{lead.stage}</span>
                      </div>
                    ))}
                  </div>
                  {leads.length > 6 && <p className="text-xs text-muted-foreground mt-2 text-center">+{leads.length - 6} more leads — manage them in the <span className="text-accent font-medium">Leads</span> page</p>}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div {...fade(0.28)} className="rounded-xl border bg-card shadow-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-blue-500" /><h3 className="font-serif text-base text-card-foreground">Supplier Overview</h3></div>
              <span className="text-xs text-muted-foreground">{suppLoading ? "Loading suppliers…" : suppliers.length + " suppliers"}</span>
            </div>
            <div className="p-4">
              {suppLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Fetching suppliers…</span></div>
              ) : suppliers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No suppliers found. Add them in the <span className="text-blue-500 font-medium">Suppliers</span> page.</p>
              ) : (
                <div>
                  {/* Type breakdown */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {[...new Set(suppliers.map(s => s.supplier_type).filter(Boolean))].slice(0, 6).map(type => (
                      <span key={type} className={"text-xs px-2.5 py-1 rounded-full border font-medium " + (TYPE_COLORS[type] ?? "bg-gray-50 text-gray-600 border-gray-200")}>
                        {type} · {suppliers.filter(s => s.supplier_type === type).length}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Recent Suppliers</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {suppliers.slice(0, 6).map(s => (
                      <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/20">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-xs font-semibold text-blue-600">{s.name?.charAt(0).toUpperCase()}</div>
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium text-card-foreground truncate">{s.name}</p><p className="text-[11px] text-muted-foreground truncate">{s.company_name || s.supplier_type || "—"}</p></div>
                        {s.supplier_type && <span className={"text-[11px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 " + (TYPE_COLORS[s.supplier_type] ?? "bg-gray-50 text-gray-600 border-gray-200")} style={{maxWidth:"80px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.supplier_type.split("/")[0].trim()}</span>}
                      </div>
                    ))}
                  </div>
                  {suppliers.length > 6 && <p className="text-xs text-muted-foreground mt-2 text-center">+{suppliers.length - 6} more suppliers — manage them in the <span className="text-blue-500 font-medium">Suppliers</span> page</p>}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Sequence Builder */}
        <motion.div {...fade(0.35)} className="rounded-xl border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center"><ListChecks className="h-4 w-4 text-accent" /></div>
              <div><h3 className="font-serif text-base text-card-foreground">Sequence Builder</h3><p className="text-xs text-muted-foreground">Default outreach flow</p></div>
            </div>
            <Button size="sm" className={"gap-1.5 text-white hover:opacity-90 " + (isLeads ? "bg-primary" : "bg-primary")} onClick={() => { resetCampaign(); setShowModal(true); }}>
              <Plus className="h-3.5 w-3.5" /> Add Sequence
            </Button>
          </div>
          <div className="flex items-center flex-wrap gap-y-2 mb-6">
            {DEFAULT_STEPS.map((s, i) => { const Icon = CH[s.ch].icon; return (
              <div key={i} className="flex items-center">
                <div className="flex flex-col items-center w-16">
                  <div className={"w-10 h-10 " + s.color + " rounded-xl flex items-center justify-center shadow-sm"}><Icon className="h-4 w-4 text-white" /></div>
                  <span className="text-xs mt-1 text-card-foreground font-medium text-center">{s.label}</span>
                  <span className="text-[11px] text-muted-foreground">{s.day}</span>
                </div>
                {i < DEFAULT_STEPS.length - 1 && <div className="w-8 h-px bg-border mx-1 mb-5" />}
              </div>
            ); })}
            <div className="flex items-center">
              <div className="w-8 h-px bg-border mx-1 mb-5" />
              <div className="flex flex-col items-center w-16">
                <button onClick={() => { resetCampaign(); setShowModal(true); }} className="w-10 h-10 rounded-xl border-2 border-dashed border-border hover:border-accent hover:bg-accent/5 transition-colors flex items-center justify-center text-muted-foreground hover:text-accent"><Plus className="h-4 w-4" /></button>
                <span className="text-xs mt-1 text-muted-foreground">Add Step</span><span className="text-[11px] opacity-0">x</span>
              </div>
            </div>
          </div>
        </motion.div>

      </div>

      {/* ── DROPDOWN MENU ── */}
      <AnimatePresence>
        {openMenu && menuPos && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
            <motion.div ref={menuRef} initial={{ opacity:0, scale:0.92, y:-4 }} animate={{ opacity:1, scale:1, y:0 }} exit={{ opacity:0, scale:0.92, y:-4 }} transition={{ duration:0.15 }}
              style={{ top: menuPos.top, left: menuPos.left }}
              className="fixed z-50 bg-card border border-border rounded-xl shadow-elevated min-w-[144px] overflow-hidden">
              <button onClick={() => { const lead = leads.find(l => l.id === openMenu); if (lead) handleEdit(lead); setOpenMenu(null); }} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-card-foreground hover:bg-muted transition-colors">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Edit Lead
              </button>
              <div className="h-px bg-border mx-2" />
              <button onClick={() => { const lead = leads.find(l => l.id === openMenu); if (lead) handleDelete(lead); }} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── SCAN MODAL ── */}
      <AnimatePresence>
        {showScanModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.95 }} className="bg-card rounded-xl border shadow-elevated w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-5"><div className="flex items-center gap-2"><ScanLine className="h-4 w-4 text-teal-500" /><h2 className="font-serif text-lg">Scan Visiting Card</h2></div><button onClick={() => setShowScanModal(false)}><X className="h-4 w-4" /></button></div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => cameraRef.current?.click()} className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-teal-200 bg-teal-50 text-teal-600 hover:bg-teal-100 transition-colors"><Camera className="h-5 w-5" /><span className="text-xs font-medium">Take Photo</span></button>
                <button onClick={() => cardRef.current?.click()} className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-muted bg-muted/30 text-muted-foreground hover:bg-muted/60 transition-colors"><Upload className="h-5 w-5" /><span className="text-xs font-medium">Upload Image</span></button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── ADD LEAD MODAL ── */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.95 }} className="bg-card rounded-xl border shadow-elevated w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3"><h2 className="font-serif text-lg">{isEditing ? "Edit Lead" : "Add New Lead"}</h2><button onClick={closeAddModal}><X className="h-4 w-4" /></button></div>
              {scanning && <div className="flex flex-col items-center py-8 gap-4"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /><p className="text-sm text-muted-foreground">Scanning card…</p></div>}
              {!scanning && (
                <>
                  {scanSuccess && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4"><CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" /><p className="text-xs text-green-700">Card scanned! Review fields before saving.</p></div>}
                  {scanError && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4"><X className="h-4 w-4 text-red-500 shrink-0" /><p className="text-xs text-red-600">{scanError}</p></div>}
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label><Input placeholder="Rahul Sharma" value={newLead.name} onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))} className="h-9" /></div>
                      <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Designation</label><Input placeholder="Procurement Manager" value={newLead.designation} onChange={e => setNewLead(p => ({ ...p, designation: e.target.value }))} className="h-9" /></div>
                    </div>
                    <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Company</label><Input placeholder="ABC Corp" value={newLead.company} onChange={e => setNewLead(p => ({ ...p, company: e.target.value }))} className="h-9" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label><Input placeholder="rahul@email.com" value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))} className="h-9" /></div>
                      <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label><Input placeholder="+91 98765 43210" value={newLead.phone} onChange={e => setNewLead(p => ({ ...p, phone: e.target.value }))} className="h-9" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Interest / Product</label><Input placeholder="Enterprise plan" value={newLead.destination} onChange={e => setNewLead(p => ({ ...p, destination: e.target.value }))} className="h-9" /></div>
                      <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Budget</label><Input placeholder="₹2.5L" value={newLead.budget} onChange={e => setNewLead(p => ({ ...p, budget: e.target.value }))} className="h-9" /></div>
                    </div>
                    <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Source</label>
                      <select value={newLead.source} onChange={e => setNewLead(p => ({ ...p, source: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                        {["Manual","Business Card","WhatsApp","Website","Referral","Instagram","Email","CSV Import"].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label><textarea placeholder="Additional info…" value={newLead.notes} onChange={e => setNewLead(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" /></div>
                  </div>
                  <div className="flex gap-2 mt-5">
                    <Button variant="outline" size="sm" className="flex-1" onClick={closeAddModal}>Cancel</Button>
                    <Button size="sm" className="flex-1 bg-primary text-white" onClick={handleSaveLead} disabled={addingLead}>
                      {addingLead ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving…</> : isEditing ? "Update Lead" : "Save Lead"}
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── NEW CAMPAIGN MODAL ── */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity:0, scale:0.96, y:16 }} animate={{ opacity:1, scale:1, y:0 }} exit={{ opacity:0, scale:0.96, y:16 }} transition={{ duration:0.22 }}
              className="bg-card rounded-2xl border shadow-elevated w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-serif text-xl text-card-foreground">New Campaign</h2>
                    <span className={"text-xs font-semibold px-2 py-0.5 rounded-full border " + (isLeads ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-blue-50 text-blue-700 border-blue-200")}>
                      for {modeLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{step === 1 ? "Step 1 of 3 — Campaign details & messages" : step === 2 ? "Step 2 of 3 — Select " + modeLabel.toLowerCase() : "Step 3 of 3 — Build outreach sequence"}</p>
                </div>
                <button onClick={() => { setShowModal(false); resetCampaign(); }} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
              </div>

              {/* Step indicator */}
              <div className="flex items-center gap-2 px-6 py-3 border-b border-border shrink-0 bg-muted/30">
                {[{ n:1 as const, label:"Details & Messages" }, { n:2 as const, label:"Add " + modeLabel }, { n:3 as const, label:"Sequences" }].map((s, i) => (
                  <div key={s.n} className="flex items-center gap-2">
                    <button onClick={() => setStep(s.n)} className={"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors " + (step === s.n ? "bg-accent text-accent-foreground" : step > s.n ? "text-green-600" : "text-muted-foreground")}>
                      {step > s.n ? <Check className="h-3.5 w-3.5" /> : <span className={"h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-semibold " + (step === s.n ? "bg-white/20" : "bg-muted")}>{s.n}</span>}
                      {s.label}
                    </button>
                    {i < 2 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                  </div>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-6">

                {/* Step 1 — Details */}
                {step === 1 && (
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground ">Campaign Details</p>
                      <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Campaign Name *</label><Input placeholder={"e.g. " + (isLeads ? "Spring Sale 2025" : "Vendor Partnership Drive Q2")} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="h-10" /></div>
                      <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label><textarea placeholder="Campaign goal…" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none" /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">{isLeads ? "Interest / Product" : "Region / Focus"}</label><Input placeholder={isLeads ? "Enterprise plan…" : "North America, EMEA…"} value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))} className="h-9" /></div>
                        <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Budget</label><Input placeholder="Rs. 50,000" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} className="h-9" /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Start Date</label><Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} className="h-9" /></div>
                        <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">End Date</label><Input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} className="h-9" /></div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-2 block">Channels</label>
                        <div className="flex gap-2 flex-wrap">
                          {(["email","whatsapp","call"] as const).map(ch => { const cfg = CH[ch]; const Icon = cfg.icon; const on = form.channels.includes(ch); return (
                            <button key={ch} onClick={() => toggleCh(ch)} className={"flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all " + (on ? cfg.color + " text-white border-transparent" : "border-border text-muted-foreground hover:border-accent/40")}>
                              <Icon className="h-4 w-4" />{cfg.label}
                            </button>
                          ); })}
                        </div>
                      </div>
                      <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
                        <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm">
                          {["Draft","Active","Paused"].map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="border-t border-border" />
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-4">Draft Messages</p>
                      <div className="flex gap-1 mb-4 bg-muted/50 p-1 rounded-xl w-fit">
                        {(["whatsapp","email","call"] as const).map(ch => { const cfg = CH[ch]; const Icon = cfg.icon; return (
                          <button key={ch} onClick={() => setDraftTab(ch)} className={"flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all " + (draftTab === ch ? cfg.color + " text-white shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                            <Icon className="h-3.5 w-3.5" />{cfg.label}
                          </button>
                        ); })}
                      </div>
                      {draftTab === "whatsapp" && <textarea value={drafts.whatsapp} onChange={e => setDrafts(p => ({ ...p, whatsapp: e.target.value }))} placeholder={"Hi {name}! 👋\n\n" + (isLeads ? "We have an exciting offer for you…" : "We'd love to partner with your business…")} rows={6} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none font-mono" />}
                      {draftTab === "email" && (
                        <div className="space-y-3">
                          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Subject</label><Input placeholder={isLeads ? "A Special Offer Just for You!" : "Partnership Opportunity"} value={drafts.email_subject} onChange={e => setDrafts(p => ({ ...p, email_subject: e.target.value }))} className="h-9" /></div>
                          <textarea value={drafts.email_body} onChange={e => setDrafts(p => ({ ...p, email_body: e.target.value }))} placeholder={"Dear {name},\n\n" + (isLeads ? "We'd love to help you find the right solution…" : "We'd love to explore a potential partnership with you…")} rows={7} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none" />
                        </div>
                      )}
                      {draftTab === "call" && <textarea value={drafts.call_notes} onChange={e => setDrafts(p => ({ ...p, call_notes: e.target.value }))} placeholder={"1. Introduce yourself\n2. " + (isLeads ? "Ask about needs & timeline\n3. Present offering" : "Discuss partnership terms\n3. Negotiate rates")} rows={7} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none" />}
                    </div>
                  </div>
                )}

                {/* Step 2 — Select leads OR suppliers */}
                {step === 2 && (
                  <div className="space-y-4">
                    {isLeads ? (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">{selLeads.length} lead{selLeads.length !== 1 ? "s" : ""} selected</p>
                          <button onClick={() => setSelLeads(leads.map(l => l.id || "").filter(Boolean))} className="text-xs text-accent hover:underline">Select all</button>
                        </div>
                        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search leads…" className="pl-9 h-10" value={leadSearch} onChange={e => setLeadSearch(e.target.value)} /></div>
                        {leads.length === 0 ? <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground"><Users className="h-8 w-8" /><p className="text-sm">No leads yet.</p></div> : (
                          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                            {leads.filter(l => l.name?.toLowerCase().includes(leadSearch.toLowerCase()) || l.destination?.toLowerCase().includes(leadSearch.toLowerCase())).map(lead => {
                              const sel = selLeads.includes(lead.id || "");
                              return (
                                <div key={lead.id} onClick={() => setSelLeads(p => sel ? p.filter(id => id !== lead.id) : [...p, lead.id || ""])}
                                  className={"flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all " + (sel ? "border-accent bg-accent/5" : "border-border hover:border-accent/30")}>
                                  <div className={"h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 " + (sel ? "bg-accent border-accent" : "border-muted-foreground/30")}>{sel && <Check className="h-3 w-3 text-white" />}</div>
                                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-card-foreground truncate">{lead.name}</p><p className="text-xs text-muted-foreground truncate">{lead.email} · {lead.phone}</p></div>
                                  <div className="shrink-0 text-right">{lead.destination && <span className="text-[11px] bg-muted px-2 py-0.5 rounded text-muted-foreground">{lead.destination}</span>}<p className="text-[11px] text-muted-foreground mt-0.5">{lead.stage}</p></div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">{selSuppliers.length} supplier{selSuppliers.length !== 1 ? "s" : ""} selected</p>
                          <button onClick={() => setSelSuppliers(suppliers.map(s => s.id).filter(Boolean))} className="text-xs text-accent hover:underline">Select all</button>
                        </div>
                        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search suppliers…" className="pl-9 h-10" value={suppSearch} onChange={e => setSuppSearch(e.target.value)} /></div>
                        {suppLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                          : filteredSuppliers.length === 0 ? <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground"><Truck className="h-8 w-8" /><p className="text-sm">No suppliers found.</p></div>
                          : (
                          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                            {filteredSuppliers.map(s => {
                              const sel = selSuppliers.includes(s.id);
                              return (
                                <div key={s.id} onClick={() => setSelSuppliers(p => sel ? p.filter(id => id !== s.id) : [...p, s.id])}
                                  className={"flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all " + (sel ? "border-blue-400 bg-blue-50/40" : "border-border hover:border-blue-300")}>
                                  <div className={"h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 " + (sel ? "bg-blue-500 border-blue-500" : "border-muted-foreground/30")}>{sel && <Check className="h-3 w-3 text-white" />}</div>
                                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-card-foreground truncate">{s.name}</p><p className="text-xs text-muted-foreground truncate">{s.company_name || s.designation || "—"} {s.phone ? "· " + s.phone : ""}</p></div>
                                  <div className="shrink-0">
                                    {s.supplier_type && <span className={"text-[11px] font-medium px-1.5 py-0.5 rounded-full border " + (TYPE_COLORS[s.supplier_type] ?? "bg-gray-50 text-gray-600 border-gray-200")} style={{maxWidth:"90px",display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.supplier_type.split("/")[0].trim()}</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Step 3 — Sequences */}
                {step === 3 && (
                  <div className="space-y-4">
                    {sequences.length > 0 && (
                      <div className="rounded-xl border bg-muted/20 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between"><p className="text-xs font-semibold text-muted-foreground ">Timeline</p><span className="text-xs text-muted-foreground">{sequences.length} steps</span></div>
                        <div className="p-3 flex gap-2 overflow-x-auto">
                          {sequences.map((seq, i) => { const cfg = CH[seq.channel] || CH.email; const Icon = cfg.icon; return (
                            <div key={i} className="flex items-center gap-1 shrink-0">
                              <div className="flex flex-col items-center w-12 gap-0.5">
                                <div className={"h-9 w-9 rounded-xl " + cfg.color + " flex items-center justify-center"}><Icon className="h-3.5 w-3.5 text-white" /></div>
                                <span className="text-[11px] font-semibold text-accent text-center">Day {seq.day_number}</span>
                                <span className="text-[8px] text-muted-foreground capitalize">{seq.channel}</span>
                              </div>
                              {i < sequences.length - 1 && <div className="h-px w-3 bg-border shrink-0 mb-4" />}
                            </div>
                          ); })}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      {sequences.map((seq, i) => {
                        const cfg = CH[seq.channel] || CH.email; const Icon = cfg.icon; const open = expandedSeq === i;
                        return (
                          <div key={i} className={"rounded-xl border transition-all " + (open ? "border-accent/40 shadow-sm" : "border-border")}>
                            <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setExpandedSeq(open ? null : i)}>
                              <div className={"h-8 w-8 rounded-lg " + cfg.color + " flex items-center justify-center shrink-0"}><Icon className="h-3.5 w-3.5 text-white" /></div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2"><span className="text-xs font-semibold text-accent">Day {seq.day_number}</span><span className="text-xs font-medium text-card-foreground capitalize">{seq.channel}</span>{seq.subject && <span className="text-xs text-muted-foreground truncate">· {seq.subject}</span>}</div>
                                {!open && seq.message && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{seq.message}</p>}
                              </div>
                              <div className="flex items-center gap-1">
                                {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                <button onClick={e => { e.stopPropagation(); setSequences(p => p.filter((_, idx) => idx !== i)); }} className="p-1 hover:text-red-500 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>
                            <AnimatePresence>
                              {open && (
                                <motion.div initial={{ height:0 }} animate={{ height:"auto" }} exit={{ height:0 }} className="overflow-hidden border-t border-border">
                                  <div className="p-4 space-y-3">
                                    <div className="grid grid-cols-3 gap-3">
                                      <div><label className="text-[11px] font-medium text-muted-foreground mb-1 block">Day</label><Input type="number" min={0} value={seq.day_number} onChange={e => updStep(i, "day_number", parseInt(e.target.value)||0)} className="h-8 text-sm" /></div>
                                      <div><label className="text-[11px] font-medium text-muted-foreground mb-1 block">Channel</label><select value={seq.channel} onChange={e => updStep(i,"channel",e.target.value)} className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="call">Call</option></select></div>
                                      <div><label className="text-[11px] font-medium text-muted-foreground mb-1 block">Time</label><Input type="time" value={seq.send_time} onChange={e => updStep(i,"send_time",e.target.value)} className="h-8 text-sm" /></div>
                                    </div>
                                    {seq.channel === "email" && <div><label className="text-[11px] font-medium text-muted-foreground mb-1 block">Subject</label><Input placeholder="Subject…" value={seq.subject} onChange={e => updStep(i,"subject",e.target.value)} className="h-8 text-sm" /></div>}
                                    <div><label className="text-[11px] font-medium text-muted-foreground mb-1 block">Message</label><textarea value={seq.message} onChange={e => updStep(i,"message",e.target.value)} rows={3} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none" /></div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                      <button onClick={addStep} className="w-full py-3 rounded-xl border-2 border-dashed border-border hover:border-accent hover:bg-accent/5 transition-all flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-accent">
                        <Plus className="h-4 w-4" /> Add Sequence Step
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  {step === 2 && (isLeads ? selLeads.length + " leads selected" : selSuppliers.length + " suppliers selected")}
                  {step === 3 && sequences.length + " steps configured"}
                </p>
                <div className="flex gap-2">
                  {step > 1 && <Button variant="outline" size="sm" onClick={() => setStep(p => (p-1) as 1|2|3)}>Back</Button>}
                  {step < 3
                    ? <Button size="sm" className={"text-white gap-2 " + (isLeads ? "bg-primary" : "bg-primary")} onClick={() => setStep(p => (p+1) as 1|2|3)} disabled={step===1&&!form.name.trim()}>
                        Next <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    : <Button size="sm" className={"text-white gap-2 " + (isLeads ? "bg-primary" : "bg-primary")} onClick={saveCampaign} disabled={saving}>
                        {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : <><Send className="h-3.5 w-3.5" />Save Campaign</>}
                      </Button>}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* hidden inputs */}
      <input ref={csvRef}    type="file" accept=".csv"   className="hidden" onChange={handleCSVImport} />
      <input ref={cardRef}   type="file" accept="image/*" className="hidden" onChange={handleCardScan} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCardScan} />
    </DashboardLayout>
  );
}

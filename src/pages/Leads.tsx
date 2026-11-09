import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, MessageSquare, Mail, Phone, Upload, Plus, Search,
  Filter, X, Loader2, Camera, ScanLine, Edit3, CheckCircle2,
  MoreVertical, Pencil, Trash2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

/* ─────────────────────────────────────────────
   SUPABASE
───────────────────────────────────────────── */

const PAGE_SIZE = 50;

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface Lead {
  id?: string;
  name: string;
  workingAt: string;
  contactType: string;
  designation: string;
  email: string;
  phone: string;
  panNo: string;
  website: string;
  address: string;
  destination: string;
  country: string;
  budget: string;
  metWhere: string;
  source: string;
  stage: string;
  last_contact: string | null;
  lead_score?: number;
  replied?: boolean;
  followup_sent?: boolean;
}

const EMPTY_LEAD: Lead = {
  name: "", workingAt: "", contactType: "", designation: "",
  email: "", phone: "", panNo: "", website: "", address: "",
  destination: "", country: "", budget: "", metWhere: "", source: "",
  stage: "New", last_contact: null, lead_score: 0,
  replied: false, followup_sent: false,
};

/* ─────────────────────────────────────────────
   SUPABASE HELPERS
───────────────────────────────────────────── */

/** Map a raw Supabase contacts row → Lead */
function rowToLead(row: any): Lead {
  return {
    id:           row.id,
    name:         row.name          ?? "",
    workingAt:    row.working_at    ?? "",
    contactType:  row.contact_type  ?? "",
    designation:  row.designation   ?? "",
    email: row.contact_emails?.find((e: any) => e.is_primary)?.email
           ?? row.contact_emails?.[0]?.email
           ?? "",
    phone: row.contact_phones?.find((p: any) => p.is_primary)?.phone_number
           ?? row.contact_phones?.[0]?.phone_number
           ?? "",
    panNo: row.contact_pan?.[0]?.pan_number ?? "",
    website:      row.url           ?? "",
    address:      row.address       ?? "",
    destination:  row.destination   ?? "",
    country:      row.country       ?? "",
    budget:       row.budget        ?? "",
    metWhere:     row.met_where     ?? "",
    source:       row.source        ?? "",
    stage:        row.stage         ?? "New",
    last_contact: row.last_contacted_at
                    ? row.last_contacted_at.split("T")[0]
                    : row.created_at?.split("T")[0] ?? null,
    lead_score:   Number(row.lead_score) || 0,
    replied:      row.replied       ?? false,
    followup_sent: row.followup_sent ?? false,
  };
}

/** Fetch all contacts (leads) with PAN joined */
async function fetchAllLeadsFromSupabase(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select(`
      id, name, contact_type, designation,
      working_at, url, address, destination, country, budget,
      met_where, source, stage, lead_score, replied, followup_sent,
      last_contacted_at, created_at,
      contact_phones ( phone_number, is_primary ),
      contact_emails ( email, is_primary ),
      contact_pan ( pan_number, holder_name )
    `)
    .order("created_at", { ascending: false });

  if (error) { console.error("Supabase leads error:", error); return []; }
  return (data ?? []).map(rowToLead);
}

/** Insert a new contact row */
async function insertLead(lead: Partial<Lead>): Promise<void> {
  const { data: inserted, error } = await supabase
    .from("contacts")
    .insert({
      name:             lead.name?.trim(),
      working_at:       lead.workingAt?.trim()   || null,
      contact_type:     lead.contactType         || null,
      designation:      lead.designation?.trim() || null,
      // email and phone live in contact_emails / contact_phones
      url:              lead.website?.trim()     || null,
      address:          lead.address?.trim()     || null,
      destination:      lead.destination?.trim() || null,
      country:          lead.country?.trim()     || null,
      budget:           lead.budget?.trim()      || null,
      met_where:        lead.metWhere            || null,
      source:           lead.source              || null,
      stage:            lead.stage              ?? "New",
      lead_score:       lead.lead_score         ?? 0,
      replied:          lead.replied            ?? false,
      followup_sent:    lead.followup_sent      ?? false,
      last_contacted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;

  /* Save PAN separately if provided */
  if (inserted?.id) {
    const ops = [];
    if (lead.email?.trim())
      ops.push(supabase.from("contact_emails").insert({
        contact_id: inserted.id,
        email:      lead.email.trim(),
        is_primary: true,
      }));
    if (lead.phone?.trim())
      ops.push(supabase.from("contact_phones").insert({
        contact_id:   inserted.id,
        phone_number: lead.phone.trim(),
        label:        "mobile",
        is_primary:   true,
      }));
    if (lead.panNo?.trim())
      ops.push(supabase.from("contact_pan").insert({
        contact_id: inserted.id,
        pan_number: lead.panNo.trim(),
      }));
    if (ops.length) await Promise.all(ops);
  }
}

/** Update an existing contact row */
async function updateLead(id: string, lead: Partial<Lead>): Promise<void> {
  const { error } = await supabase
    .from("contacts")
    .update({
      name:          lead.name?.trim(),
      working_at:    lead.workingAt?.trim()   || null,
      contact_type:  lead.contactType         || null,
      designation:   lead.designation?.trim() || null,
      url:           lead.website?.trim()     || null,
      address:       lead.address?.trim()     || null,
      destination:   lead.destination?.trim() || null,
      country:       lead.country?.trim()     || null,
      budget:        lead.budget?.trim()      || null,
      met_where:     lead.metWhere            || null,
      source:        lead.source              || null,
      stage:         lead.stage              ?? "New",
      lead_score:    lead.lead_score         ?? 0,
    })
    .eq("id", id);

  if (error) throw error;

  /* Upsert email — independent of PAN */
  if (lead.email?.trim()) {
    const { data: existingEmail } = await supabase
      .from("contact_emails").select("id").eq("contact_id", id).limit(1);
    if (existingEmail?.length)
      await supabase.from("contact_emails")
        .update({ email: lead.email.trim() }).eq("contact_id", id);
    else
      await supabase.from("contact_emails")
        .insert({ contact_id: id, email: lead.email.trim(), is_primary: true });
  }

  /* Upsert phone — independent of PAN */
  if (lead.phone?.trim()) {
    const { data: existingPhone } = await supabase
      .from("contact_phones").select("id").eq("contact_id", id).limit(1);
    if (existingPhone?.length)
      await supabase.from("contact_phones")
        .update({ phone_number: lead.phone.trim() }).eq("contact_id", id);
    else
      await supabase.from("contact_phones")
        .insert({ contact_id: id, phone_number: lead.phone.trim(), label: "mobile", is_primary: true });
  }

  /* Upsert PAN */
  if (lead.panNo?.trim()) {
    const { data: existing } = await supabase
      .from("contact_pan")
      .select("id")
      .eq("contact_id", id)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("contact_pan")
        .update({ pan_number: lead.panNo.trim() })
        .eq("contact_id", id);
    } else {
      await supabase
        .from("contact_pan")
        .insert({ contact_id: id, pan_number: lead.panNo.trim() });
    }
  }
}

/** Soft-delete: mark archived via a boolean or just delete */
async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/* ─────────────────────────────────────────────
   OCR HELPERS  (unchanged)
───────────────────────────────────────────── */
const OCR_API_KEY = "K89264073988957";

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
  const desigRx = /\b(ceo|cto|coo|founder|co-founder|director|manager|executive|consultant|partner|president|head|lead|associate|agent|advisor|analyst|engineer|developer|designer|sales|marketing|hr|account|travel|tourism|officer)\b/i;
  let designation = "";
  for (const line of lines) {
    if (desigRx.test(line) && line.length < 60) { designation = line; break; }
  }
  const compRx = /\b(pvt|ltd|llp|inc|corp|group|agency|travels|travel|tourism|hotels|holidays|resort|airlines|solutions|services|enterprises|company|\.co)\b/i;
  let workingAt = "";
  for (const line of lines) {
    if (compRx.test(line) && line.length < 80) { workingAt = line; break; }
  }
  if (!workingAt) {
    for (const line of lines.slice(1, 4)) {
      if (line !== name && !line.includes("@") && !/^\+?\d/.test(line) && line.length > 3) { workingAt = line; break; }
    }
  }
  return { name, email, phone, workingAt, designation, website, destination: "", budget: "", country: "", panNo: "", address: "", metWhere: "Business Card", source: "", contactType: "", stage: "New" };
}

async function scanCardWithOCR(base64: string, mimeType: string) {
  const byteChars = atob(base64);
  const byteArr   = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArr], { type: mimeType });
  const formData = new FormData();
  formData.append("file", blob, "card.jpg");
  formData.append("apikey", OCR_API_KEY);
  formData.append("language", "eng");
  formData.append("isOverlayRequired", "false");
  formData.append("detectOrientation", "true");
  formData.append("scale", "true");
  formData.append("OCREngine", "2");
  const response = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: formData });
  if (!response.ok) throw new Error("OCR service unreachable");
  const data = await response.json();
  if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage?.[0] || "OCR processing failed");
  const rawText = data?.ParsedResults?.[0]?.ParsedText || "";
  if (!rawText.trim()) throw new Error("No text found in image. Try a clearer photo.");
  return parseCardText(rawText);
}

/* ─────────────────────────────────────────────
   UTILS
───────────────────────────────────────────── */
const calculateLeadScore = (lead: Partial<Lead>) => {
  const budget = parseInt((lead.budget || "0").replace(/[^\d]/g, ""));
  const destination = (lead.destination || "").toLowerCase();
  let score = 0;
  if (budget >= 200000)      score += 40;
  else if (budget >= 100000) score += 30;
  else if (budget >= 50000)  score += 20;
  else                       score += 5;
  const intl = ["maldives","switzerland","dubai","bali","singapore","thailand","europe","japan","turkey","australia"];
  if (intl.some(d => destination.includes(d))) score += 30;
  else if (destination) score += 15;
  if (lead.phone) score += 5;
  if (lead.email) score += 5;
  return score;
};

const formatLastContact = (val: string | null) => {
  if (!val) return "—";
  const diff = Date.now() - new Date(val).getTime();
  const h    = Math.floor(diff / 3600000);
  if (h < 1)  return "Just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/* ─────────────────────────────────────────────
   TABLE COLUMN DEFINITIONS
   Centralised so widths are consistent between
   header and body — this fixes the scroll drift.
───────────────────────────────────────────── */
const COLUMNS: { key: keyof Lead | "actions" | "menu"; label: string; width: number }[] = [
  { key: "name",        label: "Name",         width: 160 },
  { key: "contactType", label: "Contact Type",  width: 130 },
  { key: "phone",       label: "Phone",         width: 140 },
  { key: "email",       label: "Email",         width: 200 },
  { key: "panNo",       label: "PAN No.",        width: 120 },
  { key: "workingAt",   label: "Working At",    width: 160 },
  { key: "designation", label: "Designation",   width: 160 },
  { key: "website",     label: "URL / Website", width: 160 },
  { key: "address",     label: "Address",       width: 200 },
  { key: "destination", label: "Destination",   width: 130 },
  { key: "country",     label: "Country",       width: 110 },
  { key: "budget",      label: "Budget",        width: 110 },
  { key: "metWhere",    label: "Met Where",     width: 130 },
  { key: "source",      label: "Source",        width: 120 },
  { key: "last_contact",label: "Last Contact",  width: 120 },
  { key: "lead_score",  label: "Lead Score",    width: 100 },
  { key: "actions",     label: "Actions",       width: 180 },
  { key: "menu",        label: "",              width:  52 },
];
const TABLE_TOTAL_WIDTH = COLUMNS.reduce((s, c) => s + c.width, 0);

/* ── Filter helpers ── */
const CHIP_COLORS: Record<string, string> = {
  blue:   "bg-blue-50   text-blue-600   border-blue-200   data-[active=true]:bg-blue-500   data-[active=true]:text-white data-[active=true]:border-blue-500",
  orange: "bg-orange-50 text-orange-600 border-orange-200 data-[active=true]:bg-orange-500 data-[active=true]:text-white data-[active=true]:border-orange-500",
  yellow: "bg-yellow-50 text-yellow-600 border-yellow-200 data-[active=true]:bg-yellow-500 data-[active=true]:text-white data-[active=true]:border-yellow-500",
  purple: "bg-teal-50 text-teal-600 border-teal-200 data-[active=true]:bg-teal-500 data-[active=true]:text-white data-[active=true]:border-teal-500",
  green:  "bg-green-50  text-green-600  border-green-200  data-[active=true]:bg-green-500  data-[active=true]:text-white data-[active=true]:border-green-500",
  red:    "bg-red-50    text-red-500    border-red-200    data-[active=true]:bg-red-500    data-[active=true]:text-white data-[active=true]:border-red-500",
  slate:  "bg-slate-50  text-slate-600  border-slate-200  data-[active=true]:bg-slate-600  data-[active=true]:text-white data-[active=true]:border-slate-600",
  indigo: "bg-teal-50 text-teal-600 border-teal-200 data-[active=true]:bg-teal-500 data-[active=true]:text-white data-[active=true]:border-teal-500",
  teal:   "bg-teal-50   text-teal-600   border-teal-200   data-[active=true]:bg-teal-500   data-[active=true]:text-white data-[active=true]:border-teal-500",
};

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-foreground mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      data-active={active}
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${CHIP_COLORS[color] ?? CHIP_COLORS.slate}`}
    >
      {label}
    </button>
  );
}

/* ═══════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════ */
const Leads = () => {
  const [leads,           setLeads]           = useState<Lead[]>([]);
  const [stats,           setStats]           = useState({ total: 0, whatsapp: 0, emails: 0, calls: 0 });
  const [search,          setSearch]          = useState("");
  const [loading,         setLoading]         = useState(true);
  const [currentPage,     setCurrentPage]     = useState(1);
  const [pageGroup,       setPageGroup]       = useState(0);
  const [showAddModal,    setShowAddModal]     = useState(false);
  const [showScanModal,   setShowScanModal]    = useState(false);
  const [addingLead,      setAddingLead]       = useState(false);
  const [importing,       setImporting]        = useState(false);
  const [scanning,        setScanning]         = useState(false);
  const [scanError,       setScanError]        = useState<string | null>(null);
  const [scannedPreview,  setScannedPreview]   = useState<string | null>(null);
  const [scanSuccess,     setScanSuccess]      = useState(false);
  const [newLead,         setNewLead]          = useState<Lead>({ ...EMPTY_LEAD });
  const [isEditing,       setIsEditing]        = useState(false);
  const [editingId,       setEditingId]        = useState<string | null>(null);
  const [openMenu,        setOpenMenu]         = useState<string | null>(null);
  const [menuPos,         setMenuPos]          = useState<{ top: number; left: number } | null>(null);
  const [error,           setError]            = useState<string | null>(null);

  /* Filter states */
  const [showFilters, setShowFilters] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  const [filters, setFilters] = useState({
    stage:       [] as string[],
    contactType: [] as string[],
    source:      [] as string[],
    metWhere:    [] as string[],
    scoreRange:  "all" as "all" | "low" | "mid" | "high",
    hasPhone:    false,
    hasEmail:    false,
    hasWhatsApp: false,
  });

  const pagesPerGroup = 5;

  const csvRef    = useRef<HTMLInputElement>(null);
  const cardRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const menuRef   = useRef<HTMLDivElement>(null);

  /* ── close menu on outside click ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── close filters on outside click ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        filterRef.current &&
        !filterRef.current.contains(e.target as Node) &&
        !filterBtnRef.current?.contains(e.target as Node)
      ) setShowFilters(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { loadLeads(); }, []);
  useEffect(() => { setCurrentPage(1); setPageGroup(0); }, [search]);

  /* ── Fetch ── */
  const loadLeads = async () => {
    setLoading(true); setError(null);
    try {
      const all = await fetchAllLeadsFromSupabase();
      setLeads(all);
      setStats({
        total:    all.length,
        whatsapp: all.filter(l => l.phone).length,
        emails:   all.filter(l => l.email).length,
        calls:    all.filter(l => l.stage === "Contacted" || l.stage === "Qualified").length,
      });
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to fetch leads from Supabase.");
    } finally { setLoading(false); }
  };

  /* ── Save (add or edit) ── */
  const handleSaveLead = async () => {
    if (!newLead.name.trim()) { alert("Name is required."); return; }
    setAddingLead(true);
    try {
      const scored = { ...newLead, lead_score: calculateLeadScore(newLead) };
      if (isEditing && editingId) {
        await updateLead(editingId, scored);
      } else {
        await insertLead(scored);
      }
      closeAddModal();
      loadLeads();
    } catch (e: any) {
      console.error(e);
      alert(`Failed to save: ${e.message}`);
    } finally { setAddingLead(false); }
  };

  /* ── Edit ── */
  const handleEdit = (lead: Lead) => {
    setIsEditing(true); setEditingId(lead.id || null);
    setNewLead({
      name:         lead.name        || "",
      workingAt:    lead.workingAt   || "",
      contactType:  lead.contactType || "",
      designation:  lead.designation || "",
      email:        lead.email       || "",
      phone:        lead.phone       || "",
      panNo:        lead.panNo       || "",
      website:      lead.website     || "",
      address:      lead.address     || "",
      destination:  lead.destination || "",
      country:      lead.country     || "",
      budget:       lead.budget      || "",
      metWhere:     lead.metWhere    || "",
      source:       lead.source      || "",
      stage:        lead.stage       || "New",
      last_contact: lead.last_contact,
    });
    setScanError(null); setScanSuccess(false); setScannedPreview(null);
    setOpenMenu(null); setShowAddModal(true);
  };

  /* ── Delete ── */
  const handleDelete = async (lead: Lead) => {
    if (!confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return;
    setOpenMenu(null);
    try {
      await deleteLead(lead.id!);
      loadLeads();
    } catch (e: any) { alert(`Delete failed: ${e.message}`); }
  };

  /* ── Card scan ── */
  const handleCardScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please select an image file."); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64  = dataUrl.split(",")[1];
      setScannedPreview(dataUrl);
      setScanning(true); setScanError(null); setScanSuccess(false);
      setShowScanModal(false);
      try {
        const extracted = await scanCardWithOCR(base64, file.type as any);
        setNewLead(prev => ({
          ...prev,
          name:        extracted.name        || prev.name,
          email:       extracted.email       || prev.email,
          phone:       extracted.phone       || prev.phone,
          workingAt:   extracted.workingAt   || prev.workingAt,
          designation: extracted.designation || prev.designation,
          website:     extracted.website     || prev.website,
          metWhere:    "Business Card",
        }));
        setScanSuccess(true);
      } catch (err: any) { setScanError(err.message || "Scan failed"); }
      finally {
        setScanning(false); setShowAddModal(true);
        if (cardRef.current)   cardRef.current.value   = "";
        if (cameraRef.current) cameraRef.current.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  /* ── CSV Import ── */
  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true);
    try {
      const text    = await file.text();
      const lines   = text.split("\n").filter(l => l.trim());
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/ /g, "_"));
      let imported  = 0;
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(",").map(v => v.trim());
        if (vals.length < 2) continue;
        const row: any = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
        const lead: Partial<Lead> = {
          name:        row.name        || "",
          workingAt:   row.working_at  || row.workingat  || "",
          contactType: row.contact_type || "",
          designation: row.designation || "",
          email:       row.email       || "",
          phone:       row.phone       || "",
          panNo:       row.pan_no      || "",
          website:     row.website     || row.url || "",
          address:     row.address     || "",
          destination: row.destination || "",
          country:     row.country     || "",
          budget:      row.budget      || "",
          metWhere:    row.met_where   || "CSV Import",
          source:      row.source      || "CSV Import",
          stage:       row.stage       || "New",
          lead_score:  calculateLeadScore(row),
        };
        if (!lead.name) continue;
        await insertLead(lead);
        imported++;
      }
      if (imported) { alert(`${imported} leads imported`); loadLeads(); }
      else           { alert("No valid rows found."); }
    } catch (e: any) {
      alert(`Import failed: ${e.message}`);
    } finally {
      setImporting(false);
      if (csvRef.current) csvRef.current.value = "";
    }
  };

  /* ── WhatsApp / Email ── */
  const handleWhatsApp = (lead: Lead) =>
    window.open(`https://wa.me/${lead.phone.replace(/\D/g, "")}`, "_blank");

  const handleEmail = async (lead: Lead) => {
    try {
      await fetch("http://localhost:5678/webhook/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: lead.name, email: lead.email, phone: lead.phone,
          company: lead.workingAt, designation: lead.designation,
          destination: lead.destination, country: lead.country,
          budget: lead.budget, lead_score: lead.lead_score,
        }),
      });
      alert("Email sent successfully!");
    } catch { alert("Failed to trigger email webhook"); }
  };

  /* ── Filtering & pagination ── */
  const activeFilterCount =
    filters.stage.length +
    filters.contactType.length +
    filters.source.length +
    filters.metWhere.length +
    (filters.scoreRange !== "all" ? 1 : 0) +
    (filters.hasPhone ? 1 : 0) +
    (filters.hasEmail ? 1 : 0) +
    (filters.hasWhatsApp ? 1 : 0);

  const filtered = leads.filter(l => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || l.name?.toLowerCase().includes(q)
      || l.destination?.toLowerCase().includes(q)
      || l.email?.toLowerCase().includes(q)
      || l.phone?.toLowerCase().includes(q)
      || l.workingAt?.toLowerCase().includes(q);

    const matchStage       = !filters.stage.length       || filters.stage.includes(l.stage);
    const matchContactType = !filters.contactType.length  || filters.contactType.includes(l.contactType);
    const matchSource      = !filters.source.length       || filters.source.includes(l.source);
    const matchMetWhere    = !filters.metWhere.length      || filters.metWhere.includes(l.metWhere);
    const matchScore       =
      filters.scoreRange === "all"  ? true :
      filters.scoreRange === "high" ? (l.lead_score || 0) >= 70 :
      filters.scoreRange === "mid"  ? (l.lead_score || 0) >= 40 && (l.lead_score || 0) < 70 :
                                      (l.lead_score || 0) < 40;
    const matchPhone    = !filters.hasPhone    || !!l.phone;
    const matchEmail    = !filters.hasEmail    || !!l.email;
    const matchWhatsApp = !filters.hasWhatsApp || !!l.phone;

    return matchSearch && matchStage && matchContactType && matchSource
      && matchMetWhere && matchScore && matchPhone && matchEmail && matchWhatsApp;
  });

  const totalPages   = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage     = Math.min(currentPage, totalPages);
  const paginated    = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const startPage    = pageGroup * pagesPerGroup + 1;
  const endPage      = Math.min(startPage + pagesPerGroup - 1, totalPages);
  const visiblePages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

  const closeAddModal = () => {
    setShowAddModal(false); setIsEditing(false); setEditingId(null);
    setScanSuccess(false); setScanError(null); setScannedPreview(null);
    setNewLead({ ...EMPTY_LEAD });
  };

  /* ── Pagination controls (reused top + bottom) ── */
  const PaginationControls = () => (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" className="h-9 w-9 p-0"
        disabled={pageGroup === 0}
        onClick={() => { setPageGroup(g => Math.max(0, g - 1)); setCurrentPage(Math.max(1, startPage - pagesPerGroup)); }}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {visiblePages.map(p => (
        <button key={p} onClick={() => setCurrentPage(p)}
          className={`h-9 min-w-[36px] px-2 rounded-md text-sm font-medium border transition-colors ${
            safePage === p ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
          }`}>
          {p}
        </button>
      ))}
      <Button variant="outline" size="sm" className="h-9 w-9 p-0"
        disabled={endPage >= totalPages}
        onClick={() => { setPageGroup(g => g + 1); setCurrentPage(endPage + 1); }}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <span className="text-xs text-muted-foreground whitespace-nowrap ml-1">
        {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
      </span>
    </div>
  );

  /* ─── RENDER ─── */
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 px-2 sm:px-4 lg:px-6 max-w-full"
        style={{ height: "calc(100vh - 4rem)" }}>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 shrink-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-serif text-foreground">Lead Management</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Capture, nurture, and convert travel inquiries</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <input ref={csvRef}    type="file" accept=".csv"    className="hidden" onChange={handleCSVImport} />
            <input ref={cardRef}   type="file" accept="image/*" className="hidden" onChange={handleCardScan} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCardScan} />

            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs sm:h-9 sm:text-sm"
              onClick={() => csvRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {importing ? "Importing…" : "Import CSV"}
            </Button>

            <Button variant="outline" size="sm"
              className="gap-1.5 h-8 text-xs sm:h-9 sm:text-sm border-teal-200 text-teal-600 hover:bg-teal-50"
              onClick={() => { setNewLead({ ...EMPTY_LEAD }); setScanError(null); setScanSuccess(false); setScannedPreview(null); setShowScanModal(true); }}
              disabled={scanning}>
              {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
              {scanning ? "Scanning…" : "Scan Card"}
            </Button>

            <Button size="sm" className="gap-1.5 h-8 text-xs sm:h-9 sm:text-sm bg-gradient-gold text-accent-foreground hover:opacity-90"
              onClick={() => { setIsEditing(false); setEditingId(null); setNewLead({ ...EMPTY_LEAD }); setScannedPreview(null); setScanSuccess(false); setScanError(null); setShowAddModal(true); }}>
              <Plus className="h-3.5 w-3.5" /> Add Lead
            </Button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 shrink-0">
            <X className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
            <span className="flex-1 text-xs sm:text-sm">{error}</span>
            <button onClick={loadLeads} className="ml-auto text-xs underline shrink-0">Retry</button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          {[
            { label: "Total Leads",     value: stats.total,    icon: Users },
            { label: "WhatsApp Ready",  value: stats.whatsapp, icon: MessageSquare },
            { label: "Emails Available",value: stats.emails,   icon: Mail },
            { label: "Calls Scheduled", value: stats.calls,    icon: Phone },
          ].map((stat, i) => (
            <motion.div key={stat.label}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-3xl font-semibold text-card-foreground">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Search + top pagination */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <div className="relative flex-1 max-w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search leads…" className="pl-9 h-9 text-sm"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
            <div className="relative">
              <Button
                ref={filterBtnRef}
                variant="outline"
                size="sm"
                className={`gap-1.5 h-9 text-sm relative ${activeFilterCount > 0 ? "border-teal-400 text-teal-600 bg-teal-50" : ""}`}
                onClick={() => setShowFilters(v => !v)}
              >
                <Filter className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-teal-500 text-white text-[11px] font-semibold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>

              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    ref={filterRef}
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full mt-2 z-50 bg-card border border-border rounded-2xl shadow-2xl w-80 overflow-hidden"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                      <span className="text-sm font-semibold text-card-foreground">Filters</span>
                      <div className="flex items-center gap-2">
                        {activeFilterCount > 0 && (
                          <button
                            onClick={() => setFilters({ stage: [], contactType: [], source: [], metWhere: [], scoreRange: "all", hasPhone: false, hasEmail: false, hasWhatsApp: false })}
                            className="text-xs text-red-500 hover:underline font-medium"
                          >
                            Clear all
                          </button>
                        )}
                        <button onClick={() => setShowFilters(false)} className="text-muted-foreground hover:text-foreground">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">
                      {/* Stage */}
                      <FilterSection label="Stage">
                        {["New","Contacted","Qualified","Proposal","Booked"].map(s => (
                          <FilterChip
                            key={s} label={s}
                            active={filters.stage.includes(s)}
                            color={s === "New" ? "blue" : s === "Contacted" ? "orange" : s === "Qualified" ? "yellow" : s === "Proposal" ? "purple" : "green"}
                            onClick={() => setFilters(f => ({
                              ...f,
                              stage: f.stage.includes(s) ? f.stage.filter(x => x !== s) : [...f.stage, s]
                            }))}
                          />
                        ))}
                      </FilterSection>

                      {/* Contact Type */}
                      <FilterSection label="Contact Type">
                        {["Individual","Corporate","Travel Agent","Tour Operator","Referral","Other"].map(s => (
                          <FilterChip
                            key={s} label={s}
                            active={filters.contactType.includes(s)}
                            color="slate"
                            onClick={() => setFilters(f => ({
                              ...f,
                              contactType: f.contactType.includes(s) ? f.contactType.filter(x => x !== s) : [...f.contactType, s]
                            }))}
                          />
                        ))}
                      </FilterSection>

                      {/* Lead Score */}
                      <FilterSection label="Lead Score">
                        {[
                          { val: "all",  label: "All",       color: "slate"  },
                          { val: "high", label: "70+",    color: "green"  },
                          { val: "mid",  label: "40–69",  color: "yellow" },
                          { val: "low",  label: "0–39",   color: "red"    },
                        ].map(opt => (
                          <FilterChip
                            key={opt.val} label={opt.label}
                            active={filters.scoreRange === opt.val}
                            color={opt.color as any}
                            onClick={() => setFilters(f => ({ ...f, scoreRange: opt.val as any }))}
                          />
                        ))}
                      </FilterSection>

                      {/* Source */}
                      <FilterSection label="Source">
                        {["Website","Referral","Instagram","Facebook","Google","Email","Event","Exhibition","Cold Call","Business Card","CSV Import","Manual"].map(s => (
                          <FilterChip
                            key={s} label={s}
                            active={filters.source.includes(s)}
                            color="indigo"
                            onClick={() => setFilters(f => ({
                              ...f,
                              source: f.source.includes(s) ? f.source.filter(x => x !== s) : [...f.source, s]
                            }))}
                          />
                        ))}
                      </FilterSection>

                      {/* Met Where */}
                      <FilterSection label="Met Where">
                        {["Business Card","WhatsApp","Website","Referral","Instagram","Email","Event","Exhibition","Cold Call","Manual"].map(s => (
                          <FilterChip
                            key={s} label={s}
                            active={filters.metWhere.includes(s)}
                            color="teal"
                            onClick={() => setFilters(f => ({
                              ...f,
                              metWhere: f.metWhere.includes(s) ? f.metWhere.filter(x => x !== s) : [...f.metWhere, s]
                            }))}
                          />
                        ))}
                      </FilterSection>

                      {/* Quick toggles */}
                      <FilterSection label="Quick Filters">
                        <div className="flex flex-col gap-2 w-full">
                          {[
                            { key: "hasPhone",    label: "Has Phone number" },
                            { key: "hasEmail",    label: "Has Email address" },
                            { key: "hasWhatsApp", label: "WhatsApp reachable" },
                          ].map(({ key, label }) => (
                            <label key={key} className="flex items-center justify-between px-3 py-2 rounded-xl border border-border hover:bg-muted/40 cursor-pointer transition-colors">
                              <span className="text-xs font-medium text-card-foreground">{label}</span>
                              <div
                                onClick={() => setFilters(f => ({ ...f, [key]: !f[key as keyof typeof f] }))}
                                className={`relative h-5 w-9 rounded-full transition-colors cursor-pointer ${
                                  filters[key as keyof typeof filters] ? "bg-teal-500" : "bg-muted border border-border"
                                }`}
                              >
                                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                  filters[key as keyof typeof filters] ? "translate-x-4" : "translate-x-0.5"
                                }`} />
                              </div>
                            </label>
                          ))}
                        </div>
                      </FilterSection>
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {filtered.length} lead{filtered.length !== 1 ? "s" : ""} match
                      </span>
                      <button
                        onClick={() => setShowFilters(false)}
                        className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                      >
                        Apply
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <PaginationControls />
          </div>
        </motion.div>

        {/* ── TABLE ──
            Key fix: outer div clips overflow, inner div scrolls horizontally.
            Both header and body share exact pixel widths from COLUMNS,
            so columns never drift or misalign.
        ── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          className="rounded-xl border bg-card shadow-card overflow-hidden flex flex-col min-h-0 flex-1 min-h-0">

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading leads from Supabase…</span>
            </div>
          ) : (
            /* Single scrollable container — header + body scroll together */
            <div className="overflow-x-auto overflow-y-auto flex-1">
              <table style={{ width: TABLE_TOTAL_WIDTH, minWidth: TABLE_TOTAL_WIDTH, tableLayout: "fixed" }}
                className="border-collapse">

                {/* ── COLGROUP: gives every column a precise pixel width ── */}
                <colgroup>
                  {COLUMNS.map(col => (
                    <col key={col.key} style={{ width: col.width }} />
                  ))}
                </colgroup>

                {/* ── STICKY HEADER ── */}
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/80 backdrop-blur border-b border-border">
                    {COLUMNS.map(col => (
                      <th key={col.key}
                        className="text-left text-xs font-semibold text-muted-foreground px-3 py-3 whitespace-nowrap overflow-hidden text-ellipsis">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* ── BODY ── */}
                <tbody>
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={COLUMNS.length} className="px-6 py-16 text-center text-sm text-muted-foreground">
                        {search
                          ? "No leads match your search."
                          : <>No leads yet. Click <strong>Add Lead</strong>, <strong>Scan Card</strong>, or <strong>Import CSV</strong>.</>}
                      </td>
                    </tr>
                  ) : paginated.map((lead, i) => (
                    <tr key={lead.id || i}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">

                      {COLUMNS.map(col => {
                        const cellBase = "px-3 py-3 text-sm overflow-hidden text-ellipsis whitespace-nowrap";

                        if (col.key === "name") return (
                          <td key="name" className={`${cellBase} font-semibold text-card-foreground`}>
                            {lead.name || "—"}
                          </td>
                        );

                        if (col.key === "email") return (
                          <td key="email" className={cellBase}>
                            {lead.email
                              ? <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a>
                              : "—"}
                          </td>
                        );

                        if (col.key === "website") return (
                          <td key="website" className={cellBase}>
                            {lead.website
                              ? <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="text-blue-500 hover:underline">{lead.website}</a>
                              : "—"}
                          </td>
                        );

                        if (col.key === "last_contact") return (
                          <td key="last_contact" className={`${cellBase} text-muted-foreground`}>
                            {formatLastContact(lead.last_contact)}
                          </td>
                        );

                        if (col.key === "lead_score") return (
                          <td key="lead_score" className={cellBase}>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              (lead.lead_score || 0) >= 70 ? "bg-green-100 text-green-700"
                              : (lead.lead_score || 0) >= 40 ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                            }`}>
                              {lead.lead_score || 0}
                            </span>
                          </td>
                        );

                        if (col.key === "actions") return (
                          <td key="actions" className={cellBase}>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => handleWhatsApp(lead)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors text-xs font-medium border border-green-200">
                                <MessageSquare className="h-3 w-3" /> WhatsApp
                              </button>
                              <button onClick={() => handleEmail(lead)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors text-xs font-medium border border-blue-200">
                                <Mail className="h-3 w-3" /> Email
                              </button>
                            </div>
                          </td>
                        );

                        if (col.key === "menu") return (
                          <td key="menu" className="px-2 py-3 text-center">
                            <button
                              onClick={(e) => {
                                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                setMenuPos({ top: rect.bottom + 4, left: rect.right - 150 });
                                setOpenMenu(openMenu === lead.id ? null : (lead.id || null));
                              }}
                              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </td>
                        );

                        /* Generic text cell */
                        const val = lead[col.key as keyof Lead];
                        return (
                          <td key={col.key} className={`${cellBase} text-muted-foreground`}
                            title={String(val || "")}>
                            {val || "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

      </div>

      {/* ── Floating dropdown menu ── */}
      <AnimatePresence>
        {openMenu && menuPos && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
            <motion.div ref={menuRef}
              initial={{ opacity: 0, scale: 0.92, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -4 }} transition={{ duration: 0.15 }}
              style={{ top: menuPos.top, left: menuPos.left }}
              className="fixed z-50 bg-card border border-border rounded-xl shadow-elevated min-w-[144px] overflow-hidden">
              <button
                onClick={() => { const lead = leads.find(l => l.id === openMenu); if (lead) handleEdit(lead); setOpenMenu(null); }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-card-foreground hover:bg-muted transition-colors">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Edit Lead
              </button>
              <div className="h-px bg-border mx-2" />
              <button
                onClick={() => { const lead = leads.find(l => l.id === openMenu); if (lead) handleDelete(lead); }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Scan Card Modal ── */}
      <AnimatePresence>
        {showScanModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              className="bg-card rounded-t-2xl sm:rounded-xl border shadow-elevated w-full sm:max-w-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <ScanLine className="h-4 w-4 text-teal-500" />
                  <h2 className="font-serif text-lg text-card-foreground">Scan Visiting Card</h2>
                </div>
                <button onClick={() => setShowScanModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              <p className="text-sm text-muted-foreground mb-5 text-center">
                Take a photo or upload a visiting card image.<br />
                <span className="text-teal-500 font-medium">Free OCR</span> will auto-fill all contact details.
              </p>
              <div className="rounded-xl border-2 border-dashed border-teal-200 bg-teal-50/50 p-6 flex flex-col items-center gap-2 mb-5">
                <div className="h-12 w-12 rounded-xl bg-teal-100 flex items-center justify-center">
                  <ScanLine className="h-6 w-6 text-teal-500" />
                </div>
                <p className="text-xs text-muted-foreground text-center">Extracts: Name, Email, Phone, Company,<br />Designation &amp; Website automatically</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => cameraRef.current?.click()}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-teal-200 bg-teal-50 text-teal-600 hover:bg-teal-100 transition-colors">
                  <Camera className="h-5 w-5" /><span className="text-xs font-medium">Take Photo</span>
                </button>
                <button onClick={() => cardRef.current?.click()}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-muted bg-muted/30 text-muted-foreground hover:bg-muted/60 transition-colors">
                  <Upload className="h-5 w-5" /><span className="text-xs font-medium">Upload Image</span>
                </button>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-4">Supports JPG, PNG, WEBP · 100% Free</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Add / Edit Lead Modal ── */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              className="bg-card rounded-t-2xl sm:rounded-xl border shadow-elevated w-full sm:max-w-2xl p-4 sm:p-6 max-h-[92vh] overflow-y-auto">

              <div className="flex items-center justify-between mb-3 sticky top-0 bg-card pt-1 pb-2 z-10">
                <h2 className="font-serif text-base sm:text-lg text-card-foreground">
                  {scanning ? "Scanning Card…" : isEditing ? "Edit Lead" : scanSuccess ? "Review Scanned Lead" : "Add New Lead"}
                </h2>
                <button onClick={closeAddModal} className="text-muted-foreground hover:text-foreground p-1"><X className="h-4 w-4" /></button>
              </div>

              {scanning && (
                <div className="flex flex-col items-center py-8 gap-4">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-4 border-teal-100 border-t-violet-500 animate-spin" />
                    <ScanLine className="h-6 w-6 text-teal-500 absolute inset-0 m-auto" />
                  </div>
                  <p className="text-sm font-medium text-card-foreground text-center">Reading card…</p>
                  {scannedPreview && <img src={scannedPreview} alt="Card" className="w-full max-h-28 object-cover rounded-lg border" />}
                </div>
              )}

              {!scanning && (
                <>
                  {scanSuccess && (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <p className="text-xs text-green-700">Card scanned! Review and edit any field before saving.</p>
                    </div>
                  )}
                  {scanError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-3">
                      <X className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-red-700 font-medium mb-1">Scan failed — fill in manually</p>
                        <p className="text-xs text-red-500">{scanError}</p>
                      </div>
                    </div>
                  )}
                  {scannedPreview && !scanError && (
                    <div className="mb-3 rounded-lg overflow-hidden border border-border">
                      <img src={scannedPreview} alt="Scanned card" className="w-full max-h-32 object-cover" />
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/30">
                        <ScanLine className="h-3 w-3 text-teal-500" />
                        <span className="text-xs text-muted-foreground">Scanned with OCR.space</span>
                        <button onClick={() => { setShowAddModal(false); setShowScanModal(true); }}
                          className="ml-auto text-xs text-teal-500 hover:underline flex items-center gap-1">
                          <Camera className="h-3 w-3" /> Rescan
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
                        <Input placeholder="Rahul Sharma" value={newLead.name}
                          onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))} className="h-9" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Working At</label>
                        <Input placeholder="ABC Travels Pvt. Ltd." value={newLead.workingAt}
                          onChange={e => setNewLead(p => ({ ...p, workingAt: e.target.value }))} className="h-9" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Contact Type</label>
                        <select value={newLead.contactType}
                          onChange={e => setNewLead(p => ({ ...p, contactType: e.target.value }))}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                          <option value="">Select type…</option>
                          {["Individual","Corporate","Travel Agent","Tour Operator","Referral","Other"].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Designation</label>
                        <Input placeholder="Travel Manager" value={newLead.designation}
                          onChange={e => setNewLead(p => ({ ...p, designation: e.target.value }))} className="h-9" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
                        <Input placeholder="rahul@email.com" value={newLead.email}
                          onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))} className="h-9" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
                        <Input placeholder="+91 98765 43210" value={newLead.phone}
                          onChange={e => setNewLead(p => ({ ...p, phone: e.target.value }))} className="h-9" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">PAN No.</label>
                        <Input placeholder="ABCDE1234F" value={newLead.panNo}
                          onChange={e => setNewLead(p => ({ ...p, panNo: e.target.value }))} className="h-9" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">URL / Website</label>
                        <Input placeholder="www.abctravels.com" value={newLead.website}
                          onChange={e => setNewLead(p => ({ ...p, website: e.target.value }))} className="h-9" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Address</label>
                      <Input placeholder="123 Main Street, Mumbai 400001" value={newLead.address}
                        onChange={e => setNewLead(p => ({ ...p, address: e.target.value }))} className="h-9" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Destination</label>
                        <Input placeholder="Rajasthan" value={newLead.destination}
                          onChange={e => setNewLead(p => ({ ...p, destination: e.target.value }))} className="h-9" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Country</label>
                        <Input placeholder="India" value={newLead.country}
                          onChange={e => setNewLead(p => ({ ...p, country: e.target.value }))} className="h-9" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Budget</label>
                      <Input placeholder="₹2.5L" value={newLead.budget}
                        onChange={e => setNewLead(p => ({ ...p, budget: e.target.value }))} className="h-9" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Met Where</label>
                        <select value={newLead.metWhere}
                          onChange={e => setNewLead(p => ({ ...p, metWhere: e.target.value }))}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                          <option value="">Select…</option>
                          {["Manual","Business Card","WhatsApp","Website","Referral","Instagram","Email","CSV Import","Event","Exhibition","Cold Call"].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Source</label>
                        <select value={newLead.source}
                          onChange={e => setNewLead(p => ({ ...p, source: e.target.value }))}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                          <option value="">Select…</option>
                          {["Manual","Business Card","WhatsApp","Website","Referral","Instagram","Facebook","Google","Email","CSV Import","Event","Exhibition","Cold Call"].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Stage</label>
                      <select value={newLead.stage}
                        onChange={e => setNewLead(p => ({ ...p, stage: e.target.value }))}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                        {["New","Contacted","Qualified","Proposal","Booked"].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-5 sticky bottom-0 bg-card pt-3 pb-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={closeAddModal}>Cancel</Button>
                    <Button size="sm" className="flex-1 bg-gradient-gold text-accent-foreground"
                      onClick={handleSaveLead} disabled={addingLead}>
                      {addingLead
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving…</>
                        : isEditing ? "Update Lead" : "Save Lead"}
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
};

export default Leads;

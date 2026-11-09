import { API_ROOT } from "@/lib/api";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, X, Loader2, ExternalLink, ChevronDown,
  Globe, Phone, Mail, MapPin, Building2, Tag,
  RefreshCw, AlertCircle, Filter, Plus, Pencil, Upload, Copy, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef } from "react";

const SUPPLIER_TYPES = [
  "Luxury Hotel / Resort","Boutique Hotel","Budget Hotel","Villa / Private Stay",
  "Transport","Car Rental","Flight / GSA","Cruise","Tour Operator","Travel Agency",
  "Tourism Board","Local Guide","Activity Provider","Visa Agent","Insurance",
  "Restaurant","Other",
];

const MET_WHERE_OPTIONS = [
  "ILTM Cannes","ITB Berlin","WTM London","ATM Dubai","SATTE New Delhi",
  "OTM Mumbai","FITUR Madrid","IMEX Frankfurt","IMEX America","Virtuoso Travel Week",
  "Luxperience Sydney","PURE Life Experiences","Travel + Leisure Summit",
  "Condé Nast Traveller Conference","ATTA Adventure Travel World Summit",
  "Fam Trip","Client Event","Referral","Cold Outreach","Social Media",
  "Trade Show","Webinar","Conference","Workshop","Other",
];

const TYPE_COLORS: Record<string, string> = {
  "Luxury Hotel / Resort": "bg-blue-50 text-blue-700 border-blue-200",
  "Boutique Hotel":        "bg-teal-50 text-teal-700 border-teal-200",
  "Budget Hotel":          "bg-slate-50 text-slate-600 border-slate-200",
  "Villa / Private Stay":  "bg-teal-50 text-teal-700 border-teal-200",
  "Transport":             "bg-amber-50 text-amber-700 border-amber-200",
  "Car Rental":            "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Flight / GSA":          "bg-sky-50 text-sky-700 border-sky-200",
  "Cruise":                "bg-teal-50 text-teal-700 border-teal-200",
  "Tour Operator":         "bg-teal-50 text-teal-700 border-teal-200",
  "Travel Agency":         "bg-pink-50 text-pink-700 border-pink-200",
  "Tourism Board":         "bg-orange-50 text-orange-700 border-orange-200",
  "Local Guide":           "bg-lime-50 text-lime-700 border-lime-200",
  "Activity Provider":     "bg-green-50 text-green-700 border-green-200",
  "Visa Agent":            "bg-red-50 text-red-700 border-red-200",
  "Insurance":             "bg-teal-50 text-teal-700 border-teal-200",
  "Restaurant":            "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  "Other":                 "bg-gray-50 text-gray-600 border-gray-200",
};

interface Supplier {
  notion_id:     string;
  name:          string;
  designation:   string;
  company:       string;
  place:         string;
  phone:         string;
  email:         string;
  supplier_type: string;
  event:         string;
  url:           string;
}

type SupplierForm = Omit<Supplier, "notion_id">;

const EMPTY_FORM: SupplierForm = {
  name: "", designation: "", company: "",
  place: "",
  phone: "", email: "", supplier_type: "", event: "", url: "",
};

/* ── Backend API helpers ─────────────────────────────────────────── */
const BACKEND_API = API_ROOT; // was the laptop-only address

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${BACKEND_API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.detail || data.error || `Request failed (${response.status})`,
    );
  }
  return data as T;
}

async function fetchAllSuppliers(): Promise<Supplier[]> {
  const data = await apiRequest<{
    success: boolean;
    suppliers: Supplier[];
  }>("/suppliers");
  return data.suppliers || [];
}

async function createSupplier(
  form: SupplierForm,
): Promise<Supplier> {
  const data = await apiRequest<{
    success: boolean;
    supplier: Supplier;
  }>("/suppliers", {
    method: "POST",
    body: JSON.stringify(form),
  });
  return data.supplier;
}

async function updateSupplier(
  supplierId: string,
  form: SupplierForm,
): Promise<Supplier> {
  const data = await apiRequest<{
    success: boolean;
    supplier: Supplier;
  }>(`/suppliers/${supplierId}`, {
    method: "PUT",
    body: JSON.stringify(form),
  });
  return data.supplier;
}

async function deleteSupplier(
  supplierId: string,
): Promise<void> {
  await apiRequest(`/suppliers/${supplierId}`, {
    method: "DELETE",
  });
}

function findDuplicate(suppliers: Supplier[], form: SupplierForm, excludeId?: string): Supplier | null {
  const n = form.name.trim().toLowerCase();
  const p = form.phone.trim().toLowerCase();
  const e = form.email.trim().toLowerCase();
  if (!n) return null;
  return suppliers.find(s => {
    if (excludeId && s.notion_id === excludeId) return false;
    const sn = (s.name === "—" ? "" : s.name).toLowerCase();
    if (sn !== n) return false;
    return (p && s.phone.toLowerCase() === p) || (e && s.email.toLowerCase() === e);
  }) ?? null;
}

function getDuplicateGroups(suppliers: Supplier[]): Supplier[][] {
  const groups: Supplier[][] = [];
  const visited = new Set<string>();
  suppliers.forEach((s, i) => {
    if (visited.has(s.notion_id)) return;
    const group = [s];
    suppliers.forEach((t, j) => {
      if (i >= j || visited.has(t.notion_id)) return;
      const sn = (s.name === "—" ? "" : s.name).toLowerCase();
      const tn = (t.name === "—" ? "" : t.name).toLowerCase();
      if (!sn || sn !== tn) return;
      const samePhone = s.phone && t.phone && s.phone.toLowerCase() === t.phone.toLowerCase();
      const sameEmail = s.email && t.email && s.email.toLowerCase() === t.email.toLowerCase();
      if (samePhone || sameEmail) { group.push(t); visited.add(t.notion_id); }
    });
    if (group.length > 1) { visited.add(s.notion_id); groups.push(group); }
  });
  return groups;
}

/* ── Searchable Dropdown ─────────────────────────────────────────── */
function SearchableDropdown({
  label, value, options, placeholder, onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState("");
  const containerRef          = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLInputElement>(null);

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery("");
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleSelect = (opt: string) => {
    onChange(opt); setOpen(false); setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <button
        type="button"
        onClick={() => { setOpen(p => !p); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="w-full h-9 px-3 flex items-center justify-between rounded-md border border-input bg-background text-sm text-left hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors"
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {value || placeholder || "Select…"}
        </span>
        <ChevronDown className={"h-3.5 w-3.5 text-muted-foreground transition-transform " + (open ? "rotate-180" : "")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.13 }}
            className="absolute z-[60] mt-1 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden"
          >
            {/* Search */}
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            {/* Options */}
            <div className="max-h-48 overflow-y-auto py-1">
              {/* Clear option */}
              {value && (
                <button
                  type="button"
                  onClick={() => handleSelect("")}
                  className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors italic"
                >
                  — Clear selection
                </button>
              )}
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground text-center">No results</p>
              ) : filtered.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={"w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors " + (value === opt ? "font-semibold text-emerald-600 bg-emerald-50" : "text-card-foreground")}
                >
                  {opt}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Reusable form fields ────────────────────────────────────────── */
function SupplierFields({ form, setF }: { form: SupplierForm; setF: (k: keyof SupplierForm, v: string) => void }) {
  return (
    <div className="space-y-3">
      {/* Name */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Name <span className="text-red-500">*</span></label>
        <Input placeholder="e.g. Gianluca Borgna" value={form.name} onChange={e => setF("name", e.target.value)} className="h-9" />
      </div>

      {/* Designation + Working At */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Designation</label>
          <Input placeholder="e.g. Sales Manager" value={form.designation} onChange={e => setF("designation", e.target.value)} className="h-9" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Working At</label>
          <Input placeholder="e.g. Grand Hotel Alassio" value={form.company} onChange={e => setF("company", e.target.value)} className="h-9" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Place</label>
          <Input
            placeholder="e.g. Milan, Italy"
            value={form.place}
            onChange={e => setF("place", e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      {/* Email + Phone */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
          <Input placeholder="name@company.com" value={form.email} onChange={e => setF("email", e.target.value)} className="h-9" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
          <Input placeholder="+91 98765 43210" value={form.phone} onChange={e => setF("phone", e.target.value)} className="h-9" />
        </div>
      </div>

      {/* Supplier Type + Met Where — searchable dropdowns */}
      <div className="grid grid-cols-2 gap-3">
        <SearchableDropdown
          label="Supplier Type"
          value={form.supplier_type}
          options={SUPPLIER_TYPES}
          placeholder="Select type…"
          onChange={v => setF("supplier_type", v)}
        />
        <SearchableDropdown
          label="Met Where"
          value={form.event}
          options={MET_WHERE_OPTIONS}
          placeholder="Select event…"
          onChange={v => setF("event", v)}
        />
      </div>

      {/* URL */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">URL / Website</label>
        <Input placeholder="ghalassio.com" value={form.url} onChange={e => setF("url", e.target.value)} className="h-9" />
      </div>
    </div>
  );
}

/* ── Mini supplier card used in dialogs ─────────────────────────── */
function SupplierCard({ s, label, labelClass }: { s: Supplier; label: string; labelClass: string }) {
  return (
    <div className="rounded-lg border p-3 space-y-1.5 bg-muted/30">
      <div className="flex items-center gap-2">
        <span className={"text-[11px] font-semibold px-2 py-0.5 rounded-full " + labelClass}>{label}</span>
        <p className="font-semibold text-sm text-card-foreground">{s.name}</p>
      </div>
      {s.designation && <p className="text-xs text-muted-foreground italic">{s.designation}</p>}
      {s.company && <p className="text-xs text-muted-foreground">{s.company}</p>}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {s.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</span>}
        {s.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</span>}
      </div>
      {s.supplier_type && (
        <span className={"text-[11px] font-medium px-2 py-0.5 rounded-full border " + (TYPE_COLORS[s.supplier_type] ?? "bg-gray-50 text-gray-600 border-gray-200")}>
          {s.supplier_type}
        </span>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
export default function Suppliers() {
  const [suppliers, setSuppliers]       = useState<Supplier[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [search, setSearch]             = useState("");
  const [typeFilter, setTypeFilter]     = useState("All");
  const [showFilter, setShowFilter]     = useState(false);
  const [page, setPage]                 = useState(1);
  const PER_PAGE = 15;

  /* Add/Edit modal */
  const [showModal, setShowModal]       = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [form, setForm]                 = useState<SupplierForm>({ ...EMPTY_FORM });
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess]   = useState(false);

  /* Duplicate warning dialog */
  const [showDupDialog, setShowDupDialog]     = useState(false);
  const [dupMatch, setDupMatch]               = useState<Supplier | null>(null);
  const [dupForm, setDupForm]                 = useState<SupplierForm>({ ...EMPTY_FORM });
  const [dupSaving, setDupSaving]             = useState(false);
  const [dupSaveError, setDupSaveError]       = useState<string | null>(null);
  const [dupSaveSuccess, setDupSaveSuccess]   = useState(false);
  const [deletingId, setDeletingId]           = useState<string | null>(null);

  /* View duplicates dialog */
  const [showViewDups, setShowViewDups]       = useState(false);
  const [deletingViewId, setDeletingViewId]   = useState<string | null>(null);

  /* CSV */
  const [importing, setImporting]       = useState(false);
  const [importMsg, setImportMsg]       = useState<string | null>(null);

  /* 3-dot menu */
  const [openMenu, setOpenMenu]         = useState<string | null>(null);
  const [menuPos, setMenuPos]           = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const csvRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const load = async () => {
    setLoading(true); setError(null);
    try { setSuppliers(await fetchAllSuppliers()); }
    catch (e: any) { setError(e.message ?? "Unknown error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditingId(null); setForm({ ...EMPTY_FORM });
    setSaveError(null); setSaveSuccess(false); setShowModal(true);
  };

  const openEdit = (s: Supplier) => {
    setEditingId(s.notion_id);
    setForm({
      name: s.name === "—" ? "" : s.name,
      designation: s.designation,
      place: s.place || "",
      company: s.company,
      phone: s.phone, email: s.email,
      supplier_type: s.supplier_type, event: s.event, url: s.url,
    });
    setSaveError(null); setSaveSuccess(false); setOpenMenu(null); setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false); setEditingId(null); setForm({ ...EMPTY_FORM });
    setSaveError(null); setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setSaveError("Name is required."); return; }
    if (!editingId) {
      const dup = findDuplicate(suppliers, form);
      if (dup) {
        setShowModal(false);
        setDupMatch(dup);
        setDupForm({ ...form });
        setDupSaveError(null); setDupSaveSuccess(false); setDeletingId(null);
        setShowDupDialog(true);
        return;
      }
    }
    setSaving(true); setSaveError(null);
    try {
      if (editingId) {
        const updated = await updateSupplier(editingId, form);
        setSuppliers(prev => prev.map(s => s.notion_id === editingId ? updated : s));
      } else {
        const created = await createSupplier(form);
        setSuppliers(prev => [created, ...prev]);
      }
      setSaveSuccess(true);
      setTimeout(() => closeModal(), 1000);
    } catch (e: any) { setSaveError(e.message ?? "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleDupSave = async (deleteWhich: "original" | "none") => {
    if (!dupForm.name.trim()) { setDupSaveError("Name is required."); return; }
    setDupSaving(true); setDupSaveError(null);
    try {
      if (deleteWhich === "original" && dupMatch) {
        setDeletingId(dupMatch.notion_id);
        await deleteSupplier(dupMatch.notion_id);
        setSuppliers(prev => prev.filter(s => s.notion_id !== dupMatch.notion_id));
        const created = await createSupplier(dupForm);
        setSuppliers(prev => [created, ...prev]);
      } else {
        const created = await createSupplier(dupForm);
        setSuppliers(prev => [created, ...prev]);
      }
      setDupSaveSuccess(true);
      setTimeout(() => {
        setShowDupDialog(false); setDupMatch(null);
        setDupForm({ ...EMPTY_FORM }); setDupSaveSuccess(false); setDeletingId(null);
      }, 1000);
    } catch (e: any) { setDupSaveError(e.message ?? "Failed to save"); setDeletingId(null); }
    finally { setDupSaving(false); }
  };

  const handleDeleteFromView = async (notionId: string) => {
    setDeletingViewId(notionId);
    try {
      await deleteSupplier(notionId);
      setSuppliers(prev => prev.filter(s => s.notion_id !== notionId));
    } catch (e: any) { alert("Delete failed: " + e.message); }
    finally { setDeletingViewId(null); }
  };

  const setDupF = (k: keyof SupplierForm, v: string) => setDupForm(p => ({ ...p, [k]: v }));

  /* CSV Import */
  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true); setImportMsg(null);
    try {
      const text  = await file.text();
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) { setImportMsg("CSV has no data rows."); return; }
      const rawHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
      const headerMap: Record<number, keyof SupplierForm> = {};
      rawHeaders.forEach((h, i) => {
        if (["name","full name"].includes(h))                                               headerMap[i] = "name";
        else if (["designation","title","job title","role"].includes(h))                    headerMap[i] = "designation";
        else if (["company","working at","organisation","hotel"].includes(h))               headerMap[i] = "company";
        else if (["phone","phone number","mobile"].includes(h))                             headerMap[i] = "phone";
        else if (["email","email address"].includes(h))                                     headerMap[i] = "email";
        else if (["supplier type","supplier_type","type","category"].includes(h))           headerMap[i] = "supplier_type";
        else if (["event","met where","met_where"].includes(h))                             headerMap[i] = "event";
        else if (["url","website","url/website","link"].includes(h))                        headerMap[i] = "url";
      });
      const rows: SupplierForm[] = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        if (vals.every(v => !v)) continue;
        const row: SupplierForm = { ...EMPTY_FORM };
        Object.entries(headerMap).forEach(([idx, field]) => { row[field] = vals[parseInt(idx)] || ""; });
        if (!row.name.trim()) continue;
        rows.push(row);
      }
      if (!rows.length) { setImportMsg("No valid rows found."); return; }
      let success = 0, failed = 0, skipped = 0;
      const created: Supplier[] = [];
      for (const row of rows) {
        if (findDuplicate(suppliers, row)) { skipped++; continue; }
        try { const ns = await createSupplier(row); created.push(ns); success++; }
        catch { failed++; }
      }
      if (created.length > 0) setSuppliers(prev => [...created, ...prev]);
      const parts = [];
      if (success > 0) parts.push("✅ " + success + " imported");
      if (skipped > 0) parts.push("⚠️ " + skipped + " skipped (duplicates)");
      if (failed > 0)  parts.push("❌ " + failed + " failed");
      setImportMsg(parts.join("  ·  "));
    } catch (err: any) { setImportMsg("❌ Import failed: " + (err.message ?? "Unknown error")); }
    finally {
      setImporting(false);
      if (csvRef.current) csvRef.current.value = "";
      setTimeout(() => setImportMsg(null), 6000);
    }
  };

  const setF = (k: keyof SupplierForm, v: string) => setForm(p => ({ ...p, [k]: v }));

  const stats = {
    total:    suppliers.length,
    luxury:   suppliers.filter(s => s.supplier_type.toLowerCase().includes("luxury")).length,
    agencies: suppliers.filter(s => ["Travel Agency","Tour Operator"].includes(s.supplier_type)).length,
    places:   new Set(suppliers.map(s => s.company).filter(Boolean)).size,
  };

  const dupGroups = getDuplicateGroups(suppliers);
  const dupCount  = dupGroups.reduce((n, g) => n + g.length, 0);

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase();
    const hit = !q || s.name.toLowerCase().includes(q) ||
      s.designation.toLowerCase().includes(q) ||
      s.company.toLowerCase().includes(q) ||
      s.supplier_type.toLowerCase().includes(q) || s.event.toLowerCase().includes(q);
    return hit && (typeFilter === "All" || s.supplier_type === typeFilter);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paged      = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const normalizeUrl = (u: string) => !u ? "#" : u.startsWith("http") ? u : "https://" + u;

  return (
    <DashboardLayout>
      <div className="max-w-full mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif text-foreground">Supplier Contact Information</h1>
            <p className="text-sm text-muted-foreground mt-1">Live from Supabase · {suppliers.length} suppliers</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
            <Button variant="outline" size="sm" className="gap-2 h-9 border-blue-200 text-blue-600 hover:bg-blue-50"
              onClick={load} disabled={loading}>
              <RefreshCw className={"h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} />
              {loading ? "Loading…" : "Refresh"}
            </Button>
            <Button variant="outline" size="sm" className="gap-2 h-9 border-teal-200 text-teal-600 hover:bg-teal-50"
              onClick={() => csvRef.current?.click()} disabled={importing}>
              {importing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Importing…</> : <><Upload className="h-3.5 w-3.5" />Import CSV</>}
            </Button>
            <Button size="sm" className="gap-2 h-9 bg-primary text-white hover:opacity-90" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5" /> Add Supplier
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-red-700">Supabase fetch failed</p>
              <p className="text-xs text-red-500 mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {importMsg && (
          <div className={"flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-sm " + (
            importMsg.startsWith("✅") ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : importMsg.includes("⚠️") ? "bg-amber-50 border-amber-200 text-amber-700"
            : "bg-red-50 border-red-200 text-red-700")}>
            <span>{importMsg}</span>
            <button onClick={() => setImportMsg(null)}><X className="h-3.5 w-3.5 opacity-60 hover:opacity-100" /></button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label:"Total Contacts", value:stats.total,    icon:Building2, color:"text-blue-600",   bg:"bg-blue-50"   },
            { label:"Luxury Hotels",  value:stats.luxury,   icon:Tag,       color:"text-teal-600", bg:"bg-teal-50" },
            { label:"Agencies",       value:stats.agencies, icon:Globe,     color:"text-emerald-600",bg:"bg-emerald-50"},
            { label:"Companies",      value:stats.places,   icon:MapPin,    color:"text-orange-600", bg:"bg-orange-50" },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.3, delay:i*0.06 }}
              className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className={"h-8 w-8 rounded-lg " + s.bg + " flex items-center justify-center"}>
                  <s.icon className={"h-4 w-4 " + s.color} />
                </div>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-2xl font-semibold">{s.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Search + Filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search name, designation, company, event…" className="pl-9 h-10"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            {search && <button onClick={() => { setSearch(""); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="relative">
            <Button variant="outline" size="sm" className="gap-2 h-10" onClick={() => setShowFilter(p => !p)}>
              <Filter className="h-3.5 w-3.5" />
              {typeFilter === "All" ? "All Types" : typeFilter}
              <ChevronDown className="h-3 w-3" />
            </Button>
            <AnimatePresence>
              {showFilter && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowFilter(false)} />
                  <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-4 }} transition={{ duration:0.15 }}
                    className="absolute top-full mt-1 left-0 z-40 bg-card border border-border rounded-xl shadow-lg min-w-[200px] py-1 max-h-72 overflow-y-auto">
                    {["All",...SUPPLIER_TYPES].map(t => (
                      <button key={t} onClick={() => { setTypeFilter(t); setShowFilter(false); setPage(1); }}
                        className={"w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors " + (typeFilter === t ? "font-semibold text-emerald-600" : "text-card-foreground")}>
                        {t}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Duplicates button */}
          <Button variant="outline" size="sm"
            className={"gap-2 h-10 " + (dupCount > 0 ? "border-orange-300 text-orange-600 hover:bg-orange-50" : "border-border text-muted-foreground hover:bg-muted")}
            onClick={() => setShowViewDups(true)}>
            <Copy className="h-3.5 w-3.5" />
            Duplicates
            {dupCount > 0 && (
              <span className="text-[11px] font-semibold bg-orange-100 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded-full">
                {dupCount}
              </span>
            )}
          </Button>

          {(search || typeFilter !== "All") && (
            <Button variant="ghost" size="sm" className="h-10 text-muted-foreground gap-1" onClick={() => { setSearch(""); setTypeFilter("All"); setPage(1); }}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Table */}
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.35, delay:0.2 }}
          className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
              <p className="text-sm text-muted-foreground">Fetching from Supabase…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["Name","Designation","Working At","Place","Email","Phone","URL / Website","Supplier Type","Met Where","Actions"].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 ? (
                    <tr><td colSpan={10} className="px-6 py-16 text-center text-sm text-muted-foreground">
                      {error ? "Fix the error above then refresh." : search || typeFilter !== "All" ? "No suppliers match your search." : "No data yet. Click Add Supplier, Import CSV, or Refresh."}
                    </td></tr>
                  ) : paged.map((s, i) => (
                    <tr key={s.notion_id || i} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors group">
                      {/* Name */}
                      <td className="px-4 py-3 min-w-[150px]">
                        <p className="font-semibold text-sm text-card-foreground whitespace-nowrap">{s.name}</p>
                        {s.company && <p className="text-xs text-muted-foreground whitespace-nowrap">{s.company}</p>}
                      </td>
                      {/* Designation */}
                      <td className="px-4 py-3 min-w-[140px] text-xs text-muted-foreground whitespace-nowrap">
                        {s.designation || "—"}
                      </td>
                      {/* Working At */}
                      <td className="px-4 py-3 min-w-[150px] text-xs text-muted-foreground whitespace-nowrap">
                        {s.company || "—"}
                      </td>
                      {/* Place */}
                      <td className="px-4 py-3 min-w-[150px] text-xs text-muted-foreground whitespace-nowrap">
                        {s.place || "—"}
                      </td>
                      {/* Email */}
                      <td className="px-4 py-3 min-w-[200px]">
                        {s.email ? <a href={"mailto:"+s.email} className="flex items-center gap-1 text-xs text-blue-500 hover:underline whitespace-nowrap"><Mail className="h-3 w-3 shrink-0" />{s.email}</a> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      {/* Phone */}
                      <td className="px-4 py-3 min-w-[160px]">
                        {s.phone ? <a href={"tel:"+s.phone} className="flex items-center gap-1 text-xs text-card-foreground hover:text-primary whitespace-nowrap"><Phone className="h-3 w-3 shrink-0" />{s.phone}</a> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      {/* URL */}
                      <td className="px-4 py-3 min-w-[150px]">
                        {s.url ? <a href={normalizeUrl(s.url)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-500 hover:underline whitespace-nowrap"><Globe className="h-3 w-3 shrink-0" />{s.url.replace(/^https?:\/\//,"").slice(0,22)}<ExternalLink className="h-2.5 w-2.5" /></a> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      {/* Supplier Type */}
                      <td className="px-4 py-3 min-w-[160px]">
                        {s.supplier_type ? <span className={"text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap " + (TYPE_COLORS[s.supplier_type] ?? "bg-gray-50 text-gray-600 border-gray-200")}>{s.supplier_type}</span> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      {/* Met Where */}
                      <td className="px-4 py-3 min-w-[160px]">
                        {s.event ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">{s.event}</span> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      {/* Actions */}
                      <td className="px-3 py-3 min-w-[120px]">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(s)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all whitespace-nowrap">
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                          <button onClick={e => { const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect(); setMenuPos({ top: rect.bottom+4, left: rect.right-160 }); setOpenMenu(openMenu === s.notion_id ? null : s.notion_id); }}
                            className="p-1.5 rounded-lg hover:bg-muted transition-all text-muted-foreground hover:text-foreground">
                            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Showing {((page-1)*PER_PAGE)+1}–{Math.min(page*PER_PAGE, filtered.length)} of {filtered.length}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}>‹</Button>
              {Array.from({length:totalPages},(_,i)=>i+1).filter(p => p===1||p===totalPages||Math.abs(p-page)<=1).map((p,idx,arr) => (
                <span key={p} className="flex items-center gap-1">
                  {idx>0&&arr[idx-1]!==p-1&&<span className="px-1 text-xs text-muted-foreground">…</span>}
                  <Button variant={p===page?"default":"outline"} size="sm" className={"h-8 w-8 p-0 " + (p===page?"bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600":"")} onClick={() => setPage(p)}>{p}</Button>
                </span>
              ))}
              <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}>›</Button>
            </div>
          </div>
        )}
      </div>

      {/* 3-dot dropdown */}
      <AnimatePresence>
        {openMenu && menuPos && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
            <motion.div ref={menuRef} initial={{ opacity:0, scale:0.92, y:-4 }} animate={{ opacity:1, scale:1, y:0 }} exit={{ opacity:0, scale:0.92, y:-4 }} transition={{ duration:0.12 }}
              style={{ top:menuPos.top, left:menuPos.left }} className="fixed z-50 bg-card border border-border rounded-xl shadow-lg min-w-[164px] overflow-hidden">
              <button onClick={() => { const s = suppliers.find(s => s.notion_id===openMenu); if(s) openEdit(s); }} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-card-foreground hover:bg-muted transition-colors">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Edit
              </button>
              <div className="h-px bg-border mx-2" />
              <button
                onClick={() => {
                  const s = suppliers.find(s => s.notion_id === openMenu);
                  if (s && s.url) window.open(normalizeUrl(s.url), "_blank");
                  setOpenMenu(null);
                }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-card-foreground hover:bg-muted transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /> Open Website
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════
          VIEW DUPLICATES DIALOG
      ══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showViewDups && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.95 }}
              className="bg-card rounded-xl border shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="font-serif text-lg text-card-foreground">Duplicate Suppliers</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{dupGroups.length} group{dupGroups.length !== 1 ? "s" : ""} · {dupCount} entries total</p>
                </div>
                <button onClick={() => setShowViewDups(false)} className="text-muted-foreground hover:text-foreground p-1"><X className="h-4 w-4" /></button>
              </div>
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
                {dupGroups.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Copy className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No duplicate suppliers found.</p>
                  </div>
                ) : dupGroups.map((group, gi) => (
                  <div key={gi} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground ">Group {gi + 1}</p>
                    {group.map((s, si) => (
                      <div key={s.notion_id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={"text-[11px] font-semibold px-2 py-0.5 rounded-full " + (si === 0 ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700")}>
                              {si === 0 ? "Original" : "Duplicate " + si}
                            </span>
                            <p className="font-semibold text-sm text-card-foreground">{s.name}</p>
                          </div>
                          {s.designation && <p className="text-xs text-muted-foreground italic">{s.designation}</p>}
                          {s.company && <p className="text-xs text-muted-foreground">{s.company}</p>}
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            {s.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</span>}
                            {s.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteFromView(s.notion_id)}
                          disabled={deletingViewId === s.notion_id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs hover:bg-red-100 transition-colors shrink-0 disabled:opacity-50">
                          {deletingViewId === s.notion_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 border-t border-border">
                <Button variant="outline" size="sm" className="w-full" onClick={() => setShowViewDups(false)}>Close</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════
          DUPLICATE WARNING DIALOG (when adding)
      ══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showDupDialog && dupMatch && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.95 }}
              className="bg-card rounded-xl border shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

              <div className="bg-orange-50 border-b border-orange-200 px-6 py-4 rounded-t-xl">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <Copy className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-orange-800">Duplicate Entry Detected</p>
                    <p className="text-xs text-orange-700 mt-0.5">
                      A supplier with the same name and phone/email already exists.
                    </p>
                  </div>
                  <button onClick={() => { setShowDupDialog(false); setShowModal(true); }} className="text-orange-400 hover:text-orange-600 p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <SupplierCard s={dupMatch} label="Existing" labelClass="bg-blue-100 text-blue-700" />
                  <SupplierCard s={{ notion_id:"", ...dupForm }} label="New Entry" labelClass="bg-orange-100 text-orange-700" />
                </div>

                <div className="bg-muted/40 rounded-lg p-4">
                  <p className="text-sm font-medium text-card-foreground mb-1">What would you like to do?</p>
                  <p className="text-xs text-muted-foreground">You can edit the new entry fields below before saving.</p>
                </div>

                {dupSaveSuccess && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                    <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}><path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <p className="text-sm text-emerald-700 font-medium">Saved to Supabase!</p>
                  </div>
                )}
                {dupSaveError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600">{dupSaveError}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3">Edit new entry if needed</p>
                  <SupplierFields form={dupForm} setF={setDupF} />
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-border">
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2"
                    onClick={() => { setShowDupDialog(false); setShowModal(true); }}>
                    ← Go Back &amp; Edit Original
                  </Button>
                  <Button size="sm"
                    className="w-full justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleDupSave("none")} disabled={dupSaving || dupSaveSuccess}>
                    {dupSaving && deletingId === null
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
                      : <><Copy className="h-3.5 w-3.5" />Save as Duplicate (keep both)</>}
                  </Button>
                  <Button size="sm"
                    className="w-full justify-center gap-2 bg-red-500 hover:bg-red-600 text-white"
                    onClick={() => handleDupSave("original")} disabled={dupSaving || dupSaveSuccess}>
                    {dupSaving && deletingId !== null
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Deleting original &amp; saving…</>
                      : <><Trash2 className="h-3.5 w-3.5" />Delete Original &amp; Save New</>}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════
          ADD / EDIT MODAL
      ══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.95 }}
              className="bg-card rounded-xl border shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-serif text-lg text-card-foreground">{editingId ? "Edit Supplier" : "Add Supplier"}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{editingId ? "Updates the record in Supabase" : "Saves directly to Supabase"}</p>
                </div>
                <button onClick={closeModal} className="text-muted-foreground hover:text-foreground p-1"><X className="h-4 w-4" /></button>
              </div>
              {saveSuccess && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-4">
                  <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}><path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <p className="text-sm text-emerald-700 font-medium">{editingId ? "Updated in Supabase!" : "Saved to Supabase!"}</p>
                </div>
              )}
              {saveError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600">{saveError}</p>
                </div>
              )}
              <SupplierFields form={form} setF={setF} />
              <div className="flex gap-2 mt-5 pt-4 border-t border-border">
                <Button variant="outline" size="sm" className="flex-1" onClick={closeModal}>Cancel</Button>
                <Button size="sm" className="flex-1 bg-primary text-white hover:opacity-90 gap-2"
                  onClick={handleSave} disabled={saving || saveSuccess}>
                  {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{editingId ? "Updating…" : "Saving…"}</>
                    : saveSuccess ? "✓ Done!"
                    : editingId ? <><Pencil className="h-3.5 w-3.5" />Update in Supabase</>
                    : <><Plus className="h-3.5 w-3.5" />Save to Supabase</>}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Handshake, Plus, Search, Edit3, Trash2,
  MapPin, IndianRupee, Calendar, Building2, X,
  Loader2, AlertCircle, CheckCircle2, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase client ──────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── Types ────────────────────────────────────────────────────────────────────
type DealStatus = "Active" | "Pending" | "Closed" | "Negotiating";

interface Deal {
  id:           string;
  supplier_id:  string | null;
  supplier_name: string;
  type:         string;
  destination:  string;
  value:        number | null;
  status:       DealStatus;
  start_date:   string;
  end_date:     string;
  commission:   string;
  notes:        string;
  created_at?:  string;
}

interface Supplier {
  id:   string;
  name: string;
  company_name: string | null;
  place: string | null;
  supplier_type: string | null;
}

const EMPTY_FORM: Omit<Deal, "id" | "created_at"> = {
  supplier_id:   null,
  supplier_name: "",
  type:          "",
  destination:   "",
  value:         null,
  status:        "Pending",
  start_date:    "",
  end_date:      "",
  commission:    "",
  notes:         "",
};

const STATUS_STYLE: Record<DealStatus, { bg: string; text: string; dot: string }> = {
  Active:      { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  Negotiating: { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500"   },
  Pending:     { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500"    },
  Closed:      { bg: "bg-gray-50",    text: "text-gray-600",    dot: "bg-gray-400"    },
};

const STATUSES: DealStatus[] = ["Active", "Pending", "Negotiating", "Closed"];

const DEAL_TYPES = [
  "Luxury Hotel / Resort", "Budget Hotel", "Transport", "Cruise",
  "Activity Provider", "Tour Operator", "Flight", "Other",
];

// ─── Toast ────────────────────────────────────────────────────────────────────
interface Toast { id: number; message: string; type: "success" | "error" }

function ToastList({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div key={t.id}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium pointer-events-auto
              ${t.type === "success"
                ? "bg-emerald-600 text-white"
                : "bg-red-600 text-white"}`}>
            {t.type === "success"
              ? <CheckCircle2 className="h-4 w-4 shrink-0" />
              : <AlertCircle className="h-4 w-4 shrink-0" />}
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Deal modal ───────────────────────────────────────────────────────────────
interface ModalProps {
  deal:      Partial<Deal> | null;
  suppliers: Supplier[];
  onClose:   () => void;
  onSave:    (data: Omit<Deal, "id" | "created_at">) => Promise<void>;
  saving:    boolean;
}

function DealModal({ deal, suppliers, onClose, onSave, saving }: ModalProps) {
  const [form, setForm] = useState<Omit<Deal, "id" | "created_at">>(
    deal ? {
      supplier_id:   deal.supplier_id   ?? null,
      supplier_name: deal.supplier_name ?? "",
      type:          deal.type          ?? "",
      destination:   deal.destination   ?? "",
      value:         deal.value         ?? null,
      status:        deal.status        ?? "Pending",
      start_date:    deal.start_date    ?? "",
      end_date:      deal.end_date      ?? "",
      commission:    deal.commission    ?? "",
      notes:         deal.notes         ?? "",
    } : { ...EMPTY_FORM }
  );

  const set = (k: keyof typeof form, v: unknown) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSupplierChange = (id: string) => {
    const sup = suppliers.find(s => s.id === id);
    set("supplier_id", id || null);
    if (sup) {
      set("supplier_name", sup.company_name ?? sup.name);
      if (sup.place) set("destination", sup.place);
      if (sup.supplier_type) set("type", sup.supplier_type);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(form);
  };

  const field = "w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 transition";
  const label = "block text-xs font-medium text-muted-foreground mb-1  ";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card z-10">
          <h2 className="text-base font-semibold text-foreground">
            {deal?.id ? "Edit Deal" : "New Deal"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Supplier picker */}
          <div>
            <label className={label}>Link to supplier (optional)</label>
            <div className="relative">
              <select
                className={field + " appearance-none pr-8"}
                value={form.supplier_id ?? ""}
                onChange={e => handleSupplierChange(e.target.value)}
              >
                <option value="">— Select a supplier —</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.company_name ?? s.name}{s.place ? ` · ${s.place}` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Supplier name */}
          <div>
            <label className={label}>Supplier / company name *</label>
            <Input
              required
              placeholder="e.g. Taj Hotels Rajasthan"
              value={form.supplier_name}
              onChange={e => set("supplier_name", e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* Type + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Deal type</label>
              <div className="relative">
                <select
                  className={field + " appearance-none pr-8"}
                  value={form.type}
                  onChange={e => set("type", e.target.value)}
                >
                  <option value="">Select type</option>
                  {DEAL_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div>
              <label className={label}>Status</label>
              <div className="relative">
                <select
                  className={field + " appearance-none pr-8"}
                  value={form.status}
                  onChange={e => set("status", e.target.value as DealStatus)}
                >
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Destination */}
          <div>
            <label className={label}>Destination</label>
            <Input
              placeholder="e.g. Jaipur, Rajasthan"
              value={form.destination}
              onChange={e => set("destination", e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* Value + Commission */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Deal value (₹)</label>
              <Input
                type="number"
                placeholder="e.g. 450000"
                value={form.value ?? ""}
                onChange={e => set("value", e.target.value ? Number(e.target.value) : null)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className={label}>Commission</label>
              <Input
                placeholder="e.g. 12%"
                value={form.commission}
                onChange={e => set("commission", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Start date</label>
              <Input
                type="date"
                value={form.start_date}
                onChange={e => set("start_date", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className={label}>End date</label>
              <Input
                type="date"
                value={form.end_date}
                onChange={e => set("end_date", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={label}>Notes</label>
            <textarea
              rows={3}
              placeholder="Any additional notes or context…"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              className={field + " resize-none"}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !form.supplier_name.trim()}
              className="flex-1 gap-2 bg-primary text-white hover:opacity-90"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {deal?.id ? "Save changes" : "Create deal"}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────
function DeleteConfirm({ name, onConfirm, onCancel, deleting }: {
  name: string; onConfirm: () => void; onCancel: () => void; deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="relative z-10 w-full max-w-sm rounded-2xl border bg-card shadow-xl p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <Trash2 className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Delete deal?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-medium">{name}</span> will be permanently removed.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button
            className="flex-1 gap-2 bg-red-500 hover:bg-red-600 text-white"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function ActiveDeals() {
  const [deals, setDeals]         = useState<Deal[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [filter, setFilter]       = useState("All");

  // Modal state
  const [editingDeal, setEditingDeal]   = useState<Deal | null | "new">(null);
  const [deletingDeal, setDeletingDeal] = useState<Deal | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const toast = (message: string, type: "success" | "error" = "success") => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  // ── Fetch ──
  useEffect(() => {
    Promise.all([fetchDeals(), fetchSuppliers()]);
  }, []);

  const fetchDeals = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("deals")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast(error.message, "error");
    else setDeals(data ?? []);
    setLoading(false);
  };

  const fetchSuppliers = async () => {
    const { data } = await supabase
      .from("suppliers")
      .select("id, name, company_name, place, supplier_type")
      .order("name");
    setSuppliers(data ?? []);
  };

  // ── Create / update ──
  const handleSave = async (form: Omit<Deal, "id" | "created_at">) => {
    setSaving(true);
    if (editingDeal === "new") {
      const { error } = await supabase.from("deals").insert([form]);
      if (error) toast(error.message, "error");
      else { toast("Deal created"); await fetchDeals(); setEditingDeal(null); }
    } else if (editingDeal) {
      const { error } = await supabase
        .from("deals").update(form).eq("id", editingDeal.id);
      if (error) toast(error.message, "error");
      else { toast("Deal updated"); await fetchDeals(); setEditingDeal(null); }
    }
    setSaving(false);
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deletingDeal) return;
    setDeleting(true);
    const { error } = await supabase.from("deals").delete().eq("id", deletingDeal.id);
    if (error) toast(error.message, "error");
    else { toast("Deal deleted"); await fetchDeals(); setDeletingDeal(null); }
    setDeleting(false);
  };

  // ── Filter ──
  const filtered = deals.filter(d => {
    const q = search.toLowerCase();
    const match = !q ||
      d.supplier_name.toLowerCase().includes(q) ||
      (d.destination ?? "").toLowerCase().includes(q);
    return match && (filter === "All" || d.status === filter);
  });

  const stats = {
    total:       deals.length,
    active:      deals.filter(d => d.status === "Active").length,
    negotiating: deals.filter(d => d.status === "Negotiating").length,
    pending:     deals.filter(d => d.status === "Pending").length,
  };

  const formatValue = (v: number | null) =>
    v != null ? `₹${v.toLocaleString("en-IN")}` : "—";

  return (
    <DashboardLayout>
      <div className="max-w-full mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif text-foreground">Active Deals</h1>
            <p className="text-sm text-muted-foreground mt-1">Supplier partnerships and negotiation tracker</p>
          </div>
          <Button
            size="sm"
            className="gap-2 bg-primary text-white hover:opacity-90"
            onClick={() => setEditingDeal("new")}
          >
            <Plus className="h-3.5 w-3.5" /> New Deal
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Deals",  value: stats.total,       color: "text-foreground"  },
            { label: "Active",       value: stats.active,      color: "text-emerald-700" },
            { label: "Negotiating",  value: stats.negotiating, color: "text-amber-700"   },
            { label: "Pending",      value: stats.pending,     color: "text-blue-700"    },
          ].map((s, i) => (
            <motion.div key={s.label}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
              className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className={"text-2xl font-semibold " + s.color}>{s.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search deals…"
              className="pl-9 h-10"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {["All", "Active", "Negotiating", "Pending", "Closed"].map(f => (
              <button key={f}
                onClick={() => setFilter(f)}
                className={"px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border " +
                  (filter === f
                    ? "bg-teal-500 text-white border-teal-500"
                    : "border-border text-muted-foreground hover:bg-muted")}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Deals Grid */}
        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AnimatePresence>
              {filtered.map((deal, i) => {
                const st = STATUS_STYLE[deal.status] ?? STATUS_STYLE["Closed"];
                return (
                  <motion.div key={deal.id}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.25, delay: i * 0.05 }}
                    className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">

                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-card-foreground truncate">{deal.supplier_name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{deal.type || "—"}</p>
                      </div>
                      <span className={"flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shrink-0 " + st.bg + " " + st.text}>
                        <span className={"h-1.5 w-1.5 rounded-full " + st.dot} />
                        {deal.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                        <span className="truncate">{deal.destination || "—"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <IndianRupee className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span className="font-medium text-card-foreground">{formatValue(deal.value)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        <span>
                          {deal.start_date || "—"} → {deal.end_date || "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span>Commission: <span className="font-medium text-card-foreground">{deal.commission || "—"}</span></span>
                      </div>
                    </div>

                    {deal.notes && (
                      <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 mb-3 line-clamp-2">
                        {deal.notes}
                      </p>
                    )}

                    <div className="flex gap-2 pt-2 border-t border-border">
                      <Button
                        variant="outline" size="sm"
                        className="flex-1 gap-1.5 h-8 text-xs"
                        onClick={() => setEditingDeal(deal)}
                      >
                        <Edit3 className="h-3 w-3" /> Edit Deal
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="gap-1.5 h-8 text-xs text-red-500 hover:bg-red-50 hover:border-red-200"
                        onClick={() => setDeletingDeal(deal)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Handshake className="h-10 w-10 opacity-20" />
            <p className="text-sm">
              {deals.length === 0 ? "No deals yet. Create your first one." : "No deals match your search."}
            </p>
            {deals.length === 0 && (
              <Button
                size="sm"
                className="gap-2 bg-primary text-white hover:opacity-90 mt-1"
                onClick={() => setEditingDeal("new")}
              >
                <Plus className="h-3.5 w-3.5" /> New Deal
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {editingDeal !== null && (
          <DealModal
            key="deal-modal"
            deal={editingDeal === "new" ? {} : editingDeal}
            suppliers={suppliers}
            onClose={() => setEditingDeal(null)}
            onSave={handleSave}
            saving={saving}
          />
        )}
        {deletingDeal && (
          <DeleteConfirm
            key="delete-confirm"
            name={deletingDeal.supplier_name}
            onConfirm={handleDelete}
            onCancel={() => setDeletingDeal(null)}
            deleting={deleting}
          />
        )}
      </AnimatePresence>

      <ToastList toasts={toasts} />
    </DashboardLayout>
  );
}

export default ActiveDeals;

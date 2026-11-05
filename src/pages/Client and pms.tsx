import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { createClient } from "@supabase/supabase-js";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Briefcase, Search, Plus, RefreshCw, X,
  MapPin, Calendar, DollarSign, Clock, ChevronRight,
  CheckCircle2, AlertCircle, Circle, Loader2,
  TrendingUp, FileText, Phone, Mail, Trash2,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────
   SUPABASE
───────────────────────────────────────────── */
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface Client {
  id: string;
  name: string;
  contact_type: string;
  stage: string;
  destination: string | null;
  budget: string | null;
  created_at: string;
  email: string;
  phone: string;
  trips_count: number;
  total_spend: number;
}

interface Trip {
  id: string;
  trip_id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  client: string;
  project_lead: string;
  places: string;
  description: string | null;
  budget: string | null;
  created_at: string;
}

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const TRIP_STATUS_META: Record<string, { label: string; color: string; bg: string; icon: typeof Circle }> = {
  Complete:    { label: "Complete",    color: "text-green-600",  bg: "bg-green-100",  icon: CheckCircle2 },
  Confirmed:   { label: "Confirmed",   color: "text-blue-600",   bg: "bg-blue-100",   icon: CheckCircle2 },
  Ongoing:     { label: "Ongoing",     color: "text-teal-600", bg: "bg-teal-100", icon: TrendingUp   },
  Enquiry:     { label: "Enquiry",     color: "text-amber-600",  bg: "bg-amber-100",  icon: Circle       },
  Cancelled:   { label: "Cancelled",   color: "text-red-500",    bg: "bg-red-100",    icon: AlertCircle  },
  default:     { label: "Active",      color: "text-slate-600",  bg: "bg-slate-100",  icon: Circle       },
};

const STAGE_META: Record<string, { color: string; bg: string }> = {
  New:       { color: "text-blue-600",   bg: "bg-blue-100"   },
  new:       { color: "text-blue-600",   bg: "bg-blue-100"   },
  Contacted: { color: "text-amber-600",  bg: "bg-amber-100"  },
  Qualified: { color: "text-teal-600", bg: "bg-teal-100" },
  Booked:    { color: "text-green-600",  bg: "bg-green-100"  },
  default:   { color: "text-slate-600",  bg: "bg-slate-100"  },
};

const GRADS = [
  "from-teal-500 to-teal-600", "from-emerald-500 to-teal-600",
  "from-blue-500 to-cyan-600",     "from-orange-500 to-amber-600",
  "from-teal-500 to-pink-600",     "from-teal-500 to-blue-600",
];
const grad = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffff; return GRADS[h % GRADS.length]; };
const initials = (s: string) => s.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
const fmt = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const currency = (n: number) => n > 0 ? `₹${n.toLocaleString("en-IN")}` : "—";

/* ─────────────────────────────────────────────
   CONFIRM DELETE MODAL
───────────────────────────────────────────── */
function ConfirmDeleteModal({
  label,
  onConfirm,
  onCancel,
  loading,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Trash2 className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <p className="font-semibold text-card-foreground text-sm">Delete {label}?</p>
            <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} disabled={loading}
            className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   ADD CLIENT MODAL
───────────────────────────────────────────── */
function AddClientModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "", contact_type: "Individual", stage: "New",
    destination: "", budget: "", email: "", phone: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    setError("");

    // Insert contact
    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .insert({ name: form.name.trim(), contact_type: form.contact_type, stage: form.stage,
                destination: form.destination || null, budget: form.budget || null })
      .select("id")
      .single();

    if (contactErr || !contact) { setError(contactErr?.message ?? "Failed to save client."); setSaving(false); return; }

    // Insert email + phone if provided
    const promises = [];
    if (form.email.trim())
      promises.push(supabase.from("contact_emails").insert({ contact_id: contact.id, email: form.email.trim() }));
    if (form.phone.trim())
      promises.push(supabase.from("contact_phones").insert({ contact_id: contact.id, phone_number: form.phone.trim() }));
    await Promise.all(promises);

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="font-semibold text-card-foreground">Add New Client</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg bg-red-100 text-red-600 text-xs px-3 py-2 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
            </div>
          )}

          <Field label="Full Name *">
            <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Rahul Sharma"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact Type">
              <select value={form.contact_type} onChange={e => set("contact_type", e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 transition-all">
                {["Individual", "Corporate", "Group", "Family"].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Stage">
              <select value={form.stage} onChange={e => set("stage", e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 transition-all">
                {["New", "Contacted", "Qualified", "Booked"].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Email">
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@example.com"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
          </Field>

          <Field label="Phone">
            <input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+91 98765 43210"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
          </Field>

          <Field label="Destination">
            <input value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="e.g. Bali, Indonesia"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
          </Field>

          <Field label="Budget">
            <input value={form.budget} onChange={e => set("budget", e.target.value)} placeholder="e.g. ₹2,00,000"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
          </Field>
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-60">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Client
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   ADD TRIP MODAL
───────────────────────────────────────────── */
function AddTripModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    trip_id: "", name: "", client: "", project_lead: "",
    status: "Enquiry", places: "", description: "", budget: "",
    start_date: "", end_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Trip name is required."); return; }
    setSaving(true);
    setError("");

    const { error: err } = await supabase.from("trips").insert({
      trip_id:      form.trip_id.trim() || null,
      name:         form.name.trim(),
      client:       form.client.trim() || null,
      project_lead: form.project_lead.trim() || null,
      status:       form.status,
      places:       form.places.trim() || null,
      description:  form.description.trim() || null,
      budget:       form.budget.trim() || null,
      start_date:   form.start_date || null,
      end_date:     form.end_date || null,
    });

    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="font-semibold text-card-foreground">Add New Project</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg bg-red-100 text-red-600 text-xs px-3 py-2 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Trip ID">
              <input value={form.trip_id} onChange={e => set("trip_id", e.target.value)} placeholder="e.g. TR-001"
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => set("status", e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 transition-all">
                {["Enquiry", "Confirmed", "Ongoing", "Complete", "Cancelled"].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Trip Name *">
            <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Europe Grand Tour"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
          </Field>

          <Field label="Client">
            <input value={form.client} onChange={e => set("client", e.target.value)} placeholder="Client name"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
          </Field>

          <Field label="Project Lead">
            <input value={form.project_lead} onChange={e => set("project_lead", e.target.value)} placeholder="Team member name"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
          </Field>

          <Field label="Places">
            <input value={form.places} onChange={e => set("places", e.target.value)} placeholder="e.g. Paris, Rome, Barcelona"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 transition-all" />
            </Field>
            <Field label="End Date">
              <input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 transition-all" />
            </Field>
          </div>

          <Field label="Budget">
            <input value={form.budget} onChange={e => set("budget", e.target.value)} placeholder="e.g. ₹5,00,000"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
          </Field>

          <Field label="Description">
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3}
              placeholder="Trip details, notes, itinerary highlights…"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
          </Field>
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-60">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Project
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* small helper */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-muted-foreground ">{label}</label>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────
   DETAIL DRAWERS
───────────────────────────────────────────── */
function ClientDrawer({
  client, onClose, onDelete,
}: { client: Client; onClose: () => void; onDelete: (id: string) => void }) {
  const [trips,      setTrips]      = useState<Trip[]>([]);
  const [loadTrips,  setLoadTrips]  = useState(true);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  useEffect(() => {
    supabase
      .from("trips")
      .select("*")
      .ilike("client", `%${client.name}%`)
      .order("created_at", { ascending: false })
      .then(({ data }) => { setTrips(data ?? []); setLoadTrips(false); });
  }, [client.id]);

  const handleDelete = async () => {
    setDeleting(true);
    await supabase.from("contact_emails").delete().eq("contact_id", client.id);
    await supabase.from("contact_phones").delete().eq("contact_id", client.id);
    await supabase.from("contacts").delete().eq("id", client.id);
    setDeleting(false);
    onDelete(client.id);
    onClose();
  };

  const meta = STAGE_META[client.stage] ?? STAGE_META.default;

  return (
    <>
      <AnimatePresence>
        {confirmDel && (
          <ConfirmDeleteModal
            label={`client "${client.name}"`}
            loading={deleting}
            onConfirm={handleDelete}
            onCancel={() => setConfirmDel(false)}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed right-0 top-0 h-full w-full max-w-md bg-card border-l border-border shadow-2xl z-50 flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 shrink-0">
          <div className={`h-11 w-11 rounded-full bg-[#3E6B6C] flex items-center justify-center text-sm font-semibold text-white shrink-0`}>
            {initials(client.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-card-foreground truncate">{client.name}</p>
            <p className="text-xs text-muted-foreground">{client.contact_type}</p>
          </div>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
            {client.stage}
          </span>
          <button onClick={() => setConfirmDel(true)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Trips",      value: String(client.trips_count) },
              { label: "Total Spend",value: currency(client.total_spend) },
              { label: "Since",      value: fmt(client.created_at).split(" ").slice(1).join(" ") },
            ].map(s => (
              <div key={s.label} className="rounded-xl bg-muted/40 border border-border p-3 text-center">
                <p className="text-lg font-semibold text-card-foreground">{s.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border p-4 space-y-2.5">
            <p className="text-xs font-semibold text-muted-foreground ">Contact</p>
            {client.email && (
              <div className="flex items-center gap-2 text-sm text-card-foreground">
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <a href={`mailto:${client.email}`} className="hover:underline text-blue-600 truncate">{client.email}</a>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center gap-2 text-sm text-card-foreground">
                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{client.phone}</span>
              </div>
            )}
            {client.destination && (
              <div className="flex items-center gap-2 text-sm text-card-foreground">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{client.destination}</span>
              </div>
            )}
            {!client.email && !client.phone && !client.destination && (
              <p className="text-xs text-muted-foreground">No contact details on record.</p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-3">Trip History</p>
            {loadTrips ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs">Loading trips…</span>
              </div>
            ) : trips.length === 0 ? (
              <div className="rounded-xl bg-muted/30 border border-border p-4 text-center">
                <p className="text-xs text-muted-foreground">No trips found for this client.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {trips.map(trip => {
                  const sm = TRIP_STATUS_META[trip.status] ?? TRIP_STATUS_META.default;
                  return (
                    <div key={trip.id} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-card-foreground leading-tight">{trip.name}</p>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${sm.bg} ${sm.color}`}>
                          {sm.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        {trip.trip_id && <span className="font-mono">{trip.trip_id}</span>}
                        {trip.start_date && <span className="flex items-center gap-1"><Calendar className="h-2.5 w-2.5" />{fmt(trip.start_date)}</span>}
                        {trip.project_lead && <span>{trip.project_lead}</span>}
                      </div>
                      {trip.description && <p className="text-[11px] text-muted-foreground">{trip.description}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

function TripDrawer({
  trip, onClose, onDelete,
}: { trip: Trip; onClose: () => void; onDelete: (id: string) => void }) {
  const sm = TRIP_STATUS_META[trip.status] ?? TRIP_STATUS_META.default;
  const StatusIcon = sm.icon;
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await supabase.from("trips").delete().eq("id", trip.id);
    setDeleting(false);
    onDelete(trip.id);
    onClose();
  };

  return (
    <>
      <AnimatePresence>
        {confirmDel && (
          <ConfirmDeleteModal
            label={`project "${trip.name}"`}
            loading={deleting}
            onConfirm={handleDelete}
            onCancel={() => setConfirmDel(false)}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed right-0 top-0 h-full w-full max-w-md bg-card border-l border-border shadow-2xl z-50 flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 shrink-0">
          <div className={`h-9 w-9 rounded-xl ${sm.bg} flex items-center justify-center shrink-0`}>
            <StatusIcon className={`h-4 w-4 ${sm.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-card-foreground text-sm truncate">{trip.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{trip.trip_id}</p>
          </div>
          <button onClick={() => setConfirmDel(true)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Status",     value: trip.status || "—" },
              { label: "Client",     value: trip.client || "—" },
              { label: "Start Date", value: fmt(trip.start_date) },
              { label: "End Date",   value: fmt(trip.end_date)   },
            ].map(s => (
              <div key={s.label} className="rounded-xl bg-muted/40 border border-border p-3">
                <p className="text-[11px] text-muted-foreground mb-1">{s.label}</p>
                <p className="text-sm font-semibold text-card-foreground">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground ">Details</p>
            {[
              { label: "Project Lead", value: trip.project_lead },
              { label: "Places",       value: trip.places       },
              { label: "Budget",       value: trip.budget       },
              { label: "Description",  value: trip.description  },
            ].filter(r => r.value).map(r => (
              <div key={r.label}>
                <p className="text-[11px] text-muted-foreground">{r.label}</p>
                <p className="text-sm text-card-foreground mt-0.5">{r.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Automations</p>
            <div className="space-y-2">
              {[
                { label: "Confirmation Email" },
                { label: "Review Request"     },
                { label: "Anniversary Email"  },
                { label: "Finance Created"    },
              ].map(a => (
                <div key={a.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{a.label}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Tracked</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
const ClientPMS = () => {
  const [tab, setTab] = useState<"clients" | "projects">("clients");

  const [clients,       setClients]       = useState<Client[]>([]);
  const [clientsLoading,setClientsLoading]= useState(true);
  const [clientSearch,  setClientSearch]  = useState("");
  const [clientFilter,  setClientFilter]  = useState("All");
  const [selectedClient,setSelectedClient]= useState<Client | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);

  const [trips,       setTrips]       = useState<Trip[]>([]);
  const [tripsLoading,setTripsLoading]= useState(true);
  const [tripSearch,  setTripSearch]  = useState("");
  const [tripFilter,  setTripFilter]  = useState("All");
  const [selectedTrip,setSelectedTrip]= useState<Trip | null>(null);
  const [showAddTrip, setShowAddTrip] = useState(false);

  // Delete from card (without opening drawer)
  const [pendingDeleteClient, setPendingDeleteClient] = useState<Client | null>(null);
  const [pendingDeleteTrip,   setPendingDeleteTrip]   = useState<Trip | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ── Load clients ── */
  const loadClients = async () => {
    setClientsLoading(true);
    const { data: contacts } = await supabase
      .from("contacts")
      .select(`id, name, contact_type, stage, destination, budget, created_at,
               contact_emails(email), contact_phones(phone_number)`)
      .order("created_at", { ascending: false });

    const { data: bookings } = await supabase
      .from("bookings")
      .select("contact_id, total_booking_value");

    const mapped: Client[] = (contacts ?? []).map((c: any) => {
      const myBookings = (bookings ?? []).filter((b: any) => b.contact_id === c.id);
      return {
        id:           c.id,
        name:         c.name ?? "—",
        contact_type: c.contact_type ?? "Individual",
        stage:        c.stage ?? "New",
        destination:  c.destination ?? null,
        budget:       c.budget ?? null,
        created_at:   c.created_at,
        email:        c.contact_emails?.[0]?.email ?? "",
        phone:        c.contact_phones?.[0]?.phone_number ?? "",
        trips_count:  myBookings.length,
        total_spend:  myBookings.reduce((s: number, b: any) => s + (Number(b.total_booking_value) || 0), 0),
      };
    });
    setClients(mapped);
    setClientsLoading(false);
  };

  /* ── Load trips ── */
  const loadTrips = async () => {
    setTripsLoading(true);
    const { data } = await supabase
      .from("trips")
      .select("*")
      .order("created_at", { ascending: false });
    setTrips(data ?? []);
    setTripsLoading(false);
  };

  useEffect(() => { loadClients(); loadTrips(); }, []);

  /* ── Delete handlers ── */
  const deleteClient = async (id: string) => {
    setDeleting(true);
    await supabase.from("contact_emails").delete().eq("contact_id", id);
    await supabase.from("contact_phones").delete().eq("contact_id", id);
    await supabase.from("contacts").delete().eq("id", id);
    setClients(prev => prev.filter(c => c.id !== id));
    setDeleting(false);
    setPendingDeleteClient(null);
  };

  const deleteTrip = async (id: string) => {
    setDeleting(true);
    await supabase.from("trips").delete().eq("id", id);
    setTrips(prev => prev.filter(t => t.id !== id));
    setDeleting(false);
    setPendingDeleteTrip(null);
  };

  /* ── Derived lists ── */
  const allStages = ["All", ...Array.from(new Set(clients.map(c => c.stage).filter(Boolean)))];
  const allTripStatuses = ["All", ...Array.from(new Set(trips.map(t => t.status).filter(Boolean)))];

  const filteredClients = clients.filter(c => {
    const q = clientSearch.toLowerCase();
    const matchQ = !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.destination ?? "").toLowerCase().includes(q);
    const matchF = clientFilter === "All" || c.stage === clientFilter;
    return matchQ && matchF;
  });

  const filteredTrips = trips.filter(t => {
    const q = tripSearch.toLowerCase();
    const matchQ = !q || t.name.toLowerCase().includes(q) || t.client.toLowerCase().includes(q) || (t.trip_id ?? "").toLowerCase().includes(q);
    const matchF = tripFilter === "All" || t.status === tripFilter;
    return matchQ && matchF;
  });

  /* ── Stats ── */
  const clientStats = [
    { label: "Total Clients", value: clients.length,                                                  color: "text-card-foreground" },
    { label: "Active",        value: clients.filter(c => !["—"].includes(c.stage)).length,            color: "text-green-600"       },
    { label: "Total Spend",   value: currency(clients.reduce((s, c) => s + c.total_spend, 0)),        color: "text-amber-600"       },
    { label: "With Bookings", value: clients.filter(c => c.trips_count > 0).length,                   color: "text-teal-600"      },
  ];

  const tripStats = [
    { label: "Total Projects", value: trips.length,                                                    color: "text-card-foreground" },
    { label: "Completed",      value: trips.filter(t => t.status === "Complete").length,               color: "text-green-600"       },
    { label: "Ongoing",        value: trips.filter(t => !["Complete","Cancelled"].includes(t.status)).length, color: "text-blue-600" },
    { label: "Cancelled",      value: trips.filter(t => t.status === "Cancelled").length,              color: "text-red-500"         },
  ];

  return (
    <DashboardLayout>
      {/* Modals */}
      <AnimatePresence>
        {showAddClient && (
          <AddClientModal onClose={() => setShowAddClient(false)} onSaved={loadClients} />
        )}
        {showAddTrip && (
          <AddTripModal onClose={() => setShowAddTrip(false)} onSaved={loadTrips} />
        )}
        {pendingDeleteClient && (
          <ConfirmDeleteModal
            label={`client "${pendingDeleteClient.name}"`}
            loading={deleting}
            onConfirm={() => deleteClient(pendingDeleteClient.id)}
            onCancel={() => setPendingDeleteClient(null)}
          />
        )}
        {pendingDeleteTrip && (
          <ConfirmDeleteModal
            label={`project "${pendingDeleteTrip.name}"`}
            loading={deleting}
            onConfirm={() => deleteTrip(pendingDeleteTrip.id)}
            onCancel={() => setPendingDeleteTrip(null)}
          />
        )}
      </AnimatePresence>

      {/* Backdrop for drawer */}
      <AnimatePresence>
        {(selectedClient || selectedTrip) && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
            onClick={() => { setSelectedClient(null); setSelectedTrip(null); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedClient && (
          <ClientDrawer
            client={selectedClient}
            onClose={() => setSelectedClient(null)}
            onDelete={id => { setClients(prev => prev.filter(c => c.id !== id)); setSelectedClient(null); }}
          />
        )}
        {selectedTrip && (
          <TripDrawer
            trip={selectedTrip}
            onClose={() => setSelectedTrip(null)}
            onDelete={id => { setTrips(prev => prev.filter(t => t.id !== id)); setSelectedTrip(null); }}
          />
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif text-foreground">Clients & Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage clients and track all travel project pipelines
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button onClick={() => { loadClients(); loadTrips(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button
              onClick={() => tab === "clients" ? setShowAddClient(true) : setShowAddTrip(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-xs font-medium transition-colors shadow-sm">
              <Plus className="h-3.5 w-3.5" />
              {tab === "clients" ? "Add Client" : "Add Project"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/40 rounded-lg p-1 w-fit">
          {([
            { id: "clients",  label: "Clients",  icon: Users     },
            { id: "projects", label: "Projects", icon: Briefcase },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                tab === t.id ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* ══════════ CLIENTS TAB ══════════ */}
        {tab === "clients" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {clientStats.map((s, i) => (
                <motion.div key={s.label}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl border bg-card p-4 shadow-card">
                  <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </motion.div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input placeholder="Search clients…" value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                  className="w-full pl-9 pr-3 h-9 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
              </div>
              <div className="flex gap-1 flex-wrap">
                {allStages.map(s => (
                  <button key={s} onClick={() => setClientFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      clientFilter === s
                        ? "bg-teal-500 text-white border-teal-500"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}>{s}</button>
                ))}
              </div>
            </div>

            {clientsLoading ? (
              <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading clients…</span>
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="rounded-xl border bg-card p-16 text-center">
                <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No clients found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredClients.map((client, i) => {
                  const meta = STAGE_META[client.stage] ?? STAGE_META.default;
                  return (
                    <motion.div key={client.id}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="relative text-left rounded-2xl border border-border bg-card p-4 hover:border-teal-300 hover:shadow-md transition-all group"
                    >
                      {/* Delete button on card */}
                      <button
                        onClick={e => { e.stopPropagation(); setPendingDeleteClient(client); }}
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-all z-10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>

                      <button className="w-full text-left" onClick={() => setSelectedClient(client)}>
                        <div className="flex items-start gap-3 mb-3 pr-6">
                          <div className={`h-10 w-10 rounded-full bg-[#3E6B6C] flex items-center justify-center text-[11px] font-semibold text-white shrink-0`}>
                            {initials(client.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-card-foreground truncate">{client.name}</p>
                            <p className="text-[11px] text-muted-foreground">{client.contact_type}</p>
                          </div>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
                            {client.stage}
                          </span>
                        </div>

                        <div className="space-y-1.5 text-[11px] text-muted-foreground">
                          {client.destination && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3 w-3 shrink-0" />{client.destination}
                            </div>
                          )}
                          {client.email && (
                            <div className="flex items-center gap-1.5 truncate">
                              <Mail className="h-3 w-3 shrink-0" />{client.email}
                            </div>
                          )}
                          {client.budget && (
                            <div className="flex items-center gap-1.5">
                              <DollarSign className="h-3 w-3 shrink-0" />Budget: {client.budget}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Briefcase className="h-3 w-3" />{client.trips_count} trips
                            </span>
                            {client.total_spend > 0 && (
                              <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
                                <TrendingUp className="h-3 w-3" />{currency(client.total_spend)}
                              </span>
                            )}
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-teal-500 transition-colors" />
                        </div>
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════ PROJECTS TAB ══════════ */}
        {tab === "projects" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {tripStats.map((s, i) => (
                <motion.div key={s.label}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl border bg-card p-4 shadow-card">
                  <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </motion.div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input placeholder="Search trips, clients, IDs…" value={tripSearch} onChange={e => setTripSearch(e.target.value)}
                  className="w-full pl-9 pr-3 h-9 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all" />
              </div>
              <div className="flex gap-1 flex-wrap">
                {allTripStatuses.map(s => {
                  const sm = TRIP_STATUS_META[s] ?? TRIP_STATUS_META.default;
                  return (
                    <button key={s} onClick={() => setTripFilter(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        tripFilter === s
                          ? `${sm.bg} ${sm.color} border-transparent`
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}>{s}</button>
                  );
                })}
              </div>
            </div>

            {tripsLoading ? (
              <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading projects…</span>
              </div>
            ) : filteredTrips.length === 0 ? (
              <div className="rounded-xl border bg-card p-16 text-center">
                <Briefcase className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No projects found.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {["Trip ID", "Name", "Client", "Status", "Start Date", "Project Lead", ""].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrips.map((trip, i) => {
                        const sm = TRIP_STATUS_META[trip.status] ?? TRIP_STATUS_META.default;
                        return (
                          <motion.tr key={trip.id}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.02 }}
                            className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer group"
                            onClick={() => setSelectedTrip(trip)}
                          >
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                              {trip.trip_id || "—"}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-card-foreground line-clamp-1">{trip.name}</p>
                              {trip.places && <p className="text-[11px] text-muted-foreground">{trip.places}</p>}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                              {trip.client || "—"}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${sm.bg} ${sm.color}`}>
                                {trip.status || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {fmt(trip.start_date)}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {trip.project_lead || "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={e => { e.stopPropagation(); setPendingDeleteTrip(trip); }}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-all">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-teal-500 transition-colors" />
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">{filteredTrips.length} project{filteredTrips.length !== 1 ? "s" : ""}</p>
                  <p className="text-[11px] text-muted-foreground">Click any row to view details</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ClientPMS;

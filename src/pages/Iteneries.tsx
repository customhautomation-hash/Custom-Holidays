import { useState, useEffect, useRef } from "react";
import { API_ROOT } from "../lib/api";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/lib/supabase";
import {
  Plus, Search, ChevronRight, ChevronLeft, Loader2, Star, MapPin,
  Calendar, Users, DollarSign, Hotel, Activity, Car, Pencil, Trash2,
  Check, X, FileText, Send, Save, RefreshCw, ChevronDown, ChevronUp,
  ArrowLeft, Clock, Tag, Sparkles, Eye, Copy, AlertTriangle,
  Database, ExternalLink, BadgeCheck,
} from "lucide-react";

// ─── Config ───────────────────────────────────────────────────────────────────
const API = `${API_ROOT}/itinerary`;

// ─── Types ───────────────────────────────────────────────────────────────────
type View = "list" | "new" | "detail";
type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface ItinerarySummary {
  id: string; client_name: string; destination: string; start_date: string;
  end_date: string; nights: number; status: string; final_price: number;
  currency: string; updated_at: string;
}

interface ItineraryFull extends ItinerarySummary {
  client_email: string; client_phone: string; adults: number; children: number;
  special_requirements: string; departure_city: string; budget: number;
  hotel_category: string; meal_plan: string; trip_type: string; special_requests: string;
  itinerary_content: DayPlan[]; selected_hotels: HotelResult[];
  selected_activities: ActivityResult[]; selected_transfers: TransferResult[];
  hotel_cost: number; activity_cost: number; transfer_cost: number; other_cost: number;
  supplier_total: number; markup_type: string; markup_value: number; markup_amount: number;
  discount_amount: number; tax_amount: number;
}

interface HotelResult {
  id: string; hotel_name: string; star_rating: number; destination: string;
  room_type: string; meal_plan: string; price_per_night: number; currency: string;
  supplier_name: string; valid_from: string; valid_to: string;
  cancellation_policy: string; source_email: string; source_date: string;
  is_onboarded_supplier?: boolean;
}

interface ActivityResult {
  id: string; activity_name: string; description: string; duration_hours: number;
  price: number; currency: string; price_basis: string; supplier_name: string;
  valid_from: string; valid_to: string; source_email: string; source_date: string;
  is_onboarded_supplier?: boolean;
}

interface TransferResult {
  id: string; transfer_type: string; route: string; vehicle_type: string;
  price: number; currency: string; price_basis: string; supplier_name: string;
  source_email: string; source_date: string; is_onboarded_supplier?: boolean;
}

interface MissingRateSupplier {
  id: string; name: string; company_name: string; supplier_type: string;
  place: string; phone: string; email: string; onboarding_status: string;
}

interface DayItem {
  time: string; type: "hotel" | "activity" | "transfer" | "note" | "free";
  title: string; description: string; supplier?: string; notes?: string;
}

interface DayPlan { day_number: number; date: string; title: string; items: DayItem[]; }

interface FormData {
  client_name: string; client_email: string; client_phone: string;
  adults: number; children: number; special_requirements: string;
  destination: string; departure_city: string; start_date: string; end_date: string;
  nights: number; budget: string; currency: string;
  hotel_category: string; meal_plan: string; transport_preference: string;
  room_preference: string; trip_type: string; activities: string; special_requests: string;
}

// ─── Auth helper ──────────────────────────────────────────────────────────────
async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return `Bearer ${token}`;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmt(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}
function fmtDate(d: string): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Small components ─────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    draft: { label: "Draft", cls: "bg-gray-100 text-gray-600" },
    generated: { label: "Generated", cls: "bg-blue-50 text-blue-600" },
    reviewed: { label: "Reviewed", cls: "bg-teal-50 text-teal-600" },
    sent: { label: "Sent", cls: "bg-amber-50 text-amber-600" },
    approved: { label: "Approved", cls: "bg-green-50 text-green-600" },
    cancelled: { label: "Cancelled", cls: "bg-red-50 text-red-500" },
  };
  const c = cfg[status] || { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.cls}`}>{c.label}</span>;
}

function Stars({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: n }).map((_, i) => <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />)}
    </span>
  );
}

function OnboardedBadge() {
  return (
    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
      <BadgeCheck className="h-2.5 w-2.5" /> Onboarded
    </span>
  );
}

function SourceTag({ email, date }: { email?: string; date?: string }) {
  const [open, setOpen] = useState(false);
  if (!email && !date) return null;
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition px-1.5 py-0.5 rounded border border-border hover:border-foreground/20">
        <Eye className="h-2.5 w-2.5" /> Source
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 z-10 bg-popover border border-border rounded-lg shadow-lg p-3 w-64 text-xs space-y-1">
          {email && <p><span className="text-muted-foreground">From:</span> {email}</p>}
          {date && <p><span className="text-muted-foreground">Date:</span> {fmtDate(date)}</p>}
          <button onClick={() => setOpen(false)} className="absolute top-1 right-1 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground ">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition disabled:opacity-50 ${props.className || ""}`} />;
}
function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition ${props.className || ""}`}>{children}</select>;
}
function Textarea({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition resize-none ${props.className || ""}`} />;
}
function Btn({ variant = "primary", size = "md", loading, children, ...props }: {
  variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "inline-flex items-center justify-center gap-1.5 font-medium transition rounded-lg disabled:opacity-50";
  const sizes = { sm: "text-xs px-3 py-1.5", md: "text-sm px-4 py-2" };
  const variants = {
    primary: "bg-accent text-accent-foreground hover:bg-accent/90",
    secondary: "bg-muted text-foreground hover:bg-muted/80 border border-border",
    ghost: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
  };
  return (
    <button {...props} disabled={props.disabled || loading} className={`${base} ${sizes[size]} ${variants[variant]} ${props.className || ""}`}>
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function Iteneries() {
  const [view, setView] = useState<View>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {view === "list" && (
          <ItineraryList onNew={() => setView("new")} onOpen={id => { setSelectedId(id); setView("detail"); }} />
        )}
        {view === "new" && (
          <CreateItinerary onBack={() => setView("list")} onSaved={id => { setSelectedId(id); setView("detail"); }} />
        )}
        {view === "detail" && selectedId && (
          <ItineraryDetail id={selectedId} onBack={() => setView("list")} />
        )}
      </div>
    </DashboardLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ITINERARY LIST
// ═══════════════════════════════════════════════════════════════════════════
function ItineraryList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const [items, setItems] = useState<ItinerarySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const auth = await authHeader();
        const resp = await fetch(`${API}/list`, { headers: { Authorization: auth } });
        const data = await resp.json();
        if (data.success) setItems(data.itineraries);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = items.filter(i => !filter || i.client_name.toLowerCase().includes(filter.toLowerCase()) || i.destination.toLowerCase().includes(filter.toLowerCase()));
  const stats = {
    total: items.length, draft: items.filter(i => i.status === "draft").length,
    sent: items.filter(i => i.status === "sent").length, approved: items.filter(i => i.status === "approved").length,
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Itineraries</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage client travel proposals</p>
        </div>
        <Btn onClick={onNew}><Plus className="h-4 w-4" /> Create Itinerary</Btn>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total, icon: <FileText className="h-4 w-4" /> },
          { label: "Drafts", value: stats.draft, icon: <Pencil className="h-4 w-4" /> },
          { label: "Sent", value: stats.sent, icon: <Send className="h-4 w-4" /> },
          { label: "Approved", value: stats.approved, icon: <Check className="h-4 w-4" /> },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <span className="text-muted-foreground">{s.icon}</span>
            <div><p className="text-2xl font-semibold text-foreground">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search by client or destination..."
          className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition" />
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <FileText className="h-10 w-10 opacity-20" />
            <p className="text-sm">No itineraries yet.</p>
            <Btn variant="secondary" size="sm" onClick={onNew}><Plus className="h-3.5 w-3.5" /> Create your first itinerary</Btn>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {["Client","Destination","Dates","Nights","Price","Status","Updated",""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground ">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-muted/30 cursor-pointer transition" onClick={() => onOpen(item.id)}>
                  <td className="px-4 py-3 font-medium text-foreground">{item.client_name}</td>
                  <td className="px-4 py-3 text-muted-foreground"><span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.destination}</span></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(item.start_date)} – {fmtDate(item.end_date)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.nights}N</td>
                  <td className="px-4 py-3 font-medium text-foreground">{item.final_price ? fmt(item.final_price, item.currency) : "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(item.updated_at)}</td>
                  <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE ITINERARY — multi-step wizard
// ═══════════════════════════════════════════════════════════════════════════
const DEFAULT_FORM: FormData = {
  client_name: "", client_email: "", client_phone: "", adults: 2, children: 0, special_requirements: "",
  destination: "", departure_city: "", start_date: "", end_date: "", nights: 7, budget: "", currency: "INR",
  hotel_category: "4 star", meal_plan: "Breakfast", transport_preference: "Private", room_preference: "Double",
  trip_type: "Leisure", activities: "", special_requests: "",
};

function CreateItinerary({ onBack, onSaved }: { onBack: () => void; onSaved: (id: string) => void }) {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [searchResults, setSearchResults] = useState<{ hotels: HotelResult[]; activities: ActivityResult[]; transfers: TransferResult[]; suppliers_missing_rates: MissingRateSupplier[]; has_data: boolean } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedHotels, setSelectedHotels] = useState<HotelResult[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<ActivityResult[]>([]);
  const [selectedTransfers, setSelectedTransfers] = useState<TransferResult[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [generatedDays, setGeneratedDays] = useState<DayPlan[]>([]);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof FormData, val: any) => setForm(f => ({ ...f, [key]: val }));

  useEffect(() => {
    if (form.start_date && form.end_date) {
      const diff = Math.round((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000);
      if (diff > 0) set("nights", diff);
    }
  }, [form.start_date, form.end_date]);

  const STEPS = [
    { n: 1, label: "Client" }, { n: 2, label: "Trip" }, { n: 3, label: "Preferences" },
    { n: 4, label: "Search" }, { n: 5, label: "Generate" }, { n: 6, label: "Save" },
  ];

  const handleSearch = async () => {
    setSearching(true);
    setSearchError(null);
    setSearchResults(null);
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API}/suppliers/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({
          destination: form.destination, hotel_category: form.hotel_category, meal_plan: form.meal_plan,
          start_date: form.start_date, end_date: form.end_date,
          activities: form.activities ? form.activities.split(",").map(s => s.trim()).filter(Boolean) : [],
          budget: form.budget ? parseFloat(form.budget) : undefined, currency: form.currency, trip_type: form.trip_type,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Search failed (${resp.status}): ${errText.slice(0, 200)}`);
      }
      const data = await resp.json();
      if (data.success) { setSearchResults(data); setStep(4); }
      else { setSearchError(data.detail || "Search returned no data"); }
    } catch (e: any) {
      console.error(e);
      setSearchError(e.message || "Could not reach the backend. It may be waking up — try again in 30s.");
    } finally { setSearching(false); }
  };

  const toggleHotel = (h: HotelResult) => setSelectedHotels(prev => prev.find(x => x.id === h.id) ? prev.filter(x => x.id !== h.id) : [h]);
  const toggleActivity = (a: ActivityResult) => setSelectedActivities(prev => prev.find(x => x.id === a.id) ? prev.filter(x => x.id !== a.id) : [...prev, a]);
  const toggleTransfer = (t: TransferResult) => setSelectedTransfers(prev => prev.find(x => x.id === t.id) ? prev.filter(x => x.id !== t.id) : [...prev, t]);

  const handleGenerate = async () => {
    setStep(5);
    setGenerating(true);
    setGenError(null);
    setStreamText("");
    setGeneratedDays([]);
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({
          client_name: form.client_name, adults: form.adults, children: form.children,
          special_requirements: form.special_requirements, destination: form.destination,
          departure_city: form.departure_city, start_date: form.start_date, end_date: form.end_date,
          nights: form.nights, budget: form.budget ? parseFloat(form.budget) : undefined, currency: form.currency,
          hotel_category: form.hotel_category, meal_plan: form.meal_plan, trip_type: form.trip_type,
          special_requests: form.special_requests, selected_hotels: selectedHotels,
          selected_activities: selectedActivities, selected_transfers: selectedTransfers,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Generate request failed (${resp.status}): ${errText.slice(0, 300)}`);
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "", fullText = "";
      let sawError: string | null = null;

      if (!reader) throw new Error("No response body from server");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const p = JSON.parse(line.slice(6));
            if (p.token) { fullText += p.token; setStreamText(fullText); }
            if (p.done && p.itinerary?.days) { setGeneratedDays(p.itinerary.days); setStreamText(""); }
            if (p.error) sawError = p.error;
          } catch { /* ignore parse errors on partial chunks */ }
        }
      }
      if (sawError) throw new Error(sawError);
    } catch (e: any) {
      console.error(e);
      setGenError(e.message || "Generation failed for an unknown reason.");
    } finally { setGenerating(false); }
  };

  const hotelCost = selectedHotels.reduce((s, h) => s + h.price_per_night * form.nights, 0);
  const activityCost = selectedActivities.reduce((s, a) => s + a.price * (form.adults + form.children), 0);
  const transferCost = selectedTransfers.reduce((s, t) => s + t.price, 0);

  const handleSave = async (status = "draft") => {
    setSaving(true);
    try {
      const auth = await authHeader();
      const resp = await fetch(`${API}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({
          client_name: form.client_name, client_email: form.client_email, client_phone: form.client_phone,
          adults: form.adults, children: form.children, special_requirements: form.special_requirements,
          destination: form.destination, departure_city: form.departure_city, start_date: form.start_date,
          end_date: form.end_date, nights: form.nights, budget: form.budget ? parseFloat(form.budget) : undefined,
          currency: form.currency, hotel_category: form.hotel_category, meal_plan: form.meal_plan,
          transport_preference: form.transport_preference, room_preference: form.room_preference,
          trip_type: form.trip_type, activities: form.activities ? form.activities.split(",").map(s => s.trim()).filter(Boolean) : [],
          special_requests: form.special_requests, itinerary_content: generatedDays,
          selected_hotels: selectedHotels, selected_activities: selectedActivities, selected_transfers: selectedTransfers,
          hotel_cost: hotelCost, activity_cost: activityCost, transfer_cost: transferCost, other_cost: 0,
          markup_type: "percentage", markup_value: 0, discount_amount: 0, tax_amount: 0, status,
        }),
      });
      const data = await resp.json();
      if (data.success) onSaved(data.itinerary.id);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition"><ArrowLeft className="h-5 w-5" /></button>
        <div><h1 className="text-2xl font-semibold text-foreground">Create Itinerary</h1><p className="text-sm text-muted-foreground">Build a new client travel proposal</p></div>
      </div>

      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${step === s.n ? "bg-accent text-accent-foreground" : step > s.n ? "text-accent" : "text-muted-foreground"}`}>
              {step > s.n ? <Check className="h-3.5 w-3.5" /> : <span>{s.n}</span>}{s.label}
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/40 mx-1" />}
          </div>
        ))}
      </div>

      {/* STEP 1: Client */}
      {step === 1 && (
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <h2 className="font-semibold text-foreground flex items-center gap-2"><Users className="h-4 w-4 text-accent" /> Client Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Client Name" required><Input value={form.client_name} onChange={e => set("client_name", e.target.value)} placeholder="Rahul Sharma" /></Field>
            <Field label="Email"><Input type="email" value={form.client_email} onChange={e => set("client_email", e.target.value)} placeholder="rahul@example.com" /></Field>
            <Field label="Phone"><Input value={form.client_phone} onChange={e => set("client_phone", e.target.value)} placeholder="+91 98765 43210" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Adults" required><Input type="number" min={1} value={form.adults} onChange={e => set("adults", parseInt(e.target.value) || 1)} /></Field>
              <Field label="Children"><Input type="number" min={0} value={form.children} onChange={e => set("children", parseInt(e.target.value) || 0)} /></Field>
            </div>
          </div>
          <Field label="Special Requirements"><Textarea rows={2} value={form.special_requirements} onChange={e => set("special_requirements", e.target.value)} placeholder="Wheelchair access, dietary restrictions, etc." /></Field>
          <div className="flex justify-end"><Btn onClick={() => setStep(2)} disabled={!form.client_name.trim()}>Next: Trip Details <ChevronRight className="h-4 w-4" /></Btn></div>
        </div>
      )}

      {/* STEP 2: Trip */}
      {step === 2 && (
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <h2 className="font-semibold text-foreground flex items-center gap-2"><MapPin className="h-4 w-4 text-accent" /> Trip Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Destination" required>
              <Select value={form.destination} onChange={e => set("destination", e.target.value)}>
                <option value="">Select destination...</option>
                {["Dubai","Goa","Singapore","Bali","Maldives","Thailand","Europe","USA"].map(d => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
            <Field label="Departure City"><Input value={form.departure_city} onChange={e => set("departure_city", e.target.value)} placeholder="Mumbai" /></Field>
            <Field label="Start Date" required><Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} /></Field>
            <Field label="End Date" required><Input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} /></Field>
            <Field label="Nights"><Input type="number" value={form.nights} onChange={e => set("nights", parseInt(e.target.value) || 1)} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2"><Field label="Budget"><Input type="number" value={form.budget} onChange={e => set("budget", e.target.value)} placeholder="150000" /></Field></div>
              <Field label="Currency"><Select value={form.currency} onChange={e => set("currency", e.target.value)}>{["INR","USD","AED","SGD","EUR"].map(c => <option key={c}>{c}</option>)}</Select></Field>
            </div>
          </div>
          <div className="flex justify-between">
            <Btn variant="secondary" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4" /> Back</Btn>
            <Btn onClick={() => setStep(3)} disabled={!form.destination || !form.start_date || !form.end_date}>Next: Preferences <ChevronRight className="h-4 w-4" /></Btn>
          </div>
        </div>
      )}

      {/* STEP 3: Preferences */}
      {step === 3 && (
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <h2 className="font-semibold text-foreground flex items-center gap-2"><Tag className="h-4 w-4 text-accent" /> Preferences</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Hotel Category"><Select value={form.hotel_category} onChange={e => set("hotel_category", e.target.value)}>{["3 star","4 star","5 star","Luxury"].map(c => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Meal Plan"><Select value={form.meal_plan} onChange={e => set("meal_plan", e.target.value)}>{["Room Only","Breakfast","Half Board","Full Board","All Inclusive"].map(m => <option key={m}>{m}</option>)}</Select></Field>
            <Field label="Trip Type"><Select value={form.trip_type} onChange={e => set("trip_type", e.target.value)}>{["Leisure","Honeymoon","Family","Business","Adventure","Group"].map(t => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Room Preference"><Select value={form.room_preference} onChange={e => set("room_preference", e.target.value)}>{["Double","Twin","Suite","Villa","Family Room"].map(r => <option key={r}>{r}</option>)}</Select></Field>
            <Field label="Transportation"><Select value={form.transport_preference} onChange={e => set("transport_preference", e.target.value)}>{["Private","Shared","Self-drive","Public"].map(t => <option key={t}>{t}</option>)}</Select></Field>
          </div>
          <Field label="Requested Activities (comma-separated)"><Textarea rows={2} value={form.activities} onChange={e => set("activities", e.target.value)} placeholder="Burj Khalifa, Desert Safari, Dhow Cruise..." /></Field>
          <Field label="Special Requests"><Textarea rows={2} value={form.special_requests} onChange={e => set("special_requests", e.target.value)} placeholder="Anniversary decoration, early check-in, etc." /></Field>
          {searchError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><p>{searchError}</p>
            </div>
          )}
          <div className="flex justify-between">
            <Btn variant="secondary" onClick={() => setStep(2)}><ChevronLeft className="h-4 w-4" /> Back</Btn>
            <Btn onClick={handleSearch} loading={searching}><Search className="h-4 w-4" /> Search Knowledge Base</Btn>
          </div>
        </div>
      )}

      {/* STEP 4: Search Results */}
      {step === 4 && searchResults && (
        <div className="space-y-5">
          <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">Knowledge Base Results for {form.destination}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Select items to include in the itinerary</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{selectedHotels.length} hotel · {selectedActivities.length} activities · {selectedTransfers.length} transfers selected</span>
              <Btn onClick={() => setStep(3)} variant="ghost" size="sm"><RefreshCw className="h-3.5 w-3.5" /> Refine</Btn>
            </div>
          </div>

          {/* No data at all */}
          {!searchResults.has_data && (
            <div className="rounded-xl border-2 border-dashed border-border bg-card p-8 text-center space-y-3">
              <Database className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
              <p className="font-medium text-foreground">No supplier rates found for {form.destination}</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Your Knowledge Base has no hotel, activity, or transfer rates for this destination yet.
                Sync Gmail or add rates manually to build the itinerary.
              </p>
              <a href="/suppliers" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
                Go to Knowledge Base <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

          {/* Onboarded suppliers with no rates yet — follow-up nudge */}
          {searchResults.suppliers_missing_rates.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> {searchResults.suppliers_missing_rates.length} onboarded supplier(s) in {form.destination} have no rates in the Knowledge Base yet
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {searchResults.suppliers_missing_rates.map(s => (
                  <span key={s.id} className="text-xs bg-white border border-amber-200 rounded-full px-2.5 py-1 text-amber-700">
                    {s.company_name || s.name} {s.phone && `· ${s.phone}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Hotels */}
          {searchResults.hotels.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><Hotel className="h-4 w-4 text-accent" /> Hotels</h3>
              <div className="grid grid-cols-2 gap-3">
                {searchResults.hotels.map(h => {
                  const sel = selectedHotels.find(x => x.id === h.id);
                  return (
                    <div key={h.id} className={`rounded-xl border p-4 space-y-3 transition cursor-pointer ${sel ? "border-accent bg-accent/5" : "bg-card hover:border-accent/40"}`} onClick={() => toggleHotel(h)}>
                      <div className="flex items-start justify-between">
                        <div><p className="font-medium text-foreground">{h.hotel_name}</p><Stars n={h.star_rating} /></div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${sel ? "border-accent bg-accent" : "border-muted-foreground/30"}`}>{sel && <Check className="h-3 w-3 text-white" />}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>{h.room_type}</span>
                        <span>{h.meal_plan === "BB" ? "Breakfast" : h.meal_plan === "MAP" ? "Half Board" : h.meal_plan === "AP" ? "Full Board" : h.meal_plan}</span>
                        <span className="font-semibold text-foreground text-sm col-span-2">{fmt(h.price_per_night, h.currency)}<span className="font-normal text-muted-foreground">/night</span></span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{h.supplier_name}</span>{h.is_onboarded_supplier && <OnboardedBadge />}</div>
                        <SourceTag email={h.source_email} date={h.source_date} />
                      </div>
                      {h.cancellation_policy && <p className="text-[11px] text-green-600 bg-green-50 px-2 py-1 rounded">{h.cancellation_policy}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activities */}
          {searchResults.activities.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><Activity className="h-4 w-4 text-accent" /> Activities</h3>
              <div className="grid grid-cols-2 gap-3">
                {searchResults.activities.map(a => {
                  const sel = selectedActivities.find(x => x.id === a.id);
                  return (
                    <div key={a.id} className={`rounded-xl border p-4 space-y-2 transition cursor-pointer ${sel ? "border-accent bg-accent/5" : "bg-card hover:border-accent/40"}`} onClick={() => toggleActivity(a)}>
                      <div className="flex items-start justify-between">
                        <p className="font-medium text-foreground">{a.activity_name}</p>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${sel ? "border-accent bg-accent" : "border-muted-foreground/30"}`}>{sel && <Check className="h-3 w-3 text-white" />}</div>
                      </div>
                      {a.description && <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>}
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-foreground">{fmt(a.price, a.currency)}<span className="text-xs font-normal text-muted-foreground">/{a.price_basis.replace("per_", "")}</span></div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{a.duration_hours}h</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{a.supplier_name}</span>{a.is_onboarded_supplier && <OnboardedBadge />}</div>
                        <SourceTag email={a.source_email} date={a.source_date} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Transfers */}
          {searchResults.transfers.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2"><Car className="h-4 w-4 text-accent" /> Transfers</h3>
              <div className="grid grid-cols-2 gap-3">
                {searchResults.transfers.map(t => {
                  const sel = selectedTransfers.find(x => x.id === t.id);
                  return (
                    <div key={t.id} className={`rounded-xl border p-4 space-y-2 transition cursor-pointer ${sel ? "border-accent bg-accent/5" : "bg-card hover:border-accent/40"}`} onClick={() => toggleTransfer(t)}>
                      <div className="flex items-start justify-between">
                        <div><p className="font-medium text-foreground">{t.transfer_type}</p><p className="text-xs text-muted-foreground">{t.route}</p></div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${sel ? "border-accent bg-accent" : "border-muted-foreground/30"}`}>{sel && <Check className="h-3 w-3 text-white" />}</div>
                      </div>
                      <p className="text-xs text-muted-foreground">{t.vehicle_type}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{fmt(t.price, t.currency)}<span className="text-xs font-normal text-muted-foreground">/{t.price_basis?.replace("per_", "")}</span></span>
                        <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{t.supplier_name}</span>{t.is_onboarded_supplier && <OnboardedBadge />}</div>
                      </div>
                      <SourceTag email={t.source_email} date={t.source_date} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Btn variant="secondary" onClick={() => setStep(3)}><ChevronLeft className="h-4 w-4" /> Back</Btn>
            <Btn onClick={handleGenerate} disabled={selectedHotels.length === 0 && selectedActivities.length === 0}><Sparkles className="h-4 w-4" /> Generate Itinerary</Btn>
          </div>
        </div>
      )}

      {/* STEP 5: Generation */}
      {step === 5 && (
        <div className="space-y-5">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4"><Sparkles className="h-4 w-4 text-accent" /> AI Itinerary Generation</h2>

            {generating && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Generating day-by-day itinerary from your selected supplier data...</div>
                {streamText && <pre className="text-xs text-muted-foreground bg-muted rounded-lg p-4 max-h-48 overflow-y-auto font-mono whitespace-pre-wrap">{streamText}</pre>}
              </div>
            )}

            {!generating && genError && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Generation failed</p>
                  <p className="mt-1 text-red-600">{genError}</p>
                </div>
              </div>
            )}

            {!generating && !genError && generatedDays.length > 0 && (
              <div className="space-y-4">
                <p className="text-sm text-green-600 flex items-center gap-1.5"><Check className="h-4 w-4" /> Itinerary generated — {generatedDays.length} days</p>
                {generatedDays.map(day => <DayCard key={day.day_number} day={day} />)}
              </div>
            )}

            {!generating && !genError && generatedDays.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nothing generated yet. Click Generate below or go back to selection.</p>
            )}
          </div>

          {!generating && (
            <div className="flex justify-between">
              <Btn variant="secondary" onClick={() => setStep(4)}><ChevronLeft className="h-4 w-4" /> Back to Selection</Btn>
              <div className="flex gap-2">
                <Btn variant="secondary" onClick={handleGenerate}><RefreshCw className="h-4 w-4" /> {generatedDays.length > 0 ? "Regenerate" : "Retry Generate"}</Btn>
                <Btn onClick={() => setStep(6)} disabled={generatedDays.length === 0}>Review & Save <ChevronRight className="h-4 w-4" /></Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 6: Save */}
      {step === 6 && (
        <div className="space-y-5">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2"><DollarSign className="h-4 w-4 text-accent" /> Pricing Summary</h2>
            <div className="space-y-2 text-sm">
              {[
                { label: "Hotel Cost", value: hotelCost, note: `${selectedHotels[0]?.hotel_name || "—"} × ${form.nights}N` },
                { label: "Activity Cost", value: activityCost, note: `${selectedActivities.length} activities` },
                { label: "Transfer Cost", value: transferCost, note: `${selectedTransfers.length} transfers` },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-2 border-b border-border/50">
                  <div><p className="text-foreground">{row.label}</p><p className="text-xs text-muted-foreground">{row.note}</p></div>
                  <p className="font-medium text-foreground">{fmt(row.value, form.currency)}</p>
                </div>
              ))}
              <div className="flex items-center justify-between py-2 border-b border-border font-semibold"><p>Supplier Total</p><p>{fmt(hotelCost + activityCost + transferCost, form.currency)}</p></div>
              <div className="flex items-center justify-between py-2 text-lg font-semibold text-foreground"><p>Total (before markup)</p><p>{fmt(hotelCost + activityCost + transferCost, form.currency)}</p></div>
              <p className="text-xs text-muted-foreground">Markup and discounts can be applied after saving.</p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h2 className="font-semibold text-foreground">Trip Summary</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><p className="text-muted-foreground text-xs">Client</p><p className="font-medium">{form.client_name}</p></div>
              <div><p className="text-muted-foreground text-xs">Destination</p><p className="font-medium">{form.destination}</p></div>
              <div><p className="text-muted-foreground text-xs">Travelers</p><p className="font-medium">{form.adults}A {form.children > 0 ? `${form.children}C` : ""}</p></div>
              <div><p className="text-muted-foreground text-xs">Dates</p><p className="font-medium">{fmtDate(form.start_date)} – {fmtDate(form.end_date)}</p></div>
              <div><p className="text-muted-foreground text-xs">Nights</p><p className="font-medium">{form.nights} nights</p></div>
              <div><p className="text-muted-foreground text-xs">Hotel</p><p className="font-medium">{selectedHotels[0]?.hotel_name || "—"}</p></div>
            </div>
          </div>

          <div className="flex justify-between">
            <Btn variant="secondary" onClick={() => setStep(5)}><ChevronLeft className="h-4 w-4" /> Back</Btn>
            <div className="flex gap-2">
              <Btn variant="secondary" loading={saving} onClick={() => handleSave("draft")}><Save className="h-4 w-4" /> Save as Draft</Btn>
              <Btn loading={saving} onClick={() => handleSave("generated")}><Check className="h-4 w-4" /> Save & Review</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Day card ──────────────────────────────────────────────────────────────
function DayCard({ day }: { day: DayPlan }) {
  const [collapsed, setCollapsed] = useState(false);
  const icons: Record<string, React.ReactNode> = {
    hotel: <Hotel className="h-3.5 w-3.5" />, activity: <Activity className="h-3.5 w-3.5" />,
    transfer: <Car className="h-3.5 w-3.5" />, note: <FileText className="h-3.5 w-3.5" />, free: <Clock className="h-3.5 w-3.5" />,
  };
  const itemColors: Record<string, string> = {
    hotel: "bg-blue-50 text-blue-600", activity: "bg-emerald-50 text-emerald-600",
    transfer: "bg-amber-50 text-amber-600", note: "bg-gray-50 text-gray-500", free: "bg-teal-50 text-teal-600",
  };
  return (
    <div className="rounded-xl border bg-background overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition" onClick={() => setCollapsed(v => !v)}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full">Day {day.day_number}</span>
          <span className="font-medium text-foreground text-sm">{day.title}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">{day.date && <span>{fmtDate(day.date)}</span>}{collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</div>
      </button>
      {!collapsed && (
        <div className="p-4 space-y-2">
          {day.items.map((item, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20">
              <div className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 ${itemColors[item.type] || "bg-gray-50 text-gray-500"}`}>{icons[item.type] || <FileText className="h-3.5 w-3.5" />}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">{item.time && <span className="text-[11px] text-muted-foreground font-mono">{item.time}</span>}<p className="text-sm font-medium text-foreground">{item.title}</p></div>
                {item.description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.description}</p>}
                {item.supplier && <p className="text-[11px] text-muted-foreground mt-1">{item.supplier}</p>}
                {item.notes && <p className="text-[11px] text-blue-600 mt-1 italic">{item.notes}</p>}
              </div>
            </div>
          ))}
          {day.items.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No items for this day</p>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ITINERARY DETAIL
// ═══════════════════════════════════════════════════════════════════════════
function ItineraryDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<ItineraryFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"itinerary" | "pricing" | "proposal">("itinerary");
  const [saving, setSaving] = useState(false);
  const [markup, setMarkup] = useState({ type: "percentage", value: 0 });
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [days, setDays] = useState<DayPlan[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const auth = await authHeader();
        const resp = await fetch(`${API}/${id}`, { headers: { Authorization: auth } });
        const result = await resp.json();
        if (result.success) {
          setData(result.itinerary);
          setDays(result.itinerary.itinerary_content || []);
          setMarkup({ type: result.itinerary.markup_type || "percentage", value: result.itinerary.markup_value || 0 });
          setDiscount(result.itinerary.discount_amount || 0);
          setTax(result.itinerary.tax_amount || 0);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const saveChanges = async (newStatus?: string) => {
    if (!data) return;
    setSaving(true);
    try {
      const auth = await authHeader();
      await fetch(`${API}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({
          id: data.id, client_name: data.client_name, client_email: data.client_email, client_phone: data.client_phone,
          adults: data.adults, children: data.children, special_requirements: data.special_requirements,
          destination: data.destination, departure_city: data.departure_city, start_date: data.start_date,
          end_date: data.end_date, nights: data.nights, budget: data.budget, currency: data.currency,
          hotel_category: data.hotel_category, meal_plan: data.meal_plan, trip_type: data.trip_type,
          itinerary_content: days, selected_hotels: data.selected_hotels || [], selected_activities: data.selected_activities || [],
          selected_transfers: data.selected_transfers || [], hotel_cost: data.hotel_cost, activity_cost: data.activity_cost,
          transfer_cost: data.transfer_cost, other_cost: data.other_cost, markup_type: markup.type, markup_value: markup.value,
          discount_amount: discount, tax_amount: tax, status: newStatus || data.status,
        }),
      });
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const supplierTotal = data ? (data.hotel_cost + data.activity_cost + data.transfer_cost + data.other_cost) : 0;
  const markupAmt = markup.type === "percentage" ? supplierTotal * (markup.value / 100) : markup.value;
  const finalPrice = Math.max(0, supplierTotal + markupAmt - discount + tax);

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading itinerary...</div>;
  if (!data) return <div className="text-center py-20 text-muted-foreground"><p>Itinerary not found.</p><Btn variant="secondary" size="sm" className="mt-3" onClick={onBack}>Back</Btn></div>;

  return (
    <>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-xl font-semibold text-foreground">{data.client_name} — {data.destination}</h1><StatusBadge status={data.status} /></div>
            <p className="text-sm text-muted-foreground mt-0.5">{fmtDate(data.start_date)} – {fmtDate(data.end_date)} · {data.nights} nights · {data.adults}A{data.children > 0 ? ` ${data.children}C` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="secondary" size="sm" loading={saving} onClick={() => saveChanges()}><Save className="h-3.5 w-3.5" /> Save</Btn>
          <Btn variant="secondary" size="sm" onClick={() => saveChanges("sent")}><Send className="h-3.5 w-3.5" /> Mark Sent</Btn>
          <Btn size="sm" onClick={() => saveChanges("approved")}><Check className="h-3.5 w-3.5" /> Approve</Btn>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["itinerary","pricing","proposal"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize transition border-b-2 -mb-px ${activeTab === t ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </div>

      {activeTab === "itinerary" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{days.length} days · Click a day to expand</p>
          {days.length === 0 ? (
            <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground"><Sparkles className="h-8 w-8 mx-auto mb-3 opacity-20" /><p className="text-sm">No itinerary generated yet.</p></div>
          ) : days.map(day => <DayCard key={day.day_number} day={day} />)}

          {(data.selected_hotels?.length > 0 || data.selected_activities?.length > 0 || data.selected_transfers?.length > 0) && (
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h3 className="font-medium text-foreground">Selected Supplier Items</h3>
              {data.selected_hotels?.map(h => (
                <div key={h.id} className="flex items-center justify-between py-2 border-b border-border/50 text-sm">
                  <div className="flex items-center gap-2"><Hotel className="h-3.5 w-3.5 text-blue-500" /><span className="font-medium">{h.hotel_name}</span><Stars n={h.star_rating} /></div>
                  <div className="flex items-center gap-3"><span className="text-muted-foreground">{h.supplier_name}</span><span className="font-medium">{fmt(h.price_per_night, h.currency)}/night</span><SourceTag email={h.source_email} date={h.source_date} /></div>
                </div>
              ))}
              {data.selected_activities?.map(a => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-border/50 text-sm">
                  <div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-emerald-500" /><span className="font-medium">{a.activity_name}</span></div>
                  <div className="flex items-center gap-3"><span className="text-muted-foreground">{a.supplier_name}</span><span className="font-medium">{fmt(a.price, a.currency)}/{a.price_basis?.replace("per_", "")}</span><SourceTag email={a.source_email} date={a.source_date} /></div>
                </div>
              ))}
              {data.selected_transfers?.map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-border/50 text-sm">
                  <div className="flex items-center gap-2"><Car className="h-3.5 w-3.5 text-amber-500" /><span className="font-medium">{t.transfer_type}</span><span className="text-muted-foreground text-xs">{t.route}</span></div>
                  <div className="flex items-center gap-3"><span className="text-muted-foreground">{t.supplier_name}</span><span className="font-medium">{fmt(t.price, t.currency)}</span><SourceTag email={t.source_email} date={t.source_date} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "pricing" && (
        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-medium text-foreground">Cost Breakdown</h3>
            <div className="space-y-3 text-sm">
              {[
                { label: "Hotel Cost", value: data.hotel_cost, sub: `${data.nights} nights` },
                { label: "Activity Cost", value: data.activity_cost, sub: `${data.selected_activities?.length || 0} activities` },
                { label: "Transfer Cost", value: data.transfer_cost, sub: `${data.selected_transfers?.length || 0} transfers` },
                { label: "Other", value: data.other_cost || 0, sub: "" },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center py-2 border-b border-border/50">
                  <div><p className="text-foreground">{row.label}</p>{row.sub && <p className="text-xs text-muted-foreground">{row.sub}</p>}</div>
                  <p className="font-medium">{fmt(row.value, data.currency)}</p>
                </div>
              ))}
              <div className="flex justify-between items-center py-2 border-b border-border font-semibold"><p>Supplier Total</p><p>{fmt(supplierTotal, data.currency)}</p></div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-medium text-foreground">Markup & Final Price</h3>
            <div className="space-y-4">
              <Field label="Markup Type"><Select value={markup.type} onChange={e => setMarkup(m => ({ ...m, type: e.target.value }))}><option value="percentage">Percentage (%)</option><option value="fixed">Fixed Amount</option></Select></Field>
              <Field label={markup.type === "percentage" ? "Markup %" : `Markup Amount (${data.currency})`}><Input type="number" value={markup.value} onChange={e => setMarkup(m => ({ ...m, value: parseFloat(e.target.value) || 0 }))} /></Field>
              <Field label={`Discount (${data.currency})`}><Input type="number" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} /></Field>
              <Field label={`Tax (${data.currency})`}><Input type="number" value={tax} onChange={e => setTax(parseFloat(e.target.value) || 0)} /></Field>
            </div>
            <div className="space-y-2 pt-2 border-t border-border text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Supplier Total</span><span>{fmt(supplierTotal, data.currency)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Markup ({markup.type === "percentage" ? `${markup.value}%` : "fixed"})</span><span>+ {fmt(markupAmt, data.currency)}</span></div>
              {discount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>- {fmt(discount, data.currency)}</span></div>}
              {tax > 0 && <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>+ {fmt(tax, data.currency)}</span></div>}
              <div className="flex justify-between font-semibold text-lg text-foreground border-t border-border pt-2"><span>Final Price</span><span>{fmt(finalPrice, data.currency)}</span></div>
            </div>
            <Btn className="w-full" loading={saving} onClick={() => saveChanges()}><Save className="h-4 w-4" /> Save Pricing</Btn>
          </div>
        </div>
      )}

      {activeTab === "proposal" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Client-facing proposal preview</p>
            <Btn variant="secondary" size="sm" onClick={() => { const text = generateProposalText(data, days, finalPrice); navigator.clipboard.writeText(text); }}><Copy className="h-3.5 w-3.5" /> Copy Text</Btn>
          </div>
          <div className="rounded-xl border bg-white dark:bg-card p-8 space-y-6 font-serif">
            <div className="text-center border-b border-border pb-6">
              <p className="text-xs text-muted-foreground mb-2">Travel Proposal</p>
              <h1 className="text-2xl font-semibold text-foreground">{data.destination} Itinerary</h1>
              <p className="text-muted-foreground mt-1">Prepared for {data.client_name}</p>
              <p className="text-sm text-muted-foreground">{fmtDate(data.start_date)} – {fmtDate(data.end_date)} · {data.nights} Nights</p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              {[
                { label: "Travelers", value: `${data.adults} Adult(s)${data.children > 0 ? `, ${data.children} Child(ren)` : ""}` },
                { label: "Accommodation", value: data.selected_hotels?.[0]?.hotel_name || "—" },
                { label: "Meal Plan", value: data.meal_plan || "—" },
                { label: "Hotel Category", value: data.hotel_category || "—" },
                { label: "Transfer", value: data.transport_preference || "Private" },
                { label: "Trip Type", value: data.trip_type || "Leisure" },
              ].map(item => (
                <div key={item.label} className="bg-muted/30 rounded-lg p-3"><p className="text-xs text-muted-foreground ">{item.label}</p><p className="font-medium text-foreground mt-0.5">{item.value}</p></div>
              ))}
            </div>
            {days.length > 0 && (
              <div>
                <h2 className="text-base font-semibold text-foreground mb-3 text-xs text-muted-foreground">Day-by-Day Itinerary</h2>
                <div className="space-y-4">
                  {days.map(day => (
                    <div key={day.day_number} className="border-l-2 border-accent/30 pl-4 space-y-1">
                      <p className="font-semibold text-foreground text-sm">{day.title}</p>
                      {day.date && <p className="text-xs text-muted-foreground">{fmtDate(day.date)}</p>}
                      <ul className="space-y-1">{day.items.map((item, i) => (<li key={i} className="text-sm text-foreground flex items-start gap-2"><span className="text-muted-foreground mt-0.5">•</span><span>{item.title}{item.description ? ` — ${item.description}` : ""}</span></li>))}</ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="border-t border-border pt-4">
              <h2 className="text-xs text-muted-foreground font-semibold mb-3">Package Price</h2>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground space-y-1">
                  {data.selected_hotels?.[0] && <p>• Accommodation: {data.nights} nights at {data.selected_hotels[0].hotel_name}</p>}
                  {data.selected_activities?.map(a => <p key={a.id}>• {a.activity_name}</p>)}
                  {data.selected_transfers?.map(t => <p key={t.id}>• {t.transfer_type}: {t.route}</p>)}
                </div>
                <div className="text-right"><p className="text-3xl font-semibold text-foreground">{fmt(finalPrice, data.currency)}</p><p className="text-xs text-muted-foreground">for {data.adults} adult(s)</p></div>
              </div>
            </div>
            {data.special_requests && <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground"><p className="font-medium text-foreground mb-1">Special Arrangements</p><p>{data.special_requests}</p></div>}
          </div>
        </div>
      )}
    </>
  );
}

function generateProposalText(data: ItineraryFull, days: DayPlan[], finalPrice: number): string {
  let text = `TRAVEL PROPOSAL\n================\n\n`;
  text += `Client: ${data.client_name}\n`;
  text += `Destination: ${data.destination}\n`;
  text += `Dates: ${fmtDate(data.start_date)} – ${fmtDate(data.end_date)} (${data.nights} nights)\n`;
  text += `Travelers: ${data.adults} adult(s)${data.children > 0 ? `, ${data.children} child(ren)` : ""}\n\n`;
  text += `ITINERARY\n---------\n`;
  days.forEach(day => {
    text += `\n${day.title}\n`;
    day.items.forEach(item => { text += `  • ${item.title}${item.description ? ` — ${item.description}` : ""}\n`; });
  });
  text += `\nPACKAGE PRICE: ${fmt(finalPrice, data.currency)}\n`;
  return text;
}
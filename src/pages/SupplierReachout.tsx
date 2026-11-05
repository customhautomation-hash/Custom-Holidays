import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Bot, User, Loader2, RefreshCw, Phone, Mail,
  MapPin, Search, Sparkles, Clock, CheckCheck,
  Megaphone, Plus, X, CheckCircle2, AlertCircle,
  Users, MessageSquare, Bell, BellOff, ChevronRight,
  AlertTriangle, RotateCcw, Inbox,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

/* ─────────────────────────────────────────────
   SUPABASE CONFIG
   (uses your project ref hwegfrcnznuofzdorssd)
───────────────────────────────────────────── */
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const supabase      = createClient(SUPABASE_URL, SUPABASE_ANON);

/* n8n webhook — paste your actual webhook URL in .env */
const N8N_FOLLOWUP_WEBHOOK = import.meta.env.VITE_N8N_FOLLOWUP_WEBHOOK as string;

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface Supplier {
  id: string;               // supabase contact id (uuid)
  name: string;
  designation: string;
  company: string;
  address: string;
  phone: string;
  email: string;
  supplier_type: string;
  event: string;
  url: string;
}

/* Logged by n8n into `supplier_followup_log` table */
interface FollowUpLog {
  id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_email: string;
  quote_requested_at: string;   // ISO timestamp
  followup_sent_at: string | null;
  followup_status: "pending" | "sent" | "replied" | "failed";
  followup_message: string | null;
  reply_received_at: string | null;
  notes: string | null;
  created_at: string;
}

interface DealOffer  { roomType: string; nights: number; rate: string; inclusions: string; saving: string; }
interface Message    { id: string; role: "user" | "ai"; content: string; timestamp: Date; deal?: DealOffer; }
type BulkStatus      = "idle" | "sending" | "done" | "error";
interface BulkResult { supplier: Supplier; status: "sent" | "failed"; message?: string; }

/* ─────────────────────────────────────────────
   SUPABASE HELPERS
───────────────────────────────────────────── */

/**
 * Fetches contacts that look like suppliers.
 * Adjust the .eq() filter to whatever column you use to tag suppliers
 * (e.g. contact_type = 'supplier', or has a supplier_type set).
 * Currently returns ALL contacts; narrow with .not("supplier_type","is",null) if needed.
 */
/* ─────────────────────────────────────────────
   SUPABASE HELPERS  — updated to real schema
───────────────────────────────────────────── */

async function fetchAllSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select(`
      id,
      name,
      designation,
      company_name,
      place,
      phone,
      email,
      supplier_type,
      raw_notion_data
    `)
    .order("name", { ascending: true });

  if (error) { console.error("Supabase suppliers error:", error); return []; }

  return (data ?? []).map((row: any): Supplier => ({
    id:            row.id,
    name:          row.name           ?? "—",
    designation:   row.designation    ?? "",
    company:       row.company_name   ?? "",
    address: (row.place ?? (row.raw_notion_data?.place ?? ""))
  .replace(/\s*\(https?:\/\/[^)]+\)/g, "")
  .replace(/https?:\/\/\S+/g, "")
  .trim(),
    supplier_type: row.supplier_type  ?? "",
    event: (row.raw_notion_data?.met_where ?? "")
  .replace(/\s*\(https?:\/\/[^)]+\)/g, "")
  .trim(),
    url:           row.raw_notion_data?.url_website ?? "",
    phone:         row.phone          ?? "",
    email:         row.email          ?? "",
  }));
}

/* Fetch follow-up tracking from supplier_quote_requests */
async function fetchFollowUpLogs(): Promise<FollowUpLog[]> {
  const { data, error } = await supabase
    .from("supplier_quote_requests")
    .select(`
      id,
      supplier_id,
      destination,
      travel_date,
      quote_sent_at,
      replied,
      reply_received_at,
      follow_up_sent,
      follow_up_sent_at,
      status,
      notes,
      created_at
    `)
    .order("created_at", { ascending: false });

  if (error) { console.error("Supabase quote requests error:", error); return []; }

  /* Map supplier_quote_requests → FollowUpLog shape the UI expects */
  const supplierIds = [...new Set((data ?? []).map((r: any) => r.supplier_id).filter(Boolean))];
  let supplierMap: Record<string, { name: string; email: string }> = {};

  if (supplierIds.length > 0) {
    const { data: sups } = await supabase
      .from("suppliers")
      .select("id, name, email")
      .in("id", supplierIds);
    (sups ?? []).forEach((s: any) => { supplierMap[s.id] = { name: s.name, email: s.email }; });
  }

  return (data ?? []).map((row: any): FollowUpLog => {
    const sup = supplierMap[row.supplier_id] ?? { name: "Unknown Supplier", email: "" };
    /* Derive followup_status from the boolean columns */
    let followup_status: FollowUpLog["followup_status"] = "pending";
    if (row.replied)               followup_status = "replied";
    else if (row.follow_up_sent)   followup_status = "sent";
    else if (row.status === "failed") followup_status = "failed";

    return {
      id:                  row.id,
      supplier_id:         row.supplier_id,
      supplier_name:       sup.name,
      supplier_email:      sup.email,
      quote_requested_at:  row.quote_sent_at ?? row.created_at,
      followup_sent_at:    row.follow_up_sent_at ?? null,
      followup_status,
      followup_message:    null,
      reply_received_at:   row.reply_received_at ?? null,
      notes:               row.notes ?? null,
      created_at:          row.created_at,
    };
  });
}

/* Log a new quote request */
async function logQuoteRequest(supplier: Supplier): Promise<void> {
  await supabase.from("supplier_quote_requests").insert({
    supplier_id:  supplier.id,
    quote_sent_at: new Date().toISOString(),
    replied:      false,
    follow_up_sent: false,
    status:       "pending",
    notes:        "Logged from Supplier Reachout dashboard",
  });
}

/* Mark as replied */
async function markAsReplied(logId: string): Promise<void> {
  await supabase
    .from("supplier_quote_requests")
    .update({
      replied:           true,
      reply_received_at: new Date().toISOString(),
      status:            "replied",
    })
    .eq("id", logId);
}

/**
 * Manually trigger the n8n follow-up workflow for a specific supplier.
 * The n8n webhook node receives: { supplier_id, supplier_name, supplier_email, log_id }
 */
async function triggerFollowUpNow(log: FollowUpLog): Promise<void> {
  if (!N8N_FOLLOWUP_WEBHOOK) { alert("Set VITE_N8N_FOLLOWUP_WEBHOOK in your .env"); return; }
  await fetch(N8N_FOLLOWUP_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quote_request_id: log.id,
      supplier_id:      log.supplier_id,
      supplier_name:    log.supplier_name,
      supplier_email:   log.supplier_email,
      manual_trigger:   true,
    }),
  });
}

/* ─────────────────────────────────────────────
   AI HELPERS  (unchanged from original)
───────────────────────────────────────────── */
async function getAIResponse(
  msgs: { role: string; content: string }[],
  ctx: string,
  wantsDeal: boolean,
): Promise<{ text: string; deal?: DealOffer }> {
  const system = `You are a professional travel industry outreach assistant for Custom Holidays.
Supplier: ${ctx}
Draft supplier communications — WhatsApp, emails, negotiation scripts, proposals, follow-ups.
Be professional, warm, concise, always include a call to action.
${wantsDeal ? `End reply with: DEAL_JSON:{"roomType":"Deluxe Room","nights":3,"rate":"₹18,500/night","inclusions":"Breakfast + Dinner","saving":"₹8,200 vs rack"}` : ""}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system,
      messages: msgs.map(m => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error("AI request failed");
  const data  = await res.json();
  const raw   = data.content?.[0]?.text ?? "Sorry, couldn't generate a response.";
  const match = raw.match(/DEAL_JSON:(\{[\s\S]*?\})/);
  let deal: DealOffer | undefined;
  let text = raw;
  if (match) {
    try { deal = JSON.parse(match[1]); } catch {}
    text = raw.replace(/DEAL_JSON:[\s\S]*$/, "").trim();
  }
  return { text, deal };
}

async function generateBulkMessage(templatePrompt: string, supplier: Supplier): Promise<string> {
  const ctx = [supplier.name, supplier.company, supplier.supplier_type, supplier.address].filter(Boolean).join(", ");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: `You are a travel industry outreach assistant. Generate a personalised, professional, concise WhatsApp/email message for this supplier: ${ctx}. No preamble, just the message text.`,
      messages: [{ role: "user", content: templatePrompt }],
    }),
  });
  if (!res.ok) throw new Error("failed");
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const FILTER_TABS    = ["All", "Active", "Deals", "Pending", "Chases"];
const SUPPLIER_TYPES = ["All Types","Luxury Hotel / Resort","Boutique Hotel","Budget Hotel","Transport","Tour Operator","Travel Agency","Local Guide","Activity Provider","Other"];

const BULK_TEMPLATES = [
  { id: "rate",      icon: "💰", label: "Rate Inquiry",           prompt: "Write a brief rate inquiry message asking for their best seasonal rates for 2025, mentioning we are a premium travel agency with bulk bookings." },
  { id: "avail",     icon: "📅", label: "Availability Check",     prompt: "Write a brief availability check message for the upcoming summer season, asking about room/service availability for June-August 2025." },
  { id: "negotiate", icon: "🤝", label: "Negotiate Bulk",         prompt: "Write a professional bulk negotiation message requesting volume discounts, mentioning we plan to book 50+ room nights this season." },
  { id: "partner",   icon: "📧", label: "Partnership Proposal",   prompt: "Write a warm partnership proposal email for a long-term preferred supplier relationship with Custom Holidays." },
  { id: "intro",     icon: "👋", label: "WhatsApp Intro",         prompt: "Write a warm, friendly WhatsApp introduction message introducing Custom Holidays and expressing interest in working together." },
  { id: "followup",  icon: "🔄", label: "Follow-up",              prompt: "Write a polite follow-up message for a previous inquiry, mentioning we are still interested and look forward to hearing from them." },
  { id: "seasonal",  icon: "🌴", label: "Seasonal Offer Request", prompt: "Write a message asking for their best seasonal packages and special offers for the upcoming travel season." },
  { id: "fam",       icon: "✈️", label: "FAM Trip Invite",        prompt: "Write an invitation message for a familiarisation (FAM) trip to experience their property/services firsthand." },
];

const QUICK_TEMPLATES = [
  { icon: "💰", label: "Rate Inquiry",       desc: "Ask for best seasonal rates",    prompt: "Ask for their best rates for this season, mention we book in bulk" },
  { icon: "📅", label: "Availability Check", desc: "Check room/slot availability",   prompt: "Check availability for next month for 10 pax" },
  { icon: "🤝", label: "Negotiate Bulk",     desc: "Request volume discount",        prompt: "Negotiate a bulk booking discount, we plan 20+ room nights" },
  { icon: "📧", label: "Partnership Email",  desc: "Write full partnership proposal", prompt: "Write a formal partnership proposal email" },
  { icon: "🔔", label: "Follow-Up",          desc: "Gentle reminder for quote",      prompt: "Write a polite follow-up message for our previous enquiry" },
];

const ACTIVE_DEALS = [
  { icon: "🏨", name: "Taj Lake Palace",    sub: "Udaipur · 3N/4D",         saving: "-₹8,200" },
  { icon: "🚐", name: "Royal Cab Service",  sub: "Jaipur circuit · 5 days", saving: "-₹3,500" },
  { icon: "⛵", name: "Backwater Escape",   sub: "Alleppey houseboat",       saving: "-₹5,400" },
];

const TYPE_COLORS: Record<string, string> = {
  "Luxury Hotel / Resort": "bg-blue-100 text-blue-700",
  "Boutique Hotel":        "bg-teal-100 text-teal-700",
  "Budget Hotel":          "bg-slate-100 text-slate-600",
  "Transport":             "bg-amber-100 text-amber-700",
  "Tour Operator":         "bg-teal-100 text-teal-700",
  "Travel Agency":         "bg-pink-100 text-pink-700",
  "Local Guide":           "bg-lime-100 text-lime-700",
  "Activity Provider":     "bg-green-100 text-green-700",
  "Other":                 "bg-gray-100 text-gray-600",
};

const FOLLOW_STATUS_META: Record<FollowUpLog["followup_status"], { label: string; color: string; dot: string }> = {
  pending:  { label: "Pending",  color: "text-amber-600",  dot: "bg-amber-400" },
  sent:     { label: "Sent",     color: "text-blue-600",   dot: "bg-blue-400" },
  replied:  { label: "Replied",  color: "text-green-600",  dot: "bg-green-500" },
  failed:   { label: "Failed",   color: "text-red-500",    dot: "bg-red-400" },
};

const GRADS = ["from-teal-500 to-teal-600","from-emerald-500 to-teal-600","from-blue-500 to-cyan-600","from-orange-500 to-amber-600","from-teal-500 to-pink-600","from-teal-500 to-blue-600"];
function grad(name: string) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff; return GRADS[h % GRADS.length]; }
function initials(name: string) { return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join(""); }
function renderContent(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((p, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{p}</strong> : <span key={i}>{p}</span>,
  );
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1)  return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ─────────────────────────────────────────────
   DEAL CARD
───────────────────────────────────────────── */
function DealCard({ deal, onAccept, onCounter }: { deal: DealOffer; onAccept: () => void; onCounter: () => void }) {
  const [accepted, setAccepted] = useState(false);
  return (
    <div className="mt-2 border-2 border-amber-200 rounded-2xl overflow-hidden bg-white shadow-md max-w-xs">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-100">
        <span className="text-sm font-semibold text-amber-800">Deal Offer</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {([["Room", deal.roomType], ["Nights", String(deal.nights)], ["Rate", deal.rate], ["Inclusions", deal.inclusions], ["Saving", deal.saving]] as [string, string][]).map(([k, v]) => (
          <div key={k} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className={`font-semibold ${k === "Saving" ? "text-green-600" : "text-card-foreground"}`}>{v}</span>
          </div>
        ))}
      </div>
      {!accepted ? (
        <div className="flex gap-2 px-4 pb-4 pt-1">
          <button onClick={() => { setAccepted(true); onAccept(); }} className="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold py-2 rounded-xl transition-colors">✓ Accept Deal</button>
          <button onClick={onCounter} className="flex-1 border border-border bg-muted/40 hover:bg-muted text-card-foreground text-sm font-semibold py-2 rounded-xl transition-colors">↩ Counter</button>
        </div>
      ) : (
        <div className="px-4 pb-4 pt-1 text-center text-green-600 text-sm font-semibold">Deal Accepted</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   FOLLOW-UP CHASES PANEL
   Shown when filterTab === "Chases"
═══════════════════════════════════════════════════════════ */
function ChasesPanel({ logs, onRefresh }: { logs: FollowUpLog[]; onRefresh: () => void }) {
  const [triggeringId, setTriggeringId]   = useState<string | null>(null);
  const [markingId,    setMarkingId]      = useState<string | null>(null);
  const [toast,        setToast]          = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleTrigger = async (log: FollowUpLog) => {
    setTriggeringId(log.id);
    try {
      await triggerFollowUpNow(log);
      showToast(`Follow-up triggered for ${log.supplier_name}`);
      onRefresh();
    } catch { showToast("Failed to trigger n8n workflow"); }
    finally { setTriggeringId(null); }
  };

  const handleMarkReplied = async (log: FollowUpLog) => {
    setMarkingId(log.id);
    await markAsReplied(log.id);
    showToast(`Marked as replied — ${log.supplier_name}`);
    setMarkingId(null);
    onRefresh();
  };

  const pending  = logs.filter(l => l.followup_status === "pending");
  const sent     = logs.filter(l => l.followup_status === "sent");
  const replied  = logs.filter(l => l.followup_status === "replied");
  const failed   = logs.filter(l => l.followup_status === "failed");

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full py-20 text-center px-8">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-card-foreground">No follow-up chases yet</p>
          <p className="text-xs text-muted-foreground mt-1">When you send a quote request, it'll be tracked here.<br />n8n auto-sends a follow-up if there's no reply in 24 hours.</p>
        </div>
      </div>
    );
  }

  const Section = ({ title, items, accent }: { title: string; items: FollowUpLog[]; accent: string }) => {
    if (!items.length) return null;
    return (
      <div className="mb-6">
        <div className={`flex items-center gap-2 mb-3 px-1`}>
          <span className={`text-[11px] font-semibold   ${accent}`}>{title}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted`}>{items.length}</span>
        </div>
        <div className="space-y-2">
          {items.map(log => {
            const meta    = FOLLOW_STATUS_META[log.followup_status];
            const hoursOld = (Date.now() - new Date(log.quote_requested_at).getTime()) / 3600000;
            const overdue  = hoursOld >= 24 && log.followup_status === "pending";
            return (
              <div key={log.id} className={`rounded-2xl border overflow-hidden transition-all ${overdue ? "border-red-300 bg-red-50/50" : "border-border bg-card"}`}>
                <div className="flex items-start gap-3 px-4 py-3">
                  {/* avatar */}
                  <div className={`h-9 w-9 rounded-full bg-[#3E6B6C] flex items-center justify-center text-[11px] font-semibold text-white shrink-0`}>
                    {initials(log.supplier_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-card-foreground truncate">{log.supplier_name}</p>
                      {overdue && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-red-500 shrink-0 bg-red-100 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="h-2.5 w-2.5" /> Overdue
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{log.supplier_email}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        Quote sent {timeAgo(log.quote_requested_at)}
                      </span>
                      {log.followup_sent_at && (
                        <span className="flex items-center gap-1 text-[11px] text-blue-600">
                          <Send className="h-2.5 w-2.5" />
                          Follow-up {timeAgo(log.followup_sent_at)}
                        </span>
                      )}
                      {log.reply_received_at && (
                        <span className="flex items-center gap-1 text-[11px] text-green-600">
                          <CheckCheck className="h-2.5 w-2.5" />
                          Replied {timeAgo(log.reply_received_at)}
                        </span>
                      )}
                    </div>
                    {log.followup_message && (
                      <p className="text-[11px] text-muted-foreground mt-1.5 italic line-clamp-2 bg-muted/40 px-2 py-1.5 rounded-lg">
                        "{log.followup_message}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Action row */}
                {log.followup_status !== "replied" && (
                  <div className="flex items-center gap-2 px-4 pb-3 pt-0">
                    {(log.followup_status === "pending" || log.followup_status === "failed") && (
                      <button
                        onClick={() => handleTrigger(log)}
                        disabled={triggeringId === log.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {triggeringId === log.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Send className="h-3 w-3" />}
                        Send Follow-up Now
                      </button>
                    )}
                    {log.followup_status === "sent" && (
                      <button
                        onClick={() => handleMarkReplied(log)}
                        disabled={markingId === log.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {markingId === log.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <CheckCircle2 className="h-3 w-3" />}
                        Mark as Replied
                      </button>
                    )}
                    <span className={`flex items-center gap-1 text-[11px] font-semibold ml-auto ${meta.color}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex-1 overflow-y-auto px-4 py-5">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="sticky top-0 z-10 mb-3 flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2.5 shadow-md text-xs font-medium text-card-foreground"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />{toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: "Pending",  val: pending.length,  color: "text-amber-600",  bg: "bg-amber-50  border-amber-200"  },
          { label: "Sent",     val: sent.length,     color: "text-blue-600",   bg: "bg-blue-50   border-blue-200"   },
          { label: "Replied",  val: replied.length,  color: "text-green-600",  bg: "bg-green-50  border-green-200"  },
          { label: "Failed",   val: failed.length,   color: "text-red-500",    bg: "bg-red-50    border-red-200"    },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-2.5 text-center ${s.bg}`}>
            <p className={`text-xl font-semibold ${s.color}`}>{s.val}</p>
            <p className={`text-[11px] font-semibold ${s.color}`}>{s.label}</p>
          </div>
        ))}
      </div>

      <Section title="Overdue / Pending"  items={[...pending.filter(l => (Date.now()-new Date(l.quote_requested_at).getTime())>=86400000), ...pending.filter(l => (Date.now()-new Date(l.quote_requested_at).getTime())<86400000)]} accent="text-amber-600" />
      <Section title="Follow-up Sent"     items={sent}    accent="text-blue-600" />
      <Section title="Failed"             items={failed}  accent="text-red-500"  />
      <Section title="Replied"          items={replied} accent="text-green-600" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   BULK BROADCAST MODAL  (same as original, updated model str)
═══════════════════════════════════════════════════════════ */
function BulkModal({ suppliers, onClose }: { suppliers: Supplier[]; onClose: () => void }) {
  const [step,              setStep]             = useState<"compose"|"preview"|"sending"|"done">("compose");
  const [selectedIds,       setSelectedIds]      = useState<Set<string>>(new Set());
  const [typeFilter,        setTypeFilter]       = useState("All Types");
  const [searchQ,           setSearchQ]          = useState("");
  const [selectedTemplate,  setSelectedTemplate] = useState(BULK_TEMPLATES[0]);
  const [customMessage,     setCustomMessage]    = useState("");
  const [useCustom,         setUseCustom]        = useState(false);
  const [personalise,       setPersonalise]      = useState(true);
  const [results,           setResults]          = useState<BulkResult[]>([]);
  const [currentIdx,        setCurrentIdx]       = useState(0);
  const [previewMessages,   setPreviewMessages]  = useState<Record<string, string>>({});
  const [generatingPreview, setGeneratingPreview] = useState(false);

  const filteredS = suppliers.filter(s => {
    const q = searchQ.toLowerCase();
    return (typeFilter === "All Types" || s.supplier_type === typeFilter)
        && (!q || s.name.toLowerCase().includes(q) || s.company.toLowerCase().includes(q));
  });

  const toggleAll = () => selectedIds.size === filteredS.length
    ? setSelectedIds(new Set())
    : setSelectedIds(new Set(filteredS.map(s => s.id)));
  const toggle = (id: string) => setSelectedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedSuppliers = suppliers.filter(s => selectedIds.has(s.id));

  const generatePreview = async () => {
    setGeneratingPreview(true);
    const msgs: Record<string, string> = {};
    const prompt = useCustom ? customMessage : selectedTemplate.prompt;
    for (const s of selectedSuppliers.slice(0, 3)) {
      try { msgs[s.id] = personalise ? await generateBulkMessage(prompt, s) : prompt; }
      catch { msgs[s.id] = prompt; }
    }
    setPreviewMessages(msgs);
    setGeneratingPreview(false);
    setStep("preview");
  };

  const runBulkSend = async () => {
    setStep("sending"); setCurrentIdx(0);
    const res: BulkResult[] = [];
    const prompt = useCustom ? customMessage : selectedTemplate.prompt;
    for (let i = 0; i < selectedSuppliers.length; i++) {
      setCurrentIdx(i + 1);
      const s = selectedSuppliers[i];
      try {
        const msg = personalise ? await generateBulkMessage(prompt, s) : prompt;
        if (s.phone) window.open(`https://wa.me/${s.phone.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`, "_blank");
        else if (s.email) window.open(`mailto:${s.email}?subject=Custom Holidays Partnership&body=${encodeURIComponent(msg)}`, "_blank");
        res.push({ supplier: s, status: "sent", message: msg });
      } catch { res.push({ supplier: s, status: "failed" }); }
      await new Promise(r => setTimeout(r, 800));
    }
    setResults(res);
    setStep("done");
  };

  const sentCount   = results.filter(r => r.status === "sent").length;
  const failedCount = results.filter(r => r.status === "failed").length;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <motion.div initial={{ opacity:0, scale:0.95, y:16 }} animate={{ opacity:1, scale:1, y:0 }} exit={{ opacity:0, scale:0.95 }}
        className="bg-card rounded-2xl border shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500 flex items-center justify-center"><Megaphone className="h-5 w-5 text-white" /></div>
            <div>
              <h2 className="font-semibold text-card-foreground text-base">Bulk Broadcast</h2>
              <p className="text-xs text-muted-foreground">Personalised messages to multiple suppliers at once</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex items-center px-6 py-3 border-b border-border gap-2 bg-muted/20">
          {(["compose","preview","sending","done"] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${step===s?"bg-amber-500 text-white":(["compose","preview","sending","done"].indexOf(step)>i)?"bg-green-500 text-white":"bg-muted text-muted-foreground"}`}>{i+1}</div>
              <span className={`text-xs font-medium capitalize ${step===s?"text-amber-600":"text-muted-foreground"}`}>{s}</span>
              {i < 3 && <div className="w-8 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {step === "compose" && (
            <div className="flex h-full">
              <div className="w-80 shrink-0 border-r border-border flex flex-col">
                <div className="p-4 space-y-2 border-b border-border">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground ">Select Recipients</p>
                    <button onClick={toggleAll} className="text-xs text-amber-600 hover:underline font-medium">{selectedIds.size===filteredS.length?"Deselect All":"Select All"}</button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <input placeholder="Search…" className="w-full pl-8 h-8 rounded-lg border border-border bg-muted/30 text-xs focus:outline-none focus:border-amber-400"
                      value={searchQ} onChange={e => setSearchQ(e.target.value)} />
                  </div>
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                    className="w-full h-8 rounded-lg border border-border bg-background text-xs px-2 focus:outline-none focus:border-amber-400">
                    {SUPPLIER_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <p className="text-[11px] text-muted-foreground">{selectedIds.size} of {filteredS.length} selected</p>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredS.map(s => (
                    <label key={s.id} className={`flex items-start gap-3 px-4 py-3 border-b border-border/40 cursor-pointer hover:bg-muted/30 transition-colors ${selectedIds.has(s.id)?"bg-amber-50":""}`}>
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggle(s.id)} className="mt-1 rounded accent-amber-500 h-3.5 w-3.5 shrink-0" />
                      <div className={`h-8 w-8 rounded-full bg-[#3E6B6C] flex items-center justify-center shrink-0 text-[11px] font-semibold text-white`}>{initials(s.name)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-card-foreground truncate">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{s.supplier_type||"Supplier"}</p>
                        <div className="flex gap-2 mt-0.5">
                          {s.phone && <span className="text-[11px] text-green-600 flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />WA</span>}
                          {s.email && <span className="text-[11px] text-blue-600 flex items-center gap-0.5"><Mail className="h-2.5 w-2.5" />Email</span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex-1 p-5 space-y-4 overflow-y-auto">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Choose Template</p>
                  <div className="grid grid-cols-2 gap-2">
                    {BULK_TEMPLATES.map(t => (
                      <button key={t.id} onClick={() => { setSelectedTemplate(t); setUseCustom(false); }}
                        className={`text-left rounded-xl border p-3 transition-all ${!useCustom&&selectedTemplate.id===t.id?"border-amber-400 bg-amber-50":"border-border hover:border-amber-300 hover:bg-amber-50/50"}`}>
                        <div className="flex items-center gap-2 mb-1"><span className="text-xs font-semibold text-card-foreground">{t.label}</span></div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{t.prompt.slice(0,60)}…</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="checkbox" id="custom-cb" checked={useCustom} onChange={e => setUseCustom(e.target.checked)} className="accent-amber-500" />
                    <label htmlFor="custom-cb" className="text-xs font-semibold text-muted-foreground cursor-pointer">Custom Message</label>
                  </div>
                  <textarea placeholder="Write your own message prompt…" rows={4} value={customMessage}
                    onChange={e => { setCustomMessage(e.target.value); setUseCustom(true); }}
                    className="w-full rounded-xl border border-border bg-muted/30 text-sm px-3 py-2 focus:outline-none focus:border-amber-400 resize-none transition-all" />
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-teal-50 border border-teal-200">
                  <input type="checkbox" id="personalise-cb" checked={personalise} onChange={e => setPersonalise(e.target.checked)} className="accent-teal-500 h-4 w-4" />
                  <div>
                    <label htmlFor="personalise-cb" className="text-xs font-semibold text-teal-800 cursor-pointer">AI Personalisation</label>
                    <p className="text-[11px] text-teal-600">Each message uniquely tailored to the supplier's profile</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="text-xs text-muted-foreground">{selectedIds.size===0?"No recipients selected":`${selectedIds.size} recipient${selectedIds.size>1?"s":""} · via WhatsApp or Email`}</div>
                  <button onClick={generatePreview} disabled={selectedIds.size===0||(!useCustom?false:!customMessage.trim())}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-40 shadow-sm">
                    {generatingPreview?<Loader2 className="h-4 w-4 animate-spin"/>:<Sparkles className="h-4 w-4"/>} Preview Messages →
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="p-6 space-y-5">
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">AI Preview (first 3 suppliers)</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">Each message will be personalised per supplier on send.</p>
                </div>
              </div>
              <div className="space-y-4">
                {selectedSuppliers.slice(0, 3).map(s => (
                  <div key={s.id} className="rounded-xl border border-border overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/30 border-b border-border">
                      <div className={`h-7 w-7 rounded-full bg-[#3E6B6C] flex items-center justify-center text-[11px] font-semibold text-white`}>{initials(s.name)}</div>
                      <div>
                        <p className="text-xs font-semibold text-card-foreground">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground">{s.supplier_type} · {s.phone?"via WhatsApp":"via Email"}</p>
                      </div>
                    </div>
                    <div className="px-4 py-3 bg-[#dcf8c6] text-gray-800 text-sm leading-relaxed whitespace-pre-wrap rounded-b-xl min-h-[60px]">
                      {generatingPreview ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin"/><span className="text-xs">Generating…</span></div> : previewMessages[s.id]||"Generating preview…"}
                    </div>
                  </div>
                ))}
                {selectedSuppliers.length>3 && (
                  <div className="text-center text-xs text-muted-foreground bg-muted/30 rounded-xl py-3">+ {selectedSuppliers.length-3} more suppliers will receive personalised messages</div>
                )}
              </div>
              <div className="flex gap-3 pt-2 border-t border-border">
                <button onClick={() => setStep("compose")} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-card-foreground hover:bg-muted transition-colors">← Back</button>
                <button onClick={runBulkSend} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition-colors shadow-sm">
                  <Send className="h-4 w-4" /> Send to {selectedIds.size} Supplier{selectedIds.size>1?"s":""}
                </button>
              </div>
            </div>
          )}

          {step === "sending" && (
            <div className="flex flex-col items-center justify-center py-16 px-6 gap-5">
              <div className="h-16 w-16 rounded-2xl bg-green-500 flex items-center justify-center shadow-lg"><Send className="h-8 w-8 text-white" /></div>
              <div className="text-center">
                <p className="text-lg font-semibold text-card-foreground">Sending Messages…</p>
                <p className="text-sm text-muted-foreground mt-1">{currentIdx} of {selectedSuppliers.length} sent</p>
              </div>
              <div className="w-full max-w-sm bg-muted rounded-full h-2.5 overflow-hidden">
                <motion.div className="h-full bg-green-500 rounded-full" animate={{ width:`${(currentIdx/selectedSuppliers.length)*100}%` }} transition={{ duration:0.4 }} />
              </div>
              <p className="text-xs text-muted-foreground">{currentIdx<selectedSuppliers.length?`Opening: ${selectedSuppliers[currentIdx-1]?.name||"…"}`:"Finalising…"}</p>
            </div>
          )}

          {step === "done" && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-green-500 flex items-center justify-center shadow-md shrink-0"><CheckCircle2 className="h-8 w-8 text-white" /></div>
                <div>
                  <p className="text-lg font-semibold text-card-foreground">Broadcast Complete!</p>
                  <p className="text-sm text-muted-foreground">{sentCount} sent · {failedCount} failed</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[{val:sentCount,label:"Sent",cls:"bg-green-50 border-green-200 text-green-600"},{val:failedCount,label:"Failed",cls:"bg-red-50 border-red-200 text-red-500"},{val:selectedSuppliers.length,label:"Total",cls:"bg-blue-50 border-blue-200 text-blue-600"}].map(s=>(
                  <div key={s.label} className={`rounded-xl border p-3 text-center ${s.cls}`}>
                    <p className="text-2xl font-semibold">{s.val}</p>
                    <p className="text-[11px] font-medium">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-border overflow-hidden max-h-60 overflow-y-auto">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0">
                    <div className={`h-7 w-7 rounded-full bg-[#3E6B6C] flex items-center justify-center text-[11px] font-semibold text-white shrink-0`}>{initials(r.supplier.name)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-card-foreground truncate">{r.supplier.name}</p>
                      <p className="text-[11px] text-muted-foreground">{r.supplier.phone?"WhatsApp opened":"Email opened"}</p>
                    </div>
                    {r.status==="sent"?<CheckCircle2 className="h-4 w-4 text-green-500 shrink-0"/>:<AlertCircle className="h-4 w-4 text-red-500 shrink-0"/>}
                  </div>
                ))}
              </div>
              <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors">Done</button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export function SupplierReachout() {
  const [suppliers,     setSuppliers]     = useState<Supplier[]>([]);
  const [followUpLogs,  setFollowUpLogs]  = useState<FollowUpLog[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [filterTab,     setFilterTab]     = useState("All");
  const [selected,      setSelected]      = useState<Supplier | null>(null);
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [input,         setInput]         = useState("");
  const [aiThinking,    setAiThinking]    = useState(false);
  const [chatHistory,   setChatHistory]   = useState<{ role: string; content: string }[]>([]);
  const [aiPrompt,      setAiPrompt]      = useState("");
  const [generating,    setGenerating]    = useState(false);
  const [showBulk,      setShowBulk]      = useState(false);
  const [bulkCategory,  setBulkCategory]  = useState("Luxury Hotel / Resort");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    const [s, l] = await Promise.all([fetchAllSuppliers(), fetchFollowUpLogs()]);
    setSuppliers(s);
    setFollowUpLogs(l);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const pendingChases = followUpLogs.filter(l => l.followup_status === "pending" || l.followup_status === "sent").length;

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.company.toLowerCase().includes(q) || s.supplier_type.toLowerCase().includes(q);
  });

  const selectSupplier = (s: Supplier) => {
    setSelected(s); setChatHistory([]);
    setMessages([{ id: Date.now().toString(), role: "ai", timestamp: new Date(),
      content: `Hi! I'm your AI outreach assistant for **${s.name}**${s.company ? ` from ${s.company}` : ""}.

I can help you:
• Draft WhatsApp or email messages
• Write partnership proposals
• Create negotiation scripts & get deal offers
• Suggest follow-up timing

What would you like to communicate?` }]);
  };

  const buildCtx = (s: Supplier) => [
    "Name: "+s.name, s.designation?"Designation: "+s.designation:"", s.company?"Company: "+s.company:"",
    s.supplier_type?"Type: "+s.supplier_type:"", s.address?"Location: "+s.address:"",
    s.phone?"Phone: "+s.phone:"", s.email?"Email: "+s.email:"", s.event?"Met at: "+s.event:"",
  ].filter(Boolean).join("\n");

  const doSend = async (text: string) => {
    if (!text.trim() || !selected || aiThinking) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text, timestamp: new Date() };
    setMessages(p => [...p, userMsg]);
    const hist = [...chatHistory, { role: "user", content: text }];
    setChatHistory(hist); setAiThinking(true);

    /* If it's a quote request, log it to Supabase so n8n can watch it */
    if (/rate|quote|price|deal|negotiat|offer|discount|request/i.test(text)) {
      logQuoteRequest(selected).then(() => loadData()); // fire-and-forget + refresh
    }

    const wantsDeal = /rate|quote|price|deal|negotiat|offer|discount/i.test(text);
    try {
      const { text: aiText, deal } = await getAIResponse(hist, buildCtx(selected), wantsDeal);
      setMessages(p => [...p, { id: (Date.now()+1).toString(), role: "ai", content: aiText, timestamp: new Date(), deal }]);
      setChatHistory(p => [...p, { role: "assistant", content: aiText }]);
    } catch {
      setMessages(p => [...p, { id: (Date.now()+1).toString(), role: "ai", content: "Sorry, couldn't connect to AI. Please try again.", timestamp: new Date() }]);
    } finally { setAiThinking(false); inputRef.current?.focus(); }
  };

  const handleSend     = () => { doSend(input); setInput(""); };
  const handleKey      = (e: React.KeyboardEvent) => { if (e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); handleSend(); } };
  const handleGenerate = async () => {
    if (!aiPrompt.trim() || !selected) return; setGenerating(true);
    try { const { text } = await getAIResponse([{ role:"user", content:aiPrompt }], buildCtx(selected), false); setInput(text); }
    catch {} finally { setGenerating(false); setAiPrompt(""); }
  };

  const fmt = (d: Date) => d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });

  /* Show Chases panel in place of chat area */
  const showChases = filterTab === "Chases";

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-4rem)] flex overflow-hidden -m-6">

        {/* ═══ LEFT SIDEBAR ═══ */}
        <div className="w-80 shrink-0 border-r border-border bg-card flex flex-col">
          <div className="px-4 pt-5 pb-3 border-b border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-card-foreground leading-tight">Supplier Outreach</h2>
                <p className="text-[11px] text-muted-foreground">AI messaging · deal tracking · follow-up automation</p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setShowBulk(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 text-[11px] text-amber-700 bg-amber-50 hover:bg-amber-100 font-semibold transition-colors">
                  <Megaphone className="h-3 w-3" /> Broadcast
                </button>
                <button onClick={loadData} title="Refresh"
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:bg-muted font-semibold transition-colors">
                  <RefreshCw className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input placeholder="Search suppliers…" className="w-full pl-9 pr-3 h-9 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1 p-1 bg-muted/40 rounded-xl">
              {FILTER_TABS.map(tab => (
                <button key={tab} onClick={() => setFilterTab(tab)}
                  className={`flex-1 text-[11px] py-1.5 rounded-lg font-semibold transition-all relative ${filterTab===tab?"bg-card shadow-sm text-card-foreground":"text-muted-foreground hover:text-card-foreground"}`}>
                  {tab}
                  {tab === "Chases" && pendingChases > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">{pendingChases}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk broadcast CTA banner — hidden on Chases tab */}
          {filterTab !== "Chases" && (
            <button onClick={() => setShowBulk(true)}
              className="mx-3 mt-3 flex items-center gap-3 p-3 rounded-xl bg-primary text-white hover:opacity-90 transition-opacity shadow-sm">
              <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0"><Users className="h-4 w-4" /></div>
              <div className="text-left flex-1">
                <p className="text-xs font-semibold">Bulk Broadcast</p>
                <p className="text-[11px] text-white/80">{suppliers.length} suppliers · AI personalised</p>
              </div>
              <MessageSquare className="h-4 w-4 opacity-70" />
            </button>
          )}

          {/* n8n follow-up automation info banner — shown on Chases tab */}
          {filterTab === "Chases" && (
            <div className="mx-3 mt-3 flex items-start gap-3 p-3 rounded-xl bg-primary text-white shadow-sm">
              <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0"><Bell className="h-4 w-4" /></div>
              <div className="text-left flex-1">
                <p className="text-xs font-semibold">Auto Follow-up Active</p>
                <p className="text-[11px] text-white/80">n8n watches for unanswered quotes and auto-emails after 24 hrs</p>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto mt-2">
            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs">Loading from Supabase…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No suppliers found.</div>
            ) : filtered.map((s, idx) => {
              const isActive  = selected?.id === s.id;
              const badge = 0;
              const hasChase  = followUpLogs.some(l => l.supplier_id === s.id && (l.followup_status === "pending" || l.followup_status === "sent"));
              return (
                <button key={s.id} onClick={() => { selectSupplier(s); if (filterTab === "Chases") setFilterTab("All"); }}
                  className={`w-full text-left px-4 py-3.5 border-b border-border/40 transition-all hover:bg-muted/30 ${isActive?"bg-teal-50 border-l-[3px] border-l-violet-500":""}`}>
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <div className={`h-10 w-10 rounded-full bg-[#3E6B6C] flex items-center justify-center shrink-0 text-[11px] font-semibold text-white shadow-sm`}>{initials(s.name)}</div>
                      {hasChase && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-400 border-2 border-card" title="Pending follow-up" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-semibold text-card-foreground truncate">{s.name}</p>
                        <span className="text-[11px] text-muted-foreground shrink-0">{idx%2===0?"2d ago":"4d ago"}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{s.supplier_type||"Supplier"} · {s.address||"—"}</p>
                    </div>
                  
                  </div>
                </button>
              );
            })}
          </div>
          <div className="p-3 border-t border-border text-center">
            <p className="text-[11px] text-muted-foreground">{suppliers.length} suppliers from Supabase</p>
          </div>
        </div>

        {/* ═══ MAIN AREA — Chat OR Chases ═══ */}
        {showChases ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-background">
            <div className="px-6 py-4 border-b border-border bg-card shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-[#0D5C5A] flex items-center justify-center"><Bell className="h-5 w-5 text-white" /></div>
                  <div>
                    <h2 className="font-semibold text-card-foreground text-base">Follow-up Chases</h2>
                    <p className="text-xs text-muted-foreground">n8n auto follow-up · 24-hr no-reply detection · logged chases</p>
                  </div>
                </div>
                <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted transition-colors">
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
              </div>
            </div>
            <ChasesPanel logs={followUpLogs} onRefresh={loadData} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#ece5dd" }}>
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8">
                <div className="h-20 w-20 rounded-3xl bg-primary flex items-center justify-center shadow-xl">
                  <Bot className="h-10 w-10 text-white" />
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-foreground">Supplier WhatsApp Automation</h2>
                  <p className="text-sm text-muted-foreground mt-1">AI-powered messaging · deal tracking · real-time quotes</p>
                </div>
                <button onClick={() => setShowBulk(true)}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors shadow-lg">
                  <Megaphone className="h-4 w-4" /> Start Bulk Broadcast
                </button>
                <div className="grid grid-cols-2 gap-2 max-w-sm w-full">
                  {["Draft WhatsApp intro","Write partnership email","Rate negotiation script","Follow-up message"].map(t => (
                    <div key={t} className="rounded-xl border border-border/50 bg-white/70 px-4 py-3 text-xs text-muted-foreground text-center shadow-sm">{t}</div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-black/10 bg-[#075e54] shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full bg-[#3E6B6C] flex items-center justify-center text-[11px] font-semibold text-white shadow-sm`}>{initials(selected.name)}</div>
                      <div>
                        <p className="text-sm font-semibold text-white">{selected.name}</p>
                        <div className="flex items-center gap-2 text-[11px] text-green-300">
                          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />Online</span>
                          {selected.phone && <span className="text-white/70">· {selected.phone}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => doSend("Please send us your best rates and deal offer.")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors border border-white/20">
                        Request Quote
                      </button>
                      <button onClick={() => doSend("We'd like to negotiate better rates. What's your best deal with inclusions?")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-400 hover:bg-green-300 text-green-900 text-xs font-semibold transition-colors shadow-sm">
                        Negotiate
                      </button>
                      <button onClick={() => selectSupplier(selected)} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                  <AnimatePresence initial={false}>
                    {messages.map(msg => (
                      <motion.div key={msg.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.15 }}
                        className={"flex "+(msg.role==="user"?"justify-end":"justify-start")}>
                        <div className={"max-w-[65%] flex flex-col "+(msg.role==="user"?"items-end":"items-start")}>
                          <div className={"rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm "+(msg.role==="ai"?"bg-white text-gray-800 rounded-tl-sm":"bg-[#dcf8c6] text-gray-800 rounded-tr-sm")}>
                            {renderContent(msg.content)}
                          </div>
                          {msg.deal && (
                            <DealCard deal={msg.deal}
                              onAccept={() => doSend("We accept the deal! Please confirm the booking details.")}
                              onCounter={() => doSend("We'd like to counter the offer. Can you improve the rate or add more inclusions?")} />
                          )}
                          <div className={"flex items-center gap-1 mt-1 text-[11px] text-gray-500 "+(msg.role==="user"?"flex-row-reverse":"")}>
                            <Clock className="h-2.5 w-2.5" /><span>{fmt(msg.timestamp)}</span>
                            {msg.role==="user"&&<CheckCheck className="h-2.5 w-2.5 text-blue-500"/>}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {aiThinking && (
                    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="flex justify-start">
                      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5 shadow-sm">
                        <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay:"0ms" }} />
                        <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay:"150ms" }} />
                        <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay:"300ms" }} />
                      </div>
                    </motion.div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="px-4 py-2.5 bg-white/80 backdrop-blur border-t border-black/10">
                  <div className="flex items-center gap-2 bg-gray-100 rounded-2xl px-4 py-2 border border-gray-200">
                    <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                    <input placeholder="Describe what you need (e.g. 'best rate for 2-night stay')…"
                      className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400"
                      value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                      onKeyDown={e => { if(e.key==="Enter") handleGenerate(); }} />
                    <button onClick={handleGenerate} disabled={generating||!aiPrompt.trim()}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0">
                      {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Generate
                    </button>
                  </div>
                </div>

                <div className="px-4 py-3 bg-[#f0f0f0] border-t border-black/10 shrink-0">
                  <div className="flex items-center gap-2">
                    <input ref={inputRef} placeholder="Type a message…" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} disabled={aiThinking}
                      className="flex-1 h-11 px-4 rounded-full bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30 transition-all disabled:opacity-50 shadow-sm" />
                    <button onClick={handleSend} disabled={!input.trim()||aiThinking}
                      className="h-11 w-11 rounded-full bg-[#25d366] hover:bg-[#1da851] text-white flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 shadow-md">
                      {aiThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ RIGHT PANEL ═══ */}
        {selected && !showChases && (
          <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col overflow-y-auto">
            <div className="px-5 py-4 border-b border-border">
              <p className="text-[11px] font-semibold text-muted-foreground mb-3">This Month</p>
              <div className="grid grid-cols-2 gap-2.5">
                {[{val:"24",label:"Messages Sent",color:"text-green-600",trend:"↑ Auto"},{val:"7",label:"Deals Closed",color:"text-green-600",trend:"↑ 3 new"},{val:"₹2.1L",label:"Savings",color:"text-green-600",trend:"↑ 18%"},{val:"3h",label:"Avg Response",color:"text-red-500",trend:"↓ 12%"}].map(s=>(
                  <div key={s.label} className="rounded-xl bg-muted/40 p-3 space-y-1 border border-border/50">
                    <p className="text-xl font-semibold text-card-foreground">{s.val}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">{s.label}</p>
                    <p className={`text-[11px] font-semibold ${s.color}`}>{s.trend}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-4 border-b border-border">
              <p className="text-[11px] font-semibold text-muted-foreground mb-3">Active Deals</p>
              <div className="space-y-2">
                {ACTIVE_DEALS.map(d => (
                  <div key={d.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/20 hover:bg-amber-50 hover:border-amber-200 transition-all cursor-pointer">
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-card-foreground truncate">{d.name}</p>
                      <p className="text-[11px] text-muted-foreground">{d.sub}</p>
                    </div>
                    <span className="text-xs font-semibold text-green-600 shrink-0">{d.saving}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-4 border-b border-border flex-1">
              <p className="text-[11px] font-semibold text-muted-foreground mb-3">Quick Templates</p>
              <div className="space-y-2">
                {QUICK_TEMPLATES.map(t => (
                  <button key={t.label} onClick={() => doSend(t.prompt)}
                    className="w-full text-left rounded-xl border border-border p-3 hover:bg-amber-50 hover:border-amber-300 transition-all group">
                    <div className="flex items-start gap-2.5">
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-card-foreground">{t.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</p>
                        <p className="text-[11px] text-amber-600 font-medium mt-1 group-hover:underline">→ Use template</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 py-4 border-b border-border shrink-0">
              <div className="rounded-2xl bg-[#1a2332] p-4 space-y-3">
                <div className="flex items-center gap-2"><p className="text-sm font-semibold text-white">Bulk Message</p></div>
                <p className="text-[11px] text-slate-400 leading-relaxed">Send automated messages to all suppliers of a category at once.</p>
                <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}
                  className="w-full h-9 rounded-xl bg-[#243044] border border-white/10 text-white text-xs px-3 focus:outline-none focus:border-amber-400"
                  style={{ backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat:"no-repeat", backgroundPosition:"right 10px center", appearance:"none" }}>
                  {SUPPLIER_TYPES.filter(t => t !== "All Types").map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => setShowBulk(true)}
                  className="w-full h-10 rounded-xl bg-[#25d366] hover:bg-[#1da851] text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-md">
                  <Send className="h-3.5 w-3.5" /> Send Broadcast
                </button>
              </div>
            </div>

            {/* Follow-up status for selected supplier */}
            {followUpLogs.filter(l => l.supplier_id === selected.id).length > 0 && (
              <div className="px-5 py-4 border-b border-border">
                <p className="text-[11px] font-semibold text-muted-foreground mb-2">Follow-up Status</p>
                <div className="space-y-1.5">
                  {followUpLogs.filter(l => l.supplier_id === selected.id).slice(0,3).map(l => {
                    const meta = FOLLOW_STATUS_META[l.followup_status];
                    return (
                      <div key={l.id} className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-muted/40 border border-border/50">
                        <span className="text-[11px] text-muted-foreground">{timeAgo(l.quote_requested_at)}</span>
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${meta.color}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}
                        </span>
                      </div>
                    );
                  })}
                  <button onClick={() => setFilterTab("Chases")}
                    className="w-full text-[11px] text-[#0D5C5A] font-semibold hover:underline text-center pt-1">
                    View all chases →
                  </button>
                </div>
              </div>
            )}

            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold text-muted-foreground mb-3">Supplier Info</p>
              <div className="space-y-2 text-xs text-muted-foreground">
                {selected.company   && <p className="flex items-center gap-2">{selected.company}</p>}
                {selected.phone     && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0" />{selected.phone}</p>}
                {selected.email     && <p className="flex items-center gap-2 break-all"><Mail className="h-3.5 w-3.5 shrink-0" />{selected.email}</p>}
                {selected.address   && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0" />{selected.address}</p>}
                {selected.supplier_type && (
                  <span className={"mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-full inline-block "+(TYPE_COLORS[selected.supplier_type]??"bg-gray-100 text-gray-600")}>
                    {selected.supplier_type}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showBulk && <BulkModal suppliers={suppliers} onClose={() => setShowBulk(false)} />}
      </AnimatePresence>
    </DashboardLayout>
  );
}

export default SupplierReachout;

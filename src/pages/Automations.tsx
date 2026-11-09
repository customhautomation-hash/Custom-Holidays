import { useState, useEffect } from "react";
import { API_ROOT } from "../lib/api";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Clock, Webhook, ChevronDown, ChevronUp,
  Loader2, Zap, BarChart2, Globe, Package, Home,
  TrendingUp, AlertCircle, Construction, RotateCcw,
  CheckCircle2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API_BASE = `${API_ROOT}`;

type TriggerType = "webhook" | "scheduled" | "not-built";
type RunStatus   = "idle" | "running" | "success" | "error";

interface Automation {
  id:          number;
  name:        string;
  trigger:     TriggerType;
  webhookPath?: string;
  remarks?:    string;
  status:      RunStatus;
  lastLog:     string[];
}

interface Category {
  name:        string;
  icon:        React.ReactNode;
  color:       string;
  bgColor:     string;
  automations: Automation[];
}

const initialCategories: Category[] = [
  {
    name: "Lead Analytics", icon: <BarChart2 className="h-4 w-4" />,
    color: "text-[#13585B] dark:text-[#5FB3AE]", bgColor: "bg-[rgba(19,88,91,.06)] border-[rgba(19,88,91,.12)]",
    automations: [
      { id: 1,  name: "Instant Lead Response",       trigger: "webhook",   webhookPath: "lead-response",         remarks: "Merged with lead scoring & VIP alert", status: "idle", lastLog: [] },
      { id: 2,  name: "Lead Scoring & Routing",      trigger: "webhook",   webhookPath: "lead-scoring",          remarks: "Merged with lead response & VIP alert", status: "idle", lastLog: [] },
      { id: 3,  name: "No-Reply Re-engagement",      trigger: "scheduled", webhookPath: "no-reply-reengagement", remarks: "Needs WhatsApp API", status: "idle", lastLog: [] },
      { id: 4,  name: "AI Itinerary Builder",        trigger: "not-built", remarks: "RAG — in progress", status: "idle", lastLog: [] },
      { id: 5,  name: "Campaign Performance Report", trigger: "not-built", remarks: "RAG — in progress", status: "idle", lastLog: [] },
      { id: 6,  name: "Post-Trip Review Request",    trigger: "not-built", status: "idle", lastLog: [] },
      { id: 7,  name: "Repeat Customer Anniversary", trigger: "scheduled", webhookPath: "repeat-anniversary",    status: "idle", lastLog: [] },
      { id: 8,  name: "Lead Pipeline Daily Digest",  trigger: "scheduled", webhookPath: "lead-digest",           remarks: "Merged with daily booking digest", status: "idle", lastLog: [] },
      { id: 9,  name: "Abandoned Enquiry Recovery",  trigger: "not-built", status: "idle", lastLog: [] },
      { id: 10, name: "High-Value Client VIP Alert", trigger: "webhook",   webhookPath: "vip-alert",             remarks: "Merged with lead response & scoring", status: "idle", lastLog: [] },
    ],
  },
  {
    name: "Web & Content", icon: <Globe className="h-4 w-4" />,
    color: "text-[#13585B] dark:text-[#5FB3AE]", bgColor: "bg-[rgba(19,88,91,.06)] border-[rgba(19,88,91,.12)]",
    automations: [
      { id: 11, name: "Weekly SEO & Traffic Digest",       trigger: "not-built", remarks: "After website launch", status: "idle", lastLog: [] },
      { id: 12, name: "Competitor Price Monitor",          trigger: "not-built", remarks: "After website launch", status: "idle", lastLog: [] },
      { id: 13, name: "Auto Blog & Social Generator",      trigger: "not-built", remarks: "After website launch", status: "idle", lastLog: [] },
      { id: 14, name: "Broken Link & Error Alert",         trigger: "not-built", remarks: "After website launch", status: "idle", lastLog: [] },
      { id: 15, name: "Google Ads Quality Score Alert",    trigger: "not-built", remarks: "After website launch", status: "idle", lastLog: [] },
      { id: 16, name: "Review Aggregation Dashboard",      trigger: "not-built", remarks: "After website launch", status: "idle", lastLog: [] },
      { id: 17, name: "Trending Destination Spotter",      trigger: "not-built", remarks: "After website launch", status: "idle", lastLog: [] },
      { id: 18, name: "Landing Page A/B Result Tracker",   trigger: "not-built", remarks: "After website launch", status: "idle", lastLog: [] },
      { id: 19, name: "Social Media Scheduling",           trigger: "not-built", remarks: "After website launch", status: "idle", lastLog: [] },
      { id: 20, name: "Monthly Content Performance",       trigger: "not-built", remarks: "After website launch", status: "idle", lastLog: [] },
    ],
  },
  {
    name: "Supplier", icon: <Package className="h-4 w-4" />,
    color: "text-[#13585B] dark:text-[#5FB3AE]", bgColor: "bg-[rgba(19,88,91,.06)] border-[rgba(19,88,91,.12)]",
    automations: [
      { id: 21, name: "Supplier Rate Change Monitor",  trigger: "not-built", remarks: "To create", status: "idle", lastLog: [] },
      { id: 22, name: "Supplier Follow-up",            trigger: "not-built", status: "idle", lastLog: [] },
      { id: 23, name: "Active Deals Expiry Alert",     trigger: "not-built", remarks: "Merged with seasonal deal broadcast", status: "idle", lastLog: [] },
      { id: 25, name: "Seasonal Deal Broadcast",       trigger: "not-built", remarks: "Merged with deals expiry alert", status: "idle", lastLog: [] },
      { id: 26, name: "Supplier Onboarding Checklist", trigger: "webhook",   webhookPath: "supplier-onboarding", status: "idle", lastLog: [] },
      { id: 28, name: "Best-Rate Supplier Suggester",  trigger: "not-built", remarks: "To create", status: "idle", lastLog: [] },
      { id: 29, name: "Supplier Payment Scheduler",    trigger: "not-built", remarks: "To create", status: "idle", lastLog: [] },
    ],
  },
  {
    name: "House", icon: <Home className="h-4 w-4" />,
    color: "text-[#13585B] dark:text-[#5FB3AE]", bgColor: "bg-[rgba(19,88,91,.06)] border-[rgba(19,88,91,.12)]",
    automations: [
      { id: 31, name: "Daily Booking & Revenue Digest",       trigger: "scheduled", webhookPath: "daily-digest",         remarks: "Merged with lead pipeline digest", status: "idle", lastLog: [] },
      { id: 32, name: "Agent Task Auto-Scheduler",            trigger: "not-built", status: "idle", lastLog: [] },
      { id: 33, name: "Finance KPI Auto-Updater",             trigger: "scheduled", webhookPath: "finance-kpi",          remarks: "Needs Tally integration", status: "idle", lastLog: [] },
      { id: 34, name: "Invoice & Payment Reminder",           trigger: "not-built", remarks: "Needs Tally integration", status: "idle", lastLog: [] },
      { id: 35, name: "New Staff Onboarding",                 trigger: "not-built", status: "idle", lastLog: [] },
      { id: 36, name: "Visa & Document Deadline Alert",       trigger: "not-built", remarks: "To create", status: "idle", lastLog: [] },
      { id: 37, name: "Booking Confirmation & Pre-Trip Pack", trigger: "webhook",   webhookPath: "booking-confirmation", status: "idle", lastLog: [] },
      { id: 38, name: "CSAT / NPS Score Tracker",             trigger: "not-built", remarks: "Merged with post-trip review", status: "idle", lastLog: [] },
      { id: 40, name: "Staff Leave & Capacity Planner",       trigger: "not-built", status: "idle", lastLog: [] },
      { id: 41, name: "Weekly Team Performance Report",       trigger: "scheduled", webhookPath: "team-report",          status: "idle", lastLog: [] },
      { id: 42, name: "Document Expiry Checker",              trigger: "not-built", remarks: "To create", status: "idle", lastLog: [] },
      { id: 43, name: "Client Birthday & Anniversary Mailer", trigger: "scheduled", webhookPath: "birthday-anniversary", remarks: "Merged with repeat anniversary", status: "idle", lastLog: [] },
      { id: 48, name: "Forex Rate Monitor",                   trigger: "scheduled", webhookPath: "forex-monitor",        status: "idle", lastLog: [] },
      { id: 49, name: "Reporting Dashboard Refresh",          trigger: "not-built", remarks: "To create", status: "idle", lastLog: [] },
    ],
  },
  {
    name: "Revenue", icon: <TrendingUp className="h-4 w-4" />,
    color: "text-[#13585B] dark:text-[#5FB3AE]", bgColor: "bg-[rgba(19,88,91,.06)] border-[rgba(19,88,91,.12)]",
    automations: [
      { id: 50, name: "Year-End Client Report Mailer", trigger: "not-built", remarks: "To create", status: "idle", lastLog: [] },
    ],
  },
];

// Staff only see automations that actually run, with plain-language notes
const LIVE_CATEGORIES: Category[] = initialCategories
  .map(c => ({ ...c, automations: c.automations.filter(a => a.trigger !== "not-built").map(a => ({ ...a,
    remarks: a.remarks === "Needs WhatsApp API" ? "Starts once WhatsApp is connected" : a.remarks === "Needs Tally integration" ? "Starts once the accounts are connected" : undefined })) }))
  .filter(c => c.automations.length > 0);

// ─── Trigger badge ────────────────────────────────────────────────────────────
const TriggerBadge = ({ t }: { t: TriggerType }) => {
  if (t === "webhook")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full " style={{ background: "rgba(19,88,91,.10)", color: "#13585B" }}>
        <Webhook className="h-2.5 w-2.5" /> On event
      </span>
    );
  if (t === "scheduled")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full " style={{ background: "rgba(184,145,62,.14)", color: "#8A6A24" }}>
        <Clock className="h-2.5 w-2.5" /> Scheduled
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-800/40 text-zinc-500">
      <Construction className="h-2.5 w-2.5" /> Not built
    </span>
  );
};

// ─── Automation row ───────────────────────────────────────────────────────────
const AutomationRow = ({
  automation,
  onTrigger,
  onReset,
}: {
  automation: Automation;
  onTrigger:  (id: number) => void;
  onReset:    (id: number) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const isBuilt = automation.trigger !== "not-built";
  const isDone  = automation.status === "success" || automation.status === "error";
  const hasLog  = automation.lastLog.length > 0;

  useEffect(() => { if (isDone) setExpanded(true); }, [isDone]);

  const rowBg =
    automation.status === "running" ? "border-blue-500/30 bg-blue-500/5" :
    automation.status === "success" ? "border-emerald-500/30 bg-emerald-500/5" :
    automation.status === "error"   ? "border-red-500/30 bg-red-500/5" :
    "border-border bg-card hover:bg-muted/30";

  return (
    <div className={`rounded-lg border transition-all duration-200 ${rowBg}`}>
      <div className="flex items-center gap-3 px-4 py-3">

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${isBuilt ? "text-foreground" : "text-muted-foreground"}`}>
              {automation.name}
            </span>
            {automation.status === "running" && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 shrink-0" />
            )}
          </div>

          {/* Inline status line */}
          {automation.status === "success" && automation.lastLog.length > 1 && (
            <p className="text-[11px] text-emerald-400 mt-0.5 truncate">
              {automation.lastLog[1].replace("✅", "").replace(/\[\d+:\d+:\d+ [AP]M\]/g, "").trim()}
            </p>
          )}
          {automation.status === "error" && automation.lastLog.length > 1 && (
            <p className="text-[11px] text-red-400 mt-0.5 truncate">
              {automation.lastLog[1].replace("❌", "").replace(/\[\d+:\d+:\d+ [AP]M\]/g, "").trim()}
            </p>
          )}
          {automation.status === "running" && automation.lastLog.length > 0 && (
            <p className="text-[11px] text-blue-400 mt-0.5">
              {automation.lastLog[automation.lastLog.length - 1].replace("⏳", "").trim()}
            </p>
          )}
          {automation.status === "idle" && automation.remarks && (
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <AlertCircle className="h-2.5 w-2.5 shrink-0" />
              {automation.remarks}
            </p>
          )}
        </div>

        {/* Trigger badge */}
        <TriggerBadge t={automation.trigger} />

        {/* Log toggle */}
        {hasLog && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}

        {/* Run / reset */}
        {isDone ? (
          <div className="flex items-center gap-2 shrink-0">
            {automation.status === "success"
              ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              : <XCircle className="h-4 w-4 text-red-400" />
            }
            <button
              onClick={() => onReset(automation.id)}
              title="Run again"
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            disabled={automation.status === "running"}
            onClick={() => onTrigger(automation.id)}
            className={`h-7 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all shrink-0 ${
              automation.status === "running"
                ? "border border-blue-500/40 text-blue-400 cursor-not-allowed"
                : !isBuilt
                ? "border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-400 cursor-pointer"
                : "border border-accent/40 text-accent hover:bg-accent/10 hover:border-accent cursor-pointer"
            }`}
          >
            {automation.status === "running"
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <><Play className="h-3 w-3" /> Run</>
            }
          </button>
        )}
      </div>

      {/* Log panel */}
      <AnimatePresence>
        {expanded && hasLog && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mx-4 mb-3 rounded-md bg-zinc-950 border border-zinc-800 p-3 font-mono text-[11px] space-y-0.5 max-h-44 overflow-y-auto">
              {automation.lastLog.map((line, i) => (
                <div key={i} className={
                  line.startsWith("✅") ? "text-emerald-400" :
                  line.startsWith("❌") ? "text-red-400" :
                  line.startsWith("⏳") ? "text-blue-400" :
                  line.startsWith("   ") ? "text-zinc-500" :
                  "text-zinc-400"
                }>{line}</div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const Automations = () => {
  const [categories, setCategories] = useState<Category[]>(LIVE_CATEGORIES);
  const [activeTab, setActiveTab]   = useState(0);

  const updateAutomation = (id: number, patch: Partial<Automation>) =>
    setCategories(prev =>
      prev.map(cat => ({
        ...cat,
        automations: cat.automations.map(a => a.id === id ? { ...a, ...patch } : a),
      }))
    );

  const resetAutomation = (id: number) =>
    updateAutomation(id, { status: "idle", lastLog: [] });

  const triggerAutomation = async (id: number) => {
    const automation = categories.flatMap(c => c.automations).find(a => a.id === id);
    if (!automation) return;

    // Not built — show a clear message instead of silently doing nothing
    if (automation.trigger === "not-built" || !automation.webhookPath) {
      const ts = new Date().toLocaleTimeString();
      updateAutomation(id, {
        status: "error",
        lastLog: [
          `❌ [${ts}] ${automation.name} hasn't been built yet.`,
          ...(automation.remarks ? [`   Note: ${automation.remarks}`] : []),
          `   This automation is on the roadmap — no webhook is configured yet.`,
        ],
      });
      return;
    }

    const ts = new Date().toLocaleTimeString();
    updateAutomation(id, {
      status: "running",
      lastLog: [`⏳ [${ts}] Triggering ${automation.name}...`, `⏳ Waiting for workflow to complete...`],
    });

    // Step 1 — trigger
    try {
      const res = await fetch(`${API_BASE}/trigger-automation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook_path: automation.webhookPath,
          triggered_by: "automations_page",
          triggered_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to trigger");
      }
    } catch (err: any) {
      const doneTs = new Date().toLocaleTimeString();
      updateAutomation(id, {
        status: "error",
        lastLog: [
          `⏳ [${ts}] Triggering ${automation.name}...`,
          `❌ [${doneTs}] ${err.message}`,
          `   Make sure FastAPI is running on localhost:8000`,
        ],
      });
      return;
    }

    // Step 2 — poll
    const webhookPath = automation.webhookPath;
    let attempts = 0;
    const maxAttempts = 90;

    const poll = async () => {
      attempts++;
      try {
        const res  = await fetch(`${API_BASE}/automation-result/${encodeURIComponent(webhookPath)}`);
        const data = await res.json();

        if (data.ready) {
          const doneTs = new Date().toLocaleTimeString();
          updateAutomation(id, {
            status: data.success ? "success" : "error",
            lastLog: [
              `⏳ [${ts}] Triggered ${automation.name}`,
              `${data.success ? "✅" : "❌"} [${doneTs}] ${data.summary}`,
              ...(data.details ? [`   ${data.details}`] : []),
              `   Completed at ${data.completed_at}`,
            ],
          });
          return;
        }

        if (attempts >= maxAttempts) {
          const doneTs = new Date().toLocaleTimeString();
          updateAutomation(id, {
            status: "error",
            lastLog: [
              `⏳ [${ts}] Triggered ${automation.name}`,
              `❌ [${doneTs}] Timed out after 3 minutes`,
              `   The workflow may still be running in n8n`,
            ],
          });
          return;
        }

        updateAutomation(id, {
          status: "running",
          lastLog: [
            `⏳ [${ts}] Triggered ${automation.name}`,
            `⏳ Waiting... (${attempts * 2}s elapsed)`,
          ],
        });
        setTimeout(poll, 2000);
      } catch {
        setTimeout(poll, 2000);
      }
    };

    setTimeout(poll, 2000);
  };

  const allAutomations = categories.flatMap(c => c.automations);
  const totalBuilt   = allAutomations.filter(a => a.trigger !== "not-built").length;
  const totalRunning = allAutomations.filter(a => a.status === "running").length;
  const totalSuccess = allAutomations.filter(a => a.status === "success").length;
  const totalError   = allAutomations.filter(a => a.status === "error").length;

  const activeCategory = categories[activeTab];

  // Count live statuses per tab for indicators
  const tabStats = (cat: Category) => ({
    built:   cat.automations.filter(a => a.trigger !== "not-built").length,
    total:   cat.automations.length,
    running: cat.automations.filter(a => a.status === "running").length,
    success: cat.automations.filter(a => a.status === "success").length,
    error:   cat.automations.filter(a => a.status === "error").length,
  });

  return (
    <DashboardLayout>
      <div className="max-w-[1480px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif" style={{ fontSize: 30, margin: 0 }}>Automations</h1>
            <p className="text-muted-foreground" style={{ fontSize: 13, marginTop: 4 }}>
              Jobs that run on their own. Anything that goes to a client waits for approval first.
            </p>
          </div>


        </div>

        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto pb-px scrollbar-none border-b border-border">
          {categories.map((cat, i) => {
            const s = tabStats(cat);
            const isActive = activeTab === i;
            return (
              <button
                key={cat.name}
                onClick={() => setActiveTab(i)}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0
                  ${isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                <span className={isActive ? cat.color : "text-muted-foreground"}>
                  {cat.icon}
                </span>
                {cat.name}

                {/* Built count pill */}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium transition-colors ${
                  isActive
                    ? "bg-muted text-muted-foreground"
                    : "bg-muted/50 text-muted-foreground/60"
                }`}>
                  {s.total}
                </span>

                {/* Live status dots */}
                {s.running > 0 && (
                  <span className="absolute top-2 right-1 h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                )}
                {s.error > 0 && s.running === 0 && (
                  <span className="absolute top-2 right-1 h-1.5 w-1.5 rounded-full bg-red-400" />
                )}

                {/* Active underline */}
                {isActive && (
                  <motion.div
                    layoutId="tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 text-[11px] text-muted-foreground flex-wrap">
          <div className="flex items-center gap-1.5">
            <Webhook className="h-3 w-3" /> Runs when something happens, or press Run
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> Runs on a schedule, or press Run
          </div>
        </div>

        {/* Active tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            {/* Category header */}
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border ${activeCategory.bgColor}`}>
              <span className={activeCategory.color}>{activeCategory.icon}</span>
              <span className={`text-sm font-semibold ${activeCategory.color}`}>
                {activeCategory.name}
              </span>
              <span className="text-xs text-muted-foreground ml-1">
                · {tabStats(activeCategory).total} running
              </span>
            </div>

            {/* Automation rows */}
            {activeCategory.automations.map(a => (
              <AutomationRow
                key={a.id}
                automation={a}
                onTrigger={triggerAutomation}
                onReset={resetAutomation}
              />
            ))}
          </motion.div>
        </AnimatePresence>

      </div>
    </DashboardLayout>
  );
};

export default Automations;

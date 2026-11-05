import { useEffect, useState } from "react";
import {
  Users, TrendingUp, IndianRupee, Globe, Mail,
  ArrowUpRight, ArrowDownRight, Activity, ShoppingBag,
  Zap, Clock, CheckCircle, AlertCircle, Loader2,
} from "lucide-react";
import { DashboardLayout } from "../components/dashboard/DashboardLayout";
import { supabase } from "../lib/supabase";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line,
} from "recharts";
import { motion } from "framer-motion";

const API = "https://fintech-dashboard-61vh.onrender.com/api";

// ─── Neumorphic style tokens ───────────────────────────────
const neu = {
  background: "var(--neu-base)",
  boxShadow: "var(--neu-shadow)",
  borderRadius: "1rem",
  border: "none",
};
const neuSm = {
  background: "var(--neu-base)",
  boxShadow: "var(--neu-shadow-sm)",
  borderRadius: "0.75rem",
  border: "none",
};
const neuInset = {
  background: "var(--neu-base)",
  boxShadow: "var(--neu-inset)",
  borderRadius: "1rem",
  border: "none",
};
const neuBadgePos = {
  background: "var(--neu-base)",
  boxShadow: "var(--neu-inset-sm)",
  borderRadius: "0.5rem",
  color: "#52A882",
};
const neuBadgeNeg = { ...neuBadgePos, color: "#E05A5A" };

// ─── Types ─────────────────────────────────────────────────
interface FinanceKPI {
  month_start: string;
  month_end: string;
  revenue: { realized: number; pending: number; pipeline_total: number };
  expenses: { supplier_cost: number; overhead: number; refunds: number; total: number };
  profit: { gross_profit: number; profit_margin: number };
  bookings: { total: number; confirmed: number; conversion_rate: number };
  targets: {
    target_revenue: number; target_bookings: number; target_profit_margin: number;
    revenue_variance: number; revenue_variance_pct: number;
    bookings_variance: number; margin_variance: number;
  };
  generated_at: string;
}

interface FinanceEntry {
  id: string;
  trip_name: string;
  client_name: string;
  revenue: number;
  expense: number;
  profit: number;
  booking_date: string;
}

interface Supplier { id: string; name: string; supplier_type: string; onboarding_status: string; }
interface Lead { id: string; status: string; created_at: string; }

// ─── Helpers ───────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const fmtCompact = (n: number) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return fmt(n);
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Stat Card ─────────────────────────────────────────────
function StatCard({
  title, value, change, positive, loading,
}: {
  title: string; value: string; change: string; positive: boolean;
  icon?: React.ElementType; iconColor?: string; loading?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-5" style={neu}
    >
      <p className="text-[13px]" style={{ color: "var(--muted-foreground, #5B6766)" }}>{title}</p>
      {loading ? (
        <div className="h-8 w-24 mt-3 rounded-lg animate-pulse" style={{ background: "var(--neu-dark, #E8DADB)" }} />
      ) : (
        <p className="text-[28px] leading-none mt-3 font-medium tabular-nums" style={{ color: "var(--foreground, #1A2324)" }}>{value}</p>
      )}
      <p className="text-xs mt-3 tabular-nums" style={{ color: positive ? "var(--muted-foreground, #5B6766)" : "#B4473A" }}>{change}</p>
    </motion.div>
  );
}

// ─── Revenue Bar Chart ──────────────────────────────────────
function RevenueBar({ entries }: { entries: FinanceEntry[] }) {
  const data = entries.slice(0, 8).map(e => ({
    name: (e.trip_name || "Trip").split(" ").slice(0, 2).join(" "),
    revenue: e.revenue,
    profit: e.profit,
  })).reverse();

  if (!data.length) return (
    <div className="h-48 flex items-center justify-center text-sm" style={{ color: "var(--muted-foreground, #5B6766)" }}>
      No booking data yet
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barSize={20} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--neu-dark, #E8DADB)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground, #5B6766)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground, #5B6766)" }} axisLine={false} tickLine={false}
          tickFormatter={v => fmtCompact(v)} />
        <Tooltip
          contentStyle={{ background: "#0B3B3D", border: "none", borderRadius: 8, color: "#F3EAEA", fontSize: 12 }}
          formatter={(v: number, name: string) => [fmt(v), name === "revenue" ? "Revenue" : "Profit"]}
        />
        <Bar dataKey="revenue" fill="#13585B" radius={[6, 6, 0, 0]} />
        <Bar dataKey="profit" fill="#D4AF5A" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Lead Pipeline ──────────────────────────────────────────
function PipelineBar({ leads }: { leads: Lead[] }) {
  const statusOrder = ["new", "contacted", "qualified", "proposal", "booked", "closed"];
  const colors = ["#13585B", "#A84A5B", "#4C8C93", "#6EA2A7", "#93BABD", "#B9D2D3"];

  const counts = statusOrder.map(s => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    count: leads.filter(l => (l.status || "new").toLowerCase() === s).length,
  }));
  const max = Math.max(...counts.map(c => c.count), 1);

  if (!leads.length) return (
    <div className="h-32 flex items-center justify-center text-sm" style={{ color: "var(--muted-foreground, #5B6766)" }}>
      No leads data yet
    </div>
  );

  return (
    <div className="space-y-3">
      {counts.filter(c => c.count > 0).map((stage, i) => (
        <div key={stage.name} className="flex items-center gap-3">
          <span className="text-xs w-20 shrink-0" style={{ color: "var(--muted-foreground, #5B6766)" }}>{stage.name}</span>
          <div className="flex-1 rounded-full h-2.5 overflow-hidden" style={neuInset}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(stage.count / max) * 100}%` }}
              transition={{ duration: 0.8, delay: i * 0.1 }}
              className="h-full rounded-full"
              style={{ background: colors[i % colors.length] }}
            />
          </div>
          <span className="text-sm font-semibold w-8 text-right" style={{ color: "var(--foreground, #1A2324)" }}>{stage.count}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Activity Feed ──────────────────────────────────────────
function ActivityFeed({ entries, suppliers }: { entries: FinanceEntry[]; suppliers: Supplier[] }) {
  const items = [
    ...entries.slice(0, 3).map(e => ({
      icon: ShoppingBag,
      color: "var(--muted-foreground, #5B6766)",
      text: `Booking: ${e.trip_name || "New booking"} — ${fmt(e.revenue)}`,
      time: timeAgo(e.booking_date),
    })),
    ...suppliers.slice(0, 2).map(s => ({
      icon: CheckCircle,
      color: "var(--muted-foreground, #5B6766)",
      text: `Supplier onboarded: ${s.name} (${s.supplier_type || "General"})`,
      time: "recently",
    })),
  ].slice(0, 5);

  if (!items.length) return (
    <p className="text-sm text-center py-4" style={{ color: "var(--muted-foreground, #5B6766)" }}>No recent activity</p>
  );

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={neuSm}>
            <item.icon style={{ width: 16, height: 16, color: item.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-snug" style={{ color: "var(--foreground, #1A2324)" }}>{item.text}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground, #5B6766)" }}>{item.time}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────
const Index = () => {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const [kpi, setKpi] = useState<FinanceKPI | null>(null);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        // Finance KPIs from backend
        const [kpiRes, entriesRes] = await Promise.all([
          fetch(`${API}/finance-kpis/latest`),
          fetch(`${API}/finance-entries`),
        ]);

        if (kpiRes.ok) {
          const kpiData = await kpiRes.json();
          if (kpiData && kpiData.revenue) setKpi(kpiData);
        }
        if (entriesRes.ok) {
          const entriesData = await entriesRes.json();
          if (Array.isArray(entriesData)) setEntries(entriesData);
        }

        // Suppliers from backend
        const suppRes = await fetch(`${API}/suppliers`);
        if (suppRes.ok) {
          const suppData = await suppRes.json();
          if (suppData.suppliers) setSuppliers(suppData.suppliers);
        }

        // Presence (online users)
        const presRes = await fetch(`${API}/presence`);
        if (presRes.ok) {
          const presData = await presRes.json();
          setOnlineCount((presData.users || []).length);
        }

        // Leads from Supabase
        const { data: leadsData } = await supabase
          .from("leads")
          .select("id, status, created_at")
          .order("created_at", { ascending: false })
          .limit(100);
        if (leadsData) setLeads(leadsData);

      } catch (e) {
        setError("Could not load some data");
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  // ── Derived KPIs ────────────────────────────────────────
  const totalLeads = leads.length;
  const newLeadsThisWeek = leads.filter(l => {
    const d = new Date(l.created_at);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return d > weekAgo;
  }).length;

  const conversionRate = kpi?.bookings.conversion_rate
    ? pct(kpi.bookings.conversion_rate)
    : leads.length
      ? `${((leads.filter(l => l.status === "booked").length / leads.length) * 100).toFixed(1)}%`
      : "—";

  const revenueValue = kpi ? fmtCompact(kpi.revenue.realized) : "—";
  const revenueChange = kpi
    ? `${kpi.targets.revenue_variance_pct > 0 ? "+" : ""}${(kpi.targets.revenue_variance_pct * 100).toFixed(0)}% vs target`
    : "—";
  const revenuePositive = kpi ? kpi.targets.revenue_variance_pct >= 0 : true;

  const suppliersActive = suppliers.filter(s => s.onboarding_status === "completed").length;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[28px] font-serif font-medium leading-tight" style={{ color: "var(--foreground, #1A2324)" }}>Overview</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground, #5B6766)" }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
              {" · "}{loading ? "Loading" : "Live data"}
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "#B4473A" }}>
              <AlertCircle style={{ width: 14, height: 14 }} />
              Some data could not load
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            title="Total Leads"
            value={loading ? "—" : String(totalLeads)}
            change={`${newLeadsThisWeek} new this week`}
            positive
            icon={Users}
            iconColor="#13585B"
            loading={loading}
          />
          <StatCard
            title="Revenue (MTD)"
            value={loading ? "—" : revenueValue}
            change={loading ? "—" : revenueChange}
            positive={revenuePositive}
            icon={IndianRupee}
            iconColor="#52A882"
            loading={loading}
          />
          <StatCard
            title="Conversion Rate"
            value={loading ? "—" : conversionRate}
            change={kpi ? `${kpi.bookings.confirmed} of ${kpi.bookings.total} booked` : `${leads.filter(l => l.status === "booked").length} booked`}
            positive
            icon={TrendingUp}
            iconColor="#3F7F80"
            loading={loading}
          />
          <StatCard
            title="Active Suppliers"
            value={loading ? "—" : String(suppliersActive || suppliers.length)}
            change={`${suppliers.length} total`}
            positive
            icon={ShoppingBag}
            iconColor="#E07A5A"
            loading={loading}
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left: Charts */}
          <div className="lg:col-span-2 space-y-5">

            {/* Revenue Chart */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
              className="p-5" style={neu}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium" style={{ color: "var(--foreground, #1A2324)" }}>Revenue by Booking</h3>
                <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted-foreground, #5B6766)" }}>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full inline-block" style={{ background: "#13585B" }} /> Revenue
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full inline-block" style={{ background: "#D4AF5A" }} /> Profit
                  </span>
                </div>
              </div>
              {loading ? (
                <div className="h-48 rounded-xl animate-pulse" style={{ background: "var(--neu-dark, #E8DADB)" }} />
              ) : (
                <RevenueBar entries={entries} />
              )}
            </motion.div>

            {/* Lead Pipeline */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
              className="p-5" style={neu}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium" style={{ color: "var(--foreground, #1A2324)" }}>Lead Pipeline</h3>
                <span className="text-xs" style={{ color: "var(--muted-foreground, #5B6766)" }}>{totalLeads} total leads</span>
              </div>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-4 rounded-full animate-pulse" style={{ background: "var(--neu-dark, #E8DADB)" }} />
                  ))}
                </div>
              ) : (
                <PipelineBar leads={leads} />
              )}
            </motion.div>

            {/* Finance Summary */}
            {kpi && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                className="p-5" style={neu}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--foreground, #1A2324)" }}>
                  Finance Summary — {kpi.month_start && new Date(kpi.month_start).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Gross Profit", value: fmtCompact(kpi.profit.gross_profit), color: "var(--foreground, #1A2324)" },
                    { label: "Margin", value: pct(kpi.profit.profit_margin), color: "var(--foreground, #1A2324)" },
                    { label: "Expenses", value: fmtCompact(kpi.expenses.total), color: "var(--foreground, #1A2324)" },
                    { label: "Pipeline", value: fmtCompact(kpi.revenue.pipeline_total), color: "var(--foreground, #1A2324)" },
                  ].map(item => (
                    <div key={item.label} className="p-3 text-center" style={neuInset}>
                      <p className="text-lg font-medium tabular-nums" style={{ color: item.color }}>{item.value}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground, #5B6766)" }}>{item.label}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Right: Quick Stats + Activity */}
          <div className="space-y-5">

            {/* Quick Stats */}
            {[
              {
                label: "Team Online",
                value: String(onlineCount),
                sub: "members active now",
                icon: Activity,
                color: "var(--muted-foreground, #5B6766)",
              },
              {
                label: "Pending Revenue",
                value: kpi ? fmtCompact(kpi.revenue.pending) : "—",
                sub: "awaiting collection",
                icon: Clock,
                color: "var(--muted-foreground, #5B6766)",
              },
              {
                label: "Confirmed Bookings",
                value: kpi ? String(kpi.bookings.confirmed) : String(leads.filter(l => l.status === "booked").length),
                sub: "this month",
                icon: CheckCircle,
                color: "var(--muted-foreground, #5B6766)",
              },
            ].map(({ label, value, sub, icon: Icon, color }) => (
              <motion.div
                key={label}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="p-4 flex items-center gap-4"
                style={neu}
              >
                <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ ...neuInset, color }}>
                  <Icon style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  {loading ? (
                    <div className="h-6 w-16 rounded animate-pulse mb-1" style={{ background: "var(--neu-dark, #E8DADB)" }} />
                  ) : (
                    <p className="text-xl font-medium tabular-nums" style={{ color: "var(--foreground, #1A2324)" }}>{value}</p>
                  )}
                  <p className="text-xs font-medium" style={{ color: "var(--foreground, #1A2324)" }}>{label}</p>
                  <p className="text-[11px]" style={{ color: "var(--muted-foreground, #5B6766)" }}>{sub}</p>
                </div>
              </motion.div>
            ))}

            {/* Target Progress */}
            {kpi && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                className="p-5" style={neu}>
                <h3 className="text-sm font-medium mb-4" style={{ color: "var(--foreground, #1A2324)" }}>Monthly Targets</h3>
                <div className="space-y-4">
                  {[
                    {
                      label: "Revenue",
                      current: kpi.revenue.realized,
                      target: kpi.targets.target_revenue,
                      fmt: fmtCompact,
                    },
                    {
                      label: "Bookings",
                      current: kpi.bookings.confirmed,
                      target: kpi.targets.target_bookings,
                      fmt: (v: number) => String(v),
                    },
                  ].map(({ label, current, target, fmt: fmtFn }) => {
                    const progress = Math.min((current / target) * 100, 100);
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span style={{ color: "var(--foreground, #1A2324)" }}>{label}</span>
                          <span style={{ color: "var(--muted-foreground, #5B6766)" }}>{fmtFn(current)} / {fmtFn(target)}</span>
                        </div>
                        <div className="h-2.5 rounded-full overflow-hidden" style={neuInset}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.9 }}
                            className="h-full rounded-full"
                            style={{ background: "#13585B" }}
                          />
                        </div>
                        <p className="text-[11px] mt-1 text-right" style={{ color: "var(--muted-foreground, #5B6766)" }}>
                          {progress.toFixed(0)}% achieved
                        </p>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Recent Activity */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="p-5" style={neu}>
              <h3 className="text-sm font-medium mb-4" style={{ color: "var(--foreground, #1A2324)" }}>Recent Activity</h3>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex gap-3">
                      <div className="h-8 w-8 rounded-lg shrink-0 animate-pulse" style={{ background: "var(--neu-dark, #E8DADB)" }} />
                      <div className="flex-1 space-y-1">
                        <div className="h-3 w-full rounded animate-pulse" style={{ background: "var(--neu-dark, #E8DADB)" }} />
                        <div className="h-3 w-1/2 rounded animate-pulse" style={{ background: "var(--neu-dark, #E8DADB)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ActivityFeed entries={entries} suppliers={suppliers} />
              )}
            </motion.div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
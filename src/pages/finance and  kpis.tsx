import { DashboardLayout } from "../components/dashboard/DashboardLayout";
import { API_ROOT } from "../lib/api";
import { motion } from "framer-motion";
import {
  IndianRupee, TrendingUp, TrendingDown, Target, PieChart,
  DollarSign, Calendar, CheckCircle, Clock, Briefcase, Database,
 
} from "lucide-react";
import { useEffect, useState } from "react";

const API = `${API_ROOT}`;

interface FinanceData {
  month_start: string; month_end: string;
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
  id: string; trip_name: string; client_name: string;
  revenue: number; expense: number; profit: number; booking_date: string;
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

const currency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n ?? 0);

const percent = (n: number) => `${((n ?? 0) * 100).toFixed(1)}%`;

const progress = (value: number, target: number) => {
  if (!target) return 0;
  return Math.min((value / target) * 100, 100);
};

// ── Skeleton placeholder card ─────────────────────────────────────────────────
function SkeletonCard({ label, icon: Icon, color }: { label: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-2xl bg-card border shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="h-8 w-28 bg-muted rounded-lg mt-3 animate-pulse" />
        </div>
        <div className={`h-12 w-12 rounded-xl bg-muted flex items-center justify-center`}>
          <Icon className={`h-6 w-6 ${color} opacity-30`} />
        </div>
      </div>
    </div>
  );
}

// ── Empty / not-connected banner ──────────────────────────────────────────────
function NotConnectedBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl bg-card p-8 flex flex-col items-center text-center gap-2" style={{ boxShadow: "var(--neu-shadow, none)" }}>
      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-1">
        <Database className="h-6 w-6 text-muted-foreground opacity-60" />
      </div>
      <p className="font-semibold text-foreground">No finance figures yet</p>
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
        Revenue, costs, profit and targets appear here once the month's numbers are sent from the accounts.
        If they were sent already, the server may still be starting.
      </p>
      <button onClick={onRetry} className="mt-3 text-sm font-semibold px-4 h-9 rounded-xl text-white" style={{ background: "#13585B", border: "none", cursor: "pointer" }}>Check again</button>
    </div>
  );
}

export default function FinanceKPIs() {
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [kpiRes, entryRes] = await Promise.all([
        fetch(`${API}/finance-kpis/latest`),
        fetch(`${API}/finance-entries`),
      ]);
      const kpi = kpiRes.ok ? await kpiRes.json().catch(() => null) : null;
      const transactions = entryRes.ok ? await entryRes.json().catch(() => []) : [];

      if (kpi && kpi.revenue) {
        setFinance(kpi);
        setHasData(true);
      }
      setEntries(Array.isArray(transactions) ? transactions : []);
    } catch (err) {
      console.error("Finance load failed:", err);
    } finally {
      setLoading(false);
    }
  }

  // ── KPI card configs ───────────────────────────────────────────────────────
  const kpiCards = [
    { label: "Revenue",       value: finance ? currency(finance.revenue.realized)   : null, icon: IndianRupee, bg: "bg-transparent",  color: "text-muted-foreground"  },
    { label: "Expenses",      value: finance ? currency(finance.expenses.total)      : null, icon: TrendingDown, bg: "bg-transparent",  color: "text-muted-foreground"    },
    { label: "Gross Profit",  value: finance ? currency(finance.profit.gross_profit) : null, icon: TrendingUp,  bg: "bg-transparent", color: "text-muted-foreground"   },
    { label: "Profit Margin", value: finance ? percent(finance.profit.profit_margin) : null, icon: PieChart,    bg: "bg-transparent", color: "text-muted-foreground" },
  ];

  const row2Cards = [
    { label: "Bookings",   value: finance ? String(finance.bookings.total)                     : null, icon: Briefcase,   color: "text-muted-foreground"    },
    { label: "Confirmed",  value: finance ? String(finance.bookings.confirmed)                  : null, icon: CheckCircle, color: "text-muted-foreground"  },
    { label: "Conversion", value: finance ? percent(finance.bookings.conversion_rate)           : null, icon: Target,      color: "text-muted-foreground"   },
    { label: "Updated",    value: finance ? new Date(finance.generated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null, icon: Calendar,    color: "text-muted-foreground"     },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">

        <motion.div {...fade(0)}>
          <h1 className="text-3xl font-serif">Finance Dashboard</h1>
          <p className="text-muted-foreground mt-2">Revenue, expenses, margins and business performance</p>
        </motion.div>

        {/* Not connected banner */}
        {!loading && !hasData && (
          <motion.div {...fade(0.05)}>
            <NotConnectedBanner onRetry={loadDashboard} />
          </motion.div>
        )}

        {(loading || hasData) && (<>

        {/* KPI CARDS — show skeletons when loading or no data */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map(({ label, value, icon: Icon, bg, color }, i) =>
            loading || !value ? (
              <motion.div key={label} {...fade(0.1 + i * 0.05)}>
                <SkeletonCard label={label} icon={Icon} color={color} />
              </motion.div>
            ) : (
              <motion.div key={label} {...fade(0.1 + i * 0.05)} className="rounded-2xl bg-card border shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <h2 className="text-3xl font-semibold mt-3">{value}</h2>
                  </div>
                  <div className={`h-12 w-12 rounded-xl ${bg} flex items-center justify-center`}>
                    <Icon className={`h-6 w-6 ${color}`} />
                  </div>
                </div>
              </motion.div>
            )
          )}
        </div>

        {/* SECOND ROW */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {row2Cards.map(({ label, value, icon: Icon, color }, i) =>
            loading || !value ? (
              <motion.div key={label} {...fade(0.3 + i * 0.05)} className="rounded-2xl bg-card border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <div className="h-7 w-20 bg-muted rounded-lg mt-3 animate-pulse" />
                  </div>
                  <Icon className={`h-7 w-7 ${color} opacity-30`} />
                </div>
              </motion.div>
            ) : (
              <motion.div key={label} {...fade(0.3 + i * 0.05)} className="rounded-2xl bg-card border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <h2 className="text-2xl font-semibold mt-3">{value}</h2>
                  </div>
                  <Icon className={`h-7 w-7 ${color}`} />
                </div>
              </motion.div>
            )
          )}
        </div>

        {/* PROGRESS SECTION */}
        <div className="grid lg:grid-cols-3 gap-6">
          {[
            { title: "Revenue Target",       current: finance?.revenue.realized ?? 0,      target: finance?.targets.target_revenue ?? 0,       color: "bg-primary"  },
            { title: "Booking Target",       current: finance?.bookings.total ?? 0,         target: finance?.targets.target_bookings ?? 0,      color: "bg-primary"   },
            { title: "Profit Margin Target", current: finance?.profit.profit_margin ?? 0,   target: finance?.targets.target_profit_margin ?? 0, color: "bg-primary" },
          ].map(({ title, current, target, color }, i) => (
            <motion.div key={title} {...fade(0.5 + i * 0.05)} className="rounded-2xl border bg-card p-6">
              <h3 className="font-semibold text-lg mb-6">{title}</h3>
              {loading || !hasData ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                  </div>
                  <div className="w-full bg-muted rounded-full h-3" />
                  <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                </div>
              ) : (
                <>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-muted-foreground">{i === 1 ? current : i === 2 ? percent(current) : currency(current)}</span>
                    <span className="text-sm font-medium">{i === 1 ? target : i === 2 ? percent(target) : currency(target)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                    <div className={`${color} h-3 rounded-full transition-all duration-700`} style={{ width: `${progress(current, target)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">{progress(current, target).toFixed(1)}% Complete</p>
                </>
              )}
            </motion.div>
          ))}
        </div>

        {/* BREAKDOWN */}
        <div className="grid lg:grid-cols-2 gap-6">
          <motion.div {...fade(0.65)} className="rounded-2xl border bg-card p-6">
            <h3 className="text-lg font-semibold mb-6">Revenue Breakdown</h3>
            {loading || !hasData || !finance ? (
              <div className="space-y-5">
                {[0,1,2].map(i => <div key={i} className="flex items-center justify-between"><div className="space-y-2"><div className="h-3 w-28 bg-muted rounded animate-pulse"/><div className="h-6 w-36 bg-muted rounded animate-pulse"/></div><div className="h-8 w-8 bg-muted rounded animate-pulse"/></div>)}
              </div>
            ) : (
              <div className="space-y-5">
                {[
                  { label: "Realized Revenue", value: finance.revenue.realized,      icon: IndianRupee, color: "text-muted-foreground"  },
                  { label: "Pending Revenue",  value: finance.revenue.pending,        icon: Clock,       color: "text-muted-foreground" },
                  { label: "Pipeline Value",   value: finance.revenue.pipeline_total, icon: TrendingUp,  color: "text-muted-foreground"   },
                ].map(({ label, value, icon: Icon, color }, i, arr) => (
                  <div key={label}>
                    <div className="flex items-center justify-between">
                      <div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold mt-1">{currency(value)}</p></div>
                      <Icon className={`h-8 w-8 ${color}`} />
                    </div>
                    {i < arr.length - 1 && <hr className="mt-4" />}
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div {...fade(0.7)} className="rounded-2xl border bg-card p-6">
            <h3 className="text-lg font-semibold mb-6">Expense Breakdown</h3>
            {loading || !hasData || !finance ? (
              <div className="space-y-5">
                {[0,1,2,3].map(i => <div key={i} className="flex items-center justify-between"><div className="space-y-2"><div className="h-3 w-28 bg-muted rounded animate-pulse"/><div className="h-6 w-36 bg-muted rounded animate-pulse"/></div><div className="h-8 w-8 bg-muted rounded animate-pulse"/></div>)}
              </div>
            ) : (
              <div className="space-y-5">
                {[
                  { label: "Supplier Cost",    value: finance.expenses.supplier_cost, icon: IndianRupee,  color: "text-muted-foreground"    },
                  { label: "Operational Cost", value: finance.expenses.overhead,       icon: Briefcase,   color: "text-muted-foreground" },
                  { label: "Refunds",          value: finance.expenses.refunds,        icon: TrendingDown, color: "text-muted-foreground"  },
                  { label: "Total Expenses",   value: finance.expenses.total,          icon: PieChart,    color: "text-muted-foreground"    },
                ].map(({ label, value, icon: Icon, color }, i, arr) => (
                  <div key={label}>
                    <div className="flex items-center justify-between">
                      <div><p className="text-sm text-muted-foreground">{label}</p><p className={`text-2xl font-semibold mt-1 `}>{currency(value)}</p></div>
                      <Icon className={`h-8 w-8 ${color}`} />
                    </div>
                    {i < arr.length - 1 && <hr className="mt-4" />}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* SUMMARY */}
        <motion.div {...fade(0.75)} className="rounded-2xl border bg-card p-6">
          <h3 className="text-lg font-semibold mb-6">Monthly Financial Summary</h3>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { label: "Revenue Variance",  value: finance ? currency(finance.targets.revenue_variance) : null, sub: finance ? `${finance.targets.revenue_variance_pct.toFixed(1)}%` : "—" },
              { label: "Booking Variance",  value: finance ? String(finance.targets.bookings_variance)  : null, sub: "vs target" },
              { label: "Margin Variance",   value: finance ? percent(finance.targets.margin_variance)   : null, sub: "vs target" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl bg-muted p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                {loading || !value
                  ? <div className="h-7 w-24 bg-muted-foreground/20 rounded-lg mt-3 animate-pulse" />
                  : <h2 className="text-2xl font-semibold mt-3">{value}</h2>}
                <p className="text-xs mt-2 text-muted-foreground">{sub}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* TRANSACTIONS */}
        <motion.div {...fade(0.8)} className="rounded-2xl border bg-card overflow-hidden">
          <div className="px-6 py-5 border-b">
            <h3 className="text-lg font-semibold">Recent Financial Transactions</h3>
            <p className="text-sm text-muted-foreground mt-1">Latest bookings and financial performance</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/40">
                <tr>
                  {["Trip","Client","Revenue","Expense","Profit","Date"].map(h => (
                    <th key={h} className={`px-6 py-4 text-sm font-semibold ${["Revenue","Expense","Profit"].includes(h) ? "text-right" : h === "Date" ? "text-center" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [0,1,2,3].map(i => (
                    <tr key={i} className="border-t">
                      {[0,1,2,3,4,5].map(j => (
                        <td key={j} className="px-6 py-4"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : entries.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No transactions yet. Connect your data source to populate this table.</td></tr>
                ) : (
                  entries.map(e => (
                    <tr key={e.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-5 font-medium">{e.trip_name}</td>
                      <td className="px-6 py-5">{e.client_name}</td>
                      <td className="px-6 py-5 text-right font-medium tabular-nums">{currency(e.revenue)}</td>
                      <td className="px-6 py-5 text-right text-muted-foreground tabular-nums">{currency(e.expense)}</td>
                      <td className="px-6 py-5 text-right font-semibold">{currency(e.profit)}</td>
                      <td className="px-6 py-5 text-center text-muted-foreground">{new Date(e.booking_date).toLocaleDateString("en-IN")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* FOOTER */}
        {hasData && finance && (
          <motion.div {...fade(0.85)} className="rounded-2xl border bg-card p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Finance Dashboard</h3>
                <p className="text-sm text-muted-foreground mt-1">Updated from your connected data source.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Last Updated</p>
                <p className="font-medium mt-1">{new Date(finance.generated_at).toLocaleString("en-IN")}</p>
              </div>
            </div>
          </motion.div>
        )}
        </>)}

      </div>
    </DashboardLayout>
  );
}
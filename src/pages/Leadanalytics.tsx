import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { motion } from "framer-motion";
import { Users, TrendingUp, Target, PhoneCall, ArrowUpRight, ArrowDownRight, BarChart2 } from "lucide-react";

const funnelStages = [
  { stage: "Website Visitors", count: 14200, pct: 100, color: "bg-blue-400" },
  { stage: "Inquiries Received", count: 1840, pct: 13, color: "bg-teal-400" },
  { stage: "Qualified Leads", count: 920, pct: 6.5, color: "bg-teal-400" },
  { stage: "Proposals Sent", count: 460, pct: 3.2, color: "bg-teal-400" },
  { stage: "Bookings Confirmed", count: 184, pct: 1.3, color: "bg-accent" },
];

const sources = [
  { source: "Instagram", leads: 420, conversion: "22%", trend: "up" },
  { source: "Google Ads", leads: 310, conversion: "18%", trend: "up" },
  { source: "WhatsApp", leads: 280, conversion: "31%", trend: "up" },
  { source: "Referrals", leads: 210, conversion: "42%", trend: "down" },
  { source: "Facebook", leads: 190, conversion: "15%", trend: "down" },
  { source: "Website Organic", leads: 160, conversion: "28%", trend: "up" },
];

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

const LeadAnalytics = () => {
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-serif text-foreground">Lead Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Deep-dive into lead sources, funnel performance, and conversion rates</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Leads", value: "1,840", icon: Users, sub: "+14% this month", up: true },
            { label: "Conversion Rate", value: "10%", icon: Target, sub: "+2% vs last month", up: true },
            { label: "Cost per Lead", value: "₹420", icon: TrendingUp, sub: "-8% vs last month", up: false },
            { label: "Follow-up Rate", value: "78%", icon: PhoneCall, sub: "within 24hrs", up: true },
          ].map((s, i) => (
            <motion.div key={s.label} {...fade(i * 0.05)} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="h-4 w-4 text-accent" />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-serif text-card-foreground">{s.value}</p>
              <p className={`text-[11px] mt-0.5 flex items-center gap-0.5 ${s.up ? "text-green-600" : "text-red-500"}`}>
                {s.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {s.sub}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <motion.div {...fade(0.15)} className="rounded-xl border bg-card p-5 shadow-card">
            <h3 className="font-serif text-lg text-card-foreground mb-4">Conversion Funnel</h3>
            <div className="space-y-3">
              {funnelStages.map((stage, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{stage.stage}</span>
                    <span className="font-medium text-card-foreground">{stage.count.toLocaleString()} ({stage.pct}%)</span>
                  </div>
                  <div className="h-5 bg-muted rounded overflow-hidden">
                    <div className={`h-full ${stage.color} rounded`} style={{ width: `${stage.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div {...fade(0.2)} className="rounded-xl border bg-card shadow-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-accent" />
              <h3 className="font-serif text-lg text-card-foreground">Lead Sources</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["Source", "Leads", "Conversion", "Trend"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map((s, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-card-foreground text-xs">{s.source}</td>
                    <td className="px-4 py-3 text-xs text-card-foreground">{s.leads}</td>
                    <td className="px-4 py-3 text-xs font-medium text-card-foreground">{s.conversion}</td>
                    <td className="px-4 py-3">
                      {s.trend === "up"
                        ? <ArrowUpRight className="h-4 w-4 text-green-500" />
                        : <ArrowDownRight className="h-4 w-4 text-red-500" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default LeadAnalytics;

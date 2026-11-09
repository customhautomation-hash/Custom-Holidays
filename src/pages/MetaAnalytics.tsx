/**
 * Meta Analytics — leads that came from Instagram and Facebook, which lead forms brought them,
 * and how many booked. Ad spend and cost per lead appear once Meta Ads is connected in Profile.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { channelOf, weeklyCounts } from "@/lib/leadSources";
import { Page, Card, Btn, Muted, Empty, RankBars, LineChart, AutoStrip, useT, inr, fmtDate } from "@/components/ch/kit";

export default function MetaAnalytics() {
  const t = useT();
  const nav = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [spend, setSpend] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const [c, b] = await Promise.all([
        supabase.from("contacts").select("id, name, source, met_where, stage, destination, created_at, deleted_at").order("created_at", { ascending: false }),
        supabase.from("bookings").select("contact_id, total_booking_value"),
      ]);
      const m: Record<string, number> = {};
      ((b.data as any[]) || []).forEach(x => { m[x.contact_id] = (m[x.contact_id] || 0) + Number(x.total_booking_value || 0); });
      setSpend(m);
      setRows(((c.data as any[]) || []).filter(r => !r.deleted_at && channelOf(r.source, r.met_where) === "Meta ads"));
      setLoading(false);
    })();
  }, []);

  const now = new Date(); const mStart = new Date(now.getFullYear(), now.getMonth(), 1); const pStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisMonth = rows.filter(r => new Date(r.created_at) >= mStart);
  const lastMonth = rows.filter(r => { const d = new Date(r.created_at); return d >= pStart && d < mStart; });
  const booked = rows.filter(r => /book/i.test(r.stage || "") || spend[r.id]);
  const bookedValue = rows.reduce((s, r) => s + (spend[r.id] || 0), 0);
  const forms = new Map<string, number>();
  rows.forEach(r => { const k = (r.met_where && !/meta|facebook|instagram/i.test(r.met_where) ? r.met_where : r.source) || "Meta ads"; forms.set(k, (forms.get(k) || 0) + 1); });
  const formRows = [...forms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value]) => ({ label, value }));
  const wk = weeklyCounts(rows.map(r => r.created_at));
  const change = lastMonth.length ? Math.round(((thisMonth.length - lastMonth.length) / lastMonth.length) * 100) : null;
  const kpis = [
    { l: "Meta leads this month", v: String(thisMonth.length), n: change === null ? `${lastMonth.length} last month` : `${change >= 0 ? "+" : ""}${change}% vs last month` },
    { l: "All Meta leads", v: String(rows.length), n: rows.length ? `since ${fmtDate(rows[rows.length - 1].created_at, { month: "short", year: "numeric" })}` : "" },
    { l: "Booked", v: String(booked.length), n: rows.length ? `${Math.round((booked.length / rows.length) * 100)}% of Meta leads` : "" },
    { l: "Booked value", v: inr(bookedValue), n: "from Meta leads" },
  ];

  return (
    <Page title="Meta Analytics" sub="Leads from Instagram and Facebook, and how many of them book">
      {loading ? <Card><Empty title="Loading Meta leads" /></Card> : (
        <>
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
            {kpis.map(k => <Card key={k.l} pad="18px 20px"><Muted>{k.l}</Muted><div style={{ fontSize: 28, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>{k.v}</div><Muted style={{ display: "block", marginTop: 6 }}>{k.n}</Muted></Card>)}
          </div>
          {!rows.length ? <Card><Empty title="No Meta leads yet">Leads whose source says Meta, Facebook or Instagram show up here.</Empty></Card> : (
            <div className="flex flex-col xl:flex-row items-stretch gap-6">
              <Card style={{ flex: 1.2 }}><div className="flex justify-between"><b style={{ fontSize: 15 }}>Leads by lead form</b><Muted>{rows.length} leads</Muted></div><div style={{ marginTop: 10 }}><RankBars rows={formRows} /></div></Card>
              <Card style={{ flex: 1 }}><b style={{ fontSize: 15 }}>Meta leads per week</b><div><Muted>Last 8 weeks</Muted></div><LineChart values={wk.values} labels={wk.labels} /></Card>
            </div>)}
          <Card>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div><b style={{ fontSize: 15 }}>Ad spend and cost per lead</b><div><Muted>Shows here once Meta Ads is connected. Until then, leads are counted from Master CRM.</Muted></div></div>
              <Btn onClick={() => nav("/profile")}>Open connections</Btn>
            </div>
          </Card>
          {!!rows.length && <Card pad="14px 18px">
            <div className="flex justify-between" style={{ padding: "4px 8px 8px" }}><b style={{ fontSize: 15 }}>Latest Meta leads</b><button onClick={() => nav("/leads")} style={{ background: "none", border: "none", color: t.TEAL, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Open Master CRM</button></div>
            {rows.slice(0, 6).map((r, i) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr 1fr 110px", gap: 12, padding: "10px 8px", borderTop: `1px solid ${t.LINE}`, fontSize: 13 }}>
                <b style={{ fontWeight: 500 }}>{r.name}</b><span style={{ color: t.MUTED }}>{r.met_where || r.source}</span><span style={{ color: t.MUTED }}>{r.destination || "—"}</span><span style={{ color: t.MUTED, textAlign: "right" }}>{fmtDate(r.created_at, { day: "numeric", month: "short" })}</span>
              </div>))}
          </Card>}
          <AutoStrip items={[
            { name: "Bring in lead forms", what: "New Instagram and Facebook form leads go straight into Master CRM", soon: true },
            { name: "First reply", what: "A personal reply is drafted within 5 minutes", approval: true, soon: true },
            { name: "High cost alert", what: "Tells you when cost per lead jumps", soon: true },
            { name: "Weekly Meta report", what: "Every Monday: leads, cost and bookings", soon: true },
          ]} />
        </>)}
    </Page>
  );
}

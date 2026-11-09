/**
 * Web Analytics — website visitors (Google Analytics) and the enquiries the website brings in.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { channelOf, weeklyCounts, CHANNELS, NOTE } from "@/lib/leadSources";
import { Page, Card, Btn, Muted, Empty, RankBars, LineChart, AutoStrip, useT, fmtDate } from "@/components/ch/kit";

type GA = { views: number; users: number; sessions: number; prevSessions: number; pages: { path: string; views: number }[]; countries: { name: string; sessions: number }[] };
function parseGA(raw: any): GA {
  const ov = raw?.overview?.rows ?? [];
  const v = (r: number, i: number) => parseFloat(ov[r]?.metricValues?.[i]?.value ?? "0");
  const countries: Record<string, number> = {};
  for (const r of raw?.geo?.rows ?? []) { const c = r.dimensionValues?.[0]?.value ?? "Unknown"; countries[c] = (countries[c] || 0) + parseInt(r.metricValues?.[0]?.value ?? "0"); }
  return { views: v(0, 0), users: v(0, 1), sessions: v(0, 3), prevSessions: v(1, 3),
    pages: (raw?.pages?.rows ?? []).slice(0, 6).map((r: any) => ({ path: r.dimensionValues?.[0]?.value ?? "—", views: parseInt(r.metricValues?.[0]?.value ?? "0") })),
    countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, sessions]) => ({ name, sessions })) };
}

export default function WebAnalyticsPage() {
  const t = useT();
  const nav = useNavigate();
  const [ga, setGa] = useState<GA | null>(null);
  const [gaErr, setGaErr] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.functions.invoke("ga4-analytics").then(({ data, error }: any) => { if (error || data?.error || !data) setGaErr(true); else setGa(parseGA(data)); }).catch(() => setGaErr(true));
    supabase.from("contacts").select("id, name, source, met_where, destination, created_at, deleted_at").order("created_at", { ascending: false })
      .then(({ data }: any) => { setContacts((data || []).filter((r: any) => !r.deleted_at)); setLoading(false); });
  }, []);

  const since = new Date(Date.now() - 30 * 86400000);
  const recent = contacts.filter(c => new Date(c.created_at) >= since);
  const web = contacts.filter(c => channelOf(c.source, c.met_where) === "Website");
  const webRecent = recent.filter(c => channelOf(c.source, c.met_where) === "Website");
  const bySource = CHANNELS.map(ch => ({ label: ch, note: NOTE[ch], value: recent.filter(c => channelOf(c.source, c.met_where) === ch).length })).filter(r => r.value).sort((a, b) => b.value - a.value);
  const wk = weeklyCounts(web.map(c => c.created_at));
  const conv = ga && ga.users ? ((webRecent.length / ga.users) * 100).toFixed(1) : null;
  const kpis = [
    { l: "Visitors · last 30 days", v: ga ? ga.users.toLocaleString("en-IN") : "—", n: ga ? `${ga.views.toLocaleString("en-IN")} page views` : gaErr ? "Google Analytics not connected" : "Loading" },
    { l: "Website enquiries · 30 days", v: String(webRecent.length), n: `${web.length} in total` },
    { l: "Visitors who enquired", v: conv ? `${conv}%` : "—", n: "enquiries ÷ visitors" },
    { l: "All leads · 30 days", v: String(recent.length), n: "every source" },
  ];

  return (
    <Page title="Web Analytics" sub="Who visits the website, and how many of them enquire">
      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        {kpis.map(k => <Card key={k.l} pad="18px 20px"><Muted>{k.l}</Muted><div style={{ fontSize: 28, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>{k.v}</div><Muted style={{ display: "block", marginTop: 6 }}>{k.n}</Muted></Card>)}
      </div>
      <div className="flex flex-col xl:flex-row items-stretch gap-6">
        <Card style={{ flex: 1.2 }}>
          <div className="flex justify-between"><b style={{ fontSize: 15 }}>Where leads came from</b><Muted>{recent.length} leads · last 30 days</Muted></div>
          <div style={{ marginTop: 10 }}>{loading ? <Muted>Loading</Muted> : bySource.length ? <RankBars rows={bySource} /> : <Empty title="No leads in the last 30 days" />}</div>
        </Card>
        <Card style={{ flex: 1 }}><b style={{ fontSize: 15 }}>Website enquiries per week</b><div><Muted>Last 8 weeks</Muted></div><LineChart values={wk.values} labels={wk.labels} /></Card>
      </div>
      {ga ? (
        <div className="flex flex-col xl:flex-row items-stretch gap-6">
          <Card style={{ flex: 1 }}><b style={{ fontSize: 15 }}>Most visited pages</b><div style={{ marginTop: 10 }}><RankBars rows={ga.pages.map(p => ({ label: p.path, value: p.views }))} /></div></Card>
          <Card style={{ flex: 1 }}><b style={{ fontSize: 15 }}>Visitors by country</b><div style={{ marginTop: 10 }}><RankBars rows={ga.countries.map(c => ({ label: c.name, value: c.sessions }))} /></div></Card>
        </div>
      ) : gaErr ? (
        <Card><div className="flex items-center justify-between gap-4 flex-wrap"><div><b style={{ fontSize: 15 }}>Visitors, pages and countries</b><div><Muted>Show here once Google Analytics is connected.</Muted></div></div><Btn onClick={() => nav("/profile")}>Open connections</Btn></div></Card>
      ) : null}
      {!!webRecent.length && <Card pad="14px 18px">
        <div className="flex justify-between" style={{ padding: "4px 8px 8px" }}><b style={{ fontSize: 15 }}>Latest website enquiries</b><button onClick={() => nav("/leads")} style={{ background: "none", border: "none", color: t.TEAL, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Open Master CRM</button></div>
        {webRecent.slice(0, 6).map(r => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr 1fr 110px", gap: 12, padding: "10px 8px", borderTop: `1px solid ${t.LINE}`, fontSize: 13 }}>
            <b style={{ fontWeight: 500 }}>{r.name}</b><span style={{ color: t.MUTED }}>{r.met_where || r.source}</span><span style={{ color: t.MUTED }}>{r.destination || "—"}</span><span style={{ color: t.MUTED, textAlign: "right" }}>{fmtDate(r.created_at, { day: "numeric", month: "short" })}</span>
          </div>))}
      </Card>}
      <AutoStrip items={[
        { name: "Capture enquiries", what: "Website form and chat enquiries go straight into Master CRM", soon: true },
        { name: "First reply", what: "A personal reply is drafted within 5 minutes", approval: true, soon: true },
        { name: "Half-filled forms", what: "Follows up people who left the form halfway", approval: true, soon: true },
        { name: "Weekly website report", what: "Every Monday: visitors, enquiries, best pages", soon: true },
      ]} />
    </Page>
  );
}

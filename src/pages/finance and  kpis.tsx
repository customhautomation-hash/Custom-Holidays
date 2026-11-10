/**
 * Finance KPIs — figures from Tally.
 * The Tally Connector on the finance PC sends Tally's totals every 15 minutes (see public/tally-connector
 * and backend/finance). This page shows sales, costs and profit, what clients owe, what we owe suppliers,
 * bank and cash, and this month's spending.
 */
import { CSSProperties, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Target, AlertTriangle, Pencil } from "lucide-react";
import { API_ROOT } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { buildZip } from "@/lib/zipWriter";
import { Page, Card, Btn, Field, Muted, Empty, useT, T, inr, fmtDate } from "@/components/ch/kit";

type PL = { label?: string; month?: string; sales: number; direct_costs: number; gross_profit: number; gross_margin: number | null; indirect_expenses: number; other_income: number; net_profit: number; net_margin: number | null };
type Party = { name: string; amount: number; kind?: string };
type Summary = {
  company: string; as_of: string; fy_label: string; month: PL; prev_month: PL | null; fy: PL; trend: PL[];
  receivables: { total: number; count: number; top: Party[]; advances: number };
  payables: { total: number; count: number; top: Party[]; advances: number };
  cash: { total: number; accounts: Party[] }; expenses_month: Party[]; taxes_payable: number;
};
type Resp = { summary: Summary | null; received_at: string | null; last_ping: { at: string; status: string; message: string; company: string; version: string } | null;
  targets: { monthly_sales?: number; gross_margin?: number }; connector_set_up: boolean; setup_needed: boolean; is_owner: boolean };

async function api(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`${API_ROOT}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: data.session ? `Bearer ${data.session.access_token}` : "", ...(init.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || `Request failed (${r.status})`);
  return d;
}
const money = (n?: number | null) => (n == null ? "—" : n < 0 ? `−${inr(-n)}` : n === 0 ? "₹0" : inr(n));
const pct = (n?: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
const ago = (iso?: string | null) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return fmtDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function FinanceKPIs() {
  const t = useT();
  const [d, setD] = useState<Resp | null>(null);
  const [err, setErr] = useState("");

  const load = async () => {
    try { setD(await api("/finance/summary")); setErr(""); }
    catch (e: any) { setErr(e?.message || "Couldn't load the figures"); }
  };
  useEffect(() => { load(); const i = setInterval(load, 5 * 60000); return () => clearInterval(i); }, []);

  const s = d?.summary;
  const stale = !!d?.received_at && Date.now() - new Date(d.received_at).getTime() > 3 * 3600e3;
  const tallyClosed = d?.last_ping && d.last_ping.status !== "ok";

  return (
    <Page title="Finance KPIs"
      sub={s ? <>From Tally · {s.company || "Custom Holidays"} · figures up to {fmtDate(s.as_of, { day: "numeric", month: "short", year: "numeric" })} · updated {ago(d?.received_at)}</> : "Sales, costs, profit and balances, straight from Tally"}>

      {!d && !err && <Card><Empty title="Loading figures"><Loader2 size={16} className="animate-spin inline" /></Empty></Card>}
      {!d && err && <Card><Empty title="Couldn't load the figures" action={<Btn onClick={load}>Try again</Btn>}>{err}</Empty></Card>}

      {d && (tallyClosed || stale) && s && (
        <Card pad="12px 18px" style={{ background: t.GOLD_BG }}>
          <div className="flex items-center gap-3" style={{ fontSize: 13 }}>
            <AlertTriangle size={16} color={t.GOLD} />
            <span>{tallyClosed ? `Tally wasn't open at the last check (${ago(d.last_ping!.at)}). ` : ""}These figures are from {ago(d.received_at)}. They update on their own once Tally is open on the finance computer.</span>
          </div>
        </Card>)}

      {d && !s && <Setup d={d} t={t} onDone={load} />}

      {d && s && <>
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <Stat t={t} label={`Sales · ${monthName(s.month.month)}`} value={money(s.month.sales)} note={soFar(s)} />
          <Stat t={t} label="Gross profit" value={money(s.month.gross_profit)} note={`${pct(s.month.gross_margin)} margin`} />
          <Stat t={t} label="Net profit" value={money(s.month.net_profit)} note={`after ${money(s.month.indirect_expenses)} running costs`} accent={s.month.net_profit < 0 ? t.RED : undefined} />
          <Stat t={t} label="Cash and bank" value={money(s.cash.total)} note={`${s.cash.accounts.length} account${s.cash.accounts.length === 1 ? "" : "s"} · today`} />
        </div>

        <div className="grid gap-5 grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card pad="20px 22px">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div><b style={{ fontSize: 15 }}>Sales and costs by month</b><div><Muted>{s.fy_label} · costs are supplier and other direct costs</Muted></div></div>
              <div className="flex gap-4" style={{ fontSize: 12, color: t.MUTED }}>
                <span className="flex items-center gap-1.5"><i style={{ width: 10, height: 10, borderRadius: 3, background: t.TEAL, display: "inline-block" }} />Sales</span>
                <span className="flex items-center gap-1.5"><i style={{ width: 10, height: 10, borderRadius: 3, background: t.dark ? "#3E5F5C" : "#CBBFC1", display: "inline-block" }} />Costs</span>
                {!!d.targets.monthly_sales && <span className="flex items-center gap-1.5"><i style={{ width: 14, height: 0, borderTop: `2px dashed ${t.GOLD}`, display: "inline-block" }} />Target</span>}
              </div>
            </div>
            <Bars t={t} rows={s.trend} target={d.targets.monthly_sales} />
          </Card>
          <Targets t={t} d={d} s={s} onSaved={load} />
        </div>

        <div className="grid gap-5 grid-cols-1 lg:grid-cols-3">
          <Card pad="20px 22px">
            <b style={{ fontSize: 15 }}>Money owed to us</b>
            <div style={{ fontSize: 26, fontWeight: 600, margin: "6px 0 2px", fontVariantNumeric: "tabular-nums" }}>{money(s.receivables.total)}</div>
            <Muted>{s.receivables.count} client{s.receivables.count === 1 ? "" : "s"}{s.receivables.advances ? ` · ${money(s.receivables.advances)} received in advance` : ""}</Muted>
            <PartyBars t={t} rows={s.receivables.top} empty="No client owes anything" />
          </Card>
          <Card pad="20px 22px">
            <b style={{ fontSize: 15 }}>Money we owe suppliers</b>
            <div style={{ fontSize: 26, fontWeight: 600, margin: "6px 0 2px", fontVariantNumeric: "tabular-nums" }}>{money(s.payables.total)}</div>
            <Muted>{s.payables.count} supplier{s.payables.count === 1 ? "" : "s"}{s.payables.advances ? ` · ${money(s.payables.advances)} paid in advance` : ""}</Muted>
            <PartyBars t={t} rows={s.payables.top} empty="Nothing owed to suppliers" />
          </Card>
          <Card pad="20px 22px">
            <b style={{ fontSize: 15 }}>Bank and cash</b>
            <div style={{ fontSize: 26, fontWeight: 600, margin: "6px 0 2px", fontVariantNumeric: "tabular-nums", color: s.cash.total < 0 ? t.RED : t.INK }}>{money(s.cash.total)}</div>
            <Muted>Balances today</Muted>
            <div style={{ marginTop: 12 }}>
              {s.cash.accounts.length ? s.cash.accounts.map((a, i) => (
                <div key={a.name} className="flex items-baseline justify-between gap-3" style={{ padding: "8px 0", borderTop: i ? `1px solid ${t.LINE}` : "none", fontSize: 13 }}>
                  <div style={{ minWidth: 0 }}><div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div><Muted>{a.kind}</Muted></div>
                  <b style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: a.amount < 0 ? t.RED : t.INK }}>{money(a.amount)}</b>
                </div>)) : <Muted>No bank or cash accounts found in Tally</Muted>}
            </div>
          </Card>
        </div>

        <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
          <Card pad="20px 22px">
            <b style={{ fontSize: 15 }}>Spending in {monthName(s.month.month)}</b>
            <div><Muted>Biggest costs this month, by account</Muted></div>
            <PartyBars t={t} rows={s.expenses_month} empty="No spending recorded yet this month" showKind />
          </Card>
          <Card pad="20px 22px">
            <b style={{ fontSize: 15 }}>{s.fy_label} so far</b>
            <div><Muted>From 1 April to {fmtDate(s.as_of, { day: "numeric", month: "short" })}</Muted></div>
            <div style={{ marginTop: 10 }}>
              {([["Sales", s.fy.sales], ["Supplier and direct costs", -s.fy.direct_costs], ["Gross profit", s.fy.gross_profit, `${pct(s.fy.gross_margin)} margin`], ["Running costs", -s.fy.indirect_expenses], ["Other income", s.fy.other_income], ["Net profit", s.fy.net_profit, `${pct(s.fy.net_margin)} of sales`], ["GST and other taxes payable", s.taxes_payable]] as [string, number, string?][]).map(([l, v, n], i) => (
                <div key={l} className="flex items-baseline justify-between gap-3" style={{ padding: "9px 0", borderTop: i ? `1px solid ${t.LINE}` : "none", fontSize: 13, fontWeight: /profit/.test(l) ? 600 : 400 }}>
                  <span>{l}{n && <Muted style={{ marginLeft: 8, fontWeight: 400 }}>{n}</Muted>}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: v < 0 && /profit/.test(l) ? t.RED : t.INK }}>{money(v)}</span>
                </div>))}
            </div>
          </Card>
        </div>

        {d.is_owner && <Connector t={t} d={d} onDone={load} />}
      </>}
    </Page>
  );
}

/** This month is still running, so compare with last month's full total rather than a misleading % */
function soFar(s: Summary) {
  const day = new Date(s.as_of).getDate();
  const prev = s.prev_month ? ` · ${monthName(s.prev_month.month)} was ${money(s.prev_month.sales)}` : "";
  return `${day} day${day === 1 ? "" : "s"} so far${prev}`;
}
/** Months of the financial year gone by, counting this month by its days */
function monthsElapsed(s: Summary) {
  const d = new Date(s.as_of);
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return Math.max(0, s.trend.length - 1) + d.getDate() / days;
}
const monthName = (ym?: string) => (ym ? new Date(ym + "-01").toLocaleDateString("en-GB", { month: "long" }) : "this month");

function Stat({ t, label, value, note, accent }: { t: T; label: string; value: string; note: string; accent?: string }) {
  return (
    <Card pad="18px 20px">
      <div style={{ fontSize: 12.5, color: t.MUTED }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, margin: "4px 0 2px", fontVariantNumeric: "tabular-nums", color: accent || t.INK }}>{value}</div>
      <div style={{ fontSize: 12, color: t.FAINT }}>{note}</div>
    </Card>
  );
}

/** Sales (teal) and costs (quiet) side by side for each month; this month is labelled. */
function Bars({ t, rows, target }: { t: T; rows: PL[]; target?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.flatMap(r => [r.sales, r.direct_costs]), target || 0) * 1.12;
  const H = 210;
  const y = (v: number) => H - (Math.max(0, v) / max) * H;
  const tip = hover != null ? rows[hover] : null;
  return (
    <div style={{ position: "relative", marginTop: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, minmax(0,1fr))`, gap: 10, alignItems: "end", height: H, borderBottom: `1px solid ${t.LINE}`, position: "relative" }}>
        {!!target && <div style={{ position: "absolute", left: 0, right: 0, top: y(target), borderTop: `2px dashed ${t.GOLD}`, opacity: 0.8 }} />}
        {rows.map((r, i) => (
          <div key={r.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 3, cursor: "default", position: "relative" }}>
            {i === rows.length - 1 && <div style={{ position: "absolute", top: y(r.sales) - 20, fontSize: 11.5, fontWeight: 600, color: t.INK, whiteSpace: "nowrap" }}>{inr(r.sales)}</div>}
            <div style={{ width: "38%", maxWidth: 22, height: H - y(r.sales), background: t.TEAL, borderRadius: "4px 4px 0 0", opacity: hover == null || hover === i ? 1 : 0.55 }} />
            <div style={{ width: "38%", maxWidth: 22, height: H - y(r.direct_costs), background: t.dark ? "#3E5F5C" : "#CBBFC1", borderRadius: "4px 4px 0 0", opacity: hover == null || hover === i ? 1 : 0.55 }} />
          </div>))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, minmax(0,1fr))`, gap: 10, marginTop: 6 }}>
        {rows.map(r => <div key={r.month} style={{ textAlign: "center", fontSize: 11, color: t.MUTED }}>{r.label}</div>)}
      </div>
      {tip && (
        <div style={{ position: "absolute", top: 0, left: `${Math.min(80, ((hover! + 0.5) / rows.length) * 100)}%`, transform: "translateX(-50%)", background: t.BG, boxShadow: t.OUT, borderRadius: 12, padding: "10px 12px", fontSize: 12, pointerEvents: "none", minWidth: 170, zIndex: 2 }}>
          <b>{monthName(tip.month)}</b>
          {([["Sales", tip.sales], ["Costs", tip.direct_costs], ["Gross profit", tip.gross_profit], ["Net profit", tip.net_profit]] as [string, number][]).map(([l, v]) => (
            <div key={l} className="flex justify-between gap-4" style={{ marginTop: 3 }}><span style={{ color: t.MUTED }}>{l}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{money(v)}</span></div>))}
        </div>)}
    </div>
  );
}

function PartyBars({ t, rows, empty, showKind }: { t: T; rows: Party[]; empty: string; showKind?: boolean }) {
  const max = Math.max(1, ...rows.map(r => r.amount));
  if (!rows.length) return <div style={{ marginTop: 12 }}><Muted>{empty}</Muted></div>;
  return (
    <div style={{ marginTop: 12 }}>
      {rows.slice(0, 8).map((r, i) => (
        <div key={r.name} style={{ padding: "6px 0" }}>
          <div className="flex items-baseline justify-between gap-3" style={{ fontSize: 12.5 }}>
            <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}{showKind && r.kind && <Muted style={{ marginLeft: 6 }}>{r.kind}</Muted>}</span>
            <b style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(r.amount)}</b>
          </div>
          <div style={{ height: 6, marginTop: 4, background: t.dark ? "#16434A" : "#E8DADB", borderRadius: 3 }}>
            <div style={{ width: `${(r.amount / max) * 100}%`, height: 6, borderRadius: 3, background: i === 0 ? t.TEAL : (t.dark ? "#3E7A76" : "#7FA9A7") }} />
          </div>
        </div>))}
    </div>
  );
}

function Targets({ t, d, s, onSaved }: { t: T; d: Resp; s: Summary; onSaved: () => void }) {
  const [edit, setEdit] = useState(false);
  const [sales, setSales] = useState(String(d.targets.monthly_sales || ""));
  const [margin, setMargin] = useState(d.targets.gross_margin ? String(d.targets.gross_margin * 100) : "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api("/finance/targets", { method: "POST", body: JSON.stringify({ monthly_sales: Number(sales.replace(/[^\d.]/g, "")) || null, gross_margin: margin ? Number(margin) / 100 : null }) }); setEdit(false); onSaved(); }
    finally { setBusy(false); }
  };
  const ts = d.targets.monthly_sales, tm = d.targets.gross_margin;
  const row = (label: string, now: string, target: string, ratio: number | null) => (
    <div style={{ padding: "12px 0", borderTop: `1px solid ${t.LINE}` }}>
      <div className="flex justify-between gap-3" style={{ fontSize: 13 }}><span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}><b style={{ fontWeight: 600 }}>{now}</b><Muted> of {target}</Muted></span></div>
      {ratio != null && <div style={{ height: 8, marginTop: 8, background: t.dark ? "#16434A" : "#E8DADB", borderRadius: 4 }}><div style={{ width: `${Math.min(100, ratio * 100)}%`, height: 8, borderRadius: 4, background: ratio >= 1 ? t.TEAL : t.GOLD }} /></div>}
    </div>);
  return (
    <Card pad="20px 22px">
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: 10 }}>
        <b style={{ fontSize: 15 }} className="flex items-center gap-2"><Target size={15} color={t.MUTED} />Targets · {monthName(s.month.month)}</b>
        {d.is_owner && !edit && <button onClick={() => setEdit(true)} title="Set targets" style={{ background: "none", border: "none", color: t.TEAL, cursor: "pointer" }}><Pencil size={14} /></button>}
      </div>
      {edit ? (
        <div className="flex flex-col gap-3" style={{ fontSize: 13 }}>
          <label className="flex flex-col gap-1"><Muted>Monthly sales target (₹)</Muted><Field value={sales} onChange={setSales} placeholder="e.g. 5500000" /></label>
          <label className="flex flex-col gap-1"><Muted>Gross margin target (%)</Muted><Field value={margin} onChange={setMargin} placeholder="e.g. 20" /></label>
          <div className="flex gap-2 justify-end"><Btn onClick={() => setEdit(false)}>Cancel</Btn><Btn kind="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save targets"}</Btn></div>
        </div>
      ) : !ts && !tm ? (
        <Muted>{d.is_owner ? "No targets yet. Click the pencil to set a monthly sales target and a margin target." : "No targets set yet."}</Muted>
      ) : <>
        {ts ? row("Sales", money(s.month.sales), money(ts), s.month.sales / ts) : null}
        {tm ? row("Gross margin", pct(s.month.gross_margin), pct(tm), s.month.gross_margin == null ? null : s.month.gross_margin / tm) : null}
        {ts ? <div style={{ marginTop: 10 }}><Muted>{s.fy.sales >= ts * monthsElapsed(s) ? `${money(s.fy.sales - ts * monthsElapsed(s))} ahead of the target for the year so far` : `${money(ts * monthsElapsed(s) - s.fy.sales)} behind the target for the year so far`}</Muted></div> : null}
      </>}
    </Card>
  );
}

/** Builds the Tally Connector download: the scripts from /tally-connector plus a config with a fresh key. */
async function downloadConnector(company: string) {
  const { key } = await api("/finance/connector", { method: "POST" });
  const files = ["install.bat", "uninstall.bat", "tally-connector.ps1", "run-hidden.vbs", "README.txt"];
  const entries = await Promise.all(files.map(async f => {
    const r = await fetch(`/tally-connector/${f}`);
    if (!r.ok) throw new Error("Couldn't prepare the download");
    return { path: `Tally Connector/${f}`, file: await r.blob() };
  }));
  const apiUrl = API_ROOT.startsWith("http") ? API_ROOT : new URL(API_ROOT, window.location.origin).href.replace(/\/$/, "");
  const config = JSON.stringify({ apiUrl, key, tallyPort: 9000, company }, null, 2).replace(/\n/g, "\r\n");
  entries.push({ path: "Tally Connector/config.json", file: new Blob([config], { type: "application/json" }) });
  const zip = await buildZip(entries);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(zip); a.download = "Custom Holidays Tally Connector.zip"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function Setup({ d, t, onDone }: { d: Resp; t: T; onDone: () => void }) {
  if (!d.is_owner) return (
    <Card><Empty title="Waiting for the first figures from Tally">The Owner sets up the Tally Connector on the finance computer once. After that, figures appear here and update every 15 minutes.</Empty></Card>);
  return <Connector t={t} d={d} onDone={onDone} first />;
}

function Connector({ t, d, onDone, first }: { t: T; d: Resp; onDone: () => void; first?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [company, setCompany] = useState(d.last_ping?.company || "");
  const go = async () => {
    if (d.connector_set_up && !first && !confirm("Download a new connector? The one already installed will stop working until the new one is installed.")) return;
    setBusy(true); setMsg("");
    try { await downloadConnector(company.trim()); setMsg("Downloaded. Take the zip to the finance computer and follow the steps."); onDone(); }
    catch (e: any) { setMsg(e?.message || "Couldn't prepare the download"); }
    finally { setBusy(false); }
  };
  const steps = useMemo(() => [
    d.setup_needed ? "In Supabase → SQL Editor, run the file supabase/finance_tally.sql from the dashboard folder (once)." : null,
    "Click Download Tally Connector below and copy the zip to the computer that has Tally.",
    "In Tally, load the company, then go to Exchange → Data Synchronization. Set TallyPrime act as to Server (or Both) and Port to 9000, and save.",
    "Right-click the zip → Extract All, open the folder and double-click install.bat. It should say \"Sent figures\".",
    "Come back to this page. Figures appear within a minute and update every 15 minutes while Tally is open.",
  ].filter(Boolean) as string[], [d.setup_needed]);
  const box: CSSProperties = { width: 24, height: 24, borderRadius: 99, background: t.TEAL_BG, color: t.TEAL, fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  return (
    <Card pad="24px 26px">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-serif" style={{ fontSize: first ? 24 : 19 }}>{first ? "Connect Tally" : "Tally Connector"}</div>
          <Muted>{first ? "A small program on the finance computer sends Tally's figures here every 15 minutes. It only reads from Tally and never changes anything."
            : d.last_ping ? `Last heard from Tally ${ago(d.last_ping.at)}${d.last_ping.status !== "ok" ? " · Tally wasn't open" : ""}` : "Installed on the finance computer"}</Muted>
        </div>
        {!first && <Btn onClick={go} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}Download again</Btn>}
      </div>
      {first && <>
        <ol style={{ listStyle: "none", padding: 0, margin: "18px 0 0", display: "flex", flexDirection: "column", gap: 10, maxWidth: 760 }}>
          {steps.map((x, i) => <li key={i} className="flex gap-3" style={{ fontSize: 13.5, lineHeight: 1.6 }}><span style={box}>{i + 1}</span><span>{x}</span></li>)}
        </ol>
        <div className="flex items-end gap-3 flex-wrap" style={{ marginTop: 20 }}>
          <label className="flex flex-col gap-1" style={{ fontSize: 13 }}><Muted>Company name in Tally (optional, only if several are open)</Muted><Field value={company} onChange={setCompany} placeholder="e.g. Custom Holidays Pvt Ltd" style={{ width: 320 }} /></label>
          <Btn kind="primary" onClick={go} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}Download Tally Connector</Btn>
        </div>
        {d.last_ping && d.last_ping.status !== "ok" && <div style={{ marginTop: 14, fontSize: 13, color: t.RED }}>The connector is installed but couldn't read Tally ({ago(d.last_ping.at)}). Check that Tally is open with the company loaded, and step 3.</div>}
      </>}
      {msg && <div style={{ marginTop: 12, fontSize: 13, color: t.MUTED }}>{msg}</div>}
    </Card>
  );
}

/**
 * Suppliers — every DMC, hotel and partner, found automatically in Gmail.
 * The backend reads supplier emails (rates, contracts, confirmations), adds the company here with its
 * type and destination, and files any rates it finds. Rates and emails show per supplier.
 */
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, RefreshCw, Plus, Loader2, Upload, Building2, Car, Map as MapIcon, Trash2, ExternalLink, ListChecks, ChevronLeft, ChevronRight, EyeOff } from "lucide-react";
import { API_ROOT } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Page, Card, Btn, Field, Muted, Dot, Empty, useT, fmtDate } from "@/components/ch/kit";

type Supplier = { id: string; name: string; company_name?: string | null; designation?: string | null; place?: string | null; phone?: string | null; email?: string | null; supplier_type?: string | null; internal_notes?: string | null; raw_notion_data?: any; created_at?: string };
type Rate = Record<string, any>;
const TYPES = ["DMC", "Hotel", "Transport", "Activity Provider", "Airline / GSA", "Cruise", "Travel Agency", "Visa / Insurance", "Other"];
const norm = (s?: string | null) => (s || "").trim().toLowerCase();
const typeOf = (s: Supplier) => { const x = norm(s.supplier_type);
  if (!x || /dmc|tour operator|ground|destination/.test(x)) return "DMC";
  if (/hotel|resort|villa|stay|boutique/.test(x)) return "Hotel";
  if (/transport|car|transfer|chauffeur/.test(x)) return "Transport";
  if (/activity|guide|experience/.test(x)) return "Activity Provider";
  if (/flight|airline|gsa/.test(x)) return "Airline / GSA";
  if (/cruise/.test(x)) return "Cruise"; if (/agency/.test(x)) return "Travel Agency"; if (/visa|insurance/.test(x)) return "Visa / Insurance";
  return "Other"; };
async function auth() { const { data } = await supabase.auth.getSession(); return data.session?.access_token ? `Bearer ${data.session.access_token}` : ""; }
async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(`${API_ROOT}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: await auth(), ...(init.headers || {}) } });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.detail || `Request failed (${r.status})`); return d;
}

type SRow = { s: Supplier; type: string; rates: number; emails: number; last: string | null; fromGmail: boolean; hidden: boolean; review: boolean };
type LogEmail = { gmail_message_id: string; subject?: string | null; sender?: string | null; note?: string | null; status?: string; supplier_name?: string; extraction_type?: string; created_at: string };
const PER_PAGE = 50;
const ago = (iso?: string | null) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return fmtDate(iso, { day: "numeric", month: "short" });
};

export default function SuppliersPage() {
  const t = useT();
  const nav = useNavigate();
  const [data, setData] = useState<{ suppliers: Supplier[]; hotels: Rate[]; activities: Rate[]; transfers: Rate[]; stats: Record<string, { count: number; last: string | null }> } | null>(null);
  const [err, setErr] = useState("");
  const [gmail, setGmail] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<string[]>([]);
  const [recent, setRecent] = useState<LogEmail[] | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [logFilter, setLogFilter] = useState<"all" | "saved" | "skipped">("all");
  const [q, setQ] = useState(""); const [type, setType] = useState("All");
  const [sort, setSort] = useState<"recent" | "name" | "rates">("recent");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"hotels" | "activities" | "transfers">("hotels");
  const [adding, setAdding] = useState(false);
  const poll = useRef<any>(null);
  const tableTop = useRef<HTMLDivElement>(null);

  const load = async () => {
    setErr("");
    try {
      const d = await api("/gmail/suppliers-overview");
      let stats = d.email_stats || {};
      if (!d.email_stats && Array.isArray(d.emails)) { // older server
        stats = {}; d.emails.forEach((e: any) => { const k = norm(e.supplier_name); if (!k) return; const x = stats[k] || (stats[k] = { count: 0, last: null }); x.count++; if (!x.last || e.created_at > x.last) x.last = e.created_at; });
      }
      setData({ suppliers: d.suppliers || [], hotels: d.hotels || [], activities: d.activities || [], transfers: d.transfers || [], stats });
    } catch { setErr("Couldn't load suppliers just now"); setTimeout(load, 15000); }
  };
  const loadGmail = async () => { try { const g = await api("/gmail/status"); setGmail(g); return g; } catch { setGmail({ connected: false }); return null; } };
  const loadRecent = async () => { try { setRecent((await api("/gmail/recent?limit=80")).emails || []); } catch { setRecent(r => r || []); } };

  // While a check runs, show its log line by line
  const watch = () => {
    clearInterval(poll.current);
    setRunning(true);
    poll.current = setInterval(async () => {
      const l = await api("/gmail/live-log").catch(() => null);
      if (!l) return;
      setLive(l.log || []);
      if (!l.is_syncing) { clearInterval(poll.current); setRunning(false); load(); loadGmail(); loadRecent(); }
    }, 2000);
  };

  useEffect(() => {
    load();
    loadGmail().then(g => { if (g?.is_syncing) { setShowLog(true); watch(); } });
    loadRecent();
    api("/gmail/heartbeat", { method: "POST" }).catch(() => {}); // checks Gmail if it's been 5+ minutes
    const i = setInterval(() => { api("/gmail/heartbeat", { method: "POST" }).catch(() => {}); load(); loadGmail(); loadRecent(); }, 5 * 60000);
    return () => { clearInterval(i); clearInterval(poll.current); };
  }, []);

  const checkNow = async () => {
    setShowLog(true); setLive(["Starting the check"]);
    try { await api("/gmail/sync-now?max_emails=150", { method: "POST" }); setTimeout(watch, 800); }
    catch (e: any) { setLive([e?.message || "Couldn't start the check. Try again in a minute"]); }
  };

  const rows: SRow[] = useMemo(() => {
    if (!data) return [];
    const rateCount = new Map<string, number>();
    [...data.hotels, ...data.activities, ...data.transfers].forEach(r => { const k = norm(r.supplier_name); rateCount.set(k, (rateCount.get(k) || 0) + 1); });
    return data.suppliers.map(s => {
      const st = data.stats[norm(s.name)] || (s.company_name ? data.stats[norm(s.company_name)] : undefined);
      const rates = (rateCount.get(norm(s.name)) || 0) + (s.company_name && norm(s.company_name) !== norm(s.name) ? rateCount.get(norm(s.company_name)) || 0 : 0);
      const type = typeOf(s);
      const hidden = (s as any).onboarding_status === "not_supplier";
      return { s, type, rates, emails: st?.count || 0, last: st?.last || null, fromGmail: !!st || /gmail/i.test(s.internal_notes || ""), hidden,
        review: !hidden && type === "Other" && rates === 0 };
    });
  }, [data]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { All: 0, "Needs review": 0, Hidden: 0 };
    rows.forEach(r => { if (r.hidden) { m.Hidden++; return; } m.All++; m[r.type] = (m[r.type] || 0) + 1; if (r.review) m["Needs review"]++; });
    return m;
  }, [rows]);

  const shown = useMemo(() => {
    const qq = norm(q);
    const list = rows.filter(r =>
      (type === "Hidden" ? r.hidden : !r.hidden) &&
      (type === "All" || type === "Hidden" || (type === "Needs review" ? r.review : r.type === type)) &&
      (!qq || [r.s.name, r.s.company_name, r.s.place, r.s.email, r.s.designation].some(v => norm(v).includes(qq))));
    const key = (r: SRow) => r.last || r.s.created_at || "";
    return list.sort(sort === "name" ? (a, b) => a.s.name.localeCompare(b.s.name) : sort === "rates" ? (a, b) => b.rates - a.rates || key(b).localeCompare(key(a)) : (a, b) => key(b).localeCompare(key(a)));
  }, [rows, q, type, sort]);
  useEffect(() => { setPage(0); }, [q, type, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const pg = Math.min(page, pages - 1);
  const pageRows = shown.slice(pg * PER_PAGE, pg * PER_PAGE + PER_PAGE);
  const goPage = (n: number) => { setPage(n); tableTop.current?.scrollTo({ top: 0 }); };

  const cur = rows.find(r => r.s.id === sel) || pageRows[0] || null;
  const ratesOf = (k: "hotels" | "activities" | "transfers") => !cur || !data ? [] : data[k].filter(r => norm(r.supplier_name) === norm(cur.s.name) || (cur.s.company_name && norm(r.supplier_name) === norm(cur.s.company_name)));

  const save = async (s: Supplier, patch: Partial<Supplier>) => {
    const n = { ...s, ...patch };
    setData(d => d && { ...d, suppliers: d.suppliers.map(x => x.id === s.id ? n : x) });
    await api(`/suppliers/${s.id}`, { method: "PUT", body: JSON.stringify({ name: n.name, designation: n.designation || "", company: n.company_name || "", place: n.place || "", phone: n.phone || "", email: n.email || "", supplier_type: n.supplier_type || "", event: n.internal_notes || "", url: n.raw_notion_data?.url || "" }) }).catch(() => {});
  };
  const setHidden = async (s: Supplier, hide: boolean) => {
    setData(d => d && { ...d, suppliers: d.suppliers.map(x => x.id === s.id ? { ...x, onboarding_status: hide ? "not_supplier" : "active" } as any : x) });
    await api(`/gmail/suppliers/${s.id}/review`, { method: "POST", body: JSON.stringify({ hide }) }).catch(() => {});
  };
  const remove = async (s: Supplier) => {
    if (!confirm(`Delete ${s.name} for good? To just tidy the list, use "Not a supplier" instead.`)) return;
    setData(d => d && { ...d, suppliers: d.suppliers.filter(x => x.id !== s.id) }); setSel(null);
    await api(`/suppliers/${s.id}`, { method: "DELETE" }).catch(() => {});
  };

  const th = { textAlign: "left" as const, fontSize: 11.5, color: t.FAINT, fontWeight: 500, padding: "10px", position: "sticky" as const, top: 0, background: t.BG, zIndex: 1, boxShadow: `inset 0 -1px 0 ${t.LINE}` };
  const td = { padding: "9px 10px", fontSize: 13, borderTop: `1px solid ${t.LINE}` };
  const lastCheck = gmail?.latest?.last_run;
  const chip = (k: string, label = k) => (
    <button key={k} onClick={() => setType(k)} style={{ height: 30, padding: "0 13px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
      background: type === k ? (t.dark ? "#1F6F72" : "#13585B") : t.BG, color: type === k ? "#fff" : t.MUTED, boxShadow: type === k ? "none" : t.BTN }}>{label} · {counts[k] || 0}</button>);
  const recentShown = (recent || []).filter(e => logFilter === "all" ? true : logFilter === "saved" ? e.status !== "irrelevant" : e.status === "irrelevant");

  return (
    <Page title="Suppliers" sub="DMCs, hotels and partners, added automatically from Gmail"
      actions={<>
        <Field value={q} onChange={setQ} placeholder="Search name, place, email or contact" style={{ width: 280 }} />
        <Btn onClick={() => nav("/suppliers/import")} title="CSV import, Notion import, business cards"><Upload size={15} />Import</Btn>
        <Btn kind="primary" onClick={() => setAdding(true)}><Plus size={15} />Add supplier</Btn>
      </>}>

      {/* Gmail status + activity */}
      <Card pad="14px 20px">
        <div className="flex items-center gap-4 flex-wrap">
          <Mail size={18} color={gmail?.connected ? t.TEAL : t.FAINT} />
          <div style={{ flex: 1, minWidth: 240, fontSize: 13 }}>
            {gmail === null ? <Muted>Checking Gmail…</Muted> : gmail.connected
              ? <><Dot color={t.TEAL} />Reading supplier emails from <b style={{ fontWeight: 600 }}>{gmail.gmail_email}</b>
                  <Muted style={{ marginLeft: 8 }}>{running || gmail.is_syncing ? "· checking now" : lastCheck ? `· last checked ${ago(lastCheck)} · checks on its own every 5 minutes` : "· checks on its own every 5 minutes"}</Muted></>
              : <>Gmail isn't connected, so new suppliers aren't being added. <button onClick={() => nav("/profile")} style={{ background: "none", border: "none", color: t.TEAL, fontWeight: 600, cursor: "pointer" }}>Connect it in Profile</button></>}
          </div>
          {gmail?.connected && <Btn onClick={() => setShowLog(v => !v)}><ListChecks size={15} />{showLog ? "Hide activity" : "Activity"}</Btn>}
          {gmail?.connected && <Btn onClick={checkNow} disabled={running}>{running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}{running ? "Checking…" : "Check Gmail now"}</Btn>}
        </div>

        {showLog && gmail?.connected && (
          <div className="grid gap-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.LINE}` }}>
            <div style={{ minWidth: 0 }}>
              <div className="flex items-center gap-2" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
                {running && <Loader2 size={13} className="animate-spin" color={t.TEAL} />}{running ? "Checking now" : "Last check"}
              </div>
              <div style={{ borderRadius: 12, boxShadow: t.IN, padding: "10px 12px", height: 260, overflowY: "auto", fontSize: 12, lineHeight: 1.7, fontVariantNumeric: "tabular-nums" }}
                ref={el => { if (el && running) el.scrollTop = el.scrollHeight; }}>
                {(live.length ? live : (gmail?.latest?.log || []).filter((l: string) => l && !/^\s*✓/.test(l))).map((l: string, i: number) => (
                  <div key={i} style={{ color: /^Saved/.test(l) ? t.TEAL : /^Skipped/.test(l) ? t.FAINT : /^Done/.test(l) ? t.INK : t.MUTED, fontWeight: /^Done/.test(l) ? 600 : 400 }}>{l}</div>))}
                {!live.length && !(gmail?.latest?.log || []).length && <Muted>Nothing yet. Click Check Gmail now to watch a check happen.</Muted>}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="flex items-center justify-between gap-3" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>Recent emails</span>
                <div className="flex gap-3">{([["all", "All"], ["saved", "Supplier emails"], ["skipped", "Skipped"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setLogFilter(k)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, color: logFilter === k ? t.TEAL : t.MUTED, fontWeight: logFilter === k ? 600 : 400 }}>{l}</button>))}</div>
              </div>
              <div style={{ height: 260, overflowY: "auto" }}>
                {recent === null ? <Muted>Loading…</Muted> : !recentShown.length ? <Muted>No emails here yet.</Muted> : recentShown.map((e, i) => {
                  const saved = e.status === "processed", skipped = e.status === "irrelevant";
                  return (
                    <div key={e.gmail_message_id + i} style={{ display: "grid", gridTemplateColumns: "10px minmax(0,1fr) auto", gap: 10, alignItems: "baseline", padding: "7px 0", borderTop: i ? `1px solid ${t.LINE}` : "none" }}>
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: saved ? t.TEAL : skipped ? (t.dark ? "#3E5F5C" : "#C9BDBF") : t.GOLD, display: "inline-block" }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: skipped ? t.MUTED : t.INK }}>{e.subject || e.supplier_name || "Email"}</div>
                        <div style={{ fontSize: 11.5, color: t.FAINT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {[e.sender ? e.sender.split("<")[0].replace(/"/g, "").trim() : "", e.note || (skipped ? "Not a supplier email" : e.supplier_name)].filter(Boolean).join(" · ")}</div>
                      </div>
                      <span style={{ fontSize: 11.5, color: t.FAINT, whiteSpace: "nowrap" }}>{ago(e.created_at)}</span>
                    </div>);
                })}
              </div>
            </div>
          </div>)}
      </Card>

      {err && !data && <Card><Empty title={err}><span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Trying again on its own. Nothing to do on your side</span></Empty></Card>}
      {!data && !err && <Card><Empty title="Loading suppliers"><Loader2 size={16} className="animate-spin inline" /></Empty></Card>}
      {data && <>
        <div className="flex gap-2 flex-wrap items-center">
          {chip("All", "All suppliers")}
          {TYPES.filter(k => counts[k]).map(k => chip(k))}
          {counts["Needs review"] > 0 && <span style={{ width: 1, height: 20, background: t.LINE, margin: "0 4px" }} />}
          {counts["Needs review"] > 0 && chip("Needs review")}
          {counts.Hidden > 0 && chip("Hidden", "Not suppliers")}
        </div>
        {type === "Needs review" && <Muted style={{ marginTop: -10 }}>Contacts with no clear type and no rates. Open each one and choose a type, or mark it as not a supplier to hide it. Nothing is deleted.</Muted>}

        <div className="flex flex-col xl:flex-row items-start gap-6">
          <Card style={{ flex: 1, width: "100%", minWidth: 0 }} pad="6px 14px 0">
            {!shown.length ? <Empty title={rows.length ? "No supplier matches that" : "No suppliers yet"}>{rows.length ? "Try another name, or clear the search" : gmail?.connected ? "Click Check Gmail now and they'll be added from your supplier emails." : "Connect Gmail in Profile, or add one by hand."}</Empty> : <>
              <div ref={tableTop} style={{ maxHeight: "calc(100vh - 330px)", minHeight: 320, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Supplier</th><th style={th}>Type</th><th style={th}>Destination</th><th style={{ ...th, textAlign: "right" }}>Rates</th><th style={{ ...th, textAlign: "right" }}>Emails</th><th style={th}>Last email</th></tr></thead>
                  <tbody>{pageRows.map(r => (
                    <tr key={r.s.id} onClick={() => setSel(r.s.id)} style={{ cursor: "pointer", background: cur?.s.id === r.s.id ? t.ROW : "transparent" }}>
                      <td style={{ ...td, maxWidth: 320 }}><div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.s.name}</div>
                        <div style={{ fontSize: 12, color: t.MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.s.email || r.s.company_name || ""}</div></td>
                      <td style={{ ...td, color: t.MUTED, whiteSpace: "nowrap" }}>{r.type}</td>
                      <td style={{ ...td, color: t.MUTED, maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.s.place || "—"}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.rates ? t.TEAL : t.FAINT, fontWeight: r.rates ? 600 : 400 }}>{r.rates || "—"}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.emails || "—"}</td>
                      <td style={{ ...td, color: t.MUTED, whiteSpace: "nowrap" }}>{r.last ? fmtDate(r.last, { day: "numeric", month: "short", year: "2-digit" }) : r.fromGmail ? "From Gmail" : "Added by hand"}</td>
                    </tr>))}</tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3 flex-wrap" style={{ padding: "10px 6px", borderTop: `1px solid ${t.LINE}`, fontSize: 12.5, color: t.MUTED }}>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{pg * PER_PAGE + 1}–{Math.min(shown.length, (pg + 1) * PER_PAGE)} of {shown.length.toLocaleString("en-IN")}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2">Sort
                    <select value={sort} onChange={e => setSort(e.target.value as any)} style={{ height: 30, borderRadius: 9, border: "none", boxShadow: t.IN, background: t.BG, color: t.INK, padding: "0 8px", fontSize: 12.5 }}>
                      <option value="recent">Latest email first</option><option value="rates">Most rates</option><option value="name">Name A–Z</option></select></label>
                  {pages > 1 && <div className="flex items-center gap-1">
                    <button aria-label="Previous page" disabled={pg === 0} onClick={() => goPage(pg - 1)} style={pagerBtn(t, pg === 0)}><ChevronLeft size={15} /></button>
                    <span style={{ minWidth: 70, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>Page {pg + 1} of {pages}</span>
                    <button aria-label="Next page" disabled={pg >= pages - 1} onClick={() => goPage(pg + 1)} style={pagerBtn(t, pg >= pages - 1)}><ChevronRight size={15} /></button>
                  </div>}
                </div>
              </div>
            </>}
          </Card>

          {cur && (
            <Card style={{ width: "100%", maxWidth: 400, maxHeight: "calc(100vh - 120px)", overflowY: "auto" }} className="xl:sticky xl:top-4" pad="22px">
              <div className="flex items-start justify-between gap-3">
                <div style={{ minWidth: 0 }}><div className="font-serif" style={{ fontSize: 23, overflowWrap: "anywhere" }}>{cur.s.name}</div>
                  <Muted>{cur.type}{cur.s.place ? ` · ${cur.s.place}` : ""}{cur.fromGmail ? " · from Gmail" : ""}</Muted></div>
                <button title="Delete for good" onClick={() => remove(cur.s)} style={{ background: "none", border: "none", color: t.FAINT, cursor: "pointer" }}><Trash2 size={16} /></button>
              </div>
              {(cur.review || cur.hidden) && (
                <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: t.GOLD_BG, fontSize: 12.5, lineHeight: 1.5 }}>
                  {cur.hidden ? "Marked as not a supplier, so it's hidden from the list." : "Is this a supplier? Choose a type below to keep it, or hide it from the list."}
                  <div className="flex gap-2" style={{ marginTop: 10 }}>
                    {cur.hidden ? <Btn onClick={() => setHidden(cur.s, false)} style={{ height: 32 }}>Show it again</Btn>
                      : <Btn onClick={() => setHidden(cur.s, true)} style={{ height: 32 }}><EyeOff size={14} />Not a supplier</Btn>}
                  </div>
                </div>)}
              <div style={{ marginTop: 14 }}>
                <Row t={t} label="Type"><select value={cur.type} onChange={e => save(cur.s, { supplier_type: e.target.value })}
                  style={{ height: 32, borderRadius: 9, border: "none", boxShadow: t.IN, background: t.BG, color: t.INK, padding: "0 8px", fontSize: 12.5, width: "100%" }}>{TYPES.map(x => <option key={x}>{x}</option>)}</select></Row>
                <Edit t={t} label="Destination" value={cur.s.place || ""} onSave={v => save(cur.s, { place: v })} />
                <Edit t={t} label="Contact" value={cur.s.designation || ""} onSave={v => save(cur.s, { designation: v })} />
                <Edit t={t} label="Email" value={cur.s.email || ""} onSave={v => save(cur.s, { email: v })} link={cur.s.email ? `mailto:${cur.s.email}` : undefined} />
                <Edit t={t} label="Phone" value={cur.s.phone || ""} onSave={v => save(cur.s, { phone: v })} />
              </div>
              <div className="flex gap-5" style={{ margin: "20px 0 6px", borderBottom: `1px solid ${t.LINE}` }}>
                {([["hotels", "Hotels", Building2], ["activities", "Activities", MapIcon], ["transfers", "Transfers", Car]] as const).map(([k, l, I]) => (
                  <button key={k} onClick={() => setTab(k)} className="flex items-center gap-1.5" style={{ background: "none", border: "none", borderRadius: 0, cursor: "pointer", fontSize: 12.5, padding: "0 0 8px", marginBottom: -1,
                    color: tab === k ? t.TEAL : t.MUTED, fontWeight: tab === k ? 600 : 400, borderBottom: tab === k ? "2px solid #B8913E" : "2px solid transparent" }}><I size={13} />{l} · {ratesOf(k).length}</button>))}
              </div>
              {ratesOf(tab).length ? ratesOf(tab).slice(0, 30).map((r, i) => (
                <div key={r.id || i} style={{ padding: "9px 0", borderTop: i ? `1px solid ${t.LINE}` : "none", fontSize: 12.5 }}>
                  <div className="flex justify-between gap-3"><b style={{ fontWeight: 500 }}>{r.hotel_name || r.activity_name || [r.transfer_type, r.route].filter(Boolean).join(" · ")}</b>
                    <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{r.currency} {Number(r.price_per_night || r.price || 0).toLocaleString("en-IN")}{r.price_per_night ? "/night" : r.price_basis ? ` ${String(r.price_basis).replace("per_", "per ")}` : ""}</span></div>
                  <Muted>{[r.destination, r.room_type, r.meal_plan, r.vehicle_type, r.valid_from && `${fmtDate(r.valid_from, { day: "numeric", month: "short" })} – ${fmtDate(r.valid_to, { day: "numeric", month: "short", year: "2-digit" })}`].filter(Boolean).join(" · ")}</Muted>
                </div>)) : <Muted style={{ display: "block", padding: "10px 0" }}>No {tab} rates from this supplier yet. They appear when a rate email comes in.</Muted>}
              {cur.emails > 0 && <div style={{ marginTop: 16 }}><Muted>{cur.emails} email{cur.emails === 1 ? "" : "s"} read · last on {fmtDate(cur.last)}</Muted></div>}
              {cur.s.email && <a href={`https://mail.google.com/mail/u/0/#search/from%3A${encodeURIComponent(cur.s.email)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1" style={{ fontSize: 12.5, color: t.TEAL, fontWeight: 600, marginTop: 6 }}><ExternalLink size={13} />Open their emails in Gmail</a>}
            </Card>)}
        </div>
      </>}
      {adding && <AddSupplier onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </Page>
  );
}

const pagerBtn = (t: any, off: boolean): CSSProperties => ({ width: 30, height: 30, borderRadius: 9, border: "none", background: t.BG, boxShadow: off ? "none" : t.BTN, color: off ? t.FAINT : t.TEAL, cursor: off ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" });

function Row({ t, label, children }: any) {
  return <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10, alignItems: "center", padding: "5px 0", fontSize: 12.5 }}><span style={{ color: t.FAINT }}>{label}</span>{children}</div>;
}
function Edit({ t, label, value, onSave, link }: { t: any; label: string; value: string; onSave: (v: string) => void; link?: string }) {
  const [v, setV] = useState(value); useEffect(() => setV(value), [value]);
  return <Row t={t} label={label}><div className="flex items-center gap-2">
    <input value={v} onChange={e => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()} placeholder="—"
      style={{ flex: 1, minWidth: 0, height: 30, border: "none", background: "transparent", color: t.INK, fontSize: 12.5, outline: "none", borderBottom: `1px dashed ${t.LINE}` }} />
    {link && v && <a href={link} style={{ color: t.TEAL }}><Mail size={14} /></a>}</div></Row>;
}
function AddSupplier({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [f, setF] = useState({ name: "", supplier_type: "DMC", place: "", email: "", phone: "", designation: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.name.trim()) { setErr("Add the supplier's name"); return; }
    setBusy(true);
    try { await api("/suppliers", { method: "POST", body: JSON.stringify({ name: f.name.trim(), designation: f.designation, company: "", place: f.place, phone: f.phone, email: f.email, supplier_type: f.supplier_type, event: "", url: "" }) }); onSaved(); }
    catch (e: any) { setErr(e?.message || "Could not save"); setBusy(false); }
  };
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(11,59,61,.35)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Card style={{ width: 440 }} pad="24px">
        <div className="font-serif" style={{ fontSize: 22, marginBottom: 14 }}>Add supplier</div>
        {([["Name", "name"], ["Destination", "place"], ["Contact person", "designation"], ["Email", "email"], ["Phone", "phone"]] as const).map(([l, k]) => (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "center", marginBottom: 10, fontSize: 13 }}><span style={{ color: t.MUTED }}>{l}</span><Field value={f[k]} onChange={v => setF(p => ({ ...p, [k]: v }))} /></div>))}
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "center", marginBottom: 10, fontSize: 13 }}><span style={{ color: t.MUTED }}>Type</span>
          <select value={f.supplier_type} onChange={e => setF(p => ({ ...p, supplier_type: e.target.value }))} style={{ height: 38, borderRadius: 12, border: "none", boxShadow: t.IN, background: t.BG, color: t.INK, padding: "0 10px" }}>{TYPES.map(x => <option key={x}>{x}</option>)}</select></div>
        {err && <div style={{ color: t.RED, fontSize: 12 }}>{err}</div>}
        <div className="flex justify-end gap-3" style={{ marginTop: 16 }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save supplier"}</Btn></div>
      </Card>
    </div>);
}

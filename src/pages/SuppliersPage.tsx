/**
 * Suppliers — every DMC, hotel and partner, found automatically in Gmail.
 * The backend reads supplier emails (rates, contracts, confirmations), adds the company here with its
 * type and destination, and files any rates it finds. Rates and emails show per supplier.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, RefreshCw, Plus, Loader2, Upload, Building2, Car, Map as MapIcon, Trash2, ExternalLink } from "lucide-react";
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

export default function SuppliersPage() {
  const t = useT();
  const nav = useNavigate();
  const [data, setData] = useState<{ suppliers: Supplier[]; hotels: Rate[]; activities: Rate[]; transfers: Rate[]; emails: Rate[] } | null>(null);
  const [err, setErr] = useState("");
  const [gmail, setGmail] = useState<any>(null);
  const [sync, setSync] = useState<string>("");
  const [q, setQ] = useState(""); const [type, setType] = useState("All");
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"hotels" | "activities" | "transfers">("hotels");
  const [adding, setAdding] = useState(false);
  const poll = useRef<any>(null);

  const load = async () => {
    setErr("");
    try { const d = await api("/gmail/suppliers-overview"); setData({ suppliers: d.suppliers || [], hotels: d.hotels || [], activities: d.activities || [], transfers: d.transfers || [], emails: d.emails || [] }); }
    catch (e: any) { setErr(e?.message?.includes("Failed to fetch") ? "The server is waking up. This takes up to a minute on the free plan." : e?.message || "Could not load suppliers"); setTimeout(load, 15000); }
  };
  const loadGmail = async () => { try { setGmail(await api("/gmail/status")); } catch { setGmail({ connected: false }); } };
  useEffect(() => {
    load(); loadGmail();
    api("/gmail/heartbeat", { method: "POST" }).catch(() => {}); // checks Gmail if it's been 10+ minutes
    const i = setInterval(() => { api("/gmail/heartbeat", { method: "POST" }).catch(() => {}); load(); }, 10 * 60000);
    return () => { clearInterval(i); clearInterval(poll.current); };
  }, []);

  const checkNow = async () => {
    setSync("Starting…");
    try {
      const { job_id } = await api("/gmail/sync-now?max_emails=150", { method: "POST" });
      clearInterval(poll.current);
      poll.current = setInterval(async () => {
        const s = await api(`/gmail/sync/status/${job_id}`).catch(() => null);
        if (!s) return;
        setSync(s.status === "running" ? "Reading emails…" : s.progress || "");
        if (s.status !== "running") { clearInterval(poll.current); load(); loadGmail(); setTimeout(() => setSync(""), 8000); }
      }, 3000);
    } catch (e: any) { setSync(e?.message || "Could not start"); }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const count = (list: Rate[], s: Supplier) => list.filter(r => norm(r.supplier_name) === norm(s.name) || (s.company_name && norm(r.supplier_name) === norm(s.company_name))).length;
    return data.suppliers.map(s => {
      const mails = data.emails.filter(e => norm(e.supplier_name) === norm(s.name));
      return { s, type: typeOf(s), rates: count(data.hotels, s) + count(data.activities, s) + count(data.transfers, s), emails: mails.length, last: mails[0]?.created_at || null,
        fromGmail: !!mails.length || /gmail/i.test(s.internal_notes || "") };
    }).sort((a, b) => (b.last || b.s.created_at || "").localeCompare(a.last || a.s.created_at || ""));
  }, [data]);
  const counts = useMemo(() => { const m: Record<string, number> = { All: rows.length }; rows.forEach(r => { m[r.type] = (m[r.type] || 0) + 1; }); return m; }, [rows]);
  const shown = rows.filter(r => (type === "All" || r.type === type) && (!q || [r.s.name, r.s.company_name, r.s.place, r.s.email].some(v => norm(v).includes(norm(q)))));
  const cur = rows.find(r => r.s.id === sel) || shown[0] || null;
  const ratesOf = (k: "hotels" | "activities" | "transfers") => !cur || !data ? [] : data[k].filter(r => norm(r.supplier_name) === norm(cur.s.name) || (cur.s.company_name && norm(r.supplier_name) === norm(cur.s.company_name)));

  const save = async (s: Supplier, patch: Partial<Supplier>) => {
    const n = { ...s, ...patch };
    setData(d => d && { ...d, suppliers: d.suppliers.map(x => x.id === s.id ? n : x) });
    await api(`/suppliers/${s.id}`, { method: "PUT", body: JSON.stringify({ name: n.name, designation: n.designation || "", company: n.company_name || "", place: n.place || "", phone: n.phone || "", email: n.email || "", supplier_type: n.supplier_type || "", event: n.internal_notes || "", url: n.raw_notion_data?.url || "" }) }).catch(() => {});
  };
  const remove = async (s: Supplier) => {
    if (!confirm(`Remove ${s.name} from Suppliers?`)) return;
    setData(d => d && { ...d, suppliers: d.suppliers.filter(x => x.id !== s.id) }); setSel(null);
    await api(`/suppliers/${s.id}`, { method: "DELETE" }).catch(() => {});
  };

  const th = { textAlign: "left" as const, fontSize: 11.5, color: t.FAINT, fontWeight: 500, padding: "8px 10px", borderBottom: `1px solid ${t.LINE}` };
  const td = { padding: "10px", fontSize: 13, borderTop: `1px solid ${t.LINE}` };
  const lastCheck = gmail?.latest?.last_run;

  return (
    <Page title="Suppliers" sub="DMCs, hotels and partners, added automatically from Gmail"
      actions={<>
        <Field value={q} onChange={setQ} placeholder="Search name, place or email" style={{ width: 250 }} />
        <Btn onClick={() => nav("/suppliers/import")} title="CSV import, Notion import, business cards"><Upload size={15} />Import</Btn>
        <Btn kind="primary" onClick={() => setAdding(true)}><Plus size={15} />Add supplier</Btn>
      </>}>
      <Card pad="14px 20px">
        <div className="flex items-center gap-4 flex-wrap">
          <Mail size={18} color={gmail?.connected ? t.TEAL : t.FAINT} />
          <div style={{ flex: 1, minWidth: 220, fontSize: 13 }}>
            {gmail === null ? <Muted>Checking Gmail…</Muted> : gmail.connected
              ? <><Dot color={t.TEAL} />Reading supplier emails from <b style={{ fontWeight: 600 }}>{gmail.gmail_email}</b>
                  <Muted style={{ marginLeft: 8 }}>{gmail.is_syncing ? "· checking now" : lastCheck ? `· last checked ${fmtDate(lastCheck, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "· checks every 10 minutes while the dashboard is open"}</Muted></>
              : <>Gmail isn't connected, so new suppliers aren't being added. <button onClick={() => nav("/profile")} style={{ background: "none", border: "none", color: t.TEAL, fontWeight: 600, cursor: "pointer" }}>Connect it in Profile</button></>}
          </div>
          {sync && <Muted>{sync}</Muted>}
          {gmail?.connected && <Btn onClick={checkNow} disabled={!!sync && !/Done|error|Could/i.test(sync)}>{sync && !/Done|error|Could/i.test(sync) ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}Check Gmail now</Btn>}
        </div>
      </Card>

      {err && !data && <Card><Empty title={err}><Loader2 size={16} className="animate-spin inline" /></Empty></Card>}
      {data && <>
        <div className="flex gap-2 flex-wrap">
          {["All", ...TYPES].filter(k => k === "All" || counts[k]).map(k => (
            <button key={k} onClick={() => setType(k)} style={{ height: 32, padding: "0 14px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
              background: type === k ? (t.dark ? "#1F6F72" : "#13585B") : t.BG, color: type === k ? "#fff" : t.MUTED, boxShadow: type === k ? "none" : t.BTN }}>{k === "All" ? "All suppliers" : k} · {counts[k] || 0}</button>))}
        </div>
        <div className="flex flex-col xl:flex-row items-start gap-6">
          <Card style={{ flex: 1, width: "100%" }} pad="10px 18px 8px">
            {!shown.length ? <Empty title={rows.length ? "No supplier matches that" : "No suppliers yet"}>{rows.length ? "" : gmail?.connected ? "Click Check Gmail now and they'll be added from your supplier emails." : "Connect Gmail in Profile, or add one by hand."}</Empty> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Supplier</th><th style={th}>Type</th><th style={th}>Destination</th><th style={{ ...th, textAlign: "right" }}>Rates</th><th style={{ ...th, textAlign: "right" }}>Emails</th><th style={th}>Last email</th></tr></thead>
                  <tbody>{shown.map(r => (
                    <tr key={r.s.id} onClick={() => setSel(r.s.id)} style={{ cursor: "pointer", background: cur?.s.id === r.s.id ? t.ROW : "transparent" }}>
                      <td style={td}><div style={{ fontWeight: 500 }}>{r.s.name}</div><Muted>{r.s.email || r.s.company_name || ""}</Muted></td>
                      <td style={{ ...td, color: t.MUTED }}>{r.type}</td>
                      <td style={{ ...td, color: t.MUTED }}>{r.s.place || "—"}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.rates || "—"}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.emails || "—"}</td>
                      <td style={{ ...td, color: t.MUTED, whiteSpace: "nowrap" }}>{r.last ? fmtDate(r.last, { day: "numeric", month: "short", year: "2-digit" }) : r.fromGmail ? "Gmail" : "Added by hand"}</td>
                    </tr>))}</tbody>
                </table>
                <div style={{ padding: "10px", fontSize: 12, color: t.MUTED }}>{shown.length} of {rows.length} suppliers</div>
              </div>)}
          </Card>

          {cur && (
            <Card style={{ width: "100%", maxWidth: 400 }} className="xl:sticky xl:top-4" pad="22px">
              <div className="flex items-start justify-between gap-3">
                <div style={{ minWidth: 0 }}><div className="font-serif" style={{ fontSize: 23 }}>{cur.s.name}</div>
                  <Muted>{cur.type}{cur.s.place ? ` · ${cur.s.place}` : ""}{cur.fromGmail ? " · from Gmail" : ""}</Muted></div>
                <button title="Remove" onClick={() => remove(cur.s)} style={{ background: "none", border: "none", color: t.FAINT, cursor: "pointer" }}><Trash2 size={16} /></button>
              </div>
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
              {cur.emails > 0 && <div style={{ marginTop: 16 }}><Muted>{cur.emails} email{cur.emails === 1 ? "" : "s"} read · last on {fmtDate(cur.last)}</Muted>
                {cur.s.email && <a href={`https://mail.google.com/mail/u/0/#search/from%3A${encodeURIComponent(cur.s.email)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1" style={{ fontSize: 12.5, color: t.TEAL, fontWeight: 600, marginTop: 6 }}><ExternalLink size={13} />Open their emails in Gmail</a>}</div>}
            </Card>)}
        </div>
      </>}
      {adding && <AddSupplier onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </Page>
  );
}

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

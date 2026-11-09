/**
 * Active Trips — every booked trip on one board, from booking to welcome back.
 * Trips move between columns on their own as the dates pass. Data: trips (+ vouchers when that table exists).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Page, Card, Btn, Field, Muted, Empty, useT, fmtDate, daysBetween } from "@/components/ch/kit";

type Trip = { id: string; trip_id: string | null; name: string; client: string | null; status: string | null; start_date: string | null; end_date: string | null; places: string | null; project_lead: string | null; budget: string | null };
type Col = "Preparing" | "Ready to go" | "Travelling now" | "Just back";
const COLS: Col[] = ["Preparing", "Ready to go", "Travelling now", "Just back"];
const norm = (s?: string | null) => (s || "").trim().toLowerCase();

export default function ActiveTrips() {
  const t = useT();
  const nav = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vouchers, setVouchers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("trips").select("id, trip_id, name, client, status, start_date, end_date, places, project_lead, budget").order("start_date", { ascending: true });
    setTrips((data as Trip[]) || []);
    const v = await supabase.from("vouchers").select("client, trip_name");
    if (!v.error && v.data) {
      const m: Record<string, number> = {};
      (v.data as any[]).forEach(r => { const k = norm(r.trip_name || r.client); m[k] = (m[k] || 0) + 1; });
      setVouchers(m);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const colOf = (x: Trip): Col | null => {
    const st = norm(x.status);
    if (st === "cancelled" || st === "enquiry") return null;
    const s = x.start_date ? new Date(x.start_date) : null;
    const e = x.end_date ? new Date(x.end_date) : s;
    if (s && e && s <= today && today <= e) return "Travelling now";
    if (e && e < today) return daysBetween(e, today) <= 30 ? "Just back" : null;
    if (s && daysBetween(today, s) <= 14) return "Ready to go";
    return "Preparing";
  };
  const by: Record<Col, Trip[]> = { "Preparing": [], "Ready to go": [], "Travelling now": [], "Just back": [] };
  trips.forEach(x => { const c = colOf(x); if (c) by[c].push(x); });
  by["Just back"].reverse();
  const active = COLS.reduce((n, c) => n + by[c].length, 0);
  const soon = by["Ready to go"].length;

  const when = (x: Trip, c: Col) => {
    const s = x.start_date ? new Date(x.start_date) : null; const e = x.end_date ? new Date(x.end_date) : null;
    if (c === "Travelling now" && s) { const len = e ? daysBetween(s, e) + 1 : 0; const d = daysBetween(s, today) + 1; return len ? `day ${d} of ${len}` : `day ${d}`; }
    if (c === "Just back" && e) { const d = daysBetween(e, today); return d === 0 ? "back today" : `${d} day${d === 1 ? "" : "s"} ago`; }
    if (s) { const d = daysBetween(today, s); return d === 0 ? "leaves today" : `in ${d} day${d === 1 ? "" : "s"}`; }
    return "no dates yet";
  };
  const progress = (x: Trip, c: Col) => {
    const s = x.start_date ? new Date(x.start_date) : null; const e = x.end_date ? new Date(x.end_date) : null;
    if (c === "Travelling now" && s && e) return Math.min(100, Math.round(((daysBetween(s, today) + 1) / (daysBetween(s, e) + 1)) * 100));
    return null;
  };
  const nextStep = (x: Trip, c: Col) => {
    const n = vouchers[norm(x.name)] || vouchers[norm(x.client)] || 0;
    if (c === "Preparing" || c === "Ready to go") return n ? { text: `${n} voucher${n === 1 ? "" : "s"} made`, bad: false } : { text: "No vouchers yet", bad: c === "Ready to go" };
    if (c === "Travelling now") return { text: x.project_lead ? `Looked after by ${x.project_lead}` : "Travelling", bad: false };
    return { text: "Ask for feedback", bad: false };
  };

  return (
    <Page title="Active Trips"
      sub={loading ? "Loading trips" : `${active} booked trip${active === 1 ? "" : "s"} · ${soon} leave in the next 14 days · ${by["Travelling now"].length} travelling now`}
      actions={<Btn kind="primary" onClick={() => setAdding(true)}><Plus size={15} />New trip</Btn>}>
      {loading ? <Card><Empty title="Loading trips"><Loader2 className="animate-spin inline" size={16} /></Empty></Card> :
       !active ? <Card><Empty title="No booked trips right now" action={<Btn kind="primary" onClick={() => setAdding(true)}>Add a trip</Btn>}>Trips with status Confirmed or Ongoing and upcoming dates show up here.</Empty></Card> : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
          {COLS.map(c => (
            <div key={c} className="flex flex-col gap-3 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 600, padding: "0 4px 2px" }}>{c} <span style={{ color: t.FAINT, fontWeight: 400 }}>{by[c].length}</span></div>
              {by[c].map(x => {
                const p = progress(x, c); const ns = nextStep(x, c);
                return (
                  <Card key={x.id} pad="14px 16px" style={{ cursor: "pointer" }}
                    onClick={() => nav(`/vouchers?client=${encodeURIComponent(x.client || x.name)}&trip=${encodeURIComponent(x.name)}`)}>
                    <div className="flex items-baseline justify-between gap-2">
                      <b style={{ fontSize: 13.5, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.client || x.name}</b>
                      <span style={{ fontSize: 12, color: t.FAINT, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{when(x, c)}</span>
                    </div>
                    <Muted>{[x.places || (x.client ? x.name : ""), x.start_date ? `${fmtDate(x.start_date, { day: "numeric", month: "short" })}${x.end_date ? ` – ${fmtDate(x.end_date, { day: "numeric", month: "short" })}` : ""}` : ""].filter(Boolean).join(" · ")}</Muted>
                    {p !== null ? <div style={{ height: 4, background: t.dark ? "#16434A" : "#E8DADB", borderRadius: 4, margin: "10px 0 6px" }}><div style={{ width: `${p}%`, height: 4, borderRadius: 4, background: t.TEAL }} /></div> : <div style={{ height: 8 }} />}
                    <div style={{ fontSize: 12, color: ns.bad ? t.RED : t.MUTED }}>{ns.text}</div>
                  </Card>);
              })}
            </div>))}
        </div>)}
      <Muted style={{ padding: "2px 4px", lineHeight: 1.6 }}>Trips move between columns on their own as the dates pass. Click a trip to open its trip folder in Voucher Generator.</Muted>
      {adding && <NewTrip onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </Page>
  );
}

function NewTrip({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [f, setF] = useState({ name: "", client: "", places: "", start_date: "", end_date: "", project_lead: "", status: "Confirmed" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF(p => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.name.trim() || !f.client.trim()) { setErr("Add the trip name and the client"); return; }
    setBusy(true);
    const { error } = await supabase.from("trips").insert({ name: f.name.trim(), client: f.client.trim(), places: f.places.trim() || null,
      start_date: f.start_date || null, end_date: f.end_date || null, project_lead: f.project_lead.trim() || null, status: f.status });
    if (error) { setErr(error.message); setBusy(false); return; }
    onSaved();
  };
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(11,59,61,.35)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Card style={{ width: 460 }} pad="24px">
        <div className="font-serif" style={{ fontSize: 22, marginBottom: 14 }}>New trip</div>
        {([["Trip name", "name", "text"], ["Client", "client", "text"], ["Places", "places", "text"], ["Starts", "start_date", "date"], ["Ends", "end_date", "date"], ["Looked after by", "project_lead", "text"]] as const).map(([l, k, ty]) => (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "center", marginBottom: 10, fontSize: 13 }}>
            <span style={{ color: t.MUTED }}>{l}</span><Field type={ty} value={f[k]} onChange={set(k)} /></div>))}
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "center", marginBottom: 10, fontSize: 13 }}>
          <span style={{ color: t.MUTED }}>Status</span>
          <select value={f.status} onChange={e => set("status")(e.target.value)} style={{ height: 38, borderRadius: 12, border: "none", boxShadow: t.IN, background: t.BG, color: t.INK, padding: "0 10px" }}>
            {["Confirmed", "Ongoing", "Enquiry", "Complete", "Cancelled"].map(s => <option key={s}>{s}</option>)}</select>
        </div>
        {err && <div style={{ color: t.RED, fontSize: 12 }}>{err}</div>}
        <div className="flex justify-end gap-3" style={{ marginTop: 16 }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save trip"}</Btn></div>
      </Card>
    </div>
  );
}

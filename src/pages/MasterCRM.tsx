/**
 * Master CRM — every client in one table, Notion-style.
 * Click a client to see their details, every trip they've taken or booked, and their trip folders.
 * Data: contacts (+ contact_emails, contact_phones), bookings, trips.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Map as MapIcon, FolderOpen, Plus, Loader2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Page, Card, Btn, Field, Muted, Dot, Empty, useT, inr, fmtDate } from "@/components/ch/kit";

type Contact = {
  id: string; name: string; stage: string; source: string | null; met_where: string | null; destination: string | null;
  country: string | null; budget: string | null; contact_type: string | null; working_at: string | null; designation: string | null;
  created_at: string; last_contacted_at: string | null; email: string; phone: string;
};
type Trip = { id: string; name: string; client: string | null; status: string | null; start_date: string | null; end_date: string | null; places: string | null; budget: string | null };
type Booking = { contact_id: string; total_booking_value: number | null };

const STAGES = ["New", "Contacted", "Qualified", "Proposal", "Booked"];
type Status = "Lead" | "Quoted" | "Booked" | "Travelled";
const norm = (s?: string | null) => (s || "").trim().toLowerCase();

export default function MasterCRM() {
  const t = useT();
  const nav = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"all" | Status>("all");
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(0);
  const PER = 15;

  const load = async () => {
    setLoading(true);
    const [c, tr, b] = await Promise.all([
      supabase.from("contacts").select(`id, name, stage, source, met_where, destination, country, budget, contact_type, working_at, designation,
        created_at, last_contacted_at, deleted_at, contact_emails(email), contact_phones(phone_number)`).order("created_at", { ascending: false }),
      supabase.from("trips").select("id, name, client, status, start_date, end_date, places, budget").order("start_date", { ascending: false }),
      supabase.from("bookings").select("contact_id, total_booking_value"),
    ]);
    setContacts(((c.data as any[]) || []).filter(r => !r.deleted_at).map(r => ({
      ...r, name: r.name || "Unnamed", stage: r.stage || "New",
      email: r.contact_emails?.[0]?.email || "", phone: r.contact_phones?.[0]?.phone_number || "",
    })));
    setTrips((tr.data as Trip[]) || []);
    setBookings((b.data as Booking[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const today = new Date();
  // a trip belongs to a client when the names match; partial matches only for full names (so "Mr" or "Shah" don't match everyone)
  const sameName = (a: string, b: string) => !!a && !!b && (a === b || (b.length >= 6 && b.includes(" ") && a.includes(b)) || (a.length >= 6 && a.includes(" ") && b.includes(a)));
  const tripsOf = (c: Contact) => trips.filter(x => sameName(norm(x.client), norm(c.name)));
  const spentOf = (c: Contact) => bookings.filter(b => b.contact_id === c.id).reduce((s, b) => s + Number(b.total_booking_value || 0), 0);
  const statusOf = (c: Contact): Status => {
    const ts = tripsOf(c);
    if (ts.some(x => x.end_date && new Date(x.end_date) >= today && norm(x.status) !== "cancelled")) return "Booked";
    if (ts.some(x => x.end_date && new Date(x.end_date) < today) || (norm(c.stage) === "booked" && ts.length)) return "Travelled";
    if (norm(c.stage) === "booked") return "Booked";
    if (norm(c.stage) === "proposal") return "Quoted";
    return "Lead";
  };
  const COLOR: Record<Status, string> = { Lead: t.dark ? "#6E8784" : "#C9B8BA", Quoted: "#D4AF5A", Booked: t.TEAL, Travelled: t.dark ? "#3E7A76" : "#7FA9A7" };

  const rows = useMemo(() => contacts.map(c => ({ c, status: statusOf(c), trips: tripsOf(c), spent: spentOf(c) })), [contacts, trips, bookings]);
  const counts = { all: rows.length, Lead: 0, Quoted: 0, Booked: 0, Travelled: 0 } as Record<string, number>;
  rows.forEach(r => counts[r.status]++);
  const filtered = rows.filter(r => (view === "all" || r.status === view) &&
    (!q || [r.c.name, r.c.phone, r.c.email, r.c.destination, ...r.trips.map(x => x.name)].some(v => norm(v).includes(norm(q)))));
  const shown = filtered.slice(page * PER, page * PER + PER);
  const current = rows.find(r => r.c.id === sel) || shown[0] || null;

  const setStage = async (id: string, stage: string) => {
    setContacts(cs => cs.map(c => c.id === id ? { ...c, stage } : c));
    await supabase.from("contacts").update({ stage }).eq("id", id);
  };

  const views: { key: "all" | Status; label: string }[] = [
    { key: "all", label: "All clients" }, { key: "Lead", label: "Leads" }, { key: "Quoted", label: "Quoted" },
    { key: "Booked", label: "Booked" }, { key: "Travelled", label: "Past travellers" }];
  const th = { textAlign: "left" as const, fontSize: 11.5, color: t.FAINT, fontWeight: 500, padding: "8px 10px", borderBottom: `1px solid ${t.LINE}` };
  const td = { padding: "10px", fontSize: 13, borderTop: `1px solid ${t.LINE}` };

  return (
    <Page title="Master CRM" sub="Every client, their trips and documents in one place"
      actions={<>
        <Field value={q} onChange={v => { setQ(v); setPage(0); }} placeholder="Search name, phone or trip" style={{ width: 260 }} />
        <Btn onClick={() => nav("/leads/import")} title="CSV import and business card scanning"><Upload size={15} />Import</Btn>
        <Btn kind="primary" onClick={() => setAdding(true)}><Plus size={15} />New client</Btn>
      </>}>
      <div className="flex flex-col xl:flex-row items-start gap-6">
        <Card style={{ flex: 1, width: "100%" }} pad="16px 18px 8px">
          <div className="flex gap-6 flex-wrap" style={{ borderBottom: `1px solid ${t.LINE}`, padding: "0 10px", marginBottom: 6 }}>
            {views.map(v => (
              <button key={v.key} onClick={() => { setView(v.key); setPage(0); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "0 0 10px", marginBottom: -1,
                  color: view === v.key ? t.TEAL : t.MUTED, fontWeight: view === v.key ? 600 : 400, borderRadius: 0, borderBottom: view === v.key ? "2px solid #B8913E" : "2px solid transparent" }}>
                {v.label} · {counts[v.key]}
              </button>))}
          </div>
          {loading ? <Empty title="Loading clients"><Loader2 className="animate-spin inline" size={16} /></Empty> :
           !filtered.length ? <Empty title={q ? "No client matches that search" : "No clients yet"} action={!q && <Btn kind="primary" onClick={() => setAdding(true)}>Add the first client</Btn>} /> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Name</th><th style={th}>Status</th><th style={{ ...th, textAlign: "right" }}>Trips</th><th style={th}>Latest trip</th><th style={{ ...th, textAlign: "right" }}>Spent</th><th style={th}>Came from</th></tr></thead>
                <tbody>
                  {shown.map(r => {
                    const latest = r.trips[0];
                    const on = current?.c.id === r.c.id;
                    return (
                      <tr key={r.c.id} onClick={() => setSel(r.c.id)} style={{ cursor: "pointer", background: on ? t.ROW : "transparent" }}>
                        <td style={{ ...td, fontWeight: 500 }}>{r.c.name}</td>
                        <td style={td}><span style={{ fontSize: 12, color: t.MUTED }}><Dot color={COLOR[r.status]} />{r.status}</span></td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.trips.length}</td>
                        <td style={{ ...td, color: t.MUTED }}>{latest ? `${latest.places || latest.name} · ${fmtDate(latest.start_date, { month: "short", year: "numeric" })}` : "—"}</td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inr(r.spent)}</td>
                        <td style={{ ...td, color: t.MUTED }}>{r.c.source || r.c.met_where || "—"}</td>
                      </tr>);
                  })}
                </tbody>
              </table>
              <div className="flex items-center justify-between" style={{ padding: "12px 10px 6px", fontSize: 12, color: t.MUTED }}>
                <span>Showing {page * PER + 1}–{Math.min(filtered.length, page * PER + PER)} of {filtered.length}</span>
                <span className="flex gap-4">
                  {page > 0 && <button onClick={() => setPage(p => p - 1)} style={{ background: "none", border: "none", color: t.TEAL, fontWeight: 600, cursor: "pointer" }}>Previous</button>}
                  {(page + 1) * PER < filtered.length && <button onClick={() => setPage(p => p + 1)} style={{ background: "none", border: "none", color: t.TEAL, fontWeight: 600, cursor: "pointer" }}>Next</button>}
                </span>
              </div>
            </div>)}
        </Card>

        {current && (
          <Card style={{ width: "100%", maxWidth: 380 }} className="xl:sticky xl:top-4" pad="22px">
            <div className="flex items-start justify-between gap-3">
              <div style={{ minWidth: 0 }}>
                <div className="font-serif" style={{ fontSize: 24 }}>{current.c.name}</div>
                <Muted>Client since {fmtDate(current.c.created_at, { year: "numeric" })} · {current.trips.length} trip{current.trips.length === 1 ? "" : "s"}{current.spent ? ` · ${inr(current.spent)} spent` : ""}</Muted>
              </div>
              <span style={{ fontSize: 12, color: t.MUTED, whiteSpace: "nowrap" }}><Dot color={COLOR[current.status]} />{current.status}</span>
            </div>
            <div style={{ marginTop: 14 }}>
              {[["Phone", current.c.phone], ["Email", current.c.email], ["Type", current.c.contact_type],
                ["Works at", [current.c.designation, current.c.working_at].filter(Boolean).join(", ")],
                ["Interested in", [current.c.destination, current.c.country].filter(Boolean).join(", ")], ["Budget", current.c.budget],
                ["Came from", [current.c.source, current.c.met_where].filter(Boolean).join(" · ")]]
                .filter(([, v]) => v).map(([k, v]) => (
                  <div key={k as string} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, padding: "6px 0", fontSize: 12.5 }}>
                    <span style={{ color: t.FAINT }}>{k}</span><div style={{ minWidth: 0, overflowWrap: "anywhere" }}>{v}</div></div>))}
              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, padding: "6px 0", fontSize: 12.5, alignItems: "center" }}>
                <span style={{ color: t.FAINT }}>Stage</span>
                <select value={current.c.stage} onChange={e => setStage(current.c.id, e.target.value)}
                  style={{ height: 30, borderRadius: 9, border: "none", boxShadow: t.IN, background: t.BG, color: t.INK, padding: "0 8px", fontSize: 12.5 }}>
                  {[...new Set([...STAGES, current.c.stage])].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ color: t.MUTED, fontSize: 12, margin: "20px 0 2px" }}>Trips</div>
            {current.trips.length ? current.trips.map((x, i) => (
              <div key={x.id} className="flex items-center gap-3" style={{ padding: "10px 0", borderTop: i ? `1px solid ${t.LINE}` : "none" }}>
                <MapIcon size={16} color={t.MUTED} strokeWidth={1.5} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{x.name}</div>
                  <Muted>{fmtDate(x.start_date)}{x.end_date ? ` – ${fmtDate(x.end_date)}` : ""} · {x.end_date && new Date(x.end_date) < today ? "Travelled" : x.status || "Upcoming"}</Muted>
                </div>
                {x.budget && <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{x.budget}</span>}
              </div>)) : <Muted>No trips yet</Muted>}
            <div style={{ color: t.MUTED, fontSize: 12, margin: "20px 0 2px" }}>Documents</div>
            {current.trips.length ? current.trips.map((x, i) => (
              <button key={x.id} onClick={() => nav(`/vouchers?client=${encodeURIComponent(current.c.name)}&trip=${encodeURIComponent(x.name)}`)}
                className="flex items-center gap-3 w-full text-left" style={{ padding: "10px 0", borderTop: i ? `1px solid ${t.LINE}` : "none", background: "none", border: "none", cursor: "pointer", color: t.INK }}>
                <FolderOpen size={16} color={t.MUTED} strokeWidth={1.5} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 13 }}>{x.name} trip folder</div><Muted>Vouchers, itinerary and supplier files</Muted></div>
              </button>)) : <Muted>Trip folders appear here once a trip is made in Voucher Generator</Muted>}
          </Card>)}
      </div>
      {adding && <AddClient onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </Page>
  );
}

function AddClient({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [f, setF] = useState({ name: "", phone: "", email: "", destination: "", source: "", stage: "New" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (v: string) => setF(p => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) { setErr("Add a name"); return; }
    setBusy(true); setErr("");
    const { data, error } = await supabase.from("contacts").insert({ name: f.name.trim(), destination: f.destination.trim() || null, source: f.source.trim() || null, stage: f.stage, last_contacted_at: new Date().toISOString() }).select("id").single();
    if (error) { setErr(error.message); setBusy(false); return; }
    const ops: any[] = [];
    if (f.email.trim()) ops.push(supabase.from("contact_emails").insert({ contact_id: data.id, email: f.email.trim(), is_primary: true }));
    if (f.phone.trim()) ops.push(supabase.from("contact_phones").insert({ contact_id: data.id, phone_number: f.phone.trim(), label: "mobile", is_primary: true }));
    await Promise.all(ops);
    onSaved();
  };
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(11,59,61,.35)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Card style={{ width: 440 }} pad="24px">
        <div className="font-serif" style={{ fontSize: 22, marginBottom: 14 }}>New client</div>
        {([["Name", "name"], ["Phone", "phone"], ["Email", "email"], ["Interested in", "destination"], ["Came from", "source"]] as const).map(([l, k]) => (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, alignItems: "center", marginBottom: 10, fontSize: 13 }}>
            <span style={{ color: t.MUTED }}>{l}</span><Field value={f[k]} onChange={set(k)} /></div>))}
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, alignItems: "center", marginBottom: 10, fontSize: 13 }}>
          <span style={{ color: t.MUTED }}>Stage</span>
          <select value={f.stage} onChange={e => set("stage")(e.target.value)} style={{ height: 38, borderRadius: 12, border: "none", boxShadow: t.IN, background: t.BG, color: t.INK, padding: "0 10px" }}>
            {STAGES.map(s => <option key={s}>{s}</option>)}</select>
        </div>
        {err && <div style={{ color: t.RED, fontSize: 12 }}>{err}</div>}
        <div className="flex justify-end gap-3" style={{ marginTop: 16 }}>
          <Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save client"}</Btn>
        </div>
      </Card>
    </div>
  );
}

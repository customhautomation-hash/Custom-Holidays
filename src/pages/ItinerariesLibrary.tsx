/**
 * Itineraries — every itinerary PDF made in Claude, sorted by region, trip type, template and year,
 * plus the prompt maker (Sample or Detailed) that fills your template for Claude.
 * The PDFs are read straight from the itineraries folder on this PC (picked once, remembered).
 */
import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Plus, Search, X, Copy, ExternalLink, Check, ChevronRight, FileText } from "lucide-react";
import { Page, Card, Btn, Field, Muted, Empty, useT, T } from "@/components/ch/kit";
import { buildPrompt, EMPTY_FORM, PromptForm, Template, SourceKind } from "@/lib/itineraryPrompt";

// ── remembered folder (IndexedDB, this browser only) ────────────────────────
const DB = "ch-itineraries", STORE = "h";
const idb = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function idbGet(k: string) { const db = await idb(); return new Promise<any>(res => { const q = db.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); }
async function idbSet(k: string, v: any) { const db = await idb(); return new Promise<void>(res => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(v, k); tx.oncomplete = () => res(); }); }

type Pdf = { name: string; path: string; file: File; title: string; client: string; template: "Sample" | "Detailed" | "Other"; region: string; tripType: string; year: string };
const REGIONS: [string, RegExp][] = [
  ["Europe", /europe|italy|amalfi|rome|paris|france|swiss|switzerland|zermatt|lucerne|london|uk|scotland|edinburgh|spain|portugal|greece|santorini|amsterdam|netherlands|germany|austria|vienna|prague|iceland|norway|scandinavia|croatia|turkey|istanbul/i],
  ["Indian Ocean", /maldives|mauritius|seychelles|sri ?lanka|zanzibar/i],
  ["Asia", /japan|tokyo|kyoto|bali|indonesia|thailand|phuket|singapore|vietnam|malaysia|hong ?kong|korea|china|bhutan|nepal|cambodia/i],
  ["Middle East", /dubai|abu ?dhabi|uae|oman|qatar|jordan|saudi|egypt/i],
  ["India", /india|kerala|goa|rajasthan|kashmir|ladakh|andaman|himachal|udaipur|jaipur/i],
  ["Africa", /africa|kenya|tanzania|safari|morocco|namibia|botswana/i],
  ["Americas", /usa|america|new ?york|canada|mexico|peru|brazil|argentina|caribbean/i],
  ["Oceania", /australia|new ?zealand|fiji|tahiti|bora ?bora/i],
];
const TYPES: [string, RegExp][] = [["Honeymoon", /honeymoon|couple|anniversary/i], ["Family", /family|kids/i], ["Group", /group|friends/i], ["Corporate", /corporate|offsite|mice/i]];
function describe(file: File, path: string): Pdf {
  const stem = file.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
  const all = `${path} ${stem}`;
  const template = /\bsample\b/i.test(all) ? "Sample" : /\bdetailed\b/i.test(all) ? "Detailed" : "Other";
  const year = (all.match(/\b(20\d{2})\b/) || [])[1] || String(new Date(file.lastModified).getFullYear());
  const parts = stem.split(/\s+-\s+/);
  const client = parts.length > 1 ? parts[0] : (path.split("/").slice(-2, -1)[0] || "");
  const title = (parts.length > 1 ? parts.slice(1).join(" - ") : stem).replace(/\b(sample|detailed|itinerary|final|v\d+)\b/gi, "").replace(/\s{2,}/g, " ").trim() || stem;
  return { name: file.name, path, file, title, client, template, year,
    region: REGIONS.find(([, r]) => r.test(all))?.[0] || "Other", tripType: TYPES.find(([, r]) => r.test(all))?.[0] || "Leisure" };
}
async function walk(dir: any, prefix = "", depth = 0, out: Pdf[] = []): Promise<Pdf[]> {
  if (depth > 3) return out;
  for await (const [name, h] of dir.entries()) {
    if (h.kind === "file" && /\.pdf$/i.test(name)) out.push(describe(await h.getFile(), `${prefix}${name}`));
    else if (h.kind === "directory" && !name.startsWith(".")) await walk(h, `${prefix}${name}/`, depth + 1, out);
  }
  return out;
}

export default function ItinerariesLibrary() {
  const t = useT();
  const [dir, setDir] = useState<any>(null);
  const [pdfs, setPdfs] = useState<Pdf[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<{ tpl: Template; title?: string } | null>(null);
  const canPick = typeof window !== "undefined" && "showDirectoryPicker" in window;

  const scan = async (h: any) => {
    setLoading(true);
    try {
      if ((await h.queryPermission?.({ mode: "read" })) !== "granted" && (await h.requestPermission?.({ mode: "read" })) !== "granted") { setLoading(false); return; }
      setPdfs((await walk(h)).sort((a, b) => b.file.lastModified - a.file.lastModified));
    } catch { /* folder moved or permission refused */ }
    setLoading(false);
  };
  useEffect(() => { idbGet("dir").then(h => { if (h) { setDir(h); h.queryPermission?.({ mode: "read" }).then((p: string) => p === "granted" && scan(h)); } }).catch(() => {}); }, []);
  const pick = async () => { try { const h = await (window as any).showDirectoryPicker({ id: "ch-itineraries", mode: "read" }); await idbSet("dir", h); setDir(h); scan(h); } catch { /* cancelled */ } };

  const cats: [string, keyof Pdf][] = [["Region", "region"], ["Trip type", "tripType"], ["Template", "template"], ["Year", "year"]];
  const shown = pdfs.filter(p => cats.every(([, k]) => !filters[k] || p[k] === filters[k]) && (!q || `${p.title} ${p.client} ${p.path}`.toLowerCase().includes(q.toLowerCase())));
  const counts = (k: keyof Pdf) => { const m = new Map<string, number>(); pdfs.forEach(p => m.set(p[k] as string, (m.get(p[k] as string) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const open = (p: Pdf) => window.open(URL.createObjectURL(p.file), "_blank");

  return (
    <Page title="Itineraries" sub={pdfs.length ? `${pdfs.length} itineraries made in Claude${dir ? ` · from ${dir.name}` : ""}` : "Every itinerary PDF made in Claude, in one place"}
      actions={<>
        <Field value={q} onChange={setQ} placeholder="Search destination, client or trip" style={{ width: 270 }} />
        <Btn onClick={() => setDrawer({ tpl: "Sample" })}><Plus size={15} />Sample prompt</Btn>
        <Btn kind="primary" onClick={() => setDrawer({ tpl: "Detailed" })}><Plus size={15} />Detailed prompt</Btn>
      </>}>
      {!dir || (!pdfs.length && !loading) ? (
        <Card><Empty title={dir ? `No itinerary PDFs found in ${dir.name}` : "Connect your itineraries folder"}
          action={canPick ? <Btn kind="primary" onClick={dir ? () => scan(dir) : pick}><FolderOpen size={15} />{dir ? "Open the folder again" : "Choose the folder"}</Btn> : undefined}>
          {canPick ? "Pick the folder on this PC where Claude saves the itinerary PDFs. It's remembered in this browser, and the PDFs never leave your computer."
                   : "This browser can't open folders. Use Chrome or Edge on the office PC."}
          {dir && <div style={{ marginTop: 8 }}><button onClick={pick} style={{ background: "none", border: "none", color: t.TEAL, fontWeight: 600, cursor: "pointer" }}>Choose a different folder</button></div>}
        </Empty></Card>
      ) : (
        <div className="flex flex-col lg:flex-row items-start gap-6">
          <Card style={{ width: "100%", maxWidth: 240 }} pad="18px 14px">
            <button onClick={() => setFilters({})} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, color: t.INK, padding: "0 8px 8px" }}>All itineraries · {pdfs.length}</button>
            {cats.map(([label, k]) => (
              <div key={label} style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: t.FAINT, padding: "0 8px 4px" }}>{label}</div>
                {counts(k).map(([v, n]) => {
                  const on = filters[k] === v;
                  return <button key={v} onClick={() => setFilters(f => ({ ...f, [k]: on ? "" : v }))} className="flex justify-between w-full"
                    style={{ background: on ? t.TEAL : "none", color: on ? "#fff" : t.INK, border: "none", borderRadius: 9, padding: "6px 8px", fontSize: 13, cursor: "pointer" }}>
                    <span>{v}</span><span style={{ opacity: .7, fontVariantNumeric: "tabular-nums" }}>{n}</span></button>;
                })}
              </div>))}
            <button onClick={pick} style={{ marginTop: 16, background: "none", border: "none", color: t.TEAL, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "0 8px" }}>Change folder</button>
          </Card>
          <div className="grid gap-5 w-full" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
            {loading && <Muted>Reading the folder…</Muted>}
            {shown.map(p => (
              <Card key={p.path} pad="0" style={{ overflow: "hidden" }}>
                <div onClick={() => open(p)} style={{ cursor: "pointer", height: 120, background: "#0B3B3D", color: "#F6F4EE", padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9.5, letterSpacing: ".12em", color: "#D4AF5A" }}>{p.template === "Other" ? "ITINERARY" : p.template.toUpperCase()}</span>
                  <span className="font-serif" style={{ fontSize: 18, lineHeight: 1.2 }}>{p.title}</span>
                </div>
                <div style={{ padding: "12px 16px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.client || "—"}</div>
                  <Muted>{p.region} · {p.tripType} · {new Date(p.file.lastModified).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Muted>
                  <div className="flex gap-4" style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>
                    <button onClick={() => open(p)} style={{ background: "none", border: "none", color: t.TEAL, cursor: "pointer", padding: 0 }}>Open PDF</button>
                    <button onClick={() => setDrawer({ tpl: p.template === "Sample" ? "Sample" : "Detailed", title: p.title })} style={{ background: "none", border: "none", color: t.TEAL, cursor: "pointer", padding: 0 }}>New prompt like this</button>
                  </div>
                </div>
              </Card>))}
            {!loading && !shown.length && <Muted>Nothing matches those filters</Muted>}
          </div>
        </div>
      )}
      {drawer && <PromptDrawer t={t} initial={drawer} onClose={() => setDrawer(null)} />}
    </Page>
  );
}

// ── prompt maker ─────────────────────────────────────────────────────────────
type Sec = { key: string; name: string; fields: { k: keyof PromptForm; label: string; multi?: boolean; ph?: string }[]; preview: (f: PromptForm) => string };
const firstLine = (s: string) => s.split(/\n/).map(x => x.trim()).filter(Boolean).join(" · ");
const SECTIONS: Record<Template, Sec[]> = {
  Sample: [
    { key: "trip", name: "Trip", fields: [{ k: "title", label: "Title", ph: "Japan in Spring" }, { k: "subtitle", label: "Subtitle", ph: "Tokyo, Hakone & Kyoto in cherry-blossom season" }, { k: "dates", label: "Dates", ph: "Spring · 9 Nights" }, { k: "travellers", label: "Travellers", ph: "Couple, first time in Japan, vegetarian" }, { k: "hotelTier", label: "Hotel tier", ph: "luxury" }], preview: f => [f.title, f.dates].filter(Boolean).join(" · ") },
    { key: "route", name: "Route", fields: [{ k: "route", label: "City – nights – days", multi: true, ph: "Tokyo – 4 nights – Days 1–4\nKyoto – 3 nights – Days 5–7" }, { k: "travelBetween", label: "Travel between cities", ph: "Bullet train and private transfers" }], preview: f => firstLine(f.route) },
    { key: "day", name: "Day plan", fields: [{ k: "dayPlan", label: "Day plan", multi: true, ph: "Leave empty to use the document's day plan" }], preview: f => firstLine(f.dayPlan) || "From the source" },
    { key: "hotels", name: "Hotels", fields: [{ k: "hotels", label: "Hotels", multi: true, ph: "Tokyo: suggest 3 luxury hotels\nKyoto: Aman Kyoto, Park Hyatt Kyoto" }], preview: f => firstLine(f.hotels) },
    { key: "notes", name: "Notes for the client", fields: [{ k: "notes", label: "Notes", multi: true, ph: 'Day 3: "Sumo morning practice is subject to the stable schedule."' }], preview: f => firstLine(f.notes) || "Hotels note added" },
    { key: "special", name: "Special requests", fields: [{ k: "specialRequests", label: "Special requests", multi: true }], preview: f => firstLine(f.specialRequests) },
  ],
  Detailed: [
    { key: "trip", name: "Trip", fields: [{ k: "title", label: "Title" }, { k: "subtitle", label: "Subtitle" }, { k: "dates", label: "Exact dates", ph: "28 Mar – 7 Apr 2027 · 10 Nights" }, { k: "travellers", label: "Travellers", ph: "Mr & Mrs Shah, couple, vegetarian" }], preview: f => [f.title, f.dates].filter(Boolean).join(" · ") },
    { key: "route", name: "Route", fields: [{ k: "route", label: "City – nights – days", multi: true }], preview: f => firstLine(f.route) },
    { key: "flights", name: "Flights", fields: [{ k: "flights", label: "Flights", multi: true, ph: "Day 1: Mumbai → Tokyo · NH 830 · 22:35 · 09:45+1 · T2" }, { k: "baggage", label: "Baggage", ph: "2 × 23 kg per person" }], preview: f => firstLine(f.flights) },
    { key: "hotels", name: "Hotels booked", fields: [{ k: "hotelsBooked", label: "Hotel · room · meals · in/out", multi: true, ph: "Tokyo: Aman Tokyo · Deluxe · breakfast · 15:00 / 12:00" }], preview: f => firstLine(f.hotelsBooked) },
    { key: "travel", name: "Travel between cities", fields: [{ k: "transfers", label: "Transfers", multi: true }], preview: f => firstLine(f.transfers) },
    { key: "exp", name: "Experiences booked", fields: [{ k: "experiences", label: "Day · time · what", multi: true, ph: "Day 2 · 09:00 · private guided city tour" }, { k: "freeDays", label: "Free days", ph: "Day 4" }], preview: f => firstLine(f.experiences) },
    { key: "opt", name: "Optional activities", fields: [{ k: "optional", label: "Optional activities", multi: true }], preview: f => firstLine(f.optional) },
    { key: "notes", name: "Notes for the client", fields: [{ k: "notes", label: "Notes", multi: true }], preview: f => firstLine(f.notes) },
  ],
};

function PromptDrawer({ t, initial, onClose }: { t: T; initial: { tpl: Template; title?: string }; onClose: () => void }) {
  const [tpl, setTpl] = useState<Template>(initial.tpl);
  const [f, setF] = useState<PromptForm>({ ...EMPTY_FORM, title: initial.title || "", source: initial.tpl === "Sample" ? "word" : "folder" });
  const [openSec, setOpenSec] = useState("trip");
  const [copied, setCopied] = useState(false);
  const prompt = useMemo(() => buildPrompt(tpl, f), [tpl, f]);
  const set = (k: keyof PromptForm, v: string) => setF(p => ({ ...p, [k]: v }));
  const switchTpl = (x: Template) => { setTpl(x); setF(p => ({ ...p, source: x === "Sample" ? (p.source === "folder" || p.source === "booking" ? "word" : p.source) : (p.source === "word" || p.source === "text" || p.source === "plan" ? "folder" : p.source) })); setOpenSec("trip"); };
  const copy = async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* blocked */ } };
  const openClaude = () => { copy(); window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, "_blank"); };
  const sources: { k: SourceKind; label: string }[] = tpl === "Sample"
    ? [{ k: "word", label: "Word document" }, { k: "text", label: "Paste itinerary text" }, { k: "plan", label: "Plan from the details" }]
    : [{ k: "folder", label: "Client trip folder / .zip" }, { k: "booking", label: "Type the booking details" }];
  const num = (n: number) => <span style={{ width: 24, height: 24, borderRadius: 99, background: t.TEAL, color: "#fff", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>;
  const area = (k: keyof PromptForm, ph?: string, rows = 3) => <textarea value={f[k]} onChange={e => set(k, e.target.value)} placeholder={ph} rows={rows}
    style={{ width: "100%", borderRadius: 12, boxShadow: t.IN, border: "none", outline: "none", background: t.BG, color: t.INK, padding: "8px 12px", fontSize: 13, resize: "vertical", fontFamily: "inherit" }} />;

  // prompt preview: section headings in teal, the rest quiet
  const lines = prompt.split("\n");
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,59,61,.35)", zIndex: 60 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(1020px, 100vw)", background: t.BG, zIndex: 61, boxShadow: "-10px 0 30px rgba(0,0,0,.18)", padding: "26px 30px", display: "flex", flexDirection: "column", gap: 20, color: t.INK }}>
        <div className="flex items-start justify-between gap-4">
          <div><div className="font-serif" style={{ fontSize: 26 }}>New itinerary prompt</div><Muted>{tpl === "Sample" ? "For a client who hasn't booked yet" : "For a client who has booked"}</Muted></div>
          <div className="flex items-center gap-4">
            <div style={{ display: "inline-flex", padding: 4, borderRadius: 14, boxShadow: t.IN }}>
              {(["Sample", "Detailed"] as Template[]).map(x => (
                <button key={x} onClick={() => switchTpl(x)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: tpl === x ? t.TEAL : "transparent", color: tpl === x ? "#fff" : t.MUTED }}>{x === "Sample" ? "Sample · not booked" : "Detailed · booked"}</button>))}
            </div>
            <Btn onClick={onClose} style={{ width: 38, padding: 0 }}><X size={16} /></Btn>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-8" style={{ flex: 1, minHeight: 0 }}>
          <div style={{ width: "100%", maxWidth: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 24, paddingRight: 4 }}>
            <div className="flex gap-3">{num(1)}<div style={{ flex: 1, minWidth: 0 }}><b>Source</b>
              <div className="flex flex-wrap gap-2" style={{ margin: "10px 0" }}>{sources.map(s => (
                <button key={s.k} onClick={() => set("source", s.k)} style={{ height: 28, padding: "0 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                  background: f.source === s.k ? t.TEAL : (t.dark ? "#16434A" : "#E8DADB"), color: f.source === s.k ? "#fff" : t.MUTED }}>{s.label}</button>))}</div>
              {(f.source === "word" || f.source === "folder") && <><Field value={f.sourcePath} onChange={v => set("sourcePath", v)} placeholder={f.source === "word" ? "D:\\Itineraries\\Japan_Spring_draft.docx" : "D:\\Trips\\Shah - Japan Mar 2027.zip"} style={{ width: "100%" }} />
                <Muted style={{ display: "block", marginTop: 6 }}>Paste the file's location so Claude can open it. In File Explorer: right-click the file, then Copy as path.</Muted></>}
              {f.source === "text" && area("pastedText", "Paste the itinerary text here", 6)}
            </div></div>
            <div className="flex gap-3">{num(2)}<div style={{ flex: 1, minWidth: 0 }}><b>Check the details</b>
              <div style={{ marginTop: 8 }}>
                {SECTIONS[tpl].map((s, i) => {
                  const on = openSec === s.key; const pv = s.preview(f);
                  return (
                    <div key={s.key} style={{ borderTop: i ? `1px solid ${t.LINE}` : "none" }}>
                      <button onClick={() => setOpenSec(on ? "" : s.key)} className="flex items-center gap-3 w-full text-left" style={{ padding: "11px 2px", background: "none", border: "none", cursor: "pointer", color: t.INK }}>
                        <b style={{ fontSize: 13, width: 150, flexShrink: 0 }}>{s.name}</b>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: t.MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{on ? "" : pv || "Empty"}</span>
                        <ChevronRight size={14} color={t.MUTED} style={{ transform: on ? "rotate(90deg)" : "none" }} />
                      </button>
                      {on && <div style={{ padding: "0 2px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                        {s.fields.map(fl => <div key={fl.k}><div style={{ fontSize: 12, color: t.MUTED, marginBottom: 4 }}>{fl.label}</div>
                          {fl.multi ? area(fl.k, fl.ph) : <Field value={f[fl.k]} onChange={v => set(fl.k, v)} placeholder={fl.ph} style={{ width: "100%" }} />}</div>)}
                      </div>}
                    </div>);
                })}
              </div>
            </div></div>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="flex items-center gap-3">{num(3)}<b style={{ flex: 1 }}>Your prompt</b><Muted>{tpl} template · updates as you type</Muted></div>
            <div style={{ flex: 1, overflowY: "auto", background: t.PAPER, borderRadius: 16, boxShadow: t.IN, padding: "20px 24px", fontSize: 12.5, lineHeight: 1.55 }}>
              {lines.map((l, i) => /^[A-Z][A-Z &()·–\-,]+:?$/.test(l.split(" (")[0].trim()) && l.split(" (")[0] === l.split(" (")[0].toUpperCase() && l.trim()
                ? <div key={i} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", color: t.TEAL, margin: "12px 0 2px" }}>{l.replace(/:$/, "")}</div>
                : <div key={i} style={{ color: l.startsWith("- ") ? t.INK : t.MUTED, minHeight: l ? undefined : 8, whiteSpace: "pre-wrap" }}>{l.startsWith("- ") ? `· ${l.slice(2)}` : l}</div>)}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Btn kind="gold" onClick={openClaude}><ExternalLink size={15} />Open in Claude</Btn>
              <Btn onClick={copy}>{copied ? <><Check size={15} />Copied</> : <><Copy size={15} />Copy prompt</>}</Btn>
              <span style={{ flex: 1 }} /><Muted>Save the PDF into your itineraries folder and it shows up here</Muted>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

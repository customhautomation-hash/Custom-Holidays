/**
 * Voucher Generator — 2 steps.
 *  1. Documents: drop the supplier confirmations; each one is read and becomes a voucher (or type one in).
 *  2. Preview & trip folder: check each voucher, download it, then download the whole trip folder (.zip)
 *     or save it straight to this PC and Google Drive.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Upload, Plane, Car, Building2, Map as MapIcon, FileText, Download, Plus, X, Check, Loader2, FolderOpen, HardDrive } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isPdf, readPdfText } from "@/lib/pdfText";
import { buildFolderName } from "@/lib/tripCategorize";
import { extractVoucher, FIELDS, NOTES_LABEL, SMALL_PRINT, missing, prettyDate } from "@/lib/voucherExtract";
import { makeVoucherPdf, KIND_LABEL, VoucherKind } from "@/lib/voucherPdf";
import {
  canSaveDirect, getSavedBaseDir, pickBaseDir, ensureWritePermission, saveFileToPC, downloadAsZip, SaveItem,
  isDriveConfigured, loadGoogleSignIn, getDriveToken, prepareDriveFolder, saveFileToDrive, parseDriveFolderId,
  DEFAULT_DRIVE_PARENT, DEFAULT_DRIVE_ROOT_NAME,
} from "@/lib/tripFolders";
import { Page, Card, Btn, Field, Muted, Dot, Empty, useT, T } from "@/components/ch/kit";

type Item = { id: string; file?: File; kind: VoucherKind | null; title: string; subtitle: string; date: string | null; endDate: string | null; fields: Record<string, string>; notes: string; reading?: boolean; pdf?: Blob; voucherNo?: string };
const uid = () => Math.random().toString(36).slice(2, 10);
const ICON: Record<string, any> = { hotel: Building2, transfer: Car, activity: MapIcon, flight: Plane, doc: FileText };
const KIND_NAME: Record<VoucherKind, string> = { hotel: "Hotel", transfer: "Transfer", activity: "Activity", flight: "Flight or train" };
const ORIGINAL_FOLDER: Record<string, string> = { hotel: "Hotel Vouchers", flight: "Flight Tickets", transfer: "Transfers and Tours", activity: "Transfers and Tours", doc: "Documents" };
const lsGet = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();

export default function VoucherGenerator() {
  const t = useT();
  const [params] = useSearchParams();
  const [step, setStep] = useState<1 | 2>(1);
  const [client, setClient] = useState(params.get("client") || "");
  const [tripName, setTripName] = useState(params.get("trip") || "");
  const [trips, setTrips] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [save, setSave] = useState<{ pc?: string; drive?: string; zip?: string }>({});
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from("trips").select("id, name, client, places, start_date, end_date").order("start_date", { ascending: false }).then(({ data }: any) => setTrips(data || []));
    if (isDriveConfigured()) loadGoogleSignIn().catch(() => {});
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", stop); window.addEventListener("drop", stop);
    return () => { window.removeEventListener("dragover", stop); window.removeEventListener("drop", stop); };
  }, []);
  const trip = trips.find(x => x.name === tripName && (!client || x.client === client)) || trips.find(x => x.name === tripName);
  useEffect(() => { if (trip && !client) setClient(trip.client || ""); }, [trip]);

  const year = (trip?.start_date || items.find(i => i.date)?.date || new Date().toISOString()).slice(0, 4);
  const folderName = buildFolderName(client || "Client", trip?.places || tripName || "Trip", year);

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files);
    const fresh: Item[] = list.map(f => ({ id: uid(), file: f, kind: null, title: f.name, subtitle: "", date: null, endDate: null, fields: {}, notes: "", reading: true }));
    setItems(prev => [...prev, ...fresh]);
    for (const it of fresh) {
      let text = "";
      try { if (isPdf(it.file!)) text = await readPdfText(it.file!, 3); } catch { /* unreadable */ }
      const ex = extractVoucher(text, it.file!.name);
      setItems(prev => prev.map(p => p.id === it.id ? { ...p, ...ex, reading: false } : p));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const sorted = useMemo(() => [...items].sort((a, b) => (a.kind ? 0 : 1) - (b.kind ? 0 : 1) || (a.date || "9999").localeCompare(b.date || "9999")), [items]);
  const first = sorted.find(i => i.kind && i.date)?.date;
  const dayOf = (i: Item) => (first && i.date) ? `D${Math.round((new Date(i.date).getTime() - new Date(first).getTime()) / 86400000) + 1}` : "";
  const vouchers = sorted.filter(i => i.kind);
  const docs = sorted.filter(i => !i.kind);
  const ready = vouchers.filter(i => !i.reading && !missing(i.kind!, i.fields).length);
  const toCheck = vouchers.filter(i => !i.reading && missing(i.kind!, i.fields).length);
  const patch = (id: string, p: Partial<Item>) => setItems(prev => prev.map(i => i.id === id ? { ...i, ...p } : i));

  const pdfInput = (i: Item, n: number) => ({
    kind: i.kind!, voucherNo: i.voucherNo || `CH-${year}-${String(n + 1).padStart(2, "0")}${(client || "X").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()}`,
    title: i.title, subtitle: i.subtitle, fields: FIELDS[i.kind!].map(k => [k, i.fields[k] || ""] as [string, string]),
    notesLabel: NOTES_LABEL[i.kind!], notes: i.notes, smallPrint: SMALL_PRINT[i.kind!],
  });
  const makeAll = async () => {
    setMaking(true);
    const made: Item[] = [];
    for (const [n, i] of ready.entries()) {
      const input = pdfInput(i, n);
      made.push({ ...i, voucherNo: input.voucherNo, pdf: await makeVoucherPdf(input) });
    }
    setItems(prev => prev.map(p => made.find(m => m.id === p.id) || p));
    // remember them for Active Trips and Master CRM (skipped quietly if the vouchers table isn't set up yet)
    try {
      await supabase.from("vouchers").insert(made.map(m => ({ trip_id: trip?.id || null, client: client || "Client", trip_name: tripName || null, kind: m.kind,
        title: m.title, day: parseInt(dayOf(m).slice(1)) || null, start_date: m.date, end_date: m.endDate, details: { ...m.fields, notes: m.notes, address: m.subtitle },
        source_file: m.file?.name || null, voucher_no: m.voucherNo })));
    } catch { /* table not created yet */ }
    setSelected(made[0]?.id || null);
    setMaking(false); setStep(2);
  };

  const folderItems = (): SaveItem[] => {
    const out: SaveItem[] = [];
    items.filter(i => i.pdf).forEach(i => out.push({ file: new File([i.pdf!], `${safe(`${dayOf(i)} ${i.title} ${KIND_NAME[i.kind!]} Voucher`)}.pdf`, { type: "application/pdf" }), subfolder: "Custom Holidays Vouchers" }));
    items.filter(i => i.file).forEach(i => out.push({ file: i.file!, subfolder: /itinerary/i.test(i.file!.name) ? "" : ORIGINAL_FOLDER[i.kind || "doc"] }));
    return out;
  };
  const downloadZip = async () => { setSave(s => ({ ...s, zip: "Preparing…" })); await downloadAsZip(folderName, folderItems()); setSave(s => ({ ...s, zip: "Downloaded" })); };
  const saveToPC = async () => {
    try {
      setSave(s => ({ ...s, pc: "Saving…" }));
      let base = await getSavedBaseDir(); if (!base) base = await pickBaseDir();
      if (!(await ensureWritePermission(base))) throw new Error("Permission was not given");
      for (const it of folderItems()) await saveFileToPC(base, folderName, it);
      setSave(s => ({ ...s, pc: `Saved in ${base.name} › ${folderName}` }));
    } catch (e: any) { setSave(s => ({ ...s, pc: e?.name === "AbortError" ? undefined : `Could not save: ${e?.message || e}` })); }
  };
  const saveToDrive = async () => {
    try {
      setSave(s => ({ ...s, drive: "Saving…" }));
      const parent = lsGet("trip:driveParent", DEFAULT_DRIVE_PARENT), root = lsGet("trip:driveRoot", DEFAULT_DRIVE_ROOT_NAME);
      const token = await getDriveToken(!!parseDriveFolderId(parent));
      const list = folderItems();
      const target = await prepareDriveFolder(token, folderName, [...new Set(list.map(i => i.subfolder))], parent, root);
      for (const it of list) await saveFileToDrive(target, it);
      setSave(s => ({ ...s, drive: target.link }));
    } catch (e: any) { setSave(s => ({ ...s, drive: `Could not save: ${e?.message || e}` })); }
  };

  const stepper = (
    <Card pad="16px 24px">
      <div className="flex items-center" style={{ maxWidth: 620 }}>
        {["Documents", "Preview & trip folder"].map((s, i) => {
          const on = step === i + 1, done = step > i + 1;
          return (
            <div key={s} className="flex items-center" style={{ flex: i === 0 ? 1 : "none" }}>
              <button onClick={() => (done || (i === 1 && items.some(x => x.pdf))) && setStep((i + 1) as 1 | 2)} className="flex items-center gap-2.5"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: on ? t.INK : done ? t.TEAL : t.FAINT, fontWeight: on ? 600 : 400 }}>
                <span style={{ width: 26, height: 26, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600,
                  background: on ? t.TEAL : done ? t.TEAL_BG : t.BG, color: on ? "#fff" : t.TEAL, boxShadow: on || done ? "none" : t.IN }}>{done ? <Check size={13} /> : i + 1}</span>{s}
              </button>
              {i === 0 && <div style={{ flex: 1, height: 1, background: t.LINE, margin: "0 16px", minWidth: 40 }} />}
            </div>);
        })}
      </div>
    </Card>
  );

  const tripPicker = (
    <div className="flex items-center gap-3 flex-wrap">
      <Field value={client} onChange={setClient} placeholder="Client name" style={{ width: 190 }} />
      <input list="ch-trips" value={tripName} onChange={e => setTripName(e.target.value)} placeholder="Trip (pick or type)"
        style={{ height: 38, borderRadius: 12, boxShadow: t.IN, border: "none", outline: "none", background: t.BG, color: t.INK, padding: "0 14px", fontSize: 13, width: 230 }} />
      <datalist id="ch-trips">{trips.map(x => <option key={x.id} value={x.name}>{x.client}</option>)}</datalist>
    </div>
  );

  const edit = items.find(i => i.id === editing);
  const sel = items.find(i => i.id === selected && i.pdf) || items.find(i => i.pdf);

  return (
    <Page title="Voucher Generator" sub={[client, trip?.places || tripName, trip?.start_date && `${prettyDate(trip.start_date)}${trip.end_date ? ` – ${prettyDate(trip.end_date)}` : ""}`].filter(Boolean).join(" · ") || "Make vouchers and the client's trip folder"} actions={tripPicker}>
      {stepper}
      {step === 1 ? (
        <>
          <Card pad="22px 22px 12px">
            <div style={{ padding: "0 12px" }}>
              <div className="font-serif" style={{ fontSize: 22 }}>Upload the documents</div>
              <Muted>Hotel, transfer, tour and flight confirmations · each one becomes a voucher. Passports, insurance and the itinerary go into the trip folder too.</Muted>
            </div>
            <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
              className="flex items-center gap-4 flex-wrap" style={{ margin: "16px 12px 8px", padding: "22px 20px", borderRadius: 14, border: `1.5px dashed ${over ? t.TEAL : "rgba(19,88,91,.35)"}`, background: over ? t.TEAL_BG : "transparent", color: t.MUTED, fontSize: 13 }}>
              <Upload size={22} color={t.TEAL} />
              <span style={{ flex: 1, minWidth: 200 }}>Drop all the files here, PDF or image. Each one is read and the voucher details are filled in.</span>
              <input ref={fileRef} type="file" multiple accept=".pdf,image/*,.doc,.docx,.eml,.txt" hidden onChange={e => addFiles(e.target.files)} />
              <Btn kind="primary" onClick={() => fileRef.current?.click()}>Choose files</Btn>
            </div>
            {!items.length ? <Empty title="No documents yet">Drop the confirmations above, or type a voucher in.</Empty> : (
              <div style={{ fontSize: 12, color: t.MUTED, padding: "12px 12px 4px" }}>{vouchers.length} voucher{vouchers.length === 1 ? "" : "s"}{docs.length ? ` and ${docs.length} other document${docs.length === 1 ? "" : "s"}` : ""} · in day order · click one to check or edit</div>)}
            {sorted.map((i, n) => {
              const Icon = ICON[i.kind || "doc"]; const miss = i.kind ? missing(i.kind, i.fields) : [];
              const detail = i.kind ? [i.kind === "hotel" ? [prettyDate(i.date), prettyDate(i.endDate)].filter(Boolean).join(" – ") : prettyDate(i.date), KIND_NAME[i.kind].toLowerCase()].filter(Boolean).join(" · ") : "Goes into the trip folder";
              return (
                <div key={i.id} onClick={() => setEditing(i.id)} style={{ display: "grid", gridTemplateColumns: "40px 20px minmax(0,1fr) auto 130px", gap: 12, alignItems: "center", padding: "11px 12px", borderRadius: 10, cursor: "pointer", borderTop: n ? `1px solid ${t.LINE}` : "none", background: editing === i.id ? t.ROW : "transparent" }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: t.FAINT }}>{i.kind ? dayOf(i) : ""}</span>
                  <Icon size={16} color={t.MUTED} strokeWidth={1.5} />
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title || "Untitled"}</div><Muted>{detail}</Muted></div>
                  {i.file ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", borderRadius: 9, background: t.TEAL_BG, color: t.TEAL, fontSize: 12, maxWidth: 230, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}><FileText size={13} />{i.file.name}</span> : <Muted>Typed in</Muted>}
                  <span style={{ fontSize: 12, textAlign: "right", color: i.reading ? t.MUTED : miss.length ? t.RED : t.MUTED }}>
                    {i.reading ? <Loader2 size={14} className="animate-spin inline" /> : !i.kind ? "Document" : miss.length ? `Check ${miss[0].toLowerCase()}` : "Ready"}</span>
                </div>);
            })}
            <button onClick={() => { const id = uid(); setItems(p => [...p, { id, kind: "hotel", title: "", subtitle: "", date: null, endDate: null, fields: {}, notes: "" }]); setEditing(id); }}
              className="flex items-center gap-3" style={{ padding: "12px 12px 10px 64px", background: "none", border: "none", color: t.TEAL, fontWeight: 600, fontSize: 13, cursor: "pointer" }}><Plus size={15} />Type a voucher in</button>
          </Card>
          <div className="flex items-center gap-3" style={{ paddingRight: 84 }}>
            <Muted>{toCheck.length ? `${toCheck.length} need${toCheck.length === 1 ? "s" : ""} a quick check before ${toCheck.length === 1 ? "it's" : "they're"} made` : ""}</Muted>
            <span style={{ flex: 1 }} />
            <Btn kind="primary" onClick={makeAll} disabled={!ready.length || making}>{making ? "Making vouchers…" : `Make ${ready.length} voucher${ready.length === 1 ? "" : "s"}`}</Btn>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col xl:flex-row items-start gap-6">
            <Card style={{ width: "100%", maxWidth: 260 }} pad="14px 8px">
              <div style={{ fontSize: 12, color: t.MUTED, padding: "4px 12px 8px" }}>{items.filter(i => i.pdf).length} vouchers made</div>
              {sorted.filter(i => i.pdf).map(i => (
                <button key={i.id} onClick={() => setSelected(i.id)} className="flex items-center gap-2.5 w-full text-left"
                  style={{ padding: "9px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: sel?.id === i.id ? t.ROW : "transparent", color: t.INK }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: t.FAINT, width: 28 }}>{dayOf(i)}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</span>
                </button>))}
            </Card>
            <div className="flex flex-col gap-3" style={{ flex: 1, minWidth: 0, width: "100%" }}>
              {sel && <VoucherCard t={t} i={sel} />}
              {sel?.pdf && <div className="flex gap-3">
                <Btn onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(sel.pdf!); a.download = `${safe(sel.title)} ${KIND_NAME[sel.kind!]} Voucher.pdf`; a.click(); }}><Download size={15} />Download PDF</Btn>
                <Btn onClick={() => { setStep(1); setEditing(sel.id); }}>Edit</Btn>
              </div>}
            </div>
            <Card style={{ width: "100%", maxWidth: 320 }}>
              <div className="font-serif" style={{ fontSize: 20 }}>Trip folder</div>
              <Muted>Ready to download or save</Muted>
              <div style={{ margin: "12px 0 4px" }}>
                {[[folderName, 0], [`Custom Holidays Vouchers · ${items.filter(i => i.pdf).length} PDFs`, 1],
                  ...[...new Set(items.filter(i => i.file).map(i => /itinerary/i.test(i.file!.name) ? "" : ORIGINAL_FOLDER[i.kind || "doc"]))].filter(Boolean).map(f => { const n = items.filter(i => i.file && ORIGINAL_FOLDER[i.kind || "doc"] === f && !/itinerary/i.test(i.file.name)).length; return [`${f} · ${n} file${n === 1 ? "" : "s"}`, 1]; })]
                  .map(([name, lvl]) => (
                    <div key={name as string} className="flex items-center gap-2" style={{ padding: `5px 0 5px ${(lvl as number) * 22}px`, fontSize: 13, fontWeight: lvl ? 400 : 600 }}>
                      <FolderOpen size={15} color="#B8913E" strokeWidth={1.5} />{name}</div>))}
              </div>
              <Btn kind="gold" onClick={downloadZip} style={{ width: "100%", margin: "14px 0 8px" }}><Download size={15} />Download .zip</Btn>
              {save.zip && <Muted>{save.zip}</Muted>}
              {canSaveDirect() && (
                <div className="flex items-center gap-3" style={{ padding: "10px 0", borderTop: `1px solid ${t.LINE}`, marginTop: 6 }}>
                  <HardDrive size={16} color={t.TEAL} />
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13 }}>This PC</div><Muted style={{ overflowWrap: "anywhere" }}>{save.pc || "Your trips folder"}</Muted></div>
                  {!save.pc?.startsWith("Saved") && <Btn onClick={saveToPC} style={{ height: 32 }}>Save</Btn>}
                </div>)}
              {isDriveConfigured() && (
                <div className="flex items-center gap-3" style={{ padding: "10px 0", borderTop: `1px solid ${t.LINE}` }}>
                  <FolderOpen size={16} color={t.TEAL} />
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13 }}>Google Drive</div>
                    {save.drive?.startsWith("http") ? <a href={save.drive} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: t.TEAL }}>Saved · open folder</a> : <Muted>{save.drive || lsGet("trip:driveRoot", DEFAULT_DRIVE_ROOT_NAME)}</Muted>}</div>
                  {!save.drive?.startsWith("http") && <Btn onClick={saveToDrive} style={{ height: 32 }}>Save</Btn>}
                </div>)}
            </Card>
          </div>
          <div className="flex" style={{ paddingRight: 84 }}><Btn onClick={() => setStep(1)}>Back</Btn></div>
        </>
      )}
      {edit && <Editor t={t} i={edit} onChange={p => patch(edit.id, { ...p, pdf: undefined })} onClose={() => setEditing(null)}
        onRemove={() => { setItems(prev => prev.filter(x => x.id !== edit.id)); setEditing(null); }} />}
    </Page>
  );
}

function VoucherCard({ t, i }: { t: T; i: Item }) {
  const kv = (k: string, v: string) => <div key={k}><div style={{ fontSize: 9.5, color: "#7A8584", letterSpacing: ".04em" }}>{k.toUpperCase()}</div><div style={{ fontSize: 12.5, color: "#1A2324", marginTop: 1 }}>{v || "—"}</div></div>;
  if (!i.kind) return null;
  return (
    <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 6px 20px rgba(11,59,61,.14)", overflow: "hidden", maxWidth: 720 }}>
      <div style={{ background: "#0B3B3D", color: "#F6F4EE", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <img src="/ch-mark-peach.png" alt="" style={{ width: 32, height: 32 }} />
        <div style={{ flex: 1 }}><div className="font-serif" style={{ fontSize: 15 }}>Custom Holidays</div><div style={{ fontSize: 9, color: "#C9D8D7", letterSpacing: ".12em" }}>{KIND_LABEL[i.kind]}</div></div>
        <div style={{ fontSize: 10, color: "#D4AF5A" }}>{i.voucherNo || "Not made yet"}</div>
      </div>
      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div><div className="font-serif" style={{ fontSize: 20, color: "#1A2324" }}>{i.title || "Untitled"}</div>{i.subtitle && <div style={{ fontSize: 11, color: "#5B6766" }}>{i.subtitle}</div>}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", padding: "12px 0", borderTop: "1px solid #EEE4E4", borderBottom: "1px solid #EEE4E4" }}>
          {FIELDS[i.kind].map(k => kv(k, i.fields[k] || ""))}
        </div>
        {i.notes && kv(NOTES_LABEL[i.kind], i.notes)}
        <div style={{ fontSize: 10, color: "#7A8584", lineHeight: 1.5 }}>{SMALL_PRINT[i.kind]}</div>
      </div>
      <div style={{ background: "#F6EEDB", color: "#8A6A24", fontSize: 10, padding: "8px 20px" }}>Custom Holidays, Mumbai · 24×7 travel help on WhatsApp</div>
    </div>
  );
}

function Editor({ t, i, onChange, onClose, onRemove }: { t: T; i: Item; onChange: (p: Partial<Item>) => void; onClose: () => void; onRemove: () => void }) {
  const kinds: (VoucherKind | null)[] = ["hotel", "transfer", "activity", "flight", null];
  const row = (label: string, el: React.ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 12, alignItems: "center", padding: "7px 0", borderTop: `1px solid ${t.LINE}`, fontSize: 13 }}>
      <span style={{ color: t.MUTED }}>{label}</span>{el}</div>);
  const inp = (v: string, set: (v: string) => void, type = "text") => <Field type={type} value={v} onChange={set} style={{ height: 34, width: "100%" }} />;
  const setField = (k: string, v: string) => onChange({ fields: { ...i.fields, [k]: v } });
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,59,61,.35)", zIndex: 60 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(980px, 100vw)", background: t.BG, zIndex: 61, boxShadow: "-10px 0 30px rgba(0,0,0,.18)", padding: "26px 30px", overflowY: "auto", color: t.INK }}>
        <div className="flex items-start justify-between gap-4">
          <div><div className="font-serif" style={{ fontSize: 26 }}>{i.file ? "Check the voucher" : "New voucher"}</div><Muted>{i.file ? `Filled from ${i.file.name} · check and edit` : "Type the details in"}</Muted></div>
          <Btn onClick={onClose} style={{ width: 38, padding: 0 }}><X size={16} /></Btn>
        </div>
        <div className="flex flex-col lg:flex-row gap-8" style={{ marginTop: 22 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {row("Type", <div className="flex flex-wrap gap-2">{kinds.map(k => (
              <button key={String(k)} onClick={() => onChange({ kind: k })} style={{ height: 26, padding: "0 11px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600,
                background: i.kind === k ? t.TEAL : (t.dark ? "#16434A" : "#E8DADB"), color: i.kind === k ? "#fff" : t.MUTED }}>{k ? KIND_NAME[k] : "Not a voucher"}</button>))}</div>)}
            {i.kind && <>
              {row(i.kind === "hotel" ? "Hotel" : i.kind === "flight" ? "Title" : "Name", inp(i.title, v => onChange({ title: v })))}
              {row(i.kind === "hotel" ? "Address" : "Subtitle", inp(i.subtitle, v => onChange({ subtitle: v })))}
              {row(i.kind === "hotel" ? "Check-in date" : "Date", inp(i.date || "", v => onChange({ date: v || null, fields: { ...i.fields, [i.kind === "hotel" ? "Check-in" : "Date"]: prettyDate(v) } }), "date"))}
              {i.kind === "hotel" && row("Check-out date", inp(i.endDate || "", v => onChange({ endDate: v || null, fields: { ...i.fields, "Check-out": prettyDate(v) } }), "date"))}
              {FIELDS[i.kind].map(k => row(k, inp(i.fields[k] || "", v => setField(k, v))))}
              {row(NOTES_LABEL[i.kind], <textarea value={i.notes} onChange={e => onChange({ notes: e.target.value })} rows={3}
                style={{ borderRadius: 12, boxShadow: t.IN, border: "none", outline: "none", background: t.BG, color: t.INK, padding: "8px 12px", fontSize: 13, resize: "vertical" }} />)}
            </>}
            {!i.kind && <Muted style={{ display: "block", marginTop: 12 }}>This file goes into the trip folder as it is. Pick a type above if it should become a voucher.</Muted>}
          </div>
          {i.kind && <div style={{ width: "100%", maxWidth: 380 }}><div className="flex justify-between" style={{ marginBottom: 10 }}><b>Preview</b><Muted>Updates as you type</Muted></div><VoucherCard t={t} i={i} /></div>}
        </div>
        <div className="flex items-center gap-3" style={{ marginTop: 24 }}>
          <button onClick={onRemove} style={{ background: "none", border: "none", color: t.RED, fontSize: 13, cursor: "pointer" }}>Remove</button>
          <span style={{ flex: 1 }} />
          <Btn kind="primary" onClick={onClose}>{i.kind && missing(i.kind, i.fields).length ? `Done · ${missing(i.kind, i.fields).length} still empty` : "Done"}</Btn>
        </div>
      </div>
    </>
  );
}

/**
 * TripDocuments.tsx — drag & drop vouchers / tickets / documents and build the
 * standard client folder (e.g. "Mr. Romil Amsterdam_26") on:
 *   • the PC of whoever is using the dashboard, and
 *   • Google Drive.
 * Files are auto-sorted into Flight Tickets / Hotel Vouchers / Transfers and Tours /
 * Documents / main folder, and can be moved before saving. Nothing is ever overwritten.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useDarkMode } from "@/hooks/useDarkMode";
import {
  Plane, Hotel, Bus, IdCard, FolderOpen, FolderTree, Upload, HardDrive, Cloud,
  CheckCircle2, Loader2, X, Settings2, AlertTriangle, SkipForward, Download, FolderPlus,
  Pencil, Sparkles, Undo2,
} from "lucide-react";
import {
  CATEGORIES, CategoryId, buildFolderName, categorize, categoryById,
} from "@/lib/tripCategorize";
import {
  canSaveDirect, getSavedBaseDir, pickBaseDir, ensureWritePermission, saveFileToPC, downloadAsZip,
  isDriveConfigured, loadGoogleSignIn, getDriveToken, hasConnectedDrive, driveAccountEmail, disconnectDrive,
  prepareDriveFolder, saveFileToDrive,
  parseDriveFolderId, DEFAULT_DRIVE_PARENT, DEFAULT_DRIVE_ROOT_NAME, ItemResult, SaveItem,
} from "@/lib/tripFolders";
import { analyzeDocText, isPoorFileName } from "@/lib/tripDocAnalyze";
import { isPdf, readPdfText } from "@/lib/pdfText";

type Status = { state: "idle" | "working" | "done" | "skipped" | "error"; note?: string };
interface Item {
  id: string;
  file: File;
  category: CategoryId;
  catSource: "name" | "pdf" | "manual";      // how the folder was decided
  name: string;                              // name it will be saved as
  nameSource: "original" | "auto" | "edited";
  suggested: string | null;                  // name read from the PDF (if any)
  poor: boolean;                             // original name says nothing useful
  reading: boolean;                          // PDF text being read
  pc: Status;
  drive: Status;
}

const ICONS: Record<CategoryId, React.ElementType> = {
  flights: Plane, hotels: Hotel, transfers: Bus, documents: IdCard, main: FolderOpen,
};
const JUNK = /^(desktop\.ini|thumbs\.db|\.ds_store)$/i;
const IDLE: Status = { state: "idle" };
const genId = () => Math.random().toString(36).slice(2, 10);
const extOf = (name: string) => (name.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] || "").toLowerCase();
const stemOf = (name: string) => name.slice(0, name.length - extOf(name).length).replace(/\.pdf$/i, "");
const fmtSize = (b: number) => b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

const LS = {
  get: (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

/** Reads files out of a drop, including files inside dropped folders. */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items || [])
    .map(i => (i as any).webkitGetAsEntry?.())
    .filter(Boolean);
  if (!entries.length) return Array.from(dt.files);
  const out: File[] = [];
  const walk = async (entry: any): Promise<void> => {
    if (entry.isFile) {
      out.push(await new Promise<File>((res, rej) => entry.file(res, rej)));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) {
        const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

export default function TripDocuments() {
  const { dark } = useDarkMode();

  // ── Theme ────────────────────────────────────────────────────────────────
  const BG         = dark ? "#0C2C32" : "#F3EAEA";
  const SHADOW_OUT = dark ? "5px 5px 12px #061A1E, -5px -5px 12px #16434A" : "5px 5px 12px #D9C6C8, -5px -5px 12px #FFFFFF";
  const SHADOW_IN  = dark ? "inset 3px 3px 7px #061A1E, inset -3px -3px 7px #16434A" : "inset 3px 3px 7px #D9C6C8, inset -3px -3px 7px #FFFFFF";
  const TEXT_MAIN  = dark ? "#E6EFEC" : "#1A2324";
  const TEXT_MUTED = dark ? "#8FA6A3" : "#5B6766";
  const ACCENT     = "#13585B";

  const card: React.CSSProperties = { background: BG, boxShadow: SHADOW_OUT, borderRadius: 20, padding: 20 };
  const input: React.CSSProperties = {
    background: BG, boxShadow: SHADOW_IN, border: "none", borderRadius: 12, padding: "10px 12px",
    fontSize: 14, color: TEXT_MAIN, outline: "none", width: "100%",
  };
  const btn = (primary = false): React.CSSProperties => ({
    background: primary ? "#13585B" : BG,
    color: primary ? "#fff" : TEXT_MAIN, boxShadow: SHADOW_OUT, border: "none", borderRadius: 12,
    padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 7,
  });

  // ── State ────────────────────────────────────────────────────────────────
  const [client, setClient]           = useState("");
  const [destination, setDestination] = useState("");
  const [year, setYear]               = useState(String(new Date().getFullYear()));
  const [items, setItems]             = useState<Item[]>([]);
  const [dragTarget, setDragTarget]   = useState<CategoryId | "all" | null>(null);
  const [savePC, setSavePC]           = useState(LS.get("trip:savePC", "true") === "true");
  const [saveDrive, setSaveDrive]     = useState(LS.get("trip:saveDrive", "true") === "true" && isDriveConfigured());
  const [baseDirName, setBaseDirName] = useState<string | null>(null);
  const [driveReady, setDriveReady]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [driveParent, setDriveParent] = useState(LS.get("trip:driveParent", DEFAULT_DRIVE_PARENT));
  const [driveRoot, setDriveRoot]     = useState(LS.get("trip:driveRoot", DEFAULT_DRIVE_ROOT_NAME));
  const [saving, setSaving]           = useState(false);
  const [message, setMessage]         = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [driveLink, setDriveLink]     = useState<string | null>(null);
  const [editing, setEditing]         = useState<{ id: string; value: string } | null>(null);
  const itemsRef = useRef<Item[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const fileInput = useRef<HTMLInputElement>(null);

  const direct     = canSaveDirect();
  const fullDrive  = !!parseDriveFolderId(driveParent);
  const folderName = buildFolderName(client, destination, year);

  useEffect(() => { LS.set("trip:savePC", String(savePC)); }, [savePC]);
  useEffect(() => { LS.set("trip:saveDrive", String(saveDrive)); }, [saveDrive]);
  useEffect(() => { LS.set("trip:driveParent", driveParent); LS.set("trip:driveRoot", driveRoot); }, [driveParent, driveRoot]);
  const [driveEmail, setDriveEmail]   = useState<string | null>(driveAccountEmail());
  useEffect(() => { setDriveReady(hasConnectedDrive(fullDrive)); }, [fullDrive]);

  useEffect(() => {
    if (direct) getSavedBaseDir().then(h => setBaseDirName(h?.name ?? null));
    if (isDriveConfigured()) loadGoogleSignIn().catch(() => {});
    // Stop the browser from opening a PDF if it's dropped outside the drop zones
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => { window.removeEventListener("dragover", stop); window.removeEventListener("drop", stop); };
  }, [direct]);

  // ── File handling ────────────────────────────────────────────────────────
  /** Reads a PDF's text, then sets the right folder and (for badly named files) a clear name. */
  const analyze = async (item: Item) => {
    let category: CategoryId | null = null;
    let title: string | null = null;
    try {
      ({ category, title } = analyzeDocText(await readPdfText(item.file)));
    } catch { /* unreadable / password-protected PDF → keep file-name guess */ }
    const ext = extOf(item.file.name) || ".pdf";
    setItems(prev => prev.map(i => {
      if (i.id !== item.id) return i;
      const next = { ...i, reading: false, suggested: title ? title + ext : null };
      if (category && i.catSource === "name") { next.category = category; next.catSource = "pdf"; }
      if (title && i.poor && i.nameSource === "original") { next.name = title + ext; next.nameSource = "auto"; }
      return next;
    }));
  };

  const addFiles = (files: File[], forced?: CategoryId) => {
    setMessage(null);
    const current = itemsRef.current;
    const fresh: Item[] = [];
    for (const f of files) {
      if (JUNK.test(f.name) || f.size === 0) continue;
      if ([...current, ...fresh].some(i => i.file.name === f.name && i.file.size === f.size)) continue;
      fresh.push({
        id: genId(), file: f,
        category: forced ?? categorize(f.name), catSource: forced ? "manual" : "name",
        name: f.name.replace(/\.pdf\.pdf$/i, ".pdf"), nameSource: "original", suggested: null,
        poor: isPoorFileName(f.name), reading: isPdf(f),
        pc: IDLE, drive: IDLE,
      });
    }
    if (!fresh.length) return;
    itemsRef.current = [...current, ...fresh];
    setItems(prev => [...prev, ...fresh]);
    // Read PDFs a few at a time
    const queue = fresh.filter(i => i.reading);
    const worker = async () => { for (let it = queue.shift(); it; it = queue.shift()) await analyze(it); };
    Promise.all([worker(), worker(), worker()]);
  };

  const onDrop = async (e: React.DragEvent, forced?: CategoryId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragTarget(null);
    addFiles(await filesFromDrop(e.dataTransfer), forced);
  };

  const dragProps = (target: CategoryId | "all") => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragTarget(target); },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragTarget(t => (t === target ? null : t));
    },
    onDrop: (e: React.DragEvent) => onDrop(e, target === "all" ? undefined : target),
  });

  const move   = (id: string, category: CategoryId) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, category, catSource: "manual", pc: IDLE, drive: IDLE } : i)));
  const rename = (id: string, name: string, source: Item["nameSource"]) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, name, nameSource: source, pc: IDLE, drive: IDLE } : i)));
  const commitEdit = () => {
    if (!editing) return;
    const it = items.find(i => i.id === editing.id);
    const stem = editing.value.trim().replace(/\.[A-Za-z0-9]{1,5}$/, "");
    if (it && stem) rename(it.id, stem + (extOf(it.name) || extOf(it.file.name)), "edited");
    setEditing(null);
  };
  const anyReading = items.some(i => i.reading);
  const remove = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const setStatus = (id: string, key: "pc" | "drive", s: Status) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, [key]: s } : i)));

  const grouped = useMemo(() => {
    const m = new Map<CategoryId, Item[]>(CATEGORIES.map(c => [c.id, []]));
    items.forEach(i => m.get(i.category)!.push(i));
    return m;
  }, [items]);

  // ── Setup buttons ────────────────────────────────────────────────────────
  const choosePCFolder = async () => {
    try {
      const h = await pickBaseDir();
      setBaseDirName(h.name);
    } catch (e: any) {
      if (e?.name !== "AbortError") setMessage({ kind: "error", text: e?.message || "Could not open the folder picker." });
    }
  };

  const connectDrive = async () => {
    try {
      await getDriveToken(fullDrive);
      setDriveReady(true);
      setDriveEmail(driveAccountEmail());
      setMessage({ kind: "ok", text: "Google Drive connected." });
    } catch (e: any) {
      setMessage({ kind: "error", text: e?.message || "Google sign-in failed." });
    }
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const result = (r: ItemResult): Status =>
    r === "saved" ? { state: "done" } : r === "skipped" ? { state: "skipped", note: "Already there" } : { state: "done", note: `Saved as "${r}"` };

  const handleSave = async () => {
    if (!client.trim() || !destination.trim()) return setMessage({ kind: "error", text: "Enter the client name and destination first." });
    if (!items.length) return setMessage({ kind: "error", text: "Drop at least one file first." });
    if (!savePC && !saveDrive) return setMessage({ kind: "error", text: "Tick at least one place to save to." });

    setSaving(true);
    setMessage(null);
    setDriveLink(null);
    if (anyReading) { setSaving(false); return setMessage({ kind: "warn", text: "Still reading the PDFs, try again in a moment." }); }
    const list: SaveItem[] = items.map(i => ({ file: i.file, subfolder: categoryById(i.category).folder, name: i.name }));
    const problems: string[] = [];

    // 1) Get the permissions that need a click first (folder access, Google sign-in)
    let base: any = null;
    let token: string | null = null;
    if (savePC && direct) {
      try {
        base = (await getSavedBaseDir()) || (await pickBaseDir());
        setBaseDirName(base.name);
        if (!(await ensureWritePermission(base))) { base = null; problems.push("Permission to write to your PC folder was not given."); }
      } catch (e: any) {
        base = null;
        problems.push(e?.name === "AbortError" ? "No PC folder chosen." : `PC: ${e?.message || e}. Click Save again.`);
      }
    }
    if (saveDrive) {
      try { token = await getDriveToken(fullDrive); setDriveReady(true); setDriveEmail(driveAccountEmail()); }
      catch (e: any) { problems.push(`Google Drive: ${e?.message || e} Click "Connect Google Drive", then Save again.`); }
    }

    // 2) This computer
    if (savePC && direct && base) {
      for (let k = 0; k < items.length; k++) {
        setStatus(items[k].id, "pc", { state: "working" });
        try { setStatus(items[k].id, "pc", result(await saveFileToPC(base, folderName, list[k]))); }
        catch (e: any) { setStatus(items[k].id, "pc", { state: "error", note: e?.message || String(e) }); problems.push(`PC: ${items[k].file.name} failed`); }
      }
    } else if (savePC && !direct) {
      try {
        await downloadAsZip(folderName, list);
        items.forEach(i => setStatus(i.id, "pc", { state: "done", note: "In the .zip download" }));
      } catch (e: any) { problems.push(`ZIP: ${e?.message || e}`); }
    }

    // 3) Google Drive
    if (saveDrive && token) {
      try {
        const subs = Array.from(new Set(list.map(l => l.subfolder)));
        const target = await prepareDriveFolder(token, folderName, subs, driveParent, driveRoot);
        setDriveLink(target.link);
        for (let k = 0; k < items.length; k++) {
          setStatus(items[k].id, "drive", { state: "working" });
          try { setStatus(items[k].id, "drive", result(await saveFileToDrive(target, list[k]))); }
          catch (e: any) { setStatus(items[k].id, "drive", { state: "error", note: e?.message || String(e) }); problems.push(`Drive: ${items[k].file.name} failed`); }
        }
      } catch (e: any) { problems.push(`Google Drive: ${e?.message || e}`); }
    }

    setSaving(false);
    setMessage(problems.length
      ? { kind: "warn", text: problems.join(" · ") }
      : { kind: "ok", text: `"${folderName}" is ready${savePC ? (direct ? ` in ${base?.name ?? "your PC folder"}` : " (check your Downloads for the .zip)") : ""}${saveDrive ? " and on Google Drive" : ""}.` });
  };

  // ── Small UI pieces ──────────────────────────────────────────────────────
  const StatusIcon = ({ s, label }: { s: Status; label: string }) => {
    if (s.state === "idle") return null;
    const map = {
      working: <Loader2 className="animate-spin" style={{ width: 13, height: 13, color: ACCENT }} />,
      done:    <CheckCircle2 style={{ width: 13, height: 13, color: "#2E9E6B" }} />,
      skipped: <SkipForward style={{ width: 13, height: 13, color: TEXT_MUTED }} />,
      error:   <AlertTriangle style={{ width: 13, height: 13, color: "#E05B5B" }} />,
    } as const;
    return (
      <span title={`${label}: ${s.note || s.state}`} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: TEXT_MUTED }}>
        {label === "PC" ? <HardDrive style={{ width: 11, height: 11 }} /> : <Cloud style={{ width: 11, height: 11 }} />}
        {map[s.state]}
      </span>
    );
  };

  const Toggle = ({ on, set, disabled }: { on: boolean; set: (v: boolean) => void; disabled?: boolean }) => (
    <button disabled={disabled} onClick={() => set(!on)} style={{
      width: 38, height: 22, borderRadius: 99, border: "none", cursor: disabled ? "not-allowed" : "pointer",
      background: on ? "#13585B" : BG, boxShadow: on ? "none" : SHADOW_IN,
      position: "relative", opacity: disabled ? 0.5 : 1, flexShrink: 0,
    }}>
      <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 99, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
    </button>
  );

  const msgColor = message?.kind === "ok" ? "#2E9E6B" : message?.kind === "warn" ? "#D48A2E" : "#E05B5B";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: "#13585B", boxShadow: SHADOW_OUT, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FolderTree style={{ width: 22, height: 22, color: "#fff" }} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: TEXT_MAIN, margin: 0 }}>Trip Documents</h1>
            <p style={{ fontSize: 13, color: TEXT_MUTED, margin: 0 }}>
              Drop vouchers, tickets and documents. They're sorted into the client folder on your PC and on Google Drive.
            </p>
          </div>
        </div>

        {/* Trip details + folder preview */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 20 }} className="max-lg:!grid-cols-1">
          <div style={card}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: TEXT_MAIN, margin: "0 0 14px" }}>1 · Trip details</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 0.8fr", gap: 12 }}>
              {[
                { label: "Client name", value: client, set: setClient, ph: "Mr. Romil" },
                { label: "Destination", value: destination, set: setDestination, ph: "Amsterdam" },
                { label: "Travel year", value: year, set: setYear, ph: "2026" },
              ].map(f => (
                <label key={f.label} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 600, color: TEXT_MUTED, textTransform: "", }}>
                  {f.label}
                  <input value={f.value} placeholder={f.ph} onChange={e => f.set(e.target.value)} style={input} />
                </label>
              ))}
            </div>
            <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 12, boxShadow: SHADOW_IN, fontSize: 13, color: TEXT_MUTED }}>
              Folder name: <b style={{ color: folderName ? ACCENT : TEXT_MUTED }}>{folderName || "—"}</b>
            </div>
          </div>

          {/* Folder map */}
          <div style={card}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: TEXT_MAIN, margin: "0 0 12px" }}>Folder preview</h3>
            <div style={{ fontSize: 13, color: TEXT_MAIN, fontFamily: "ui-monospace, Consolas, monospace" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                <FolderOpen style={{ width: 15, height: 15, color: ACCENT }} /> {folderName || "Client Destination_YY"}
              </div>
              {CATEGORIES.filter(c => c.folder).map((c, idx, arr) => {
                const n = grouped.get(c.id)!.length;
                const Icon = ICONS[c.id];
                return (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 8, marginTop: 4, color: n ? TEXT_MAIN : TEXT_MUTED }}>
                    <span style={{ color: TEXT_MUTED }}>{idx === arr.length - 1 && !grouped.get("main")!.length ? "└──" : "├──"}</span>
                    <Icon style={{ width: 13, height: 13, color: c.color }} /> {c.folder}
                    <span style={{ marginLeft: "auto", fontSize: 11, padding: "1px 8px", borderRadius: 99, background: n ? c.color : "transparent", color: n ? "#fff" : TEXT_MUTED, boxShadow: n ? "none" : SHADOW_IN }}>{n}</span>
                  </div>
                );
              })}
              {grouped.get("main")!.map((i, idx, arr) => (
                <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 8, marginTop: 4, color: TEXT_MUTED, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  <span>{idx === arr.length - 1 ? "└──" : "├──"}</span> {i.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Drop zone */}
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: TEXT_MAIN, margin: "0 0 14px" }}>2 · Drop files</h3>
          <div {...dragProps("all")} onClick={() => fileInput.current?.click()}
            style={{
              borderRadius: 18, padding: "28px 16px", textAlign: "center", cursor: "pointer",
              boxShadow: SHADOW_IN, border: `2px dashed ${dragTarget === "all" ? ACCENT : "transparent"}`,
              background: dragTarget === "all" ? (dark ? "#22223C" : "#EEF3F1") : BG, transition: "all .15s",
            }}>
            <Upload style={{ width: 28, height: 28, color: ACCENT, margin: "0 auto 8px" }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: TEXT_MAIN }}>Drop all files or folders here</div>
            <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 4 }}>PDFs are read and sorted by what's inside, and badly named ones get a clear name. You can also click to browse.</div>
            <input ref={fileInput} type="file" multiple hidden onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
          </div>

          {/* Category boxes (also drop targets) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginTop: 16 }}>
            {CATEGORIES.map(c => {
              const Icon = ICONS[c.id];
              const list = grouped.get(c.id)!;
              const over = dragTarget === c.id;
              return (
                <div key={c.id} {...dragProps(c.id)} style={{
                  borderRadius: 16, padding: 12, minHeight: 130, background: BG,
                  boxShadow: over ? SHADOW_IN : SHADOW_OUT, border: `2px dashed ${over ? c.color : "transparent"}`, transition: "all .15s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 9, background: c.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon style={{ width: 14, height: 14, color: "#fff" }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>{c.label}</div>
                      <div style={{ fontSize: 10.5, color: TEXT_MUTED }}>{c.hint}</div>
                    </div>
                  </div>
                  {list.length === 0 && <div style={{ fontSize: 11, color: TEXT_MUTED, textAlign: "center", padding: "14px 0" }}>Drop here</div>}
                  {list.map(i => (
                    <div key={i.id} style={{ borderRadius: 10, boxShadow: SHADOW_IN, padding: "7px 8px", marginTop: 6 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                        {editing?.id === i.id ? (
                          <input autoFocus value={editing.value}
                            onChange={e => setEditing({ id: i.id, value: e.target.value })}
                            onBlur={commitEdit}
                            onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(null); }}
                            style={{ ...input, padding: "4px 6px", fontSize: 12, borderRadius: 7 }} />
                        ) : (
                          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: TEXT_MAIN, wordBreak: "break-word" }}
                            title={i.name !== i.file.name ? `Original file: ${i.file.name}` : i.name}>{i.name}</div>
                        )}
                        {!saving && editing?.id !== i.id && (
                          <button onClick={() => setEditing({ id: i.id, value: stemOf(i.name) })} title="Rename"
                            style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 0 }}>
                            <Pencil style={{ width: 12, height: 12 }} />
                          </button>
                        )}
                        {!saving && (
                          <button onClick={() => remove(i.id)} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 0 }}>
                            <X style={{ width: 12, height: 12 }} />
                          </button>
                        )}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4, fontSize: 10 }}>
                        {i.reading && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: ACCENT }}>
                            <Loader2 className="animate-spin" style={{ width: 10, height: 10 }} /> Reading PDF…
                          </span>
                        )}
                        {i.nameSource === "auto" && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "#2E9E6B" }} title={`Original file: ${i.file.name}`}>
                            <Sparkles style={{ width: 10, height: 10 }} /> Named from PDF
                            <button onClick={() => rename(i.id, i.file.name, "original")} title="Use the original name"
                              style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 0, display: "inline-flex" }}>
                              <Undo2 style={{ width: 10, height: 10 }} />
                            </button>
                          </span>
                        )}
                        {!i.reading && i.suggested && i.nameSource !== "auto" && i.suggested !== i.name && !saving && (
                          <button onClick={() => rename(i.id, i.suggested!, "auto")} title={`Rename to: ${i.suggested}`}
                            style={{ background: "none", border: "none", cursor: "pointer", color: ACCENT, padding: 0, fontSize: 10, display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <Sparkles style={{ width: 10, height: 10 }} /> Use name from PDF
                          </button>
                        )}
                        {!i.reading && i.catSource === "pdf" && (
                          <span style={{ color: TEXT_MUTED }} title="Folder chosen from what's written inside the PDF">· sorted by contents</span>
                        )}
                        {!i.reading && i.poor && i.nameSource === "original" && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "#D48A2E" }}
                            title="This name doesn't say what the file is, and it couldn't be read (scan or photo). Click the pencil to rename.">
                            <AlertTriangle style={{ width: 10, height: 10 }} /> Check name &amp; folder
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                        <select value={i.category} disabled={saving} onChange={e => move(i.id, e.target.value as CategoryId)}
                          style={{ fontSize: 10.5, background: BG, color: TEXT_MUTED, border: "none", boxShadow: SHADOW_OUT, borderRadius: 7, padding: "2px 4px", maxWidth: 125 }}>
                          {CATEGORIES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                        <span style={{ fontSize: 10, color: TEXT_MUTED }}>{fmtSize(i.file.size)}</span>
                        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                          <StatusIcon s={i.pc} label="PC" />
                          <StatusIcon s={i.drive} label="Drive" />
                        </span>
                      </div>
                      {[i.pc, i.drive].filter(s => s.state === "error").map((s, k) => (
                        <div key={k} style={{ fontSize: 10, color: "#E05B5B", marginTop: 3 }}>{s.note}</div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Save */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: TEXT_MAIN, margin: 0 }}>3 · Save</h3>
            <button onClick={() => setShowSettings(s => !s)} style={{ ...btn(), padding: "6px 10px", fontSize: 12 }}>
              <Settings2 style={{ width: 13, height: 13 }} /> Settings
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {/* PC */}
            <div style={{ borderRadius: 14, boxShadow: SHADOW_IN, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <HardDrive style={{ width: 18, height: 18, color: ACCENT }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>This computer</div>
                  <div style={{ fontSize: 11.5, color: TEXT_MUTED }}>
                    {direct
                      ? baseDirName ? <>Saves inside <b>{baseDirName}</b></> : "Choose where client folders should go"
                      : "This browser downloads the folder as a .zip. Open the Vercel link in Chrome or Edge to save folders directly."}
                  </div>
                </div>
                <Toggle on={savePC} set={setSavePC} />
              </div>
              {direct && savePC && (
                <button onClick={choosePCFolder} style={{ ...btn(), marginTop: 10, fontSize: 12 }}>
                  <FolderPlus style={{ width: 13, height: 13 }} /> {baseDirName ? "Change folder" : "Choose folder"}
                </button>
              )}
            </div>

            {/* Drive */}
            <div style={{ borderRadius: 14, boxShadow: SHADOW_IN, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Cloud style={{ width: 18, height: 18, color: "#3FAE82" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>Google Drive</div>
                  <div style={{ fontSize: 11.5, color: TEXT_MUTED }}>
                    {!isDriveConfigured()
                      ? "Not set up yet: add VITE_GOOGLE_CLIENT_ID to the app settings."
                      : fullDrive ? "Saves inside your chosen Drive folder" : <>Saves inside <b>{driveRoot || DEFAULT_DRIVE_ROOT_NAME}</b> in My Drive</>}
                  </div>
                </div>
                <Toggle on={saveDrive} set={setSaveDrive} disabled={!isDriveConfigured()} />
              </div>
              {isDriveConfigured() && saveDrive && (
                driveReady ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 12, color: TEXT_MUTED, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#2E9E6B", fontWeight: 600 }}>
                      <CheckCircle2 style={{ width: 13, height: 13 }} /> Connected{driveEmail ? ` as ${driveEmail}` : ""}
                    </span>
                    <button onClick={() => { disconnectDrive(); setDriveReady(false); setDriveEmail(null); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, fontSize: 11, textDecoration: "underline", padding: 0 }}>
                      Switch account
                    </button>
                  </div>
                ) : (
                  <button onClick={connectDrive} style={{ ...btn(), marginTop: 10, fontSize: 12 }}>
                    <Cloud style={{ width: 13, height: 13 }} /> Connect Google Drive (one time)
                  </button>
                )
              )}
            </div>
          </div>

          {showSettings && (
            <div style={{ marginTop: 14, borderRadius: 14, boxShadow: SHADOW_IN, padding: 14, display: "grid", gap: 12 }}>
              <label style={{ fontSize: 12, color: TEXT_MUTED, display: "grid", gap: 6 }}>
                Google Drive parent folder link (optional). Client folders are created inside it.
                <input value={driveParent} onChange={e => setDriveParent(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" style={input} />
                {driveParent && !fullDrive && <span style={{ color: "#E05B5B" }}>That doesn't look like a Drive folder link.</span>}
              </label>
              {!fullDrive && (
                <label style={{ fontSize: 12, color: TEXT_MUTED, display: "grid", gap: 6 }}>
                  If no link is given, use this folder in My Drive:
                  <input value={driveRoot} onChange={e => setDriveRoot(e.target.value)} placeholder={DEFAULT_DRIVE_ROOT_NAME} style={input} />
                </label>
              )}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <button onClick={handleSave} disabled={saving || anyReading} style={{ ...btn(true), padding: "11px 20px", fontSize: 14, opacity: saving || anyReading ? 0.7 : 1 }}>
              {saving ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} />
                : direct || !savePC ? <FolderPlus style={{ width: 16, height: 16 }} /> : <Download style={{ width: 16, height: 16 }} />}
              {saving ? "Saving…" : anyReading ? "Reading PDFs…" : "Create folder & save files"}
            </button>
            {(items.length > 0 || client || destination) && !saving && (
              <button onClick={() => {
                setItems([]); setMessage(null); setDriveLink(null);
                setClient(""); setDestination(""); setYear(String(new Date().getFullYear()));
              }} style={btn()}>Clear all</button>
            )}
            <span style={{ fontSize: 12, color: TEXT_MUTED }}>{items.length} file{items.length === 1 ? "" : "s"} · existing files are never overwritten</span>
          </div>

          {message && (
            <div style={{ marginTop: 12, fontSize: 13, color: msgColor, display: "flex", gap: 8, alignItems: "flex-start" }}>
              {message.kind === "ok" ? <CheckCircle2 style={{ width: 15, height: 15, flexShrink: 0 }} /> : <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0 }} />}
              <span>{message.text}</span>
            </div>
          )}
          {driveLink && (
            <a href={driveLink} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 13, color: ACCENT, fontWeight: 600 }}>
              <Cloud style={{ width: 14, height: 14 }} /> Open folder in Google Drive
            </a>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

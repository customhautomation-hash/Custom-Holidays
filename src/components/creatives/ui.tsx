/** Small form pieces shared by the Creatives page and the Reel maker. */
import { ReactNode } from "react";
import { T } from "@/components/ch/kit";

export function Label({ t, children }: { t: T; children: ReactNode }) { return <div style={{ fontSize: 12.5, color: t.MUTED, marginBottom: 6 }}>{children}</div>; }

export function Prompt({ t, value, onChange, placeholder, rows = 4 }: { t: T; value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{ width: "100%", borderRadius: 12, boxShadow: t.IN, border: "none", outline: "none", background: t.BG, color: t.INK, padding: "10px 14px", fontSize: 13, lineHeight: 1.55, resize: "vertical", fontFamily: "inherit" }} />;
}

export function Chips<V extends string | number>({ t, value, options, onChange }: { t: T; value: V; options: { v: V; l: string }[]; onChange: (v: any) => void }) {
  return <div className="flex flex-wrap gap-2">{options.map(o => (
    <button key={String(o.v)} onClick={() => onChange(o.v)} style={{ height: 30, padding: "0 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
      background: value === o.v ? (t.dark ? "#1F6F72" : "#13585B") : t.BG, color: value === o.v ? "#fff" : t.MUTED, boxShadow: value === o.v ? "none" : t.BTN }}>{o.l}</button>))}</div>;
}

export function ErrorNote({ t, text }: { t: T; text: string }) { return text ? <div style={{ fontSize: 12.5, color: t.RED, lineHeight: 1.5 }}>{text}</div> : null; }

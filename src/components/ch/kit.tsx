/**
 * kit.tsx — shared pieces for the redesigned pages.
 * One palette (CH Connect), one card style, one button style, light and dark.
 */
import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import { useDarkMode } from "@/hooks/useDarkMode";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export function useT() {
  const { dark } = useDarkMode();
  return dark
    ? { dark, BG: "#0C2C32", INK: "#E6EFEC", MUTED: "#8FA6A3", FAINT: "#6E8784", LINE: "rgba(230,239,236,.08)",
        TEAL: "#5FB3AE", TEAL_BG: "#16434A", GOLD: "#D4AF5A", GOLD_BG: "#2A3A2E", RED: "#E58A7E", ROW: "#123A40",
        OUT: "6px 6px 14px #061A1E,-6px -6px 14px #16434A", IN: "inset 2px 2px 6px #061A1E,inset -2px -2px 6px #16434A",
        BTN: "3px 3px 8px #061A1E,-3px -3px 8px #16434A", PAPER: "#0F3238" }
    : { dark, BG: "#F3EAEA", INK: "#1A2324", MUTED: "#5B6766", FAINT: "#7A8584", LINE: "rgba(26,35,36,.07)",
        TEAL: "#13585B", TEAL_BG: "#E3EFEE", GOLD: "#B8913E", GOLD_BG: "#F6EEDB", RED: "#A23B2E", ROW: "#E9DCDD",
        OUT: "6px 6px 14px #D9C6C8,-6px -6px 14px #FFFFFF", IN: "inset 2px 2px 6px #D9C6C8,inset -2px -2px 6px #FFFFFF",
        BTN: "3px 3px 8px #D9C6C8,-3px -3px 8px #FFFFFF", PAPER: "#FBF7F7" };
}
export type T = ReturnType<typeof useT>;

export function Page({ title, sub, actions, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const t = useT();
  return (
    <DashboardLayout>
      <div className="max-w-[1480px] mx-auto flex flex-col gap-6 pb-24" style={{ color: t.INK }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif" style={{ fontSize: 30, margin: 0 }}>{title}</h1>
            {sub && <div style={{ color: t.MUTED, fontSize: 13, marginTop: 4 }}>{sub}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
        {children}
      </div>
    </DashboardLayout>
  );
}

export function Card({ children, style, className, pad = "20px 22px", onClick }: { children: ReactNode; style?: CSSProperties; className?: string; pad?: string; onClick?: () => void }) {
  const t = useT();
  return <div onClick={onClick} className={className} style={{ background: t.BG, borderRadius: 18, boxShadow: t.OUT, padding: pad, minWidth: 0, ...style }}>{children}</div>;
}

export function Btn({ children, kind = "quiet", onClick, disabled, style, title, type }: { children: ReactNode; kind?: "quiet" | "primary" | "gold"; onClick?: () => void; disabled?: boolean; style?: CSSProperties; title?: string; type?: "button" | "submit" }) {
  const t = useT();
  const k = kind === "primary" ? { background: t.dark ? "#1F6F72" : "#13585B", color: "#fff" }
          : kind === "gold" ? { background: "#B8913E", color: "#fff" }
          : { background: t.BG, color: t.TEAL };
  return (
    <button type={type || "button"} title={title} onClick={onClick} disabled={disabled}
      style={{ height: 38, padding: "0 15px", borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
        fontWeight: 600, fontSize: 13, border: "none", cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap",
        opacity: disabled ? 0.55 : 1, boxShadow: t.BTN, ...k, ...style }}>
      {children}
    </button>
  );
}

export function Inset({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const t = useT();
  return <div style={{ borderRadius: 14, boxShadow: t.IN, ...style }}>{children}</div>;
}

export function Field({ value, onChange, placeholder, style, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; style?: CSSProperties; type?: string }) {
  const t = useT();
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ height: 38, borderRadius: 12, boxShadow: t.IN, border: "none", outline: "none", background: t.BG, color: t.INK, padding: "0 14px", fontSize: 13, minWidth: 0, ...style }} />;
}

export function Muted({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const t = useT();
  return <span style={{ color: t.MUTED, fontSize: 12, ...style }}>{children}</span>;
}

export function Dot({ color }: { color: string }) {
  return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 99, background: color, marginRight: 7, verticalAlign: "middle" }} />;
}

export function Tag({ children, kind = "auto" }: { children: ReactNode; kind?: "auto" | "approval" }) {
  const t = useT();
  const s = kind === "approval" ? { background: t.GOLD_BG, color: t.dark ? "#D4AF5A" : "#8A6A24" } : { background: t.TEAL_BG, color: t.TEAL };
  return <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", ...s }}>{children}</span>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  const t = useT();
  return (
    <div style={{ padding: "40px 20px", textAlign: "center", color: t.MUTED, fontSize: 13, lineHeight: 1.6 }}>
      <div style={{ color: t.INK, fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{title}</div>
      {children}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

/** Ranked horizontal bars: one accent row, the rest quiet. */
export function RankBars({ rows, accent = 0, unit = "" }: { rows: { label: string; note?: string; value: number }[]; accent?: number; unit?: string }) {
  const t = useT();
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "150px 1fr 60px", gap: 12, alignItems: "center", padding: "7px 0" }}>
          <div style={{ fontSize: 13, minWidth: 0 }}>{r.label}{r.note && <div style={{ fontSize: 11, color: t.MUTED }}>{r.note}</div>}</div>
          <div style={{ height: 12, background: t.dark ? "#16434A" : "#E8DADB", borderRadius: 4 }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: 12, borderRadius: 4, background: i === accent ? t.TEAL : (t.dark ? "#3E7A76" : "#7FA9A7") }} />
          </div>
          <b style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{r.value}{unit}</b>
        </div>
      ))}
    </div>
  );
}

/** Automations strip shown at the bottom of a page. */
export function AutoStrip({ items }: { items: { name: string; what: string; approval?: boolean; soon?: boolean }[] }) {
  const t = useT();
  return (
    <Card>
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <b style={{ fontSize: 15 }}>Automations</b><Muted>Edit in Automations</Muted>
      </div>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
        {items.map((a, i) => (
          <div key={a.name} style={{ padding: "0 16px", borderLeft: i ? `1px solid ${t.LINE}` : "none" }}>
            <b style={{ fontSize: 13 }}>{a.name}</b>
            <div style={{ fontSize: 12, color: t.MUTED, margin: "3px 0 8px", lineHeight: 1.4 }}>{a.what}</div>
            {a.soon ? <span style={{ fontSize: 11, color: t.FAINT, fontWeight: 600 }}>{a.approval ? "Coming next · will ask you first" : "Coming next"}</span> : <Tag kind={a.approval ? "approval" : "auto"}>{a.approval ? "Needs approval" : "Runs on its own"}</Tag>}
          </div>
        ))}
      </div>
    </Card>
  );
}

export const inr = (n: number | null | undefined) => {
  const v = Number(n || 0);
  if (!v) return "—";
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
};
export const fmtDate = (iso?: string | null, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", opts) : "—";
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

/** Simple one-series line chart (SVG), last point labelled. */
export function LineChart({ values, labels, height = 170, label = "this week" }: { values: number[]; labels: string[]; height?: number; label?: string }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(460);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(e => setW(Math.max(240, Math.round(e[0].contentRect.width))));
    ro.observe(box.current); return () => ro.disconnect();
  }, []);
  const h = height, n = values.length;
  if (!n) return null;
  const max = Math.max(1, ...values) * 1.2;
  const px = (i: number) => 30 + (n === 1 ? 0 : i * (w - 50) / (n - 1));
  const py = (v: number) => h - 26 - (v / max) * (h - 46);
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find(s => s >= max / 3) || Math.ceil(max / 3);
  const grid = [0, step, step * 2, step * 3].filter(g => g <= max);
  return (
    <div ref={box} style={{ width: "100%" }}>
    <svg width={w} height={h} role="img" aria-label="Leads per week">
      {grid.map(g => <g key={g}><line x1={30} x2={w - 20} y1={py(g)} y2={py(g)} stroke={t.dark ? "#1E3E44" : "#E2D2D4"} /><text x={24} y={py(g) + 4} fontSize={10} fill={t.MUTED} textAnchor="end">{g}</text></g>)}
      <polyline points={values.map((v, i) => `${px(i)},${py(v)}`).join(" ")} fill="none" stroke={t.TEAL} strokeWidth={2} />
      {labels.map((l, i) => <text key={i} x={px(i)} y={h - 8} fontSize={10} fill={t.MUTED} textAnchor="middle">{l}</text>)}
      <circle cx={px(n - 1)} cy={py(values[n - 1])} r={4.5} fill={t.TEAL} stroke={t.BG} strokeWidth={2} />
      <text x={px(n - 1) - 8} y={py(values[n - 1]) - 10} fontSize={11} fontWeight={700} fill={t.INK} textAnchor="end">{values[n - 1]} {label}</text>
    </svg>
    </div>
  );
}

/**
 * Help.tsx — the Help Center.
 * Staff guide for everyone; Company guide only for Owners/Admins.
 * Text lives in src/lib/helpContent.ts. /help?topic=<id> opens a section.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { Page, Card, Btn, Muted, useT, T } from "@/components/ch/kit";
import { useAuth } from "@/hooks/useAuth";
import { STAFF, COMPANY, HelpSection } from "@/lib/helpContent";

const isOwner = (role?: string | null) => /^(owner|admin)$/i.test(role || "");

function text(s: HelpSection) {
  return [s.title, s.intro, ...(s.steps || []), ...(s.tips || []), ...(s.points || []).flatMap(p => [p.label, p.text])].join(" ").toLowerCase();
}

export default function Help() {
  const t = useT();
  const nav = useNavigate();
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const owner = isOwner(profile?.role);
  const topic = params.get("topic") || "";
  const startCompany = owner && COMPANY.some(s => s.id === topic);
  const [guide, setGuide] = useState<"staff" | "company">(startCompany ? "company" : "staff");
  const [q, setQ] = useState("");

  useEffect(() => { if (startCompany) setGuide("company"); }, [startCompany]);
  useEffect(() => { if (!owner && guide === "company") setGuide("staff"); }, [owner, guide]);

  const all = guide === "company" ? COMPANY : STAFF;
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? all.filter(s => { const x = text(s); return words.every(w => x.includes(w)); }) : all;
  }, [all, q]);

  const groups = useMemo(() => {
    const m = new Map<string, HelpSection[]>();
    shown.forEach(s => m.set(s.group, [...(m.get(s.group) || []), s]));
    return [...m.entries()];
  }, [shown]);

  const [active, setActive] = useState(topic);
  const go = (id: string) => {
    setActive(id);
    document.getElementById("help-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Open the section the ? button asked for
  useEffect(() => {
    if (!topic) return;
    const id = setTimeout(() => go(topic), 120);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, guide]);

  const switchGuide = (g: "staff" | "company") => { setGuide(g); setQ(""); setActive(""); if (topic) setParams({}, { replace: true }); };

  return (
    <Page title="Help" sub={guide === "company" ? "How the dashboard is run · visible to Owners only" : "How to use every page of the dashboard"}
      actions={<div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", borderRadius: 12, boxShadow: t.IN, width: 260, maxWidth: "100%" }}>
        <Search size={15} color={t.MUTED} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search help" aria-label="Search help"
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: t.INK, fontSize: 13 }} />
      </div>}>

      {owner && (
        <div style={{ display: "flex", gap: 28, borderBottom: `1px solid ${t.LINE}` }}>
          {([["staff", "Staff guide"], ["company", "Company guide"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => switchGuide(k)}
              style={{ background: "none", border: "none", borderRadius: 0, padding: "0 2px 12px", marginBottom: -1, cursor: "pointer", fontSize: 13.5,
                color: guide === k ? t.TEAL : t.MUTED, fontWeight: guide === k ? 600 : 400, borderBottom: `2px solid ${guide === k ? t.GOLD : "transparent"}` }}>{l}</button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <Card pad="14px 8px" className="hidden lg:block" style={{ width: 240, flexShrink: 0, position: "sticky", top: 0 }}>
          {groups.map(([g, list]) => (
            <div key={g} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11.5, color: t.FAINT, padding: "6px 12px 4px" }}>{g}</div>
              {list.map(s => (
                <button key={s.id} onClick={() => go(s.id)}
                  style={{ display: "block", width: "100%", textAlign: "left", border: "none", cursor: "pointer", padding: "7px 12px", borderRadius: 10, fontSize: 13,
                    background: active === s.id ? t.ROW : "transparent", color: active === s.id ? t.INK : t.MUTED, fontWeight: active === s.id ? 600 : 400 }}>{s.title}</button>
              ))}
            </div>
          ))}
          {!groups.length && <div style={{ padding: "8px 12px" }}><Muted>No matches</Muted></div>}
        </Card>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          {!shown.length && (
            <Card><div style={{ textAlign: "center", padding: "28px 0" }}>
              <b style={{ fontSize: 14 }}>Nothing matches "{q}"</b>
              <div style={{ fontSize: 13, color: t.MUTED, marginTop: 4 }}>Try a simpler word, like voucher, password or chat</div>
            </div></Card>
          )}
          {shown.map(s => <SectionCard key={s.id} s={s} t={t} highlight={active === s.id} onOpen={s.route ? () => nav(s.route!) : undefined} />)}
        </div>
      </div>
    </Page>
  );
}

function SectionCard({ s, t, highlight, onOpen }: { s: HelpSection; t: T; highlight: boolean; onOpen?: () => void }) {
  return (
    <div id={"help-" + s.id} style={{ scrollMarginTop: 16 }}>
      <Card pad="24px 26px" style={{ outline: highlight ? `1.5px solid ${t.GOLD}` : "none", outlineOffset: 2 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: t.FAINT, marginBottom: 2 }}>{s.group}</div>
            <div className="font-serif" style={{ fontSize: 22 }}>{s.title}</div>
          </div>
          {onOpen && <Btn onClick={onOpen}>Open page<ArrowRight size={15} /></Btn>}
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: t.MUTED, margin: "8px 0 0", maxWidth: 720 }}>{s.intro}</p>

        {s.diagram === "system" && <SystemDiagram t={t} />}

        {s.steps && (
          <ol style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "flex", flexDirection: "column", gap: 10, maxWidth: 760 }}>
            {s.steps.map((x, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 12, alignItems: "baseline", fontSize: 13.5, lineHeight: 1.6 }}>
                <span style={{ width: 24, height: 24, borderRadius: 99, background: t.TEAL_BG, color: t.TEAL, fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                <span>{x}</span>
              </li>
            ))}
          </ol>
        )}

        {s.points && (
          <div style={{ marginTop: 14, maxWidth: 820 }}>
            {s.points.map((p, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[220px_1fr]" style={{ gap: "4px 20px", padding: "11px 0", borderTop: i ? `1px solid ${t.LINE}` : "none", fontSize: 13.5, lineHeight: 1.6 }}>
                <b style={{ fontWeight: 600 }}>{p.label}</b>
                <span style={{ color: t.MUTED }}>{p.text}</span>
              </div>
            ))}
          </div>
        )}

        {s.tips && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8, maxWidth: 760 }}>
            {s.tips.map((x, i) => (
              <div key={i} style={{ borderLeft: `2px solid ${t.GOLD}`, padding: "2px 0 2px 12px", fontSize: 13, lineHeight: 1.6, color: t.MUTED }}>{x}</div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Simple picture of how the five services connect. */
function SystemDiagram({ t }: { t: T }) {
  const box = (title: string, what: string, accent = false) => (
    <div style={{ padding: "12px 14px", borderRadius: 14, boxShadow: t.IN, minWidth: 0, borderTop: accent ? `2px solid ${t.GOLD}` : undefined }}>
      <b style={{ fontSize: 13.5 }}>{title}</b>
      <div style={{ fontSize: 12, color: t.MUTED, lineHeight: 1.45, marginTop: 2 }}>{what}</div>
    </div>
  );
  const arrow = <div style={{ color: t.FAINT, textAlign: "center", fontSize: 18, lineHeight: 1 }} aria-hidden>↓</div>;
  return (
    <div style={{ margin: "18px 0 4px", display: "flex", flexDirection: "column", gap: 8, maxWidth: 760 }}>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr]" style={{ gap: 10 }}>
        {box("Your team", "Opens the dashboard in any browser", true)}
        {box("GitHub", "Keeps the code. A push publishes changes to Vercel and Render")}
      </div>
      {arrow}
      {box("Vercel · the website", "custom-holidays.vercel.app: every page your team sees")}
      {arrow}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr]" style={{ gap: 10 }}>
        {box("Supabase · the database", "Clients, trips, vouchers, chat, logins and files")}
        {box("Render · the server", "Reads Gmail, extracts documents, runs CH Assistant and automations")}
      </div>
      {arrow}
      {box("Google · Gmail and Drive", "Supplier emails come in, trip folders go out")}
    </div>
  );
}

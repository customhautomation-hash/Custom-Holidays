/**
 * GlobalSearch.tsx
 * 
 * A cmd+K / ctrl+K triggered search bar that searches across:
 * - Leads (from Supabase)
 * - Suppliers (from Supabase)
 * - Pages / nav links (static)
 * - Quick actions
 * 
 * Drop into DashboardLayout header.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useDarkMode } from "@/hooks/useDarkMode";
import {
  Search, X, Users, Truck, LayoutDashboard, TrendingUp,
  FileText, MessageSquare, IndianRupee, CalendarClock,
  Megaphone, UserCircle2, Globe, Handshake, Bot,
  Sparkles, ImagePlus, Zap, Map, ArrowRight, Clock,
  ChevronRight, Scale, FolderTree, FileSpreadsheet, BookOpen, ListTodo, CalendarPlus,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type ResultCategory = "pages" | "leads" | "suppliers" | "actions";

interface SearchResult {
  id: string;
  category: ResultCategory;
  label: string;
  sublabel?: string;
  icon: React.ElementType;
  color: string;
  action: () => void;
}

// ── Static nav pages ─────────────────────────────────────────────────────────

const NAV_PAGES = [
  { label: "Overview",          url: "/",                  icon: LayoutDashboard, color: "#13585B" },
  { label: "Leads",             url: "/leads",             icon: Users,           color: "#13585B" },
  { label: "Campaigns",         url: "/campaign-design",   icon: Megaphone,       color: "#13585B" },
  { label: "Book a Meeting",    url: "/book",              icon: CalendarPlus,    color: "#13585B" },
  { label: "Itineraries",       url: "/itineraries",       icon: Map,             color: "#13585B" },
  { label: "Price Compare",     url: "/price-compare",     icon: Scale,           color: "#13585B" },
  { label: "Quote Generator",   url: "/quotes",            icon: FileSpreadsheet, color: "#13585B" },
  { label: "Trip Documents",    url: "/trip-documents",    icon: FolderTree,      color: "#13585B" },
  { label: "Clients & PMS",     url: "/client-pms",        icon: UserCircle2,     color: "#13585B" },
  { label: "Suppliers",         url: "/suppliers",         icon: Truck,           color: "#13585B" },
  { label: "Active Deals",      url: "/active-deals",      icon: Handshake,       color: "#13585B" },
  { label: "Rates Library",     url: "/knowledge-base",    icon: BookOpen,        color: "#13585B" },
  { label: "Content",           url: "/content",           icon: FileText,        color: "#13585B" },
  { label: "Creatives",         url: "/creatives",         icon: ImagePlus,       color: "#13585B" },
  { label: "Web Analytics",     url: "/web-analytics",     icon: Globe,           color: "#13585B" },
  { label: "To-do",             url: "/todo",              icon: ListTodo,        color: "#13585B" },
  { label: "Team Chat",         url: "/chat",              icon: MessageSquare,   color: "#13585B" },
  { label: "Automations",       url: "/automations",       icon: Zap,             color: "#13585B" },
  { label: "Finance KPIs",      url: "/finance-kpis",      icon: IndianRupee,     color: "#13585B" },
  { label: "CH Assistant",      url: "/mxai",              icon: Sparkles,        color: "#B8913E" },
  { label: "My Profile",        url: "/profile",           icon: UserCircle2,     color: "#13585B" },
];

const QUICK_ACTIONS = [
  { label: "Ask CH Assistant",  url: "/mxai",              icon: Sparkles,        color: "#B8913E" },
  { label: "Add New Lead",      url: "/leads",             icon: Users,           color: "#13585B" },
  { label: "View Automations",  url: "/automations",       icon: Zap,             color: "#D48A2E" },
  { label: "Team Chat",         url: "/chat",              icon: MessageSquare,   color: "#1F6F72" },
];

const CATEGORY_LABELS: Record<ResultCategory, string> = {
  pages:     "Pages",
  leads:     "Leads",
  suppliers: "Suppliers",
  actions:   "Quick Actions",
};

// ── Debounce ──────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [recent, setRecent]     = useState<SearchResult[]>([]);

  const inputRef    = useRef<HTMLInputElement>(null);
  const listRef     = useRef<HTMLDivElement>(null);
  const navigate    = useNavigate();
  const { dark }    = useDarkMode();
  const debouncedQ  = useDebounce(query, 220);

  // ── Theme ──────────────────────────────────────────────────────────────────
  const BG           = dark ? "#0C2C32" : "#F3EAEA";
  const PANEL_BG     = dark ? "#10343A" : "#F3EAEA";
  const SHADOW_OUT   = dark
    ? "5px 5px 12px #061A1E, -5px -5px 12px #16434A"
    : "5px 5px 12px #D9C6C8, -5px -5px 12px #FFFFFF";
  const SHADOW_IN    = dark
    ? "inset 3px 3px 7px #061A1E, inset -3px -3px 7px #16434A"
    : "inset 3px 3px 7px #D9C6C8, inset -3px -3px 7px #FFFFFF";
  const PANEL_SHADOW = dark
    ? "0 20px 60px #0A0A18, 0 4px 20px #061A1E"
    : "0 20px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)";
  const TEXT_MAIN    = dark ? "#E6EFEC" : "#1A2324";
  const TEXT_MUTED   = dark ? "#8FA6A3" : "#5B6766";
  const BORDER       = dark ? "#1E3E44" : "#E8DADB";
  const HOVER_BG     = dark ? "rgba(20,100,110,0.10)" : "rgba(20,100,110,0.07)";

  // ── Keyboard shortcut (Ctrl+K / Cmd+K) ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);

  // ── Search logic ───────────────────────────────────────────────────────────
  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const lower = q.toLowerCase();
    const found: SearchResult[] = [];

    // Pages
    NAV_PAGES
      .filter(p => p.label.toLowerCase().includes(lower))
      .slice(0, 4)
      .forEach(p => {
        found.push({
          id: `page-${p.url}`,
          category: "pages",
          label: p.label,
          sublabel: p.url,
          icon: p.icon,
          color: p.color,
          action: () => { navigate(p.url); close(); },
        });
      });

    try {
      // Leads
      const { data: leads } = await supabase
        .from("contacts")
        .select("id, name, email, stage, destination")
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,destination.ilike.%${q}%`)
        .limit(4);

      (leads ?? []).forEach(l => {
        found.push({
          id: `lead-${l.id}`,
          category: "leads",
          label: l.name ?? "Unnamed Lead",
          sublabel: `${l.stage ?? "New"} · ${l.destination ?? l.email ?? ""}`,
          icon: Users,
          color: "#13585B",
          action: () => { navigate("/leads"); close(); },
        });
      });

      // Suppliers
      const { data: suppliers } = await supabase
        .from("suppliers")
        .select("id, name, company_name, supplier_type, place")
        .or(`name.ilike.%${q}%,company_name.ilike.%${q}%,place.ilike.%${q}%`)
        .limit(4);

      (suppliers ?? []).forEach(s => {
        found.push({
          id: `sup-${s.id}`,
          category: "suppliers",
          label: s.company_name ?? s.name ?? "Supplier",
          sublabel: `${s.supplier_type ?? ""} · ${s.place ?? ""}`.replace(/^ · | · $/, ""),
          icon: Truck,
          color: "#D48A2E",
          action: () => { navigate("/suppliers"); close(); },
        });
      });
    } catch {
      // Supabase errors are non-fatal
    }

    setResults(found);
    setActiveIdx(0);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { search(debouncedQ); }, [debouncedQ, search]);

  // ── Arrow key navigation ───────────────────────────────────────────────────
  const displayList = query.trim() ? results : recent.length ? recent : QUICK_ACTIONS.map(a => ({
    id: `action-${a.url}`,
    category: "actions" as ResultCategory,
    label: a.label,
    icon: a.icon,
    color: a.color,
    action: () => { navigate(a.url); close(); },
  }));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, displayList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (displayList[activeIdx]) {
        const item = displayList[activeIdx];
        addRecent(item);
        item.action();
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  // ── Recent items ───────────────────────────────────────────────────────────
  const addRecent = (item: SearchResult) => {
    setRecent(prev => {
      const filtered = prev.filter(r => r.id !== item.id);
      return [item, ...filtered].slice(0, 5);
    });
  };

  const close = () => { setOpen(false); setQuery(""); };

  // ── Group results by category ──────────────────────────────────────────────
  const grouped = displayList.reduce<Record<string, SearchResult[]>>((acc, r) => {
    const cat = r.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  // ── Trigger button ─────────────────────────────────────────────────────────
  const triggerBtn = (
    <button
      onClick={() => setOpen(true)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: BG,
        boxShadow: SHADOW_IN,
        border: "none",
        borderRadius: 10,
        padding: "0 12px",
        height: 36,
        cursor: "pointer",
        color: TEXT_MUTED,
        transition: "all 0.2s",
        minWidth: 160,
      }}
    >
      <Search style={{ width: 14, height: 14, flexShrink: 0 }} />
      <span style={{ fontSize: 12, flex: 1, textAlign: "left" }}>Search...</span>
      <kbd style={{
        fontSize: 10, color: TEXT_MUTED, background: BG,
        boxShadow: SHADOW_OUT, borderRadius: 6,
        padding: "2px 6px", fontFamily: "inherit",
      }}>
        ⌘K
      </kbd>
    </button>
  );

  // ── Modal ──────────────────────────────────────────────────────────────────
  if (!open) return triggerBtn;

  return (
    <>
      {triggerBtn}

      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: "fixed", inset: 0, zIndex: 999,
          background: dark ? "rgba(10,10,24,0.7)" : "rgba(60,60,80,0.35)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Search panel */}
      <div
        style={{
          position: "fixed", top: "12vh", left: "50%",
          transform: "translateX(-50%)",
          width: "min(640px, 94vw)",
          zIndex: 1000,
          background: PANEL_BG,
          borderRadius: 20,
          boxShadow: PANEL_SHADOW,
          border: `1px solid ${BORDER}`,
          overflow: "hidden",
        }}
      >
        {/* Input row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px",
          borderBottom: displayList.length ? `1px solid ${BORDER}` : "none",
        }}>
          {loading
            ? <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${BORDER}`, borderTopColor: "#1F6F72", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
            : <Search style={{ width: 18, height: 18, color: TEXT_MUTED, flexShrink: 0 }} />}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search leads, suppliers, pages..."
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontSize: 15, color: TEXT_MAIN, fontFamily: "inherit",
            }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 2 }}>
              <X style={{ width: 15, height: 15 }} />
            </button>
          )}
          <kbd
            onClick={close}
            style={{
              fontSize: 10, color: TEXT_MUTED, background: PANEL_BG,
              boxShadow: SHADOW_OUT, borderRadius: 6,
              padding: "3px 7px", fontFamily: "inherit", cursor: "pointer",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{ maxHeight: "60vh", overflowY: "auto", padding: "8px 0" }}
        >
          {displayList.length === 0 && query.trim() && !loading && (
            <div style={{ padding: "28px 16px", textAlign: "center", color: TEXT_MUTED, fontSize: 13 }}>
              No results for <strong style={{ color: TEXT_MAIN }}>"{query}"</strong>
            </div>
          )}

          {!query.trim() && (
            <p style={{ fontSize: 10, fontWeight: 600, color: TEXT_MUTED, padding: "4px 16px 8px", textTransform: "" }}>
              {recent.length ? "Recent" : "Quick Actions"}
            </p>
          )}

          {query.trim()
            ? /* Grouped results */
              Object.entries(grouped).map(([cat, items]) => (
                <div key={cat}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: TEXT_MUTED, padding: "8px 16px 4px", textTransform: "" }}>
                    {CATEGORY_LABELS[cat as ResultCategory]}
                  </p>
                  {items.map(item => {
                    const idx = displayList.indexOf(item);
                    return (
                      <ResultRow
                        key={item.id}
                        item={item}
                        idx={idx}
                        active={activeIdx === idx}
                        HOVER_BG={HOVER_BG}
                        TEXT_MAIN={TEXT_MAIN}
                        TEXT_MUTED={TEXT_MUTED}
                        BG={BG}
                        SHADOW_OUT={SHADOW_OUT}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => { addRecent(item); item.action(); }}
                      />
                    );
                  })}
                </div>
              ))
            : /* Flat list for recent/quick actions */
              displayList.map((item, idx) => (
                <ResultRow
                  key={item.id}
                  item={item}
                  idx={idx}
                  active={activeIdx === idx}
                  HOVER_BG={HOVER_BG}
                  TEXT_MAIN={TEXT_MAIN}
                  TEXT_MUTED={TEXT_MUTED}
                  BG={BG}
                  SHADOW_OUT={SHADOW_OUT}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => { addRecent(item); item.action(); }}
                />
              ))
          }
        </div>

        {/* Footer */}
        <div style={{
          borderTop: `1px solid ${BORDER}`, padding: "8px 16px",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          {[
            { keys: ["↑", "↓"], label: "navigate" },
            { keys: ["↵"],      label: "open" },
            { keys: ["ESC"],    label: "close" },
          ].map(({ keys, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {keys.map(k => (
                <kbd key={k} style={{
                  fontSize: 10, color: TEXT_MUTED, background: BG,
                  boxShadow: SHADOW_OUT, borderRadius: 4,
                  padding: "1px 5px", fontFamily: "inherit",
                }}>{k}</kbd>
              ))}
              <span style={{ fontSize: 10, color: TEXT_MUTED }}>{label}</span>
            </div>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 10, color: TEXT_MUTED }}>
            Custom Holidays Search
          </span>
        </div>
      </div>

      {/* Spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ── Result Row ────────────────────────────────────────────────────────────────

function ResultRow({
  item, idx, active, HOVER_BG, TEXT_MAIN, TEXT_MUTED, BG, SHADOW_OUT, onMouseEnter, onClick,
}: {
  item: SearchResult; idx: number; active: boolean;
  HOVER_BG: string; TEXT_MAIN: string; TEXT_MUTED: string;
  BG: string; SHADOW_OUT: string;
  onMouseEnter: () => void; onClick: () => void;
}) {
  return (
    <div
      data-idx={idx}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "9px 16px", cursor: "pointer",
        background: active ? HOVER_BG : "transparent",
        transition: "background 0.1s",
      }}
    >
      {/* Icon */}
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: BG, boxShadow: SHADOW_OUT,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: item.color,
      }}>
        <item.icon style={{ width: 15, height: 15 }} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.label}
        </p>
        {item.sublabel && (
          <p style={{ fontSize: 11, color: TEXT_MUTED, margin: "1px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.sublabel}
          </p>
        )}
      </div>

      {/* Arrow */}
      {active && <ChevronRight style={{ width: 14, height: 14, color: TEXT_MUTED, flexShrink: 0 }} />}
    </div>
  );
}
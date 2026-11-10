/**
 * PriceCompare.tsx — Skyscanner-style hotel price comparison (dashboard colours).
 * Online prices from every booking site Google Hotels knows (backend /api/prices, SerpApi),
 * plus the team's own supplier rates (Ottila, TBO, DMC). Cheapest first, no markup.
 *  • "Your hotels" (added by name) are pinned first with every site's price.
 *  • "Other hotels in <city>" lists the rest of the city (only hotels that have a price).
 * Ottila-style rooms picker; ROE fetched automatically; prices searched in the trip currency.
 * "Download Excel" writes the standard CustomHolidays costing sheet.
 */
import { useEffect, useRef, useState } from "react";
import { API_ROOT } from "../lib/api";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useDarkMode } from "@/hooks/useDarkMode";
import { supabase } from "@/lib/supabase";
import {
  Scale, Plus, Minus, X, Search, Loader2, Download, AlertTriangle, CheckCircle2, RefreshCw, Trash2,
  Star, ExternalLink, ChevronDown, ChevronUp, BedDouble, KeyRound, Users, Pin, Zap,
} from "lucide-react";

const API = `${API_ROOT}/prices`;
const STORE = "pc:trip:v3";
const CORR = "pc:corr:v1";   // learned "website price ÷ Google price" per site (+ per city), from confirmed prices
const words = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !["hotel", "the", "and", "resort", "by"].includes(w));
const nameMatch = (a: string, b: string) => { const A = new Set(words(a)), B = words(b); if (!A.size || !B.length) return 0; return B.filter(w => A.has(w)).length / Math.max(A.size, B.length); };
const median = (a: number[]) => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const MEALS = ["RO", "BB", "HB", "FB", "AI"];
const LABELS = ["", "base", "upg 1", "upg 2", "upg 3"];
const CCYS = ["USD", "EUR", "CHF", "GBP", "AED", "SGD", "THB", "AUD", "INR"];
const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CHF: "CHF ", AED: "AED ", SGD: "S$", THB: "฿", AUD: "A$", INR: "₹" };

interface OnlinePrice { source: string; total: number; per_night: number; free_cancellation: boolean; link?: string; before_tax?: number | null; room?: string | null }
interface Online { found: boolean; name?: string; stars?: number; rating?: number; reviews?: number; image?: string; link?: string; prices: OnlinePrice[]; suggestions?: string[]; currency?: string; roeAt?: number; site_rooms?: Record<string, { name: string; total: number; per_night: number; free_cancellation: boolean; link?: string }[]> }
interface Hotel {
  id: string; name: string; room: string; meal: string; label: string; inPkg: boolean;
  ottila: string; tbo: string; otherSource: string; other: string; cancel: string;
  mine?: boolean; token?: string; image?: string; stars?: number; rating?: number; reviews?: number; fromPrice?: number; fromSource?: string; fromLink?: string;
  online?: Online; confirmed?: Record<string, number>; confirmedAuto?: Record<string, number>; confirmedRoom?: Record<string, string>; confirmedSite?: Record<string, { amt: number; ccy: string }>; confirmedCxl?: Record<string, Cxl>; roomsBySite?: Record<string, { url: string; at: number; list: RoomRow[] }>; picks?: RoomPick[]; roomSel?: Record<string, string>; noExcel?: boolean; excelHide?: string[]; listsAt?: number; listTried?: Record<string, number>; mealBySite?: Record<string, string>; soldOut?: Record<string, number>; roomTypes?: { type: string; m: { site: string; name: string }[] }[]; roomTypesSig?: string; typeExact?: Record<string, { total: number; room: string; cxl: string; meal?: string; at: number; full?: string; note?: string }>; typesLoading?: boolean; loading?: boolean; error?: string; searchedFor?: string; open?: boolean; showRates?: boolean; checkedAt?: number;
}
// one room + option read from a site's room list; "exact" = the checkout total after Check exact
interface RoomRow { key: string; room: string; meal: string; cxl: string; total: number; taxes: boolean; ccy: string; exact?: number; exactAt?: number; exactCxl?: string; full?: string; rate?: string; shown?: string }
// a room + meal + cancellation option added to the Excel from the "All rooms" list
interface RoomPick { id: string; site: string; key: string; room: string; meal: string; cxl: string; total: number; taxes: boolean; exact?: number }
const MEAL_CODE: Record<string, string> = { "Room only": "RO", Breakfast: "BB", "Half board": "HB", "Full board": "FB", "All inclusive": "AI" };
// ── room types: the same room on different sites (word matching; Gemini refines it) ──
const ROOM_CATS = ["presidential suite", "royal suite", "penthouse", "villa", "cottage", "apartment", "studio", "family room", "junior suite", "executive suite", "deluxe suite", "premier suite", "club suite", "suite", "club", "executive", "premier", "premium", "luxury", "deluxe", "superior", "classic", "standard"];
const VIEWS = ["sea", "ocean", "lake", "pool", "garden", "city", "mountain", "river", "palace", "beach", "bay", "golf", "courtyard"];
const roomWordKey = (name: string) => {
  const t = " " + name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ") + " ";
  const cat = ROOM_CATS.find(c => t.includes(" " + c + " ")) || "room";
  const bed = /\btwin\b|\b2 single|\btwo single|single beds|\b2 twin|\b2 beds\b|\btwo beds\b/.test(t) ? "twin" : /\bking\b|\bqueen\b|\bdouble\b|\b1 large bed|\bkingsize|\bking size/.test(t) ? "double" : "";
  const view = VIEWS.find(v => new RegExp(`\\b${v}\\b.{0,14}view|view.{0,6}\\b${v}\\b|\\b${v} facing|\\b${v} front`).test(t)) || "";
  return [cat, bed, view].join("|");
};
const prettyRoomKey = (k: string) => {
  const [cat, bed, view] = k.split("|");
  const C = cat === "room" ? "Room" : cat.replace(/\b\w/g, m => m.toUpperCase()) + (/(suite|villa|cottage|apartment|studio|penthouse|room)$/.test(cat) ? "" : " Room");
  return [C, bed === "twin" ? "Twin beds" : bed === "double" ? "Double / King bed" : "", view ? view[0].toUpperCase() + view.slice(1) + " view" : ""].filter(Boolean).join(", ");
};
interface CatItem { site: string; name: string; total: number; src: "google" | "site"; key?: string; meal?: string; cxl?: string; taxes?: boolean; exact?: number; free?: boolean; full?: string; rate?: string; shown?: string }
const MEAL_NAME: Record<string, string> = { RO: "Room only", BB: "Breakfast", HB: "Half board", FB: "Full board", AI: "All inclusive" };
type SortKey = "cheapest" | "best" | "rated";
// cancellation terms read from the site: free until a date, then a fee (or non-refundable)
interface Cxl { kind?: "free" | "partial" | "non-refundable"; until?: string; fee?: number; feeCcy?: string; feeFrom?: string; note?: string; text?: string; summary?: string; full?: string; pct?: number; noshow?: string }
// the fee in a few words: "fee: 1st night", "fee: 50%", "fee: full amount"
const cxlFee = (full?: string) => {
  const t = (full || "").replace(/\s+/g, " ");
  if (/first night|1st night|one night/i.test(t)) return "fee: 1st night";
  const p = t.match(/(\d{1,3})\s?%/); if (p) return `fee: ${p[1]}%`;
  if (/full (?:amount|price|stay)|100\s?%|entire stay/i.test(t)) return "fee: full amount";
  const n = t.match(/(\d+) nights?/i); if (n && /charge|fee|pay/i.test(t)) return `fee: ${n[1]} night${n[1] === "1" ? "" : "s"}`;
  return "";
};
const cxlTerms = (full?: string) => {
  if (!full) return "";
  const sents = full.replace(/\s+/g, " ").split(/(?<=[.!])\s+|\s·\s/).map(x => x.trim())
    .filter(x => /\d|night|%|first|full amount|refund/i.test(x) && !/^(cancellation polic|change or cancel your|refund process|how much will it cost)/i.test(x) && x.length > 12);
  const t = sents.slice(0, 2).join(" ");
  return t.length > 170 ? t.slice(0, 168) + "…" : t;
};
// cancellation in numbers only: dates, amounts, percentages
const cxlLine = (c?: Cxl, total?: number) => {
  if (!c) return "";
  if (c.summary && c.summary.length <= 70) return c.summary;   // long wording → the ⓘ
  const d = (iso?: string) => { if (!iso) return ""; const x = new Date(iso + "T00:00:00"); return isNaN(+x) ? iso : x.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
  const amt = (n?: number, ccy?: string) => n ? `${!ccy || ccy === "INR" ? "₹" : ccy + " "}${Math.round(n).toLocaleString("en-IN")}` : "";
  if (c.kind === "non-refundable") return `Non-refundable · 100% charged${total ? ` (${amt(total)})` : ""}`;
  const parts: string[] = [];
  if (c.until) parts.push(`Free till ${d(c.until)}`); else if (c.kind === "free") parts.push("Free cancellation");
  const fee = c.fee ? amt(c.fee, c.feeCcy) : c.pct && total ? amt(total * c.pct / 100) : "";
  if (fee || c.pct) parts.push(`${c.until ? "after: " : ""}${c.pct ? `${c.pct}% ` : ""}fee${fee ? ` ${fee}` : ""}${c.feeFrom && !c.until ? ` from ${d(c.feeFrom)}` : ""}${c.note ? ` (${c.note})` : ""}`);
  if (c.noshow) parts.push(`no-show: ${c.noshow}`);
  if (parts.length) return parts.join(" · ");
  // no dates / amounts read → the policy's own terms, shortened (only the sentences with dates, amounts or nights)
  const fee2 = cxlFee(c.full || c.text);
  return c.kind === "partial" ? `Partially refundable${fee2 ? " · " + fee2 : ""}` : fee2 || "";
};
const cxlShort = (c?: Cxl, total?: number) => !c ? "" : c.summary ? c.summary : c.kind === "non-refundable" ? cxlLine(c, total) : c.until ? `Free cxl till ${c.until}${c.fee ? `, then ${Math.round(c.fee)}` : ""}` : c.kind === "free" ? "Free cxl" : c.fee ? `Cxl fee ${Math.round(c.fee)}` : (c.text || "");
interface City { id: string; name: string; checkIn: string; checkOut: string; stars: number; hotels: Hotel[]; sort: SortKey; finding?: boolean; foundFor?: string; newName?: string }
interface Room { adults: number; ages: number[] }
interface Trip { name: string; roomList: Room[]; currency: string; roe: string; roeNote: string; gst: string; tcs: string; notes: string; perNight?: boolean; cities: City[] }
interface Deal { cxl?: Cxl;
 source: string; rupees: number; amt: number; ccy: string; before?: number; mine: boolean; free: boolean; link?: string; google?: number; confirmed?: boolean; est?: number; room?: string; fx?: { kind: string; f: number; n: number; lo: number; hi: number } }

const uid = () => Math.random().toString(36).slice(2, 9);
const newHotel = (p: Partial<Hotel> = {}): Hotel => ({ id: uid(), name: "", room: "", meal: "BB", label: "", inPkg: false, ottila: "", tbo: "", otherSource: "DMC", other: "", cancel: "", ...p });
const newCity = (): City => ({ id: uid(), name: "", checkIn: "", checkOut: "", stars: 5, hotels: [], sort: "cheapest" });
const EMPTY: Trip = { name: "", roomList: [{ adults: 2, ages: [] }], currency: "USD", roe: "", roeNote: "", gst: "5", tcs: "2", notes: "", cities: [newCity()] };
const isMine = (h: Hotel) => h.mine ?? !h.token;   // added by name = yours; from "other hotels" = not

function loadTrip(): Trip {
  try {
    const t = JSON.parse(localStorage.getItem(STORE) || "");
    if (t?.cities && t?.roomList) {
      // prices saved by older versions in USD/EUR are dropped, so everything shown is in ₹ as the sites show it
      t.cities = t.cities.map((c: City) => ({ ...c, finding: false, hotels: c.hotels.map((h: Hotel) =>
        h.online?.currency && h.online.currency !== "INR" ? { ...h, online: undefined, searchedFor: undefined, checkedAt: undefined, open: false, loading: false } : { ...h, loading: false }) }));
      return t;
    }
  } catch { /* */ }
  try { // older version of this page → keep its cities/hotels
    const o = JSON.parse(localStorage.getItem("pc:trip:v2") || "");
    if (o?.cities) return { ...EMPTY, name: o.name || "", currency: o.currency || "USD", gst: o.gst ?? "5", tcs: o.tcs ?? "2", notes: o.notes || "", cities: o.cities, roomList: [{ adults: o.adults || 2, ages: [] }] };
  } catch { /* */ }
  return EMPTY;
}

const nightsOf = (c: City) => { const a = Date.parse(c.checkIn), b = Date.parse(c.checkOut); return a && b && b > a ? Math.round((b - a) / 86400000) : 0; };
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as any)[n % 10] || "th");
const nice = (iso: string) => { const d = new Date(iso + "T00:00:00"); return isNaN(+d) ? iso : `${ord(d.getDate())} ${d.toLocaleString("en", { month: "short" })}`; };
const num = (s: string) => { const v = parseFloat(String(s).replace(/[^0-9.]/g, "")); return isNaN(v) ? 0 : v; };
const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");
// room name only (older checks also saved "site showed USD …, converted at ₹…")
const roomOnly = (s?: string) => (s || "").replace(/(^|\s·\s)site showed .*$/, "").trim();
const money = (v: number, ccy: string) => ccy === "INR" ? inr(v) : `${SYMBOL[ccy] || ccy + " "}${Math.round(v).toLocaleString("en-IN")}`;
const ratingWord = (r?: number) => !r ? "" : r >= 4.7 ? "Exceptional" : r >= 4.5 ? "Excellent" : r >= 4.2 ? "Very good" : r >= 3.8 ? "Good" : "Okay";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const clock = (t?: number) => t ? new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";

// ── rooms text ("4 Adults, 1 Child in 2 Rooms") ────────────────────────────────
const roomSummary = (rs: Room[]) => {
  const a = rs.reduce((s, r) => s + r.adults, 0), c = rs.reduce((s, r) => s + r.ages.length, 0);
  return `${plural(a, "Adult", "Adults")}${c ? `, ${plural(c, "Child", "Children")}` : ""} in ${plural(rs.length, "Room", "Rooms")}`;
};
const ROOM_KIND: Record<number, string> = { 1: "SGL", 2: "DBL", 3: "TPL", 4: "QUAD" };
const roomsForExcel = (rs: Room[]) => {
  const g = new Map<string, { n: number; r: Room }>();
  rs.forEach(r => { const k = `${r.adults}|${r.ages.join(",")}`; g.set(k, { n: (g.get(k)?.n || 0) + 1, r }); });
  const parts = [...g.values()].map(({ n, r }) => `${n} ${ROOM_KIND[r.adults] || `${r.adults} pax`}${r.ages.length ? ` + ${r.ages.length} CHD (${r.ages.join(", ")}y)` : ""}`);
  return `${plural(rs.length, "Room", "Rooms")} (${parts.join(", ")})`;
};
const paxForExcel = (rs: Room[]) => {
  const a = rs.reduce((s, r) => s + r.adults, 0), ages = rs.flatMap(r => r.ages);
  return `${plural(a, "Adult", "Adults")}${ages.length ? `, ${plural(ages.length, "Child", "Children")} (${ages.join(", ")} yrs)` : ""}`;
};

async function authFetch(path: string, body?: any) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${data.session?.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { let m = `Error ${res.status}`; try { m = (await res.json()).detail || m; } catch { /* */ } throw new Error(m); }
  return res;
}

export default function PriceCompare() {
  const { dark } = useDarkMode();
  // ── Dashboard palette (neumorphic) ─────────────────────────────────────────
  const BG = dark ? "#0C2C32" : "#F3EAEA";
  const SHADOW_OUT = dark ? "5px 5px 12px #061A1E, -5px -5px 12px #16434A" : "5px 5px 12px #D9C6C8, -5px -5px 12px #FFFFFF";
  const SHADOW_SM = dark ? "3px 3px 7px #061A1E, -3px -3px 7px #16434A" : "3px 3px 7px #D9C6C8, -3px -3px 7px #FFFFFF";
  const SHADOW_IN = dark ? "inset 3px 3px 7px #061A1E, inset -3px -3px 7px #16434A" : "inset 3px 3px 7px #D9C6C8, inset -3px -3px 7px #FFFFFF";
  const TEXT = dark ? "#E6EFEC" : "#1A2324";
  const MUTED = dark ? "#8FA6A3" : "#5B6766";
  const ACCENT = "#13585B";
  const GRAD = "#13585B";
  const GREEN = "#2FA37A", PURPLE = "#2C6D70", WARN = "#C98A2B", ERR = "#1F6F72";
  const TINT = dark ? "rgba(107,127,212,0.14)" : "rgba(107,127,212,0.10)";

  const card: React.CSSProperties = { background: BG, borderRadius: 18, boxShadow: SHADOW_OUT };
  const inp: React.CSSProperties = { background: BG, boxShadow: SHADOW_IN, border: "none", borderRadius: 12, padding: "11px 14px", fontSize: 14.5, color: TEXT, outline: "none", width: "100%" };
  const lbl: React.CSSProperties = { fontSize: 12.5, fontWeight: 500, color: MUTED, display: "flex", flexDirection: "column", gap: 6 };
  const pill = (bg: string, fg = "#fff"): React.CSSProperties => ({ background: bg, color: fg, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, whiteSpace: "nowrap" });
  const btn = (kind: "primary" | "ghost" = "ghost"): React.CSSProperties => ({
    background: kind === "primary" ? GRAD : BG, color: kind === "primary" ? "#fff" : TEXT,
    boxShadow: SHADOW_SM, border: "none", borderRadius: 12, padding: "11px 18px", fontSize: 14, fontWeight: 600,
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
  });
  const round: React.CSSProperties = { width: 30, height: 30, borderRadius: 99, border: "none", background: BG, boxShadow: SHADOW_SM, color: ACCENT, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };

  const [trip, setTrip] = useState<Trip>(loadTrip);
  const [status, setStatus] = useState<{ configured: boolean; keys?: number; searches_left?: number; active_key?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cityTab, setCityTab] = useState<string>("");
  const [roomUi, setRoomUi] = useState<Record<string, { open?: boolean; meal?: string; cxl?: string; all?: boolean }>>({});
  const [preview, setPreview] = useState(false);
  // Excel only: its own costing currency + rate (the page itself stays as it is)
  const [xl, setXl] = useState<{ ccy: string; roe: string; busy?: boolean; note?: string }>({ ccy: "", roe: "" });
  const [cxlInfo, setCxlInfo] = useState<string>("");   // which row's full cancellation policy is open
  // room picker (one open at a time): which hotel|site, and where to draw the list
  const [picker, setPicker] = useState<{ id: string; left: number; top: number; width: number; up: boolean; maxH: number } | null>(null);
  useEffect(() => {
    if (!picker) return;
    const close = (e: Event) => { const el = document.getElementById("pc-room-picker"); if (el && e.target instanceof Node && el.contains(e.target)) return; setPicker(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setPicker(null); };
    const down = (e: MouseEvent) => { if (e.target instanceof Element && e.target.closest("[data-pc-picker-btn]")) return; close(e); };
    window.addEventListener("scroll", close, true); window.addEventListener("resize", close); window.addEventListener("keydown", key); window.addEventListener("mousedown", down);
    return () => { window.removeEventListener("mousedown", down); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); window.removeEventListener("keydown", key); };
  }, [picker?.id]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [roeBusy, setRoeBusy] = useState(false);
  const [roeErr, setRoeErr] = useState("");
  const [corr, setCorr] = useState<Record<string, number[]>>(() => { try { return JSON.parse(localStorage.getItem(CORR) || "{}") || {}; } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem(CORR, JSON.stringify(corr)); } catch { /* */ } }, [corr]);
  const cityOf = (h: Hotel) => (trip.cities.find(c => c.hotels.some(x => x.id === h.id))?.name || "").trim().toLowerCase();
  // learned correction for a site: same city first (1+ check), else that site anywhere (3+ checks)
  // How reliable is Google for this site? Uses checks from the same city first, else the site everywhere (3+ checks).
  //  exact  → all checks within ±2%: no change, shown as "usually exact"
  //  adjust → 2+ checks, all off the same way by a similar amount (spread ≤ 6%): price corrected by the median
  //  varies → checks go both ways / spread out: NO correction, flagged "confirm before quoting"
  //  hint   → only 1 check: no correction, just shows what that check found
  type Fx = { kind: "exact" | "adjust" | "varies" | "hint"; f: number; n: number; lo: number; hi: number };
  const factor = (site: string, city: string): Fx | null => {
    const local = corr[`${site}|${city}`] || [], all = corr[site] || [];
    const use = local.length ? local : all.length >= 3 ? all : [];
    if (!use.length) return null;
    const d = use.map(r => r - 1), lo = Math.min(...d), hi = Math.max(...d), n = use.length, f = median(use);
    if (d.every(x => Math.abs(x) <= 0.02)) return { kind: "exact", f: 1, n, lo, hi };
    if (n === 1) return { kind: "hint", f: 1, n, lo, hi };
    const sameWay = (lo > 0.02 && hi > 0) || (hi < -0.02 && lo < 0);
    if (sameWay && hi - lo <= 0.06) return { kind: "adjust", f, n, lo, hi };
    return { kind: "varies", f: 1, n, lo, hi };
  };
  const pct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
  const [editing, setEditing] = useState<{ hid: string; source: string; value: string } | null>(null);

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(trip)); } catch { /* */ } }, [trip]);
  const loadStatus = () => authFetch("/status").then(r => r.json()).then(setStatus).catch(() => setStatus({ configured: false }));
  useEffect(() => { loadStatus(); }, []);

  // ── Grab-price Chrome extension: receives the exact checkout price from a booking page ──
  type Grab = { id: number; site: string; hotel: string; total: number; url: string; checkIn?: string; checkOut?: string };
  const [extReady, setExtReady] = useState(false);
  const [extVer, setExtVer] = useState("");
  const [extAuto, setExtAuto] = useState(false);
  const [checks, setChecks] = useState<Record<string, string>>({});   // "hid|site" → "checking" | "ok" | error text
  const onCheckMsg = useRef<(m: any) => void>(() => {});
  const afterFetch = useRef<(c: City, h: Hotel) => void>(() => {});
  const lastAck = useRef(0);
  const visionOff = useRef(false);   // server has no GEMINI_API_KEY → don't keep asking
  const [extHelp, setExtHelp] = useState(false);   // the "set up the extension" steps
  const fx = useRef<Record<string, number>>({});   // ₹ per 1 unit, for prices a site showed in another currency              // last time the extension confirmed it received a check
  // automatic exact prices: ON by default (switch at the top)
  const [autoOn, setAutoOn] = useState<boolean>(() => { try { return localStorage.getItem("pc:auto") !== "off"; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem("pc:auto", autoOn ? "on" : "off"); } catch { /* */ } }, [autoOn]);
  const [grab, setGrab] = useState<Grab | null>(null);
  const [grabSel, setGrabSel] = useState<{ hid: string; site: string }>({ hid: "", site: "" });
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || !e.data || e.data.source !== "pc-grab-ext") return;
      if (e.data.type === "PC_EXT_READY") { setExtReady(true); if (e.data.version) setExtVer(String(e.data.version)); if (e.data.auto) setExtAuto(true); }
      if (/^PC_CHECK_/.test(e.data.type)) onCheckMsg.current(e.data);
      if (e.data.type === "PC_EXT_STALE") onCheckMsg.current({ type: "PC_EXT_STALE" });
      if (e.data.type === "PC_GRAB_PRICE" && e.data.grab?.total > 0) { setExtReady(true); setGrab(e.data.grab); }
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "pc-page", type: "PC_PING" }, location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const setT = (p: Partial<Trip>) => setTrip(t => ({ ...t, ...p }));
  const cc = trip.currency, roe = num(trip.roe);

  // ── ROE: fetched automatically whenever the currency changes (and on open) ─
  const fetchRoe = async (ccy = cc) => {
    if (ccy === "INR") { setT({ roe: "1", roeNote: "" }); return; }
    setRoeBusy(true); setRoeErr("");
    try {
      const res = await authFetch(`/roe?ccy=${ccy}`);
      const r = res.ok ? await res.json() : null;
      if (!r || !Number(r.roe)) throw new Error("Couldn't fetch today's rate. Type it in");
      setTrip(t => (t.currency !== ccy ? t : { ...t, roe: String(r.roe), roeNote: [r.source, r.date].filter(Boolean).join(" · ") + (r.stale ? " (last known)" : "") }));
    } catch (e: any) { setRoeErr(e.message); }
    finally { setRoeBusy(false); }
  };
  useEffect(() => { fetchRoe(cc); }, [cc]);

  const fmtCc = (rupees: number) => (cc === "INR" || !roe ? "" : money(rupees / roe, cc));
  // Online prices are fetched in ₹ — exactly what the sites show a customer browsing from India —
  // and converted to the trip currency with the ROE (no double conversion via USD/EUR).
  const searchCcy = "INR";

  const setCity = (cid: string, p: Partial<City>) => setTrip(t => ({ ...t, cities: t.cities.map(c => (c.id === cid ? { ...c, ...p } : c)) }));
  const setHotel = (cid: string, hid: string, p: Partial<Hotel>) =>
    setTrip(t => ({ ...t, cities: t.cities.map(c => (c.id !== cid ? c : { ...c, hotels: c.hotels.map(h => (h.id === hid ? { ...h, ...p } : h)) })) }));

  const patchRooms = (cid: string, hid: string, site: string, f: (r?: { url: string; at: number; list: RoomRow[] }) => { url: string; at: number; list: RoomRow[] }) =>
    setTrip(t => ({ ...t, cities: t.cities.map(c => (c.id !== cid ? c : { ...c, hotels: c.hotels.map(h => (h.id === hid ? { ...h, roomsBySite: { ...(h.roomsBySite || {}), [site]: f(h.roomsBySite?.[site]) } } : h)) })) }));

  const setPicks = (cid: string, hid: string, f: (p: RoomPick[]) => RoomPick[]) =>
    setTrip(t => ({ ...t, cities: t.cities.map(c => (c.id !== cid ? c : { ...c, hotels: c.hotels.map(h => (h.id === hid ? { ...h, picks: f(h.picks || []) } : h)) })) }));

  // every room this hotel has: Google's list per site + the sites' own lists (from the extension)
  const catalog = (h: Hotel): CatItem[] => {
    const rate = h.online?.roeAt || 1;
    const g: CatItem[] = Object.entries(h.online?.site_rooms || {}).flatMap(([site, l]) => l.map(r => ({ site, name: r.name, total: Math.round(r.total * rate * (nRooms || 1)), src: "google" as const, free: r.free_cancellation })));
    const st: CatItem[] = Object.entries(h.roomsBySite || {}).flatMap(([site, rb]) => rb.list.filter(r => r.ccy === "INR" || r.exact).map(r => ({ site, name: r.room, total: r.exact || r.total, src: "site" as const, key: r.key, meal: r.meal, cxl: r.exactCxl || r.cxl, taxes: r.taxes, exact: r.exact, full: r.full, rate: r.rate, shown: r.shown })));
    // once the sites' own room lists are read, use ONLY those – Google's list mixes in rooms the sites don't sell
    return (st.length ? st : g).filter(x => x.name && x.total > 0);
  };
  const tripRef = useRef(trip); tripRef.current = trip;
  const regroupTimers = useRef<Record<string, any>>({});
  const regroupSoon = (cid: string, hid: string) => {
    clearTimeout(regroupTimers.current[hid]);
    regroupTimers.current[hid] = setTimeout(() => {
      const c = tripRef.current.cities.find(x => x.id === cid), h = c?.hotels.find(x => x.id === hid);
      if (c && h) groupRooms(c, h);
    }, 6000);
  };
  const roomGroups = (h: Hotel) => {
    const items = catalog(h);
    const gm = new Map<string, string>(); (h.roomTypes || []).forEach(gr => gr.m.forEach(m => gm.set(m.site + "|" + m.name, gr.type)));
    const wk = items.map(x => roomWordKey(x.name)), keys = new Set(wk);
    // a name without a bed type ("Deluxe Room") joins the one matching group that has it ("Deluxe, King")
    const fixed = wk.map(k => { const [c0, b0, v0] = k.split("|"); if (b0) return k; const o = [...keys].filter(x => { const [c2, b2, v2] = x.split("|"); return c2 === c0 && v2 === v0 && !!b2; }); return o.length === 1 ? o[0] : k; });
    const byWord = new Map<string, string>(); items.forEach((x, i) => { const t = gm.get(x.site + "|" + x.name); if (t && !byWord.has(fixed[i])) byWord.set(fixed[i], t); });
    const groups = new Map<string, { type: string; items: CatItem[] }>();
    items.forEach((x, i) => { const t = gm.get(x.site + "|" + x.name) || byWord.get(fixed[i]) || prettyRoomKey(fixed[i]); if (!groups.has(t)) groups.set(t, { type: t, items: [] }); groups.get(t)!.items.push(x); });
    // one site never lists the SAME room under two names → a group where a site has several names is several rooms
    // (e.g. "Suite (The Brompton)" and "Suite (The Kensington)") → split it by that site's names
    const wds = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !["room", "with", "and", "the", "bed", "beds"].includes(w));
    const sim = (a: string, b: string) => { const A = wds(a), B = new Set(wds(b)); return A.length ? A.filter(w => B.has(w)).length / A.length : 0; };
    const out: { type: string; items: CatItem[] }[] = [];
    for (const g of groups.values()) {
      const per = new Map<string, Set<string>>(); g.items.forEach(x => { if (!per.has(x.site)) per.set(x.site, new Set()); per.get(x.site)!.add(x.name); });
      const [lead, names] = [...per.entries()].sort((a, b) => b[1].size - a[1].size)[0] || ["", new Set<string>()];
      if (names.size <= 1) { out.push(g); continue; }
      const subs = [...names].map(nm => ({ type: `${g.type} — ${nm.length > 48 ? nm.slice(0, 47) + "…" : nm}`, items: [] as CatItem[], nm }));
      g.items.forEach(x => {
        const exact = x.site === lead ? subs.find(sb => sb.nm === x.name) : null;
        const best = exact || subs.map(sb => ({ sb, v: sim(sb.nm, x.name) + sim(x.name, sb.nm) })).sort((a, b) => b.v - a.v)[0].sb;
        best.items.push(x);
      });
      out.push(...subs.map(({ type, items }) => ({ type, items })));
    }
    return out.map(g => ({ ...g, from: Math.min(...g.items.map(x => x.total)), sites: [...new Set(g.items.map(x => x.site))] })).sort((a, b) => a.from - b.from);
  };
  const groupRooms = async (c: City, h: Hotel) => {
    const seen = new Set<string>();
    const rooms = catalog(h).map(x => ({ site: x.site, name: x.name })).filter(x => { const k = x.site + "|" + x.name; if (seen.has(k)) return false; seen.add(k); return true; });
    const sig = rooms.map(x => x.site + "|" + x.name).sort().join("¦");
    if (rooms.length < 2 || h.roomTypesSig === sig || visionOff.current) return;
    setHotel(c.id, h.id, { typesLoading: true, roomTypesSig: sig });
    try {
      const r = await (await authFetch("/rooms/group", { hotel: h.online?.name || h.name, rooms })).json();
      setHotel(c.id, h.id, { typesLoading: false, roomTypes: (r.groups || []).map((g: any) => ({ type: String(g.type), m: (g.ids || []).map((i: number) => rooms[i]).filter(Boolean) })) });
    } catch (e: any) { if (/GEMINI_API_KEY/.test(String(e?.message))) visionOff.current = true; setHotel(c.id, h.id, { typesLoading: false }); }   // word matching stays
  };
  // the chosen room type; a type chosen before it was split ("Suite" → "Suite — …") still works as the whole group
  const mealFor = (h: Hotel, site: string) => h.mealBySite?.[site] || h.meal;   // each website can have its own meal plan
  const findType = (h: Hotel) => {
    if (!h.room) return null;
    const all = roomGroups(h), g = all.find(x => x.type === h.room); if (g) return { ...g, subs: 0, remapped: false };
    const subs = all.filter(x => x.type.startsWith(h.room + " — "));
    if (!subs.length) {
      // the room list was re-read and names changed (e.g. Google's list → the sites' own lists):
      // use the group with the same room type / bed / view, else the most similar name – never a different category
      const wk = roomWordKey(h.room), [c0] = wk.split("|");
      const ws = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !["room", "with", "and", "the", "bed", "beds"].includes(w));
      const want = ws(h.room);
      const sc = all.map(g => {
        const keys = g.items.map(x => roomWordKey(x.name)); const [gc] = (keys[0] || roomWordKey(g.type)).split("|");
        if (c0 !== "room" && gc !== c0 && !keys.some(k => k.split("|")[0] === c0)) return { g, v: -1 };
        const have = new Set(g.items.flatMap(x => ws(x.name)).concat(ws(g.type)));
        return { g, v: (keys.includes(wk) ? 1 : 0) + (want.length ? want.filter(w => have.has(w)).length / want.length : 0) };
      }).filter(x => x.v >= 0.6).sort((a, b) => b.v - a.v || a.g.from - b.g.from);
      return sc[0] ? { ...sc[0].g, subs: 0, remapped: true } : null;
    }
    const items = subs.flatMap(x => x.items);
    return { type: h.room, items, from: Math.min(...items.map(x => x.total)), sites: [...new Set(items.map(x => x.site))], subs: subs.length, remapped: false };
  };
  // the chosen room type on one site: exact checkout price > site's own list (same meal) > Google's list
  const typeFor = (h: Hotel, site: string) => {
    if (!h.room) return null;
    const g = findType(h); if (!g) return null;
    const meal = MEAL_NAME[mealFor(h, site)] || "";
    const its = g.items.filter(x => x.site === site);
    const cheap = (l: CatItem[]) => l.slice().sort((a, b) => a.total - b.total)[0];
    const near = "";
    const own = its.filter(x => x.src === "site");
    // the site's own list was read and this room isn't in it → not sold there (never a look-alike room)
    const listed = !!h.roomsBySite?.[site]?.list?.length;
    const notSold = listed && !own.length;
    const item = cheap(own.filter(x => x.meal === meal)) || cheap(its.filter(x => x.src === "google")) || cheap(own);
    const tk = `${site}|${g.type}|${mealFor(h, site)}`;
    // names to look for on the site: this site's own names first, then what the other sites call it
    const cat0 = roomWordKey(g.type).split("|")[0];
    const ex0 = h.typeExact?.[tk], exOk = ex0 && (cat0 === "room" || !ex0.room || roomWordKey(ex0.room).split("|")[0] === cat0)
      && !(ex0.meal && meal && ex0.meal !== meal && own.some(x => x.meal === meal));   // an older check that got another meal plan doesn't count once the site offers this one   // an older check that took a different room doesn't count
    return { g, item, tk, near, notSold, listed, exact: [...new Set(own.map(x => x.name))], cat: cat0 === "room" ? "" : cat0, ex: exOk ? ex0 : undefined, names: [...new Set([...its.map(x => x.name), ...g.items.map(x => x.name), g.type])].slice(0, 12) };
  };

  // ── Rooms picker ───────────────────────────────────────────────────────────
  const rooms = trip.roomList;
  const setRoom = (i: number, p: Partial<Room>) => setT({ roomList: rooms.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const setChildren = (i: number, n: number) => {
    const ages = rooms[i].ages.slice(0, n); while (ages.length < n) ages.push(5);
    setRoom(i, { ages });
  };
  const apiRooms = rooms.map(r => ({ adults: r.adults, children_ages: r.ages }));
  const nRooms = rooms.length;

  // all prices for a hotel (supplier rates + every site), cheapest first — no limit
  const deals = (h: Hotel): Deal[] => {
    const rate = h.online?.roeAt || 1, ccy = h.online?.currency || "INR";
    return [
      ...([["Ottila", h.ottila], ["TBO", h.tbo], [h.otherSource || "Other", h.other]] as [string, string][])
        .filter(([, v]) => num(v) > 0).map(([s, v]) => ({ source: s, rupees: num(v), amt: num(v), ccy: "INR", mine: true, free: !!h.cancel })),
      ...(h.online?.prices || []).map(p => {
        const cf = h.confirmed?.[p.source];     // price the team checked on the website itself
        return cf
          ? { source: p.source, room: roomOnly(h.confirmedRoom?.[p.source]) || p.room || undefined, rupees: cf, amt: h.confirmedSite?.[p.source]?.amt || cf, ccy: h.confirmedSite?.[p.source]?.ccy || "INR", mine: false, free: h.confirmedCxl?.[p.source] ? h.confirmedCxl[p.source].kind === "free" || !!h.confirmedCxl[p.source].until : p.free_cancellation, cxl: h.confirmedCxl?.[p.source], link: p.link, google: p.total * rate, confirmed: true }
          : (() => {
              const g = p.total * rate, fx = factor(p.source, cityOf(h));
              return fx?.kind === "adjust"
                ? { source: p.source, room: p.room || undefined, rupees: g * fx.f, amt: g * fx.f, ccy: "INR", mine: false, free: p.free_cancellation, link: p.link, google: g, est: fx.n, fx }
                : { source: p.source, room: p.room || undefined, rupees: g, amt: p.total, ccy, mine: false, free: p.free_cancellation, link: p.link, google: g, fx: fx || undefined };
            })();
      }),
      // prices confirmed (e.g. grabbed from a site) that Google doesn't list for this hotel
      ...Object.entries(h.confirmed || {}).filter(([src]) => !(h.online?.prices || []).some(p => p.source === src))
        .map(([src, v]) => ({ source: src, rupees: v, amt: v, ccy: "INR", mine: false, free: false, confirmed: true } as Deal)),
    ].sort((a, b) => a.rupees - b.rupees);
  };
  const bestOf = (h: Hotel) => deals(h)[0]?.rupees ?? (h.online ? undefined : h.fromPrice);
  const hasPrice = (h: Hotel) => !!bestOf(h);

  // ── Searching ──────────────────────────────────────────────────────────────
  const key = (c: City, h: Hotel) => `${h.name}|${c.name}|${c.checkIn}|${c.checkOut}|${JSON.stringify(rooms)}|${searchCcy}`;
  const findKey = (c: City) => `${c.name}|${c.checkIn}|${c.checkOut}|${c.stars}|${JSON.stringify(rooms)}`;

  // one hotel → every site's price (1 search)
  const fetchOne = async (c: City, h: Hotel, fresh = false, open = true, auto = true): Promise<Online | null> => {
    const rate = searchCcy === "INR" ? 1 : roe;
    setHotel(c.id, h.id, { loading: true, error: undefined });
    try {
      const r: Online = await (await authFetch("/search", { hotel: h.name, city: c.name, check_in: c.checkIn, check_out: c.checkOut, adults: rooms[0].adults, currency: searchCcy, property_token: h.token, rooms: apiRooms, fresh })).json();
      const online = { ...r, currency: r.currency || searchCcy, roeAt: rate };
      setHotel(c.id, h.id, { loading: false, online, searchedFor: key(c, h), checkedAt: Date.now(), open, confirmed: h.searchedFor === key(c, h) ? h.confirmed : undefined,
        token: h.token || (r as any).property_token, image: h.image || r.image, rating: h.rating ?? r.rating, reviews: h.reviews ?? r.reviews, stars: h.stars ?? r.stars });
      if (auto) afterFetch.current(c, { ...h, online });     // → exact prices from the sites, automatically (not for "View deal")
      return online;
    } catch (e: any) { setHotel(c.id, h.id, { loading: false, error: e.message }); return null; }
  };
  const runSearches = async (jobs: { c: City; h: Hotel }[], fresh = false) => {
    const work = async () => { for (let j = jobs.shift(); j; j = jobs.shift()) await fetchOne(j.c, j.h, fresh); };
    await Promise.all([work(), work(), work()]);
  };

  const findHotels = async (c: City) => {
    setCity(c.id, { finding: true });
    try {
      const r = await (await authFetch("/discover", { city: c.name, check_in: c.checkIn, check_out: c.checkOut, adults: rooms[0].adults, stars: c.stars || null, currency: "INR", limit: 25, rooms: apiRooms })).json();
      setTrip(t => ({ ...t, cities: t.cities.map(x => {
        if (x.id !== c.id) return x;
        // keep your hotels + anything you labelled / put in the package; replace the rest with the new list
        const keep = x.hotels.filter(h => isMine(h) || h.inPkg || h.label);
        const have = new Set(keep.map(h => h.name.toLowerCase()));
        const add = (r.hotels || []).filter((y: any) => y.name && y.lowest_total && !have.has(y.name.toLowerCase())).map((y: any) =>
          newHotel({ name: y.name, mine: false, token: y.property_token, image: y.image, stars: y.stars, rating: y.rating, reviews: y.reviews, fromPrice: y.lowest_total, fromSource: y.lowest_source || undefined, fromLink: y.lowest_link || undefined }));
        return { ...x, finding: false, foundFor: findKey(c), hotels: [...keep, ...add] };
      }) }));
    } catch (e: any) { setCity(c.id, { finding: false }); setMsg({ kind: "err", text: e.message }); }
  };

  // Search a city: your hotels get every site's price; the rest of the city is listed below.
  const searchCity = async (c: City, fresh = false) => {
    if (!c.name.trim() || !nightsOf(c)) { setMsg({ kind: "err", text: `Enter the city and dates${c.name ? ` for ${c.name}` : ""}.` }); return; }
    const jobs = c.hotels.filter(h => h.name.trim() && (isMine(h) || (fresh && h.online)) && (fresh || h.searchedFor !== key(c, h))).map(h => ({ c, h }));
    await Promise.all([runSearches(jobs, fresh), fresh || c.foundFor !== findKey(c) ? findHotels(c) : Promise.resolve()]);
  };
  const searchAll = async (only?: City, fresh = false) => {
    setMsg(null); setBusy(true);
    for (const c of only ? [only] : trip.cities) await searchCity(c, fresh);
    setBusy(false); loadStatus();
  };
  const seeAll = async (c: City, h: Hotel) => {
    if (h.online && h.searchedFor === key(c, h)) {
      if (!h.open && extAuto) autoCheck([{ c, h }], true);   // opening → exact prices from the sites (of the chosen room, if any)
      return setHotel(c.id, h.id, { open: !h.open });
    }
    await fetchOne(c, h, true); loadStatus();
  };
  // the team types the total they see on the website → replaces Google's price everywhere (ranking, Excel)
  const applyConfirm = (c: City, h: Hotel, source: string, v: number, auto = false, room = "", site?: { amt: number; ccy: string }, cxl?: Cxl) => {
    if (!(v > 0)) return;
    setTrip(t => ({ ...t, cities: t.cities.map(x => x.id !== c.id ? x : { ...x, hotels: x.hotels.map(y => {
      if (y.id !== h.id) return y;
      const ca = { ...(y.confirmedAuto || {}) }; if (auto) ca[source] = Date.now(); else delete ca[source];
      const cr = { ...(y.confirmedRoom || {}) }; if (room) cr[source] = room; else delete cr[source];
      const cs = { ...(y.confirmedSite || {}) }; if (site) cs[source] = site; else delete cs[source];   // the amount the site itself showed (e.g. USD 291.26)
      const cx = { ...(y.confirmedCxl || {}) }; if (cxl && (cxl.kind || cxl.until || cxl.fee || cxl.text)) cx[source] = cxl; else delete cx[source];
      return { ...y, confirmed: { ...(y.confirmed || {}), [source]: v }, confirmedAuto: ca, confirmedRoom: cr, confirmedSite: cs, confirmedCxl: cx };
    }) }) }));
    // learn how far Google was off for this site (and this city), to correct other hotels' prices
    const g = (h.online?.prices || []).find(p => p.source === source);
    const ratio = g ? v / (g.total * (h.online?.roeAt || 1)) : 0;
    if (ratio > 0.5 && ratio < 2) {
      const city = c.name.trim().toLowerCase(), k1 = `${source}|${city}`, k2 = source;
      setCorr(o => ({ ...o, [k1]: [...(o[k1] || []), ratio].slice(-25), [k2]: [...(o[k2] || []), ratio].slice(-50) }));
    }
  };
  const saveConfirm = (c: City, h: Hotel) => {
    if (!editing) return;
    applyConfirm(c, h, editing.source, num(editing.value));
    setEditing(null);
  };
  // all hotels on the trip, for matching a grabbed price
  const allHotels = trip.cities.flatMap(c => c.hotels.filter(h => h.name.trim()).map(h => ({ c, h })));
  useEffect(() => {
    if (!grab) return;
    const scored = allHotels.map(({ h }) => ({ h, s: nameMatch(h.online?.name || h.name, grab.hotel) + ((h.online?.prices || []).some(p => p.source === grab.site) ? 0.15 : 0) + (h.checkedAt ? h.checkedAt / 1e14 : 0) }))
      .sort((a, b) => b.s - a.s);
    setGrabSel({ hid: scored[0]?.h.id || "", site: grab.site });
  }, [grab?.id]);
  const applyGrab = () => {
    const hit = allHotels.find(x => x.h.id === grabSel.hid);
    if (!grab || !hit) return;
    applyConfirm(hit.c, hit.h, grabSel.site || grab.site, grab.total);
    window.postMessage({ source: "pc-page", type: "PC_GRAB_DONE", id: grab.id }, location.origin);
    setMsg({ kind: "ok", text: `✓ ${grabSel.site} ${inr(grab.total)} confirmed for ${hit.h.name}.` });
    setGrab(null);
  };
  // ── ⚡ automatic exact prices: the extension opens each deal link in a background tab and reads the total ──
  // every site with a deal link is checked (Agoda, the hotel's own website, …)
  const sameRooms = rooms.every(r => r.adults === rooms[0].adults && r.ages.join() === rooms[0].ages.join());
  const autoJobs = (list: { c: City; h: Hotel }[]) => list.flatMap(({ c, h }) =>
    (h.online?.prices || []).filter(p => !!p.link && p.source !== "Hotel website")   /* hotel websites: not checked for now */
      .map(p => {
        const base = { cid: c.id, hid: h.id, source: p.source, url: p.link as string, nights: nightsOf(c) || 1, checkIn: c.checkIn, checkOut: c.checkOut, city: c.name, rooms: nRooms, mult: sameRooms ? nRooms : 1, adults: rooms[0].adults, hotel: h.online?.name || h.name };
        const t = typeFor(h, p.source);   // a room type is chosen → the exact price of THAT room on every site
        if (t?.notSold) return null;      // the site doesn't sell this room → nothing to check
        return t ? { ...base, pickWant: { names: t.names, meal: MEAL_NAME[mealFor(h, p.source)] || "", cat: t.cat, exact: t.exact }, typeKey: t.tk } : base;
      }).filter(Boolean) as any[]);
  const jobKey = (j: any) => `${j.hid}|${j.source}${j.pickKey ? "|" + j.pickKey : ""}${j.typeKey ? "|type:" + j.typeKey : ""}${j.listOnly ? "|list" : ""}`;
  // Google has no room list → read just the room lists on the sites (no checkout)
  const LIST_SITES = ["Booking.com", "Agoda", "Expedia", "Hotels.com", "Hotel website"];
  // a site is "being read" while any check for it runs (an exact-price check reads its room list too)
  const siteBusy = (hid: string, site: string) => Object.entries(checks).some(([kk, v]) => kk.startsWith(`${hid}|${site}`) && (v === "queued" || v === "checking" || v === "verifying"));
  const loadRoomLists = (c: City, h: Hotel, missingOnly = false, onlySite = "") => {
    if (!extAuto) { setMsg({ kind: "err", text: "Install (or update) the Grab-price extension to read the room lists." }); return; }
    const jobs = (h.online?.prices || []).filter(p => p.link && LIST_SITES.includes(p.source) && (!onlySite || p.source === onlySite) && !siteBusy(h.id, p.source) && !(missingOnly && (h.roomsBySite?.[p.source]?.list?.length || Date.now() - (h.listTried?.[p.source] || 0) < 6 * 3600 * 1000)))
      .map(p => ({ cid: c.id, hid: h.id, source: p.source, url: p.link as string, nights: nightsOf(c) || 1, checkIn: c.checkIn, checkOut: c.checkOut, city: c.name, rooms: nRooms, mult: sameRooms ? nRooms : 1, adults: rooms[0].adults, hotel: h.online?.name || h.name, listOnly: true }));
    if (!jobs.length) { if (!missingOnly) setMsg({ kind: "err", text: "No Booking.com / Agoda / Expedia / Hotels.com / hotel website link for this hotel (or it's being checked right now)." }); return; }
    setHotel(c.id, h.id, { listsAt: Date.now() });
    setChecks(o => ({ ...o, ...Object.fromEntries(jobs.map(j => [jobKey(j), "queued"])) }));
    window.postMessage({ source: "pc-page", type: "PC_CHECK", jobs }, location.origin);
  };
  const autoCheck = (list: { c: City; h: Hotel }[], silent = false) => {
    if (!extAuto) { if (!silent) setMsg({ kind: "err", text: "Install (or update) the Grab-price Chrome extension to get exact prices automatically." }); return; }
    if (!sameRooms) { if (!silent) setMsg({ kind: "err", text: "Exact-price check works when all rooms have the same guests. Confirm mixed rooms by hand." }); return; }
    const jobs: any[] = autoJobs(list);
    // the same visit reads each site's room list too; the hotel's own website is read for its rooms + rates
    for (const { c, h } of list) {
      const hw = (h.online?.prices || []).find(p => p.source === "Hotel website" && p.link);
      if (hw && !siteBusy(h.id, "Hotel website") && !h.roomsBySite?.["Hotel website"]?.list?.length)
        jobs.push({ cid: c.id, hid: h.id, source: "Hotel website", url: hw.link as string, nights: nightsOf(c) || 1, checkIn: c.checkIn, checkOut: c.checkOut, city: c.name, rooms: nRooms, mult: sameRooms ? nRooms : 1, adults: rooms[0].adults, hotel: h.online?.name || h.name, listOnly: true });
      setHotel(c.id, h.id, { listsAt: Date.now() });
    }
    if (!jobs.length) { if (!silent) setMsg({ kind: "err", text: "Nothing to check — open the hotel's prices first (Search / See all prices)." }); return; }
    setChecks(o => ({ ...o, ...Object.fromEntries(jobs.map(j => [jobKey(j), "queued"])) }));
    window.postMessage({ source: "pc-page", type: "PC_CHECK", jobs }, location.origin);
    const keys = jobs.map(jobKey), postedAt = Date.now();
    setTimeout(() => setChecks(o => {
      if (lastAck.current >= postedAt || !keys.some(kk => o[kk] === "queued")) return o;   // the extension answered → fine
      const n = { ...o }; keys.forEach(kk => { if (n[kk] === "queued") n[kk] = NOT_STARTED; }); return n;
    }), 25000);
    if (!silent) setMsg({ kind: "ok", text: `⚡ Checking ${plural(jobs.length, "price", "prices")} on the websites in background tabs — keep Chrome open…` });
  };
  // take ONE room from the "All rooms" table to the site's checkout for its exact total
  const checkRoom = (c: City, h: Hotel, site: string, r: RoomRow) => {
    const rb = h.roomsBySite?.[site];
    if (!rb || !extAuto || !sameRooms) { setMsg({ kind: "err", text: "Exact check needs the Grab-price extension (and all rooms with the same guests)." }); return; }
    const job = { cid: c.id, hid: h.id, source: site, url: rb.url, nights: nightsOf(c) || 1, checkIn: c.checkIn, checkOut: c.checkOut, city: c.name, rooms: nRooms, mult: sameRooms ? nRooms : 1, adults: rooms[0].adults, hotel: h.online?.name || h.name, pickKey: r.key };
    setChecks(o => ({ ...o, [`${h.id}|${site}|${r.key}`]: "queued" }));
    window.postMessage({ source: "pc-page", type: "PC_CHECK", jobs: [job] }, location.origin);
  };
  const checkType = (c: City, h: Hotel, site: string, t: NonNullable<ReturnType<typeof typeFor>>) => {
    const url = h.roomsBySite?.[site]?.url || (h.online?.prices || []).find(p => p.source === site)?.link;
    if (!url || !extAuto || !sameRooms) { setMsg({ kind: "err", text: url ? "Exact check needs the Grab-price extension (and all rooms with the same guests)." : `No ${site} link for this hotel.` }); return; }
    const job = { cid: c.id, hid: h.id, source: site, url, nights: nightsOf(c) || 1, checkIn: c.checkIn, checkOut: c.checkOut, city: c.name, rooms: nRooms, mult: sameRooms ? nRooms : 1, adults: rooms[0].adults, hotel: h.online?.name || h.name,
      pickWant: { names: t.names, meal: MEAL_NAME[mealFor(h, site)] || "", cat: t.cat, exact: t.exact }, typeKey: t.tk };
    setChecks(o => ({ ...o, [`${h.id}|${site}|type:${t.tk}`]: "queued" }));
    window.postMessage({ source: "pc-page", type: "PC_CHECK", jobs: [job] }, location.origin);
  };
  afterFetch.current = (c, h) => { if (autoOn && extAuto && sameRooms) autoCheck([{ c, h }], true); };
  const NOT_STARTED = "Not started — the extension was updated or stopped: press F5 on this page, then Re-check";
  onCheckMsg.current = (m: any) => {
    const j = m.job; const k = j ? `${j.hid}|${j.source}${j.pickKey ? "|" + j.pickKey : ""}${j.typeKey ? "|type:" + j.typeKey : ""}${j.listOnly ? "|list" : ""}` : "";
    if (m.type === "PC_CHECK_QUEUED" || m.type === "PC_CHECK_STARTED" || m.type === "PC_CHECK_RESULT") lastAck.current = Date.now();
    if (m.type === "PC_EXT_STALE") {
      setChecks(o => Object.fromEntries(Object.entries(o).map(([kk, v]) => [kk, v === "queued" ? NOT_STARTED : v])));
      setMsg({ kind: "err", text: "The Grab-price extension was updated or restarted — press F5 to reconnect, then Re-check exact prices." });
      return;
    }
    if (m.type === "PC_CHECK_STARTED") setChecks(o => ({ ...o, [k]: "checking" }));
    if (m.type === "PC_CHECK_RESULT") {
      const city = trip.cities.find(c => c.id === j.cid), hotel = city?.hotels.find(h => h.id === j.hid);
      const res = m.result || {};
      if (!city || !hotel) return;
      // this site was visited (exact check or room list) → opening Room type won't open it again (use "read again" for that)
      setTrip(t => ({ ...t, cities: t.cities.map(x => x.id !== city.id ? x : { ...x, hotels: x.hotels.map(y => y.id !== hotel.id ? y : { ...y, listTried: { ...(y.listTried || {}), [j.source]: Date.now() } }) }) }));
      // every room + option the site listed → "All rooms" table (room-list prices until "Check exact")
      if (!j.pickKey && Array.isArray(res.rooms) && res.rooms.length && res.roomsUrl) {
        const ccy = String(res.currency || "INR").toUpperCase(), mult = j.mult || 1;
        const rate = ccy === "INR" ? 1 : fx.current[ccy] || (ccy === trip.currency && roe ? roe : 0);
        const list: RoomRow[] = res.rooms.filter((r: any) => r && r.total > 0).slice(0, 60).map((r: any) => ({
          key: String(r.key), room: String(r.room || ""), meal: String(r.meal || ""), cxl: String(r.cxl || ""), taxes: r.taxes !== false,
          total: rate ? Math.round(r.total * mult * rate) : r.total * mult, ccy: rate ? "INR" : ccy }));
        if (list.length) { patchRooms(city.id, hotel.id, j.source, () => ({ url: res.roomsUrl, at: Date.now(), list })); regroupSoon(city.id, hotel.id); }
      }
      // the site has no rooms for these dates → mark it (Google's price for it is out of date)
      if (res.soldOut || res.total > 0) setTrip(t => ({ ...t, cities: t.cities.map(x => x.id !== city.id ? x : { ...x, hotels: x.hotels.map(y => { if (y.id !== hotel.id) return y; const so = { ...(y.soldOut || {}) }; if (res.soldOut) so[j.source] = Date.now(); else delete so[j.source]; return { ...y, soldOut: so }; }) }) }));
      if (j.listOnly && res.siteText) {          // hotel's own website: Gemini reads the rooms and rates from the page text
        (async () => {
          try {
            const r = await (await authFetch("/rooms/read", { hotel: j.hotel || hotel.name, text: res.siteText, check_in: j.checkIn || "", check_out: j.checkOut || "", nights: j.nights || 0, adults: j.adults || 2 })).json();
            const list: RoomRow[] = [];
            for (const x of r.rooms || []) {
              const cc = String(x.currency || "INR").toUpperCase();
              const rt = cc === "INR" ? 1 : fx.current[cc] || (cc === trip.currency && roe ? roe : 0);
              if (!rt) continue;
              if ((j.adults || 2) >= 2 && /single use|single occupancy|1 adult|one adult/i.test(`${x.room} ${x.rate}`)) continue;   // rate for 1 guest
              list.push({ key: `${x.room}|${x.rate}`, room: String(x.room), rate: String(x.rate || ""), shown: String(x.price_shown || ""), meal: String(x.meal || "Room only"), cxl: String(x.cxl || ""), full: String(x.cxl_full || ""), taxes: x.taxes_included !== false, total: Math.round(x.total * rt * (j.mult || 1)), ccy: "INR" });
            }
            if (list.length) { patchRooms(city.id, hotel.id, j.source, () => ({ url: res.roomsUrl, at: Date.now(), list })); regroupSoon(city.id, hotel.id); }
            setChecks(o => ({ ...o, [k]: list.length ? "ok" : "The hotel website didn't show rooms for these dates" }));
          } catch (e: any) { setChecks(o => ({ ...o, [k]: "Couldn't read the hotel website: " + (e?.message || e) })); }
        })();
        return;
      }
      if (j.listOnly) { setChecks(o => ({ ...o, [k]: res.rooms?.length ? "ok" : (res.error || "Couldn't read the room list") })); return; }
      // Two independent readings: the page reader (text) and Gemini looking at a screenshot of the price.
      // Agree → confirmed. Only one found it → use it (screenshot only if it is the booking/checkout page).
      // Disagree, or the site shows other dates → "Check manually" (never a wrong price).
      (async () => {
        let v: any = null;
        if (res.shot && !visionOff.current) {
          setChecks(o => ({ ...o, [k]: "verifying" }));
          try {
            v = await (await authFetch("/vision", { image: res.shot, image2: res.shot2 || "", policy_text: res.policyText || "", site: j.source, hotel: j.hotel || hotel.name, check_in: j.checkIn || "", check_out: j.checkOut || "", nights: j.nights || 0, adults: j.adults || 2, rooms: j.rooms || 1 })).json();
          } catch (e: any) { if (/GEMINI_API_KEY/.test(String(e?.message))) visionOff.current = true; v = null; }
        }
        const fail = (t: string) => setChecks(o => ({ ...o, [k]: t }));
        const fmt = (c: string, n: number) => `${c === "INR" ? "₹" : c + " "}${Math.round(n).toLocaleString("en-IN")}`;
        if (v && v.page === "robot check") return fail("The site showed a robot check");
        const badDates = v && v.found && ((v.check_in && j.checkIn && v.check_in !== j.checkIn) || (v.check_out && j.checkOut && v.check_out !== j.checkOut) || (v.nights && j.nights && +v.nights !== +j.nights));
        // the hotel on screen must be ours (e.g. not "Fairmont Mumbai" when we asked for Swenska Design Hotel)
        const nameWords = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 1 && !["hotel", "hotels", "the", "and", "resort", "resorts", "by", "a", "an", "of", "at", "in", "spa", "&"].includes(w));
        const want = nameWords(j.hotel || hotel.name), seen = new Set(nameWords(String(v?.hotel_name || "")));
        if (v && v.found && v.hotel_name && want.length && want.filter(w => seen.has(w)).length / want.length < 0.5)
          return fail(`Check manually — the site showed ${v.hotel_name}, not ${j.hotel || hotel.name}`);
        if (badDates) return fail(`Check manually — the site showed ${v.check_in || "?"} → ${v.check_out || "?"}${v.nights ? ` (${v.nights} nights)` : ""}, not your dates`);
        const visOk = !!(v && v.found && v.total > 0 && v.confidence !== "low");
        let total = 0, cur = "INR", room = "", allRooms = !!res.allRooms;
        if (res.total > 0) {
          total = res.total; cur = (res.currency || "INR").toUpperCase(); room = res.room || (visOk ? v.room || "" : "");
          if (visOk && res.addOn > 0) total -= res.addOn;     // the screenshot shows the price without the breakfast paid at the hotel
          if (visOk) {
            const vc = (v.currency || cur).toUpperCase();
            // agree if the page total matches the screenshot's total WITH taxes, or before-taxes + taxes (tax lines are not a mismatch)
            const cands = [v.total_incl_taxes, v.total, v.total_excl_taxes && v.taxes ? v.total_excl_taxes + v.taxes : 0].filter((x: number) => x > 0);
            const close = (x: number) => Math.abs(x - total) / total <= 0.02;
            const onlyTax = v.total > 0 && total > v.total && total / v.total <= 1.3 && (v.includes_taxes === false || v.total_excl_taxes === v.total);
            if (vc === cur && v.page === "checkout" && !cands.some(close) && !onlyTax)
              return fail(`Check manually — page says ${fmt(cur, total)}, screenshot shows ${fmt(vc, v.total_incl_taxes || v.total)}`);
          }
        } else if (visOk && (v.page === "checkout" || v.page === "hotel page")) {
          total = v.total_incl_taxes || v.total; cur = (v.currency || "INR").toUpperCase(); room = v.room || ""; allRooms = v.page === "checkout";
        } else return fail(res.error || "Couldn't read the price");
        if (visOk && res.addOn > 0) total += res.addOn;
        const amount = total * (allRooms ? 1 : (j.mult || 1));   // checkout pages already show all rooms
        // cancellation terms: the screenshot reading (structured) first, else the words found on the page
        const txt = String(res.policyText || res.cxlText || "");
        const cxl: Cxl | undefined = visOk && (v.cxl_type || v.free_until || v.cxl_fee || v.cancellation)
          ? { kind: v.cxl_type || undefined, until: v.free_until || undefined, fee: v.cxl_fee || undefined, feeCcy: v.cxl_fee_currency || undefined, feeFrom: v.cxl_fee_from || undefined, note: v.cxl_fee_note || undefined, text: v.cancellation || txt || undefined, summary: v.cxl_summary || undefined, full: res.policyText || undefined, pct: v.cxl_fee_percent || undefined, noshow: v.noshow || undefined }
          : txt ? { kind: /non-?refundable/i.test(txt) && !/free|fully refundable/i.test(txt) ? "non-refundable" : /free cancell?ation|fully refundable|cancel for free/i.test(txt) ? "free" : /partially/i.test(txt) ? "partial" : undefined, text: txt.split("\n").slice(0, 3).join(" · "), full: res.policyText || undefined } : undefined;
        const save = (rate: number) => {
          if (j.typeKey) {   // "Check exact" for the chosen room type on one site
            // the room chosen on the hotel page is the reliable name (checkout pages show other headings near the room)
            const got = res.picked?.room || roomOnly(room) || "", gotCat = roomWordKey(got).split("|")[0];
            if (j.pickWant?.cat && got && gotCat !== j.pickWant.cat) { setChecks(o => ({ ...o, [k]: `${j.source} gave "${got.slice(0, 50)}" — not the room you chose` })); return; }
            // the screenshot reading must show the same room too
            const rw = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !["room", "with", "and", "the", "bed", "beds"].includes(w));
            const want2 = (j.pickWant?.exact?.length ? j.pickWant.exact : [got]).map(rw);
            if (visOk && v.room && want2.length && want2[0].length) {
              const vs = new Set(rw(String(v.room)));
              const okR = want2.some((ws: string[]) => ws.filter(w => vs.has(w)).length / ws.length >= 0.5);
              if (!okR) { setChecks(o => ({ ...o, [k]: `Screenshot shows "${String(v.room).slice(0, 50)}" — not the room you chose` })); return; }
            }
            const ex = Math.round(amount * rate);
            setTrip(t => ({ ...t, cities: t.cities.map(x => x.id !== city.id ? x : { ...x, hotels: x.hotels.map(y => y.id !== hotel.id ? y : { ...y, typeExact: { ...(y.typeExact || {}), [j.typeKey]: { total: ex, room: res.picked?.room || roomOnly(room) || "", cxl: cxl ? cxlLine(cxl, ex) : "", meal: res.picked?.meal || "", at: Date.now(), full: String(res.policyText || res.cxlText || cxl?.full || cxl?.text || ""), note: res.addOnNote || "" } } }) }) }));
            setChecks(o => ({ ...o, [k]: "ok" }));
            return;
          }
          if (j.pickKey) {   // "Check exact" on one room → only that row changes
            const ex = Math.round(amount * rate);
            patchRooms(city.id, hotel.id, j.source, r => r ? { ...r, list: r.list.map(x => x.key === j.pickKey ? { ...x, exact: ex, exactAt: Date.now(), exactCxl: cxl ? cxlLine(cxl, ex) : x.cxl } : x) } : { url: j.url, at: Date.now(), list: [] });
            setPicks(city.id, hotel.id, ps => ps.map(x => x.site === j.source && x.key === j.pickKey ? { ...x, exact: ex, cxl: cxl ? cxlLine(cxl, ex) : x.cxl } : x));
            setChecks(o => ({ ...o, [k]: "ok" }));
            return;
          }
          applyConfirm(city, hotel, j.source, Math.round(amount * rate), true, room, cur !== "INR" ? { amt: Math.round(amount * 100) / 100, ccy: cur } : undefined, cxl);
          setChecks(o => ({ ...o, [k]: "ok" }));
        };
        if (cur === "INR") save(1);
        else if (fx.current[cur]) save(fx.current[cur]);
        else if (cur === trip.currency && roe) save(roe);
        else authFetch(`/roe?ccy=${cur}`).then(r => r.json()).then(r => { fx.current[cur] = r.roe; save(r.roe); })
          .catch(() => fail(`The site showed ${cur} and the exchange rate couldn't be fetched`));
      })();
    }
    if (m.type === "PC_CHECK_DONE") setMsg(o => (o?.text.startsWith("⚡") ? { kind: "ok", text: "⚡ Exact prices updated from the websites." } : o));
  };
  const dismissGrab = () => { if (grab) window.postMessage({ source: "pc-page", type: "PC_GRAB_DONE", id: grab.id }, location.origin); setGrab(null); };
  const clearConfirm = (c: City, h: Hotel, source: string) => {
    const next = { ...(h.confirmed || {}) }; delete next[source];
    setHotel(c.id, h.id, { confirmed: next });
  };
  // "View deal" before "See all prices": open the tab straight away, get the exact deal link (1 search), then go there
  const viewDeal = async (c: City, h: Hotel) => {
    if (h.fromLink) { window.open(h.fromLink, "_blank", "noopener"); return; }
    const w = window.open("about:blank", "_blank");
    if (w) w.document.write(`<p style="font:16px sans-serif;padding:24px">Opening ${h.fromSource || "the best deal"} for ${h.name}…</p>`);
    const r = await fetchOne(c, h, true, false, false); loadStatus();   // just the link – no checker windows
    const list = (r?.prices || []).slice().sort((a, b) => a.total - b.total);
    const pick = list.find(p => p.source === h.fromSource) || list[0];
    const url = pick?.link || (pick ? `https://www.google.com/search?q=${encodeURIComponent(`${pick.source} ${h.name} ${c.name}`)}` : "");
    if (w && url) { w.opener = null; w.location.href = url; }
    else { w?.close(); setMsg({ kind: "err", text: `${h.name}: none of your sites have a price for these dates.` }); }
  };
  const addByName = (c: City) => {
    const name = (c.newName || "").trim(); if (!name) return;
    // already in the list (e.g. from Search)? → move that one to the top as your hotel instead of adding it twice
    const nw = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 1 && !["hotel", "the", "and", "by", "resort", "spa"].includes(w));
    const want = nw(name);
    const same = c.hotels.find(x => { const have = new Set(nw(x.online?.name || x.name)); return want.length && want.every(w => have.has(w)); });
    const h = same ? { ...same, mine: true } : newHotel({ name, mine: true });
    setCity(c.id, { hotels: [h, ...c.hotels.filter(x => x.id !== h.id)], newName: "" });
    if (same && same.online && same.searchedFor === key(c, same)) { autoCheck([{ c, h }], true); return; }
    if (c.name.trim() && nightsOf(c)) fetchOne(c, h).then(() => loadStatus());   // all sites + exact-price check
  };

  // ── Sorting like Skyscanner (Best / Cheapest / Top rated) ──────────────────
  // discovered hotels sort by their list price, so a card doesn't jump when you open its prices
  // …but once a site's exact price is confirmed, sort by the real prices
  const sortPrice = (h: Hotel) => (!isMine(h) && h.fromPrice && !Object.keys(h.confirmed || {}).length ? h.fromPrice : bestOf(h));
  const sortList = (hs: Hotel[], by: SortKey) => {
    const bestOf = sortPrice;
    const prices = hs.map(bestOf).filter((x): x is number => !!x);
    const min = prices.length ? Math.min(...prices) : 1;
    const score = (h: Hotel) => { const p = bestOf(h); if (!p) return -1; return ((h.rating || 4) / 5) * 0.6 + (min / p) * 0.4; };
    return [...hs].sort((a, b) =>
      by === "cheapest" ? (bestOf(a) ?? 9e12) - (bestOf(b) ?? 9e12)
      : by === "rated" ? (b.rating || 0) - (a.rating || 0) || (bestOf(a) ?? 9e12) - (bestOf(b) ?? 9e12)
      : score(b) - score(a));
  };

  // ── Excel (standard costing layout, no markup) ─────────────────────────────
  const xlRate = async (ccy: string) => {
    if (ccy === "INR") return setXl({ ccy, roe: "1", note: "" });
    if (ccy === cc && roe) return setXl({ ccy, roe: String(roe), note: trip.roeNote ? `Auto · ${trip.roeNote}` : "" });
    setXl({ ccy, roe: "", busy: true });
    try { const r = await (await authFetch(`/roe?ccy=${ccy}`)).json(); setXl(o => (o.ccy !== ccy ? o : { ccy, roe: String(r.roe), note: `Auto · ${r.source} · ${r.date}` })); }
    catch (e: any) { setXl(o => (o.ccy !== ccy ? o : { ccy, roe: "", note: "Couldn't fetch the rate — type it" })); }
  };
  const openPreview = () => {
    setMsg(null);
    if (!xl.ccy) xlRate(cc);
    setPreview(true);
  };
  const xcc = xl.ccy || cc, xroe = num(xl.roe) || (xcc === cc ? roe : 0);
  const buildSections = () => {
    // the sheet wants ONE room for the whole stay; site prices are for all rooms → divide by the rooms
    const perRoom = (d: Deal) => (d.mine ? 1 : (nRooms || 1));
    const asCost = (d: Deal) => (d.ccy === xcc && xcc !== "INR" ? { currency: xcc, amount: Math.round((d.amt / perRoom(d)) * 100) / 100 } : { currency: "INR", amount: Math.round(d.rupees / perRoom(d)) });
    const sections = trip.cities.filter(c => c.hotels.some(h => h.name.trim())).map(c => {
      const rows: any[] = [];
      const pick = c.hotels.filter(h => h.name.trim() && !h.noExcel && (isMine(h) || h.inPkg || h.label || h.picks?.length));   // your hotels (+ labelled / in package / rooms added)
      for (const h of sortList(pick, "cheapest")) {
        // rooms added from "All rooms": one row each (e.g. same room with and without breakfast)
        if (h.picks?.length) {
          h.picks.forEach((p, i) => rows.push({ bid: h.label || undefined, description: `${h.online?.name || h.name}${h.stars ? ` ${h.stars}*` : ""} x${nRooms} ${p.room}`, source: p.site,
            currency: "INR", amount: Math.round((p.exact || p.total) / (nRooms || 1)), meal: MEAL_CODE[p.meal] || h.meal, cancel: p.cxl || undefined, markup: 0, pkg: h.inPkg && i === 0 ? ["A"] : [],
            remark: p.exact ? `${p.site} exact at checkout` : `${p.site} room-list price${p.taxes ? "" : " (before taxes)"}`, _ref: { cid: c.id, hid: h.id, pid: p.id } }));
          continue;
        }
        const ds = deals(h);
        const nm0 = `${h.online?.name || h.name}${h.stars ? ` ${h.stars}*` : ""}`;
        const ref = (site?: string) => ({ cid: c.id, hid: h.id, site });
        const hide = new Set(h.excelHide || []);
        const R = nRooms || 1;
        // every website's price for the room you quote (chosen room type, else the site's checked / cheapest room)
        type SiteRow = { site: string; v: number; room: string; meal: string; cxl: string; exact: boolean };
        const sites: SiteRow[] = [];
        for (const d of ds.filter(x => !x.mine && !hide.has(x.source) && !h.soldOut?.[x.source])) {
          const t = h.room ? typeFor(h, d.source) : null;
          if (h.room && t) {
            if (t.notSold) continue;
            const v = t.ex?.total || t.item?.total; if (!v) continue;
            sites.push({ site: d.source, v, room: t.ex?.room || t.item?.name || t.g.type, meal: MEAL_CODE[t.ex?.meal || t.item?.meal || ""] || mealFor(h, d.source),
              cxl: t.ex?.cxl || t.item?.cxl || (t.item?.free ? "Free cxl" : ""), exact: !!t.ex });
          } else {
            sites.push({ site: d.source, v: d.rupees, room: (d.confirmed ? roomOnly(h.confirmedRoom?.[d.source]) : "") || d.room || h.room || "Room",
              meal: mealFor(h, d.source), cxl: cxlShort(d.cxl, d.rupees) || (d.free ? "Free cxl" : ""), exact: !!d.confirmed });
          }
        }
        sites.sort((x, y) => x.v - y.v);
        const siteSrc = (x: string) => /booking/i.test(x) ? "B.com" : x === "Hotel website" ? "Website" : x;
        const cmpOf = (x: SiteRow) => ({ source: siteSrc(x.site), currency: "INR", amount: Math.round(x.v / R), meal: x.meal, cancel: x.cxl || undefined });
        const mine = ds.filter(d => d.mine);
        const room0 = h.room || sites[0]?.room || "Room";
        if (!mine.length && !sites.length) {
          rows.push(h.fromPrice ? { bid: h.label || undefined, description: `${nm0} x${R} ${room0}`, source: "Google (from)", currency: "INR", amount: Math.round(h.fromPrice / R), meal: h.meal, markup: 0, pkg: h.inPkg ? ["A"] : [], hotel_start: true, _ref: ref() }
            : { bid: h.label || undefined, description: `${nm0} x${R} ${room0}`, source: "", meal: h.meal, notes: "Not available online", hotel_start: true, _ref: ref() });
          continue;
        }
        // row 1: your supplier rate (Ottila / TBO / DMC) with the cheapest website in the yellow compare block;
        // no supplier rate → the cheapest website is the cost, the other websites follow in the compare block
        const rest = [...sites];
        if (mine.length) {
          mine.forEach((d, i) => rows.push({ bid: i === 0 ? h.label || undefined : undefined, description: i === 0 ? `${nm0} x${R} ${room0}` : `x${R} ${room0}`, source: d.source, ...asCost(d), meal: h.meal,
            cancel: h.cancel || undefined, markup: 0, pkg: h.inPkg && i === 0 ? ["A"] : [], hotel_start: i === 0,
            compare: i === 0 && rest.length ? cmpOf(rest.shift()!) : undefined, diff_to_hotel: i > 0, _ref: ref(i === 0 ? undefined : d.source) }));
        } else {
          const top = rest.shift()!;
          rows.push({ bid: h.label || undefined, description: `${nm0} x${R} ${top.room}`, source: siteSrc(top.site), currency: "INR", amount: Math.round(top.v / R), meal: top.meal,
            cancel: top.cxl || undefined, markup: 0, pkg: h.inPkg ? ["A"] : [], hotel_start: true,
            remark: top.exact ? `${top.site} exact at checkout` : `${top.site} not checked at checkout`, _ref: ref(top.site) });
        }
        // the other websites: one "x1 room" line each, in the compare block (Difference against row 1)
        for (const x of rest) rows.push({ description: `x${R} ${x.room}`, compare: cmpOf(x), diff_to_hotel: true,
          remark: x.exact ? `${x.site} exact at checkout` : `${x.site} not checked at checkout`, _ref: ref(x.site) });
      }
      return { title: `${c.name} ${nice(c.checkIn)} to ${nice(c.checkOut)} ${nightsOf(c)}N`, rows };
    });
    return sections;
  };
  const downloadExcel = async () => {
    if (xcc !== "INR" && !xroe) return setMsg({ kind: "err", text: `Enter the ${xcc} rate (₹ per 1 ${xcc}) in the preview first.` });
    // _ref only links a preview row back to its hotel – not sent
    const sections = buildSections().map(sc => ({ ...sc, rows: sc.rows.map(({ _ref, ...r }: any) => r) }));
    const body = {
      sheet_name: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).replace(" ", ""),
      trip: { name: trip.name || "Trip", rooms: roomsForExcel(rooms), pax: paxForExcel(rooms), notes: trip.notes, costing_currency: xcc,
              rates: xcc === "INR" ? {} : { [xcc]: xroe }, markup: 0, gst: 0.05, tcs: 0.02 },   // standard GST 5% / TCS 2% rows in the sheet
      sections, packages: [{ key: "A", name: "Per package" }],
    };
    try {
      setBusy(true);
      const blob = await (await authFetch("/excel", body)).blob();
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `${trip.name || "Trip"} costing.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMsg({ kind: "ok", text: "Excel downloaded in the standard costing layout." }); setPreview(false);
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); } finally { setBusy(false); }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  // total (₹ + the site's own currency) and per night, always both
  const priceBlock = (rupees: number, n: number, opts: { amt?: number; ccy?: string; before?: number; big?: boolean } = {}) => {
    const siteCcy = opts.ccy && opts.ccy !== "INR" && opts.amt ? money(opts.amt, opts.ccy) : fmtCc(rupees);
    return (
      <div style={{ textAlign: "right", lineHeight: 1.2 }}>
        <div style={{ fontSize: opts.big ? 24 : 16, fontWeight: 600, color: TEXT }}>{inr(rupees)}</div>
        {siteCcy && <div style={{ fontSize: opts.big ? 13 : 11.5, color: MUTED, fontWeight: 600 }}>{siteCcy}</div>}
        <div style={{ fontSize: opts.big ? 12.5 : 11.5, color: ACCENT, fontWeight: 600, whiteSpace: "nowrap" }}>{inr(rupees / n)} / night</div>
        {nRooms > 1 && <div style={{ fontSize: 10.5, color: MUTED, fontWeight: 600, whiteSpace: "nowrap" }}>{inr(rupees / n / nRooms)} / room / night</div>}
      </div>
    );
  };
  const Stepper = ({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) => (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button style={{ ...round, opacity: value <= min ? 0.4 : 1 }} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus style={{ width: 14, height: 14 }} /></button>
      <span style={{ minWidth: 18, textAlign: "center", fontWeight: 600, color: TEXT, fontSize: 15 }}>{value}</span>
      <button style={{ ...round, opacity: value >= max ? 0.4 : 1 }} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus style={{ width: 14, height: 14 }} /></button>
    </div>
  );
  const sectionTitle = (text: string, sub?: string) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "4px 4px 0" }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{text}</span>
      {sub && <span style={{ fontSize: 12.5, color: MUTED }}>{sub}</span>}
    </div>
  );

  // cancellation on a row: short line (dates / fees) + ⓘ with the full policy
  const cxlCell = (id: string, short: string, full?: string, extra?: string) => {
    const open = cxlInfo === id, terms = (full || "").trim();
    const col = /^free/i.test(short) ? GREEN : /non-?refundable|no free/i.test(short) ? WARN : MUTED;
    return (
      <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 5, color: col }}>
        <span>{short || "—"}</span>
        {(terms || extra) && <button title="Full cancellation policy" onClick={() => setCxlInfo(open ? "" : id)}
          style={{ border: `1.5px solid ${col}`, color: col, background: "transparent", borderRadius: 999, width: 17, height: 17, fontSize: 10.5, fontWeight: 600, lineHeight: "13px", cursor: "pointer", padding: 0, flexShrink: 0 }}>i</button>}
        {open && (
          <div style={{ position: "absolute", right: 0, top: 22, zIndex: 40, width: 340, maxHeight: 280, overflowY: "auto", background: BG, color: TEXT, borderRadius: 12, padding: 12, fontSize: 12, fontWeight: 500, lineHeight: 1.45, whiteSpace: "pre-wrap", boxShadow: "0 14px 40px rgba(0,0,0,0.35), " + SHADOW_OUT }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><b>Cancellation policy</b><button onClick={() => setCxlInfo("")} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer" }}>✕</button></div>
            {extra && <div style={{ color: WARN, marginBottom: 6 }}>{extra}</div>}
            {terms || "No details given by the site."}
          </div>
        )}
      </span>
    );
  };
  const hotelCard = (c: City, h: Hotel, n: number, badges: { cheapest: boolean; best: boolean; rated: boolean }) => {
    const ds0 = deals(h); const mineHotel = isMine(h);
    // rows ranked by the price each row SHOWS (the chosen room / the room picked in its list); rows without it go last
    const shownOf = (d: Deal) => {
      if (d.mine) return { v: d.rupees, typed: true };
      if (h.soldOut?.[d.source]) return { v: Infinity, typed: false };
      const sk = h.roomSel?.[d.source], sr0 = sk ? (h.roomsBySite?.[d.source]?.list || []).find(r => r.key === sk) : undefined;
      if (sr0) return { v: sr0.exact || sr0.total, typed: true };
      if (h.room) { const t = typeFor(h, d.source); if (t) { const v = t.ex?.total || t.item?.total; return v ? { v, typed: true } : { v: Infinity, typed: true }; } return { v: d.rupees, typed: false }; }
      return { v: d.rupees, typed: true };
    };
    const ds = ds0.map(d => ({ d, s: shownOf(d) })).sort((a, b) => (a.s.typed === b.s.typed ? 0 : a.s.typed ? -1 : 1) || a.s.v - b.s.v).map(x => x.d);
    // the summary on the right = the cheapest row as shown (the chosen room's price when a room type is picked)
    const best = ds[0] && isFinite(shownOf(ds[0]).v) && shownOf(ds[0]).v !== ds[0].rupees ? { ...ds[0], rupees: shownOf(ds[0]).v, amt: shownOf(ds[0]).v, ccy: "INR", room: h.room || ds[0].room } : ds[0] || ds0[0];
    const showDeals = mineHotel ? ds.length > 0 : !!(h.open && h.online && ds.length);
    const link = (d: Deal) => d.link || `https://www.google.com/search?q=${encodeURIComponent(`${d.source} ${h.name} ${c.name}`)}`;
    const notOnline = h.online && (!h.online.found || !h.online.prices.length);
    return (
      <div key={h.id} style={{ ...card, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr 250px", minHeight: 150 }} className="max-md:!grid-cols-1">
          {/* image */}
          <div style={{ position: "relative", padding: 10 }}>
            {h.image ? <img src={h.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", minHeight: 140, borderRadius: 14 }} />
              : <div style={{ height: "100%", minHeight: 140, borderRadius: 14, boxShadow: SHADOW_IN, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED }}><BedDouble style={{ width: 34, height: 34 }} /></div>}
            <div style={{ position: "absolute", top: 18, left: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {mineHotel && <span style={pill(GRAD)}>Your hotel</span>}
            </div>
          </div>

          {/* details */}
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 600, color: TEXT }}>{h.online?.name && mineHotel ? h.online.name : h.name}</span>
              {h.stars ? <span style={{ display: "inline-flex" }}>{Array.from({ length: h.stars }).map((_, i) => <Star key={i} style={{ width: 13, height: 13, color: "#F5B400", fill: "#F5B400" }} />)}</span> : null}
              <div style={{ flex: 1 }} />
              <button title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }} onClick={() => setCity(c.id, { hotels: c.hotels.filter(x => x.id !== h.id) })}><X style={{ width: 16, height: 16 }} /></button>
            </div>
            {h.rating ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <span style={{ ...pill(GRAD), fontSize: 12 }}>{h.rating.toFixed(1)}</span>
                <b style={{ color: TEXT }}>{ratingWord(h.rating)}</b>
                {h.reviews ? <span style={{ color: MUTED }}>{h.reviews.toLocaleString("en-IN")} reviews</span> : null}
              </div>
            ) : null}
            {h.loading && <div style={{ fontSize: 12.5, color: ACCENT, display: "flex", gap: 5, alignItems: "center" }}><Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> Checking every booking site{nRooms > 1 ? ` for ${nRooms} rooms` : ""}…</div>}
            {h.error && <div style={{ fontSize: 12.5, color: ERR }}>{h.error}</div>}
            {notOnline && <div style={{ fontSize: 12.5, color: WARN, fontWeight: 600 }}>Not available online for these dates{h.online?.suggestions?.length ? ` — did you mean: ${h.online.suggestions.slice(0, 3).join(", ")}?` : ""}</div>}
            {mineHotel && !h.online && !h.loading && <div style={{ fontSize: 12.5, color: MUTED }}>Click <b>Search</b> to get every site's price.</div>}
            {h.checkedAt && !h.loading && <div style={{ fontSize: 11.5, color: MUTED }}>Prices checked at {clock(h.checkedAt)}{h.online?.currency && h.online.currency !== "INR" ? ` · quoted in ${h.online.currency}` : ""}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto", alignItems: "center", fontSize: 12.5 }}>
              {(() => {
                const pid = `type|${h.id}`, open = picker?.id === pid;
                const groups = open ? roomGroups(h) : [];
                const toggle = async (e: React.MouseEvent<HTMLButtonElement>) => {
                  if (open) return setPicker(null);
                  const r = e.currentTarget.getBoundingClientRect(), w = Math.min(560, window.innerWidth - 24);
                  const below = window.innerHeight - r.bottom - 12, above = r.top - 12, up = below < 320 && above > below;
                  setPicker({ id: pid, left: Math.max(12, Math.min(r.left, window.innerWidth - w - 12)), top: up ? r.top - 6 : r.bottom + 6, width: w, up, maxH: Math.min(480, up ? above : below) });
                  // rooms come with the hotel's prices (1 search, the same one "See all prices" uses)
                  let hh = h;
                  if (!h.online || h.searchedFor !== key(c, h)) { const o = await fetchOne(c, h, false, !!h.open, false); if (o) hh = { ...h, online: o }; loadStatus(); }
                  groupRooms(c, hh);
                  // only for a hotel that was never checked: once "See all prices" / Re-check ran, opening this list never opens windows
                  // (missing sites can be read with "↻ read again")
                  const everChecked = !!h.listsAt || Object.keys(h.confirmed || {}).length > 0 || Object.keys(h.roomsBySite || {}).length > 0 || Object.keys(h.listTried || {}).length > 0
                    || Object.keys(checks).some(kk => kk.startsWith(h.id + "|"));
                  if (!everChecked && extAuto && (hh.online?.prices || []).length) loadRoomLists(c, hh, true);
                };
                return (<>
                  <button data-pc-picker-btn onClick={toggle} title="Room type — the same room is priced on every site" style={{ ...inp, width: 220, padding: "7px 9px", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", textAlign: "left" }}>
                    <BedDouble style={{ width: 13, height: 13, color: ACCENT, flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: h.room ? TEXT : MUTED }}>{(() => { const f = h.room ? findType(h) : null; return f?.remapped ? f.type : h.room || "Room type (any)"; })()}</span>
                    {h.room && (h.online || h.roomsBySite) && (() => { const f = findType(h); return !f ? <span title="This room type isn't in the hotel's room list any more — pick it again" style={{ color: WARN, fontWeight: 600 }}>!</span> : f.subs > 1 ? <span title={`This hotel has ${f.subs} different rooms called "${h.room}" — pick the exact one`} style={{ color: WARN, fontWeight: 600 }}>{f.subs}</span> : null; })()}
                    {h.loading || h.typesLoading ? <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
                  </button>
                  {h.room && (() => { const f = findType(h); return f && f.subs > 1 ? <span style={{ fontSize: 11.5, color: WARN, fontWeight: 600 }}>{f.subs} different “{h.room}” rooms — open the list to pick the exact one</span> : null; })()}
                  {open && picker && (
                    <div id="pc-room-picker" style={{ position: "fixed", left: picker.left, width: picker.width, zIndex: 70, ...(picker.up ? { bottom: window.innerHeight - picker.top } : { top: picker.top }),
                      maxHeight: picker.maxH, display: "flex", flexDirection: "column", background: BG, borderRadius: 16, boxShadow: "0 18px 50px rgba(0,0,0,0.35), " + SHADOW_OUT, overflow: "hidden" }}>
                      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${MUTED}22`, display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT }}>Room types at {h.online?.name || h.name}</span>
                        <input placeholder="…or type a room name and press Enter" style={{ ...inp, padding: "6px 9px", fontSize: 12 }} defaultValue=""
                          onKeyDown={e => { if (e.key === "Enter") { setHotel(c.id, h.id, { room: (e.target as HTMLInputElement).value.trim() }); setPicker(null); } }} />
                        {h.typesLoading && <span style={{ fontSize: 11, color: ACCENT, display: "inline-flex", gap: 5, alignItems: "center" }}><Loader2 className="animate-spin" style={{ width: 11, height: 11 }} /> Matching the same rooms across sites…</span>}
                        {(() => {
                          const st = LIST_SITES.filter(sx => (h.online?.prices || []).some(p => p.source === sx && p.link)).map(sx => {
                            const v = checks[`${h.id}|${sx}|list`], n2 = h.roomsBySite?.[sx]?.list?.length || 0;
                            return { sx, v, n2, busy: siteBusy(h.id, sx) };
                          });
                          if (!st.length) return null;
                          return (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 10.5, fontWeight: 600, alignItems: "center" }}>
                              <span style={{ color: MUTED }}>Room lists:</span>
                              {st.map(x => <span key={x.sx} title={x.v && !["ok", "queued", "checking"].includes(x.v) ? x.v : ""} style={{ ...pill(BG, x.busy ? ACCENT : x.n2 ? GREEN : x.v && x.v !== "ok" ? WARN : MUTED), boxShadow: SHADOW_IN, fontSize: 10, display: "inline-flex", gap: 3, alignItems: "center" }}>
                                {x.busy ? <Loader2 className="animate-spin" style={{ width: 10, height: 10 }} /> : x.n2 ? "✓" : x.v && x.v !== "ok" ? "✗" : "–"} {x.sx}{x.n2 ? ` (${x.n2})` : ""}</span>)}
                              {!st.some(x => x.busy) && <button style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 10.5, fontWeight: 600, padding: 0 }} onClick={() => loadRoomLists(c, h)}>↻ read again</button>}
                              {st.filter(x => !x.busy && !x.n2 && x.v && x.v !== "ok").map(x => <div key={x.sx + "e"} style={{ width: "100%", color: WARN, fontWeight: 600 }}>✗ {x.sx}: {x.v}</div>)}
                            </div>
                          );
                        })()}
                      </div>
                      <div style={{ overflowY: "auto", padding: 6 }}>
                        <button onClick={() => { setHotel(c.id, h.id, { room: "" }); setPicker(null); }} style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer", borderRadius: 11, padding: "9px 12px", background: !h.room ? TINT : "transparent", color: TEXT, fontSize: 12.5, fontWeight: 600 }}>Any room — cheapest on each site</button>
                        {h.loading && <div style={{ padding: 12, fontSize: 12, color: ACCENT, display: "flex", gap: 6, alignItems: "center" }}><Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> Loading this hotel's rooms…</div>}
                        {!h.loading && groups.length === 0 && (() => {
                          const lk = Object.entries(checks).filter(([kk]) => kk.startsWith(h.id + "|") && kk.endsWith("|list"));
                          const going = lk.some(([, v]) => v === "queued" || v === "checking");
                          const err = lk.map(([, v]) => v).find(v => !["queued", "checking", "ok"].includes(v));
                          return (
                            <div style={{ padding: 12, fontSize: 12, color: MUTED, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                              <span>Google doesn't list the rooms for this hotel. Get them from the booking sites (a checker window opens for about 30 seconds — only the room list is read, no prices are checked).</span>
                              {going ? <span style={{ color: ACCENT, display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 600 }}><Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> Reading the room lists…</span>
                                : <button style={{ ...btn("primary"), padding: "7px 13px", fontSize: 12.5 }} onClick={() => loadRoomLists(c, h)}><BedDouble style={{ width: 13, height: 13 }} /> Get room list</button>}
                              {err && !going && <span style={{ color: WARN }}>{err}</span>}
                            </div>
                          );
                        })()}
                        {groups.map(g => {
                          const on = h.room === g.type;
                          return (
                            <button key={g.type} onClick={() => { setHotel(c.id, h.id, { room: g.type }); setPicker(null); }}
                              style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", textAlign: "left", border: "none", cursor: "pointer", borderRadius: 11, padding: "9px 12px", background: on ? TINT : "transparent", color: TEXT }}
                              onMouseEnter={e => { if (!on) e.currentTarget.style.background = `${ACCENT}14`; }} onMouseLeave={e => { e.currentTarget.style.background = on ? TINT : "transparent"; }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.type}</div>
                                <div style={{ marginTop: 3, fontSize: 11, color: MUTED, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.sites.length === 1 ? <b style={{ color: WARN }}>only on {g.sites[0]}</b> : <>on {g.sites.join(" · ")}</>} · {plural(g.items.length, "option", "options")}</div>
                              </div>
                              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                <div style={{ fontSize: 10.5, color: MUTED, fontWeight: 600 }}>from</div>
                                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{inr(g.from)}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>);
              })()}
              {(() => {
                // meal plans with the cheapest price for the chosen room (or any room) from the sites' own lists
                const ft = findType(h);
                const its = (ft ? ft.items : catalog(h)).filter(x => x.src === "site" && x.meal);
                const minOf = (m: string) => { const v = its.filter(x => x.meal === m).map(x => x.total); return v.length ? Math.min(...v) : 0; };
                const base = minOf("Room only");
                const lab = (code: string) => {
                  const nm = MEAL_NAME[code] || code, v = minOf(nm);
                  return v ? `${code} · ${nm} — from ${inr(v)}${base && nm !== "Room only" && v > base ? ` (+${inr(v - base)})` : ""}` : `${code} · ${nm}${its.length ? " — not offered" : ""}`;
                };
                return <select title="Meal plan — prices from the sites' room lists" style={{ ...inp, width: 185, padding: "7px 6px", fontSize: 12.5 }} value={h.meal} onChange={e => setHotel(c.id, h.id, { meal: e.target.value, mealBySite: {} })}>
                  {MEALS.map(m => <option key={m} value={m}>{lab(m)}</option>)}</select>;
              })()}
              <select style={{ ...inp, width: 86, padding: "7px 6px", fontSize: 12.5 }} value={h.label} onChange={e => setHotel(c.id, h.id, { label: e.target.value })}>{LABELS.map(l => <option key={l} value={l}>{l || "label"}</option>)}</select>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, color: TEXT, cursor: "pointer" }}>
                <input type="checkbox" checked={h.inPkg} onChange={e => setHotel(c.id, h.id, { inPkg: e.target.checked })} style={{ accentColor: ACCENT }} /> In package
              </label>
              <button style={{ ...btn(), padding: "6px 11px", fontSize: 12, color: ACCENT }} onClick={() => setHotel(c.id, h.id, { showRates: !h.showRates })}>
                <Plus style={{ width: 12, height: 12 }} /> Ottila / TBO / DMC rate
              </button>
              {h.online && autoJobs([{ c, h }]).length > 0 && <button style={{ ...btn(), padding: "6px 11px", fontSize: 12, color: GREEN }} onClick={() => autoCheck([{ c, h }])} title="Opens each site in a background tab and reads the exact total">
                <Zap style={{ width: 12, height: 12 }} /> Re-check exact prices
              </button>}
              {!mineHotel && <button style={{ ...btn(), padding: "6px 11px", fontSize: 12, color: ACCENT }} onClick={() => {
                // already has its prices → just move it to your hotels (no new checker windows; use Re-check for fresh prices)
                const checked = Object.keys(h.confirmed || {}).length > 0 || Object.keys(h.roomsBySite || {}).length > 0 || Object.keys(checks).some(kk => kk.startsWith(h.id + "|"));
                setHotel(c.id, h.id, { mine: true, open: true });
                if (h.online && h.searchedFor === key(c, h)) { if (!checked) autoCheck([{ c, h }], true); }
                else fetchOne(c, { ...h, mine: true }).then(() => loadStatus());
              }} title="Move to Your hotels — gets every site's price">
                <Pin style={{ width: 12, height: 12 }} /> Add to my hotels
              </button>}
            </div>
          </div>

          {/* best price */}
          <div style={{ margin: 10, borderRadius: 14, boxShadow: SHADOW_IN, padding: 14, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", gap: 6 }}>
            {best ? (<>
              <div style={{ fontSize: 12, color: MUTED }}>{plural(ds.length, "deal", "deals")} · cheapest on</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{best.source}{best.mine ? " (your rate)" : ""}</div>
              {!best.mine && best.room && <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textAlign: "right", maxWidth: 220, display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}><BedDouble style={{ width: 12, height: 12, color: ACCENT }} />{best.room}</div>}
              {!best.mine && (() => {
                const k = best.confirmed ? "confirmed" : best.fx?.kind;
                const look: Record<string, [React.CSSProperties, string]> = {
                  confirmed: [{ ...pill(GREEN) }, "✓ Confirmed on site"],
                  adjust: [{ ...pill(BG, ACCENT), boxShadow: SHADOW_IN }, "≈ est. on site"],
                  exact: [{ ...pill(BG, GREEN), boxShadow: SHADOW_IN }, "✓ usually exact"],
                  varies: [{ ...pill(WARN) }, "⚠ varies — confirm"],
                };
                const [st, txt] = look[k || ""] || [{ ...pill(BG, WARN), boxShadow: SHADOW_IN }, "≈ Google price"];
                return <span style={{ ...st, fontSize: 10.5 }}>{txt}</span>;
              })()}
              {priceBlock(best.rupees, n, { amt: best.amt, ccy: best.ccy, big: true })}
              <div style={{ fontSize: 11.5, color: MUTED, textAlign: "right" }}>total for {plural(n, "night", "nights")}{nRooms > 1 ? `, ${nRooms} rooms` : ""}{best.free ? " · free cancellation" : ""}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {!best.mine && <a href={link(best)} target="_blank" rel="noreferrer" style={{ ...btn("primary"), padding: "8px 13px", textDecoration: "none" }}>View deal <ExternalLink style={{ width: 13, height: 13 }} /></a>}
                {!mineHotel && <button style={{ ...btn(), padding: "8px 12px", color: ACCENT }} disabled={h.loading} onClick={() => seeAll(c, h)}>
                  {h.loading ? <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> : h.open ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                  {h.open ? "Hide prices" : "See all prices"}</button>}
              </div>
            </>) : h.fromPrice && !h.online ? (<>
              <div style={{ fontSize: 12, color: MUTED, textAlign: "right" }}>{h.fromSource ? "≈ cheapest on" : "≈ from (Google's lowest)"}</div>
              {h.fromSource && <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{h.fromSource}</div>}
              {priceBlock(h.fromPrice, n, { big: true })}
              <div style={{ fontSize: 11.5, color: MUTED, textAlign: "right" }}>total for {plural(n, "night", "nights")}{nRooms > 1 ? `, ${nRooms} rooms` : ""}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button style={{ ...btn("primary"), padding: "8px 13px" }} disabled={h.loading} onClick={() => viewDeal(c, h)} title={h.fromLink ? "" : "Gets the exact deal link (1 search)"}>
                  View deal <ExternalLink style={{ width: 13, height: 13 }} /></button>
                <button style={{ ...btn(), padding: "8px 12px", color: ACCENT }} disabled={h.loading} onClick={() => seeAll(c, h)}>
                  {h.loading ? <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />} See all prices</button>
              </div>
            </>) : <div style={{ fontSize: 13, color: MUTED, textAlign: "right" }}>{notOnline ? "Not available online" : h.online ? "None of your 6 sites have it" : "No price yet"}</div>}
          </div>
        </div>

        {/* supplier rates */}
        {h.showRates && (
          <div style={{ margin: "0 10px 10px", borderRadius: 14, boxShadow: SHADOW_IN, padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <label style={lbl}>Ottila ₹ (total){nRooms > 1 ? ` · ${nRooms} rooms` : ""}<input style={inp} value={h.ottila} onChange={e => setHotel(c.id, h.id, { ottila: e.target.value })} /></label>
            <label style={lbl}>TBO ₹ (total)<input style={inp} value={h.tbo} onChange={e => setHotel(c.id, h.id, { tbo: e.target.value })} /></label>
            <label style={lbl}>Other source<input style={inp} value={h.otherSource} onChange={e => setHotel(c.id, h.id, { otherSource: e.target.value })} /></label>
            <label style={lbl}>Other ₹ (total)<input style={inp} value={h.other} onChange={e => setHotel(c.id, h.id, { other: e.target.value })} /></label>
            <label style={lbl}>Free cxl until<input style={inp} type="date" value={h.cancel} onChange={e => setHotel(c.id, h.id, { cancel: e.target.value })} /></label>
          </div>
        )}

        {/* every site — no limit */}
        {showDeals && (
          <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
            {(() => {
              // a room type is chosen but the sites haven't been checked for it yet → say so, one click to check
              if (!h.room || !extAuto) return null;
              const f = findType(h);
              if (!f) return <div style={{ ...card, padding: "9px 12px", fontSize: 12.5, color: WARN, fontWeight: 600 }}>“{h.room}” isn't in this hotel's room list any more — open Room type and pick the room again.</div>;
              const sites = ds.filter(d => !d.mine && d.source !== "Hotel website").map(d => ({ d, t: typeFor(h, d.source) })).filter(x => x.t && !x.t.notSold);
              const missing = sites.filter(x => !x.t!.ex && !siteBusy(h.id, x.d.source));
              if (!missing.length) return null;
              return (
                <div style={{ ...card, padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5 }}>
                  <Zap style={{ width: 14, height: 14, color: ACCENT }} />
                  <span style={{ color: TEXT, fontWeight: 600 }}>Not checked yet for {f.type}{MEAL_NAME[h.meal] ? ` · ${MEAL_NAME[h.meal]}` : ""}</span>
                  <span style={{ color: MUTED }}>— {missing.map(x => x.d.source).join(", ")} show room-list / Google prices</span>
                  <button style={{ ...btn("primary"), padding: "6px 12px", fontSize: 12.5 }} onClick={() => autoCheck([{ c, h }])}><Zap style={{ width: 13, height: 13 }} /> Get exact prices for this room</button>
                </div>
              );
            })()}
            <div style={{ display: "grid", gridTemplateColumns: "34px 1fr auto 170px 120px", gap: 12, padding: "2px 12px", fontSize: 10.5, fontWeight: 600, color: MUTED, textTransform: "", letterSpacing: 0.3 }} className="max-md:!hidden">
              <span /> <span>Website ({ds.length})</span> <span /> <span style={{ textAlign: "right" }}>Total · per night</span> <span />
            </div>
            {ds.map((d, i) => {
              // this site's own room list (from the extension): pick a room / meal / cancellation option
              const seenR = new Set<string>();
              const siteRooms = (h.roomsBySite?.[d.source]?.list || []).filter(r => { const x = [r.room, r.meal, r.cxl, Math.round(r.total)].join("|"); if (seenR.has(x)) return false; seenR.add(x); return true; })
                .sort((x, y) => (x.exact || x.total) - (y.exact || y.total));
              const sr = siteRooms.find(r => r.key === h.roomSel?.[d.source]);
              const tsel = !d.mine && !sr ? typeFor(h, d.source) : null;
              const tck = tsel ? checks[`${h.id}|${d.source}|type:${tsel.tk}`] : "";
              const tBusy = tck === "queued" || tck === "checking" || tck === "verifying";
              const tPrice = tsel ? tsel.ex?.total || tsel.item?.total : undefined;
              const tCx = tsel ? tsel.ex?.cxl || tsel.item?.cxl || (tsel.item?.free ? "Free cancellation" : "") : "";
              const tMeal = tsel ? tsel.ex?.meal || tsel.item?.meal || "" : "";
              const tKey = tsel ? `type:${tsel.tk}` : "";
              const tPk = tsel && (h.picks || []).find(p => p.site === d.source && p.key === tKey);
              const srCx = sr ? sr.exactCxl || sr.cxl : "";
              const ck = sr ? checks[`${h.id}|${d.source}|${sr.key}`] : "";
              const busyR = ck === "queued" || ck === "checking" || ck === "verifying";
              const pk = sr && (h.picks || []).find(p => p.site === d.source && p.key === sr.key);
              const lb = (color: string): React.CSSProperties => ({ background: "none", border: "none", color, cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: 0, whiteSpace: "nowrap" });
              const short = (t: string, k: number) => t.length > k ? t.slice(0, k - 1) + "…" : t;
              return (
              <div key={d.source + i} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto 170px 120px", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 12, background: i === 0 ? TINT : "transparent", boxShadow: i === 0 ? "none" : SHADOW_IN }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: d.mine ? GRAD : BG, boxShadow: d.mine ? "none" : SHADOW_SM, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: d.mine ? "#fff" : ACCENT }}>{d.source[0]?.toUpperCase()}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>
                  {d.source}
                  {d.mine && <span style={{ ...pill(ACCENT), marginLeft: 8 }}>your rate</span>}
                  {i === 0 && !h.soldOut?.[d.source] && <span style={{ ...pill(GREEN), marginLeft: 8 }}>cheapest</span>}
                  {h.soldOut?.[d.source] && <span style={{ ...pill(WARN), marginLeft: 8 }}>sold out for these dates</span>}
                  {!d.mine && !siteRooms.length && (
                    <div style={{ marginTop: 3, fontSize: 12, fontWeight: 600, color: d.room ? TEXT : MUTED, opacity: d.room ? 0.85 : 1, display: "flex", alignItems: "center", gap: 5 }}>
                      <BedDouble style={{ width: 13, height: 13, color: ACCENT, flexShrink: 0 }} />
                      {sr ? <span title={sr.room}>{short(sr.room, 90)}</span> : tsel ? <span title={tsel.ex?.room || tsel.item?.name}>{short(tsel.ex?.room || tsel.item?.name || tsel.g.type, 90)}{tsel.near && !tsel.ex ? <span style={{ color: MUTED, fontWeight: 600 }}> ({tsel.near})</span> : null}</span> : d.confirmed && roomOnly(h.confirmedRoom?.[d.source]) ? <>{roomOnly(h.confirmedRoom?.[d.source])} <span style={{ color: GREEN }}>(room priced on {d.source})</span></> : d.room || "Room not shown by Google — check on the site"}
                    </div>
                  )}
                  {!d.mine && siteRooms.length > 0 && (
                    <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {(() => {
                        const pid = `${h.id}|${d.source}`, open = picker?.id === pid;
                        const fu = roomUi[pid] || {};
                        const choose = (key: string) => { setHotel(c.id, h.id, { roomSel: { ...(h.roomSel || {}), [d.source]: key } }); setPicker(null); };
                        const mealsHere = ["Room only", "Breakfast", "Half board", "Full board", "All inclusive"].filter(m => siteRooms.some(r => r.meal === m));
                        const vis = siteRooms.filter(r => (!fu.meal || r.meal === fu.meal) && (!fu.cxl || /^free/i.test(r.exactCxl || r.cxl)));
                        const chip = (on: boolean): React.CSSProperties => ({ border: "none", cursor: "pointer", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 600, background: on ? GRAD : BG, color: on ? "#fff" : TEXT, boxShadow: on ? "none" : SHADOW_SM });
                        const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
                          if (open) return setPicker(null);
                          const r = e.currentTarget.getBoundingClientRect(), w = Math.min(680, window.innerWidth - 24);
                          const below = window.innerHeight - r.bottom - 12, above = r.top - 12, up = below < 320 && above > below;
                          setPicker({ id: pid, left: Math.max(12, Math.min(r.left, window.innerWidth - w - 12)), top: up ? r.top - 6 : r.bottom + 6, width: w, up, maxH: Math.min(460, up ? above : below) });
                        };
                        return (<>
                          <button data-pc-picker-btn onClick={toggle} style={{ ...btn(), padding: "6px 12px", fontSize: 12, maxWidth: 520, gap: 8, boxShadow: open ? SHADOW_IN : SHADOW_SM }}>
                            <BedDouble style={{ width: 13, height: 13, color: ACCENT, flexShrink: 0 }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(() => {
                              // the room this row is showing, inside the selector
                              const rn = sr ? sr.room : tsel ? (tsel.ex?.room || tsel.item?.name || "") : (d.confirmed ? roomOnly(h.confirmedRoom?.[d.source]) : "") || d.room || "";
                              const ml = sr ? sr.meal : tsel ? (tsel.ex?.meal || tsel.item?.meal || "") : "";
                              void ml;
                              return rn ? short(rn, 60) : `Cheapest room · ${siteRooms.length} on ${d.source}`;
                            })()}</span>
                            {open ? <ChevronUp style={{ width: 14, height: 14, flexShrink: 0 }} /> : <ChevronDown style={{ width: 14, height: 14, flexShrink: 0 }} />}
                          </button>
                          {(() => {
                            // this website's own meal plans for the room shown, with its prices
                            const ft = findType(h);
                            const pool = (ft ? ft.items.filter(x => x.site === d.source && x.src === "site") : siteRooms.map(r => ({ meal: r.meal, total: r.exact || r.total }))) as { meal?: string; total: number }[];
                            const minOf = (m: string) => { const v = pool.filter(x => x.meal === m).map(x => x.total); return v.length ? Math.min(...v) : 0; };
                            const base = minOf("Room only"), cur2 = mealFor(h, d.source);
                            const own = !!h.mealBySite?.[d.source];
                            return (
                              <select title={`Meal plan on ${d.source}`} value={cur2} onChange={e => {
                                const code = e.target.value, nm = MEAL_NAME[code];
                                // no room type chosen → show this site's cheapest room with that meal
                                const pickR = !ft ? siteRooms.filter(r => r.meal === nm).sort((x, y) => (x.exact || x.total) - (y.exact || y.total))[0] : undefined;
                                setHotel(c.id, h.id, { mealBySite: { ...(h.mealBySite || {}), [d.source]: code }, ...(!ft ? { roomSel: { ...(h.roomSel || {}), [d.source]: pickR?.key || "" } } : {}) });
                              }}
                                style={{ ...inp, width: "auto", maxWidth: 240, padding: "5px 8px", fontSize: 12, fontWeight: 600, color: own ? ACCENT : TEXT }}>
                                {MEALS.map(m => { const nm = MEAL_NAME[m] || m, v = minOf(nm); return <option key={m} value={m}>{`${nm}${v ? ` — ${inr(v)}${base && nm !== "Room only" && v > base ? ` (+${inr(v - base)})` : ""}` : pool.length ? " — not offered" : ""}`}</option>; })}
                              </select>
                            );
                          })()}
                          {open && picker && (
                            <div id="pc-room-picker" style={{ position: "fixed", left: picker.left, width: picker.width, zIndex: 70, ...(picker.up ? { bottom: window.innerHeight - picker.top } : { top: picker.top }),
                              maxHeight: picker.maxH, display: "flex", flexDirection: "column", background: BG, borderRadius: 16, boxShadow: "0 18px 50px rgba(0,0,0,0.35), " + SHADOW_OUT, overflow: "hidden" }}>
                              <div style={{ padding: "10px 12px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", borderBottom: `1px solid ${MUTED}22` }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginRight: 4 }}>{d.source} · {vis.length} of {siteRooms.length}</span>
                                <button style={chip(!fu.meal)} onClick={() => setRoomUi(o => ({ ...o, [pid]: { ...fu, meal: "" } }))}>All meals</button>
                                {mealsHere.map(m => <button key={m} style={chip(fu.meal === m)} onClick={() => setRoomUi(o => ({ ...o, [pid]: { ...fu, meal: m } }))}>{m}</button>)}
                                <button style={chip(!!fu.cxl)} onClick={() => setRoomUi(o => ({ ...o, [pid]: { ...fu, cxl: fu.cxl ? "" : "free" } }))}>Free cancellation</button>
                              </div>
                              <div style={{ overflowY: "auto", padding: 6 }}>
                                <button onClick={() => choose("")} style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer", borderRadius: 11, padding: "9px 12px", background: !sr ? TINT : "transparent", color: TEXT, fontSize: 12.5, fontWeight: 600 }}>
                                  {d.confirmed ? "Cheapest room (checked)" : "Cheapest room"} — {inr(d.rupees)}</button>
                                {vis.map(r => {
                                  const cx = r.exactCxl || r.cxl, on = sr?.key === r.key;
                                  return (
                                    <button key={r.key} onClick={() => choose(r.key)} title={r.room}
                                      style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", textAlign: "left", border: "none", cursor: "pointer", borderRadius: 11, padding: "9px 12px", background: on ? TINT : "transparent", color: TEXT }}
                                      onMouseEnter={e => { if (!on) e.currentTarget.style.background = `${ACCENT}14`; }} onMouseLeave={e => { e.currentTarget.style.background = on ? TINT : "transparent"; }}>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.room}</div>
                                        <div style={{ marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11, fontWeight: 600 }}>
                                          <span style={{ ...pill(BG, r.meal === "Room only" ? MUTED : GREEN), boxShadow: SHADOW_IN, fontSize: 10.5 }}>{r.meal}</span>
                                          <span style={{ color: /^free/i.test(cx) ? GREEN : /non-?refundable|no free/i.test(cx) ? WARN : MUTED }}>{cx || "—"}</span>
                                          {(h.picks || []).some(p => p.site === d.source && p.key === r.key) && <span style={{ color: GREEN }}>✓ In Excel</span>}
                                        </div>
                                      </div>
                                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.ccy === "INR" || r.exact ? inr(r.exact || r.total) : `${r.ccy} ${Math.round(r.total).toLocaleString("en-IN")}`}</div>
                                        <div style={{ fontSize: 10.5, color: r.exact ? GREEN : !r.taxes ? WARN : MUTED, fontWeight: 600 }}>{r.exact ? "✓ exact" : !r.taxes ? "+ taxes" : "room-list"}</div>
                                      </div>
                                    </button>
                                  );
                                })}
                                {vis.length === 0 && <div style={{ padding: 12, fontSize: 12, color: MUTED }}>No room matches these filters.</div>}
                              </div>
                            </div>
                          )}
                        </>);
                      })()}
                      {sr && (<>
                        {sr.exact ? <span style={{ ...pill(GREEN), fontSize: 10.5 }}>✓ exact {clock(sr.exactAt)}</span>
                          : busyR ? <span style={{ ...pill(BG, ACCENT), boxShadow: SHADOW_IN, fontSize: 10.5, display: "inline-flex", alignItems: "center", gap: 4 }}><Loader2 className="animate-spin" style={{ width: 11, height: 11 }} /> {ck === "queued" ? "waiting…" : ck === "verifying" ? "verifying…" : `checking on ${d.source}…`}</span>
                          : <span style={{ ...pill(BG, WARN), boxShadow: SHADOW_IN, fontSize: 10.5 }}>room-list price</span>}
                        {!busyR && <button style={lb(ACCENT)} onClick={() => checkRoom(c, h, d.source, sr)}>{sr.exact ? "Re-check" : "Check exact"}</button>}
                        {pk ? <button style={lb(GREEN)} title="Click to take it out of the Excel" onClick={() => setPicks(c.id, h.id, ps => ps.filter(x => x.id !== pk.id))}>✓ In Excel</button>
                          : <button style={lb(TEXT)} onClick={() => setPicks(c.id, h.id, ps => [...ps, { id: uid(), site: d.source, key: sr.key, room: sr.room, meal: sr.meal, cxl: srCx, total: sr.total, taxes: sr.taxes, exact: sr.exact }])}>+ Add to Excel</button>}
                      </>)}
                    </div>
                  )}
                  {tsel?.notSold && <div style={{ marginTop: 5, fontSize: 12, fontWeight: 600, color: WARN }}>Not sold on {d.source} — {d.source}'s room list doesn't have “{tsel.g.type}”</div>}
                  {tsel && !tsel.notSold && (
                    <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      {tsel.ex ? <span style={{ ...pill(GREEN), fontSize: 10.5 }}>✓ exact {clock(tsel.ex.at)}</span>
                        : tBusy ? <span style={{ ...pill(BG, ACCENT), boxShadow: SHADOW_IN, fontSize: 10.5, display: "inline-flex", alignItems: "center", gap: 4 }}><Loader2 className="animate-spin" style={{ width: 11, height: 11 }} /> {tck === "queued" ? "waiting…" : tck === "verifying" ? "verifying…" : `checking ${tsel.g.type} on ${d.source}…`}</span>
                        : tsel.item && d.source === "Hotel website" && tsel.item.src === "site" ? <span title={`Rate: ${tsel.item.rate || "—"}\nThe page said: ${tsel.item.shown || "—"}`} style={{ ...pill(BG, WARN), boxShadow: SHADOW_IN, fontSize: 10.5 }}>read by AI from the hotel website — check before quoting</span>
                        : tsel.item ? <span style={{ ...pill(BG, WARN), boxShadow: SHADOW_IN, fontSize: 10.5 }}>{tsel.item.src === "google" ? "Google room price" : "room-list price"}</span>
                        : <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>{d.source === "Hotel website" ? "Google didn't give the hotel website's price for this room — check on the site (View deal)" : `Google didn't give ${d.source}'s price for this room — Check exact reads it on the site`}</span>}
                      {!tBusy && d.source !== "Hotel website" && <button style={lb(ACCENT)} onClick={() => checkType(c, h, d.source, tsel)}>{tsel.ex ? "Re-check" : "Check exact"}</button>}
                      {d.source === "Hotel website" && (siteBusy(h.id, d.source) ? <span style={{ ...pill(BG, ACCENT), boxShadow: SHADOW_IN, fontSize: 10.5, display: "inline-flex", alignItems: "center", gap: 4 }}><Loader2 className="animate-spin" style={{ width: 11, height: 11 }} /> reading the hotel website…</span>
                        : <button style={lb(ACCENT)} title="Opens the hotel's booking page again and reads its rates (nothing is clicked or typed)" onClick={() => loadRoomLists(c, h, false, "Hotel website")}>Re-read prices</button>)}
                      {tPrice ? (tPk ? <button style={lb(GREEN)} title="Click to take it out of the Excel" onClick={() => setPicks(c.id, h.id, ps => ps.filter(x => x.id !== tPk.id))}>✓ In Excel</button>
                        : <button style={lb(TEXT)} onClick={() => setPicks(c.id, h.id, ps => [...ps, { id: uid(), site: d.source, key: tKey, room: tsel.ex?.room || tsel.item?.name || tsel.g.type, meal: tMeal || MEAL_NAME[h.meal] || "Room only", cxl: tCx, total: tPrice, taxes: tsel.ex ? true : tsel.item?.taxes !== false, exact: tsel.ex?.total }])}>+ Add to Excel</button>) : null}
                    </div>
                  )}
                  {tsel && tck && !tBusy && tck !== "ok" && <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 600, color: WARN }}>⚡ {tck}</div>}
                  {tsel?.item && d.source === "Hotel website" && tsel.item.src === "site" && (tsel.item.rate || tsel.item.shown) && <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 600, color: MUTED }}>Rate: {tsel.item.rate || "—"}{tsel.item.shown ? ` · page said: ${tsel.item.shown}` : ""}</div>}
                  {tsel?.ex?.meal && MEAL_NAME[mealFor(h, d.source)] && tsel.ex.meal !== MEAL_NAME[mealFor(h, d.source)] && <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 600, color: WARN }}>{d.source} has no {MEAL_NAME[mealFor(h, d.source)].toLowerCase()} option for this room — this is the {tsel.ex.meal.toLowerCase()} price</div>}
                  {sr && ck && !busyR && ck !== "ok" && <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 600, color: WARN }}>⚡ {ck}</div>}
                  {!d.mine && !sr && !tsel && !d.confirmed && checks[`${h.id}|${d.source}`] && !["checking", "queued", "ok", "verifying"].includes(checks[`${h.id}|${d.source}`]) && (
                    <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 600, color: WARN }}>⚡ {checks[`${h.id}|${d.source}`]} — use View deal</div>
                  )}
                  {!d.mine && !sr && !tsel && (
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 11.5, fontWeight: 600 }}>
                      {editing && editing.hid === h.id && editing.source === d.source ? (<>
                        <span style={{ color: MUTED }}>Total on {d.source} ₹</span>
                        <input autoFocus value={editing.value} style={{ ...inp, width: 110, padding: "4px 8px", fontSize: 12.5 }}
                          onChange={e => setEditing({ ...editing, value: e.target.value })}
                          onKeyDown={e => { if (e.key === "Enter") saveConfirm(c, h); if (e.key === "Escape") setEditing(null); }} />
                        <button style={{ ...btn("primary"), padding: "4px 10px", fontSize: 11.5 }} onClick={() => saveConfirm(c, h)}>Save</button>
                        <button style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 11.5 }} onClick={() => setEditing(null)}>Cancel</button>
                      </>) : checks[`${h.id}|${d.source}`] === "checking" || checks[`${h.id}|${d.source}`] === "queued" || checks[`${h.id}|${d.source}`] === "verifying" ? (<>
                        <span style={{ ...pill(BG, ACCENT), boxShadow: SHADOW_IN, fontSize: 10.5, display: "inline-flex", alignItems: "center", gap: 4 }}><Loader2 className="animate-spin" style={{ width: 11, height: 11 }} /> {checks[`${h.id}|${d.source}`] === "queued" ? "waiting…" : checks[`${h.id}|${d.source}`] === "verifying" ? "verifying price…" : `checking on ${d.source}…`}</span>
                      </>) : d.confirmed ? (<>
                        <span style={{ ...pill(GREEN), fontSize: 10.5 }}>✓ Confirmed on site{h.confirmedAuto?.[d.source] ? " (auto)" : ""}</span>
                        {(() => {
                          // the checked room itself can go into the Excel too
                          const ckKey = `checked:${d.source}`, have = (h.picks || []).find(p => p.site === d.source && p.key === ckKey);
                          const rm = roomOnly(h.confirmedRoom?.[d.source]) || d.room || "Room";
                          const match = siteRooms.find(r => r.room && rm.toLowerCase().startsWith(r.room.toLowerCase().slice(0, 20)));
                          return have ? <button style={lb(GREEN)} title="Click to take it out of the Excel" onClick={() => setPicks(c.id, h.id, ps => ps.filter(x => x.id !== have.id))}>✓ In Excel</button>
                            : <button style={lb(TEXT)} onClick={() => setPicks(c.id, h.id, ps => [...ps, { id: uid(), site: d.source, key: ckKey, room: rm, meal: match?.meal || MEAL_NAME[h.meal] || "Room only",
                                cxl: d.cxl ? cxlLine(d.cxl, d.rupees) : d.free ? "Free cancellation" : "", total: d.rupees, taxes: true, exact: d.rupees }])}>+ Add to Excel</button>;
                        })()}
                        {h.confirmedAuto?.[d.source] && <span style={{ color: MUTED }}>checked {clock(h.confirmedAuto[d.source])}</span>}
                        <button style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: 0 }} onClick={() => setEditing({ hid: h.id, source: d.source, value: String(Math.round(d.rupees)) })}>Edit</button>
                        <button style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 11.5, padding: 0 }} onClick={() => clearConfirm(c, h, d.source)}>Undo</button>
                      </>) : (<>
                        {d.fx?.kind === "adjust" ? <>
                          <span style={{ ...pill(BG, ACCENT), boxShadow: SHADOW_IN, fontSize: 10.5 }}>≈ est. on site</span>
                          <span style={{ color: MUTED }}>{d.source} is usually {pct(d.fx.f - 1)} here ({plural(d.fx.n, "check", "checks")})</span>
                        </> : d.fx?.kind === "exact" ? <>
                          <span style={{ ...pill(BG, GREEN), boxShadow: SHADOW_IN, fontSize: 10.5 }}>✓ usually exact</span>
                          <span style={{ color: MUTED }}>Google matched the site in {plural(d.fx.n, "check", "checks")}</span>
                        </> : d.fx?.kind === "varies" ? <>
                          <span style={{ ...pill(WARN), fontSize: 10.5 }}>⚠ varies {pct(d.fx.lo)} to {pct(d.fx.hi)}</span>
                          <span style={{ color: WARN }}>Google is unreliable for {d.source} here — confirm before quoting</span>
                        </> : d.fx?.kind === "hint" ? <>
                          <span style={{ ...pill(BG, WARN), boxShadow: SHADOW_IN, fontSize: 10.5 }}>≈ Google price</span>
                          <span style={{ color: MUTED }}>1 check so far: site was {pct(d.fx.lo)} vs Google</span>
                        </> : <span style={{ ...pill(BG, WARN), boxShadow: SHADOW_IN, fontSize: 10.5 }}>≈ Google price</span>}
                        <button style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: 0 }} onClick={() => setEditing({ hid: h.id, source: d.source, value: "" })}>Confirm price</button>
                      </>)}
                    </div>
                  )}
                </div>
                {sr ? <div style={{ fontSize: 12, fontWeight: 600, maxWidth: 260, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ color: sr.meal === "Room only" ? MUTED : GREEN, fontWeight: 600 }}>{sr.meal}</span>
                  {cxlCell(`${h.id}|${d.source}|sr`, srCx, h.confirmedCxl?.[d.source]?.full)}
                </div> : tsel ? <div style={{ fontSize: 12, fontWeight: 600, maxWidth: 260, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ color: tMeal && tMeal !== "Room only" ? GREEN : MUTED, fontWeight: 600 }}>{tMeal || "Meal: not shown yet"}</span>
                  {cxlCell(`${h.id}|${d.source}|t`, tCx, tsel.ex?.full || tsel.item?.full, tsel.ex?.note ? `Includes ${tsel.ex.note}` : "")}
                </div> : <div style={{ fontSize: 12, color: d.cxl ? (d.cxl.kind === "non-refundable" ? WARN : d.free ? GREEN : TEXT) : d.free ? GREEN : MUTED, fontWeight: 600, maxWidth: 260 }}>{d.cxl ? cxlCell(`${h.id}|${d.source}|d`, cxlLine(d.cxl, d.rupees), d.cxl.full || d.cxl.text) : d.free ? (d.mine && h.cancel ? `Free cxl till ${nice(h.cancel)}` : "Free cancellation") : ""}</div>}
                {sr ? (sr.exact || sr.ccy === "INR" ? <div>{priceBlock(sr.exact || sr.total, n)}{!sr.exact && !sr.taxes && <div style={{ fontSize: 10.5, color: WARN, textAlign: "right", fontWeight: 600 }}>+ taxes</div>}</div>
                  : <div style={{ textAlign: "right", fontWeight: 600, color: TEXT }}>{sr.ccy} {Math.round(sr.total).toLocaleString("en-IN")}</div>)
                  : tsel?.notSold ? <div style={{ textAlign: "right", fontSize: 12, color: WARN, fontWeight: 600 }}>not sold here</div>
                  : tsel ? (tPrice ? <div>{priceBlock(tPrice, n)}{!tsel.ex && tsel.item?.taxes === false && <div style={{ fontSize: 10.5, color: WARN, textAlign: "right", fontWeight: 600 }}>+ taxes</div>}</div> : <div style={{ textAlign: "right", fontSize: 12, color: MUTED }}>{tBusy ? "checking…" : "price on the site"}</div>)
                  : priceBlock(d.rupees, n, { amt: d.amt, ccy: d.ccy })}
                {d.mine ? <span style={{ fontSize: 12, color: MUTED, textAlign: "right" }}>supplier rate</span>
                  : <a href={link(d)} target="_blank" rel="noreferrer" style={{ ...btn(i === 0 ? "primary" : "ghost"), justifyContent: "center", padding: "7px 10px", fontSize: 12.5, textDecoration: "none" }}>View deal <ExternalLink style={{ width: 12, height: 12 }} /></a>}
              </div>
            ); })}
          </div>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout>
      {preview && (() => {
        const secs = buildSections();
        const out = trip.cities.flatMap(c => c.hotels.filter(h => h.noExcel).map(h => ({ c, h })));
        const cell: React.CSSProperties = { padding: "7px 8px", fontSize: 12.5, color: TEXT, borderBottom: `1px solid ${MUTED}22`, verticalAlign: "top" };
        const amt = (r: any) => {
          if (!r.amount) return "—";
          if (r.currency === xcc) return xcc === "INR" ? inr(r.amount) : `${xcc} ${Number(r.amount).toLocaleString("en-IN")}`;
          const rupees = r.currency === "INR" ? r.amount : 0;
          return xcc !== "INR" && xroe && rupees ? `${xcc} ${Math.round(rupees / xroe).toLocaleString("en-IN")}` : r.currency === "INR" ? inr(r.amount) : `${r.currency} ${Number(r.amount).toLocaleString("en-IN")}`;
        };
        const remove = (r: any) => { const f = r._ref; if (!f) return; if (f.pid) setPicks(f.cid, f.hid, ps => ps.filter(x => x.id !== f.pid));
          else if (f.site) { const hh = trip.cities.find(x => x.id === f.cid)?.hotels.find(x => x.id === f.hid); setHotel(f.cid, f.hid, { excelHide: [...(hh?.excelHide || []), f.site] }); }
          else setHotel(f.cid, f.hid, { noExcel: true }); };
        return (
          <div onClick={() => setPreview(false)} style={{ position: "fixed", inset: 0, background: "rgba(10,10,25,0.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ ...card, width: "min(1000px, 100%)", maxHeight: "88vh", display: "flex", flexDirection: "column", padding: 18, gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 600, color: TEXT, flex: 1 }}>Excel preview — {plural(secs.reduce((a, s2) => a + s2.rows.length, 0), "row", "rows")}</span>
                <label style={{ ...lbl, flexDirection: "row", alignItems: "center", gap: 6 }} title="Only for the Excel — the page keeps its own currency">Excel currency
                  <select style={{ ...inp, width: 90, padding: "6px 8px" }} value={xcc} onChange={e => xlRate(e.target.value)}>{CCYS.map(c2 => <option key={c2}>{c2}</option>)}</select></label>
                {xcc !== "INR" && <label style={{ ...lbl, flexDirection: "row", alignItems: "center", gap: 6 }}>₹ per 1 {xcc}
                  <input style={{ ...inp, width: 90, padding: "6px 8px" }} value={xl.busy ? "…" : xl.roe || (xcc === cc && roe ? String(roe) : "")} onChange={e => setXl({ ...xl, ccy: xcc, roe: e.target.value, note: "typed" })} /></label>}
                <button style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }} onClick={() => setPreview(false)}><X style={{ width: 18, height: 18 }} /></button>
              </div>
              {xcc !== "INR" && <div style={{ fontSize: 11.5, color: xroe ? MUTED : WARN }}>{xroe ? `All prices in the Excel in ${xcc} at ₹${xroe} = 1 ${xcc}${xl.note ? ` (${xl.note})` : ""} — only for this Excel` : `Enter the ${xcc} rate`}</div>}
              <div style={{ overflow: "auto", flex: 1 }}>
                {secs.filter(s2 => s2.rows.length).length === 0 && <div style={{ color: MUTED, fontSize: 13, padding: 12 }}>Nothing to put in the Excel yet — add hotels to your list, or add rooms with <b>+ Add to Excel</b>.</div>}
                {secs.filter(s2 => s2.rows.length).map((s2, si) => (
                  <div key={si} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: ACCENT, margin: "4px 0 6px" }}>{s2.title}</div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr>{["Hotel & room", "Source", "Meal", "Cancellation", "Per room (stay)", "Website (yellow block)", "Note", ""].map(t => <th key={t} style={{ ...cell, fontSize: 10.5, color: MUTED, textTransform: "", textAlign: "left" }}>{t}</th>)}</tr></thead>
                      <tbody>{s2.rows.map((r: any, ri: number) => (
                        <tr key={ri}>
                          <td style={{ ...cell, fontWeight: 600 }}>{r.description}{r.bid ? <span style={{ ...pill(ACCENT), marginLeft: 6, fontSize: 10 }}>{r.bid}</span> : null}</td>
                          <td style={cell}>{r.source || "—"}</td>
                          <td style={cell}>{r.meal || "—"}</td>
                          <td style={cell}>{r.cancel || "—"}</td>
                          <td style={{ ...cell, fontWeight: 600, whiteSpace: "nowrap" }}>{amt(r)}</td>
                          <td style={{ ...cell, whiteSpace: "nowrap" }}>{r.compare ? <><b>{r.compare.source}</b> {amt(r.compare)} · {r.compare.meal || "—"}{r.compare.cancel ? ` · ${r.compare.cancel}` : ""}</> : "—"}</td>
                          <td style={{ ...cell, color: MUTED, fontSize: 11.5 }}>{r.remark || r.notes || ""}</td>
                          <td style={cell}><button title="Remove from the Excel" style={{ background: "none", border: "none", cursor: "pointer", color: ERR }} onClick={() => remove(r)}><X style={{ width: 15, height: 15 }} /></button></td>
                        </tr>))}</tbody>
                    </table>
                  </div>
                ))}
                {out.length > 0 && <div style={{ fontSize: 12, color: MUTED, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>Taken out: {out.map(({ c, h }) => (
                  <button key={h.id} style={{ ...pill(BG, ACCENT), boxShadow: SHADOW_SM, border: "none", cursor: "pointer", fontSize: 11 }} onClick={() => setHotel(c.id, h.id, { noExcel: false })}>{h.name} ↺ put back</button>))}</div>}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button style={btn()} onClick={() => setPreview(false)}>Back</button>
                <button style={{ ...btn("primary") }} disabled={busy} onClick={downloadExcel}>{busy ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Download style={{ width: 15, height: 15 }} />} Download Excel</button>
              </div>
            </div>
          </div>
        );
      })()}
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: GRAD, boxShadow: SHADOW_OUT, display: "flex", alignItems: "center", justifyContent: "center" }}><Scale style={{ width: 22, height: 22, color: "#fff" }} /></div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 32, fontWeight: 600, color: TEXT, margin: 0, lineHeight: 1.1 }}>Price Compare</h1>
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Every booking site plus your Ottila / TBO / DMC rates. Cheapest first, prices as quoted (no markup).</p>
          </div>
          {extAuto ? (
            <button onClick={() => setAutoOn(v => !v)} title="When ON, every hotel whose prices are fetched is also checked on Booking.com / Expedia / Hotels.com / MakeMyTrip in background tabs"
              style={{ ...pill(BG, autoOn ? GREEN : MUTED), boxShadow: autoOn ? SHADOW_IN : SHADOW_SM, fontSize: 12, padding: "7px 12px", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Zap style={{ width: 13, height: 13 }} /> Auto exact prices: {autoOn ? "ON" : "OFF"}{extVer ? ` · v${extVer}` : ""}
            </button>
          ) : <span style={{ position: "relative", display: "inline-flex" }}>
              <button onClick={() => setExtHelp(v => !v)} style={{ ...pill(BG, extReady ? WARN : MUTED), boxShadow: SHADOW_SM, fontSize: 12, padding: "7px 12px", border: "none", cursor: "pointer" }}>
                {extReady ? "Update Grab-price extension" : "Exact prices: set up the extension"}</button>
              {extHelp && <div style={{ position: "absolute", right: 0, top: 38, zIndex: 50, width: 360, background: BG, color: TEXT, borderRadius: 14, padding: 16, fontSize: 12.5, lineHeight: 1.55, boxShadow: "0 14px 40px rgba(0,0,0,0.3), " + SHADOW_OUT }}>
                <b style={{ fontSize: 13.5 }}>Set up the Grab-price extension (Chrome)</b>
                <ol style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  <li><a href="/downloads/grab-price-extension.zip" download style={{ color: ACCENT, fontWeight: 600 }}>Download the extension</a> and unzip it (right-click → Extract all).</li>
                  <li>Open <b>chrome://extensions</b> and switch on <b>Developer mode</b> (top right).</li>
                  <li>If an older <b>CustomHolidays – Grab Price</b> is there, press <b>Remove</b> on it.</li>
                  <li>Press <b>Load unpacked</b> and choose the unzipped <b>grab-price-extension</b> folder.</li>
                  <li>Come back here and press <b>F5</b>.</li>
                </ol>
                <div style={{ marginTop: 8, color: MUTED }}>One extension works for this dashboard and BusinessOS. It needs version 2.42 or newer to work on this site.</div>
              </div>}
            </span>}
          {status?.configured && (
            <span style={{ ...pill(BG, MUTED), boxShadow: SHADOW_IN, fontSize: 12, padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <KeyRound style={{ width: 13, height: 13, color: ACCENT }} /> {status.searches_left ?? "?"} searches left{status.keys && status.keys > 1 ? ` · key ${status.active_key ?? "-"} of ${status.keys}` : ""}
            </span>
          )}
          <button style={btn()} onClick={() => { if (confirm("Start a new trip? This clears the current one.")) setTrip({ ...EMPTY, currency: trip.currency, roe: trip.roe, roeNote: trip.roeNote, cities: [newCity()] }); }}><Trash2 style={{ width: 14, height: 14 }} /> New trip</button>
        </div>


        {grab && (
          <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 10, border: `2px solid ${GREEN}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ ...pill(GREEN), fontSize: 12 }}>Price grabbed</span>
              <b style={{ color: TEXT, fontSize: 15 }}>{inr(grab.total)}</b>
              <span style={{ color: MUTED, fontSize: 13 }}>from <b style={{ color: TEXT }}>{grab.site}</b>{grab.hotel ? <> · page says “{grab.hotel}”</> : null}{grab.checkIn ? ` · ${grab.checkIn}${grab.checkOut ? ` → ${grab.checkOut}` : ""}` : ""}</span>
            </div>
            {allHotels.length ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                <label style={{ ...lbl, flex: 2, minWidth: 220 }}>For hotel
                  <select style={inp} value={grabSel.hid} onChange={e => setGrabSel({ ...grabSel, hid: e.target.value })}>
                    {trip.cities.map(c => <optgroup key={c.id} label={c.name || "City"}>{c.hotels.filter(h => h.name.trim()).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</optgroup>)}
                  </select>
                </label>
                <label style={{ ...lbl, flex: 1, minWidth: 150 }}>Website
                  <select style={inp} value={grabSel.site} onChange={e => setGrabSel({ ...grabSel, site: e.target.value })}>
                    {["Booking.com", "Agoda", "Expedia", "Hotels.com", "MakeMyTrip", "Hotel website"].map(x => <option key={x}>{x}</option>)}
                  </select>
                </label>
                <button style={btn("primary")} onClick={applyGrab}><CheckCircle2 style={{ width: 15, height: 15 }} /> Apply as confirmed</button>
                <button style={btn()} onClick={dismissGrab}>Dismiss</button>
              </div>
            ) : <div style={{ fontSize: 13, color: WARN }}>Search a city first, then grab the price again.</div>}
            <div style={{ fontSize: 11.5, color: MUTED }}>Check the dates, rooms and guests on the site match this trip before applying.</div>
          </div>
        )}

        {status && !status.configured && (
          <div style={{ ...card, padding: 12, display: "flex", gap: 8, alignItems: "center", color: WARN, fontSize: 13 }}>
            <AlertTriangle style={{ width: 16, height: 16 }} /> Online search is off: add SERPAPI_KEYS on the server (Render). Supplier rates and the Excel still work.
          </div>
        )}

        {/* Trip bar */}
        <div className="max-md:!grid-cols-2" style={{ ...card, padding: 16, display: "grid", gridTemplateColumns: "1.8fr 2.2fr 0.9fr 1.5fr 0.7fr 0.7fr", gap: 12, alignItems: "start", position: "relative", zIndex: 5 }}>
          <label style={lbl}>Trip / client<input style={inp} value={trip.name} placeholder="Rashi Parekh - Australia" onChange={e => setT({ name: e.target.value })} /></label>

          {/* Guests & rooms (Ottila-style) */}
          <div style={{ ...lbl, position: "relative" }}>
            Guests & rooms
            <button onClick={() => setRoomsOpen(o => !o)} style={{ ...inp, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, textAlign: "left", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
              <Users style={{ width: 15, height: 15, color: ACCENT }} /> <span style={{ flex: 1 }}>{roomSummary(rooms)}</span> <ChevronDown style={{ width: 15, height: 15, color: MUTED }} />
            </button>
            {roomsOpen && (<>
              <div onClick={() => setRoomsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 8, width: 360, maxWidth: "88vw", zIndex: 50, ...card, padding: 16, textTransform: "none", letterSpacing: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: ACCENT, marginBottom: 10 }}>{roomSummary(rooms)}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 380, overflowY: "auto", padding: 4 }}>
                  {rooms.map((r, i) => (
                    <div key={i} style={{ borderRadius: 14, boxShadow: SHADOW_IN, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <b style={{ color: TEXT, fontSize: 14 }}>Room {i + 1}</b>
                        <div style={{ flex: 1 }} />
                        {rooms.length > 1 && <button title="Remove room" onClick={() => setT({ roomList: rooms.filter((_, j) => j !== i) })} style={{ ...round, width: 26, height: 26, color: ERR }}><X style={{ width: 13, height: 13 }} /></button>}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: TEXT, fontSize: 13.5, fontWeight: 600 }}>Adults</span>
                        <Stepper value={r.adults} min={1} max={6} onChange={v => setRoom(i, { adults: v })} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: TEXT, fontSize: 13.5, fontWeight: 600 }}>Children</span>
                        <Stepper value={r.ages.length} min={0} max={4} onChange={v => setChildren(i, v)} />
                      </div>
                      {r.ages.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600, marginBottom: 6 }}>Children Age (in yrs)</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {r.ages.map((a, k) => (
                              <select key={k} value={a} style={{ ...inp, width: 70, padding: "7px 8px" }}
                                onChange={e => setRoom(i, { ages: r.ages.map((x, m) => (m === k ? +e.target.value : x)) })}>
                                {Array.from({ length: 17 }, (_, y) => y + 1).map(y => <option key={y} value={y}>{y}</option>)}
                              </select>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button style={{ ...btn(), flex: 1, justifyContent: "center", color: ACCENT, opacity: rooms.length >= 9 ? 0.5 : 1 }} disabled={rooms.length >= 9}
                    onClick={() => setT({ roomList: [...rooms, { adults: 2, ages: [] }] })}><Plus style={{ width: 14, height: 14 }} /> Add Room</button>
                  <button style={{ ...btn("primary"), flex: 1, justifyContent: "center" }} onClick={() => setRoomsOpen(false)}>Done</button>
                </div>
              </div>
            </>)}
          </div>

          <label style={lbl}>Currency<select style={inp} value={cc} onChange={e => setT({ currency: e.target.value, roe: "", roeNote: "" })}>{CCYS.map(c => <option key={c}>{c}</option>)}</select></label>

          {/* ROE — automatic */}
          <div style={lbl}>
            ROE (₹ per 1 {cc})
            <div style={{ ...inp, display: "flex", alignItems: "center", gap: 6, fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
              <span style={{ flex: 1 }}>{cc === "INR" ? "—" : roe ? `₹ ${roe.toFixed(2)}` : roeBusy ? "Fetching…" : "—"}</span>
              {cc !== "INR" && <button title="Get latest rate" onClick={() => fetchRoe()} style={{ background: "none", border: "none", cursor: "pointer", color: ACCENT, display: "inline-flex", padding: 0 }}>
                <RefreshCw className={roeBusy ? "animate-spin" : ""} style={{ width: 14, height: 14 }} /></button>}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "none", letterSpacing: 0, color: roeErr ? ERR : MUTED }}>
              {cc === "INR" ? "No conversion needed" : roeErr ? (roe ? "Couldn't refresh — using last rate" : roeErr) : trip.roeNote ? `Auto · ${trip.roeNote}` : "Auto"}
            </span>
          </div>

        </div>

        {/* City tabs — one city shown at a time */}
        {(() => { return (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {trip.cities.map((c, i) => {
              const on = (trip.cities.find(x => x.id === cityTab) || trip.cities[0]).id === c.id;
              const cnt = c.hotels.filter(h => h.name.trim() && isMine(h)).length;
              return (
                <button key={c.id} onClick={() => setCityTab(c.id)}
                  style={{ ...btn(), background: on ? GRAD : undefined, color: on ? "#fff" : TEXT, boxShadow: on ? SHADOW_SM : undefined, fontWeight: 600 }}>
                  {c.name || `City ${i + 1}`}{cnt ? ` (${cnt})` : ""}
                </button>
              );
            })}
            <button style={btn()} onClick={() => { const nc = newCity(); setT({ cities: [...trip.cities, nc] }); setCityTab(nc.id); }}><Plus style={{ width: 14, height: 14 }} /> Add city</button>
          </div>
        ); })()}

        {[trip.cities.find(x => x.id === cityTab) || trip.cities[0]].map((c) => {
          const n = nightsOf(c) || 1;
          const named = c.hotels.filter(h => h.name.trim());
          const mineList = sortList(named.filter(isMine), "rated");   // ranked by guest rating (highest first)
          // other hotels: only ones that actually have a price
          const others = sortList(named.filter(h => !isMine(h) && (hasPrice(h) || h.fromPrice)), "rated");
          const visible = [...mineList.filter(hasPrice), ...others];
          const tabs: { k: SortKey; label: string }[] = [{ k: "best", label: "Best" }, { k: "cheapest", label: "Cheapest" }, { k: "rated", label: "Top rated" }];
          const top = (k: SortKey) => sortList(visible, k)[0];
          const ids = { cheapest: top("cheapest")?.id, best: top("best")?.id, rated: top("rated")?.id };
          const badges = (h: Hotel) => ({ cheapest: h.id === ids.cheapest && hasPrice(h), best: h.id === ids.best && hasPrice(h), rated: h.id === ids.rated && !!h.rating });
          const white: React.CSSProperties = { ...lbl, color: "rgba(255,255,255,0.9)" };
          const onGrad: React.CSSProperties = { ...inp, background: "rgba(255,255,255,0.96)", boxShadow: "none", color: "#1A2324" };
          return (
            <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Search bar */}
              <div style={{ background: GRAD, borderRadius: 18, boxShadow: SHADOW_OUT, padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, alignItems: "end" }}>
                <label style={{ ...white, gridColumn: "span 2" }}>Where<input style={onGrad} value={c.name} placeholder="City, e.g. Melbourne" onChange={e => setCity(c.id, { name: e.target.value })} /></label>
                <label style={white}>Check-in<input style={onGrad} type="date" value={c.checkIn} onChange={e => setCity(c.id, { checkIn: e.target.value })} /></label>
                <label style={white}>Check-out<input style={onGrad} type="date" value={c.checkOut} onChange={e => setCity(c.id, { checkOut: e.target.value })} /></label>
                <label style={white}>Stars<select style={onGrad} value={c.stars} onChange={e => setCity(c.id, { stars: +e.target.value })}>{[5, 4, 3, 0].map(s => <option key={s} value={s}>{s ? `${s}★` : "Any"}</option>)}</select></label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...btn(), background: "#0A3436", color: "#fff", boxShadow: "none", flex: 1, justifyContent: "center" }} disabled={busy || c.finding} onClick={() => searchAll(c)} title="Your hotels: every site's price. Plus other hotels in the city.">
                    {busy || c.finding ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Search style={{ width: 15, height: 15 }} />} Search
                  </button>
                  {trip.cities.length > 1 && <button title="Remove city" style={{ ...btn(), background: "transparent", color: "#fff", boxShadow: "none", border: "1px solid rgba(255,255,255,0.5)", padding: "10px 11px" }} onClick={() => { setT({ cities: trip.cities.filter(x => x.id !== c.id) }); setCityTab(""); }}><X style={{ width: 15, height: 15 }} /></button>}
                </div>
              </div>

              {/* Add hotel by name */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input style={{ ...inp, maxWidth: 460, flex: 1, minWidth: 220 }} value={c.newName || ""} placeholder="Add a hotel by name (optional) — press Enter…"
                  onChange={e => setCity(c.id, { newName: e.target.value })}
                  onKeyDown={e => { if (e.key === "Enter") addByName(c); }} />
                <button style={btn()} onClick={() => addByName(c)}><Plus style={{ width: 14, height: 14 }} /> Add hotel</button>
                <span style={{ fontSize: 12, color: MUTED }}>No hotel added? <b>Search</b> shows all hotels in the city.</span>
              </div>

              {(<>
              {/* Actions: below the "Add hotel" row of the first city */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button style={btn("primary")} disabled={busy} onClick={() => searchAll()}>{busy ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Search style={{ width: 15, height: 15 }} />} Search all cities</button>
                <button style={btn()} disabled={busy} onClick={() => searchAll(undefined, true)} title="Ask Google again for live prices (uses searches)"><RefreshCw style={{ width: 14, height: 14 }} /> Refresh live prices</button>
                <button style={{ ...btn(), color: GREEN }} disabled={busy} title="Exact prices for your hotels (and any you opened), read from the websites in background tabs"
                  onClick={() => autoCheck(trip.cities.flatMap(c => c.hotels.filter(h => h.online && (isMine(h) || h.open)).map(h => ({ c, h }))))}>
                  <Zap style={{ width: 15, height: 15 }} /> Re-check exact prices</button>
                <button style={{ ...btn(), color: GREEN }} disabled={busy} onClick={openPreview}><Download style={{ width: 15, height: 15 }} /> Download Excel</button>
                <span style={{ fontSize: 12, color: MUTED }}>≈ Google prices can differ from the website (member prices, taxes). Click View deal, then <b>Confirm price</b> — confirmed prices are used for ranking and the Excel. For {roomSummary(rooms).toLowerCase()}.</span>
              </div>
              {msg && <div style={{ fontSize: 13, color: msg.kind === "ok" ? GREEN : ERR, display: "flex", gap: 6, alignItems: "center" }}>{msg.kind === "ok" ? <CheckCircle2 style={{ width: 15, height: 15 }} /> : <AlertTriangle style={{ width: 15, height: 15 }} />} {msg.text}</div>}
              </>)}


              {named.length === 0 && !c.finding && (
                <div style={{ ...card, padding: 26, textAlign: "center", color: MUTED, fontSize: 14 }}>
                  <BedDouble style={{ width: 28, height: 28, margin: "0 auto 6px", color: ACCENT }} />
                  Enter the city and dates, then <b>Search</b>. Add hotel names first if you want specific hotels at the top.
                </div>
              )}

              {/* Your hotels — pinned first, every site */}
              {mineList.length > 0 && sectionTitle(`Your hotels (${mineList.length})`, "every website's price, cheapest first")}
              {mineList.map(h => hotelCard(c, h, n, badges(h)))}

              {/* The rest of the city */}
              {c.finding && <div style={{ fontSize: 13, color: ACCENT, display: "flex", gap: 6, alignItems: "center" }}><Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> Finding hotels in {c.name}…</div>}
              {others.length > 0 && sectionTitle(`${mineList.length ? "Other" : "All"} ${c.stars ? `${c.stars}★ ` : ""}hotels in ${c.name} (${others.length})`, "click See all prices for Booking.com, Agoda, Expedia, Hotels.com, MakeMyTrip & hotel website")}
              {others.map(h => hotelCard(c, h, n, badges(h)))}
            </div>
          );
        })}

      </div>
    </DashboardLayout>
  );
}

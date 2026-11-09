/**
 * QuoteGenerator.tsx
 * 
 * A full quote/proposal builder for travel packages.
 * - Add line items (hotel, transport, meals, activities, etc.)
 * - Auto-calculates subtotal, tax, discount, total
 * - Client details section
 * - Print / download as PDF via browser print
 * - Saves quotes to Supabase (quotes table)
 * - Dark mode aware
 */

import { useState, useRef } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/lib/supabase";
import { useDarkMode } from "@/hooks/useDarkMode";
import {
  Plus, Trash2, Download, Send, Save, CheckCircle,
  User, MapPin, Calendar, Phone, Mail, FileText,
  ChevronDown, Loader2, IndianRupee, X,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  category: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
}

interface QuoteClient {
  name: string;
  email: string;
  phone: string;
  destination: string;
  travel_dates: string;
  pax: number;
}

const CATEGORIES = [
  "Hotel / Accommodation",
  "Transport",
  "Meals & Dining",
  "Activities & Sightseeing",
  "Flights",
  "Visa & Documentation",
  "Travel Insurance",
  "Guide / Escort",
  "Miscellaneous",
];

const UNITS = ["per person", "per night", "per day", "per trip", "per vehicle", "lump sum"];

const genId = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_ITEMS: LineItem[] = [
  { id: genId(), category: "Hotel / Accommodation", description: "", qty: 2, unit: "per night", rate: 0 },
  { id: genId(), category: "Transport",             description: "", qty: 1, unit: "per trip",  rate: 0 },
];

const INR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

// ── Main Component ────────────────────────────────────────────────────────────

export default function QuoteGenerator() {
  const { dark } = useDarkMode();

  const [client, setClient] = useState<QuoteClient>({
    name: "", email: "", phone: "", destination: "", travel_dates: "", pax: 2,
  });
  const [items, setItems]           = useState<LineItem[]>(DEFAULT_ITEMS);
  const [taxPct, setTaxPct]         = useState(5);
  const [discountPct, setDiscountPct] = useState(0);
  const [notes, setNotes]           = useState("Thank you for choosing us for your travel experience. This quote is valid for 7 days.");
  const [quoteNo]                   = useState(`Q-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const printRef                    = useRef<HTMLDivElement>(null);

  // ── Calculations ──────────────────────────────────────────────────────────
  const subtotal  = items.reduce((sum, i) => sum + i.qty * i.rate, 0);
  const discount  = subtotal * (discountPct / 100);
  const afterDisc = subtotal - discount;
  const tax       = afterDisc * (taxPct / 100);
  const total     = afterDisc + tax;

  // ── Item helpers ──────────────────────────────────────────────────────────
  const addItem = () => setItems(prev => [
    ...prev,
    { id: genId(), category: CATEGORIES[0], description: "", qty: 1, unit: "per person", rate: 0 },
  ]);

  const updateItem = (id: string, key: keyof LineItem, value: string | number) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [key]: value } : i));

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  // ── Save to Supabase ──────────────────────────────────────────────────────
  const saveQuote = async () => {
    setSaving(true);
    try {
      await supabase.from("quotes").insert([{
        quote_no:     quoteNo,
        client_name:  client.name,
        client_email: client.email,
        client_phone: client.phone,
        destination:  client.destination,
        travel_dates: client.travel_dates,
        pax:          client.pax,
        items:        items,
        subtotal,
        discount_pct: discountPct,
        tax_pct:      taxPct,
        total,
        notes,
        status:       "draft",
        created_at:   new Date().toISOString(),
      }]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ── Theme ─────────────────────────────────────────────────────────────────
  const BG         = dark ? "#0C2C32" : "#F3EAEA";
  const SHADOW_OUT = dark ? "5px 5px 12px #061A1E, -5px -5px 12px #16434A" : "5px 5px 12px #D9C6C8, -5px -5px 12px #FFFFFF";
  const SHADOW_IN  = dark ? "inset 3px 3px 7px #061A1E, inset -3px -3px 7px #16434A" : "inset 3px 3px 7px #D9C6C8, inset -3px -3px 7px #FFFFFF";
  const TEXT_MAIN  = dark ? "#E6EFEC" : "#1A2324";
  const TEXT_MUTED = dark ? "#8FA6A3" : "#5B6766";
  const BORDER     = dark ? "#1E3E44" : "#E8DADB";
  const CARD_BG    = dark ? "#10343A" : "#F3EAEA";

  const card: React.CSSProperties  = { background: CARD_BG, borderRadius: 18, boxShadow: SHADOW_OUT, padding: 24, marginBottom: 20 };
  const input: React.CSSProperties = { background: BG, boxShadow: SHADOW_IN, borderRadius: 10, padding: "8px 12px", border: "none", outline: "none", fontSize: 13, color: TEXT_MAIN, fontFamily: "inherit", width: "100%" };
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: TEXT_MUTED, textTransform: "", display: "block", marginBottom: 6 };

  function Field({ lbl, children }: { lbl: string; children: React.ReactNode }) {
    return <div><span style={label}>{lbl}</span>{children}</div>;
  }

  function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
    return (
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...input, appearance: "none", paddingRight: 28, cursor: "pointer" }}
        >
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: TEXT_MUTED, pointerEvents: "none" }} />
      </div>
    );
  }

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #quote-print-area { display: block !important; }
          #quote-print-area { position: fixed; top: 0; left: 0; width: 100%; }
        }
        @media screen { #quote-print-area-hidden { display: none; } }
      `}</style>

      <DashboardLayout>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ fontSize: 22, fontWeight: 600, color: TEXT_MAIN, margin: 0 }}>Quote Generator</p>
              <p style={{ fontSize: 12, color: TEXT_MUTED, margin: "4px 0 0" }}>Create and send travel package proposals</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={saveQuote}
                disabled={saving}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 18px", borderRadius: 12, border: "none", cursor: "pointer",
                  background: saved ? "#EEFAF4" : BG, boxShadow: SHADOW_OUT,
                  color: saved ? "#2E9E6B" : TEXT_MAIN, fontSize: 13, fontWeight: 600,
                }}
              >
                {saving ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                  : saved ? <CheckCircle style={{ width: 14, height: 14 }} />
                  : <Save style={{ width: 14, height: 14 }} />}
                {saved ? "Saved!" : "Save Draft"}
              </button>
              <button
                onClick={handlePrint}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 18px", borderRadius: 12, border: "none", cursor: "pointer",
                  background: "#13585B", color: "#fff",
                  fontSize: 13, fontWeight: 600,
                }}
              >
                <Download style={{ width: 14, height: 14 }} />
                Download PDF
              </button>
            </div>
          </div>

          {/* Quote meta */}
          <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <p style={{ fontSize: 11, color: TEXT_MUTED, margin: "0 0 4px", fontWeight: 600, textTransform: "" }}>Quote Number</p>
              <p style={{ fontSize: 22, fontWeight: 600, color: "#1F6F72", margin: 0 }}>{quoteNo}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 11, color: TEXT_MUTED, margin: "0 0 4px", fontWeight: 600, textTransform: "" }}>Date</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: TEXT_MAIN, margin: 0 }}>{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
              <p style={{ fontSize: 11, color: TEXT_MUTED, margin: "3px 0 0" }}>Valid for 7 days</p>
            </div>
          </div>

          {/* Client details */}
          <div style={card}>
            <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <User style={{ width: 15, height: 15, color: "#1F6F72" }} /> Client Details
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field lbl="Client Name">
                <input style={input} value={client.name} onChange={e => setClient(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Rahul Sharma" />
              </Field>
              <Field lbl="Email">
                <input style={input} value={client.email} onChange={e => setClient(p => ({ ...p, email: e.target.value }))} placeholder="rahul@email.com" type="email" />
              </Field>
              <Field lbl="Phone">
                <input style={input} value={client.phone} onChange={e => setClient(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" />
              </Field>
              <Field lbl="No. of Pax">
                <input style={input} value={client.pax} onChange={e => setClient(p => ({ ...p, pax: Number(e.target.value) }))} type="number" min={1} />
              </Field>
              <Field lbl="Destination">
                <div style={{ position: "relative" }}>
                  <MapPin style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: TEXT_MUTED }} />
                  <input style={{ ...input, paddingLeft: 30 }} value={client.destination} onChange={e => setClient(p => ({ ...p, destination: e.target.value }))} placeholder="e.g. Kerala, India" />
                </div>
              </Field>
              <Field lbl="Travel Dates">
                <div style={{ position: "relative" }}>
                  <Calendar style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: TEXT_MUTED }} />
                  <input style={{ ...input, paddingLeft: 30 }} value={client.travel_dates} onChange={e => setClient(p => ({ ...p, travel_dates: e.target.value }))} placeholder="e.g. 15 Dec – 22 Dec 2025" />
                </div>
              </Field>
            </div>
          </div>

          {/* Line items */}
          <div style={card}>
            <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <FileText style={{ width: 15, height: 15, color: "#1F6F72" }} /> Package Items
            </p>

            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 80px 120px 100px 36px", gap: 8, marginBottom: 8 }}>
              {["Category", "Description", "Qty", "Unit", "Rate (₹)", ""].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 600, color: TEXT_MUTED, textTransform: "" }}>{h}</span>
              ))}
            </div>

            {/* Items */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map(item => (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 80px 120px 100px 36px", gap: 8, alignItems: "center" }}>
                  <Select value={item.category} onChange={v => updateItem(item.id, "category", v)} options={CATEGORIES} />
                  <input
                    style={input}
                    value={item.description}
                    onChange={e => updateItem(item.id, "description", e.target.value)}
                    placeholder="Details..."
                  />
                  <input
                    style={{ ...input, textAlign: "center" }}
                    type="number" min={1}
                    value={item.qty}
                    onChange={e => updateItem(item.id, "qty", Number(e.target.value))}
                  />
                  <Select value={item.unit} onChange={v => updateItem(item.id, "unit", v)} options={UNITS} />
                  <input
                    style={{ ...input, textAlign: "right" }}
                    type="number" min={0}
                    value={item.rate || ""}
                    onChange={e => updateItem(item.id, "rate", Number(e.target.value))}
                    placeholder="0"
                  />
                  <button
                    onClick={() => removeItem(item.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#E05B5B", padding: 6, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addItem}
              style={{
                marginTop: 14, display: "flex", alignItems: "center", gap: 7,
                background: BG, boxShadow: SHADOW_OUT, border: "none", borderRadius: 10,
                padding: "8px 16px", cursor: "pointer", color: "#1F6F72", fontSize: 12, fontWeight: 600,
              }}
            >
              <Plus style={{ width: 13, height: 13 }} /> Add Item
            </button>
          </div>

          {/* Totals + discount + tax */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            {/* Notes */}
            <div style={card}>
              <span style={label}>Notes / Terms</span>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={5}
                style={{ ...input, resize: "vertical", lineHeight: 1.6 }}
              />
            </div>

            {/* Calculation summary */}
            <div style={card}>
              <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, margin: "0 0 16px" }}>Summary</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: TEXT_MUTED }}>
                  <span>Subtotal</span><span style={{ color: TEXT_MAIN, fontWeight: 600 }}>{INR(subtotal)}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <span style={{ color: TEXT_MUTED }}>Discount</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number" min={0} max={100}
                      value={discountPct}
                      onChange={e => setDiscountPct(Number(e.target.value))}
                      style={{ ...input, width: 60, textAlign: "center", padding: "4px 8px" }}
                    />
                    <span style={{ color: TEXT_MUTED, fontSize: 12 }}>%</span>
                    <span style={{ color: "#E05B5B", fontWeight: 600, minWidth: 80, textAlign: "right" }}>-{INR(discount)}</span>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <span style={{ color: TEXT_MUTED }}>GST / Tax</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number" min={0} max={100}
                      value={taxPct}
                      onChange={e => setTaxPct(Number(e.target.value))}
                      style={{ ...input, width: 60, textAlign: "center", padding: "4px 8px" }}
                    />
                    <span style={{ color: TEXT_MUTED, fontSize: 12 }}>%</span>
                    <span style={{ color: TEXT_MAIN, fontWeight: 600, minWidth: 80, textAlign: "right" }}>+{INR(tax)}</span>
                  </div>
                </div>

                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: TEXT_MAIN }}>Total</span>
                  <span style={{ fontSize: 22, fontWeight: 600, color: "#1F6F72" }}>{INR(total)}</span>
                </div>

                {client.pax > 0 && subtotal > 0 && (
                  <div style={{ background: "rgba(20,100,110,0.08)", borderRadius: 10, padding: "8px 12px", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: TEXT_MUTED }}>Per person ({client.pax} pax)</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1F6F72" }}>{INR(total / client.pax)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Send / action bar */}
          <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, margin: 0 }}>Ready to send?</p>
              <p style={{ fontSize: 11, color: TEXT_MUTED, margin: "3px 0 0" }}>
                Save the quote first, then download as PDF to share with the client.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={saveQuote}
                disabled={saving || !client.name}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "10px 20px", borderRadius: 12, border: "none",
                  background: saving || !client.name ? BG : BG,
                  boxShadow: SHADOW_OUT, cursor: saving || !client.name ? "not-allowed" : "pointer",
                  color: saved ? "#2E9E6B" : TEXT_MAIN, fontSize: 13, fontWeight: 600,
                }}
              >
                {saving ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                  : saved ? <CheckCircle style={{ width: 14, height: 14 }} />
                  : <Save style={{ width: 14, height: 14 }} />}
                {saved ? "Saved" : "Save quote"}
              </button>
              <button
                onClick={handlePrint}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "10px 20px", borderRadius: 12, border: "none",
                  background: "#13585B",
                  color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                <Download style={{ width: 14, height: 14 }} /> Download PDF
              </button>
            </div>
          </div>

        </div>
      </DashboardLayout>

      {/* ── Print Area (hidden on screen, shown on print) ── */}
      <div id="quote-print-area" style={{ display: "none", fontFamily: "Inter, sans-serif", padding: 40, background: "#fff", color: "#0C2C32" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <img src="/ch-logo-teal.png" alt="Custom Holidays" style={{ height: 72, width: "auto", display: "block", marginBottom: 6 }} />
            <p style={{ color: "#5B6766", margin: "4px 0 0", fontSize: 12 }}>Travel Package Quote</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 20, fontWeight: 600, color: "#0B3B3D", margin: 0 }}>{quoteNo}</p>
            <p style={{ color: "#5B6766", fontSize: 12, margin: "4px 0 0" }}>{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
            <p style={{ color: "#5B6766", fontSize: 11, margin: "2px 0 0" }}>Valid for 7 days</p>
          </div>
        </div>

        <div style={{ background: "#FAF4F4", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 12px", color: "#1A2324" }}>CLIENT DETAILS</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {[
              { lbl: "Name", val: client.name || "—" },
              { lbl: "Email", val: client.email || "—" },
              { lbl: "Phone", val: client.phone || "—" },
              { lbl: "Destination", val: client.destination || "—" },
              { lbl: "Travel Dates", val: client.travel_dates || "—" },
              { lbl: "Pax", val: String(client.pax) },
            ].map(({ lbl, val }) => (
              <div key={lbl}>
                <p style={{ fontSize: 10, color: "#5B6766", margin: "0 0 2px", textTransform: "", }}>{lbl}</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#1A2324", margin: 0 }}>{val}</p>
              </div>
            ))}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
          <thead>
            <tr style={{ background: "#0B3B3D", color: "#fff" }}>
              {["Category", "Description", "Qty", "Unit", "Rate", "Amount"].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: h === "Rate" || h === "Amount" ? "right" : "left", fontSize: 11, fontWeight: 600, }}>{h.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} style={{ background: i % 2 === 0 ? "#FBF6F6" : "#fff" }}>
                <td style={{ padding: "10px 12px", fontSize: 12 }}>{item.category}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: "#4B5D5A" }}>{item.description || "—"}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "center" }}>{item.qty}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: "#5B6766" }}>{item.unit}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right" }}>{INR(item.rate)}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right", fontWeight: 600 }}>{INR(item.qty * item.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
          <div style={{ width: 280 }}>
            {[
              { lbl: "Subtotal", val: INR(subtotal), bold: false, red: false },
              { lbl: `Discount (${discountPct}%)`, val: `-${INR(discount)}`, bold: false, red: true },
              { lbl: `GST / Tax (${taxPct}%)`, val: `+${INR(tax)}`, bold: false, red: false },
            ].map(({ lbl, val, bold, red }) => (
              <div key={lbl} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F3EAEA" }}>
                <span style={{ fontSize: 12, color: "#5B6766" }}>{lbl}</span>
                <span style={{ fontSize: 12, fontWeight: bold ? 700 : 500, color: red ? "#E05B5B" : "#1A2324" }}>{val}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #0B3B3D", marginTop: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#1A2324" }}>TOTAL</span>
              <span style={{ fontSize: 20, fontWeight: 600, color: "#0B3B3D" }}>{INR(total)}</span>
            </div>
            {client.pax > 0 && subtotal > 0 && (
              <div style={{ textAlign: "right", marginTop: 4 }}>
                <span style={{ fontSize: 11, color: "#5B6766" }}>Per person: {INR(total / client.pax)}</span>
              </div>
            )}
          </div>
        </div>

        {notes && (
          <div style={{ background: "#FAF4F4", borderRadius: 10, padding: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#5B6766", margin: "0 0 6px", textTransform: "", }}>Notes & Terms</p>
            <p style={{ fontSize: 12, color: "#4B5D5A", margin: 0, lineHeight: 1.6 }}>{notes}</p>
          </div>
        )}

        <div style={{ marginTop: 32, textAlign: "center", color: "#D9C6C8", fontSize: 10 }}>
          Generated by Custom Holidays · {new Date().toLocaleString("en-IN")}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
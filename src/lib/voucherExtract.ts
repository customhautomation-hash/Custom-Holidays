/**
 * voucherExtract.ts — turns the text of a supplier confirmation into voucher details.
 * Best effort: anything it can't find is left empty and flagged for a quick check.
 */
import { analyzeDocText } from "./tripDocAnalyze";
import type { VoucherKind } from "./voucherPdf";

export const FIELDS: Record<VoucherKind, string[]> = {
  hotel:    ["Guests", "Confirmation", "Check-in", "Check-out", "Room", "Meals"],
  transfer: ["Guests", "Confirmation", "Date", "Pick-up time", "From", "To", "Vehicle"],
  activity: ["Guests", "Confirmation", "Date", "Time", "Meeting point", "Includes"],
  flight:   ["Passengers", "Booking ref", "Date", "Flight", "From", "To", "Baggage"],
};
export const NOTES_LABEL: Record<VoucherKind, string> = { hotel: "Notes for the hotel", transfer: "Notes for the driver", activity: "Notes", flight: "Notes" };
export const SMALL_PRINT: Record<VoucherKind, string> = {
  hotel: "Please show this voucher at check-in. Rates are prepaid by Custom Holidays; extras are settled directly with the hotel.",
  transfer: "Please be ready at the pick-up point 10 minutes early. If you cannot find your driver, message us on WhatsApp.",
  activity: "Please show this voucher at the start of the activity. Timings may change with local conditions.",
  flight: "This is a summary for your convenience. Please carry the airline e-ticket and your passport.",
};

const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  if (m < 0 || m > 11 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
/** First date found in a piece of text, as YYYY-MM-DD. */
export function findDate(s: string): string | null {
  let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/); if (m) return iso(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/); if (m) return iso(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s,-]*(\d{2,4})\b/i);
  if (m) return iso(+m[3], MON.indexOf(m[2].toLowerCase().slice(0, 3)), +m[1]);
  m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
  if (m) return iso(+m[3], MON.indexOf(m[1].toLowerCase().slice(0, 3)), +m[2]);
  return null;
}
export const prettyDate = (d?: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "";

const grab = (text: string, re: RegExp, group = 1) => { const m = text.match(re); return m ? m[group].replace(/\s+/g, " ").trim().replace(/[,;:]$/, "") : ""; };
const lineAfter = (text: string, label: RegExp) => {
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (m) { const rest = lines[i].slice((m.index || 0) + m[0].length).replace(/^[\s:\-–]+/, "").trim(); return rest || (lines[i + 1] || "").trim(); }
  }
  return "";
};
const dateNear = (text: string, label: RegExp) => { const s = lineAfter(text, label); return findDate(s) || ""; };
const time = (s: string) => grab(s, /\b(\d{1,2}[:.]\d{2}\s*(?:am|pm|hrs)?)\b/i);

export interface Extracted {
  kind: VoucherKind | null;   // null = not a voucher (passport, insurance, itinerary...)
  title: string;
  subtitle: string;
  date: string | null;        // for sorting into day order
  endDate: string | null;
  fields: Record<string, string>;
}

export function extractVoucher(text: string, fileName: string): Extracted {
  const a = analyzeDocText(text);
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  let kind: VoucherKind | null =
    a.category === "hotels" ? "hotel" : a.category === "flights" ? "flight" :
    a.category === "transfers" ? (/tour|class|excursion|ticket|admission|activity|safari|cruise|show/i.test(a.title || text.slice(0, 600)) && !/transfer|pick[- ]?up/i.test(a.title || "") ? "activity" : "transfer") :
    a.category === "documents" ? null :
    /hotel|resort|check[- ]?in/i.test(stem) ? "hotel" : /flight|ticket|pnr/i.test(stem) ? "flight" : /transfer|car|taxi/i.test(stem) ? "transfer" : /tour|class|activity/i.test(stem) ? "activity" : null;
  if (!text.trim()) kind = kind || null;

  const conf = grab(text, /(?:confirmation|booking|reservation|voucher|reference|ref)\s*(?:no\.?|number|ref(?:erence)?|id|code|#)?\s*[:#\-]\s*([A-Z0-9][A-Z0-9\-\/]{3,})/i)
            || grab(text, /\bPNR\s*[:\-]?\s*([A-Z0-9]{5,8})\b/i);
  const guests = lineAfter(text, /(?:lead guest|guest name|guest\(s\)|name of (?:the )?guest|passenger name|traveller name|pax name|guest)\s*:?/i).slice(0, 80);
  const fields: Record<string, string> = {};
  let title = (a.title || stem).replace(/\s+Voucher$/i, "");
  let subtitle = "";
  let date: string | null = null, endDate: string | null = null;

  if (kind === "hotel") {
    date = dateNear(text, /check[- ]?in(?: date)?/i) || findDate(text); endDate = dateNear(text, /check[- ]?out(?: date)?/i) || null;
    const ci = lineAfter(text, /check[- ]?in(?: date)?/i), co = lineAfter(text, /check[- ]?out(?: date)?/i);
    fields["Guests"] = guests; fields["Confirmation"] = conf;
    fields["Check-in"] = [prettyDate(date), time(ci)].filter(Boolean).join(" · ");
    fields["Check-out"] = [prettyDate(endDate), time(co)].filter(Boolean).join(" · ");
    fields["Room"] = lineAfter(text, /room\s*(?:type|category|name)?\s*:/i).slice(0, 70);
    fields["Meals"] = grab(text, /\b(bed and breakfast|breakfast(?: included| daily)?|half board|full board|all inclusive|room only)\b/i);
    subtitle = lineAfter(text, /(?:hotel )?address\s*:/i).slice(0, 120);
  } else if (kind === "transfer") {
    date = dateNear(text, /(?:transfer|pick[- ]?up|travel|service)\s*date/i) || findDate(text);
    fields["Guests"] = guests; fields["Confirmation"] = conf; fields["Date"] = prettyDate(date);
    fields["Pick-up time"] = time(lineAfter(text, /pick[- ]?up\s*(?:time)?/i)) || time(text);
    fields["From"] = lineAfter(text, /(?:pick[- ]?up (?:point|location|from)|from)\s*:/i).slice(0, 70);
    fields["To"] = lineAfter(text, /(?:drop[- ]?off (?:point|location)?|to)\s*:/i).slice(0, 70);
    fields["Vehicle"] = lineAfter(text, /vehicle(?: type)?\s*:/i).slice(0, 50);
  } else if (kind === "activity") {
    date = dateNear(text, /(?:activity|tour|service|travel)?\s*date/i) || findDate(text);
    fields["Guests"] = guests; fields["Confirmation"] = conf; fields["Date"] = prettyDate(date);
    fields["Time"] = time(lineAfter(text, /(?:start )?time\s*:/i)) || time(text);
    fields["Meeting point"] = lineAfter(text, /(?:meeting point|meet(?:ing)? at|pick[- ]?up point)\s*:?/i).slice(0, 80);
    fields["Includes"] = lineAfter(text, /(?:includes|inclusions)\s*:?/i).slice(0, 90);
  } else if (kind === "flight") {
    date = dateNear(text, /(?:departure|travel|flight)\s*date/i) || findDate(text);
    fields["Passengers"] = guests; fields["Booking ref"] = conf; fields["Date"] = prettyDate(date);
    fields["Flight"] = grab(text, /\b([A-Z][A-Z0-9])\s?(\d{2,4})\b/, 0);
    fields["From"] = lineAfter(text, /(?:from|departure|depart)\s*:/i).slice(0, 60);
    fields["To"] = lineAfter(text, /(?:to|arrival|arrive)\s*:/i).slice(0, 60);
    fields["Baggage"] = grab(text, /baggage[^\n]{0,40}?(\d+\s*(?:kg|kgs|pc|pcs|piece)s?)/i);
  }
  // tidy titles: no leading date, nothing after "Booking ref", transfers read "From → To"
  title = title.replace(/^\d{1,2}(st|nd|rd|th)\s+[A-Za-z]+\s+/, "").split(/\s+(booking|confirmation|reference|ref|voucher)\b/i)[0].trim();
  if (kind === "transfer" && fields["From"] && fields["To"]) title = `${fields["From"].split(/,| terminal/i)[0]} → ${fields["To"].split(",")[0]}`;
  if (kind === "activity") { const firstLine = text.split(/\n/).map(l => l.trim()).find(l => l.length > 6 && l.length < 70 && !/voucher|booking|ref|date|guest/i.test(l)); if (firstLine) title = firstLine; }
  if (/^transfer$/i.test(title) || !title) title = stem;
  if (!text.trim()) title = stem;
  return { kind, title: title.slice(0, 90), subtitle, date: date || null, endDate, fields };
}

/** Fields that should not be empty before the voucher is made. */
export function missing(kind: VoucherKind, f: Record<string, string>): string[] {
  const need: Record<VoucherKind, string[]> = { hotel: ["Guests", "Check-in", "Check-out"], transfer: ["Date", "Pick-up time"], activity: ["Date"], flight: ["Date", "Flight"] };
  return need[kind].filter(k => !(f[k] || "").trim());
}

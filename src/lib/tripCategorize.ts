/**
 * tripCategorize.ts — decides which sub-folder a dropped file belongs in,
 * based on its file name. Mirrors the standard CustomHolidays client folder:
 *
 *   Mr. Romil Amsterdam_26/
 *   ├── Flight Tickets/
 *   ├── Hotel Vouchers/
 *   ├── Transfers and Tours/
 *   ├── Documents/
 *   └── (itinerary, costing sheet, land arrangements …)
 */

export type CategoryId = "flights" | "hotels" | "transfers" | "documents" | "main";

export interface Category {
  id: CategoryId;
  folder: string;   // sub-folder name ("" = the client folder itself)
  label: string;
  hint: string;
  color: string;
}

export const CATEGORIES: Category[] = [
  { id: "flights",   folder: "Flight Tickets",      label: "Flight Tickets",      hint: "E-tickets, fare rules, boarding passes",   color: "#1F6F72" },
  { id: "hotels",    folder: "Hotel Vouchers",      label: "Hotel Vouchers",      hint: "Hotel / apartment / resort vouchers",       color: "#E0884A" },
  { id: "transfers", folder: "Transfers and Tours", label: "Transfers and Tours", hint: "Transfers, trains, tours, passes, tickets", color: "#3FAE82" },
  { id: "documents", folder: "Documents",           label: "Documents",           hint: "Passports, visas, insurance",               color: "#2C6D70" },
  { id: "main",      folder: "",                    label: "Main Folder",         hint: "Itinerary, costing sheet, land arrangements", color: "#1F6F72" },
];

export const categoryById = (id: CategoryId) => CATEGORIES.find(c => c.id === id)!;

const has = (name: string, words: string[]) =>
  words.some(w => new RegExp(`(^|[^a-z])${w}`, "i").test(name));

const DOCUMENT_WORDS = [
  "passport", "visa", "insurance", "aadha?ar", "pan ?card", "voter", "driving licen", "id ?card",
  "photo", "noc", "itr", "bank statement", "schengen form", "covering letter",
];

const FLIGHT_WORDS = [
  "flight", "e-?ticket", "boarding", "pnr", "airline", "airways", "fare ?conditions", "fare ?rules",
  "emirates", "etihad", "qatar", "indigo", "air ?india", "vistara", "akasa", "spicejet", "lufthansa",
  "klm", "air ?france", "british ?airways", "singapore ?air", "thai ?air", "cathay", "turkish",
  "swiss", "virgin", "united", "delta", "american ?air", "saudia", "oman ?air", "flydubai",
  "air ?arabia", "srilankan", "malaysia ?air", "garuda", "vietjet", "jetstar", "qantas", "finnair",
  "austrian", "aeroflot", "scoot", "airasia", "ryanair", "easyjet",
];

const TRANSFER_TOUR_WORDS = [
  "transfer", "train", "rail", "eurail", "tour", "trip", "excursion", "sightseeing", "cruise",
  "boat", "ferry", "bus", "coach", "taxi", "cab", "car hire", "car rental", "chauffeur",
  "zoo", "museum", "park", "safari", "lookout", "show", "attraction", "activity", "entry",
  "admission", "card", "pass", "experience", "dinner", "walk", "guide", "excursion", "disney",
  "universal", "tickets?",
];

const HOTEL_WORDS = [
  "hotel", "voucher", "resort", "villa", "apartment", "stay", "accommodation", "inn", "suites?",
  "hostel", "lodge", "residence", "marriott", "hilton", "hyatt", "accor", "novotel", "ibis",
  "radisson", "sheraton", "renaissance", "taj", "oberoi", "nh ", "booking\\.com", "agoda",
];

const OFFICE_EXT = /\.(xlsx?|xlsm|csv|docx?|pptx?|txt|odt|ods)$/i;

/** Best guess at which sub-folder a file belongs in. */
export function categorize(fileName: string): CategoryId {
  const n = fileName.toLowerCase().replace(/[_\-.]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  // Split camelCase like "EmiratesTicket4" before lower-casing
  const spaced = fileName.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase().replace(/[_\-.]+/g, " ");
  const name = `${n} ${spaced}`;

  if (has(name, DOCUMENT_WORDS)) return "documents";
  if (OFFICE_EXT.test(fileName)) return "main";
  if (has(name, ["boarding", "e ?ticket", "pnr", "flight", "airline", "airways", "fare ?conditions"])) return "flights";
  if (has(name, ["transfer", "train", "rail", "tour", "trip", "excursion", "cruise", "ferry"])) return "transfers";
  if (has(name, FLIGHT_WORDS) && /ticket|fare|itinerary|receipt|booking|pnr|\d/i.test(name)) return "flights";
  if (has(name, HOTEL_WORDS)) return "hotels";
  if (has(name, TRANSFER_TOUR_WORDS.filter(w => w !== "tickets?"))) return "transfers";
  if (has(name, FLIGHT_WORDS)) return "flights";
  if (/ticket/i.test(name)) return "transfers";
  return "main";
}

/** "Mr. Romil" + "Amsterdam" + "2026"  →  "Mr. Romil Amsterdam_26" */
export function buildFolderName(client: string, destination: string, year: string): string {
  const base = [client.trim(), destination.trim()].filter(Boolean).join(" ");
  const yy = year.replace(/\D/g, "").slice(-2);
  const raw = base && yy ? `${base}_${yy}` : base;
  return sanitizeName(raw);
}

/** Remove characters Windows / Drive don't allow in folder or file names. */
export function sanitizeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
}

/** "ticket.pdf" → "ticket (2).pdf" */
export function numberedName(name: string, n: number): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name} (${n})`;
  return `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
}

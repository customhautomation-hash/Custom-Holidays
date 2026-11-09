/**
 * voucherPdf.ts — makes a one-page A4 voucher PDF in the Custom Holidays style,
 * right in the browser (no extra library). Standard PDF fonts: Helvetica + Times.
 */
export type VoucherKind = "hotel" | "transfer" | "activity" | "flight";
export interface VoucherPdfInput {
  kind: VoucherKind;
  voucherNo: string;
  title: string;
  subtitle?: string;
  fields: [string, string][];
  notesLabel: string;
  notes?: string;
  smallPrint: string;
}
export const KIND_LABEL: Record<VoucherKind, string> = { hotel: "HOTEL VOUCHER", transfer: "TRANSFER VOUCHER", activity: "ACTIVITY VOUCHER", flight: "FLIGHT & TRAIN SUMMARY" };

// Unicode → WinAnsi (the byte set the standard PDF fonts understand)
const WIN: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99 };
function winAnsi(s: string): string {
  let out = "";
  for (const ch of s.replace(/→/g, " to ").replace(/₹/g, "Rs ").replace(/×/g, "x")) {
    const c = ch.codePointAt(0)!;
    if (WIN[ch]) out += String.fromCharCode(WIN[ch]);
    else if (c < 256) out += ch;
    else out += "?";
  }
  return out.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

let ctx: CanvasRenderingContext2D | null = null;
function width(text: string, size: number, font: "H" | "HB" | "T"): number {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * size * 0.5;
  ctx.font = `${font === "HB" ? "bold " : ""}${size}px ${font === "T" ? "'Times New Roman', Times, serif" : "Helvetica, Arial, sans-serif"}`;
  return ctx.measureText(text).width;
}
function wrap(text: string, size: number, font: "H" | "HB" | "T", max: number): string[] {
  const lines: string[] = [];
  for (const para of (text || "").split(/\n/)) {
    let line = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${w}` : w;
      if (width(next, size, font) > max && line) { lines.push(line); line = w; } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

async function logoJpeg(): Promise<{ bytes: Uint8Array; w: number; h: number } | null> {
  try {
    const img = new Image(); img.src = "/ch-mark-peach.png";
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const c = document.createElement("canvas"); c.width = 160; c.height = 160;
    const g = c.getContext("2d")!; g.fillStyle = "#0B3B3D"; g.fillRect(0, 0, 160, 160); g.drawImage(img, 0, 0, 160, 160);
    const b64 = c.toDataURL("image/jpeg", 0.92).split(",")[1];
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, w: 160, h: 160 };
  } catch { return null; }
}

const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `${((n >> 16) & 255) / 255} ${((n >> 8) & 255) / 255} ${(n & 255) / 255}`; };

export async function makeVoucherPdf(v: VoucherPdfInput): Promise<Blob> {
  const W = 595, H = 842, L = 48, R = W - 48;
  const ops: string[] = [];
  const fill = (hex: string) => ops.push(`${rgb(hex)} rg`);
  const rect = (x: number, y: number, w: number, h: number, hex: string) => { fill(hex); ops.push(`${x} ${y} ${w} ${h} re f`); };
  const text = (s: string, x: number, y: number, size: number, font: "H" | "HB" | "T", hex: string) => {
    fill(hex); ops.push(`BT /${font === "H" ? "F1" : font === "HB" ? "F2" : "F3"} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${winAnsi(s)}) Tj ET`);
  };
  const line = (y: number) => { ops.push(`${rgb("#EEE4E4")} RG 0.8 w ${L} ${y} m ${R} ${y} l S`); };

  const logo = await logoJpeg();
  // header band
  rect(0, H - 92, W, 92, "#0B3B3D");
  if (logo) ops.push(`q 46 0 0 46 ${L} ${H - 69} cm /Im1 Do Q`);
  text("Custom Holidays", L + 60, H - 44, 19, "T", "#F6F4EE");
  text(KIND_LABEL[v.kind].split("").join(" ").replace(/   /g, "  "), L + 60, H - 62, 8.5, "H", "#C9D8D7");
  text(v.voucherNo, R - width(v.voucherNo, 10, "H"), H - 50, 10, "H", "#D4AF5A");

  let y = H - 140;
  for (const l of wrap(v.title, 24, "T", R - L)) { text(l, L, y, 24, "T", "#1A2324"); y -= 28; }
  if (v.subtitle) { for (const l of wrap(v.subtitle, 10.5, "H", R - L)) { text(l, L, y + 6, 10.5, "H", "#5B6766"); y -= 14; } }
  y -= 10; line(y); y -= 26;

  // two-column details
  const colW = (R - L - 24) / 2;
  for (let i = 0; i < v.fields.length; i += 2) {
    let rowH = 0;
    for (let j = 0; j < 2 && i + j < v.fields.length; j++) {
      const [k, val] = v.fields[i + j]; const x = L + j * (colW + 24);
      text(k.toUpperCase(), x, y, 8, "H", "#7A8584");
      const ls = wrap(val || "—", 11.5, "H", colW);
      ls.forEach((l, n) => text(l, x, y - 15 - n * 14, 11.5, "H", "#1A2324"));
      rowH = Math.max(rowH, 15 + ls.length * 14);
    }
    y -= rowH + 14;
  }
  line(y + 4); y -= 22;
  if (v.notes) {
    text(v.notesLabel.toUpperCase(), L, y, 8, "H", "#7A8584");
    const ls = wrap(v.notes, 11.5, "H", R - L);
    ls.forEach((l, n) => text(l, L, y - 15 - n * 14, 11.5, "H", "#1A2324"));
    y -= 30 + ls.length * 14;
  }
  wrap(v.smallPrint, 9, "H", R - L).forEach((l, n) => text(l, L, y - n * 12, 9, "H", "#7A8584"));

  // footer band
  rect(0, 0, W, 34, "#F6EEDB");
  text("Custom Holidays, Mumbai  ·  24x7 travel help on WhatsApp", L, 13, 9, "H", "#8A6A24");

  // assemble
  const content = ops.join("\n");
  const enc = (s: string) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  const parts: Uint8Array[] = []; const offsets: number[] = []; let len = 0;
  const push = (b: Uint8Array) => { parts.push(b); len += b.length; };
  const obj = (n: number, body: string | Uint8Array[]) => {
    offsets[n] = len; push(enc(`${n} 0 obj\n`));
    if (typeof body === "string") push(enc(body)); else body.forEach(push);
    push(enc("\nendobj\n"));
  };
  push(enc("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >>${logo ? " /XObject << /Im1 8 0 R >>" : ""} >> >>`);
  obj(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  obj(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  obj(7, "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>");
  const count = logo ? 9 : 8;
  if (logo) obj(8, [enc(`<< /Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n`), logo.bytes, enc("\nendstream")]);
  const xref = len;
  let x = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) x += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(enc(`${x}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

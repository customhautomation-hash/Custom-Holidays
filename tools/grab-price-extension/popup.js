// CustomHolidays – Grab Price
// Reads the final total from the booking page you are looking at (only when you click), and hands it to
// BusinessOS Price Compare. Nothing is sent anywhere else.

const DASHBOARD = "https://custom-holidays.vercel.app/";

// Runs inside the booking page. Must be self-contained (no outside variables).
function extractFromPage() {
  const host = location.hostname.replace(/^www\./, "");
  const SITES = [["booking.com", "Booking.com"], ["agoda.", "Agoda"], ["expedia.", "Expedia"], ["hotels.com", "Hotels.com"], ["makemytrip.", "MakeMyTrip"]];
  const site = (SITES.find(([d]) => host.includes(d)) || [])[1] || "Hotel website";

  const MONEY = /(?:₹|Rs\.?|INR)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
  const GOOD = /^(total|price|total price|grand total|total amount|amount payable|amount to pay|total amount to be paid|you pay|you'll pay|trip total|total cost|final price|total payable|total \(.*\)|price \(.*\)|total charges)\b/i;
  const BAD = /original|before tax|per night|\/ ?night|discount|you sav|saved|% off|coupon|deposit|pay now|pay later|excl|room only|was |details|summary|breakdown/i;

  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const struck = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { if (/line-through/.test(getComputedStyle(e).textDecorationLine || "")) return true; if (e.tagName === "DEL" || e.tagName === "S") return true; } return false; };
  const toNum = (s) => parseFloat(String(s).replace(/,/g, ""));

  // find the amount element that belongs to a label: look in the label's row (parents up to 4 levels)
  const amountNear = (labelEl) => {
    let row = labelEl;
    for (let i = 0; i < 4 && row; i++, row = row.parentElement) {
      if ((row.innerText || "").length > 220) break;
      const els = [...row.querySelectorAll("*")].filter(e => e.children.length === 0 && MONEY.test(e.innerText || "") && visible(e) && !struck(e));
      if (els.length) {
        const e = els[els.length - 1];               // amount usually sits at the end of the row
        const m = (e.innerText || "").match(MONEY);
        if (m) return { amount: toNum(m[1]), el: e };
      }
      // amount split across elements, e.g. "Rs." + "27,433.86"
      const t = (row.innerText || "").replace(/\s+/g, " ");
      const m = t.match(MONEY);
      if (m && !/line-through/.test(getComputedStyle(row).textDecorationLine || "")) return { amount: toNum(m[1]), el: row };
    }
    return null;
  };

  const cands = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(" ").trim();
    const txt = (own || (el.children.length === 0 ? el.innerText : "") || "").replace(/\s+/g, " ").trim();
    if (!txt || txt.length > 45 || !GOOD.test(txt) || BAD.test(txt)) continue;
    const a = amountNear(el);
    if (!a || !(a.amount > 100)) continue;
    const st = getComputedStyle(a.el);
    let score = 10 + (/total|payable|you pay|final/i.test(txt) ? 6 : 0) + (/^price$/i.test(txt) ? 4 : 0)
      + Math.min(parseFloat(st.fontSize) || 12, 32) / 2 + ((parseInt(st.fontWeight) || 400) >= 600 ? 3 : 0);
    if (/tax|fee|charge/i.test(txt) && !/incl/i.test(txt)) score -= 8;
    cands.push({ label: txt, amount: Math.round(a.amount * 100) / 100, score });
  }
  // fallback: the biggest ₹ figure written in the largest font
  if (!cands.length) {
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length || !visible(el) || struck(el)) continue;
      const m = (el.innerText || "").match(MONEY);
      if (!m) continue;
      cands.push({ label: "Biggest price on page", amount: toNum(m[1]), score: parseFloat(getComputedStyle(el).fontSize) || 12 });
    }
  }
  const seen = new Set();
  const list = cands.sort((a, b) => b.score - a.score || b.amount - a.amount).filter(c => !seen.has(c.amount) && seen.add(c.amount)).slice(0, 5);

  const clean = (s) => (s || "").replace(/\s*[|\-–:].*$/, "").replace(/^(booking form|secure booking|payment|checkout|book now|book)\b\s*/i, "").trim();
  const og = document.querySelector('meta[property="og:title"]')?.content;
  const h1 = document.querySelector("h1")?.innerText;
  const hotel = [og, h1, document.title].map(clean).find(s => s && s.length > 3 && !/^(expedia|agoda|booking\.com|hotels\.com|makemytrip|payment|checkout|secure booking)$/i.test(s)) || "";

  const q = new URLSearchParams(location.search);
  const pick = (...k) => k.map(x => q.get(x)).find(Boolean) || "";
  return { site, hotel, candidates: list, url: location.href, checkIn: pick("checkin", "chkin", "checkIn", "startDate", "checkInDate"), checkOut: pick("checkout", "chkout", "checkOut", "endDate", "checkOutDate") };
}

const $ = (id) => document.getElementById(id);
let data = null;

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || "")) { $("site").textContent = "Open a hotel booking page first."; return; }
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractFromPage });
    data = res.result;
  } catch (e) { $("site").textContent = "Can't read this page (" + e.message + ")."; return; }
  $("site").innerHTML = `Site: <b>${data.site}</b>`;
  $("hotel").value = data.hotel;
  const box = $("cands");
  if (!data.candidates.length) box.innerHTML = '<div class="tip">No total found — type it below.</div>';
  data.candidates.forEach((c, i) => {
    const d = document.createElement("div");
    d.className = "cand" + (i === 0 ? " sel" : "");
    d.innerHTML = `<span class="lbl"></span><span class="amt">₹${c.amount.toLocaleString("en-IN")}</span>`;
    d.querySelector(".lbl").textContent = c.label;
    d.onclick = () => { box.querySelectorAll(".cand").forEach(x => x.classList.remove("sel")); d.classList.add("sel"); $("total").value = c.amount; check(); };
    box.appendChild(d);
  });
  if (data.candidates[0]) $("total").value = data.candidates[0].amount;
  check();
}
const check = () => { $("send").disabled = !(parseFloat($("total").value.replace(/,/g, "")) > 0); };
$("total").addEventListener("input", check);

$("send").addEventListener("click", async () => {
  const total = parseFloat($("total").value.replace(/,/g, ""));
  const grab = { id: Date.now(), site: data?.site || "Hotel website", hotel: $("hotel").value.trim(), total, url: data?.url || "", checkIn: data?.checkIn || "", checkOut: data?.checkOut || "" };
  await chrome.storage.local.set({ pcGrab: grab });
  const tabs = await chrome.tabs.query({ url: DASHBOARD + "*" });
  const pc = tabs.find(t => /price-compare/.test(t.url || "")) || tabs[0];
  if (pc) {
    await chrome.tabs.update(pc.id, { active: true });
    if (pc.windowId) chrome.windows.update(pc.windowId, { focused: true });
    $("msg").className = "msg ok"; $("msg").textContent = "Sent ✓ — check Price Compare.";
  } else {
    chrome.tabs.create({ url: DASHBOARD + "price-compare" });
    $("msg").className = "msg ok"; $("msg").textContent = "Sent ✓ — opening Price Compare…";
  }
});

main();

// recent automatic checks (newest first) – a failed one shows what the page said, to fix the reader
chrome.storage.local.get("pcLog", ({ pcLog = [] }) => {
  const box = document.getElementById("log");
  if (!pcLog.length) { box.innerHTML = '<div class="tip">No automatic checks yet.</div>'; return; }
  for (const r of pcLog.slice(0, 12)) {
    const d = document.createElement("div");
    d.style.cssText = "border-radius:9px;box-shadow:var(--in);padding:6px 8px;font-size:11.5px";
    const when = new Date(r.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    d.innerHTML = `<b></b> <span style="color:var(--muted)">${when}</span><div class="res"></div><div class="dbg" style="color:var(--muted);margin-top:3px;word-break:break-word"></div>`;
    d.querySelector("b").textContent = r.site;
    d.querySelector(".res").textContent = r.listOnly && !r.error ? (r.roomCount ? `✓ room list read (${r.roomCount} rooms)` : r.pageChars ? `✓ hotel website page read (${r.pageChars} characters) — rooms are read by Gemini` : "✓ room list read") : r.total ? `✓ ${r.currency && r.currency !== "INR" ? r.currency + " " : "₹"}${Number(r.total).toLocaleString("en-IN")}${r.currency && r.currency !== "INR" ? " (converted to ₹ in Price Compare)" : ""}` : `✗ ${r.error || "failed"}`;
    d.querySelector(".res").style.color = r.total ? "#2FA37A" : "#D1435B";
    const where = (r.trail && r.trail.length ? r.trail.join(" → ") : (r.url || "").replace(/^https?:\/\//, "").slice(0, 90));
    d.querySelector(".dbg").textContent = (where ? "Pages: " + where : "") + (!r.total && r.debug ? " · Page showed: " + r.debug : "") + (r.room ? " · Room: " + r.room : "") + (r.version ? " · v" + r.version : "");
    box.appendChild(d);
  }
});

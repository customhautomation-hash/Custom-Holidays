// CustomHolidays – Grab Price: automatic checking.
// Price Compare sends a list of deal links → we open them in a small VISIBLE "price checker" window
// (Chrome pauses hidden tabs, and sites like Expedia only draw their prices when the page is on screen),
// read the final total for the stay, close the tab and send the price back. The window closes by itself.

// any country's Expedia (expedia.mx, .de, …) and Hotels.com (hoteles.com, …) – they are switched to the Indian site (₹)
const ALLOWED = /(^|\.)(booking\.com|expedia\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})|hotels\.com|hoteles\.com|makemytrip\.com|agoda\.com)$/i;
const GOOGLE = /(^|\.)google\.[a-z.]+$/i;   // Google's own 'redirecting…' page in between
// any real website counts (hotel's own site, booking engines, …) – just not Google itself or our dashboard
const onSite = (host) => !!host && !GOOGLE.test(host) && !/(^|\.)vercel\.app$|^localhost$|^127\.0\.0\.1$/i.test(host);
const KNOWN = ["Booking.com", "Expedia", "Hotels.com", "MakeMyTrip", "Agoda"];
const COMPARE = /(^|\.)(hotelscombined|kayak|trivago|momondo|skyscanner|wego|tripadvisor)\.[a-z.]+$/i;
// Google sometimes labels a comparison-site link as "Hotels.com" etc. → search the real site directly
function directSearch(job) {
  const q = encodeURIComponent([job.hotel, job.city].filter(Boolean).join(", "));
  if (!job.checkIn || !q) return "";
  const a = job.adults || 2, r = job.rooms || 1;
  if (job.source === "Hotels.com") return `https://in.hotels.com/Hotel-Search?destination=${q}&startDate=${job.checkIn}&endDate=${job.checkOut}&adults=${a}&rooms=${r}&locale=en_IN&siteid=300000036`;
  if (job.source === "Expedia") return `https://www.expedia.co.in/Hotel-Search?destination=${q}&startDate=${job.checkIn}&endDate=${job.checkOut}&adults=${a}&rooms=${r}`;
  if (job.source === "Booking.com") return `https://www.booking.com/searchresults.html?ss=${q}&checkin=${job.checkIn}&checkout=${job.checkOut}&group_adults=${a}&no_rooms=${r}&group_children=0&selected_currency=INR`;
  return "";
}
// Always look at prices in rupees (₹). Each rule was checked on the live site.
function inrUrl(u, job) {
  try {
    const x = new URL(u), h = x.hostname, q = x.searchParams, before = x.href;
    const ci = job?.checkIn, co = job?.checkOut, ad = job?.adults, rm = job?.rooms;
    if (/(^|\.)agoda\.com$/i.test(h)) {
      q.set("currency", "INR");
      if (ci && !/\/book\//i.test(x.pathname)) { q.set("checkIn", ci); if (job.nights) q.set("los", String(job.nights)); if (ad) q.set("adults", String(ad)); if (rm) q.set("rooms", String(rm)); }
    } else if (/(^|\.)booking\.com$/i.test(h) && !/^secure\./i.test(h)) {
      if (!ci && !q.get("checkin")) return u;                     // no dates known → don't reload (would lose them)
      q.set("selected_currency", "INR");
      if (ci) { q.set("checkin", ci); q.set("checkout", co); if (ad) q.set("group_adults", String(ad)); if (rm) q.set("no_rooms", String(rm)); if (!q.get("group_children")) q.set("group_children", "0"); }
    } else if (INDIA_SITES.expedia && /(^|\.)expedia\.[a-z.]+$/i.test(h) && !/^www\.expedia\.co\.in$/i.test(h)) {
      x.hostname = "www.expedia.co.in"; q.delete("currency");          // any country's Expedia → the Indian site (₹)
    } else if (INDIA_SITES.hotels && /(^|\.)hotele?s\.com$/i.test(h) && !/^in\.hotels\.com$/i.test(h)) {
      x.hostname = "in.hotels.com"; q.delete("currency"); q.delete("pos");   // uk./au./www.hotels.com → India site (₹)
    }
    if (/^in\.hotels\.com$/i.test(x.hostname)) { q.set("locale", "en_IN"); q.set("siteid", "300000036"); }
    if (ci && /expedia\.co\.in$|hotels\.com$/i.test(x.hostname) && /Hotel-Information|\/ho\d+/i.test(x.pathname) && !q.get("chkin")) { q.set("chkin", ci); q.set("chkout", co); }
    if (ci && /expedia\.co\.in$|hotels\.com$/i.test(x.hostname) && /Hotel-Search/i.test(x.pathname)) { q.set("startDate", ci); q.set("endDate", co); if (ad) q.set("adults", String(ad)); }
    return x.href === before ? u : x.href;
  } catch {}
  return u;
}
const INDIA_SITES = { expedia: true, hotels: true };
// "View deal" tabs opened from Price Compare → open the rupee version too
const fromDashboard = new Set();
chrome.tabs.onCreated.addListener((t) => {
  if (!t.openerTabId) return;
  chrome.tabs.get(t.openerTabId).then(o => { if (/businessos[^/]*\.vercel\.app|custom-holidays[^/]*\.vercel\.app|localhost|127\.0\.0\.1/.test(o.url || "")) fromDashboard.add(t.id); }).catch(() => {});
});
chrome.tabs.onUpdated.addListener((id, info) => {
  if (!fromDashboard.has(id) || !info.url) return;
  const fixed = inrUrl(info.url);
  if (fixed !== info.url) { fromDashboard.delete(id); chrome.tabs.update(id, { url: fixed }).catch(() => {}); }
});
chrome.tabs.onRemoved.addListener((id) => fromDashboard.delete(id));
const WINDOWS = 3;                 // three checker windows side by side → three sites at the same time (faster)
// Hotels.com shows a "Bot or Not?" robot test to automatic visits → not checked automatically (same rooms as Expedia).
// Expedia does the same ("Bot or Not?"), so neither is opened automatically – repeated tries could get your
// office internet flagged. Check them by hand: View deal → booking step → ₹ icon.
// When a robot test appears, the checker window comes to the front and waits for YOU to complete it
// (the extension never answers it itself), then reads the price.
const SKIP = {};
const ROBOT_WAIT = 3 * 60 * 1000;
const isRobotPage = () => /captcha|are you a robot|bot or not|robot or human|are you human|verify you are human|unusual traffic|press (and|&) hold/i
  .test(document.title + " " + (document.body?.innerText || "").slice(0, 6000)) && (document.body?.innerText || "").length < 6000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Runs inside the hotel's page on the booking site. Must be self-contained.
// Built from the real page layouts (Oct 2026):
//  • Booking.com hotel page: room table #hprt-table, each row "₹ 27,000 … +₹ 4,860 taxes and charges … Guests: 2 adults"
//    (the same table also lists cheaper 1-adult prices → only rows for our number of adults count)
//  • Booking.com checkout (secure.booking.com/book.html): "Price ₹ 36,029.60  +₹ 6,485.33 taxes and charges"
//  • Expedia / Hotels.com hotel page: "Choose your room" section, each room "View all photos for <room> … ₹146,910 total"
//    (further down the page shows OTHER hotels' totals → only the "Choose your room" section counts)
//  • Expedia search page (Google sometimes links here): find THIS hotel's card and open its page
async function readSitePrice(site, nights, adults, hotelName, strict, pickKey, pickWant) {
  // which currency is the page in? (the token most often written right before a number)
  const pageCurrency = () => {
    const norm = { "₹": "INR", "RS": "INR", "RS.": "INR", "INR": "INR", "US$": "USD", "USD": "USD", "$": "USD", "A$": "AUD", "AUD": "AUD", "S$": "SGD", "SGD": "SGD",
      "AED": "AED", "€": "EUR", "EUR": "EUR", "£": "GBP", "GBP": "GBP", "฿": "THB", "THB": "THB" };
    const counts = {};
    for (const m of (document.body?.innerText || "").matchAll(/(₹|Rs\.?|INR|US\$|USD|A\$|AUD|S\$|SGD|AED|€|EUR|£|GBP|฿|THB|\$)\s?\d/g)) {
      const c = norm[m[1].toUpperCase()] || "INR"; counts[c] = (counts[c] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "INR";
  };
  let roomList = [], roomsUrl = "", chosenPick = null;
  const core = async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const num = (s) => parseFloat(String(s).replace(/,/g, ""));
  const cents = (v) => Math.round(v * 100) / 100;
  const R = "(?:₹|Rs\\.?|INR|US\\$|USD|A\\$|AUD|S\\$|SGD|AED|€|EUR|£|GBP|฿|THB|\\$)\\s?";   // any currency; converted to ₹ in Price Compare
  const AMT = "([0-9][0-9,]*(?:\\.[0-9]{1,2})?)";
  const rx = (s) => new RegExp(s, "gi");
  const clean = (s) => (s || "").replace(/[   ]/g, " ");
  const STOP = ["hotel", "hotels", "the", "and", "resort", "by", "a", "an", "of", "at", "in"];
  const words = (s) => clean(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP.includes(w));
  // words match if equal, or (for longer words) differ by one letter – "Swenska" = "Svenska"
  const near = (x, y) => {
    if (x === y) return true;
    if (Math.min(x.length, y.length) < 5 || Math.abs(x.length - y.length) > 1) return false;
    let i = 0, j = 0, d = 0;
    while (i < x.length && j < y.length) {
      if (x[i] === y[j]) { i++; j++; continue; }
      if (++d > 1) return false;
      if (x.length > y.length) i++; else if (y.length > x.length) j++; else { i++; j++; }
    }
    return d + (x.length - i) + (y.length - j) <= 1;
  };
  const overlap = (a, b) => {
    const A = words(a), B = words(b);
    if (!A.length) return clean(b).toLowerCase().includes(clean(a).toLowerCase().trim()) ? 1 : 0;
    return A.filter(w => B.some(v => near(w, v))).length / A.length;
  };
  // same hotel? all/most of our name's words in the site's title – or the site uses a SHORT form of the name
  // ("The Happo" for "The Happo by HHG": every word of the title is in our name and half of ours is in the title)
  const needOf = () => words(hotelName).length <= 2 ? 1 : 0.75;
  const sameHotel = (title) => { const f = overlap(hotelName, title); return f >= needOf() || (f >= 0.5 && words(title).length >= 1 && overlap(title, hotelName) === 1); };
  adults = adults || 2;
  const cheapest = (list) => list.filter(x => x.total > 100).sort((a, b) => a.total - b.total)[0];
  let snippet = "", clicked = false;
  // every room + option on the hotel page (room-list prices) – sent to Price Compare for its "All rooms" table
  const mealOf = (t) => /all[- ]inclusive/i.test(t) ? "All inclusive"
    : /breakfast included/i.test(t) && /lunch included/i.test(t) && /dinner included/i.test(t) ? "Full board"
    : /breakfast included/i.test(t) && /(?:dinner|lunch) included/i.test(t) ? "Half board"
    : /full board|breakfast,? lunch (?:&|and) dinner/i.test(t) ? "Full board"
    : /half board|breakfast (?:&|and) dinner|dinner (?:&|and) breakfast/i.test(t) ? "Half board"
    : /breakfast (?:is )?included|includes breakfast|free breakfast|breakfast for \d|breakfast for (?:two|2)|with breakfast|bed and breakfast|\bB&B\b/i.test(t) ? "Breakfast"
    : "Room only";
  const cxlOf = (t) => {
    const f = t.match(/(?:free cancell?ation|fully refundable|cancel for free)\s*(?:before|until|till|by)\s*([^\n]{3,40}?)(?:\n|$|\s{2})/i);
    if (f) return "Free till " + f[1].replace(/[.,]\s*$/, "").trim();
    if (/non-?refundable/i.test(t)) return "Non-refundable";
    if (/free cancell?ation|fully refundable/i.test(t)) return "Free cancellation";
    if (/partially refundable/i.test(t)) return "Partially refundable";
    if (/^\s*cancellation policy\s*$/im.test(t)) return "No free cancellation";   // Agoda: only a "Cancellation policy" link = not free
    return "";
  };
  // "Check exact" for a room: by its key on this site, or (room type chosen on Price Compare) the closest room name + meal
  const picking = !!(pickKey || (pickWant && pickWant.names && pickWant.names.length));
  const choose = (list, roomOf, textOf, keyOf, priceOf) => {
    const k = pickKey && list.find(x => keyOf(x) === pickKey); if (k) return k;
    if (!(pickWant && pickWant.names && pickWant.names.length)) return null;
    // the room CATEGORY must be the same (a Club room is never swapped for a Deluxe room)
    const CATS = ["presidential suite", "royal suite", "penthouse", "villa", "cottage", "apartment", "studio", "family room", "junior suite", "executive suite", "deluxe suite", "premier suite", "club suite", "suite", "club", "executive", "premier", "premium", "luxury", "deluxe", "superior", "classic", "standard"];
    const catOf = (n) => { const t = " " + clean(n).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ") + " "; return CATS.find(c => t.includes(" " + c + " ")) || ""; };
    if (pickWant.cat) list = list.filter(x => catOf(roomOf(x) || "") === pickWant.cat);
    // the room names THIS site uses for the chosen room (from its own room list) → only those rooms, never a look-alike
    const nk = (n) => clean(n).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    if (pickWant.exact && pickWant.exact.length) { const ex = pickWant.exact.map(nk); list = list.filter(x => ex.includes(nk(roomOf(x) || ""))); }
    const sc = list.map(x => {
      const nm = roomOf(x) || "";
      const o = pickWant.exact && pickWant.exact.length ? 1 : Math.max(...pickWant.names.map(n => Math.max(overlap(n, nm), overlap(nm, n))));
      return { x, o, s: o + (pickWant.meal && mealOf(textOf(x) || "") === pickWant.meal ? 0.3 : 0) };
    }).filter(y => y.o >= 0.5);
    sc.sort((a, b) => (Math.abs(b.s - a.s) > 0.05 ? b.s - a.s : priceOf(a.x) - priceOf(b.x)));
    if (sc[0]) chosenPick = { room: roomOf(sc[0].x) || "", meal: mealOf(textOf(sc[0].x) || ""), addOn: sc[0].x.addOn || 0, addOnNote: sc[0].x.addOnNote || "" };
    return sc[0] ? sc[0].x : null;
  };
  const setList = (list) => { const seen = new Set(); roomList = list.filter(x => { const d = [x.room, mealOf(x.text || ""), cxlOf(x.text || ""), Math.round(x.total)].join("|"); if (seen.has(d)) return false; seen.add(d); return true; }).map(x => ({ key: x.key, room: x.room, meal: mealOf(x.text || ""), cxl: cxlOf(x.text || ""), total: cents(x.total), taxes: x.taxes !== false })); roomsUrl = location.href; };
  const inrLink = (u) => { try { const x = new URL(u); if (/agoda\.com$/i.test(x.hostname)) x.searchParams.set("currency", "INR"); return x.href; } catch { return u; } };
  const label = (b) => clean(b.innerText || b.value || "").trim().split(/\n/).map(x => x.trim()).filter(Boolean)[0] || "";
  const ss = { get: (k) => { try { return sessionStorage.getItem(k) || ""; } catch { return ""; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
  // press the booking button of the cheapest room (this only opens the site's checkout / booking form – nothing is booked)
  const pressCheapest = async (scope, btnRx, room) => {
    const btns = [...scope.querySelectorAll("button, a, [role='button']")].filter(b => btnRx.test(label(b)) && b.getClientRects().length > 0);
    const priced = btns.map(b => {
      let c = b, amt = 0;
      for (let k = 0; k < 8 && c; k++, c = c.parentElement) {
        const ms = [...clean(c.innerText).matchAll(rx(R + AMT))].map(x => num(x[1])).filter(v => v > 100);
        if (ms.length) { amt = ms[ms.length - 1]; break; }
      }
      return { b, amt };
    }).filter(x => x.amt);
    const pick = priced.sort((a, b) => a.amt - b.amt)[0] || (btns[0] && { b: btns[0] });
    if (!pick) return false;
    if (room) ss.set("pcRoom", room);
    ss.set("pcPressed", String(Date.now()));
    pick.b.scrollIntoView({ block: "center" }); await sleep(600); pick.b.click();
    return true;
  };

  for (let t = 0; t < 30; t++) {
    const txt = clean(document.body?.innerText || "");
    if (/captcha|are you a robot|bot or not|robot or human|are you human|verify you are human|unusual traffic|access denied|press (and|&) hold/i.test(document.title + " " + txt) && txt.length < 6000)
      return { robot: true, debug: txt.slice(0, 300) };

    if ((site === "Expedia" || site === "Hotels.com") && /checkout/i.test(location.pathname + location.hostname)) {
      // checkout: "Total ₹17,496.70" (room + taxes + resort fee). Never touch the form or the "Book" button.
      const m = [...txt.matchAll(rx("(?:^|\\n)\\s*Total\\s*\\n?\\s*" + R + AMT))].pop();
      if (m && num(m[1]) > 100) return { total: cents(num(m[1])), room: ss.get("pcRoom"), url: location.href, allRooms: true, free: /fully refundable|free cancellation/i.test(txt) };
    } else if (site === "Expedia" || site === "Hotels.com") {
      // a "how would you like to pay?" box after pressing Reserve → take the first option
      if (ss.get("pcPressed")) {
        const shown = (e) => e.getClientRects().length > 0;
        // the smallest visible box that offers the payment choices
        const dlg = [...document.querySelectorAll("[role='dialog'], dialog, [class*='sheet'], [class*='Dialog'], [data-stid*='dialog']")]
          .filter(d => shown(d) && [...d.querySelectorAll("button, a")].some(b => /^(pay now|pay at property|pay later)$/i.test(label(b))))
          .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0];
        if (dlg && !clicked) {
          const opts = [...dlg.querySelectorAll("button, a")].filter(b => /^(pay now|pay at property|pay later)$/i.test(label(b))).map(b => {
            let c = b, amt = 0;
            for (let k = 0; k < 7 && c && c !== dlg; k++, c = c.parentElement) { const m = clean(c.innerText).match(new RegExp(R + AMT + "\\s*total", "i")); if (m) { amt = num(m[1]); break; } }
            return { b, amt };
          });
          const pick = opts.filter(o => o.amt).sort((x, y) => x.amt - y.amt)[0] || opts[0];
          if (pick) { clicked = true; ss.set("pcPay", label(pick.b)); pick.b.click(); return { wait: true }; }
        }
      }
      const HOTEL_LINK = 'a[href*="Hotel-Information"], a[href*="/ho"]';
      const isHotelLink = (a) => /Hotel-Information|\/ho\d+/i.test(a.getAttribute("href") || "");
      if (/Hotel-Search|search\.do|\/search/i.test(location.pathname)) {
        // 1) the hotel Google linked to is pinned at the top under "Continue with your booking" → its total is right there
        // list of hotels → open THIS hotel's own page.
        // The hotel Google linked to is pinned at the top under "Continue with your booking".
        const links = [...document.querySelectorAll(HOTEL_LINK)].filter(isHotelLink);
        let selId = ""; try { selId = new URL(location.href).searchParams.get("selected") || ""; } catch {}
        const exact = selId && links.find(a => new RegExp("\\.h" + selId + "\\.|[?&]selected=" + selId + "\\b|/ho" + selId + "/").test(a.getAttribute("href") || ""));
        if (exact) return { go: exact.href };
        const pin = [...document.querySelectorAll("h2,h3,div,span")].find(e => /^continue with your booking/i.test((e.innerText || "").trim()) && (e.innerText || "").length < 60);
        if (pin) {
          const after = links.find(a => pin.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
          if (after) return { go: after.href };
        }
        // match the hotel by the card's TITLE (not any text on the card) – strictly, so a different hotel is never picked
        let best = null, bs = -1;
        for (const a of links) {
          const card = a.closest("[data-stid*='lodging-card'], li, article, [data-stid='property-listing']") || a;
          const title = clean((card.querySelector("h3, h2, [data-stid='content-hotel-title']") || {}).innerText || a.getAttribute("aria-label") || "").split("\n")[0];
          if (!sameHotel(title)) continue;
          const s2 = overlap(hotelName, title) + overlap(title, hotelName) * 0.5;
          if (s2 > bs) { bs = s2; best = a; }
        }
        if (best) return { go: best.href };
        if (t > 10) return { error: "The site showed a list of hotels and this hotel wasn't in it", debug: txt.slice(0, 300) };
      } else {
        if (strict && hotelName) {
          const h1 = clean((document.querySelector("h1") || {}).innerText || "");
          if (h1 && !sameHotel(h1)) return { error: `${site} showed a different hotel (${h1.slice(0, 60)}) — use View deal` };
        }
        // the room list: Expedia marks it "section-room-list"; heading is "Choose your room" or, for apartments, "Choose your unit"
        const listEl = document.querySelector("[data-stid='section-room-list']");
        const start = listEl ? 0 : txt.search(/Choose your (?:room|unit|apartment|villa)s?|Select a room|Room options/i);
        if (start >= 0) {
          const base = listEl ? clean(listEl.innerText) : txt;
          const rest = base.slice(start + 15);
          const stop = rest.search(/\n(Similar properties|Explore similar|Compare similar|You may also like|Have a question\?|Popular properties|Properties nearby|Nearby properties|About this property|About the property|Policies|Important information|Guest reviews|Reviews\n|Explore the area|Accessibility)/i);
          const sec = base.slice(start, start + 15 + (stop >= 0 ? stop : rest.length));
          const found = [];
          for (const b of sec.split(/View all photos for /i).slice(1)) {
            const room = b.split("\n")[0].trim();
            const mm = [...b.matchAll(rx(R + AMT + "\\s*total\\b"))];
            if (!mm.length) continue;
            // "Extras": options with a price ("Breakfast for 2  + ₹6,426") are NOT included in the shown total
            // the card's choices: cancellation ("Non-refundable + ₹0", "Fully refundable before 19 Nov + ₹7,347")
            // and extras ("No extras + ₹0", "Breakfast buffet + ₹4,190") – the shown total is for the ticked (+ ₹0) ones
            // each choice: its name, (maybe "More details" lines), then "+ ₹amount" – skip the "More details" lines
            const opts = []; { const ls = b.split("\n").map(x => x.trim()).filter(Boolean);
              for (let li = 0; li < ls.length; li++) {
                const pm = ls[li].match(new RegExp("^(.*?)\\s*\\+\\s?" + R + AMT + "\\.?$", "i")); if (!pm) continue;
                let lab = pm[1].trim();
                for (let bk = li - 1; !lab && bk >= 0 && bk >= li - 3; bk--) if (!/^more details|^info|^details$|^ⓘ/i.test(ls[bk])) lab = ls[bk];
                if (lab && lab.length >= 3 && lab.length <= 80) opts.push({ label: lab, amt: num(pm[2]) });
              } }
            const plain = opts.reduce((t2, o) => t2.split(o.label).join(" "), b);          // card text without the choices
            const optMeal = (l) => /all[- ]inclusive/i.test(l) ? "All inclusive" : /full board/i.test(l) ? "Full board" : /half board|dinner/i.test(l) ? "Half board" : /breakfast/i.test(l) ? "Breakfast" : "";
            const isCxl = (l) => /refundable|cancel/i.test(l);
            const cxlOpts = opts.filter(o => isCxl(o.label)), mealOpts = opts.filter(o => !isCxl(o.label) && (o.amt === 0 || optMeal(o.label)));
            const pn = b.match(new RegExp("current price is\\s*" + R + AMT, "i")), tf = pn && num(pn[1]) > 0 ? num(mm[0][1]) / (num(pn[1]) * (nights || 1)) : 1;   // taxes on top of the per-night extras
            // the ticked (+ ₹0) choices are what the shown total includes – e.g. "Breakfast + Special deal" = breakfast included
            const defaults = opts.filter(o => o.amt === 0).map(o => o.label + (optMeal(o.label) ? "\n" + optMeal(o.label).toLowerCase() + " included" : "")).join("\n");
            const bkey = room + (found.some(f => f.room === room && !f.extra) ? " #" + (found.filter(f => f.room === room && !f.extra).length + 1) : "");
            const base = { total: num(mm[0][1]), room, key: bkey, text: defaults + "\n" + plain, free: /Fully refundable|Free cancellation/i.test(defaults || b) };
            found.push(base);
            // every other combination = its own option (its exact price is read at checkout, with those choices ticked)
            const cs = cxlOpts.length ? cxlOpts : [{ label: "", amt: 0 }], ms = mealOpts.length ? mealOpts : [{ label: "", amt: 0 }];
            for (const c2 of cs) for (const m2 of ms) {
              if (c2.amt === 0 && m2.amt === 0) continue;
              const picks = [c2, m2].filter(o => o.amt > 0).map(o => o.label);
              const txt2 = [c2.label, m2.amt > 0 ? m2.label + "\nbreakfast included".replace("breakfast", optMeal(m2.label).toLowerCase()) : (ms[0].label || ""), plain].join("\n");
              found.push({ ...base, key: bkey + " + " + picks.join(" + "), text: txt2, extra: picks[0], extras: picks, base,
                total: Math.round(base.total + (c2.amt + m2.amt) * (nights || 1) * tf), taxes: true, free: /fully refundable|free cancel/i.test(c2.label) || base.free });
            }
          }
          if (found.length && found[0].key) setList(found);
          if (!found.length) for (const mm of sec.matchAll(rx(R + AMT + "\\s*total\\b"))) found.push({ total: num(mm[1]), room: "" });
          const c = picking ? choose(found, x => x.room, x => x.text, x => x.key, x => x.total) : cheapest(found);
          if (picking && !c && t >= 12) return { error: pickKey ? `That room isn't shown on ${site} any more` : `${site} doesn't have this room type for these dates` };
          // the room list's "total" leaves out resort fees → open the checkout of the cheapest room to see the full total
          const pressedAgo = Date.now() - (+ss.get("pcPressed") || 0);
          if (c && !clicked && pressedAgo > 60000) {
            if (picking) {
              // the Reserve button inside THIS room's card (the card is the box that names the room)
              const cards = [...document.querySelectorAll("button, a, [role='button']")].filter(b => /^(reserve|select|book now)$/i.test(label(b)) && b.getClientRects().length > 0).map(b => {
                let e = b; while (e && !/View all photos for /i.test(e.innerText || "")) e = e.parentElement;
                const nm = e ? clean(e.innerText).split(/View all photos for /i)[1]?.split("\n")[0].trim() : "";
                return { b, nm, len: e ? (e.innerText || "").length : 1e9 };
              }).filter(x => x.nm === c.room);
              const same = found.filter(x => x.room === c.room && !x.extra), idx = same.indexOf(c.base || c);
              const hit = cards[idx] || cards[0];
              for (const ex of (hit ? c.extras || (c.extra ? [c.extra] : []) : [])) {
                // tick the chosen option (e.g. "Breakfast buffet", "Fully refundable before 19 Nov") inside this room's card
                let card = hit.b; while (card && !/View all photos for /i.test(card.innerText || "")) card = card.parentElement;
                const lab = card && [...card.querySelectorAll("label, [role='radio'], input[type='radio'], input[type='checkbox']")].find(e => clean(e.innerText || e.getAttribute("aria-label") || (e.id && card.querySelector(`label[for="${e.id}"]`)?.innerText) || "").trim().startsWith(ex));
                if (!lab) return { error: `${site}: couldn't choose "${ex}" for this room` };
                const inp = lab.matches("input") ? lab : lab.querySelector("input") || (lab.htmlFor && document.getElementById(lab.htmlFor)) || null;
                lab.scrollIntoView({ block: "center" }); await sleep(400);
                (inp || lab).click(); await sleep(1500);
                if (inp && !inp.checked) { lab.click(); await sleep(1500); }
                if (inp && !inp.checked) return { error: `${site}: couldn't tick "${ex}" for this room` };
              }
              if (hit && c.extras && c.extras.length) {
                let card = hit.b; while (card && !/View all photos for /i.test(card.innerText || "")) card = card.parentElement;
                const tm = card && clean(card.innerText).match(new RegExp(R + AMT + "\\s*total\\b", "i"));
                const now = tm ? num(tm[1]) : 0;
                if (now && Math.abs(now - (c.base ? c.base.total : now)) < 1 && c.total > now * 1.005) return { error: `${site}: the price didn't change after choosing "${c.extras.join(" + ")}" — use View deal` };
              }
              if (hit) { ss.set("pcRoom", c.room); ss.set("pcPressed", String(Date.now())); hit.b.scrollIntoView({ block: "center" }); await sleep(600); hit.b.click(); clicked = true; return { wait: true }; }
            } else if (await pressCheapest(document.body, /^(reserve|select|book now)$/i, c.room)) { clicked = true; return { wait: true }; }
          }
          // couldn't reach the checkout → room-list total (resort fee may be extra)
          if (c && ((pressedAgo < 60000 && t >= 12) || (pressedAgo >= 60000 && t >= 6))) return { total: cents(c.total), room: c.room, free: !!c.free, options: found.length, url: location.href };
        }
      }
    } else if (site === "Booking.com" && /searchresults/i.test(location.pathname)) {
      // Google sometimes opens Booking's list of hotels → open THIS hotel's page, keeping the dates and ₹
      const cards = [...document.querySelectorAll("[data-testid='property-card']")];
      const scored = cards.map(c => { const tt = (c.querySelector("[data-testid='title']") || c).textContent || ""; return { c, ok: sameHotel(tt), s: overlap(hotelName, tt) + overlap(tt, hotelName) * 0.5 }; }).filter(x => x.ok).sort((x, y) => y.s - x.s);
      let destHotel = false; try { destHotel = new URL(location.href).searchParams.get("dest_type") === "hotel"; } catch {}
      const best = scored[0] ? scored[0].c : (destHotel && !strict && cards[0]) || null;
      const a = best && best.querySelector("a[data-testid='title-link'], a[href*='/hotel/']");
      if (a) {
        const to = new URL(a.href, location.href), from = new URL(location.href).searchParams;
        for (const k of ["checkin", "checkout", "group_adults", "no_rooms", "group_children", "selected_currency"]) if (from.get(k)) to.searchParams.set(k, from.get(k));
        return { go: to.href };
      }
      if (t > 10 && cards.length) return { error: "Booking.com showed a list of hotels and this hotel wasn't in it", debug: txt.slice(0, 300) };
      await sleep(1000); continue;
    } else if (site === "Booking.com") {
      if (/we have no availability here between|no availability (?:here )?(?:for|between) |not available on our site for your dates/i.test(txt) && !/\+\s?(?:₹|Rs)/.test(txt))
        return { error: "Sold out on Booking.com for these dates", soldOut: true };
      const rows = [...document.querySelectorAll("#hprt-table tbody tr, table.hprt-table tbody tr")];
      const head = clean(document.querySelector("#hprt-table thead, table.hprt-table thead")?.innerText || "");
      const hn = head.match(/Price for (\d+) nights?/i);
      if (rows.length && hn && nights && +hn[1] !== nights) return { error: `Booking.com showed prices for ${hn[1]} nights, not ${nights}`, debug: head.slice(0, 200) };
      if (rows.length) {
        let room = ""; const found = [];
        for (const r of rows) {
          const rn = r.querySelector(".hprt-roomtype-link, .hprt-roomtype-icon-link, [data-room-name]");
          if (rn) room = clean(rn.getAttribute("data-room-name") || rn.innerText).trim().split("\n")[0];
          const rt = clean(r.innerText);
          const p = [...rt.matchAll(rx(R + AMT + "[^₹$€£]{0,60}?\\+\\s?" + R + AMT + "\\s*taxes and (?:charges|fees)"))][0];
          const inc = !p && [...rt.matchAll(rx(R + AMT + "[^₹$€£]{0,40}?includes taxes and (?:charges|fees)"))][0];
          const total = p ? num(p[1]) + num(p[2]) : inc ? num(inc[1]) : 0;
          if (!total) continue;
          const g = rt.match(/Guests?:\s*(\d+)\s*adult/i) || rt.match(/Sleeps:?\s*(\d+)/i) || rt.match(/Max(?:imum)? (?:people|persons|guests):?\s*(\d+)/i);
          // occupancy icons: a "couple" icon = 2 people, a "group" icon = 3+ → only count single-person icons as 1
          const icons = [...r.querySelectorAll(".bicon-occupancy, .c-occupancy-icons__adults i, [class*='occupancy'] svg")];
          const iconCap = icons.reduce((n, e) => n + (/couple/i.test(e.getAttribute("class") || "") ? 2 : /group|family/i.test(e.getAttribute("class") || "") ? 3 : 1), 0);
          const cap = g ? +g[1] : (iconCap || null);
          if (cap !== null && cap < adults) continue;          // e.g. a 1-adult price when we need 2
          const bk = { total, room, free: /Free cancellation/i.test(rt), row: r, text: rt, key: (r.getAttribute("data-block-id") || "row" + rows.indexOf(r)) };
          found.push(bk);
          // "Very good breakfast ₹ 1,395" (optional, per guest per night, paid at the hotel) → also a "with breakfast" option
          const ob = mealOf(rt) === "Room only" && rt.match(new RegExp("breakfast[^\\n₹$€£]{0,25}?" + R + AMT, "i"));
          if (ob && num(ob[1]) > 0) {
            const add = Math.round(num(ob[1]) * adults * (nights || 1));
            found.push({ ...bk, key: bk.key + "+bf", text: "Breakfast included\n" + rt, total: total + add, addOn: add, addOnNote: `breakfast ${ob[0].match(new RegExp(R + AMT))[0]} per guest per night, paid at the hotel` });
          }
        }
        if (found.length) setList(found);
        const c = picking ? choose(found, x => x.room, x => x.text, x => x.key, x => x.total) : cheapest(found);
        if (picking && !c && t >= 12) return { error: pickKey ? "That room isn't shown on Booking.com any more" : "Booking.com doesn't have this room type for these dates" };
        // go to Booking's checkout for the full price + cancellation terms: choose 1 of the cheapest room, press "I'll reserve"
        // (this only opens the "Your details" page – nothing is typed or booked)
        const pressedAgo = Date.now() - (+ss.get("pcPressed") || 0);
        if (c && !clicked && pressedAgo > 60000) {
          const sel = c.row.querySelector("select.hprt-nos-select, select[name^='nr_rooms_']");
          const one = sel && [...sel.options].find(o => o.value === "1");
          const btn = [...document.querySelectorAll("button")].find(b => /ll\W*reserve/i.test(b.innerText || "") && !/room for/i.test(b.innerText || ""));
          if (sel && one && btn) {
            for (const o of document.querySelectorAll("select.hprt-nos-select, select[name^='nr_rooms_']")) if (o !== sel && o.value !== "0") { o.value = "0"; o.dispatchEvent(new Event("change", { bubbles: true })); }
            sel.value = "1"; sel.dispatchEvent(new Event("change", { bubbles: true }));
            ss.set("pcPressed", String(Date.now())); clicked = true;
            await sleep(1000); btn.scrollIntoView({ block: "center" }); await sleep(400); btn.click();
            return { wait: true };
          }
        }
        if (c && !picking && (pressedAgo >= 60000 || t >= 12)) return { total: cents(c.total), room: c.room, free: c.free, options: found.length, url: location.href };
      }
      // the room Google linked to is often shown at the top: "₹ 55,151 … Includes taxes and charges" / "+₹ X taxes and charges"
      // checkout page (Google often links straight here): "Total ₹ 67,467.66 Includes taxes and charges"
      if (/^secure\./i.test(location.hostname) || /book\.html/i.test(location.pathname)) {
        const tm = [...txt.matchAll(rx("(?:^|\\n)\\s*Total\\s*\\n?\\s*" + R + AMT))].pop();
        if (tm && num(tm[1]) > 100) {
          // the room name sits just above its cancellation line – skip headings like "How much will it cost to cancel?"
          const rm = [...txt.matchAll(/\n\s*([^\n]{3,70})\n\s*(?:Partially refundable|Free cancellation|Non-refundable|Fully refundable)/gi)].map(x => x[1].trim()).find(x => !/\?|cancel|refund|polic|cost|pay|price|total/i.test(x));
          return { total: cents(num(tm[1])), room: rm || "", url: location.href, allRooms: true, free: /Free cancellation/i.test(txt) };
        }
      }
      // checkout page (older layout): "Price ₹ 36,029.60  +₹ 6,485.33 taxes and charges"
      const onCheckout = /^secure\./i.test(location.hostname) || /book\.html/i.test(location.pathname);
      const p = onCheckout && [...txt.matchAll(rx("\\bPrice\\s*" + R + AMT + "[^₹]{0,30}?\\+\\s?" + R + AMT + "\\s*taxes and (?:charges|fees)"))][0];   // only on the checkout page – never a room-list row
      if (p) { const rm = txt.match(/\n\s*1\s*x\s*([^\n]+)/i); return { total: cents(num(p[1]) + num(p[2])), room: rm ? rm[1].trim() : "", url: location.href, allRooms: true }; }
    } else if (site === "MakeMyTrip") {
      // "₹ 4,999  + ₹ 600 taxes & fees  Per Night"
      const per = [...txt.matchAll(rx(R + AMT + "\\s*\\+\\s*" + R + AMT + "\\s*taxes\\s*(?:&|and)\\s*fees"))].map(m => (num(m[1]) + num(m[2])) * (nights || 1));
      if (per.length) return { total: cents(Math.min(...per)), url: location.href };
    } else if (site === "Agoda") {
      // Agoda's full price (with taxes and its "extra charges") is only shown on the booking form:
      // "Price  Rs. 25,716.37"  (not "Price Before Taxes", not "Room price"). Room name is in the address (roomName=…).
      if (/\/book\//i.test(location.pathname) || /booking form/i.test(document.title)) {
        if (/someone['’]s just booked that room|can['’]t complete your booking|no longer available|sold out/i.test(txt)) {
          const tries = (+ss.get("pcSoldTries") || 0) + 1;
          if (tries > 3) return { error: "The room sold out on Agoda while checking — use View deal" };
          let rn = ""; try { rn = new URL(location.href).searchParams.get("roomName") || ""; } catch {}
          ss.set("pcSoldTries", String(tries)); ss.set("pcSkip", (ss.get("pcSkip") ? ss.get("pcSkip") + "|" : "") + (ss.get("pcPick") || rn));
          ss.set("pcPressed", "0"); history.back();
          return { wait: true };
        }
        // "Price  Rs. 25,716.37" – also "Price ⓘ(tooltip) Rs. …", "Total", "Pay at the hotel  Rs. …" (pay-at-hotel rates);
        // never "Price Before Taxes", "Original price", "Room price" or "You pay Rs.0 today"
        const m = [...txt.matchAll(rx("(?:^|\\n)\\s*(Total price|Total|Price|Pay at (?:the )?(?:hotel|property)|Total (?:due|payable))[^\\n₹$€£]{0,50}?\\s*(?:tooltip\\s*)?\\n?\\s*(?:tooltip\\s*\\n?\\s*)?" + R + AMT))]
          .filter(x => !/before|original|room price|discount|saved|coupon|today/i.test(x[0]) && num(x[2]) > 100).pop();
        let rm = ""; try { rm = new URL(location.href).searchParams.get("roomName") || ""; } catch {}
        if (picking && rm && ss.get("pcRoom") && overlap(ss.get("pcRoom"), rm) < 0.6) return { error: `Agoda opened a different room (${rm.slice(0, 60)})` };
        if (m) return { total: cents(num(m[2])), room: rm || ss.get("pcRoom"), url: location.href, allRooms: true, free: /free cancell?ation|cancel for free/i.test(txt) && !/non-refundable/i.test(txt) };
        // or: "Price Before Taxes  Rs. X" + "Taxes and fees  Rs. Y"
        const pb = txt.match(new RegExp("Price Before Taxes[^\\n₹$€£]{0,40}?\\s*" + R + AMT, "i")), tf = txt.match(new RegExp("Taxes and fees[^\\n₹$€£]{0,40}?\\s*" + R + AMT, "i"));
        if (pb && tf && num(pb[1]) > 100) return { total: cents(num(pb[1]) + num(tf[1])), room: rm || ss.get("pcRoom"), url: location.href, allRooms: true, free: /free cancell?ation|cancel for free/i.test(txt) && !/non-refundable/i.test(txt) };
        // the booking form is still loading → wait here (never scroll the booking form)
        if (t >= 25) { const k2 = txt.search(/Price Before Taxes|Room price|Price/i); return { error: "Agoda's booking form didn't show the price", debug: txt.slice(Math.max(0, k2), k2 + 400) }; }
        await sleep(1000); continue;
      } else if (/\/search/i.test(location.pathname)) {
        // search results (Google sometimes links here): the card for this hotel ("selectedproperty") → its own page
        const cards = [...document.querySelectorAll("[data-selenium='hotel-item']")];
        let sel = ""; try { sel = new URL(location.href).searchParams.get("selectedproperty") || ""; } catch {}
        const card = (sel && cards.find(c => c.getAttribute("data-hotelid") === sel))
          || cards.map(c => { const tt = (c.querySelector("[data-selenium='hotel-name']") || c).textContent || ""; return { c, ok: sameHotel(tt), s: overlap(hotelName, tt) + overlap(tt, hotelName) * 0.5 }; }).filter(x => x.ok).sort((a, b) => b.s - a.s)[0]?.c;
        const a = card && [...card.querySelectorAll("a[href]")].find(x => /propertyId=|\/hotel\//i.test(x.getAttribute("href") || ""));
        if (a) return { go: inrLink(new URL(a.getAttribute("href"), location.href).href) };
        if (t > 12 && cards.length) return { error: "Agoda showed a list of hotels and this hotel wasn't in it", debug: txt.slice(0, 300) };
        await sleep(1000); continue;
      } else if (!clicked && Date.now() - (+ss.get("pcPressed") || 0) > 20000) {
        // hotel page: each offer is [data-testid=room-offer] with "₹ 7,057 Per night before taxes & fees", "2 adults"
        // and a "Book" button whose label names the room ("Book Deluxe Palm View Double Room Offer 1").
        // show EVERY offer once: the room list draws itself as you move down it, and each room hides offers behind "Show N more offers"
        const grid0 = document.querySelector("#roomGridContent, [data-element-name='room-grid'], #roomSection");
        const anyOffer = document.querySelector("[data-testid='room-offer'], [data-element-name='mob-room-offer']") || [...document.querySelectorAll("button")].find(b => /^book$/i.test(label(b)));
        if (grid0 && anyOffer && !window.__pcExpanded) {
          window.__pcExpanded = true;
          grid0.scrollIntoView({ block: "start" }); await sleep(800);
          for (let s2 = 0; s2 < 60; s2++) {
            for (const mb of document.querySelectorAll("button[data-element-name='mob-room-group-show-more'], button[data-element-name*='show-more' i]"))
              if (mb.getClientRects().length && /more offers?|more deals?/i.test(mb.innerText || "")) { mb.click(); await sleep(250); }
            if (grid0.getBoundingClientRect().bottom < window.innerHeight) break;
            window.scrollBy(0, 500); await sleep(500);
          }
          grid0.scrollIntoView({ block: "start" }); await sleep(600);
        }
        // offer boxes; on other Agoda layouts (e.g. /accom/property) fall back to: each visible "Book" button + the box around it that shows "per night"
        let boxes = [...document.querySelectorAll("[data-testid='room-offer'], [data-element-name='mob-room-offer'], [data-selenium='ChildRoomsList-room']")].filter(o => o.getClientRects().length > 0);
        if (!boxes.length) boxes = [...document.querySelectorAll("button, a, [role='button']")].filter(b => b.getClientRects().length && (/^book( now)?$/i.test(label(b)) || /^Book /i.test(b.getAttribute("aria-label") || ""))).map(b => {
          let e = b; for (let k = 0; k < 9 && e; k++, e = e.parentElement) if (/per night|\/ ?night|per room/i.test(e.innerText || "") && new RegExp(R + AMT).test(clean(e.innerText))) return e;
          return null;
        }).filter((e, i, arr) => e && arr.indexOf(e) === i);
        const offers0 = boxes.map(o => {
          const ot = clean(o.innerText);
          const pm = ot.match(new RegExp(R + AMT + "\\s*(?:Per night|per room per night|/ night)", "i"));
          const b = o.querySelector("button[data-element-name*='book' i], [data-testid='book-button'] button, button[aria-label^='Book' i]")
            || [...o.querySelectorAll("button, a")].find(x => /^(book|book now|reserve)$/i.test(clean(x.innerText).trim()));
          const ad = ot.match(/(\d+)\s*adults?/i);
          return { o, b, ot, amt: pm ? num(pm[1]) : 0, adults: ad ? +ad[1] : null, room: ((b && b.getAttribute("aria-label")) || "").replace(/^Book\s+/i, "").replace(/\s+Offer\s+\d+$/i, "") };
        }).filter(x => x.b && x.amt && (x.adults === null || x.adults >= adults));
        // Agoda repeats every room for 1 / 2 / 3 adults → keep the offers for exactly our guests when it has them
        const offers = offers0.some(x => x.adults === adults) ? offers0.filter(x => x.adults === null || x.adults === adults) : offers0;
        const okey = (x) => (x.b.getAttribute("aria-label") || x.room) + " @" + x.amt;
        // room list: Agoda shows the price per night BEFORE taxes → marked "+ taxes" in Price Compare
        if (offers.length) setList(offers.map(x => ({ key: okey(x), room: x.room, text: x.ot, total: x.amt * (nights || 1), taxes: false })));
        const skip = (ss.get("pcSkip") || "").split("|").filter(Boolean);
        const keyOf = (x) => x.room + "@" + x.amt;
        const usable = offers.filter(x => !skip.includes(keyOf(x)));    // rooms that sold out while checking are skipped
        const one = picking ? choose(usable, x => x.room, x => x.ot, okey, x => x.amt) : null;
        const wanted = picking ? (one ? [one] : []) : usable;
        if (picking && offers.length && !wanted.length) return { error: skip.length ? "That room sold out on Agoda while checking" : (pickKey ? "That room isn't shown on Agoda any more" : "Agoda doesn't have this room type for these dates"), debug: "Agoda rooms: " + [...new Set(offers.map(x => x.room))].slice(0, 12).join(" | ") };
        if (wanted.length) {
          const pick = wanted.sort((x, y) => x.amt - y.amt)[0];
          ss.set("pcRoom", pick.room); ss.set("pcPick", keyOf(pick)); ss.set("pcPressed", String(Date.now())); clicked = true;
          pick.b.scrollIntoView({ block: "center" }); await sleep(700); pick.b.click();
          return { wait: true };
        }
        // room list not on screen yet → move down step by step until it appears (never jump to the bottom)
        const grid = document.querySelector("#roomGridContent, [data-element-name='room-grid'], #roomSection");
        if (grid && t % 3 === 0) grid.scrollIntoView({ block: "start" });
        else if (!grid) { const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 50; if (atBottom) window.scrollTo(0, 0); else window.scrollBy(0, 600); }
        await sleep(1000); continue;
      }
    } else {
      // any other website (the hotel's own site / its booking engine): read the stay total it shows
      const LABEL = "(?:grand total|total price|total for (?:your |the )?stay|total stay|total amount|total cost|total charges|amount payable|total payable|you pay|total)";
      const tot = [...txt.matchAll(rx(LABEL + "([^0-9\\n]{0,40}?)" + R + AMT))]
        .filter(m => !/sav|discount|off|deposit|tax(es)? only/i.test(m[0])).map(m => num(m[2])).filter(v => v > 100);
      const tot2 = [...txt.matchAll(rx(R + AMT + "[ \\t]*(?:total|in total|for " + (nights || 1) + " nights?)\\b"))].map(m => num(m[1])).filter(v => v > 100);
      // some booking engines write the currency after the number: "Total 11,655.00 INR"
      const RA = "\\s?(?:INR|₹|Rs\\.?|USD|US\\$|EUR|€|AED|GBP|£|SGD|AUD|THB)";
      const tot3 = [...txt.matchAll(rx(LABEL + "([^0-9\\n]{0,40}?)" + AMT + RA))]
        .filter(m => !/sav|discount|off|deposit/i.test(m[0])).map(m => num(m[2])).filter(v => v > 100);
      const all = [...tot, ...tot2, ...tot3];
      if (all.length && t >= 3) return { total: cents(Math.min(...all)), room: "", url: location.href };
      if (t >= 12) {
        const per = [...txt.matchAll(rx(R + AMT + "[ \\t]*(?:/|per|a|avg\\.?(?: per)?)\\s*night"))].map(m => num(m[1])).filter(v => v > 100);
        if (per.length) return { total: cents(Math.min(...per) * (nights || 1)), room: "", url: location.href };
      }
      // homepage instead of the booking page → press its "Check availability" button once (opens the booking engine, books nothing)
      if (t === 5 && !ss.get("pcPressed")) {
        const go = [...document.querySelectorAll("button, a, input[type=submit]")].find(e => e.offsetParent !== null && /^(check availability|check rates|view rates|see rates|search|find rooms|show rooms|book now)$/i.test(clean(e.innerText || e.value).trim()));
        if (go) { ss.set("pcPressed", String(Date.now())); go.click(); return { wait: true }; }
      }
      if (t >= 20) return { error: "The hotel's website didn't show a price for these dates", debug: (location.hostname + " · " + txt.slice(0, 300)) };
      await sleep(1000); continue;                               // no scrolling on hotel websites
    }

    const k = txt.search(/₹|Rs\.?\s?\d/);
    snippet = k >= 0 ? txt.slice(Math.max(0, k - 120), k + 380) : txt.slice(0, 400);
    // bring the rooms into view: the room list often loads only when you scroll to it or click the "Rooms" tab
    const el = [...document.querySelectorAll("#hprt-table, #availability_target, #Offers, [data-stid='section-room-list'], h2, h3")]
      .find(e => ["hprt-table", "availability_target", "Offers"].includes(e.id) || /choose your room|select a room|availability/i.test((e.textContent || "").slice(0, 60)));
    if (el) el.scrollIntoView({ block: "start" });
    else {
      if (t === 1 || t === 8) {                                    // the page's own "Rooms" tab (just moves down the page)
        const tab = [...document.querySelectorAll("a,button,[role='tab']")].find(e => /^rooms$/i.test((e.innerText || "").trim()));
        if (tab) tab.click();
      }
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 50;
      if (atBottom) window.scrollTo(0, 0); else window.scrollBy(0, 900);
    }
    await sleep(1000);
  }
  return { error: "Couldn't find the price on the page", debug: snippet.replace(/\s+/g, " ").slice(0, 500) };
  };
  const r = await core();
  if (r && roomList.length) { r.rooms = roomList; r.roomsUrl = roomsUrl; }
  if (r && chosenPick) r.picked = chosenPick;                    // which room + meal was taken to checkout
  if (r && r.total) {
    r.currency = pageCurrency();
    // cancellation wording as the site writes it (checkout pages show it for the chosen room)
    const t = (document.body?.innerText || "").replace(/[\u00a0\u202f\u2009]/g, " ");
    const pats = [/Free cancell?ation (?:before|until|till|by)[^\n]{0,60}/i, /Fully refundable (?:before|until)[^\n]{0,40}(?:\n[^\n]{0,40})?/i, /Cancel for free (?:before|until)[^\n]{0,50}/i,
      /If you cancel,? you['’]ll pay[^\n]{0,40}/i, /Partially refundable[^\n]{0,60}/i, /Non-?refundable/i, /Free cancell?ation/i];
    const bits = []; for (const p of pats) { const m = t.match(p); if (m && !bits.some(b => b.includes(m[0].trim()))) bits.push(m[0].replace(/\s+/g, " ").trim()); if (bits.length >= 2) break; }
    if (bits.length) r.cxlText = bits.join(" · ");
  }
  return r;
}

async function waitForSite(tabRef, ms, known) {
  // tabRef can be a function: Chrome may swap the tab for a new one while it redirects
  // Ready when the tab is on the booking site AND (finished loading OR has been there 6 s).
  // Some sites (Expedia) never report "finished" because adverts keep loading.
  // If Google's redirect page stays on screen, follow its link to the booking site ourselves.
  const end = Date.now() + ms;
  let onSiteSince = 0, onGoogleSince = 0, host = "", nudged = 0, googleStart = 0;
  while (Date.now() < end) {
    const tabId = typeof tabRef === "function" ? tabRef() : tabRef;
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) { await sleep(700); const again = typeof tabRef === "function" ? tabRef() : tabRef; if (again !== tabId) continue; throw new Error("Tab closed"); }
    try { host = new URL(t.url || t.pendingUrl || "").hostname; } catch { host = ""; }
    if (known && COMPARE.test(host)) return "compare";
    if (known ? ALLOWED.test(host) : onSite(host)) {
      if (!onSiteSince) onSiteSince = Date.now();
      if (t.status === "complete" || Date.now() - onSiteSince > 6000) return;
    } else {
      onSiteSince = 0;
      if (GOOGLE.test(host)) {
        if (!onGoogleSince) onGoogleSince = Date.now();
        if (!googleStart) googleStart = Date.now();
        if (known && Date.now() - googleStart > 25000) return "google";      // Google's ad link is stuck → search the site directly
        if (Date.now() - onGoogleSince > 5000 && nudged < 2) {
          nudged++; onGoogleSince = Date.now();
          try {
            const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => {
              const notG = (h) => !/(^|\.)google\.[a-z.]+$|gstatic|googleusercontent|youtube/i.test(h);
              const u0 = new URL(location.href);
              for (const k of ["url", "adurl", "q", "dest"]) { try { const w = new URL(u0.searchParams.get(k) || ""); if (/^https?:$/.test(w.protocol) && notG(w.hostname)) return w.href; } catch {} }
              for (const a of document.querySelectorAll("a[href]")) {
                try { const u = new URL(a.href); if (/^https?:$/.test(u.protocol) && notG(u.hostname)) return u.href; } catch {}
              }
              return "";
            } });
            if (res?.result) await chrome.tabs.update(tabId, { url: res.result });
          } catch { /* can't read Google's page */ }
        }
      } else onGoogleSince = 0;
    }
    await sleep(500);
  }
  if (onSite(host)) throw new Error(`The site took too long to open (${host})`);
  throw new Error(host ? `The link stopped at ${host} instead of the booking site` : "The link didn't open a booking site");
}

// Robot test on screen: bring the window to the front, notify, and wait until the person has completed it.
async function waitForPerson(tabId, windowId, job) {
  await chrome.windows.update(windowId, { focused: true, width: 1000, height: 820, state: "normal" }).catch(() => {});
  await chrome.tabs.update(tabId, { active: true }).catch(() => {});
  chrome.notifications?.create("pc-robot-" + Date.now(), {
    type: "basic", iconUrl: "icon128.png", priority: 2, requireInteraction: false,
    title: `${job.source} needs you`,
    message: `Please complete the "${job.source}" robot check in the price-checker window. The price will be read automatically after that.`,
  });
  const end = Date.now() + ROBOT_WAIT;
  while (Date.now() < end) {
    await sleep(2000);
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) return false;                                         // window/tab closed by the person
    if (t.status !== "complete") continue;
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: isRobotPage });
      if (res && res.result === false) { await sleep(2500); return true; }
    } catch { /* page is changing after the test */ }
  }
  return false;
}

// Hotel's own website (any booking engine): only READ the page text – rooms, rates, meals, cancellation – nothing is clicked or typed.
async function readHotelSite(job, windowId) {
  const tab = await chrome.tabs.create({ url: job.url, active: true, windowId });
  let cur = tab.id; const onSwap = (a, r) => { if (r === cur) cur = a; };
  chrome.tabs.onReplaced.addListener(onSwap);
  try {
    await waitForSite(() => cur, 45000, false);
    // no scrolling: wait (max ~30 s) until the page shows prices, then read the text once – in every frame (booking engines use iframes)
    let best = { text: "", url: "" };
    const PRICE = /(₹|INR|Rs\.?|€|EUR|\$|£)\s?[0-9]|[0-9][0-9.,]*\s?(€|EUR|INR)/;
    for (let t = 0; t < 20; t++) {
      await sleep(1500);
      const res = await chrome.scripting.executeScript({ target: { tabId: cur, allFrames: true }, func: () => {
        const t = (document.body?.innerText || "").replace(/[\u00a0\u202f\u2009]/g, " ").replace(/\n{2,}/g, "\n");
        return { text: t.slice(0, 40000), url: location.href, robot: /captcha|are you a robot|verify you are human|press (and|&) hold/i.test(t) && t.length < 6000 };
      } }).catch(() => []);
      const rs = res.map(x => x?.result).filter(Boolean);
      if (rs.some(x => x.robot)) { const ok = await waitForPerson(cur, windowId, job); if (!ok) return { error: "Robot test not completed on the hotel website" }; continue; }
      const priced = rs.filter(x => PRICE.test(x.text)).sort((a2, b2) => b2.text.length - a2.text.length)[0];
      if (priced) { best = priced; if (t >= 3) break; }          // a few seconds more so all rates have drawn
      else if (!best.text) best = rs.sort((a2, b2) => b2.text.length - a2.text.length)[0] || best;
    }
    if (!best.text) return { error: "The hotel website didn't load" };
    return { listOnly: true, siteText: best.text, roomsUrl: best.url || job.url };
  } finally {
    chrome.tabs.onReplaced.removeListener(onSwap);
    chrome.tabs.remove(cur).catch(() => {});
  }
}

async function checkOne(job, windowId) {
  if (SKIP[job.source]) return { error: SKIP[job.source] };
  if (!KNOWN.includes(job.source)) return job.listOnly ? readHotelSite(job, windowId) : { error: "Hotel websites aren't checked automatically" };
  const tab = await chrome.tabs.create({ url: job.url, active: true, windowId });
  let cur = tab.id;
  const opened = [];                                             // a site may open its booking form in a NEW tab
  const onNew = (t) => { if (t.openerTabId === cur) opened.push(t.id); };
  const onSwap = (added, removed) => { if (removed === cur) { cur = added; opened.push(added); } };   // Chrome swapped the tab (prerender)
  chrome.tabs.onCreated.addListener(onNew);
  chrome.tabs.onReplaced.addListener(onSwap);
  const other = !KNOWN.includes(job.source);                     // hotel's own site → also read inside booking-engine frames
  try {
    let robotDone = false; const fixedHosts = new Map(); const trail = []; let usedDirect = false; let rooms = null, roomsUrl = "", picked = null;
    for (let hop = 0; hop < 10; hop++) {
      const ws = await waitForSite(() => cur, 45000, !other);
      if (ws === "compare" || ws === "google") {
        const d = !usedDirect && directSearch(job);
        if (!d) return { error: ws === "google" ? "Google's link didn't open " + job.source + " — use View deal" : "Google's link opened a price-comparison site, not " + job.source + " — use View deal", trail };
        usedDirect = true; trail.push((ws === "google" ? "Google link stuck" : "comparison site") + " → " + job.source + " search");
        await chrome.tabs.update(cur, { url: d }); await sleep(1500); continue;
      }
      try { const u = new URL((await chrome.tabs.get(cur)).url), d = u.searchParams.get("checkin") || u.searchParams.get("chkin") || u.searchParams.get("startDate") || u.searchParams.get("checkIn"); trail.push(u.hostname + u.pathname.slice(0, 40) + (d ? " (" + d + ")" : "")); } catch {}
      { // switch to ₹ + the trip's dates once per site (not on the ad-redirect pages in between)
        const now = (await chrome.tabs.get(cur).catch(() => null))?.url || "";
        let host = ""; try { host = new URL(now).hostname; } catch {}
        if (host && ALLOWED.test(host) && (fixedHosts.get(host) || 0) < 2) {
          fixedHosts.set(host, (fixedHosts.get(host) || 0) + 1);
          const fixed = inrUrl(now, job);
          if (fixed !== now) { await chrome.tabs.update(cur, { url: fixed }); await sleep(1500); continue; }
        }
      }
      await sleep(2000);
      let r;
      try {
        const res = await chrome.scripting.executeScript({ target: { tabId: cur, allFrames: other }, func: readSitePrice, args: [job.source, job.nights, job.adults || 2, job.hotel || "", usedDirect || !!job.pickKey || !!job.pickWant, job.pickKey || "", job.pickWant || null] });
        const rs = res.map(x => x?.result).filter(Boolean);
        r = rs.find(x => x.total) || rs.find(x => x.robot || x.go || x.wait) || res[0]?.result;
      } catch (e) { await sleep(2000); continue; }             // the page changed while reading → try again
      if (r?.rooms?.length && !job.pickKey) { rooms = r.rooms; roomsUrl = r.roomsUrl; }
      // "room list only": the hotel's rooms are read → done (no checkout needed)
      if (job.listOnly && rooms) return { rooms, roomsUrl, listOnly: true, currency: "INR", trail };
      if (r?.picked) picked = r.picked;
      if (r?.go) { await chrome.tabs.update(cur, { url: r.go }); await sleep(1500); continue; }   // list page → this hotel's page
      if (r?.wait) {                                             // pressed "Book now" → wait for the booking form
        const before = (await chrome.tabs.get(cur).catch(() => null))?.url;
        for (let i = 0; i < 30; i++) {
          await sleep(500);
          if (opened.length) { cur = opened.pop(); break; }
          const now = (await chrome.tabs.get(cur).catch(() => null))?.url;
          if (now && now !== before) break;
        }
        await sleep(1500);
        continue;
      }
      if (r?.robot) {
        if (robotDone) return { error: "The robot test came back — use View deal", debug: r.debug };
        const ok = await waitForPerson(cur, windowId, job);
        if (!ok) return { error: "Robot test not completed — use View deal", debug: r.debug };
        robotDone = true;
        continue;                                                // test gone → read the price
      }
      const out = Object.assign(r || { error: "Couldn't read the page" }, { trail });
      delete out.rooms; delete out.roomsUrl;
      if (rooms) { out.rooms = rooms; out.roomsUrl = roomsUrl; }
      if (picked && !out.picked) out.picked = picked;
      // optional breakfast paid at the hotel isn't in the checkout total → add it (and say so)
      if (out.total && picked?.addOn) { out.addOn = picked.addOn; out.addOnNote = picked.addOnNote; out.total = Math.round((out.total + picked.addOn) * 100) / 100; }      // every room on the hotel page (for the "All rooms" table)
      if (!job.listOnly && (out.total || (out.error && !out.robot))) {
        out.shot = await snapPrice(cur, windowId, out.total - (out.addOn || 0));   // for the vision check
        // full cancellation policy: open the site's "cancellation policy" pop-up (Booking.com) or read the written policy
        const pol = await grabPolicy(cur);
        if (pol.text) out.policyText = pol.text;
        if (pol.opened) { await sleep(700); out.shot2 = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 60 }).catch(() => ""); await closePolicy(cur); }
        else out.shot2 = await snapCancel(cur, windowId);    // cancellation terms (may be lower on the page)
      }
      return out;
    }
    return { error: "The site kept redirecting" };
  } finally {
    chrome.tabs.onCreated.removeListener(onNew);
    chrome.tabs.onReplaced.removeListener(onSwap);
    chrome.tabs.remove([tab.id, ...opened, cur].filter((v, i, a) => a.indexOf(v) === i)).catch(() => {});
  }
}

// Screenshot of the price for the vision check: bring the total (or the price summary) into view, then capture the window
async function snapPrice(tabId, windowId, total) {
  try {
    await chrome.tabs.update(tabId, { active: true }).catch(() => {});
    await chrome.scripting.executeScript({ target: { tabId }, args: [total || 0], func: (tot) => {
      let el = null;
      if (tot) {
        const re = new RegExp(String(Math.floor(tot)).split("").join("[,.\\s]?"));
        el = [...document.querySelectorAll("body *")].filter(e => e.children.length <= 4 && e.getClientRects().length && re.test((e.innerText || "").replace(/\s/g, "")))
          .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0] || null;
      }
      if (!el) el = [...document.querySelectorAll("h2, h3, h4, div, span")].find(e => /^(total|price details|price summary|your price summary|choose your room|choose your unit)$/i.test((e.innerText || "").trim()));
      if (el) el.scrollIntoView({ block: "center" });
    } }).catch(() => {});
    await sleep(900);
    return await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 60 });
  } catch { return ""; }
}

// Read the complete cancellation policy. Only opens an information pop-up (and closes it again) – never books anything.
async function grabPolicy(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: async () => {
      const shown = (e) => e.getClientRects().length > 0;
      const clean = (t) => (t || "").replace(/[\u00a0\u202f\u2009]/g, " ").replace(/\n{2,}/g, "\n").trim();
      const dialogText = () => {
        const d = [...document.querySelectorAll("[role='dialog'], [aria-modal='true'], dialog")]
          .filter(x => shown(x) && /cancel/i.test(x.innerText || "")).sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0];
        return d ? clean(d.innerText).slice(0, 1500) : "";
      };
      // 1) a button that opens the policy (Booking.com: "More details on cancellation and prepayment policies")
      const btn = [...document.querySelectorAll("button, a, [role='button']")].find(e => shown(e) && (
        /cancell?ation (and prepayment )?polic|cancellation and prepayment|info on .*cancell?ation/i.test(e.getAttribute("aria-label") || "") ||
        /^(cancell?ation policy|see cancell?ation policy|view cancell?ation policy|policy details)$/i.test((e.innerText || "").trim())));
      if (btn && !dialogText()) { btn.click(); await new Promise(r => setTimeout(r, 1500)); const t = dialogText(); if (t) return { text: t, opened: true }; }
      // 2) the policy written on the page (Expedia / Hotels.com / Agoda): the "Cancellation policy" section
      const head = [...document.querySelectorAll("h1, h2, h3, h4, h5, div, span, p, strong")]
        .find(e => shown(e) && /^(cancell?ation polic(y|ies)|cancell?ation)$/i.test((e.innerText || "").trim()));
      if (head) {
        let box = head.parentElement;
        for (let k = 0; k < 4 && box && (box.innerText || "").length < 120; k++) box = box.parentElement;
        const t = clean(box?.innerText || "");
        if (t.length > 20) return { text: t.slice(0, 1500), opened: false };
      }
      return { text: "", opened: false };
    } });
    return res?.result || { text: "", opened: false };
  } catch { return { text: "", opened: false }; }
}
async function closePolicy(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, func: () => {
    const d = [...document.querySelectorAll("[role='dialog'], [aria-modal='true'], dialog")].find(x => x.getClientRects().length && /cancel/i.test(x.innerText || ""));
    const x = d && [...d.querySelectorAll("button")].find(b => /close|dismiss/i.test(b.getAttribute("aria-label") || "") || /^(close|×|✕)$/i.test((b.innerText || "").trim()));
    if (x) x.click(); else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  } }).catch(() => {});
}

async function snapCancel(tabId, windowId) {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => {
      const el = [...document.querySelectorAll("h2, h3, h4, div, span, p")]
        .filter(e => e.children.length <= 6 && e.getClientRects().length && /cancell?ation policy|how much will it cost to cancel|free cancell?ation|fully refundable|non-?refundable|cancel for free/i.test(e.innerText || ""))
        .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0];
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.top >= 0 && r.bottom <= window.innerHeight) return "same";   // already in the first screenshot
      el.scrollIntoView({ block: "center" }); return true;
    } });
    if (res?.result !== true) return "";
    await sleep(800);
    return await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 60 });
  } catch { return ""; }
}

async function logResult(job, result) {
  const { pcLog = [] } = await chrome.storage.local.get("pcLog");
  const { shot, shot2, siteText, rooms, ...rest } = result || {};
  if (rooms) rest.roomCount = rooms.length;
  if (siteText) rest.pageChars = siteText.length;
  pcLog.unshift({ at: Date.now(), site: job.source, url: job.url, ...rest, hadShot: !!shot, version: chrome.runtime.getManifest().version, dates: job.checkIn ? job.checkIn + " → " + job.checkOut : "" });
  await chrome.storage.local.set({ pcLog: pcLog.slice(0, 30) });
}

const pending = [];
let workers = 0, slot = 0;
const replyTabs = new Set();
const withTimeout = (p, ms) => Promise.race([p, sleep(ms).then(() => null)]);
const send = (tabId, msg) => chrome.tabs.sendMessage(tabId, msg).catch(() => {});

// Jobs go into one queue; up to WINDOWS checker windows work on it at the same time.
// New jobs (e.g. another "Check exact" while a check is running) start extra windows straight away.
async function run(jobs, replyTabId) {
  const k = (j) => `${j.hid}|${j.source}|${j.url}|${j.pickKey || ""}|${j.pickWant ? JSON.stringify(j.pickWant) : ""}|${j.listOnly ? "list" : ""}`;
  const queued = new Set(pending.map(x => k(x.j)));
  pending.push(...jobs.filter(j => !queued.has(k(j)) && queued.add(k(j))).map(j => ({ j, replyTabId })));
  for (let i = pending.length - 1; i >= 0; i--) {
    const { j, replyTabId: rt } = pending[i];
    if (SKIP[j.source]) { pending.splice(i, 1); send(rt, { type: "PC_CHECK_RESULT", job: j, result: { error: SKIP[j.source] } }); }
  }
  if (!pending.length) { if (!workers) send(replyTabId, { type: "PC_CHECK_DONE" }); return; }
  const add = Math.min(WINDOWS - workers, pending.length);
  for (let i = 0; i < add; i++) { workers++; worker(slot++ % WINDOWS, replyTabId); }
}

async function worker(pos, replyTabId) {
  let w = await withTimeout(chrome.windows.create({ url: "about:blank", focused: pos === 0, type: "normal", width: 1100, height: 800, left: 20 + pos * 320, top: 20 + pos * 30 }).catch(() => null), 5000);
  if (!w) { const t = await chrome.tabs.get(replyTabId).catch(() => null); if (t) w = { id: t.windowId, shared: true }; }
  try {
    if (!w) return;
    for (let item = pending.shift(); item; item = pending.shift()) {
      const { j, replyTabId: rt } = item; replyTabs.add(rt);
      send(rt, { type: "PC_CHECK_STARTED", job: j });
      if (!w.shared && !(await chrome.windows.get(w.id).catch(() => null))) {       // the checker window was closed → open a new one
        const nw = await withTimeout(chrome.windows.create({ url: "about:blank", focused: false, type: "normal", width: 1100, height: 800, left: 20 + pos * 320, top: 20 + pos * 30 }).catch(() => null), 5000);
        if (nw) w.id = nw.id;
      }
      let result;
      try { result = (await withTimeout(checkOne(j, w.id), 5 * 60 * 1000)) || { error: "The check took too long — use View deal" }; }
      catch (e) { result = { error: String(e.message || e) }; }
      logResult(j, result);
      send(rt, { type: "PC_CHECK_RESULT", job: j, result });
    }
  } finally {
    if (w && !w.shared) chrome.windows.remove(w.id).catch(() => {});
    workers--;
    if (!workers) {
      for (const rt of replyTabs) {
        send(rt, { type: "PC_CHECK_DONE" });
        chrome.tabs.get(rt).then(t => { chrome.windows.update(t.windowId, { focused: true }); chrome.tabs.update(rt, { active: true }); }).catch(() => {});
      }
      replyTabs.clear();
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PC_CHECK" && Array.isArray(msg.jobs) && sender.tab?.id) {
    const jobs = msg.jobs.filter(j => j && /^https:\/\//.test(j.url || "")).slice(0, 40);
    run(jobs, sender.tab.id);
    sendResponse({ ok: true, count: jobs.length });
  }
});

/**
 * itineraryPrompt.ts — fills the two Custom Holidays itinerary templates.
 * Sample = client hasn't booked yet. Detailed = client has booked.
 */
export type Template = "Sample" | "Detailed";
export type SourceKind = "word" | "text" | "plan" | "folder" | "booking";
export interface PromptForm {
  source: SourceKind; sourcePath: string; pastedText: string;
  title: string; subtitle: string; dates: string; travellers: string; hotelTier: string;
  route: string; travelBetween: string; dayPlan: string; hotels: string; notes: string; specialRequests: string;
  flights: string; baggage: string; hotelsBooked: string; transfers: string; experiences: string; freeDays: string; optional: string;
}
export const EMPTY_FORM: PromptForm = {
  source: "word", sourcePath: "", pastedText: "", title: "", subtitle: "", dates: "", travellers: "", hotelTier: "luxury",
  route: "", travelBetween: "", dayPlan: "", hotels: "", notes: "", specialRequests: "",
  flights: "", baggage: "", hotelsBooked: "", transfers: "", experiences: "", freeDays: "", optional: "",
};
export const HOTELS_NOTE = "The above hotels are only suggested options. Rates and availability will need to be checked for your travel dates.";

const bullets = (s: string) => s.split(/\n/).map(l => l.trim()).filter(Boolean).map(l => (l.startsWith("-") ? l : `- ${l}`)).join("\n");
const block = (head: string, body: string) => (body.trim() ? `${head}\n${body.trim()}\n` : "");

export function buildPrompt(tpl: Template, f: PromptForm): string {
  const out: string[] = [];
  out.push(`Make a ${tpl === "Sample" ? "SAMPLE" : "DETAILED"} itinerary PDF in our Custom Holidays format.\n`);
  const src =
    f.source === "word" ? `- Word document: [${f.sourcePath || "path to the Word document"}]` :
    f.source === "folder" ? `- Client trip folder: [${f.sourcePath || "path to the trip folder or .zip"}]` :
    f.source === "text" ? "- Itinerary text: pasted below" :
    f.source === "booking" ? "- Use the booking details below" : "- Plan it from the details below";
  out.push(`SOURCE:\n${src}\n`);
  out.push(block("TRIP", [
    f.title && `- Title: ${f.title}`, f.subtitle && `- Subtitle: ${f.subtitle}`, f.dates && `- Dates: ${f.dates}`,
    f.travellers && `- Travellers: ${f.travellers}`, tpl === "Sample" && f.hotelTier && `- hotelTier: ${f.hotelTier}`,
  ].filter(Boolean).join("\n")));
  out.push(block("ROUTE (city – nights – days)", [bullets(f.route), tpl === "Sample" && f.travelBetween && `- Travel between cities: ${f.travelBetween}`].filter(Boolean).join("\n")));
  if (tpl === "Sample") {
    out.push(`DAY PLAN\n${f.dayPlan.trim() || (f.source === "plan" ? "Plan the days from the route above." : f.source === "text" ? "Use the day plan in my text." : "Use the document's day plan.")}\nEach day: 3–4 luxurious bullet points, keeping every place, distance, time and condition from my text.\n`);
    out.push(block("HOTELS", bullets(f.hotels)));
    out.push(`NOTES FOR THE CLIENT (printed under the right day or city, wording kept exactly)\n${[bullets(f.notes), `- Hotels: "${HOTELS_NOTE}"`].filter(Boolean).join("\n")}\n`);
    out.push(block("SPECIAL REQUESTS", f.specialRequests));
    out.push("Make the default sample versions and reply with a short summary only.");
  } else {
    out.push(block("FLIGHTS", [bullets(f.flights), f.baggage && `- Baggage: ${f.baggage}`].filter(Boolean).join("\n")));
    out.push(block("HOTELS BOOKED", bullets(f.hotelsBooked)));
    out.push(block("TRAVEL BETWEEN CITIES", bullets(f.transfers)));
    out.push(block("EXPERIENCES BOOKED (day · time · what)", [bullets(f.experiences), f.freeDays && `- Free days: ${f.freeDays} (add suggestions, marked "not booked")`].filter(Boolean).join("\n")));
    out.push(block("OPTIONAL ACTIVITIES (they get their own page)", bullets(f.optional)));
    out.push(block("NOTES FOR THE CLIENT (wording kept exactly)", bullets(f.notes)));
    out.push(block("SPECIAL REQUESTS", f.specialRequests));
    out.push("Make the default detailed versions and reply with a short summary only.");
  }
  if (f.source === "text" && f.pastedText.trim()) out.push(`\nITINERARY TEXT\n${f.pastedText.trim()}`);
  return out.filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

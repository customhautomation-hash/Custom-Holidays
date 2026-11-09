/** Puts every contact into one lead channel, from its source / met_where fields. */
export const CHANNELS = ["Meta ads", "Website", "WhatsApp", "Referral", "Google", "CH Connect", "Other"] as const;
export type Channel = typeof CHANNELS[number];
export function channelOf(source?: string | null, metWhere?: string | null): Channel {
  const s = `${source || ""} ${metWhere || ""}`.toLowerCase();
  if (/meta|facebook|instagram|\bfb\b|\big\b|lead ?form/.test(s)) return "Meta ads";
  if (/whats ?app|\bwa\b/.test(s)) return "WhatsApp";
  if (/refer|friend|past client|word of mouth/.test(s)) return "Referral";
  if (/google|search|maps|adwords/.test(s)) return "Google";
  if (/ch ?connect|business card|card|itb|iltm|wtm|exhibition|event|fair|expo/.test(s)) return "CH Connect";
  if (/web|site|form|chat|enquiry|inquiry|landing/.test(s)) return "Website";
  return "Other";
}
export const NOTE: Record<Channel, string> = {
  "Meta ads": "Instagram & Facebook", Website: "Enquiry form & chat", WhatsApp: "Direct messages", Referral: "From past clients",
  Google: "Search & Maps", "CH Connect": "Events and business cards", Other: "No source recorded",
};
/** Monday-start week keys for the last n weeks, oldest first. */
export function lastWeeks(n: number): Date[] {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: n }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() - (n - 1 - i) * 7); return x; });
}
export function weeklyCounts(dates: string[], n = 8): { values: number[]; labels: string[] } {
  const weeks = lastWeeks(n);
  const values = weeks.map((w, i) => { const end = i + 1 < n ? weeks[i + 1] : new Date(8.64e15); return dates.filter(s => { const t = new Date(s); return t >= w && t < end; }).length; });
  const labels = weeks.map((w, i) => w.toLocaleDateString("en-GB", i === 0 || w.getDate() <= 7 ? { day: "numeric", month: "short" } : { day: "numeric" }));
  return { values, labels };
}

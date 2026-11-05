import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Copy, RefreshCw, Send, ChevronDown,
  Plane, MessageSquare, Instagram, Clock, Check,
  FileText, Mail, Bell, Star, MapPin, Hotel,
  Compass, HelpCircle, Megaphone, Film, Facebook,
  AlertCircle, Database, PenLine,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

// ── API ──────────────────────────────────────────────────────────────────────
const API = "https://fintech-dashboard-61vh.onrender.com/api";

// ── Mock Custom Holidays Data ─────────────────────────────────────────────────────
const MOCK_CLIENTS = [
  { id: "c1", name: "Rahul Sharma",   email: "rahul@email.com",   phone: "+91 98765 43210" },
  { id: "c2", name: "Priya Mehta",    email: "priya@email.com",   phone: "+91 87654 32109" },
  { id: "c3", name: "Amit Kapoor",    email: "amit@email.com",    phone: "+91 76543 21098" },
  { id: "c4", name: "Sneha Reddy",    email: "sneha@email.com",   phone: "+91 65432 10987" },
  { id: "c5", name: "Vikram Patel",   email: "vikram@email.com",  phone: "+91 54321 09876" },
];

const MOCK_TRIPS = [
  { id: "t1", name: "Dubai Luxury Escape",    destination: "Dubai, UAE",       dates: "12–17 Oct 2026", hotel: "Atlantis The Palm",      activities: ["Desert Safari", "Burj Khalifa", "Dubai Mall"],        duration: "5 nights" },
  { id: "t2", name: "Maldives Honeymoon",     destination: "Maldives",         dates: "20–27 Nov 2026", hotel: "Soneva Jani",            activities: ["Snorkeling", "Sunset Cruise", "Spa"],                  duration: "7 nights" },
  { id: "t3", name: "Rajasthan Heritage",     destination: "Rajasthan, India", dates: "3–10 Dec 2026",  hotel: "Umaid Bhawan Palace",    activities: ["Camel Safari", "Fort Tour", "Cultural Evening"],       duration: "7 nights" },
  { id: "t4", name: "Bali Wellness Retreat",  destination: "Bali, Indonesia",  dates: "5–12 Jan 2027",  hotel: "COMO Uma Ubud",          activities: ["Yoga", "Temple Tour", "Rice Terrace Walk"],           duration: "7 nights" },
  { id: "t5", name: "Switzerland Alps Tour",  destination: "Switzerland",      dates: "15–22 Feb 2027", hotel: "Palace Hotel Luzern",    activities: ["Jungfraujoch", "Skiing", "Rhine Falls"],              duration: "7 nights" },
];

const MOCK_HOTELS = [
  { id: "h1", name: "Atlantis The Palm",    location: "Dubai",       stars: 5, features: ["Private Beach", "Aquaventure Waterpark", "Multiple Restaurants", "Spa"] },
  { id: "h2", name: "Soneva Jani",          location: "Maldives",    stars: 5, features: ["Water Villas", "Private Pool", "Observatory", "Overwater Cinema"] },
  { id: "h3", name: "Umaid Bhawan Palace",  location: "Jodhpur",     stars: 5, features: ["Heritage Architecture", "Spa", "Museum", "Pool"] },
  { id: "h4", name: "COMO Uma Ubud",        location: "Bali",        stars: 5, features: ["Jungle Views", "Yoga Studio", "Infinity Pool", "Restaurant"] },
  { id: "h5", name: "Palace Hotel Luzern",  location: "Switzerland", stars: 5, features: ["Lake Views", "Historic Building", "Fine Dining", "Spa"] },
];

const RECENT_CONTENT = [
  { title: "Dubai Proposal",         subtitle: "Rahul Sharma",  time: "2 hours ago",  icon: Plane },
  { title: "Maldives Instagram Post", subtitle: "Marketing",    time: "Yesterday",    icon: Instagram },
  { title: "Payment Follow-up",      subtitle: "Priya Mehta",  time: "Yesterday",    icon: MessageSquare },
  { title: "Hotel Description",      subtitle: "Bali Package",  time: "2 days ago",   icon: Hotel },
];

// ── Content Types ────────────────────────────────────────────────────────────
type CategoryId = "sales" | "communication" | "marketing" | "travel";

interface ContentType {
  id: string;
  label: string;
  icon: React.ElementType;
  category: CategoryId;
  priority?: boolean;
}

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "sales",         label: "Sales" },
  { id: "communication", label: "Customer Communication" },
  { id: "marketing",     label: "Marketing" },
  { id: "travel",        label: "Travel Content" },
];

const CONTENT_TYPES: ContentType[] = [
  // Sales
  { id: "trip_proposal",     label: "Trip Proposal",      icon: Plane,        category: "sales",         priority: true },
  { id: "package_desc",      label: "Package Description", icon: FileText,     category: "sales" },
  { id: "itinerary_summary", label: "Itinerary Summary",  icon: MapPin,       category: "sales" },
  { id: "quotation_message", label: "Quotation Message",  icon: FileText,     category: "sales" },
  // Communication
  { id: "whatsapp_message",  label: "WhatsApp Message",   icon: MessageSquare, category: "communication", priority: true },
  { id: "customer_email",    label: "Customer Email",     icon: Mail,         category: "communication" },
  { id: "followup_message",  label: "Follow-up Message",  icon: RefreshCw,    category: "communication" },
  { id: "payment_reminder",  label: "Payment Reminder",   icon: Bell,         category: "communication" },
  { id: "review_request",    label: "Review Request",     icon: Star,         category: "communication" },
  // Marketing
  { id: "instagram_post",    label: "Instagram Post",     icon: Instagram,    category: "marketing",     priority: true },
  { id: "reel_caption",      label: "Reel Caption",       icon: Film,         category: "marketing" },
  { id: "facebook_post",     label: "Facebook Post",      icon: Facebook,     category: "marketing" },
  { id: "travel_advertisement", label: "Travel Advertisement", icon: Megaphone, category: "marketing" },
  { id: "promo_campaign",    label: "Promotional Campaign", icon: Megaphone,  category: "marketing" },
  // Travel Content
  { id: "destination_guide", label: "Destination Guide",  icon: Compass,      category: "travel" },
  { id: "hotel_description", label: "Hotel Description",  icon: Hotel,        category: "travel" },
  { id: "activity_desc",     label: "Activity Description", icon: MapPin,     category: "travel" },
  { id: "travel_tips",       label: "Travel Tips",        icon: Compass,      category: "travel" },
  { id: "travel_faq",        label: "Travel FAQ",         icon: HelpCircle,   category: "travel" },
];

const QUICK_CREATE = [
  { id: "trip_proposal",    label: "Trip Proposal",    sub: "Create a personalized proposal from a trip",   icon: Plane },
  { id: "whatsapp_message", label: "WhatsApp Message", sub: "Create a customer-ready message",              icon: MessageSquare },
  { id: "instagram_post",   label: "Instagram Post",   sub: "Create promotional social content",            icon: Instagram },
];

// ── Dynamic Form ─────────────────────────────────────────────────────────────
function Select({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground ">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-border bg-muted/30 px-3 py-2.5 pr-8 text-sm text-card-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder, readOnly }: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; readOnly?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        {label}
        {readOnly && <span className="text-[11px] font-normal text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">Auto-filled</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${
          readOnly ? "bg-muted/60 text-muted-foreground cursor-default" : "bg-muted/30 text-card-foreground"
        }`}
      />
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground ">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-card-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
      />
    </div>
  );
}

function LengthSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = ["Short", "Medium", "Detailed"];
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground ">Length</label>
      <div className="flex gap-2">
        {opts.map(o => (
          <button key={o} onClick={() => onChange(o)}
            className={`flex-1 py-2 text-xs rounded-xl border transition-all ${
              value === o
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/30 text-muted-foreground border-border hover:border-primary/50"
            }`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Dynamic form per content type ─────────────────────────────────────────────
function DynamicForm({ typeId, fields, setFields, useBusinessData }: {
  typeId: string;
  fields: Record<string, string>;
  setFields: (f: Record<string, string>) => void;
  useBusinessData: boolean;
}) {
  const set = (key: string, val: string) => setFields({ ...fields, [key]: val });

  const selectedTrip = MOCK_TRIPS.find(t => t.id === fields.trip);
  const selectedHotel = MOCK_HOTELS.find(h => h.id === fields.hotel);

  const tripOptions = MOCK_TRIPS.map(t => ({ value: t.id, label: t.name }));
  const clientOptions = MOCK_CLIENTS.map(c => ({ value: c.id, label: c.name }));
  const hotelOptions = MOCK_HOTELS.map(h => ({ value: h.id, label: h.name }));

  const toneOptions = [
    { value: "professional", label: "Professional" },
    { value: "friendly", label: "Friendly & Warm" },
    { value: "luxury", label: "Luxury & Aspirational" },
    { value: "casual", label: "Casual" },
    { value: "urgent", label: "Urgent" },
  ];

  switch (typeId) {
    case "trip_proposal":
      return (
        <div className="space-y-4">
          <Select label="Trip / Package" value={fields.trip || ""} onChange={v => set("trip", v)} options={tripOptions} placeholder="Select trip..." />
          <Select label="Client" value={fields.client || ""} onChange={v => set("client", v)} options={clientOptions} placeholder="Select client..." />
          {selectedTrip && useBusinessData && (
            <>
              <TextInput label="Destination" value={selectedTrip.destination} readOnly />
              <TextInput label="Travel Dates" value={selectedTrip.dates} readOnly />
              <TextInput label="Hotel" value={selectedTrip.hotel} readOnly />
            </>
          )}
          <Select label="Tone" value={fields.tone || "professional"} onChange={v => set("tone", v)} options={toneOptions} />
          <TextArea label="Additional Instructions" value={fields.instructions || ""} onChange={v => set("instructions", v)} placeholder="Any special requests or highlights to include..." />
        </div>
      );

    case "whatsapp_message":
      return (
        <div className="space-y-4">
          <Select label="Client" value={fields.client || ""} onChange={v => set("client", v)} options={clientOptions} placeholder="Select client..." />
          <Select label="Trip" value={fields.trip || ""} onChange={v => set("trip", v)} options={tripOptions} placeholder="Select trip..." />
          <Select label="Purpose" value={fields.purpose || ""} onChange={v => set("purpose", v)}
            options={[
              { value: "followup", label: "Follow-up" },
              { value: "booking_confirmation", label: "Booking Confirmation" },
              { value: "payment_reminder", label: "Payment Reminder" },
              { value: "itinerary_share", label: "Share Itinerary" },
              { value: "check_in", label: "Check-in Reminder" },
            ]} placeholder="Select purpose..." />
          <TextArea label="Context" value={fields.context || ""} onChange={v => set("context", v)} placeholder="e.g. Client requested a revised quote yesterday..." />
          <Select label="Tone" value={fields.tone || "friendly"} onChange={v => set("tone", v)} options={toneOptions} />
          <Select label="Message Length" value={fields.length || "short"} onChange={v => set("length", v)}
            options={[{ value: "short", label: "Short" }, { value: "medium", label: "Medium" }]} />
        </div>
      );

    case "instagram_post":
      return (
        <div className="space-y-4">
          <Select label="Trip / Package" value={fields.trip || ""} onChange={v => set("trip", v)} options={tripOptions} placeholder="Select trip..." />
          {selectedTrip && useBusinessData && (
            <TextInput label="Destination" value={selectedTrip.destination} readOnly />
          )}
          <Select label="Content Goal" value={fields.goal || ""} onChange={v => set("goal", v)}
            options={[
              { value: "inspire", label: "Inspire" },
              { value: "promote", label: "Promote" },
              { value: "inform", label: "Inform" },
            ]} placeholder="Select goal..." />
          <Select label="Target Audience" value={fields.audience || ""} onChange={v => set("audience", v)}
            options={[
              { value: "couples", label: "Couples" },
              { value: "families", label: "Families" },
              { value: "solo", label: "Solo Travelers" },
              { value: "luxury", label: "Luxury Travelers" },
              { value: "adventure", label: "Adventure Seekers" },
            ]} placeholder="Select audience..." />
          <Select label="Tone" value={fields.tone || "luxury"} onChange={v => set("tone", v)} options={toneOptions} />
          <TextArea label="Additional Instructions" value={fields.instructions || ""} onChange={v => set("instructions", v)} placeholder="Specific angles, hashtags, or emojis to include..." />
        </div>
      );

    case "hotel_description":
      return (
        <div className="space-y-4">
          <Select label="Hotel" value={fields.hotel || ""} onChange={v => set("hotel", v)} options={hotelOptions} placeholder="Select hotel..." />
          {selectedHotel && useBusinessData && (
            <TextInput label="Location" value={selectedHotel.location} readOnly />
          )}
          <Select label="Purpose" value={fields.purpose || ""} onChange={v => set("purpose", v)}
            options={[
              { value: "itinerary", label: "Itinerary Description" },
              { value: "proposal", label: "Client Proposal" },
              { value: "website", label: "Website Copy" },
              { value: "social", label: "Social Media" },
            ]} placeholder="Select purpose..." />
          <LengthSelector value={fields.length || "Medium"} onChange={v => set("length", v)} />
          {selectedHotel && useBusinessData && (
            <TextInput label="Key Features" value={selectedHotel.features.join(", ")} readOnly />
          )}
        </div>
      );

    case "customer_email":
    case "followup_message":
      return (
        <div className="space-y-4">
          <Select label="Client" value={fields.client || ""} onChange={v => set("client", v)} options={clientOptions} placeholder="Select client..." />
          <Select label="Trip" value={fields.trip || ""} onChange={v => set("trip", v)} options={tripOptions} placeholder="Select trip..." />
          <TextInput label="Subject" value={fields.subject || ""} onChange={v => set("subject", v)} placeholder="Email subject..." />
          <Select label="Purpose" value={fields.purpose || ""} onChange={v => set("purpose", v)}
            options={[
              { value: "followup", label: "Follow-up" },
              { value: "confirmation", label: "Booking Confirmation" },
              { value: "update", label: "Trip Update" },
              { value: "welcome", label: "Welcome Email" },
            ]} placeholder="Select purpose..." />
          <Select label="Tone" value={fields.tone || "professional"} onChange={v => set("tone", v)} options={toneOptions} />
          <TextArea label="Additional Context" value={fields.context || ""} onChange={v => set("context", v)} placeholder="Any specific details to include..." />
        </div>
      );

    case "payment_reminder":
      return (
        <div className="space-y-4">
          <Select label="Client" value={fields.client || ""} onChange={v => set("client", v)} options={clientOptions} placeholder="Select client..." />
          <Select label="Trip" value={fields.trip || ""} onChange={v => set("trip", v)} options={tripOptions} placeholder="Select trip..." />
          <TextInput label="Amount Due" value={fields.amount || ""} onChange={v => set("amount", v)} placeholder="e.g. ₹45,000" />
          <TextInput label="Due Date" value={fields.dueDate || ""} onChange={v => set("dueDate", v)} placeholder="e.g. 30 Sep 2026" />
          <Select label="Tone" value={fields.tone || "friendly"} onChange={v => set("tone", v)} options={toneOptions} />
        </div>
      );

    case "destination_guide":
    case "travel_tips":
    case "travel_faq":
      return (
        <div className="space-y-4">
          <Select label="Destination" value={fields.destination || ""} onChange={v => set("destination", v)}
            options={MOCK_TRIPS.map(t => ({ value: t.destination, label: t.destination }))}
            placeholder="Select destination..." />
          <LengthSelector value={fields.length || "Medium"} onChange={v => set("length", v)} />
          <Select label="Target Audience" value={fields.audience || ""} onChange={v => set("audience", v)}
            options={[
              { value: "general", label: "General Travelers" },
              { value: "luxury", label: "Luxury Travelers" },
              { value: "families", label: "Families" },
              { value: "couples", label: "Couples" },
            ]} placeholder="Select audience..." />
          <TextArea label="Focus Areas" value={fields.instructions || ""} onChange={v => set("instructions", v)} placeholder="e.g. Focus on food, culture, hidden gems..." />
        </div>
      );

    default:
      return (
        <div className="space-y-4">
          <Select label="Trip / Package" value={fields.trip || ""} onChange={v => set("trip", v)} options={tripOptions} placeholder="Select trip..." />
          <Select label="Tone" value={fields.tone || "professional"} onChange={v => set("tone", v)} options={toneOptions} />
          <LengthSelector value={fields.length || "Medium"} onChange={v => set("length", v)} />
          <TextArea label="Additional Instructions" value={fields.instructions || ""} onChange={v => set("instructions", v)} placeholder="Any specific requirements..." />
        </div>
      );
  }
}

// ── Build prompt from fields ──────────────────────────────────────────────────
function buildPrompt(typeId: string, fields: Record<string, string>, useBusinessData: boolean): string {
  const ct = CONTENT_TYPES.find(t => t.id === typeId);
  const trip = MOCK_TRIPS.find(t => t.id === fields.trip);
  const client = MOCK_CLIENTS.find(c => c.id === fields.client);
  const hotel = MOCK_HOTELS.find(h => h.id === fields.hotel);
  const tone = fields.tone || "professional";
  const length = fields.length || "Medium";

  const businessContext = useBusinessData && trip ? `
Trip: ${trip.name}
Destination: ${trip.destination}
Dates: ${trip.dates}
Duration: ${trip.duration}
Hotel: ${trip.hotel}
Activities: ${trip.activities.join(", ")}
` : "";

  const clientContext = useBusinessData && client ? `
Client Name: ${client.name}
Client Email: ${client.email}
` : "";

  switch (typeId) {
    case "trip_proposal":
      return `Write a ${tone} luxury travel trip proposal for the following:
${clientContext}${businessContext}
${fields.instructions ? `Special instructions: ${fields.instructions}` : ""}

Format it as a formal proposal with sections: Introduction, Trip Highlights, Itinerary Overview, Inclusions, and a warm closing.
Make it personal, aspirational and persuasive. Use the client's name throughout.`;

    case "whatsapp_message":
      return `Write a ${tone} WhatsApp message for the following:
${clientContext}${businessContext}
Purpose: ${fields.purpose || "follow-up"}
Context: ${fields.context || ""}
Length: ${fields.length || "short"}

Keep it conversational, warm and appropriate for WhatsApp. No formal email formatting.`;

    case "instagram_post":
      return `Write an Instagram post for the following travel package:
${businessContext}
Content Goal: ${fields.goal || "inspire"}
Target Audience: ${fields.audience || "luxury travelers"}
Tone: ${fields.tone || "luxury"}
${fields.instructions ? `Additional instructions: ${fields.instructions}` : ""}

Include emojis, a strong opening line, evocative description, and relevant hashtags. Make it scroll-stopping.`;

    case "hotel_description":
      return `Write a ${tone} ${length.toLowerCase()} description for the following hotel:
Hotel: ${hotel?.name || ""}
Location: ${hotel?.location || ""}
Key Features: ${hotel?.features.join(", ") || ""}
Purpose: ${fields.purpose || "itinerary description"}

Make it evocative, luxurious and enticing for travelers.`;

    case "payment_reminder":
      return `Write a ${tone} payment reminder message with these details:
${clientContext}${businessContext}
Amount Due: ${fields.amount || ""}
Due Date: ${fields.dueDate || ""}

Keep it polite but clear. Include payment urgency without being aggressive.`;

    case "destination_guide":
      return `Write a comprehensive ${length.toLowerCase()} destination guide for:
Destination: ${fields.destination || ""}
Target Audience: ${fields.audience || "general travelers"}
Focus: ${fields.instructions || "general overview"}

Include sections on: Overview, Best Time to Visit, Must-See Attractions, Food & Culture, and Travel Tips.`;

    default:
      return `Write ${tone} ${ct?.label || "content"} for a travel agency.
${businessContext}${clientContext}
Length: ${length}
${fields.instructions ? `Instructions: ${fields.instructions}` : ""}

Make it professional, engaging and ready to use.`;
  }
}

// ── Custom Holidays Data Preview ───────────────────────────────────────────────────
function DataPreview({ fields }: { fields: Record<string, string> }) {
  const trip = MOCK_TRIPS.find(t => t.id === fields.trip);
  const client = MOCK_CLIENTS.find(c => c.id === fields.client);
  const hotel = MOCK_HOTELS.find(h => h.id === fields.hotel);

  const rows = [
    client && ["Client", client.name],
    trip && ["Trip", trip.name],
    trip && ["Destination", trip.destination],
    trip && ["Dates", trip.dates],
    trip && ["Hotel", trip.hotel],
    trip && ["Activities", trip.activities.slice(0, 2).join(", ")],
    hotel && !trip && ["Hotel", hotel.name],
    hotel && !trip && ["Location", hotel.location],
  ].filter(Boolean) as [string, string][];

  if (rows.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
      <p className="text-[11px] font-semibold text-primary">Custom Holidays Data</p>
      <div className="divide-y divide-border/50">
        {rows.map(([key, val]) => (
          <div key={key} className="flex items-start gap-2 py-1.5">
            <span className="text-[11px] text-muted-foreground w-20 shrink-0">{key}</span>
            <span className="text-[11px] font-medium text-card-foreground">{val}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Content() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("sales");
  const [selectedType, setSelectedType] = useState<string>("trip_proposal");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [useBusinessData, setUseBusinessData] = useState(true);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedCT = CONTENT_TYPES.find(t => t.id === selectedType);

  const selectType = (id: string) => {
    const ct = CONTENT_TYPES.find(t => t.id === id);
    if (ct) setActiveCategory(ct.category);
    setSelectedType(id);
    setFields({});
    setGenerated(null);
    setError(null);
  };

  const generate = async () => {
    setLoading(true);
    setGenerated(null);
    setError(null);
    try {
      const prompt = buildPrompt(selectedType, fields, useBusinessData);
      const ct = CONTENT_TYPES.find(t => t.id === selectedType);

      const res = await fetch(`${API}/mxai/generate-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type: ct?.label || selectedType,
          tone: fields.tone || "professional",
          topic: prompt,
          audience: fields.audience || "travel clients",
          destination: fields.destination || "",
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Generation failed");
      setGenerated(data.content);
    } catch (e: any) {
      setError(e.message || "Failed to generate content");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!generated) return;
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredTypes = CONTENT_TYPES.filter(t => t.category === activeCategory);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-card-foreground">Content Generator</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-powered content creation for your travel business</p>
        </div>

        {/* Quick Create */}
        <div className="grid grid-cols-3 gap-3">
          {QUICK_CREATE.map(q => (
            <button key={q.id} onClick={() => selectType(q.id)}
              className={`flex items-start gap-3 p-4 rounded-xl border transition-all text-left ${
                selectedType === q.id
                  ? "border-primary bg-primary/8 shadow-sm"
                  : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
              }`}>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                selectedType === q.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                <q.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-card-foreground">{q.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{q.sub}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-5 gap-6 items-start">

          {/* LEFT: Categories + Form */}
          <div className="lg:col-span-2 space-y-4">

            {/* Category tabs */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex border-b border-border">
                {CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                    className={`flex-1 py-2.5 text-[11px] font-semibold transition-all ${
                      activeCategory === cat.id
                        ? "bg-primary/10 text-primary border-b-2 border-primary"
                        : "text-muted-foreground hover:text-card-foreground hover:bg-muted/30"
                    }`}>
                    {cat.label.split(" ")[0]}
                  </button>
                ))}
              </div>

              {/* Content type list */}
              <div className="p-2 space-y-0.5">
                {filteredTypes.map(ct => (
                  <button key={ct.id} onClick={() => selectType(ct.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all ${
                      selectedType === ct.id
                        ? "bg-primary/10 text-primary"
                        : "text-card-foreground hover:bg-muted/40"
                    }`}>
                    <ct.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-sm">{ct.label}</span>
                    {ct.priority && (
                      <span className="ml-auto text-[11px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">Popular</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Content Source toggle */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">Content Source</p>
              <div className="space-y-2">
                {[
                  { val: true,  icon: Database, label: "Use Custom Holidays Data",  sub: "Auto-fill from trips & clients" },
                  { val: false, icon: PenLine,  label: "Write from Scratch",   sub: "Manual input only" },
                ].map(opt => (
                  <button key={String(opt.val)} onClick={() => setUseBusinessData(opt.val)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                      useBusinessData === opt.val
                        ? "border-primary bg-primary/8"
                        : "border-border hover:border-primary/30"
                    }`}>
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      useBusinessData === opt.val ? "border-primary" : "border-muted-foreground"
                    }`}>
                      {useBusinessData === opt.val && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <opt.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-card-foreground">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground">{opt.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic form */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                {selectedCT && <selectedCT.icon className="h-4 w-4 text-primary" />}
                <p className="text-sm font-semibold text-card-foreground">{selectedCT?.label || "Select Content Type"}</p>
              </div>

              <DynamicForm
                typeId={selectedType}
                fields={fields}
                setFields={setFields}
                useBusinessData={useBusinessData}
              />

              {useBusinessData && <DataPreview fields={fields} />}

              <button
                onClick={generate}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                      <Sparkles className="h-4 w-4" />
                    </motion.div>
                    Creating your content...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate
                  </>
                )}
              </button>
            </div>

            {/* Recent Content */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground">Recent Content</p>
              </div>
              <div className="space-y-1">
                {RECENT_CONTENT.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <r.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-card-foreground truncate">{r.title}</p>
                      <p className="text-[11px] text-muted-foreground">{r.subtitle} · {r.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: Output Panel */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-border bg-card min-h-[600px] flex flex-col">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                <div className="flex items-center gap-2">
                  {selectedCT && <selectedCT.icon className="h-4 w-4 text-primary" />}
                  <span className="text-sm font-semibold text-card-foreground">{selectedCT?.label || "Output"}</span>
                </div>
                {generated && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={copy}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-card-foreground px-2.5 py-1.5 rounded-lg border border-border hover:border-primary/40 transition-all">
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                    <button onClick={generate}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-card-foreground px-2.5 py-1.5 rounded-lg border border-border hover:border-primary/40 transition-all">
                      <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                    </button>
                    <button className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg transition-all hover:opacity-90">
                      <Send className="h-3.5 w-3.5" /> Send to Client
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 p-6">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center h-full gap-4 py-16">
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}>
                        <Sparkles className="h-8 w-8 text-primary" />
                      </motion.div>
                      <div className="text-center space-y-1">
                        <p className="text-sm font-medium text-card-foreground">Creating your content...</p>
                        <p className="text-xs text-muted-foreground">AI is generating your {selectedCT?.label?.toLowerCase()}</p>
                      </div>
                      <div className="space-y-2 w-full max-w-sm">
                        {[1, 2, 3].map(i => (
                          <motion.div key={i} className="h-3 bg-muted rounded-full"
                            animate={{ opacity: [0.4, 0.8, 0.4] }}
                            transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                            style={{ width: `${90 - i * 10}%` }} />
                        ))}
                      </div>
                    </motion.div>
                  ) : error ? (
                    <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center h-full gap-3 py-16">
                      <AlertCircle className="h-8 w-8 text-destructive" />
                      <div className="text-center">
                        <p className="text-sm font-medium text-card-foreground">Generation failed</p>
                        <p className="text-xs text-muted-foreground mt-1">{error}</p>
                      </div>
                      <button onClick={generate} className="text-xs text-primary hover:underline">Try again</button>
                    </motion.div>
                  ) : generated ? (
                    <motion.div key="generated" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="prose prose-sm max-w-none text-card-foreground">
                      <ReactMarkdown>{generated}</ReactMarkdown>
                    </motion.div>
                  ) : (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center h-full gap-4 py-16 text-center">
                      <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                        <Sparkles className="h-7 w-7 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-card-foreground">Ready to create</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                          Select a content type and the relevant trip or client information, then generate customer-ready content.
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {QUICK_CREATE.map(q => (
                          <button key={q.id} onClick={() => selectType(q.id)}
                            className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-muted/30 transition-all">
                            <q.icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground text-center">{q.label}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
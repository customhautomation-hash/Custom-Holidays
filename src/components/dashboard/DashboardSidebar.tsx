import {
  LayoutDashboard, Users, Map, MessageSquare, FileText,
  IndianRupee, TrendingUp, CalendarClock, CalendarPlus, Megaphone,
  UserCircle2, Truck, ChevronDown, Briefcase, Plane, Palette, Wallet,
  Bot, Handshake, UserCheck, Sparkles, ImagePlus, ListTodo,
  Zap, LogOut, Database, FileSpreadsheet, FolderTree, Scale, BookOpen, Search,
} from "lucide-react";
import { NavLink } from "../../components/Navlink";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader,
} from "../../components/ui/sidebar";
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { useDarkMode } from "../../hooks/useDarkMode";

const STORAGE_KEY = "sidebar:modules";

function loadModuleState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {};   // every group starts open

}

function saveModuleState(state: Record<string, boolean>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

type ModuleKey = string;
type Item = { title: string; url: string; icon: React.ElementType };
type Theme = { BG: string; SHADOW_IN: string; SHADOW_OUT: string; TEXT_MAIN: string; TEXT_MUTED: string; ACCENT: string; HAIRLINE: string };

// One nav row: 36px tall, icon column 16px, label on one line
function NavRow({ item, t }: { item: Item; t: Theme }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <NavLink to={item.url} end
          className="flex items-center gap-2.5 h-8 px-2.5 rounded-[8px] text-[13px] transition-colors hover:bg-white/[0.06]"
          style={{ color: t.TEXT_MUTED }}
          activeClassName=""
          activeStyle={{ color: t.ACCENT, background: t.BG, boxShadow: t.SHADOW_IN, fontWeight: 500 }}>
          <item.icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} />
          <span className="truncate">{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ModuleSection({ label, icon: Icon, items, moduleKey, moduleState, setModuleState, t }: {
  label: string; icon: React.ElementType; items: Item[]; moduleKey: ModuleKey;
  moduleState: Record<string, boolean>; setModuleState: (s: Record<string, boolean>) => void; t: Theme;
}) {
  const open = moduleState[moduleKey] !== false;
  const toggle = () => {
    const next = { ...moduleState, [moduleKey]: !open };
    setModuleState(next);
    saveModuleState(next);
  };

  return (
    <SidebarGroup className="p-0 mt-4">
      {/* Section heading: full-width, clearly clickable */}
      <button onClick={toggle} aria-expanded={open}
        className="flex items-center gap-3 w-full h-10 px-3 rounded-2xl text-left transition-shadow duration-200"
        style={{ color: t.TEXT_MAIN, background: t.BG, boxShadow: open ? t.SHADOW_IN : t.SHADOW_OUT, border: "none", cursor: "pointer" }}>
        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: open ? t.ACCENT : t.TEXT_MUTED }} />
        <span className="flex-1 text-[13px] font-semibold">{label}</span>
        <span className="text-[11px] tabular-nums" style={{ color: t.TEXT_MUTED }}>{open ? "" : items.length}</span>
        <ChevronDown className="h-4 w-4 transition-transform" strokeWidth={1.75}
          style={{ color: t.TEXT_MUTED, transform: open ? "rotate(0deg)" : "rotate(-90deg)" }} />
      </button>
      {open && (
        <SidebarGroupContent className="mt-2 ml-[19px] pl-2" style={{ borderLeft: `1px solid ${t.HAIRLINE}` }}>
          <SidebarMenu className="gap-0.5">
            {items.map(item => <NavRow key={item.url} item={item} t={t} />)}
          </SidebarMenu>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

export function DashboardSidebar() {
  const [moduleState, setModuleState] = useState<Record<string, boolean>>(loadModuleState);
  const { user, profile } = useAuth();
  const { dark } = useDarkMode();

  // ── Theme tokens ──────────────────────────────────────────────────────────
  // CH Connect palette: deep teal sidebar, gold accents
  const t: Theme = {
    BG:         dark ? "#072A2C" : "#0B3B3D",
    SHADOW_IN:  dark
      ? "inset 2px 2px 5px #031516, inset -2px -2px 5px #0D3D40"
      : "inset 2px 2px 5px #062426, inset -2px -2px 5px #115254",
    SHADOW_OUT: dark
      ? "3px 3px 7px #031516, -3px -3px 7px #0D3D40"
      : "3px 3px 7px #062426, -3px -3px 7px #115254",
    TEXT_MAIN:  "#F6F4EE",
    TEXT_MUTED: "#C9D8D7",
    ACCENT:     "#D4AF5A",
    HAIRLINE:   "rgba(212,175,90,0.22)",
  };
  const HAIRLINE = t.HAIRLINE;

  const sectionProps = { moduleState, setModuleState, t };
  const handleSignOut = async () => { await supabase.auth.signOut(); };

  return (
    <Sidebar className="border-r-0" style={{ background: t.BG }}>

      {/* Logo */}
      <SidebarHeader className="px-4 pt-5 pb-4 border-b-0" style={{ background: t.BG }}>
        <div className="flex items-center gap-3">
          <img src="/ch-mark-peach.png" alt="Custom Holidays" className="h-11 w-11 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-serif text-[18px] font-semibold leading-tight" style={{ color: t.TEXT_MAIN }}>Custom Holidays</h2>
            <p className="text-xs leading-tight" style={{ color: t.TEXT_MUTED }}>Dashboard</p>
          </div>
        </div>
      </SidebarHeader>

      {/* Nav */}
      <SidebarContent
        className="px-3 pt-1 pb-4 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ background: t.BG }}>

        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <NavRow item={{ title: "Overview", url: "/", icon: LayoutDashboard }} t={t} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Groups follow a trip: first contact → plan → book → suppliers → marketing → team → money → AI */}
        <ModuleSection {...sectionProps} label="Sales & Leads" icon={Users} moduleKey="sales"
          items={[
            { title: "Leads",          url: "/leads",           icon: UserCheck    },
            { title: "Campaigns",      url: "/campaign-design", icon: Megaphone    },
            { title: "Book a Meeting", url: "/book",            icon: CalendarPlus },
          ]} />

        <ModuleSection {...sectionProps} label="Plan a Trip" icon={Plane} moduleKey="plan"
          items={[
            { title: "Itineraries",     url: "/itineraries",    icon: Map             },
            { title: "Price Compare",   url: "/price-compare",  icon: Scale           },
            { title: "Quote Generator", url: "/quotes",         icon: FileSpreadsheet },
            { title: "Trip Documents",  url: "/trip-documents", icon: FolderTree      },
          ]} />

        <ModuleSection {...sectionProps} label="Clients & Bookings" icon={Briefcase} moduleKey="clients"
          items={[
            { title: "Clients & PMS", url: "/client-pms", icon: UserCircle2 },
          ]} />

        <ModuleSection {...sectionProps} label="Suppliers" icon={Truck} moduleKey="suppliers"
          items={[
            { title: "Suppliers",         url: "/suppliers",         icon: Truck     },
            { title: "Active Deals",      url: "/active-deals",      icon: Handshake },
            { title: "Rates Library",     url: "/knowledge-base",    icon: BookOpen  },
          ]} />

        <ModuleSection {...sectionProps} label="Marketing" icon={Palette} moduleKey="marketing"
          items={[
            { title: "Content",       url: "/content",       icon: FileText   },
            { title: "Creatives",     url: "/creatives",     icon: ImagePlus  },
            { title: "Web Analytics", url: "/web-analytics", icon: TrendingUp },
          ]} />

        <ModuleSection {...sectionProps} label="Team" icon={MessageSquare} moduleKey="team"
          items={[
            { title: "To-do",       url: "/todo",        icon: ListTodo      },
            { title: "Team Chat",   url: "/chat",        icon: MessageSquare },
            { title: "Automations", url: "/automations", icon: Zap           },
          ]} />

        <ModuleSection {...sectionProps} label="Finance" icon={Wallet} moduleKey="finance"
          items={[
            { title: "Finance KPIs", url: "/finance-kpis", icon: IndianRupee },
          ]} />

        <ModuleSection {...sectionProps} label="CH Assistant" icon={Sparkles} moduleKey="assistant"
          items={[
            { title: "Ask CH Assistant", url: "/mxai", icon: Sparkles },
          ]} />
      </SidebarContent>

      {/* User footer */}
      <div className="px-4 py-3 mt-auto flex items-center gap-3"
        style={{ background: t.BG, borderTop: `1px solid ${HAIRLINE}` }}>
        {user && (
          <>
            <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-medium"
              style={{ border: "1.5px solid #D4AF5A", color: "#D4AF5A", fontWeight: 600 }}>
              {(profile?.full_name || user.email || "U")[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium truncate" style={{ color: t.TEXT_MAIN }}>
                {profile?.full_name || user.email?.split("@")[0]}
              </p>
              <p className="text-xs truncate" style={{ color: t.TEXT_MUTED }}>
                {profile?.role || "member"}
              </p>
            </div>
          </>
        )}
        <button onClick={handleSignOut} title="Sign out"
          className="h-8 w-8 flex items-center justify-center rounded-[10px] shrink-0 transition-colors hover:bg-white/10"
          style={{ color: t.TEXT_MUTED, background: "none", border: "none", cursor: "pointer" }}>
          <LogOut className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </Sidebar>
  );
}

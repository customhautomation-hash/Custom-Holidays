import {
  LayoutDashboard, Users, Map, MessageSquare, FileText,
  IndianRupee, TrendingUp, CalendarClock, CalendarPlus, Megaphone,
  UserCircle2, Truck, ChevronDown, Briefcase, Plane, Palette, Wallet,
  Bot, Handshake, UserCheck, Sparkles, ImagePlus, ListTodo,
  Zap, LogOut, FileSpreadsheet, Scale, BarChart3, Workflow, Ticket, Building2,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader,
} from "../../components/ui/sidebar";
import { useState } from "react";
import { useNavigate, useLocation, NavLink as RouterNavLink } from "react-router-dom";
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
        <RouterNavLink to={item.url} end
          className="flex items-center gap-2.5 h-8 px-2.5 rounded-[8px] text-[13px] transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          style={({ isActive }) => isActive
            ? { color: t.ACCENT, background: t.BG, boxShadow: t.SHADOW_IN, fontWeight: 600 }
            : { color: t.TEXT_MUTED }}>
          <item.icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} />
          <span className="truncate">{item.title}</span>
        </RouterNavLink>
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
  // Sidebar matches the page: light in light mode, deep green in dark mode
  const t: Theme = dark ? {
    BG: "#0C2C32",
    SHADOW_IN: "inset 2px 2px 5px #061A1E, inset -2px -2px 5px #16434A",
    SHADOW_OUT: "3px 3px 7px #061A1E, -3px -3px 7px #16434A",
    TEXT_MAIN: "#E6EFEC", TEXT_MUTED: "#8FA6A3", ACCENT: "#D4AF5A", HAIRLINE: "rgba(212,175,90,0.18)",
  } : {
    BG: "#F3EAEA",
    SHADOW_IN: "inset 2px 2px 5px #D9C6C8, inset -2px -2px 5px #FFFFFF",
    SHADOW_OUT: "3px 3px 7px #D9C6C8, -3px -3px 7px #FFFFFF",
    TEXT_MAIN: "#1A2324", TEXT_MUTED: "#5B6766", ACCENT: "#13585B", HAIRLINE: "rgba(19,88,91,0.14)",
  };
  const HAIRLINE = t.HAIRLINE;

  const sectionProps = { moduleState, setModuleState, t };
  const handleSignOut = async () => { await supabase.auth.signOut(); };
  const navigate = useNavigate();
  const onProfile = useLocation().pathname === "/profile";

  return (
    <Sidebar className="border-r-0" style={{ background: t.BG, borderRight: `1px solid ${t.HAIRLINE}` }}>

      {/* Logo */}
      <SidebarHeader className="px-4 pt-5 pb-4 border-b-0" style={{ background: t.BG }}>
        <div className="flex items-center gap-3">
          <img src={dark ? "/ch-mark-peach.png" : "/ch-mark-teal.png"} alt="Custom Holidays" className="h-11 w-11 shrink-0" />
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

        {/* Groups: leads → operations → trips → suppliers → marketing → money. CH Assistant is the corner pop-up. */}
        <ModuleSection {...sectionProps} label="Lead Analytics" icon={Users} moduleKey="leads"
          items={[
            { title: "Master CRM",     url: "/leads",          icon: UserCheck  },
            { title: "Web Analytics",  url: "/web-analytics",  icon: TrendingUp },
            { title: "Meta Analytics", url: "/meta-analytics", icon: BarChart3  },
          ]} />

        <ModuleSection {...sectionProps} label="Operations" icon={Workflow} moduleKey="operations"
          items={[
            { title: "Itineraries",       url: "/itineraries",    icon: Map             },
            { title: "Price Compare",     url: "/price-compare",  icon: Scale           },
            { title: "Quote Generator",   url: "/quotes",         icon: FileSpreadsheet },
            { title: "Voucher Generator", url: "/vouchers",       icon: Ticket          },
            { title: "Team Chat",         url: "/chat",           icon: MessageSquare   },
            { title: "Automations",       url: "/automations",    icon: Zap             },
          ]} />

        <ModuleSection {...sectionProps} label="Trips" icon={Briefcase} moduleKey="trips"
          items={[
            { title: "Active Trips", url: "/trips", icon: Plane },
          ]} />

        <ModuleSection {...sectionProps} label="Suppliers" icon={Truck} moduleKey="suppliers"
          items={[
            { title: "Suppliers",    url: "/suppliers",    icon: Building2 },
            { title: "Active Deals", url: "/active-deals", icon: Handshake },
          ]} />

        <ModuleSection {...sectionProps} label="Marketing" icon={Palette} moduleKey="marketing"
          items={[
            { title: "Campaigns", url: "/campaign-design", icon: Megaphone },
            { title: "Content",   url: "/content",         icon: FileText  },
            { title: "Creatives", url: "/creatives",       icon: ImagePlus },
          ]} />

        <ModuleSection {...sectionProps} label="Finance" icon={Wallet} moduleKey="finance"
          items={[
            { title: "Finance KPIs", url: "/finance-kpis", icon: IndianRupee },
          ]} />
      </SidebarContent>

      {/* User footer */}
      <div className="px-2 py-3 mt-auto flex items-center gap-1"
        style={{ background: t.BG, borderTop: `1px solid ${HAIRLINE}` }}>
        {user && (
          <button onClick={() => navigate("/profile")} title="Profile & settings"
            className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-xl px-2 py-1.5"
            style={{ background: t.BG, border: "none", cursor: "pointer", boxShadow: onProfile ? t.SHADOW_IN : "none" }}>
            <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs"
              style={{ border: `1.5px solid ${dark ? "#D4AF5A" : "#B8913E"}`, color: dark ? "#D4AF5A" : "#B8913E", fontWeight: 600 }}>
              {(profile?.full_name || user.email || "U").split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join("")}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium truncate" style={{ color: onProfile ? t.ACCENT : t.TEXT_MAIN }}>
                {profile?.full_name || user.email?.split("@")[0]}
              </p>
              <p className="text-xs truncate" style={{ color: t.TEXT_MUTED }}>
                {(profile?.role ? profile.role[0].toUpperCase() + profile.role.slice(1) : "Member")} · Profile &amp; settings
              </p>
            </div>
          </button>
        )}
        <button onClick={handleSignOut} title="Sign out"
          className="h-8 w-8 flex items-center justify-center rounded-[10px] shrink-0 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: t.TEXT_MUTED, background: "none", border: "none", cursor: "pointer" }}>
          <LogOut className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </Sidebar>
  );
}

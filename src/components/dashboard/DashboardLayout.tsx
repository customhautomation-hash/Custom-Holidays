import { SidebarTrigger } from "../../components/ui/sidebar";
import { Bell, RefreshCw, Moon, Sun, X, CheckCheck, Info, AlertTriangle } from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useDarkMode } from "../../hooks/useDarkMode";
import { useNavigate } from "react-router-dom";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationsBell } from "./Notifications";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

interface Notification {
  id: number;
  type: "info" | "success" | "warning";
  title: string;
  message: string;
  time: string;
  read: boolean;
}

const INITIAL_NOTIFICATIONS: Notification[] = [];

function getInitials(name?: string | null, email?: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
}

const typeStyles = {
  info:    { icon: <Info style={{ width: 13, height: 13 }} />,        bg: "#EAF2F1", color: "#0B3B3D" },
  success: { icon: <CheckCheck style={{ width: 13, height: 13 }} />,  bg: "#EEFAF4", color: "#2E9E6B" },
  warning: { icon: <AlertTriangle style={{ width: 13, height: 13 }} />, bg: "#FEF6EB", color: "#D48A2E" },
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [notifOpen, setNotifOpen]   = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const notifRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { user, profile }        = useAuth();
  const { dark, toggle: toggleDark } = useDarkMode();

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const BG           = dark ? "#0C2C32" : "#F3EAEA";
  const SHADOW_OUT   = dark
    ? "5px 5px 12px #061A1E, -5px -5px 12px #16434A"
    : "5px 5px 12px #D9C6C8, -5px -5px 12px #FFFFFF";
  const TEXT_MUTED   = dark ? "#8FA6A3" : "#5B6766";
  const TEXT_MAIN    = dark ? "#E6EFEC" : "#1A2324";
  const BORDER       = dark ? "#1E3E44" : "#E4D3D5";
  const PANEL_BG     = dark ? "#10343A" : "#F3EAEA";
  const PANEL_SHADOW = dark
    ? "8px 8px 20px #061A1E, -8px -8px 20px #16434A"
    : "8px 8px 20px #D3C0C2, -8px -8px 20px #FFFFFF";

  const initials    = getInitials(profile?.full_name, user?.email);
  const displayName = profile?.full_name ?? user?.email ?? "User";
  const unreadCount = notifications.filter(n => !n.read).length;

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
    window.location.reload();
  }, []);

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const markRead    = (id: number) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  const dismiss     = (id: number) => setNotifications(prev => prev.filter(n => n.id !== id));

  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  const btnStyle: React.CSSProperties = {
    background: BG, boxShadow: SHADOW_OUT, color: TEXT_MUTED,
    border: "none", width: 36, height: 36, borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", transition: "all 0.2s", flexShrink: 0, position: "relative",
  };

  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: BG, minHeight: "100vh" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="h-14 flex items-center justify-between px-5 flex-shrink-0"
        style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>

        <div className="flex items-center gap-3">
          <SidebarTrigger className="rounded-xl transition-all" style={btnStyle} />

          {/* Global Search — sits left of centre */}
          <GlobalSearch />
        </div>

        <div className="flex items-center gap-3">

          {/* Dark / Light toggle */}
          <button onClick={toggleDark} title={dark ? "Light mode" : "Dark mode"} style={btnStyle}>
            {dark
              ? <Sun  style={{ width: 15, height: 15 }} />
              : <Moon style={{ width: 15, height: 15 }} />}
          </button>

          {/* Refresh */}
          <button onClick={handleRefresh} title="Refresh" style={btnStyle}>
            <RefreshCw style={{ width: 15, height: 15 }} className={refreshing ? "animate-spin" : ""} />
          </button>

          {/* Notifications */}
          <NotificationsBell btnStyle={btnStyle} />

          {/* Avatar → /profile */}
          <div
            title={displayName}
            onClick={() => navigate("/profile")}
            style={{
              width: 36, height: 36, borderRadius: 999,
              background: dark ? "#16434A" : "#E6D5D7",
              display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 12, fontWeight: 500, color: TEXT_MAIN,
              cursor: "pointer", flexShrink: 0, userSelect: "none", transition: "opacity 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            {initials}
          </div>
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto p-6" style={{ background: BG, color: TEXT_MAIN }}>
        {children}
      </main>
    </div>
  );
}
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@/hooks/useAuth";
import { DarkModeContext, useDarkModeState } from "@/hooks/useDarkMode";

import Login            from "./pages/Login";
import { Privacy, Terms } from "./pages/Legal";
import Index            from "./pages/index";
import MasterCRM        from "./pages/MasterCRM";
import LeadTools        from "./pages/Leads";
import Suppliers        from "./pages/SuppliersPage";
import SupplierTools    from "./pages/suppliers";
import Itineraries      from "./pages/ItinerariesLibrary";
import Content          from "./pages/Content";
import Chat             from "./pages/TeamChat";
import NotFound         from "./pages/Notfound";
import CampaignDesign   from "./pages/CampaignDesigner";
import ActiveTrips      from "./pages/ActiveTrips";
import FinanceKPIs      from "./pages/finance and  kpis";
import WebAnalytics     from "./pages/WebAnalyticsPage";
import MetaAnalytics    from "./pages/MetaAnalytics";
import ActiveDeals      from "./pages/ActiveDeals";
import Creatives        from "./pages/Creatives";
import Automations      from "./pages/Automations";
import Profile          from "./pages/ProfilePage";
import QuoteGenerator   from "./pages/QuoteGenerator";
import VoucherGenerator from "./pages/VoucherGenerator";
import PriceCompare     from "./pages/PriceCompare";
import { AssistantPopup } from "@/components/dashboard/AssistantPopup";
import { refreshPush } from "@/lib/push";
import { installServerWake, warmUpServer } from "@/lib/serverWake";
import { PageGuard, WakeNote, PageVisible } from "@/components/AppGuards";
import Help             from "./pages/Help";
import ResetPassword    from "./pages/ResetPassword";
import { supabase } from "@/lib/supabase";

// A password-reset link signs the person in; remember it so they land on "Choose a new password"
const cameFromResetLink = typeof window !== "undefined" && /type=recovery/.test(window.location.hash + window.location.search);

installServerWake();
import { useEffect, useState } from "react";

const queryClient = new QueryClient();

/**
 * Pages that stay open once visited, so switching pages never loses work in progress
 * (a half-made voucher, a reel being made, search filters, scroll position...).
 * Team Chat, Profile, Help and the import pages reload fresh each time.
 */
const KEPT: Record<string, () => JSX.Element> = {
  "/": () => <Index />, "/leads": () => <MasterCRM />, "/web-analytics": () => <WebAnalytics />, "/meta-analytics": () => <MetaAnalytics />,
  "/itineraries": () => <Itineraries />, "/price-compare": () => <PriceCompare />, "/quotes": () => <QuoteGenerator />, "/vouchers": () => <VoucherGenerator />,
  "/automations": () => <Automations />, "/trips": () => <ActiveTrips />, "/suppliers": () => <Suppliers />, "/active-deals": () => <ActiveDeals />,
  "/campaign-design": () => <CampaignDesign />, "/content": () => <Content />, "/creatives": () => <Creatives />, "/finance-kpis": () => <FinanceKPIs />,
};

function KeptPages({ path }: { path: string }) {
  const active = path in KEPT ? path : null;
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => { if (active && !seen.includes(active)) setSeen(s => [...s, active]); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = active && !seen.includes(active) ? [...seen, active] : seen;
  return <>{list.map(p => (
    <PageVisible.Provider key={p} value={p === active}>
      <div style={{ display: p === active ? "contents" : "none" }}>
        <PageGuard resetKey={p}>{KEPT[p]()}</PageGuard>
      </div>
    </PageVisible.Provider>))}</>;
}

function AppRoutes() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (cameFromResetLink && location.pathname !== "/reset-password") navigate("/reset-password", { replace: true });
    const { data } = supabase.auth.onAuthStateChange(e => { if (e === "PASSWORD_RECOVERY") navigate("/reset-password", { replace: true }); });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (session) { refreshPush().catch(() => {}); warmUpServer(); } }, [!!session]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--neu-base, #F3EAEA)" }}>
        <div className="flex flex-col items-center gap-4">
          <img src="/ch-mark-teal.png" alt="Custom Holidays" className="h-14 w-14 animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login"   element={<Login />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms"   element={<Terms />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*"        element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (location.pathname === "/reset-password") return <ResetPassword />;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full" style={{ background: "var(--neu-base, #F3EAEA)" }}>
        <DashboardSidebar />
        <WakeNote />
        <KeptPages path={location.pathname} />
        <PageGuard resetKey={location.pathname}>
        <Routes>
          {Object.keys(KEPT).map(p => <Route key={p} path={p} element={null} />)}
          <Route path="/login"             element={<Navigate to="/" replace />} />
          <Route path="/leads/import"      element={<LeadTools />} />
          <Route path="/chat"              element={<Chat />} />
          <Route path="/suppliers/import"  element={<SupplierTools />} />
          <Route path="/profile"           element={<Profile />} />
          <Route path="/help"              element={<Help />} />
          <Route path="/privacy"           element={<Privacy />} />
          <Route path="/terms"             element={<Terms />} />
          {/* old addresses still work */}
          <Route path="/client-pms"        element={<Navigate to="/trips" replace />} />
          <Route path="/trip-documents"    element={<Navigate to="/vouchers" replace />} />
          <Route path="/knowledge-base"    element={<Navigate to="/suppliers" replace />} />
          <Route path="/todo"              element={<Navigate to="/" replace />} />
          <Route path="/book"              element={<Navigate to="/leads" replace />} />
          <Route path="/mxai"              element={<Navigate to="/" replace />} />
          <Route path="/rag"               element={<Navigate to="/" replace />} />
          <Route path="*"                  element={<NotFound />} />
        </Routes>
        </PageGuard>
        <PageGuard compact resetKey={location.pathname}><AssistantPopup /></PageGuard>
      </div>
    </SidebarProvider>
  );
}

// Wraps everything so DarkModeContext is available in every component
function AppWithDarkMode() {
  const darkMode = useDarkModeState();
  return (
    <DarkModeContext.Provider value={darkMode}>
      <AppRoutes />
    </DarkModeContext.Provider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppWithDarkMode />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
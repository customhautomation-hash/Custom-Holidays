import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@/hooks/useAuth";
import { DarkModeContext, useDarkModeState } from "@/hooks/useDarkMode";

import Login            from "./pages/Login";
import Index            from "./pages/index";
import MasterCRM        from "./pages/MasterCRM";
import LeadTools        from "./pages/Leads";
import Suppliers        from "./pages/suppliers";
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
import { useEffect } from "react";

const queryClient = new QueryClient();

function AppRoutes() {
  const { session, loading } = useAuth();
  useEffect(() => { if (session) refreshPush(); }, [!!session]);

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
        <Route path="/login" element={<Login />} />
        <Route path="*"      element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full" style={{ background: "var(--neu-base, #F3EAEA)" }}>
        <DashboardSidebar />
        <Routes>
          <Route path="/"                  element={<Index />} />
          <Route path="/login"             element={<Navigate to="/" replace />} />
          <Route path="/leads"             element={<MasterCRM />} />
          <Route path="/leads/import"      element={<LeadTools />} />
          <Route path="/web-analytics"     element={<WebAnalytics />} />
          <Route path="/meta-analytics"    element={<MetaAnalytics />} />
          <Route path="/itineraries"       element={<Itineraries />} />
          <Route path="/price-compare"     element={<PriceCompare />} />
          <Route path="/quotes"            element={<QuoteGenerator />} />
          <Route path="/vouchers"          element={<VoucherGenerator />} />
          <Route path="/chat"              element={<Chat />} />
          <Route path="/automations"       element={<Automations />} />
          <Route path="/trips"             element={<ActiveTrips />} />
          <Route path="/suppliers"         element={<Suppliers />} />
          <Route path="/active-deals"      element={<ActiveDeals />} />
          <Route path="/campaign-design"   element={<CampaignDesign />} />
          <Route path="/content"           element={<Content />} />
          <Route path="/creatives"         element={<Creatives />} />
          <Route path="/finance-kpis"      element={<FinanceKPIs />} />
          <Route path="/profile"           element={<Profile />} />
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
        <AssistantPopup />
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
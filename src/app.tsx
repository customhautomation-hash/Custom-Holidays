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
import Analytics        from "./pages/Analytics";
import Leads            from "./pages/Leads";
import Suppliers        from "./pages/suppliers";
import Itineraries      from "./pages/Iteneries";
import KnowledgeBase    from "./pages/KnowledgeBase";
import RagModel         from "./pages/RagPage";
import Operations       from "./pages/Operations";
import Content          from "./pages/Content";
import Chat             from "./pages/Chat";
import NotFound         from "./pages/Notfound";
import CampaignDesign   from "./pages/CampaignDesigner";
import Scheduling       from "./pages/Scheduling";
import ClientPMS        from "./pages/Client and pms";
import FinanceKPIs      from "./pages/finance and  kpis";
import LeadAnalytics    from "./pages/Leadanalytics";
import WebAnalytics     from "./pages/Web analytics";
import SupplierReachout from "./pages/SupplierReachout";
import ActiveDeals      from "./pages/ActiveDeals";
import MXAI             from "./pages/MXAI";
import TodoPage         from "./pages/TodoPage";
import BookMeeting      from "@/pages/BookMeeting";
import Creatives        from "./pages/Creatives";
import Automations      from "./pages/Automations";
import Profile          from "./pages/Profile";
import QuoteGenerator   from "./pages/QuoteGenerator";
import TripDocuments    from "./pages/TripDocuments";
import PriceCompare     from "./pages/PriceCompare";

const queryClient = new QueryClient();

function AppRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--neu-base, #F3EAEA)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center animate-pulse"
            style={{ background: "#13585B" }} />
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
          <Route path="/finance-kpis"      element={<FinanceKPIs />} />
          <Route path="/analytics"         element={<Analytics />} />
          <Route path="/lead-analytics"    element={<LeadAnalytics />} />
          <Route path="/web-analytics"     element={<WebAnalytics />} />
          <Route path="/leads"             element={<Leads />} />
          <Route path="/suppliers"         element={<Suppliers />} />
          <Route path="/supplier-reachout" element={<SupplierReachout />} />
          <Route path="/active-deals"      element={<ActiveDeals />} />
          <Route path="/itineraries"       element={<Itineraries />} />
          <Route path="/knowledge-base"    element={<KnowledgeBase />} />
          <Route path="/rag"               element={<RagModel />} />
          <Route path="/operations"        element={<Operations />} />
          <Route path="/content"           element={<Content />} />
          <Route path="/chat"              element={<Chat />} />
          <Route path="/campaign-design"   element={<CampaignDesign />} />
          <Route path="/scheduling"        element={<Scheduling />} />
          <Route path="/client-pms"        element={<ClientPMS />} />
          <Route path="/todo"              element={<TodoPage />} />
          <Route path="/mxai"              element={<MXAI />} />
          <Route path="/automations"       element={<Automations />} />
          <Route path="/book"              element={<BookMeeting />} />
          <Route path="/creatives"         element={<Creatives />} />
          <Route path="/profile"           element={<Profile />} />
          <Route path="/quotes"            element={<QuoteGenerator />} />
          <Route path="/trip-documents"    element={<TripDocuments />} />
          <Route path="/price-compare"     element={<PriceCompare />} />
          <Route path="*"                  element={<NotFound />} />
        </Routes>
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
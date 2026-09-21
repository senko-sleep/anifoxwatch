import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import Index from "./pages/Index";
import Watch from "./pages/Watch";
import AnimePage from "./pages/Anime";
import Search from "./pages/Search";
import Browse from "./pages/Browse";
import Docs from "./pages/Docs";
import Health from "./pages/Health";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LegacyWatchRedirect } from "@/components/LegacyWatchRedirect";
import { AdultRouteRedirect } from "@/components/AdultRouteRedirect";

// Lazy load pages for better performance
const Schedule = lazy(() => import("./pages/Schedule"));
const Status = lazy(() => import("./pages/Status"));
const Monitoring = lazy(() => import("./pages/MonitoringDashboard"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on 404s or client errors
        if (error instanceof Error && (
          error.message.includes('404') || 
          error.message.includes('400') ||
          error.message.includes('403')
        )) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      staleTime: 3 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

/** Every navigation starts at the top, unless the browser is restoring a back/forward position. */
const ScrollToTop = () => {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  useEffect(() => {
    if (navType !== "POP") window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, navType]);
  return null;
};

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Index />} />

          {/* Title page and player */}
          <Route path="/anime/:animeId" element={<AdultRouteRedirect kind="title"><AnimePage /></AdultRouteRedirect>} />
          <Route path="/watch/anime/:animeId" element={<AdultRouteRedirect kind="watch"><Watch /></AdultRouteRedirect>} />

          {/* Adult catalog: its own URL space, so nothing rides in the query */}
          <Route path="/hentai/:animeId" element={<AnimePage adult />} />
          <Route path="/watch/hentai/:animeId" element={<Watch adult />} />

          {/* Old URL shapes → new ones (static segments outrank :slug) */}
          <Route path="/watch" element={<LegacyWatchRedirect />} />
          <Route path="/watch/hentai/:slug/:episode" element={<LegacyWatchRedirect adult />} />
          <Route path="/watch/:slug/:episode?" element={<LegacyWatchRedirect />} />

          <Route path="/browse" element={<Browse />} />
          <Route path="/search" element={<Search />} />
          <Route path="/schedule" element={<Suspense fallback={<PageLoader />}><Schedule /></Suspense>} />

          <Route path="/status" element={<Suspense fallback={<PageLoader />}><Status /></Suspense>} />
          <Route path="/monitoring" element={<Suspense fallback={<PageLoader />}><Monitoring /></Suspense>} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/health" element={<Health />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import Index from "./pages/Index";
import Watch from "./pages/Watch";
import Search from "./pages/Search";
import Docs from "./pages/Docs";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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

const StatusLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-fox-orange" />
      <p className="text-muted-foreground">Loading status...</p>
    </div>
  </div>
);

const ScheduleLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-fox-orange" />
      <p className="text-muted-foreground">Loading schedule...</p>
    </div>
  </div>
);

const MonitoringLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-fox-orange" />
      <p className="text-muted-foreground">Loading monitoring dashboard...</p>
    </div>
  </div>
);

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
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/watch" element={<Watch />} />
          <Route path="/search" element={<Search />} />
          <Route path="/docs" element={<Docs />} />
          <Route
            path="/schedule"
            element={
              <Suspense fallback={<ScheduleLoader />}>
                <Schedule />
              </Suspense>
            }
          />
          <Route path="/browse" element={<Search />} />
          <Route
            path="/status"
            element={
              <Suspense fallback={<StatusLoader />}>
                <Status />
              </Suspense>
            }
          />
          <Route
            path="/monitoring"
            element={
              <Suspense fallback={<MonitoringLoader />}>
                <Monitoring />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;

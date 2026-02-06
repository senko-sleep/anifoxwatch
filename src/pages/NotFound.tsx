import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Home, Search, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NotFound = () => {
  useDocumentTitle('Page Not Found');
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-7xl font-black text-fox-orange">404</h1>
            <h2 className="text-2xl font-bold text-foreground">Page not found</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              The page you're looking for doesn't exist or may have been moved.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild className="bg-fox-orange hover:bg-fox-orange/90 gap-2 w-full sm:w-auto">
              <Link to="/">
                <Home className="w-4 h-4" />
                Go Home
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2 border-white/10 w-full sm:w-auto">
              <Link to="/browse">
                <Search className="w-4 h-4" />
                Browse Anime
              </Link>
            </Button>
          </div>
          <button
            onClick={() => window.history.back()}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Go back
          </button>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default NotFound;

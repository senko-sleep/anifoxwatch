import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, Menu, X, Shuffle, Loader2, Wifi, Calendar, Home, Compass, Activity, Zap } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useSourceHealth } from '@/hooks/useAnime';
import { SearchAutocomplete } from '@/components/search/SearchAutocomplete';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingRandom, setIsLoadingRandom] = useState(false);
  const { data: sources, isLoading: healthLoading } = useSourceHealth({ autoRefresh: true, refreshInterval: 15000 });
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const onlineCount = sources?.filter((s: { status: string }) => s.status === 'online').length || 0;
  const totalCount = sources?.length || 0;
  const healthPercentage = totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 0;

  // Get health status color
  const getHealthColor = () => {
    if (healthPercentage >= 80) return 'text-green-500';
    if (healthPercentage >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  // Get health indicator icon
  const getHealthIcon = () => {
    if (healthPercentage >= 80) return <Activity className="w-3.5 h-3.5 text-green-500" />;
    if (healthPercentage >= 50) return <Activity className="w-3.5 h-3.5 text-yellow-500" />;
    return <Activity className="w-3.5 h-3.5 text-red-500" />;
  };

  // Keyboard shortcut: / or Ctrl+K to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setIsSearchOpen(false);
      setIsMobileMenuOpen(false);
    }
  };

  const handleRandomAnime = async () => {
    setIsLoadingRandom(true);
    try {
      const randomAnime = await apiClient.getRandomAnime();
      if (randomAnime) {
        navigate(`/watch?id=${encodeURIComponent(randomAnime.id)}`, {
          state: { from: location.pathname + location.search }
        });
      }
    } catch (error) {
      console.error('Failed to get random anime:', error);
    } finally {
      setIsLoadingRandom(false);
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex-shrink-0">
          <Logo size="md" />
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-0.5">
          <Link
            to="/"
            className={cn(
              "relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              location.pathname === '/' 
                ? "text-fox-orange bg-fox-orange/10" 
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Home className="w-4 h-4" />
            Home
            {location.pathname === '/' && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-fox-orange rounded-full" />
            )}
          </Link>
          <Link
            to="/browse"
            className={cn(
              "relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              location.pathname === '/browse' || location.pathname === '/search'
                ? "text-fox-orange bg-fox-orange/10" 
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Compass className="w-4 h-4" />
            Browse
            {(location.pathname === '/browse' || location.pathname === '/search') && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-fox-orange rounded-full" />
            )}
          </Link>
          <Link
            to="/schedule"
            className={cn(
              "relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              location.pathname === '/schedule'
                ? "text-fox-orange bg-fox-orange/10" 
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Calendar className="w-4 h-4" />
            Schedule
            {location.pathname === '/schedule' && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-fox-orange rounded-full" />
            )}
          </Link>
          <button
            onClick={handleRandomAnime}
            disabled={isLoadingRandom}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-all duration-200 disabled:opacity-50"
          >
            {isLoadingRandom ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shuffle className="w-4 h-4" />
            )}
            Random
          </button>
          
          {/* Source Status Indicator */}
          {totalCount > 0 && (
            <div className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-[11px] font-medium text-green-400">
                {onlineCount}/{totalCount}
              </span>
            </div>
          )}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-3">
          {/* Desktop Search */}
          <div className={cn(
            "hidden md:flex items-center transition-all duration-300",
            isSearchOpen ? "w-72" : "w-10"
          )}>
            {isSearchOpen ? (
              <SearchAutocomplete
                onClose={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                inputRef={searchInputRef}
                className="w-full"
              />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSearchOpen(true)}
                className="hover:bg-fox-surface hover:text-fox-orange relative"
                title="Search (press / or Ctrl+K)"
              >
                <Search className="w-5 h-5" />
                <kbd className="absolute -bottom-0.5 -right-0.5 text-[8px] font-mono bg-zinc-700/80 text-zinc-400 px-1 rounded border border-zinc-600/50">/</kbd>
              </Button>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden hover:bg-fox-surface"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background animate-slide-up">
          <div className="container py-4 space-y-4">
            {/* Mobile Search */}
            <SearchAutocomplete
              onClose={() => { setIsMobileMenuOpen(false); setSearchQuery(''); }}
              className="w-full"
              isMobile
            />

            {/* Mobile Nav Links */}
            <div className="flex flex-col gap-1">
              <Link
                to="/"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  location.pathname === '/' ? "bg-fox-orange/10 text-fox-orange" : "text-zinc-400 hover:bg-fox-surface hover:text-white"
                )}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Home className="w-4 h-4" />
                Home
              </Link>
              <Link
                to="/browse"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  location.pathname === '/browse' ? "bg-fox-orange/10 text-fox-orange" : "text-zinc-400 hover:bg-fox-surface hover:text-white"
                )}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Compass className="w-4 h-4" />
                Browse
              </Link>
              <Link
                to="/schedule"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  location.pathname === '/schedule' ? "bg-fox-orange/10 text-fox-orange" : "text-zinc-400 hover:bg-fox-surface hover:text-white"
                )}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Calendar className="w-4 h-4" />
                Schedule
              </Link>
              <button
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-fox-surface transition-colors text-left disabled:opacity-50"
                onClick={() => {
                  handleRandomAnime();
                  setIsMobileMenuOpen(false);
                }}
                disabled={isLoadingRandom}
              >
                {isLoadingRandom ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Shuffle className="w-4 h-4" />
                )}
                Random Anime
              </button>
              
              {/* Mobile Source Status */}
              {totalCount > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs text-muted-foreground">Streaming Sources</span>
                    <div className="flex items-center gap-2">
                      <Wifi className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-xs font-medium text-green-500">{onlineCount}/{totalCount} online</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

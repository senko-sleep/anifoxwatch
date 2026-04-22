import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Menu, X, Shuffle, Loader2, Calendar, Home, Compass,
  Activity, FileText, LayoutDashboard, Zap, ChevronDown,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useSourceHealth } from '@/hooks/useAnime';
import { SearchAutocomplete } from '@/components/search/SearchAutocomplete';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const BOTTOM_NAV = [
  { to: '/',         label: 'Home',     icon: Home,    match: null },
  { to: '/browse',   label: 'Browse',   icon: Compass, match: ['/browse', '/search'] },
  { to: '/schedule', label: 'Schedule', icon: Calendar, match: null },
];

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingRandom, setIsLoadingRandom] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { data: sources } = useSourceHealth({ autoRefresh: true, refreshInterval: 15000 });
  const searchInputRef = useRef<HTMLInputElement>(null);

  const onlineCount = sources?.filter((s: { status: string }) => s.status === 'online').length || 0;
  const totalCount = sources?.length || 0;
  const healthPercentage = totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 0;
  const allGood = healthPercentage >= 80;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsMobileSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleRandomAnime = async () => {
    setIsLoadingRandom(true);
    try {
      const randomAnime = await apiClient.getRandomAnime();
      if (randomAnime) {
        navigate(`/watch?id=${encodeURIComponent(randomAnime.id)}`, {
          state: { from: location.pathname + location.search },
        });
      }
    } catch (error) {
      console.error('Failed to get random anime:', error);
    } finally {
      setIsLoadingRandom(false);
    }
  };

  const navLinks = [
    { to: '/',         label: 'Home',     icon: Home },
    { to: '/browse',   label: 'Browse',   icon: Compass, match: ['/browse', '/search'] },
    { to: '/schedule', label: 'Schedule', icon: Calendar },
  ];

  const isActive = (link: { to: string; match?: string[] }) => {
    if (link.match) return link.match.includes(location.pathname);
    return location.pathname === link.to;
  };

  const isBottomActive = (item: typeof BOTTOM_NAV[0]) => {
    if (item.match) return item.match.includes(location.pathname);
    return location.pathname === item.to;
  };

  return (
    <>
      {/* ─── Top Bar ──────────────────────────────────────────────────── */}
      <nav
        className={cn(
          'sticky top-0 z-50 w-full transition-all duration-300',
          scrolled
            ? 'border-b border-white/[0.07] bg-[#080a0f]/92 backdrop-blur-2xl shadow-xl shadow-black/40'
            : 'border-b border-transparent bg-[#080a0f]/70 backdrop-blur-xl'
        )}
      >
        {/* Top accent line — stronger orange glow */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-fox-orange to-transparent opacity-80" />
        {/* Subtle glow below accent */}
        <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-fox-orange/[0.06] to-transparent pointer-events-none" />

        <div className="container flex h-14 sm:h-16 items-center gap-2 sm:gap-3 min-w-0">

          {/* Logo */}
          <Link to="/" className="flex-shrink-0 group">
            <div className="transition-transform duration-200 group-hover:scale-[1.03]">
              <Logo size="md" />
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex flex-1 min-w-0 items-center gap-0.5 pl-2">
            {navLinks.map((link) => {
              const active = isActive(link);
              const Icon = link.icon;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    'relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                    active
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05]'
                  )}
                >
                  {active && (
                    <span className="absolute inset-0 rounded-lg bg-fox-orange/10 ring-1 ring-fox-orange/20" />
                  )}
                  <Icon className={cn('relative w-3.5 h-3.5', active ? 'text-fox-orange' : 'opacity-70')} />
                  <span className="relative">{link.label}</span>
                  {active && (
                    <span className="absolute -bottom-[1px] left-3 right-3 h-[2px] rounded-full bg-fox-orange" />
                  )}
                </Link>
              );
            })}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                    ['/docs', '/status', '/monitoring'].includes(location.pathname)
                      ? 'text-white bg-fox-orange/10 ring-1 ring-fox-orange/20'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05]'
                  )}
                >
                  More
                  <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-52 bg-[#0e1118]/98 border-white/[0.08] shadow-2xl shadow-black/60 backdrop-blur-xl"
              >
                <DropdownMenuItem asChild className="cursor-pointer text-zinc-300 hover:text-white focus:text-white">
                  <Link to="/docs" className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-zinc-500" />
                    API docs
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer text-zinc-300 hover:text-white focus:text-white">
                  <Link to="/status" className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-zinc-500" />
                    System status
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/[0.06]" />
                <DropdownMenuItem asChild className="cursor-pointer text-zinc-300 hover:text-white focus:text-white">
                  <Link to="/monitoring" className="flex items-center gap-2">
                    <LayoutDashboard className="w-4 h-4 text-zinc-500" />
                    Monitoring
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              onClick={handleRandomAnime}
              disabled={isLoadingRandom}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] transition-all duration-200 disabled:opacity-40"
            >
              {isLoadingRandom
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Shuffle className="w-3.5 h-3.5 opacity-70" />
              }
              Random
            </button>
          </div>

          {/* Right: search + status */}
          <div className="flex flex-shrink-0 items-center gap-2 ml-auto">

            {/* Source Status Pill — desktop only */}
            {totalCount > 0 && (
              <div className={cn(
                'hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors',
                allGood
                  ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/8 border-amber-500/20 text-amber-400'
              )}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className={cn(
                    'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                    allGood ? 'bg-emerald-400' : 'bg-amber-400'
                  )} />
                  <span className={cn('relative inline-flex rounded-full h-1.5 w-1.5', allGood ? 'bg-emerald-500' : 'bg-amber-500')} />
                </span>
                {onlineCount}/{totalCount}
              </div>
            )}

            {/* Desktop Search */}
            <div className={cn(
              'hidden md:flex items-center flex-shrink-0 transition-all duration-300',
              isSearchOpen ? 'w-72 min-w-[18rem]' : 'w-auto'
            )}>
              {isSearchOpen ? (
                <SearchAutocomplete
                  onClose={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                  inputRef={searchInputRef}
                  className="w-full"
                />
              ) : (
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="group flex items-center gap-2.5 h-9 px-3 rounded-lg bg-white/[0.04] border border-fox-orange/25 hover:bg-white/[0.06] hover:border-fox-orange/60 transition-all duration-200 shadow-[0_0_8px_rgba(255,102,0,0.08)]"
                  title="Search (press / or Ctrl+K)"
                >
                  <Search className="w-4 h-4 text-zinc-400 group-hover:text-fox-orange transition-colors" />
                  <span className="text-[12px] text-zinc-500 group-hover:text-zinc-300 transition-colors hidden lg:block pr-1">
                    Search anime...
                  </span>
                  <kbd className="hidden lg:inline-flex items-center text-[9px] font-mono bg-white/[0.06] text-zinc-500 px-1.5 py-0.5 rounded border border-white/[0.08]">
                    /
                  </kbd>
                </button>
              )}
            </div>

            {/* Mobile: Search icon */}
            <button
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.1] hover:text-white transition-all duration-200 touch-manipulation"
              onClick={() => setIsMobileSearchOpen(true)}
              aria-label="Search"
            >
              <Search className="w-[18px] h-[18px]" />
            </button>

            {/* Mobile: Secondary menu (docs/status/random) */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden hover:bg-white/[0.06] w-9 h-9 rounded-xl border border-white/[0.06] touch-manipulation"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
            </Button>
          </div>
        </div>

        {/* Mobile secondary menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-white/[0.06] bg-[#090b10]/98 backdrop-blur-2xl">
            <div className="container py-3 space-y-1">
              <button
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium hover:bg-white/[0.05] transition-colors text-left disabled:opacity-50 touch-manipulation text-zinc-300 hover:text-white"
                onClick={() => { handleRandomAnime(); setIsMobileMenuOpen(false); }}
                disabled={isLoadingRandom}
              >
                {isLoadingRandom ? <Loader2 className="w-[18px] h-[18px] animate-spin text-fox-orange" /> : <Shuffle className="w-[18px] h-[18px] text-fox-orange" />}
                <span>Random Anime</span>
                <span className="ml-auto text-[10px] text-zinc-600 font-medium">Feeling lucky?</span>
              </button>

              <div className="pt-1 mt-1 border-t border-white/[0.05]">
                <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Resources</p>
                {[
                  { to: '/docs',       icon: FileText,       label: 'API docs' },
                  { to: '/status',     icon: Activity,       label: 'System status' },
                  { to: '/monitoring', icon: LayoutDashboard, label: 'Monitoring' },
                ].map(({ to, icon: Icon, label }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-white transition-colors touch-manipulation"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Icon className="w-4 h-4 text-zinc-500" />
                    {label}
                  </Link>
                ))}
              </div>

              {totalCount > 0 && (
                <div className="pt-1 border-t border-white/[0.05]">
                  <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-xs text-zinc-500">Streaming Sources</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      <span className="text-xs font-medium text-emerald-400">{onlineCount}/{totalCount} online</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ─── Mobile Search Overlay ──────────────────────────────────── */}
      {isMobileSearchOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60] bg-[#080a0f]/96 backdrop-blur-2xl flex flex-col"
          onClick={(e) => { if (e.target === e.currentTarget) setIsMobileSearchOpen(false); }}
        >
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/[0.07]">
            <div className="flex-1">
              <SearchAutocomplete
                onClose={() => { setIsMobileSearchOpen(false); setSearchQuery(''); }}
                className="w-full"
                isMobile
              />
            </div>
            <button
              onClick={() => setIsMobileSearchOpen(false)}
              className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.06] text-zinc-400 hover:text-white transition-colors touch-manipulation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Mobile Bottom Nav ──────────────────────────────────────── */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-50"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Glass border top */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />
        <div className="absolute inset-0 bg-[#080a0f]/92 backdrop-blur-2xl" />

        <div className="relative flex items-stretch h-[58px]">
          {BOTTOM_NAV.map((item) => {
            const active = isBottomActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 touch-manipulation relative"
                onClick={() => { setIsMobileMenuOpen(false); setIsMobileSearchOpen(false); }}
              >
                {active && (
                  <>
                    {/* Active glow blob */}
                    <span className="absolute inset-x-2 top-0 h-[2px] rounded-full bg-fox-orange shadow-[0_0_8px_2px] shadow-fox-orange/50" />
                    {/* Active bg tint */}
                    <span className="absolute inset-x-1 inset-y-1 rounded-xl bg-fox-orange/[0.08]" />
                  </>
                )}
                <Icon
                  className={cn(
                    'relative w-5 h-5 transition-all duration-200',
                    active ? 'text-fox-orange drop-shadow-[0_0_6px_rgba(255,107,53,0.6)]' : 'text-zinc-500'
                  )}
                />
                <span className={cn(
                  'relative text-[10px] font-semibold tracking-wide transition-colors duration-200',
                  active ? 'text-fox-orange' : 'text-zinc-600'
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* Search tab */}
          <button
            className="flex-1 flex flex-col items-center justify-center gap-0.5 touch-manipulation relative"
            onClick={() => { setIsMobileSearchOpen(true); setIsMobileMenuOpen(false); }}
          >
            <Search className="relative w-5 h-5 text-zinc-500 transition-all duration-200" />
            <span className="relative text-[10px] font-semibold tracking-wide text-zinc-600">Search</span>
          </button>
        </div>
      </div>
    </>
  );
};

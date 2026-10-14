import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Calendar, ChevronDown, Clapperboard, Compass, FileText, Home,
  LayoutDashboard, Loader2, Menu, Search, Shuffle, Tv, X,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { animePath } from '@/lib/routes';
import { useSourceHealth } from '@/hooks/useAnime';
import { SearchAutocomplete } from '@/components/search/SearchAutocomplete';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The bar is a single pane of glass over the page: transparent at the top of
 * a hero, gaining tint and a hairline once content scrolls beneath it. Three
 * destinations, one search, and everything else folded into "More" — the
 * depth is there, it just isn't shouted.
 */
const PRIMARY_NAV = [
  { to: '/', label: 'Home', icon: Home, isActive: (pathname: string, _search: string) => pathname === '/' },
  { to: '/browse?type=TV', label: 'Anime', icon: Tv, isActive: (pathname: string, search: string) => pathname === '/browse' && new URLSearchParams(search).get('type') === 'TV' },
  { to: '/schedule', label: 'Schedule', icon: Calendar, isActive: (pathname: string, _search: string) => pathname.startsWith('/schedule') },
  { to: '/browse?type=Movie', label: 'Movies', icon: Clapperboard, isActive: (pathname: string, search: string) => pathname === '/browse' && new URLSearchParams(search).get('type') === 'Movie' },
  { to: '/browse', label: 'Browse', icon: Compass, isActive: (pathname: string, search: string) => (pathname === '/browse' || pathname === '/search') && !new URLSearchParams(search).has('type') },
];

const DOCK_NAV = ['Home', 'Browse', 'Schedule', 'Movies'].map((l) => PRIMARY_NAV.find(({ label }) => label === l)!);

const MORE_NAV = [
  { to: '/docs', label: 'API docs', icon: FileText },
  { to: '/status', label: 'System status', icon: Activity },
  { to: '/monitoring', label: 'Monitoring', icon: LayoutDashboard },
];

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loadingRandom, setLoadingRandom] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [dockHidden, setDockHidden] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: sources } = useSourceHealth({ autoRefresh: true, refreshInterval: 30000 });
  const online = sources?.filter((s: { status: string }) => s.status === 'online').length ?? 0;
  const total = sources?.length ?? 0;
  const healthy = total > 0 && online / total >= 0.8;

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 12);
      // Tuck the dock away while reading down; any upward scroll brings it back.
      if (Math.abs(y - lastY) > 6) {
        setDockHidden(y > lastY && y > 160);
        lastY = y;
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Route changes close anything transient — no overlay survives a navigation.
  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '/' || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        if (window.matchMedia('(max-width: 767px)').matches) setMobileSearchOpen(true);
        else {
          setSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setMobileSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleRandom = async () => {
    setLoadingRandom(true);
    try {
      const random = await apiClient.getRandomAnime();
      if (random) {
        navigate(animePath(random), { state: { from: location.pathname + location.search } });
      }
    } catch (error) {
      console.error('Failed to get random anime:', error);
    } finally {
      setLoadingRandom(false);
    }
  };

  const isActive = (item: (typeof PRIMARY_NAV)[number]) => item.isActive(location.pathname, location.search);

  return (
    <>
      <header
        className={cn(
          location.pathname === '/'
            ? 'home-floating-header absolute inset-x-0 top-0 z-50 w-full transition-[background-color,border-color,backdrop-filter] duration-300'
            : 'sticky top-0 z-50 w-full transition-[background-color,border-color,backdrop-filter] duration-300',
          location.pathname === '/'
            ? 'border-b border-transparent bg-transparent'
            : !scrolled && /^\/(anime|hentai)\//.test(location.pathname)
            ? 'border-b border-transparent bg-transparent'
            : scrolled
            ? 'border-b border-white/[0.07] bg-[hsl(234_32%_5%_/_0.82)] backdrop-blur-xl backdrop-saturate-150'
            : 'border-b border-transparent bg-[hsl(234_32%_5%_/_0.35)] backdrop-blur-md'
        )}
      >
        <div className="page-x flex h-16 items-center gap-3">
          <Link to="/" aria-label="AniFox home" className="shrink-0">
            <Logo size="md" />
          </Link>

          <nav className="ml-3 hidden items-center gap-1 md:flex">
            {PRIMARY_NAV.map((item) => {
              const { to, label } = item;
              const active = isActive(item);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors duration-200',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                  {active && (
                    <span className="absolute inset-x-3.5 -bottom-[1px] h-[2px] rounded-full bg-[hsl(var(--primary))]" />
                  )}
                </Link>
              );
            })}

            {location.pathname !== '/' && <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors duration-200',
                    MORE_NAV.some((m) => location.pathname.startsWith(m.to))
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  More
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="glass-solid w-52 rounded-xl p-1.5">
                {MORE_NAV.map(({ to, label, icon: Icon }, i) => (
                  <div key={to}>
                    {i === MORE_NAV.length - 1 && <DropdownMenuSeparator className="bg-white/[0.06]" />}
                    <DropdownMenuItem asChild className="cursor-pointer rounded-lg focus:bg-white/[0.06]">
                      <Link to={to} className="flex items-center gap-2.5 text-[13px] text-foreground/80">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {label}
                      </Link>
                    </DropdownMenuItem>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>}

          </nav>

          <div className="ml-auto flex items-center gap-2">
            {total > 0 && location.pathname !== '/' && (
              <Link
                to="/status"
                title={`${online} of ${total} sources online`}
                className={cn(
                  'hidden items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors lg:inline-flex',
                  healthy
                    ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300/90 hover:border-emerald-500/35'
                    : 'border-amber-500/20 bg-amber-500/[0.07] text-amber-300/90 hover:border-amber-500/35'
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', healthy ? 'bg-emerald-400' : 'bg-amber-400')} />
                {online}/{total} sources
              </Link>
            )}

            <div className={cn('hidden md:flex', searchOpen ? 'w-[26rem]' : 'w-auto')}>
              {searchOpen ? (
                <SearchAutocomplete onClose={() => setSearchOpen(false)} inputRef={searchInputRef} className="w-full" />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(true);
                    setTimeout(() => searchInputRef.current?.focus(), 50);
                  }}
                  className="glass-button group flex h-9 items-center gap-2.5 rounded-full px-3.5 text-muted-foreground"
                  title="Search (press / )"
                >
                  <Search className="h-4 w-4" />
                  <span className="hidden text-[13px] lg:inline">Search anime</span>
                  <kbd className="hidden rounded border border-white/10 bg-white/[0.06] px-1.5 text-[10px] font-medium lg:inline">
                    /
                  </kbd>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Search"
              className="mobile-header-icon md:hidden"
            >
              <Search className="h-[22px] w-[22px]" strokeWidth={2} />
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              className="glass-button grid h-10 w-10 place-items-center rounded-full text-foreground/80 md:hidden"
            >
              {mobileMenuOpen ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>

      </header>

      {/* Menu — a bottom sheet, where the thumb already is. */}
        {mobileMenuOpen && (
          <div className="mobile-sheet-backdrop md:hidden" onClick={() => setMobileMenuOpen(false)}>
            <div className="mobile-sheet space-y-1" role="dialog" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-sheet-grip" aria-hidden />
              <div className="mobile-sheet-grid">
                {PRIMARY_NAV.map((item) => {
                  const { to, label, icon: Icon } = item;
                  const active = isActive(item);
                  return (
                    <Link key={to} to={to} aria-current={active ? 'page' : undefined} className={cn('mobile-sheet-tile', active && 'is-active')}>
                      <Icon className="h-[18px] w-[18px]" />
                      {label}
                    </Link>
                  );
                })}
              </div>

              <div className="fox-divider my-1" />

              <button
                type="button"
                onClick={handleRandom}
                disabled={loadingRandom}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-medium text-foreground/85 transition-colors hover:bg-white/[0.05] disabled:opacity-50"
              >
                {loadingRandom ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin text-[hsl(var(--primary))]" />
                ) : (
                  <Shuffle className="h-[18px] w-[18px] text-[hsl(var(--primary))]" />
                )}
                Surprise me
                <span className="ml-auto text-[11px] text-muted-foreground">A title at random</span>
              </button>

              <div className="fox-divider my-1" />

              {MORE_NAV.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}

              {total > 0 && (
                <div className="mt-1 flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5">
                  <span className="text-[12px] text-muted-foreground">Streaming sources</span>
                  <span className={cn('text-[12px] font-medium', healthy ? 'text-emerald-300' : 'text-amber-300')}>
                    {online}/{total} online
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Mobile search — a full sheet, because typing deserves the whole screen. */}
      {mobileSearchOpen && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-[hsl(234_32%_5%_/_0.97)] backdrop-blur-xl md:hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setMobileSearchOpen(false); }}
        >
          <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 pb-3 pt-4">
            <div className="flex-1">
              <SearchAutocomplete onClose={() => setMobileSearchOpen(false)} className="w-full" isMobile />
            </div>
            <button
              type="button"
              onClick={() => setMobileSearchOpen(false)}
              aria-label="Close search"
              className="glass-button grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Tab bar — four thumb-reachable destinations; search lives in the header. */}
      <nav
        className={cn('mobile-dock md:hidden', dockHidden && !mobileMenuOpen && 'is-hidden')}
        aria-label="Primary"
      >
        {DOCK_NAV.map((item) => {
          const { to, label, icon: Icon } = item;
          const active = isActive(item);
          return (
            <Link key={to} to={to} aria-current={active ? 'page' : undefined} className={cn('mobile-dock-item', active && 'is-active')}>
              <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.8} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.18 : 0} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
};

import { useState, useEffect, useRef, useCallback, useMemo, useTransition } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Shuffle, Play, Star, ChevronRight, Loader2,
  Home, Compass, Calendar, RefreshCw, AlertCircle,
} from 'lucide-react';
import { cn, normalizeRating, ensureHttps } from '@/lib/utils';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { AnimeSlider } from '@/components/home/AnimeSlider';
import { ContinueWatching } from '@/components/home/ContinueWatching';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { apiClient } from '@/lib/api-client';
import {
  useAnilistHomeTrending,
  useAnilistHomeSeasonal,
  useAnilistHomeLatest,
  useAnilistHomeMovies,
  useAnilistHomeAction,
  useAnilistHomeUpcoming,
} from '@/hooks/useAnilistHomeSections';
import { useHeroAnime } from '@/hooks/useHeroAnimeMultiSource';
import { getHeroTitle, formatHeroRating } from '@/hooks/useHeroAnimeMultiSource';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

// ─── Category chips ────────────────────────────────────────────────────────────
const CATEGORIES = [
  { label: 'Action',    link: '/browse?genre=Action' },
  { label: 'Romance',   link: '/browse?genre=Romance' },
  { label: 'Comedy',    link: '/browse?genre=Comedy' },
  { label: 'Drama',     link: '/browse?genre=Drama' },
  { label: 'Sci-Fi',    link: '/browse?genre=Sci-Fi' },
  { label: 'Fantasy',   link: '/browse?genre=Fantasy' },
  { label: 'Horror',    link: '/browse?genre=Horror' },
  { label: 'Sports',    link: '/browse?genre=Sports' },
  { label: 'Slice of Life', link: '/browse?genre=Slice+of+Life' },
  { label: 'Movies',    link: '/browse?type=Movie' },
];

// ─── Bottom nav items ──────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/',         label: 'Home',     Icon: Home    },
  { to: '/browse',   label: 'Browse',   Icon: Compass },
  { to: '/schedule', label: 'Schedule', Icon: Calendar },
] as const;

// ─── Swipeable hero ────────────────────────────────────────────────────────────
function MobileHero({ heroAnime }: { heroAnime: ReturnType<typeof useHeroAnime>['heroAnime'] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [idx, setIdx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const touchStart = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const count = heroAnime.length;

  const go = useCallback((next: number) => {
    if (animating) return;
    setAnimating(true);
    setIdx(((next % count) + count) % count);
    setTimeout(() => setAnimating(false), 350);
  }, [animating, count]);

  // Auto-advance every 7 s
  useEffect(() => {
    if (count <= 1) return;
    intervalRef.current = setInterval(() => go(idx + 1), 7000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [idx, count, go]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
    if (intervalRef.current) clearInterval(intervalRef.current);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? idx + 1 : idx - 1);
    touchStart.current = null;
  };

  if (!heroAnime.length) return null;
  const anime = heroAnime[idx];
  const title = getHeroTitle(anime);
  const rating = formatHeroRating(anime.averageScore);
  const watchPath = anime.source === 'anilist'
    ? `/watch?id=anilist-${anime.id}`
    : `/watch?id=${anime.id}`;
  const bg = ensureHttps(anime.bannerImage || anime.coverImage?.extraLarge || anime.coverImage?.large || '');

  return (
    <div
      className="relative w-full overflow-hidden touch-pan-y select-none"
      style={{ height: 'clamp(240px, 54vw, 320px)' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Background image */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-350',
          animating ? 'opacity-0' : 'opacity-100'
        )}
      >
        {bg ? (
          <img
            src={bg}
            alt=""
            className="w-full h-full object-cover"
            loading="eager"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full bg-zinc-900" />
        )}
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080a0f] via-[#080a0f]/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#080a0f]/60 to-transparent" />
      </div>

      {/* Content */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 px-4 pb-5 transition-all duration-300',
          animating ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
        )}
      >
        {/* Labels */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-fox-orange bg-fox-orange/15 border border-fox-orange/30 px-2 py-0.5 rounded-full">
            Spotlight
          </span>
          {rating && (
            <span className="flex items-center gap-1 text-[10px] text-yellow-400 font-semibold">
              <Star className="w-2.5 h-2.5 fill-current" />{rating}
            </span>
          )}
          {anime.format && (
            <span className="text-[9px] text-zinc-400 font-medium uppercase tracking-wide">
              {anime.format.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-white font-bold text-lg leading-tight line-clamp-2 mb-3 drop-shadow-lg">
          {title}
        </h1>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(watchPath, { state: { from: location.pathname } })}
            className="flex items-center gap-1.5 bg-fox-orange text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg shadow-fox-orange/30 active:scale-95 transition-transform touch-manipulation"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Watch Now
          </button>
          <Link
            to={`/browse?q=${encodeURIComponent(title)}`}
            className="flex items-center gap-1 text-xs text-zinc-300 font-medium px-3 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm active:scale-95 transition-transform touch-manipulation"
          >
            Details <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Dot indicators */}
      {count > 1 && (
        <div className="absolute top-3 right-3 flex gap-1">
          {heroAnime.slice(0, 8).map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              className={cn(
                'rounded-full transition-all duration-300 touch-manipulation',
                i === idx ? 'w-4 h-1.5 bg-fox-orange' : 'w-1.5 h-1.5 bg-white/30'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section row ───────────────────────────────────────────────────────────────
function MobileSection({
  title,
  link,
  linkText = 'See all',
  children,
}: {
  title: string;
  link?: string;
  linkText?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-4">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-4 rounded-full bg-fox-orange shadow-[0_0_6px] shadow-fox-orange/60 shrink-0" />
          <h2 className="text-[13px] font-bold text-white tracking-tight">{title}</h2>
        </div>
        {link && (
          <Link
            to={link}
            className="flex items-center gap-0.5 text-[11px] font-semibold text-zinc-500 hover:text-fox-orange transition-colors touch-manipulation"
          >
            {linkText}<ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="px-4">{children}</div>
    </section>
  );
}

// ─── Skeleton row ──────────────────────────────────────────────────────────────
const SkeletonRow = () => (
  <div className="flex gap-2.5 overflow-hidden px-4">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="w-[7.5rem] shrink-0 aspect-[2/3] rounded-xl bg-white/[0.05] animate-pulse" />
    ))}
  </div>
);

// ─── Compact sticky header ─────────────────────────────────────────────────────
function MobileHeader({ onSearch, onRandom, isLoadingRandom }: {
  onSearch: () => void;
  onRandom: () => void;
  isLoadingRandom: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 flex items-center justify-between px-4 h-12 transition-all duration-200',
        scrolled
          ? 'bg-[#080a0f]/95 backdrop-blur-2xl border-b border-white/[0.06] shadow-lg shadow-black/40'
          : 'bg-transparent'
      )}
    >
      {/* Orange accent line */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-fox-orange/70 to-transparent" />

      {/* Logo */}
      <Link to="/" className="flex items-center gap-1.5 touch-manipulation">
        <div className="w-6 h-6 rounded-lg bg-fox-orange flex items-center justify-center shadow-md shadow-fox-orange/40">
          <Play className="w-3 h-3 text-white fill-white ml-0.5" />
        </div>
        <span className="text-[15px] font-black tracking-tight text-white">AniFox</span>
      </Link>

      {/* Right actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onRandom}
          disabled={isLoadingRandom}
          className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-zinc-400 active:scale-90 transition-transform touch-manipulation disabled:opacity-40"
          aria-label="Random anime"
        >
          {isLoadingRandom
            ? <Loader2 className="w-4 h-4 animate-spin text-fox-orange" />
            : <Shuffle className="w-4 h-4" />}
        </button>
        <button
          onClick={onSearch}
          className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-zinc-400 active:scale-90 transition-transform touch-manipulation"
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

// ─── Bottom nav ────────────────────────────────────────────────────────────────
function MobileBottomNav({ onSearch }: { onSearch: () => void }) {
  const location = useLocation();
  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />
      <div className="absolute inset-0 bg-[#080a0f]/95 backdrop-blur-2xl" />
      <div className="relative flex items-stretch h-14">
        {NAV_ITEMS.map(({ to, label, Icon }) => {
          const active = isActive(to);
          return (
            <Link
              key={to}
              to={to}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 touch-manipulation relative"
            >
              {active && (
                <>
                  <span className="absolute inset-x-3 top-0 h-[2px] rounded-full bg-fox-orange shadow-[0_0_8px_2px] shadow-fox-orange/50" />
                  <span className="absolute inset-x-2 inset-y-1 rounded-xl bg-fox-orange/[0.08]" />
                </>
              )}
              <Icon className={cn('relative w-5 h-5 transition-colors', active ? 'text-fox-orange' : 'text-zinc-500')} />
              <span className={cn('relative text-[10px] font-semibold tracking-wide', active ? 'text-fox-orange' : 'text-zinc-600')}>
                {label}
              </span>
            </Link>
          );
        })}
        <button
          onClick={onSearch}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 touch-manipulation"
        >
          <Search className="relative w-5 h-5 text-zinc-500" />
          <span className="relative text-[10px] font-semibold tracking-wide text-zinc-600">Search</span>
        </button>
      </div>
    </div>
  );
}

// ─── Mobile search overlay ─────────────────────────────────────────────────────
function MobileSearchOverlay({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) { navigate(`/browse?q=${encodeURIComponent(q.trim())}`); onClose(); }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-[#080a0f]/97 backdrop-blur-2xl flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form onSubmit={submit} className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 border-b border-white/[0.07]">
        <div className="flex-1 flex items-center gap-2 bg-white/[0.06] border border-white/[0.1] rounded-2xl px-3 h-11">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search anime..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-semibold text-zinc-400 touch-manipulation px-2"
        >
          Cancel
        </button>
      </form>

      {/* Quick links */}
      <div className="px-4 pt-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">Browse by genre</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link
              key={c.label}
              to={c.link}
              onClick={onClose}
              className="text-xs font-medium text-zinc-300 bg-white/[0.06] border border-white/[0.08] px-3 py-1.5 rounded-full active:scale-95 transition-transform touch-manipulation"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
const isHentai = (a: { title?: string | null; id?: string | null; genres?: (string | null)[] | null } | null) => {
  if (!a) return false;
  const t = String(a.title ?? '').toLowerCase();
  const id = String(a.id ?? '').toLowerCase();
  const g = (a.genres ?? []).filter((x): x is string => x != null).map(x => x.toLowerCase());
  return t.includes('hentai') || id.includes('hanime') || g.includes('hentai') || g.includes('adult');
};

export const MobileHome = () => {
  useDocumentTitle('Home');
  const navigate = useNavigate();
  const location = useLocation();
  const { isLandscape } = useBreakpoint();
  const [searchOpen, setSearchOpen] = useState(false);
  const [isLoadingRandom, setIsLoadingRandom] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { heroAnime } = useHeroAnime();
  const { history, removeFromHistory } = useWatchHistory();
  const { data: trendingAnime, isLoading: trendingLoading, refetch: refetchTrending } = useAnilistHomeTrending(20);
  const { currentSeasonLabel, currentSeasonApi, currentSeasonYear } = useMemo(() => {
    const now = new Date(); const m = now.getMonth(); const y = now.getFullYear();
    if (m <= 1)  return { currentSeasonLabel: `Winter ${y}`,     currentSeasonApi: 'WINTER', currentSeasonYear: y };
    if (m <= 4)  return { currentSeasonLabel: `Spring ${y}`,     currentSeasonApi: 'SPRING', currentSeasonYear: y };
    if (m <= 7)  return { currentSeasonLabel: `Summer ${y}`,     currentSeasonApi: 'SUMMER', currentSeasonYear: y };
    if (m <= 10) return { currentSeasonLabel: `Fall ${y}`,       currentSeasonApi: 'FALL',   currentSeasonYear: y };
    return       { currentSeasonLabel: `Winter ${y + 1}`, currentSeasonApi: 'WINTER', currentSeasonYear: y + 1 };
  }, []);
  const { data: seasonalData,  isLoading: seasonalLoading,  refetch: refetchSeasonal } = useAnilistHomeSeasonal(currentSeasonYear, currentSeasonApi, true);
  const { data: latestAnime,   isLoading: latestLoading,    refetch: refetchLatest  } = useAnilistHomeLatest(20);
  const { data: moviesData,    isLoading: moviesLoading,    refetch: refetchMovies  } = useAnilistHomeMovies(16);
  const { data: actionData,    isLoading: actionLoading                             } = useAnilistHomeAction(16);
  const { data: upcomingData                                                         } = useAnilistHomeUpcoming(16);

  const { dedupTrending, dedupSeasonal, dedupLatest, dedupMovies, dedupAction, dedupUpcoming } = useMemo(() => {
    const used = new Set<string>();
    const unique = <T extends { id: string }>(list: T[]) =>
      list.filter(x => { if (used.has(x.id)) return false; used.add(x.id); return true; });
    const safe = <T extends { title?: string | null; id?: string | null; genres?: (string | null)[] | null }>(list: T[]) =>
      list.filter(x => !isHentai(x));
    return {
      dedupTrending:  unique(safe(trendingAnime?.filter(a => a.status !== 'Upcoming') ?? [])),
      dedupSeasonal:  unique(safe(seasonalData?.results ?? [])),
      dedupLatest:    unique(safe(latestAnime ?? [])),
      dedupMovies:    unique(safe(moviesData?.results ?? [])),
      dedupAction:    unique(safe(actionData?.results ?? [])),
      dedupUpcoming:  unique(safe(upcomingData?.results ?? [])),
    };
  }, [trendingAnime, seasonalData, latestAnime, moviesData, actionData, upcomingData]);

  const handleRandom = async () => {
    setIsLoadingRandom(true);
    try {
      const r = await apiClient.getRandomAnime();
      if (r) navigate(`/watch?id=${encodeURIComponent(r.id)}`, { state: { from: location.pathname } });
    } finally { setIsLoadingRandom(false); }
  };

  const EmptyRow = ({ onRetry }: { onRetry: () => void }) => (
    <div className="flex items-center gap-2 px-4 py-2 text-xs text-zinc-600">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      <span>Couldn't load — server may be waking up.</span>
      <button onClick={onRetry} className="ml-auto flex items-center gap-1 text-zinc-500 hover:text-white touch-manipulation">
        <RefreshCw className="w-3 h-3" />Retry
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080a0f] text-foreground">

      {/* Compact header */}
      <MobileHeader
        onSearch={() => setSearchOpen(true)}
        onRandom={handleRandom}
        isLoadingRandom={isLoadingRandom}
      />

      {/* Hero — hide in landscape to save screen height */}
      {!isLandscape && <MobileHero heroAnime={heroAnime} />}

      {/* Category chips */}
      <div className="px-4 mt-4 mb-1">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4"
          style={{ scrollbarWidth: 'none' }}>
          {CATEGORIES.map((c) => (
            <Link
              key={c.label}
              to={c.link}
              className="shrink-0 text-[11px] font-semibold text-zinc-300 bg-white/[0.05] border border-white/[0.08] px-3 py-1.5 rounded-full active:scale-95 transition-transform touch-manipulation whitespace-nowrap hover:border-fox-orange/40 hover:text-fox-orange"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Main feed */}
      <main
        className="space-y-5 pt-3"
        style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom) + 8px)' }}
      >
        {/* Continue Watching */}
        {history.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2 px-4">
              <div className="flex items-center gap-2">
                <span className="w-[3px] h-4 rounded-full bg-fox-orange shadow-[0_0_6px] shadow-fox-orange/60 shrink-0" />
                <h2 className="text-[13px] font-bold text-white">Continue Watching</h2>
              </div>
            </div>
            <div className="px-4">
              <ContinueWatching items={history} onRemove={removeFromHistory} />
            </div>
          </section>
        )}

        {/* Trending */}
        <MobileSection title="Trending Now" link="/browse?sort=trending" linkText="All">
          {trendingLoading
            ? <SkeletonRow />
            : dedupTrending.length > 0
              ? <AnimeSlider anime={dedupTrending.slice(0, 16)} cardSize="md" />
              : <EmptyRow onRetry={refetchTrending} />}
        </MobileSection>

        {/* This Season */}
        <MobileSection title={currentSeasonLabel} link="/browse?status=ongoing" linkText="Browse">
          {seasonalLoading
            ? <SkeletonRow />
            : dedupSeasonal.length > 0
              ? <AnimeSlider anime={dedupSeasonal.slice(0, 16)} cardSize="md" />
              : <EmptyRow onRetry={refetchSeasonal} />}
        </MobileSection>

        {/* Latest */}
        <MobileSection title="Latest Episodes" link="/browse?sort=recently_released" linkText="More">
          {latestLoading
            ? <SkeletonRow />
            : dedupLatest.length > 0
              ? <AnimeSlider anime={dedupLatest.slice(0, 16)} cardSize="md" />
              : <EmptyRow onRetry={refetchLatest} />}
        </MobileSection>

        {/* Action */}
        <MobileSection title="Action Anime" link="/browse?genre=Action" linkText="All">
          {actionLoading
            ? <SkeletonRow />
            : dedupAction.length > 0
              ? <AnimeSlider anime={dedupAction.slice(0, 16)} cardSize="md" />
              : <EmptyRow onRetry={() => {}} />}
        </MobileSection>

        {/* Movies */}
        <MobileSection title="Popular Movies" link="/browse?type=Movie" linkText="All">
          {moviesLoading
            ? <SkeletonRow />
            : dedupMovies.length > 0
              ? <AnimeSlider anime={dedupMovies.slice(0, 16)} cardSize="md" />
              : <EmptyRow onRetry={refetchMovies} />}
        </MobileSection>

        {/* Upcoming */}
        {dedupUpcoming.length > 0 && (
          <MobileSection title="Coming Soon" link="/browse?status=upcoming" linkText="All">
            <AnimeSlider anime={dedupUpcoming.slice(0, 16)} cardSize="sm" />
          </MobileSection>
        )}
      </main>

      {/* Bottom nav */}
      <MobileBottomNav onSearch={() => setSearchOpen(true)} />

      {/* Search overlay */}
      {searchOpen && <MobileSearchOverlay onClose={() => setSearchOpen(false)} />}
    </div>
  );
};

export default MobileHome;

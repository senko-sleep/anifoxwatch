import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Shuffle, Play, Star, ChevronRight, Loader2,
  Home, Compass, Calendar, RefreshCw, AlertCircle,
  Sparkles, Captions, Clock,
} from 'lucide-react';
import { cn, ensureHttps, normalizeAnimeGenresForDisplay } from '@/lib/utils';
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

// ─── Cinematic mobile hero ────────────────────────────────────────────────────
const FILM_GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

function MobileHero({ heroAnime }: { heroAnime: ReturnType<typeof useHeroAnime>['heroAnime'] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLandscape } = useBreakpoint();
  const [idx, setIdx]           = useState(0);
  const [prevIdx, setPrevIdx]   = useState<number | null>(null);
  const [contentVisible, setContentVisible] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPaused = useRef(false);

  const count = heroAnime.length;

  const go = useCallback((next: number) => {
    const n = ((next % count) + count) % count;
    if (n === idx) return;
    setContentVisible(false);
    setPrevIdx(idx);
    setIdx(n);
    setTimeout(() => setContentVisible(true), 100);
    setTimeout(() => setPrevIdx(null), 600);
  }, [idx, count]);

  // Auto-advance every 8 s
  useEffect(() => {
    if (count <= 1) return;
    const tick = () => { if (!isPaused.current) go(idx + 1); };
    intervalRef.current = setInterval(tick, 8000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [idx, count, go]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isPaused.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    // Only swipe if horizontal movement dominates
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 36) {
      go(dx < 0 ? idx + 1 : idx - 1);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    setTimeout(() => { isPaused.current = false; }, 1000);
  };

  if (!heroAnime.length) return null;

  const anime     = heroAnime[idx];
  const title     = getHeroTitle(anime);
  const rating    = formatHeroRating(anime.averageScore);
  const watchPath = anime.source === 'anilist' ? `/watch?id=anilist-${anime.id}` : `/watch?id=${anime.id}`;
  const bannerSrc = ensureHttps(anime.bannerImage || anime.coverImage?.extraLarge || anime.coverImage?.large || '');
  const posterSrc = ensureHttps(anime.coverImage?.large || anime.coverImage?.extraLarge || '');
  const formatLabel = (anime.format || 'TV').replace(/_/g, ' ');
  const seasonLabel = [anime.season, anime.seasonYear].filter(Boolean).join(' ');
  const epCount = anime.episodes != null && anime.episodes > 0 ? `${anime.episodes} eps` : null;
  const runtime = anime.duration != null && anime.duration > 0 ? `${anime.duration}m` : null;
  const genres = normalizeAnimeGenresForDisplay(anime.genres).slice(0, 3);

  return (
    <div
      className="relative w-full overflow-hidden select-none bg-[#0c0e14]"
      style={{ height: isLandscape ? 'clamp(200px, 44vh, 300px)' : 'clamp(280px, 64vw, 420px)' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Background slides ─────────────────────────────────── */}
      {heroAnime.map((a, i) => {
        const bg = ensureHttps(a.bannerImage || a.coverImage?.extraLarge || a.coverImage?.large || '');
        const isActive = i === idx;
        const isPrev   = i === prevIdx;
        if (!isActive && !isPrev) return null;
        return (
          <div
            key={a.id}
            className={cn(
              'absolute inset-0 transition-opacity duration-600',
              isActive ? 'opacity-100 z-[1]' : 'opacity-0 z-[0]'
            )}
          >
            {bg ? (
              <img
                src={bg}
                alt=""
                className="w-full h-full object-cover object-top"
                loading={i === 0 ? 'eager' : 'lazy'}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-zinc-900" />
            )}
          </div>
        );
      })}

      {/* ── Gradient layers (matching desktop) ───────────────── */}
      <div className="absolute inset-0 z-[2] pointer-events-none">
        {/* Bottom fade — strong for text legibility */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #080a0f 0%, #080a0f90 28%, transparent 65%)' }} />
        {/* Left fade */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#080a0f]/80 via-[#080a0f]/30 to-transparent" />
        {/* Top edge */}
        <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-[#080a0f]/60 to-transparent" />
        {/* Right vignette (leaves room for poster) */}
        <div className="absolute inset-y-0 right-0 w-2/5 bg-gradient-to-l from-[#080a0f]/60 via-transparent to-transparent" />
      </div>

      {/* ── Film grain ────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0 z-[3] opacity-[0.055] mix-blend-overlay"
        style={{ backgroundImage: FILM_GRAIN }}
      />

      {/* ── Orange accent glow ────────────────────────────────── */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 z-[3] w-[70%] h-[50%] opacity-[0.20]"
        style={{ background: 'radial-gradient(ellipse at 20% 100%, hsl(28 95% 55% / 1) 0%, transparent 65%)' }}
      />

      {/* ── Poster card (right) ───────────────────────────────── */}
      <div
        className={cn(
          'absolute right-4 bottom-8 z-[5] w-[80px] aspect-[2/3] rounded-xl overflow-hidden shadow-2xl shadow-black/70 ring-1 ring-white/10 transition-all duration-500',
          contentVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-3'
        )}
        onClick={() => navigate(watchPath, { state: { from: location.pathname } })}
      >
        {posterSrc ? (
          <img src={posterSrc} alt={title} className="w-full h-full object-cover" loading="eager" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full bg-zinc-800" />
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/0 active:bg-black/40 transition-colors flex items-center justify-center">
          <div className="w-7 h-7 rounded-full bg-fox-orange/90 flex items-center justify-center shadow-lg shadow-fox-orange/40 opacity-0 active:opacity-100 transition-opacity">
            <Play className="w-3.5 h-3.5 fill-white text-white" />
          </div>
        </div>
        {rating && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[9px] font-bold text-amber-300">
            <Star className="w-2 h-2 fill-amber-400 text-amber-400" />{rating}
          </div>
        )}
      </div>

      {/* ── Content panel ─────────────────────────────────────── */}
      <div
        className={cn(
          'absolute bottom-0 left-0 z-[5] px-4 pb-4 pr-[108px] transition-all duration-500 ease-out',
          contentVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        )}
      >
        {/* Spotlight + season */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.22em] text-fox-orange">
            <Sparkles className="w-2.5 h-2.5 text-fox-orange/80" />
            Spotlight
          </span>
          {seasonLabel && (
            <>
              <span className="text-zinc-700 text-[9px]">·</span>
              <span className="text-[9px] text-zinc-500 uppercase tracking-wide">{seasonLabel}</span>
            </>
          )}
        </div>

        {/* Title */}
        <h1
          className="font-display text-[17px] font-bold leading-[1.2] tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)] mb-2"
          style={{ textWrap: 'balance' } as React.CSSProperties}
        >
          {title}
        </h1>

        {/* Metadata badges */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {rating && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/30 bg-amber-950/50 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 backdrop-blur-sm">
              <Star className="w-2 h-2 fill-amber-400 text-amber-400" />{rating}
            </span>
          )}
          <span className="rounded-full border border-white/[0.1] bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-200 backdrop-blur-sm">
            {formatLabel}
          </span>
          <span className="inline-flex items-center gap-0.5 rounded-full border border-sky-500/25 bg-sky-950/30 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-300">
            <Captions className="w-2 h-2" />Sub
          </span>
          {epCount && (
            <span className="rounded-full border border-white/[0.07] bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-zinc-400">
              {epCount}
            </span>
          )}
          {runtime && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-white/[0.07] bg-black/30 px-1.5 py-0.5 text-[9px] text-zinc-400">
              <Clock className="w-2 h-2 opacity-60" />{runtime}
            </span>
          )}
        </div>

        {/* Genre tags */}
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {genres.map(g => (
              <span key={g} className="rounded border border-fox-orange/20 bg-fox-orange/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-200/90">
                {g}
              </span>
            ))}
          </div>
        )}

        {/* CTA buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(watchPath, { state: { from: location.pathname } })}
            className="flex items-center gap-1.5 bg-fox-orange text-white text-xs font-bold h-8 px-4 rounded-full shadow-lg shadow-fox-orange/35 ring-1 ring-white/10 active:scale-95 transition-transform touch-manipulation"
          >
            <Play className="w-3 h-3 fill-white" />
            Watch Now
          </button>
          <button
            onClick={() => navigate(`/browse?q=${encodeURIComponent(title)}`)}
            className="flex items-center gap-1 text-xs font-medium text-zinc-200 h-8 px-3 rounded-full border border-white/[0.12] bg-white/[0.06] backdrop-blur-sm active:scale-95 transition-transform touch-manipulation"
          >
            Details<ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Slide dots (bottom-center) ────────────────────────── */}
      {count > 1 && (
        <div className="absolute bottom-0 inset-x-0 z-[6] flex items-center justify-center gap-0.5 pb-1">
          {heroAnime.slice(0, 12).map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              className="p-1.5 touch-manipulation flex items-center justify-center"
              aria-label={`Slide ${i + 1}`}
            >
              <span className={cn(
                'block rounded-full transition-all duration-300',
                i === idx
                  ? 'w-5 h-1 bg-fox-orange shadow-[0_0_5px_1px] shadow-fox-orange/60'
                  : 'w-1 h-1 bg-white/25'
              )} />
            </button>
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

      {/* Hero */}
      <MobileHero heroAnime={heroAnime} />

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

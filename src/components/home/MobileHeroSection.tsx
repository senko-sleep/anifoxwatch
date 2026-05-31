import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Star, Sparkles, Captions, Film } from 'lucide-react';
import { cn, ensureHttps, pickAnimePoster } from '@/lib/utils';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useHeroAnime, getHeroTitle, formatHeroRating } from '@/hooks/useHeroAnimeMultiSource';

const FILM_GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

export function MobileHero({ heroAnime }: { heroAnime: ReturnType<typeof useHeroAnime>['heroAnime'] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLandscape } = useBreakpoint();

  const slides = useMemo(
    () => heroAnime.filter(a => !!(a.bannerImage || a.coverImage?.extraLarge || a.coverImage?.large)),
    [heroAnime]
  );

  const [idx, setIdx]         = useState(0);
  const [prevIdx, setPrevIdx] = useState<number | null>(null);
  const [panelVisible, setPanelVisible] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPaused    = useRef(false);
  const count = slides.length;

  const go = useCallback((next: number) => {
    if (count === 0) return;
    const n = ((next % count) + count) % count;
    if (n === idx) return;
    setPanelVisible(false);
    setPrevIdx(idx);
    setIdx(n);
    setTimeout(() => setPanelVisible(true), 120);
    setTimeout(() => setPrevIdx(null), 650);
  }, [idx, count]);

  useEffect(() => {
    if (idx >= count && count > 0) setIdx(0);
  }, [count, idx]);

  useEffect(() => {
    if (count <= 1) return;
    const tick = () => { if (!isPaused.current) go(idx + 1); };
    intervalRef.current = setInterval(tick, 8000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [idx, count, go]);

  useEffect(() => {
    const onVis = () => { isPaused.current = document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

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
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 36) go(dx < 0 ? idx + 1 : idx - 1);
    touchStartX.current = null;
    touchStartY.current = null;
    setTimeout(() => { isPaused.current = false; }, 1000);
  };

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (!slides.length) {
    return (
      <div className="mx-4">
        <div
          className="rounded-2xl shimmer bg-zinc-900 border border-white/[0.06]"
          style={{ aspectRatio: '16 / 9' }}
        />
        <div style={{ height: '24px' }} />
      </div>
    );
  }

  const anime       = slides[idx];
  const title       = getHeroTitle(anime);
  const rating      = formatHeroRating(anime.averageScore);
  const watchPath   = anime.source === 'anilist' ? `/watch?id=anilist-${anime.id}` : `/watch?id=${anime.id}`;
  const formatLabel = (anime.format || 'TV').replace(/_/g, ' ');
  const seasonLabel = [anime.season, anime.seasonYear].filter(Boolean).join(' ');
  const epCount     = anime.episodes != null && anime.episodes > 0 ? `${anime.episodes} eps` : null;
  const posterSrc = (() => {
    if (anime.coverImage && typeof anime.coverImage === 'object') {
      return anime.coverImage.extraLarge || anime.coverImage.large || '';
    }
    return pickAnimePoster(anime as any);
  })();

  // Strip HTML and clean description
  const cleanDescription = (() => {
    if (!anime.description) return '';
    let desc = anime.description.replace(/<[^>]*>/g, '').trim();
    desc = desc
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    return desc;
  })();

  const displayDescription = (() => {
    if (cleanDescription && cleanDescription.length > 10) return cleanDescription;
    const g = anime.genres && Array.isArray(anime.genres)
      ? anime.genres.slice(0, 3).join(', ')
      : '';
    return g
      ? `${title} — A premium ${g} anime. Follow the journey on AniFox.`
      : `${title} — Start watching now on AniFox.`;
  })();

  return (
    <div
      className="mx-4 select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── CARD — Widescreen display box with aspect ratio 16/9 ─────────────────── */}
      <div
        className="relative rounded-2xl overflow-hidden bg-zinc-900 border border-white/[0.06] shadow-2xl shadow-black/80"
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured anime"
        style={{
          aspectRatio: '16 / 9',
          overscrollBehaviorX: 'contain',
          touchAction: 'pan-y',
        }}
      >
        {/* ── Background slides — absolute crossfade ─────────────── */}
        {slides.map((a, i) => {
          const bg = ensureHttps(a.bannerImage || a.coverImage?.extraLarge || a.coverImage?.large || '');
          const isActive = i === idx;
          const isPrev   = i === prevIdx;
          if (!isActive && !isPrev) return null;
          return (
            <div
              key={a.id}
              className={cn(
                'absolute inset-0 transition-opacity duration-[600ms] will-change-[opacity]',
                isActive ? 'opacity-100 z-[1]' : 'opacity-0 z-[0]'
              )}
              aria-hidden={!isActive}
            >
              <img
                src={bg}
                alt=""
                className="w-full h-full object-cover"
                style={{ objectPosition: 'center 20%' }}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                referrerPolicy="no-referrer"
                draggable={false}
              />
            </div>
          );
        })}

        {/* Deep bottom-heavy cinematic overlay for clear content contrast */}
        <div
          className="pointer-events-none absolute inset-0 z-[2]"
          style={{
            background: 'linear-gradient(to bottom, rgba(10,10,15,0.3) 0%, rgba(10,10,15,0.7) 40%, rgba(8,10,15,0.96) 72%, #080a0f 100%)',
          }}
        />

        {/* Film grain */}
        <div
          className="pointer-events-none absolute inset-0 z-[3] opacity-[0.04] mix-blend-overlay"
          style={{ backgroundImage: FILM_GRAIN }}
        />

        {/* Subtle warm accent glow at bottom-left */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 z-[3] w-[60%] h-[60%] opacity-[0.12]"
          style={{ background: 'radial-gradient(ellipse at 0% 100%, hsl(28 95% 55% / 1) 0%, transparent 65%)' }}
        />

        {/* ── SPOTLIGHT badge — top left ─────────────────────────────────── */}
        <div className="absolute top-[10px] left-[12px] z-[4] flex items-center gap-1 bg-black/45 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/[0.04]">
          <span className="flex items-center gap-0.5 text-[7.5px] font-bold uppercase tracking-[0.18em] text-fox-orange drop-shadow-sm">
             <Sparkles className="w-2 h-2" />Spotlight
          </span>
          {seasonLabel && (
             <span className="text-[7.5px] text-white/50 font-medium uppercase tracking-wide">
              · {seasonLabel}
            </span>
          )}
        </div>

        {/* ── CONTENT CONTAINER — bottom anchored info pane ─────────── */}
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-[4] flex gap-3 items-end transition-all duration-300 ease-out p-3 pb-2.5 pt-8',
            panelVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          )}
        >
          {/* Left side: Mini Portrait Cover Card */}
          <div className="w-[62px] shrink-0 aspect-[2/3] rounded-lg overflow-hidden shadow-lg border border-white/10 relative bg-zinc-950 flex-none z-10">
            {posterSrc ? (
              <img
                src={ensureHttps(posterSrc)}
                alt={title}
                className="w-full h-full object-cover"
                loading="eager"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                <Film className="w-4 h-4 text-zinc-700" />
              </div>
            )}
          </div>

          {/* Right side: Title, Sleek Badges, and Description */}
          <div className="flex-1 flex flex-col justify-end min-w-0">
            <h1
              className="font-display font-black text-white leading-tight mb-1 tracking-tight text-shadow"
              style={{
                fontSize: 'clamp(11px, 3.8vw, 13px)',
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {title}
            </h1>

            {/* Makeover: Black & Sleek Unified Badges Container */}
            <div className="bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-md rounded-lg py-1 px-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 shadow-sm w-full mb-1">
              {rating && (
                <>
                  <span className="flex items-center gap-0.5 text-[7.5px] font-extrabold text-amber-400">
                    <Star className="w-2 h-2 fill-amber-400 text-amber-400" />
                    {rating}
                  </span>
                  <span className="w-px h-2 bg-zinc-800" />
                </>
              )}
              <span className="text-[7.5px] font-bold text-zinc-300 uppercase tracking-wider">
                {formatLabel}
              </span>
              {epCount && (
                <>
                  <span className="w-px h-2 bg-zinc-800" />
                  <span className="text-[7.5px] font-semibold text-zinc-400">
                    {epCount}
                  </span>
                </>
              )}
              <span className="w-px h-2 bg-zinc-800" />
              <span className="flex items-center gap-0.5 text-[7.5px] font-semibold text-sky-400">
                <Captions className="w-2 h-2 text-sky-400" />
                Sub+Dub
              </span>
            </div>

            {/* Description Synopsis next to the card/details */}
            <p className="text-[9.5px] text-zinc-400 line-clamp-2 leading-relaxed font-medium">
              {displayDescription}
            </p>
          </div>
        </div>
      </div>

      {/* Watch Now Button below the 16/9 hero card */}
      <div className="mt-3">
        <button
          onClick={() => navigate(watchPath, { state: { from: location.pathname } })}
          className="w-full h-9 bg-gradient-to-r from-fox-orange to-orange-600 hover:from-orange-500 hover:to-orange-700 text-white font-bold rounded-xl shadow-md shadow-fox-orange/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider touch-manipulation"
        >
          <Play className="w-3 h-3 fill-white text-white" />
          Watch Now
        </button>
      </div>

      {/* ── Pagination dots — outside card ───────────────────────────────────── */}
      {count > 1 && (
        <div
           className="flex items-center justify-center"
           style={{ marginTop: '8px', marginBottom: '2px' }}
          role="tablist"
          aria-label="Slide navigation"
        >
          {slides.slice(0, 8).map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Slide ${i + 1}`}
              aria-selected={i === idx}
              role="tab"
              className="touch-manipulation"
              style={{ margin: '0 2.5px', padding: '4px' }}
            >
              <span
                className={cn(
                  'block rounded-full transition-all duration-300',
                  i === idx ? 'bg-fox-orange' : 'bg-white/20'
                )}
                style={{
                  width:  i === idx ? '18px' : '6px',
                  height: '6px',
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
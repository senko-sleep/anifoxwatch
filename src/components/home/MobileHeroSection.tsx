import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Star, Sparkles, Captions } from 'lucide-react';
import { cn, ensureHttps } from '@/lib/utils';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useHeroAnime, getHeroTitle, formatHeroRating } from '@/hooks/useHeroAnimeMultiSource';

const FILM_GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

// ─── Cinematic mobile hero — FIXED ────────────────────────────────────────────
//
// Fixes applied:
//  1. Card uses a flex-column layout instead of pure absolute positioning for
//     the content panel, so the card always grows to fit its content.
//  2. The background image is absolutely positioned behind everything while
//     the foreground content is in normal flow — no more clipping.
//  3. Pagination dots live OUTSIDE the card (below it) so they never overlap
//     buttons and never get clipped by overflow-hidden.
//  4. minHeight is enforced via both the outer wrapper AND the image, so the
//     card never collapses on wide/landscape viewports.
//  5. The gradient overlay now covers the full image height reliably.

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
          className="rounded-2xl shimmer"
          style={{ height: isLandscape ? '260px' : '420px' }}
        />
        {/* dots placeholder */}
        <div style={{ height: '28px' }} />
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

  // FIX: Image height is fixed independently from the card's flex content.
  // The card is now a flex-column; the image section has a fixed height and the
  // content panel sits below it — both in normal flow, not stacked absolutely.
  // This prevents content from ever being clipped or the card from collapsing.
  const imgHeight = isLandscape ? '220px' : '280px';

  return (
    <div className="mx-4 select-none" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

      {/* ── CARD ─────────────────────────────────────────────────────────────── */}
      {/* FIX: removed overflow-hidden from outer wrapper; moved to image section only */}
      <div
        className="relative rounded-2xl bg-zinc-900"
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured anime"
        style={{
          // FIX: no fixed height — card grows with content naturally
          minHeight: isLandscape ? '280px' : '380px',
          overscrollBehaviorX: 'contain',
          touchAction: 'pan-y',
        }}
      >

        {/* ── Image section (clipped independently) ────────────────────────── */}
        <div
          className="relative w-full overflow-hidden rounded-t-2xl"
          style={{ height: imgHeight }}
        >
          {/* Background slides */}
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
                  style={{ objectPosition: 'center top' }}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  draggable={false}
                />
              </div>
            );
          })}

          {/* Gradient: covers full image, fades strongly at bottom into card bg */}
          <div
            className="pointer-events-none absolute inset-0 z-[2]"
            style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 40%, rgba(24,18,12,0.7) 80%, #080a0f 100%)',
            }}
          />

          {/* Film grain */}
          <div
            className="pointer-events-none absolute inset-0 z-[3] opacity-[0.06] mix-blend-overlay"
            style={{ backgroundImage: FILM_GRAIN }}
          />

          {/* Orange glow */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 z-[3] w-full h-[50%] opacity-[0.15]"
            style={{ background: 'radial-gradient(ellipse at 20% 100%, hsl(28 95% 55% / 1) 0%, transparent 60%)' }}
          />

          {/* SPOTLIGHT badge */}
          <div className="absolute top-3 left-4 z-[4] flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] text-fox-orange drop-shadow-md">
              <Sparkles className="w-3 h-3" />Spotlight
            </span>
            {seasonLabel && (
              <span className="text-[10px] text-white/55 uppercase tracking-wide drop-shadow-md">
                · {seasonLabel}
              </span>
            )}
          </div>
        </div>

        {/* ── Content panel — in normal flow, below the image ──────────────── */}
        {/* FIX: This is no longer absolutely positioned. It's a regular flex   */}
        {/* column inside the card, so it always occupies real vertical space   */}
        {/* and can never be clipped or overflow the card boundary.             */}
        <div
          className={cn(
            'flex flex-col transition-all duration-300 ease-out',
            panelVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          )}
          style={{ padding: '14px 16px 16px 16px' }}
        >
          {/* Title */}
          <h1
            className="font-display font-bold leading-[1.2] tracking-tight text-white mb-2.5 drop-shadow-lg"
            style={{
              fontSize: 'clamp(18px, 5vw, 22px)',
              fontWeight: 700,
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              // FIX: clamp to 2 lines max so very long titles don't blow up layout
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </h1>

          {/* Metadata row — wraps cleanly on narrow screens */}
          <div
            className="flex flex-wrap items-center mb-2 text-[11px]"
            style={{ gap: '6px' }}
          >
            {rating && (
              <span className="inline-flex items-center gap-1 font-bold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-full">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />{rating}
              </span>
            )}
            <span className="font-semibold uppercase tracking-wide text-white/70 bg-white/10 px-2 py-0.5 rounded-full">
              {formatLabel}
            </span>
            {epCount && (
              <span className="text-zinc-400 bg-white/[0.07] px-2 py-0.5 rounded-full">{epCount}</span>
            )}
            {seasonLabel && (
              <span className="text-zinc-400 bg-white/[0.07] px-2 py-0.5 rounded-full">{seasonLabel}</span>
            )}
          </div>

          {/* Sub+Dub badge — always its own row */}
          <div className="flex items-center mb-3">
            <span className="inline-flex items-center gap-0.5 font-semibold text-sky-300 bg-sky-400/10 px-2 py-0.5 rounded-full text-[11px]">
              <Captions className="w-3 h-3" />Sub+Dub
            </span>
          </div>

          {/* CTA button */}
          <button
            onClick={() => navigate(watchPath, { state: { from: location.pathname } })}
            className="flex items-center justify-center gap-2 bg-fox-orange text-white text-[13px] font-bold rounded-2xl shadow-lg shadow-fox-orange/40 active:scale-[0.97] transition-transform touch-manipulation w-full"
            style={{ minHeight: '48px' }}
          >
            <Play className="w-4 h-4 fill-white" />Watch Now
          </button>
        </div>
      </div>

      {/* ── Pagination dots — OUTSIDE the card so they never clip ────────────── */}
      {/* FIX: Moved from inside the absolute content panel to outside the card  */}
      {count > 1 && (
        <div
          className="flex items-center justify-center"
          style={{ marginTop: '10px', marginBottom: '2px' }}
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
              style={{ margin: '0 3px', padding: '4px' }} // extra tap area
            >
              <span
                className={cn(
                  'block rounded-full transition-all duration-300',
                  i === idx ? 'bg-fox-orange' : 'bg-white/30'
                )}
                style={{
                  width:  i === idx ? '20px' : '7px',  // active dot stretches to pill
                  height: '7px',
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
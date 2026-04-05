import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Play, Star, Clock, Captions, Mic, Sparkles, BookmarkPlus, ChevronRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, normalizeAnimeGenresForDisplay, isPlaceholderAnimeDescription } from '@/lib/utils';
import { apiUrl } from '@/lib/api-config';
import {
  HeroAnime,
  getHeroTitle,
  getStudioName,
  formatHeroRating,
  getSeasonLabel,
} from '@/hooks/useHeroAnimeMultiSource';

interface HeroSectionProps {
  heroAnime: HeroAnime[];
}

const SLIDE_DURATION_MS = 18000;
const TRANSITION_DURATION_MS = 700;

function heroSynopsis(anime: HeroAnime): string {
  const raw = anime.description?.replace(/\s+/g, ' ').trim() || '';
  if (raw && !isPlaceholderAnimeDescription(raw)) return raw;
  const title = getHeroTitle(anime);
  const g = normalizeAnimeGenresForDisplay(anime.genres).slice(0, 4).join(', ');
  return g
    ? `${title} — ${g}. One of the season's most talked-about shows.`
    : `${title} — dive in and start watching.`;
}

export const HeroSection = ({ heroAnime }: HeroSectionProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [_progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [contentVisible, setContentVisible] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();
  const progressRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const anime = heroAnime[currentIndex];
  const count = heroAnime.length;

  useEffect(() => {
    heroAnime.slice(0, 5).forEach((a) => {
      if (a.bannerImage) {
        const img = new Image();
        img.src = a.bannerImage;
      }
    });
  }, [heroAnime]);

  const goToSlide = useCallback((index: number) => {
    if (index === currentIndex) return;
    setContentVisible(false);
    setPrevIndex(currentIndex);
    setCurrentIndex(index);
    progressRef.current = 0;
    setProgress(0);
    setTimeout(() => setContentVisible(true), 120);
    setTimeout(() => setPrevIndex(null), TRANSITION_DURATION_MS);
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    goToSlide((currentIndex + 1) % count);
  }, [currentIndex, count, goToSlide]);

  useEffect(() => {
    if (isPaused || count <= 1) return;
    lastTimeRef.current = performance.now();
    progressRef.current = 0;

    const tick = (now: number) => {
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;
      progressRef.current += delta;
      setProgress(Math.min((progressRef.current / SLIDE_DURATION_MS) * 100, 100));
      if (progressRef.current >= SLIDE_DURATION_MS) {
        handleNext();
        return;
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [currentIndex, isPaused, count, handleNext]);

  if (!anime) return null;

  const title = getHeroTitle(anime);
  const studio = getStudioName(anime);
  const rating = formatHeroRating(anime.averageScore);
  const seasonLabel = getSeasonLabel(anime.season, anime.seasonYear);
  const watchPath =
    anime.source === 'anilist'
      ? `/watch?id=${encodeURIComponent(`anilist-${anime.id}`)}`
      : `/watch?id=${encodeURIComponent(String(anime.id))}`;

  const formatLabel = (anime.format || 'TV').replace(/_/g, ' ');
  const runtimeLabel =
    anime.duration != null && anime.duration > 0 ? `${anime.duration} min` : null;
  const epCountLabel = anime.episodes != null && anime.episodes > 0 ? `${anime.episodes} eps` : null;

  const displayGenres = useMemo(
    () => normalizeAnimeGenresForDisplay(anime.genres),
    [anime.genres]
  );

  const synopsis = heroSynopsis(anime);
  const posterSrc = anime.coverImage?.extraLarge || anime.coverImage?.large || '';

  return (
    <section className="relative w-full sm:px-4 lg:px-6 pt-0 pb-2 sm:pt-5 sm:pb-5">
      <div
        className={cn(
          'relative mx-auto max-w-7xl overflow-hidden bg-[#0c0e14]',
          'sm:rounded-2xl sm:border sm:border-white/[0.07]',
          'shadow-2xl shadow-black/60'
        )}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {/* Background slides */}
        <div className="relative w-full h-[52vw] min-h-[320px] max-h-[600px] sm:h-[46vw] sm:min-h-[400px] md:max-h-[560px] lg:h-[42vw] lg:max-h-[640px] xl:h-[38vw] xl:max-h-[680px]">

          {heroAnime.map((a, idx) => {
            const isActive = idx === currentIndex;
            const isPrev = idx === prevIndex;
            const show = isActive || isPrev;
            return (
              <HeroSlideBg
                key={a.id}
                anime={a}
                idx={idx}
                isActive={isActive}
                isPrev={isPrev}
                show={show}
              />
            );
          })}

          {/* Film grain */}
          <div
            className="pointer-events-none absolute inset-0 z-[3] opacity-[0.06] mix-blend-overlay"
            aria-hidden
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            }}
          />

          {/* Gradient layers */}
          <div className="pointer-events-none absolute inset-0 z-[4]">
            {/* Strong left fade for text legibility */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0c0e14] via-[#0c0e14]/80 sm:via-[#0c0e14]/65 to-transparent" />
            {/* Bottom fade */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e14] via-[#0c0e14]/40 to-transparent" style={{ background: 'linear-gradient(to top, #0c0e14 0%, #0c0e1490 18%, transparent 55%)' }} />
            {/* Right vignette to blend poster */}
            <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[#0c0e14]/70 via-transparent to-transparent" />
            {/* Top edge */}
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#0c0e14]/50 to-transparent" />
          </div>

          {/* Subtle orange accent glow left-bottom */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 z-[4] w-[55%] h-[50%] opacity-[0.18]"
            aria-hidden
            style={{ background: 'radial-gradient(ellipse at 20% 100%, hsl(28 95% 55% / 1) 0%, transparent 65%)' }}
          />

          {/* ── Content panel ─────────────────────────────────────── */}
          <div className="pointer-events-none absolute inset-0 z-[5] flex items-end lg:items-center">
            <div className="w-full flex items-end lg:items-center justify-between px-4 pb-10 sm:px-7 sm:pb-10 lg:px-10 lg:pb-0 gap-4">

              {/* Left: text content */}
              <div
                className={cn(
                  'pointer-events-auto flex flex-col gap-2.5 max-w-[min(30rem,88vw)] sm:max-w-[min(34rem,56%)] lg:max-w-[min(38rem,52%)] xl:max-w-[42rem] transition-all ease-out',
                  contentVisible ? 'translate-y-0 opacity-100 duration-500' : 'translate-y-3 opacity-0 duration-200'
                )}
              >
                {/* Spotlight label */}
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.24em] text-fox-orange sm:text-[10px]">
                    <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-fox-orange/80" />
                    Spotlight
                  </span>
                  {seasonLabel && (
                    <>
                      <span className="text-zinc-700 text-[10px]">·</span>
                      <span className="text-[9px] sm:text-[10px] text-zinc-500 uppercase tracking-wide">{seasonLabel}</span>
                    </>
                  )}
                </div>

                {/* Title */}
                <h1
                  className="font-display text-xl font-bold leading-[1.15] tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.9)] sm:text-2xl md:text-3xl lg:text-[1.9rem] xl:text-[2.2rem]"
                  style={{ textWrap: 'balance' } as CSSProperties}
                >
                  {title}
                </h1>

                {/* Metadata row */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {rating && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-950/50 px-2 py-0.5 text-[10px] font-bold text-amber-300 backdrop-blur-sm sm:text-[11px]">
                      <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                      {rating}
                    </span>
                  )}
                  <span className="rounded-full border border-white/[0.1] bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-200 backdrop-blur-sm sm:text-[11px]">
                    {formatLabel}
                  </span>
                  {runtimeLabel && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-black/30 px-2 py-0.5 text-[10px] text-zinc-300 backdrop-blur-sm sm:text-[11px]">
                      <Clock className="h-2.5 w-2.5 opacity-60" />
                      {runtimeLabel}
                    </span>
                  )}
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300 sm:text-[11px]">
                    4K
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-full border border-sky-500/25 bg-sky-950/30 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-300 sm:text-[11px]">
                    <Captions className="h-2.5 w-2.5" />
                    Sub
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-full border border-green-500/25 bg-green-950/30 px-2 py-0.5 text-[10px] font-bold uppercase text-green-300 sm:text-[11px]">
                    <Mic className="h-2.5 w-2.5" />
                    Dub
                  </span>
                  {epCountLabel && (
                    <span className="rounded-full border border-white/[0.07] bg-white/[0.05] px-2 py-0.5 text-[10px] text-zinc-400 sm:text-[11px]">
                      {epCountLabel}
                    </span>
                  )}
                </div>

                {/* Studio */}
                {studio && (
                  <p className="text-[11px] text-zinc-500 sm:text-xs -mt-0.5">
                    <span className="text-zinc-600">by </span>
                    <span className="text-zinc-400 font-medium">{studio}</span>
                  </p>
                )}

                {/* Genres */}
                {displayGenres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {displayGenres.slice(0, 5).map((g) => (
                      <span
                        key={g}
                        className="rounded-md border border-fox-orange/20 bg-fox-orange/10 px-2 py-0.5 text-[10px] font-medium text-amber-200/90 sm:px-2.5 sm:text-xs"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                {/* Synopsis */}
                <p className="line-clamp-2 text-[12px] leading-relaxed text-zinc-400/90 sm:text-sm max-w-[44ch]">
                  {synopsis}
                </p>

                {/* CTA buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Button
                    onClick={() =>
                      navigate(watchPath, {
                        state: { from: location.pathname + location.search },
                      })
                    }
                    className="h-9 gap-2 rounded-full bg-fox-orange px-5 text-sm font-semibold text-white shadow-lg shadow-fox-orange/30 ring-1 ring-white/10 hover:bg-fox-orange/90 sm:h-10 sm:px-6 transition-all duration-200 hover:scale-[1.03] hover:shadow-fox-orange/45"
                  >
                    <Play className="h-3.5 w-3.5 fill-white" />
                    Watch Now
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 gap-2 rounded-full border-white/[0.12] bg-white/[0.06] px-4 text-sm font-medium text-zinc-200 backdrop-blur-sm hover:bg-white/[0.1] hover:border-white/20 hover:text-white sm:h-10 sm:px-5 transition-all duration-200"
                    onClick={() => navigate(watchPath, { state: { from: location.pathname + location.search } })}
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Watchlist</span>
                  </Button>
                  <Link
                    to="/browse"
                    className="hidden sm:inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Browse all
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

              </div>

              {/* Right: floating poster card */}
              <div
                className={cn(
                  'pointer-events-auto hidden lg:flex flex-col gap-3 shrink-0 transition-all ease-out duration-500',
                  contentVisible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
                )}
              >
                {/* Current poster */}
                <div className="relative w-[140px] xl:w-[158px] aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl shadow-black/70 ring-1 ring-white/10 group/poster cursor-pointer"
                  onClick={() => navigate(watchPath, { state: { from: location.pathname } })}
                >
                  {posterSrc ? (
                    <img
                      src={posterSrc}
                      alt={title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover/poster:scale-105"
                      loading="eager"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-900" />
                  )}
                  {/* Play overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover/poster:bg-black/40 transition-all duration-300 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-fox-orange/90 flex items-center justify-center pl-0.5 scale-0 group-hover/poster:scale-100 transition-transform duration-300 shadow-lg shadow-fox-orange/40">
                      <Play className="w-5 h-5 fill-white text-white" />
                    </div>
                  </div>
                  {rating && (
                    <div className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[10px] font-bold text-amber-300 border border-amber-500/20">
                      <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                      {rating}
                    </div>
                  )}
                </div>

                {/* Up next thumbnails */}
                <div className="flex flex-col gap-1.5 w-[140px] xl:w-[158px]">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Up Next
                  </p>
                  {heroAnime
                    .slice(currentIndex + 1, currentIndex + 3)
                    .concat(currentIndex + 3 > heroAnime.length ? heroAnime.slice(0, Math.max(0, 2 - (heroAnime.length - currentIndex - 1))) : [])
                    .slice(0, 2)
                    .map((a, i) => {
                      const upNextTitle = getHeroTitle(a);
                      const upNextIdx = (currentIndex + 1 + i) % heroAnime.length;
                      return (
                        <button
                          key={a.id}
                          onClick={() => goToSlide(upNextIdx)}
                          className="group/next flex items-center gap-2 rounded-xl overflow-hidden bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-200 p-1.5 text-left"
                        >
                          <div className="w-9 h-12 shrink-0 rounded-lg overflow-hidden">
                            <img
                              src={a.coverImage?.large || a.coverImage?.extraLarge || ''}
                              alt=""
                              className="w-full h-full object-cover group-hover/next:scale-105 transition-transform duration-300"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <p className="text-[10px] font-medium text-zinc-400 group-hover/next:text-zinc-200 line-clamp-2 leading-tight transition-colors">
                            {upNextTitle}
                          </p>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>

          {/* Slide dots — pinned bottom-center */}
          <div className="pointer-events-auto absolute bottom-1 inset-x-0 z-[6] flex items-center justify-center gap-0.5">
            {heroAnime.slice(0, 12).map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => goToSlide(idx)}
                className="p-2 touch-manipulation flex items-center justify-center"
                aria-label={`Slide ${idx + 1}`}
              >
                <span className={cn(
                  'block rounded-full transition-all duration-300',
                  idx === currentIndex
                    ? 'w-5 h-1 bg-fox-orange shadow-[0_0_5px_1px] shadow-fox-orange/60'
                    : 'w-1 h-1 bg-white/25 hover:bg-white/50'
                )} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

function HeroSlideBg({
  anime,
  idx,
  isActive,
  isPrev,
  show,
}: {
  anime: HeroAnime;
  idx: number;
  isActive: boolean;
  isPrev: boolean;
  show: boolean;
}) {
  const candidates = useMemo(() => {
    const b = anime.bannerImage?.trim();
    const c = anime.coverImage?.extraLarge || anime.coverImage?.large || '';
    const out: string[] = [];
    if (b) out.push(b);
    if (c && c !== b) out.push(c);
    if (b) out.push(`${apiUrl('/api/image-proxy')}?url=${encodeURIComponent(b)}`);
    if (c) out.push(`${apiUrl('/api/image-proxy')}?url=${encodeURIComponent(c)}`);
    return [...new Set(out.filter(Boolean))];
  }, [anime.bannerImage, anime.coverImage?.extraLarge, anime.coverImage?.large]);

  const [srcIndex, setSrcIndex] = useState(0);
  useEffect(() => {
    setSrcIndex(0);
  }, [anime.id]);

  const src = candidates[srcIndex] || '';
  const hasBanner = Boolean(anime.bannerImage?.trim());

  return (
    <div
      className="absolute inset-0"
      style={{
        opacity: isActive ? 1 : 0,
        zIndex: isActive ? 2 : isPrev ? 1 : 0,
        transition: show ? `opacity ${TRANSITION_DURATION_MS}ms ease-in-out` : 'none',
        willChange: show ? 'opacity' : 'auto',
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className={cn(
            'h-full w-full object-cover [image-rendering:auto]',
            !hasBanner && 'scale-105 sm:scale-100'
          )}
          sizes="100vw"
          referrerPolicy="no-referrer"
          style={{ objectPosition: hasBanner ? 'center 30%' : 'center 15%' }}
          loading={idx < 3 ? 'eager' : 'lazy'}
          decoding="async"
          onError={() =>
            setSrcIndex((i) => (candidates.length > 0 && i + 1 < candidates.length ? i + 1 : i))
          }
        />
      ) : (
        <div className="h-full w-full bg-zinc-950" />
      )}
    </div>
  );
}

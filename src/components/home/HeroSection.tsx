import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Play, Info, Star, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, stripSourcePrefix } from '@/lib/utils';
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
  const watchId = anime.title.english || anime.title.romaji;
  const watchPath =
    anime.source === 'anilist'
      ? `/watch?id=${encodeURIComponent(`anilist-${anime.id}`)}`
      : `/watch?id=${encodeURIComponent(String(anime.id))}`;

  const formatLabel = (anime.format || 'TV').replace(/_/g, ' ');
  const epMeta =
    anime.episodes != null
      ? `EP ${anime.episodes}${anime.duration != null ? ` · ${anime.duration}m` : ''}`
      : anime.duration != null
        ? `${anime.duration}m`
        : null;

  const handlePrev = useCallback(() => {
    goToSlide((currentIndex - 1 + count) % count);
  }, [currentIndex, count, goToSlide]);

  return (
    <section className="relative w-full sm:px-6 lg:px-8 pt-0 pb-2 sm:pt-7 sm:pb-6">
      <div
        className={cn(
          "relative mx-auto max-w-7xl overflow-hidden bg-zinc-950 shadow-2xl shadow-black/40",
          "sm:rounded-2xl sm:border sm:border-white/[0.06] sm:ring-1 sm:ring-white/[0.04]"
        )}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className="relative w-full h-[340px] sm:h-[520px] md:h-[560px] lg:h-[600px] xl:h-[640px]">
          {heroAnime.map((a, idx) => {
            const isActive = idx === currentIndex;
            const isPrev = idx === prevIndex;
            const show = isActive || isPrev;
            return (
              <div
                key={a.id}
                className="absolute inset-0"
                style={{
                  opacity: isActive ? 1 : 0,
                  zIndex: isActive ? 2 : isPrev ? 1 : 0,
                  transition: show ? `opacity ${TRANSITION_DURATION_MS}ms ease-in-out` : 'none',
                  willChange: show ? 'opacity' : 'auto',
                }}
              >
                <img
                  src={a.bannerImage || a.coverImage.extraLarge}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                  style={{ objectPosition: 'center 30%' }}
                  loading={idx < 3 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              </div>
            );
          })}

          <div className="pointer-events-none absolute inset-0 z-[4]">
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent sm:from-[rgb(0,0,0)] sm:via-black/60 sm:to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/50 sm:from-black/85 sm:via-transparent sm:to-black/35" />
            <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-black/50 to-transparent sm:w-2/5" />
          </div>

          <div className="pointer-events-none absolute inset-0 z-[5] flex flex-col justify-end sm:justify-between">
            <div
              className={cn(
                'pointer-events-auto hidden sm:block px-5 pt-6 sm:px-8 sm:pt-8 lg:px-10 lg:pt-10 transition-all ease-out',
                contentVisible ? 'translate-y-0 opacity-100 duration-500' : '-translate-y-1 opacity-0 duration-200'
              )}
            >
              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-400 sm:text-xs">
                <Link
                  to="/"
                  className="font-medium text-zinc-300 transition-colors hover:text-fox-orange"
                >
                  Home
                </Link>
                <span className="text-zinc-600">|</span>
                <span className="uppercase tracking-wider text-zinc-500">{formatLabel}</span>
                {seasonLabel ? (
                  <>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-500">{seasonLabel}</span>
                  </>
                ) : null}
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-fox-orange/95 sm:text-sm">
                Featured
              </p>
              <h1 className="font-display text-4xl font-bold leading-[1.06] tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.85)] md:text-5xl lg:text-6xl">
                {title}
              </h1>
              {epMeta && (
                <p className="mt-2 text-sm font-medium text-zinc-300">{epMeta}</p>
              )}
              <div
                className="mt-3 flex flex-wrap gap-2"
                title="Typical stream options; availability varies by title."
              >
                <span className="rounded-md bg-emerald-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm sm:text-[11px]">
                  Sub
                </span>
                <span className="rounded-md border border-emerald-400/50 bg-emerald-950/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-100 sm:text-[11px]">
                  HD
                </span>
                <span className="rounded-md bg-emerald-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm sm:text-[11px]">
                  Dub
                </span>
              </div>
            </div>

            <div
              className={cn(
                'pointer-events-auto flex flex-col gap-2 px-4 pb-4 sm:gap-4 sm:px-8 sm:pb-5 lg:px-10 lg:pb-6 transition-all ease-out',
                contentVisible ? 'translate-y-0 opacity-100 duration-500' : 'translate-y-2 opacity-0 duration-200'
              )}
            >
              {/* Mobile-only: compact title + label */}
              <div className="sm:hidden">
                <div className="mb-1 flex flex-wrap items-center gap-x-1.5 text-[10px] text-zinc-400">
                  <Link to="/" className="font-medium text-zinc-300">
                    Home
                  </Link>
                  <span className="text-zinc-600">|</span>
                  <span className="uppercase tracking-wide text-zinc-500">{formatLabel}</span>
                </div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-fox-orange/95">
                  Featured
                </p>
                <h1 className="font-display text-xl font-bold leading-tight tracking-tight text-white drop-shadow-md">
                  {title}
                </h1>
                {epMeta && (
                  <p className="mt-1 text-[11px] font-medium text-zinc-400">{epMeta}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    Sub
                  </span>
                  <span className="rounded border border-emerald-400/50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-100">
                    HD
                  </span>
                  <span className="rounded bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    Dub
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-300 sm:gap-x-2.5 sm:text-sm">
                {rating && (
                  <span className="inline-flex items-center gap-1 font-semibold text-fox-orange sm:gap-1.5">
                    <Star className="h-3 w-3 fill-fox-orange text-fox-orange sm:h-4 sm:w-4" />
                    {rating}
                  </span>
                )}
                {studio && (
                  <>
                    <span className="text-zinc-600">·</span>
                    <span>{studio}</span>
                  </>
                )}
                {!epMeta && anime.episodes && (
                  <>
                    <span className="text-zinc-600">·</span>
                    <span className="inline-flex items-center gap-1 sm:gap-1.5">
                      <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                      {anime.episodes} eps
                    </span>
                  </>
                )}
              </div>

              {anime.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {anime.genres.slice(0, 3).map((g) => (
                    <span
                      key={g}
                      className="rounded-md border border-white/[0.08] bg-white/[0.07] px-2 py-0.5 text-[10px] font-medium text-zinc-300 sm:px-2.5 sm:py-1 sm:text-sm"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              <p className="hidden sm:block line-clamp-2 max-w-xl text-sm leading-relaxed text-zinc-300 sm:line-clamp-3 sm:max-w-2xl sm:text-[0.9375rem]">
                {anime.description || 'Discover this series in the spotlight.'}
              </p>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Button
                  onClick={() =>
                    navigate(watchPath, {
                      state: { from: location.pathname + location.search },
                    })
                  }
                  className="h-9 gap-1.5 rounded-full bg-fox-orange px-5 text-sm font-semibold text-white shadow-lg shadow-fox-orange/25 ring-1 ring-white/10 hover:bg-fox-orange/90 sm:h-11 sm:gap-2 sm:px-7 sm:text-base"
                >
                  <Play className="h-3.5 w-3.5 fill-white sm:h-4 sm:w-4" />
                  Watch now
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    navigate(`/browse?q=${encodeURIComponent(watchId)}`, {
                      state: { from: location.pathname + location.search },
                    })
                  }
                  className="h-9 rounded-full border-white/20 bg-white/10 px-4 text-sm text-zinc-100 backdrop-blur-md hover:bg-white/15 sm:h-11 sm:px-6 sm:text-base"
                >
                  <Info className="mr-1 h-3.5 w-3.5 sm:mr-1.5 sm:h-4 sm:w-4" />
                  Details
                </Button>
              </div>

              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                {heroAnime.slice(0, 12).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => goToSlide(idx)}
                    className={cn(
                      'h-1 rounded-full transition-all duration-300 touch-manipulation sm:h-1.5',
                      idx === currentIndex ? 'w-5 bg-white sm:w-7' : 'w-1.5 bg-white/25 hover:bg-white/45'
                    )}
                    aria-label={`Slide ${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="pointer-events-auto absolute left-2 top-1/2 z-[6] hidden -translate-y-1/2 rounded-full border border-white/15 bg-black/45 p-2.5 text-white shadow-lg backdrop-blur-md transition hover:bg-black/60 md:flex"
                aria-label="Previous slide"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="pointer-events-auto absolute right-2 top-1/2 z-[6] hidden -translate-y-1/2 rounded-full border border-white/15 bg-black/45 p-2.5 text-white shadow-lg backdrop-blur-md transition hover:bg-black/60 md:flex"
                aria-label="Next slide"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

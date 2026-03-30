import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Info, Star, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

  return (
    <section className="relative w-full px-4 sm:px-6 lg:px-8 pt-5 pb-4 sm:pt-7 sm:pb-6">
      <div
        className="relative mx-auto max-w-7xl overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-950 shadow-2xl shadow-black/40 ring-1 ring-white/[0.04]"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className="relative w-full h-[460px] sm:h-[520px] md:h-[560px] lg:h-[600px] xl:h-[640px]">
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
                  style={{ objectPosition: 'center 22%' }}
                  loading={idx < 3 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              </div>
            );
          })}

          <div className="pointer-events-none absolute inset-0 z-[4]">
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
          </div>

          <div className="pointer-events-none absolute inset-0 z-[5] flex flex-col justify-between">
            <div
              className={cn(
                'pointer-events-auto px-5 pt-6 sm:px-8 sm:pt-8 lg:px-10 lg:pt-10 transition-all ease-out',
                contentVisible ? 'translate-y-0 opacity-100 duration-500' : '-translate-y-1 opacity-0 duration-200'
              )}
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-fox-orange/95 sm:text-sm">
                Now Airing
                {seasonLabel ? (
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-zinc-500">
                    · {seasonLabel}
                  </span>
                ) : null}
              </p>
              <h1 className="font-display text-[1.75rem] font-bold leading-[1.06] tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">
                {title}
              </h1>
            </div>

            <div
              className={cn(
                'pointer-events-auto flex flex-col gap-3 px-5 pb-4 sm:gap-4 sm:px-8 sm:pb-5 lg:px-10 lg:pb-6 transition-all ease-out',
                contentVisible ? 'translate-y-0 opacity-100 duration-500' : 'translate-y-2 opacity-0 duration-200'
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-300 sm:text-sm">
                {rating && (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-fox-orange">
                    <Star className="h-3.5 w-3.5 fill-fox-orange text-fox-orange sm:h-4 sm:w-4" />
                    {rating}
                  </span>
                )}
                {studio && (
                  <>
                    <span className="text-zinc-600">·</span>
                    <span>{studio}</span>
                  </>
                )}
                {anime.episodes && (
                  <>
                    <span className="text-zinc-600">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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
                      className="rounded-md border border-white/[0.08] bg-white/[0.07] px-2.5 py-0.5 text-xs font-medium text-zinc-300 sm:py-1 sm:text-sm"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              <p className="line-clamp-2 max-w-xl text-sm leading-relaxed text-zinc-300 sm:line-clamp-3 sm:max-w-2xl sm:text-[0.9375rem]">
                {anime.description || 'Discover this series in the spotlight.'}
              </p>

              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                <Button
                  onClick={() =>
                    navigate(watchPath, {
                      state: { from: location.pathname + location.search },
                    })
                  }
                  className="h-10 gap-2 rounded-xl bg-fox-orange px-5 text-sm font-semibold text-white shadow-lg shadow-fox-orange/20 hover:bg-fox-orange/90 sm:h-11 sm:px-6 sm:text-base"
                >
                  <Play className="h-4 w-4 fill-white" />
                  Watch
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    navigate(`/browse?q=${encodeURIComponent(watchId)}`, {
                      state: { from: location.pathname + location.search },
                    })
                  }
                  className="h-10 rounded-xl border-white/15 bg-white/[0.06] px-5 text-sm text-zinc-100 hover:bg-white/[0.12] sm:h-11 sm:px-6 sm:text-base"
                >
                  <Info className="mr-1.5 h-4 w-4" />
                  Details
                </Button>
              </div>

              <div className="flex items-center justify-center gap-2">
                {heroAnime.slice(0, 12).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => goToSlide(idx)}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-300 touch-manipulation',
                      idx === currentIndex ? 'w-7 bg-white' : 'w-1.5 bg-white/25 hover:bg-white/45'
                    )}
                    aria-label={`Slide ${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

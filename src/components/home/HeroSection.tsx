import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Info, Star, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  HeroAnime,
  getHeroTitle,
  getStudioName,
  formatHeroRating,
  getSeasonLabel,
  getTrailerUrl,
} from '@/hooks/useHeroAnimeMultiSource';

interface HeroSectionProps {
  heroAnime: HeroAnime[];
}

const SLIDE_DURATION = 10000;
const TRANSITION_DURATION = 800;

export const HeroSection = ({ heroAnime }: HeroSectionProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [contentVisible, setContentVisible] = useState(true);
  const [showTrailer, setShowTrailer] = useState(false);
  const [trailerLoaded, setTrailerLoaded] = useState(false);
  const [trailerWithSound, setTrailerWithSound] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const progressRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const soundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anime = heroAnime[currentIndex];
  const count = heroAnime.length;

  // Preload next few banner images
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
    setShowTrailer(false);
    setTrailerLoaded(false);
    setContentVisible(false);
    setPrevIndex(currentIndex);
    setCurrentIndex(index);
    progressRef.current = 0;
    setProgress(0);
    setTimeout(() => setContentVisible(true), 150);
    setTimeout(() => setPrevIndex(null), TRANSITION_DURATION);
  }, [currentIndex]);

  const handlePrev = useCallback(() => {
    goToSlide((currentIndex - 1 + count) % count);
  }, [currentIndex, count, goToSlide]);

  const handleNext = useCallback(() => {
    goToSlide((currentIndex + 1) % count);
  }, [currentIndex, count, goToSlide]);

  // Auto-advance
  useEffect(() => {
    if (isPaused || count <= 1) return;
    lastTimeRef.current = performance.now();
    progressRef.current = 0;

    const tick = (now: number) => {
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;
      progressRef.current += delta;
      setProgress(Math.min((progressRef.current / SLIDE_DURATION) * 100, 100));
      if (progressRef.current >= SLIDE_DURATION) { handleNext(); return; }
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [currentIndex, isPaused, count, handleNext]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePrev, handleNext]);

  // Trailer: play muted on hover, sound after 5s
  const handleMouseEnter = useCallback(() => {
    setIsPaused(true);
    const url = anime ? getTrailerUrl(anime) : null;
    if (url) {
      setShowTrailer(true);
      soundTimerRef.current = setTimeout(() => setTrailerWithSound(true), 5000);
    }
  }, [anime]);

  const handleMouseLeave = useCallback(() => {
    setIsPaused(false);
    setShowTrailer(false);
    setTrailerLoaded(false);
    setTrailerWithSound(false);
    if (soundTimerRef.current) { clearTimeout(soundTimerRef.current); soundTimerRef.current = null; }
  }, []);

  useEffect(() => {
    setShowTrailer(false);
    setTrailerLoaded(false);
    setTrailerWithSound(false);
    if (soundTimerRef.current) { clearTimeout(soundTimerRef.current); soundTimerRef.current = null; }
  }, [currentIndex]);

  if (!anime) return null;

  const title = getHeroTitle(anime);
  const studio = getStudioName(anime);
  const rating = formatHeroRating(anime.averageScore);
  const seasonLabel = getSeasonLabel(anime.season, anime.seasonYear);
  const trailerUrl = getTrailerUrl(anime);
  const watchId = anime.title.english || anime.title.romaji;

  return (
    <section
      className="relative w-full h-[100vh] min-h-[700px] overflow-hidden"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Background images */}
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
              transition: show ? `opacity ${TRANSITION_DURATION}ms ease-in-out` : 'none',
              willChange: show ? 'opacity' : 'auto',
            }}
          >
            <img
              src={a.bannerImage || a.coverImage.extraLarge}
              alt=""
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center 25%' }}
              loading={idx < 3 ? 'eager' : 'lazy'}
              decoding="async"
            />
          </div>
        );
      })}

      {/* Trailer overlay */}
      {showTrailer && trailerUrl && (
        <div
          className={cn(
            "absolute inset-0 z-[3] transition-opacity duration-500",
            trailerLoaded ? "opacity-100" : "opacity-0"
          )}
        >
          <iframe
            key={`${anime.id}-${trailerWithSound ? 's' : 'm'}`}
            src={`${trailerUrl}?autoplay=1&mute=${trailerWithSound ? '0' : '1'}&controls=0&modestbranding=1&rel=0&showinfo=0&loop=1&playlist=${anime.trailer?.id}`}
            className="w-full h-full scale-[1.3]"
            style={{ border: 'none', pointerEvents: 'none' }}
            allow="autoplay; encrypted-media"
            onLoad={() => setTrailerLoaded(true)}
            title="Trailer"
          />
        </div>
      )}

      {/* Gradients — match site background color */}
      <div className={cn(
        "absolute inset-0 z-[4] pointer-events-none transition-opacity duration-700",
        trailerWithSound ? "opacity-20" : "opacity-100"
      )}>
        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(220,20%,4%)] via-[hsl(220,20%,4%)]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(220,20%,4%)] via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,20%,4%)]/30 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className={cn(
        "relative z-[5] h-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 flex items-end pb-32 sm:pb-36 transition-opacity duration-700",
        trailerWithSound ? "opacity-10" : "opacity-100"
      )}>
        <div
          className={cn(
            "max-w-lg space-y-3 transition-all ease-out",
            contentVisible ? "opacity-100 translate-y-0 duration-600" : "opacity-0 translate-y-3 duration-200"
          )}
        >
          {/* Meta line */}
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            {rating && (
              <span className="inline-flex items-center gap-1 text-fox-orange font-semibold">
                <Star className="w-3.5 h-3.5 fill-fox-orange text-fox-orange" />
                {rating}
              </span>
            )}
            {studio && <><span className="text-zinc-600">·</span><span>{studio}</span></>}
            {seasonLabel && <><span className="text-zinc-600">·</span><span>{seasonLabel}</span></>}
            {anime.episodes && (
              <><span className="text-zinc-600">·</span><span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{anime.episodes} Eps</span></>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-snug">
            {title}
          </h1>

          {/* Genres */}
          {anime.genres.length > 0 && (
            <div className="flex items-center gap-1.5">
              {anime.genres.slice(0, 3).map((g) => (
                <span key={g} className="px-2 py-0.5 rounded-md text-[10px] font-medium text-zinc-400 bg-white/[0.05] border border-white/[0.06]">
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          <p className="text-zinc-500 text-[13px] leading-relaxed line-clamp-2 max-w-md">
            {anime.description || 'Discover this trending anime now.'}
          </p>

          {/* Buttons — match site style */}
          <div className="flex items-center gap-2.5 pt-1">
            <Button
              onClick={() => navigate(`/browse?q=${encodeURIComponent(watchId)}`, {
                state: { from: location.pathname + location.search }
              })}
              className="bg-fox-orange hover:bg-fox-orange/90 text-white font-semibold h-10 px-6 rounded-lg gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Play className="w-4 h-4 fill-white" />
              Watch Now
            </Button>

            <Button
              variant="outline"
              onClick={() => navigate(`/browse?q=${encodeURIComponent(watchId)}`)}
              className="bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.1] hover:border-white/[0.15] text-zinc-300 font-medium h-10 px-6 rounded-lg gap-2 transition-all duration-200"
            >
              <Info className="w-4 h-4" />
              More Info
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 z-[6] transition-opacity duration-500",
        trailerWithSound ? "opacity-0" : "opacity-100"
      )}>
        {/* Progress */}
        <div className="h-px bg-white/[0.06]">
          <div className="h-full bg-fox-orange/60" style={{ width: `${progress}%`, transition: 'none' }} />
        </div>

        <div className="flex items-center justify-between max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Slide counter */}
          <div className="flex items-center gap-1.5">
            {heroAnime.slice(0, 20).map((_, idx) => (
              <button
                key={idx}
                onClick={() => goToSlide(idx)}
                className={cn(
                  'rounded-full transition-all duration-200',
                  idx === currentIndex
                    ? 'w-6 h-1.5 bg-fox-orange'
                    : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'
                )}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>

          {/* Arrows */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft className="w-4 h-4 text-zinc-400" />
            </button>
            <button
              onClick={handleNext}
              className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center transition-colors"
              aria-label="Next"
            >
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

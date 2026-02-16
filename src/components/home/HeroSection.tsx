import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Info, Star, Clock, Tv, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  HeroAnime,
  getHeroTitle,
  getStudioName,
  formatHeroRating,
  getFormatLabel,
  getSeasonLabel,
  getTrailerUrl,
} from '@/hooks/useHeroAnimeMultiSource';

interface HeroSectionProps {
  heroAnime: HeroAnime[];
}

const SLIDE_DURATION = 10000;
const TRANSITION_DURATION = 1000;

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

  // Preload banner images
  useEffect(() => {
    heroAnime.forEach((a, idx) => {
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
    setTimeout(() => setContentVisible(true), 200);
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

  // Show trailer immediately on hover, enable sound after 5 seconds
  const handleMouseEnter = useCallback(() => {
    setIsPaused(true);
    const trailerUrl = anime ? getTrailerUrl(anime) : null;
    if (trailerUrl) {
      setShowTrailer(true);
      // Enable sound after 5 seconds of continuous hover for cinematic mode
      soundTimerRef.current = setTimeout(() => {
        setTrailerWithSound(true);
      }, 5000);
    }
  }, [anime]);

  const handleMouseLeave = useCallback(() => {
    setIsPaused(false);
    setShowTrailer(false);
    setTrailerLoaded(false);
    setTrailerWithSound(false);
    if (soundTimerRef.current) {
      clearTimeout(soundTimerRef.current);
      soundTimerRef.current = null;
    }
  }, []);

  // Reset trailer on slide change
  useEffect(() => {
    setShowTrailer(false);
    setTrailerLoaded(false);
    setTrailerWithSound(false);
    if (soundTimerRef.current) {
      clearTimeout(soundTimerRef.current);
      soundTimerRef.current = null;
    }
  }, [currentIndex]);

  if (!anime) return null;

  const title = getHeroTitle(anime);
  const studio = getStudioName(anime);
  const rating = formatHeroRating(anime.averageScore);
  const formatLabel = getFormatLabel(anime.format);
  const seasonLabel = getSeasonLabel(anime.season, anime.seasonYear);
  const trailerUrl = getTrailerUrl(anime);
  const watchId = anime.title.english || anime.title.romaji;

  return (
    <section
      className="relative w-full h-[100vh] min-h-[700px] overflow-hidden"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* === BACKGROUND IMAGES === */}
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
              transition: show ? `opacity ${TRANSITION_DURATION}ms ease-in-out` : 'none',
              zIndex: isActive ? 2 : isPrev ? 1 : 0,
            }}
          >
            <img
              src={a.bannerImage || a.coverImage.extraLarge}
              alt=""
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center 30%' }}
              loading={idx < 3 ? 'eager' : 'lazy'}
              decoding="async"
            />
          </div>
        );
      })}

      {/* === YOUTUBE TRAILER OVERLAY (autoplays on hover, sound after 3s) === */}
      {showTrailer && trailerUrl && (
        <div
          className={cn(
            "absolute inset-0 z-[5] transition-opacity duration-500",
            trailerLoaded ? "opacity-100" : "opacity-0"
          )}
        >
          <iframe
            key={`${anime.id}-${trailerWithSound ? 'sound' : 'muted'}`}
            src={`${trailerUrl}?autoplay=1&mute=${trailerWithSound ? '0' : '1'}&controls=0&modestbranding=1&rel=0&showinfo=0&loop=1&playlist=${anime.trailer?.id}`}
            className="w-full h-full scale-[1.3]"
            style={{ border: 'none', pointerEvents: 'none' }}
            allow="autoplay; encrypted-media"
            onLoad={() => setTrailerLoaded(true)}
            title="Anime trailer preview"
          />
        </div>
      )}

      {/* === GRADIENT OVERLAYS === */}
      <div className={cn(
        "absolute inset-0 z-[4] pointer-events-none transition-opacity duration-700",
        trailerWithSound ? "opacity-30" : "opacity-100"
      )}>
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
      </div>

      {/* === MAIN CONTENT === */}
      <div className={cn(
        "relative z-[5] h-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12 flex items-center transition-opacity duration-700",
        trailerWithSound ? "opacity-20" : "opacity-100"
      )}>
        <div
          className={cn(
            "max-w-xl space-y-2.5 transition-all ease-out",
            contentVisible
              ? "opacity-100 translate-y-0 duration-700"
              : "opacity-0 translate-y-4 duration-300"
          )}
        >
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-black tracking-[0.15em] uppercase rounded bg-fox-orange text-white">
              <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
              #{currentIndex + 1}
            </span>

            {formatLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold tracking-wider uppercase rounded bg-white/10 backdrop-blur text-white/70 border border-white/10">
                <Tv className="w-2.5 h-2.5" />
                {formatLabel}
              </span>
            )}

            {anime.nextAiringEpisode && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold tracking-wider uppercase rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/20">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                Airing
              </span>
            )}
          </div>

          {/* Title */}
          <h1
            className="text-2xl sm:text-3xl md:text-4xl font-black text-white leading-tight tracking-tight"
            style={{ textShadow: '0 3px 20px rgba(0,0,0,0.8), 0 2px 6px rgba(0,0,0,0.5)' }}
          >
            {title}
          </h1>

          {/* Meta row */}
          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-white/65">
            {rating && (
              <span className="inline-flex items-center gap-0.5 font-semibold text-amber-300">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {rating}
              </span>
            )}
            {rating && <span className="text-white/20">•</span>}

            {studio && (
              <>
                <span className="font-medium text-white/75">{studio}</span>
                <span className="text-white/20">•</span>
              </>
            )}

            {seasonLabel && (
              <>
                <span>{seasonLabel}</span>
                <span className="text-white/20">•</span>
              </>
            )}

            {anime.episodes ? (
              <span className="inline-flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5 text-white/50" />
                {anime.episodes} Eps
              </span>
            ) : anime.nextAiringEpisode ? (
              <span className="inline-flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5 text-white/50" />
                Ep {anime.nextAiringEpisode.episode - 1}+
              </span>
            ) : null}

            {anime.duration && (
              <>
                <span className="text-white/20">•</span>
                <span>{anime.duration}m</span>
              </>
            )}
          </div>

          {/* Genres */}
          {anime.genres.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {anime.genres.slice(0, 3).map((genre) => (
                <span
                  key={genre}
                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/[0.06] text-white/60 border border-white/[0.05]"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          <p
            className="text-white/55 text-xs sm:text-[13px] leading-relaxed max-w-lg line-clamp-2"
            style={{ textShadow: '0 2px 6px rgba(0,0,0,0.5)' }}
          >
            {anime.description || 'Discover this trending anime and start watching now.'}
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 pt-1.5">
            <Button
              size="lg"
              onClick={() => navigate(`/browse?q=${encodeURIComponent(watchId)}`, {
                state: { from: location.pathname + location.search }
              })}
              className="group relative bg-white hover:bg-white/95 text-black font-bold h-9 sm:h-10 px-5 sm:px-7 rounded-lg gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-white/10 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              <Play className="w-4 h-4 fill-black relative z-10" />
              <span className="text-xs sm:text-sm relative z-10">Watch Now</span>
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate(`/browse?q=${encodeURIComponent(watchId)}`)}
              className="group bg-white/5 hover:bg-white/10 border border-white/15 hover:border-white/30 text-white h-9 sm:h-10 px-5 sm:px-7 rounded-lg gap-2 backdrop-blur-xl transition-all duration-300 hover:scale-[1.02]"
            >
              <Info className="w-3.5 h-3.5" />
              <span className="text-xs sm:text-sm font-medium">More Info</span>
            </Button>
          </div>

        </div>
      </div>

      {/* === NAVIGATION === */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 z-[6] transition-opacity duration-700",
        trailerWithSound ? "opacity-0" : "opacity-100"
      )}>
        {/* Progress bar */}
        <div className="h-[2px] bg-white/10">
          <div className="h-full bg-fox-orange" style={{ width: `${progress}%`, transition: 'none' }} />
        </div>

        {/* Simple controls */}
        <div className="flex items-center justify-between px-6 sm:px-10 py-6 bg-gradient-to-t from-black/60 via-black/40 to-transparent backdrop-blur-sm">
          {/* Dots */}
          <div className="flex items-center gap-2">
            {heroAnime.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goToSlide(idx)}
                className={cn(
                  'rounded-full transition-all duration-300',
                  idx === currentIndex 
                    ? 'w-8 h-2 bg-fox-orange' 
                    : 'w-2 h-2 bg-white/30 hover:bg-white/50'
                )}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>

          {/* Arrows */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrev}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center transition-all hover:scale-110"
              aria-label="Previous"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={handleNext}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center transition-all hover:scale-110"
              aria-label="Next"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

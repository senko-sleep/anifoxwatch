import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Info, ChevronLeft, ChevronRight, Star, Calendar, Tv, Flame, Clock, TrendingUp, Shuffle, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Anime } from '@/types/anime';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';

interface HeroSectionProps {
  featuredAnime: Anime[];
}

const COMMON_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy',
  'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life',
  'Sports', 'Supernatural', 'Thriller'
];

export const HeroSection = ({ featuredAnime }: HeroSectionProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [showGenreFilter, setShowGenreFilter] = useState(false);
  const [isLoadingRandom, setIsLoadingRandom] = useState(false);
  const navigate = useNavigate();
  const currentAnime = featuredAnime[currentIndex];
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      handleNext();
    }, 10000);
    return () => clearInterval(timer);
  }, [featuredAnime.length, currentIndex]);

  useEffect(() => {
    setImageLoaded(false);
  }, [currentIndex]);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handlePrev = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev - 1 + featuredAnime.length) % featuredAnime.length);
    setTimeout(() => setIsTransitioning(false), 800);
  };

  const handleNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev + 1) % featuredAnime.length);
    setTimeout(() => setIsTransitioning(false), 800);
  };

  const handleGenreClick = (genre: string) => {
    navigate(`/browse?genre=${encodeURIComponent(genre)}`);
  };

  const handleRandomAnime = async () => {
    setIsLoadingRandom(true);
    try {
      const randomAnime = await apiClient.getRandomAnime();
      if (randomAnime) {
        navigate(`/anime/${randomAnime.id}`);
      }
    } catch (error) {
      console.error('Failed to get random anime:', error);
    } finally {
      setIsLoadingRandom(false);
    }
  };

  if (!currentAnime) return null;

  return (
    <section
      ref={sectionRef}
      className="relative w-full h-[95vh] min-h-[750px] max-h-[1100px] overflow-hidden"
    >
      {/* Background Images with Parallax/Zoom Effect */}
      {featuredAnime.map((anime, idx) => {
        const isActive = idx === currentIndex;
        const scale = isActive ? 1.1 + (scrollY * 0.0005) : 1.05;

        return (
          <div
            key={anime.id}
            className={cn(
              "absolute inset-0 transition-all duration-1500 ease-in-out",
              isActive ? "opacity-100" : "opacity-0"
            )}
          >
            <img
              src={anime.cover || anime.image}
              alt={anime.title}
              className={cn(
                "w-full h-full object-cover object-center transition-all duration-2000 ease-in-out",
                imageLoaded ? "blur-0" : "blur-xl scale-110"
              )}
              style={{ transform: `scale(${scale})` }}
              onLoad={() => setImageLoaded(true)}
              loading={idx === currentIndex ? "eager" : "lazy"}
            />
            {/* Advanced Gradient Overlays for Cinematic Feel */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/90" />
            {/* Vignette Effect for Focus */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.7)_100%)]" />
            {/* Subtle noise texture for film-like quality */}
            <div className="absolute inset-0 opacity-[0.02] mix-blend-overlay" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            }} />
          </div>
        );
      })}

      {/* Content Container with Generous Whitespace */}
      <div className="relative h-full max-w-[1920px] mx-auto px-8 sm:px-12 lg:px-16 xl:px-24 flex items-center">
        <div
          className={cn(
            "max-w-4xl space-y-12 transition-all duration-1000 ease-out",
            isTransitioning ? "opacity-0 translate-y-12" : "opacity-100 translate-y-0"
          )}
          key={currentAnime.id}
        >
          {/* Premium Spotlight Badge */}
          <div className="flex items-center gap-6 flex-wrap">
            <div className="inline-flex items-center gap-3 px-6 py-3 text-xs font-black tracking-[0.3em] uppercase rounded-full bg-gradient-to-r from-fox-orange via-orange-500 to-amber-500 text-white shadow-2xl shadow-orange-500/40 border border-orange-400/30 backdrop-blur-sm">
              <Flame className="w-4 h-4 animate-pulse" />
              Spotlight #{currentIndex + 1}
            </div>

            {currentAnime.type && (
              <div className="inline-flex items-center gap-2.5 px-5 py-2.5 text-xs font-bold tracking-wider uppercase rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white shadow-lg">
                <Tv className="w-3.5 h-3.5" />
                {currentAnime.type}
              </div>
            )}

            {currentAnime.rating && currentAnime.rating > 0 && (
              <div className="inline-flex items-center gap-2.5 px-5 py-2.5 text-xs font-bold rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 backdrop-blur-xl border border-amber-400/30 text-amber-300 shadow-lg">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                {currentAnime.rating.toFixed(1)}
              </div>
            )}
          </div>

          {/* Cinematic Title with Enhanced Typography */}
          <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black leading-[0.92] tracking-tight text-white"
            style={{
              textShadow: '0 8px 60px rgba(0,0,0,0.8), 0 4px 20px rgba(0,0,0,0.6), 0 2px 10px rgba(0,0,0,0.4)',
              letterSpacing: '-0.03em'
            }}
          >
            {currentAnime.title}
          </h1>

          {/* Meta Information with Clean Arrangement */}
          <div className="flex items-center gap-8 text-sm text-zinc-200 flex-wrap">
            {currentAnime.year && (
              <span className="flex items-center gap-2.5 font-medium">
                <Calendar className="w-4 h-4 text-fox-orange" />
                {currentAnime.year}
              </span>
            )}
            {currentAnime.episodes && (
              <span className="flex items-center gap-2.5 font-medium">
                <Clock className="w-4 h-4 text-fox-orange" />
                {currentAnime.episodes} Episodes
              </span>
            )}
            {currentAnime.genres && currentAnime.genres.length > 0 && (
              <div className="flex items-center gap-3">
                {currentAnime.genres.slice(0, 3).map((genre, idx) => (
                  <span
                    key={idx}
                    className="px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/15 text-xs font-semibold tracking-wide hover:bg-white/20 transition-all duration-300 cursor-default"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Enhanced Description with Improved Readability */}
          <p className="text-zinc-200 line-clamp-4 text-lg sm:text-xl md:text-2xl max-w-2xl leading-relaxed font-light"
            style={{
              textShadow: '0 4px 20px rgba(0,0,0,0.7)',
              letterSpacing: '0.01em'
            }}
          >
            {currentAnime.description || "Discover this amazing anime and start watching now!"}
          </p>

          {/* Premium Action Buttons */}
          <div className="flex items-center gap-8 pt-8">
            <Button
              size="lg"
              onClick={() => navigate(`/watch/${currentAnime.id}`)}
              className="group relative bg-white hover:bg-zinc-100 text-black font-black h-20 px-12 rounded-2xl gap-4 transition-all duration-400 hover:scale-105 active:scale-95 shadow-2xl shadow-white/30 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              <Play className="w-7 h-7 fill-black" />
              <span className="text-xl">Watch Now</span>
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate(`/anime/${currentAnime.id}`)}
              className="group bg-white/5 hover:bg-white/15 border-2 border-white/30 hover:border-white/50 text-white h-20 px-12 rounded-2xl gap-4 backdrop-blur-2xl transition-all duration-400 hover:scale-105"
            >
              <Info className="w-6 h-6 group-hover:rotate-12 transition-transform" />
              <span className="text-xl font-semibold">More Info</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Premium Navigation Controls with Glassmorphism */}
      <div className="absolute bottom-16 right-16 flex items-center gap-6">
        <button
          onClick={handlePrev}
          className="w-16 h-16 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-2xl border border-white/20 flex items-center justify-center transition-all duration-400 hover:scale-110 hover:border-white/40 group"
          aria-label="Previous"
        >
          <ChevronLeft className="w-8 h-8 text-white group-hover:-translate-x-0.5 transition-transform" />
        </button>

        {/* Premium Progress Indicators */}
        <div className="flex items-center gap-3 px-6 py-4 rounded-full bg-black/40 backdrop-blur-2xl border border-white/10">
          {featuredAnime.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (!isTransitioning) {
                  setIsTransitioning(true);
                  setCurrentIndex(idx);
                  setTimeout(() => setIsTransitioning(false), 800);
                }
              }}
              className={cn(
                'h-2.5 rounded-full transition-all duration-700 ease-out',
                idx === currentIndex
                  ? 'w-12 bg-gradient-to-r from-fox-orange to-orange-400 shadow-lg shadow-orange-500/50'
                  : 'w-2.5 bg-white/30 hover:bg-white/50 hover:scale-125'
              )}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          className="w-16 h-16 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-2xl border border-white/20 flex items-center justify-center transition-all duration-400 hover:scale-110 hover:border-white/40 group"
          aria-label="Next"
        >
          <ChevronRight className="w-8 h-8 text-white group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Premium Thumbnail Preview */}
      <div className="absolute bottom-16 left-16 hidden lg:flex items-center gap-6">
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-black/40 backdrop-blur-2xl border border-white/10">
          {featuredAnime.map((anime, idx) => (
            <button
              key={anime.id}
              onClick={() => {
                if (!isTransitioning && idx !== currentIndex) {
                  setIsTransitioning(true);
                  setCurrentIndex(idx);
                  setTimeout(() => setIsTransitioning(false), 800);
                }
              }}
              className={cn(
                "relative w-24 h-32 rounded-xl overflow-hidden transition-all duration-700 group",
                idx === currentIndex
                  ? "ring-2 ring-fox-orange scale-110 shadow-2xl shadow-orange-500/30 z-10"
                  : "opacity-60 hover:opacity-100 hover:scale-105"
              )}
            >
              <img
                src={anime.image}
                alt={anime.title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              {idx === currentIndex && (
                <div className="absolute inset-0 bg-gradient-to-t from-fox-orange/60 to-transparent" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Trending Indicator */}
      <div className="absolute top-1/2 right-16 -translate-y-1/2 hidden xl:flex flex-col items-center gap-6">
        <div className="w-px h-24 bg-gradient-to-b from-transparent via-white/30 to-transparent" />
        <div className="p-5 rounded-2xl bg-black/40 backdrop-blur-2xl border border-white/10">
          <TrendingUp className="w-7 h-7 text-fox-orange" />
        </div>
        <div className="w-px h-24 bg-gradient-to-b from-transparent via-white/30 to-transparent" />
      </div>
    </section>
  );
};

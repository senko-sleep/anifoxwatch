import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Info, ChevronLeft, ChevronRight, Star, Calendar, Tv, Flame, Clock, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Anime } from '@/types/anime';
import { cn } from '@/lib/utils';

interface HeroSectionProps {
  featuredAnime: Anime[];
}

export const HeroSection = ({ featuredAnime }: HeroSectionProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const navigate = useNavigate();
  const currentAnime = featuredAnime[currentIndex];

  useEffect(() => {
    const timer = setInterval(() => {
      handleNext();
    }, 8000);
    return () => clearInterval(timer);
  }, [featuredAnime.length, currentIndex]);

  useEffect(() => {
    setImageLoaded(false);
  }, [currentIndex]);

  const handlePrev = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev - 1 + featuredAnime.length) % featuredAnime.length);
    setTimeout(() => setIsTransitioning(false), 500);
  };

  const handleNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev + 1) % featuredAnime.length);
    setTimeout(() => setIsTransitioning(false), 500);
  };

  if (!currentAnime) return null;

  return (
    <section className="relative w-full h-[85vh] min-h-[700px] max-h-[1000px] overflow-hidden">
      {/* Background Images - All preloaded with HD optimization */}
      {featuredAnime.map((anime, idx) => (
        <div
          key={anime.id}
          className={cn(
            "absolute inset-0 transition-all duration-1000 ease-out",
            idx === currentIndex ? "opacity-100 scale-100" : "opacity-0 scale-105"
          )}
        >
          <img
            src={anime.cover || anime.image}
            alt={anime.title}
            className={cn(
              "w-full h-full object-cover object-center transition-all duration-700",
              imageLoaded ? "blur-0 scale-100" : "blur-sm scale-105"
            )}
            onLoad={() => setImageLoaded(true)}
            loading={idx === currentIndex ? "eager" : "lazy"}
          />
          {/* Vignette overlay for depth */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
        </div>
      ))}

      {/* Premium Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent" />

      {/* Subtle noise texture for premium feel */}
      <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      }} />

      {/* Content Container */}
      <div className="relative h-full max-w-[1800px] mx-auto px-6 sm:px-8 lg:px-12 flex items-center">
        <div
          className={cn(
            "max-w-3xl space-y-8 transition-all duration-700 ease-out",
            isTransitioning ? "opacity-0 translate-y-8" : "opacity-100 translate-y-0"
          )}
          key={currentAnime.id}
        >
          {/* Premium Spotlight Badge */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="inline-flex items-center gap-2.5 px-5 py-2.5 text-xs font-black tracking-[0.2em] uppercase rounded-full bg-gradient-to-r from-fox-orange via-orange-500 to-amber-500 text-white shadow-2xl shadow-orange-500/40 border border-orange-400/30 backdrop-blur-sm">
              <Flame className="w-4 h-4 animate-pulse" />
              Spotlight #{currentIndex + 1}
            </div>

            {currentAnime.type && (
              <div className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wider uppercase rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white shadow-lg">
                <Tv className="w-3.5 h-3.5" />
                {currentAnime.type}
              </div>
            )}

            {currentAnime.rating && currentAnime.rating > 0 && (
              <div className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 backdrop-blur-xl border border-amber-400/30 text-amber-300 shadow-lg">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                {currentAnime.rating.toFixed(1)}
              </div>
            )}
          </div>

          {/* Premium Title with text shadow */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-[0.95] tracking-tight text-white"
            style={{
              textShadow: '0 4px 30px rgba(0,0,0,0.5), 0 2px 10px rgba(0,0,0,0.3)',
              letterSpacing: '-0.02em'
            }}
          >
            {currentAnime.title}
          </h1>

          {/* Enhanced Meta Info */}
          <div className="flex items-center gap-5 text-sm text-zinc-200">
            {currentAnime.year && (
              <span className="flex items-center gap-2 font-medium">
                <Calendar className="w-4 h-4 text-fox-orange" />
                {currentAnime.year}
              </span>
            )}
            {currentAnime.episodes && (
              <span className="flex items-center gap-2 font-medium">
                <Clock className="w-4 h-4 text-fox-orange" />
                {currentAnime.episodes} Episodes
              </span>
            )}
            {currentAnime.genres && currentAnime.genres.length > 0 && (
              <div className="flex items-center gap-2">
                {currentAnime.genres.slice(0, 3).map((genre, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-xs font-semibold tracking-wide hover:bg-white/20 transition-colors cursor-default"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Enhanced Description */}
          <p className="text-zinc-200 line-clamp-3 text-lg sm:text-xl max-w-2xl leading-relaxed font-light"
            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
          >
            {currentAnime.description || "Discover this amazing anime and start watching now!"}
          </p>

          {/* Premium Actions */}
          <div className="flex items-center gap-5 pt-4">
            <Button
              size="lg"
              onClick={() => navigate(`/watch/${currentAnime.id}`)}
              className="group relative bg-white hover:bg-zinc-100 text-black font-black h-16 px-10 rounded-2xl gap-3 transition-all duration-300 hover:scale-105 active:scale-95 shadow-2xl shadow-white/25 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              <Play className="w-6 h-6 fill-black" />
              <span className="text-lg">Watch Now</span>
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate(`/anime/${currentAnime.id}`)}
              className="group bg-white/5 hover:bg-white/15 border-2 border-white/30 hover:border-white/50 text-white h-16 px-10 rounded-2xl gap-3 backdrop-blur-xl transition-all duration-300 hover:scale-105"
            >
              <Info className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              <span className="text-lg font-semibold">More Info</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Premium Navigation Controls */}
      <div className="absolute bottom-10 right-10 flex items-center gap-4">
        <button
          onClick={handlePrev}
          className="w-14 h-14 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-white/20 flex items-center justify-center transition-all duration-300 hover:scale-110 hover:border-white/40 group"
          aria-label="Previous"
        >
          <ChevronLeft className="w-7 h-7 text-white group-hover:-translate-x-0.5 transition-transform" />
        </button>

        {/* Premium Progress Indicators */}
        <div className="flex items-center gap-2.5 px-5 py-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/10">
          {featuredAnime.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (!isTransitioning) {
                  setIsTransitioning(true);
                  setCurrentIndex(idx);
                  setTimeout(() => setIsTransitioning(false), 500);
                }
              }}
              className={cn(
                'h-2 rounded-full transition-all duration-500 ease-out',
                idx === currentIndex
                  ? 'w-10 bg-gradient-to-r from-fox-orange to-orange-400 shadow-lg shadow-orange-500/50'
                  : 'w-2 bg-white/30 hover:bg-white/50 hover:scale-125'
              )}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          className="w-14 h-14 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-white/20 flex items-center justify-center transition-all duration-300 hover:scale-110 hover:border-white/40 group"
          aria-label="Next"
        >
          <ChevronRight className="w-7 h-7 text-white group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Premium Thumbnail Preview */}
      <div className="absolute bottom-10 left-10 hidden lg:flex items-center gap-4">
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10">
          {featuredAnime.map((anime, idx) => (
            <button
              key={anime.id}
              onClick={() => {
                if (!isTransitioning && idx !== currentIndex) {
                  setIsTransitioning(true);
                  setCurrentIndex(idx);
                  setTimeout(() => setIsTransitioning(false), 500);
                }
              }}
              className={cn(
                "relative w-20 h-28 rounded-xl overflow-hidden transition-all duration-500 group",
                idx === currentIndex
                  ? "ring-2 ring-fox-orange scale-110 shadow-2xl shadow-orange-500/30 z-10"
                  : "opacity-60 hover:opacity-100 hover:scale-105"
              )}
            >
              <img
                src={anime.image}
                alt={anime.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              {idx === currentIndex && (
                <div className="absolute inset-0 bg-gradient-to-t from-fox-orange/60 to-transparent" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Trending Indicator */}
      <div className="absolute top-1/2 right-10 -translate-y-1/2 hidden xl:flex flex-col items-center gap-4">
        <div className="w-px h-20 bg-gradient-to-b from-transparent via-white/30 to-transparent" />
        <div className="p-4 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10">
          <TrendingUp className="w-6 h-6 text-fox-orange" />
        </div>
        <div className="w-px h-20 bg-gradient-to-b from-transparent via-white/30 to-transparent" />
      </div>
    </section>
  );
};

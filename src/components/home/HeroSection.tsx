import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Info, ChevronLeft, ChevronRight, Star, Calendar, Tv } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Anime } from '@/types/anime';
import { cn } from '@/lib/utils';

interface HeroSectionProps {
  featuredAnime: Anime[];
}

export const HeroSection = ({ featuredAnime }: HeroSectionProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const navigate = useNavigate();
  const currentAnime = featuredAnime[currentIndex];

  useEffect(() => {
    const timer = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % featuredAnime.length);
        setIsTransitioning(false);
      }, 300);
    }, 8000);
    return () => clearInterval(timer);
  }, [featuredAnime.length]);

  const handlePrev = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + featuredAnime.length) % featuredAnime.length);
      setIsTransitioning(false);
    }, 300);
  };

  const handleNext = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % featuredAnime.length);
      setIsTransitioning(false);
    }, 300);
  };

  const goToSlide = (index: number) => {
    if (index !== currentIndex) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex(index);
        setIsTransitioning(false);
      }, 300);
    }
  };

  if (!currentAnime) return null;

  return (
    <section className="relative w-full h-[85vh] min-h-[650px] overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Background Image with better visibility */}
      <div className="absolute inset-0">
        <img
          src={
            currentAnime.bannerImage || 
            currentAnime.banner || 
            currentAnime.coverImage || 
            currentAnime.cover || 
            currentAnime.image
          }
          alt={currentAnime.title}
          className={cn(
            "w-full h-full transition-all duration-1000 ease-in-out",
            isTransitioning ? "opacity-40 scale-105" : "opacity-60 scale-100"
          )}
          style={{ 
            objectFit: 'cover',
            objectPosition: 'center 25%'
          }}
        />
        {/* Softer, more eye-friendly gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/95 via-slate-800/80 to-slate-900/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/95 via-slate-800/40 to-transparent" />
        {/* Subtle vignette effect for focus */}
        <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.5)]" />
      </div>

      {/* Content with better spacing and readability */}
      <div className="relative h-full max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 flex items-center">
        <div className={cn(
          "max-w-4xl space-y-8 transition-all duration-700 ease-out",
          isTransitioning ? "opacity-0 translate-x-12" : "opacity-100 translate-x-0"
        )}>
          {/* Title with better typography */}
          <div className="space-y-3">
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black text-white leading-tight tracking-tight drop-shadow-2xl">
              {currentAnime.title}
            </h1>
            {/* Subtle accent line */}
            <div className="w-24 h-1 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full shadow-lg shadow-orange-400/50" />
          </div>

          {/* Meta info with better visual hierarchy */}
          <div className="flex flex-wrap items-center gap-4 text-white/90">
            {currentAnime.type && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
                <Tv className="w-4 h-4 text-orange-400" />
                <span className="font-medium">{currentAnime.type}</span>
              </div>
            )}
            {currentAnime.year && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
                <Calendar className="w-4 h-4 text-blue-400" />
                <span className="font-medium">{currentAnime.year}</span>
              </div>
            )}
            {currentAnime.rating && currentAnime.rating > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="font-medium">{currentAnime.rating.toFixed(1)}</span>
              </div>
            )}
          </div>

          {/* Genres with improved styling */}
          {currentAnime.genres && currentAnime.genres.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {currentAnime.genres.slice(0, 4).map((genre, idx) => (
                <span
                  key={idx}
                  className="px-4 py-2 rounded-full bg-gradient-to-r from-orange-500/20 to-orange-600/20 backdrop-blur-md text-white text-sm font-medium border border-orange-400/30 shadow-lg"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {/* Description with better readability */}
          <div className="max-w-2xl">
            <p className="text-white/95 text-lg leading-relaxed drop-shadow-lg">
              {currentAnime.description || "Discover this amazing anime and start watching now!"}
            </p>
          </div>

          {/* Action buttons with enhanced design */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-2">
            <Button
              size="lg"
              onClick={() => navigate(`/watch/${currentAnime.id}`)}
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold px-10 py-4 rounded-xl gap-3 shadow-xl shadow-orange-500/25 hover:shadow-orange-500/40 transition-all hover:scale-105 text-lg"
            >
              <Play className="w-6 h-6" />
              Watch Now
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate(`/anime/${currentAnime.id}`)}
              className="border-white/30 bg-white/10 backdrop-blur-md text-white hover:bg-white/20 hover:border-white/40 px-10 py-4 rounded-xl gap-3 shadow-lg transition-all hover:scale-105 text-lg font-semibold"
            >
              <Info className="w-6 h-6" />
              More Info
            </Button>
          </div>
        </div>
      </div>

      {/* Enhanced Slider Navigation with better visibility */}
      <div className="absolute bottom-8 right-8 flex items-center gap-4">
        <button
          onClick={handlePrev}
          className="w-14 h-14 rounded-full bg-slate-800/80 hover:bg-slate-700/90 backdrop-blur-xl border border-white/30 flex items-center justify-center transition-all hover:scale-110 shadow-xl"
          aria-label="Previous"
        >
          <ChevronLeft className="w-7 h-7 text-white" />
        </button>

        {/* Enhanced Progress Indicators */}
        <div className="flex items-center gap-3 bg-slate-800/60 backdrop-blur-xl px-6 py-3 rounded-full border border-white/20 shadow-2xl">
          {featuredAnime.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goToSlide(idx)}
              className={cn(
                'h-2.5 rounded-full transition-all duration-300',
                idx === currentIndex
                  ? 'w-10 bg-gradient-to-r from-orange-400 to-orange-600 shadow-lg shadow-orange-400/50'
                  : 'w-2.5 bg-white/40 hover:bg-white/60 hover:w-4'
              )}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          className="w-14 h-14 rounded-full bg-slate-800/80 hover:bg-slate-700/90 backdrop-blur-xl border border-white/30 flex items-center justify-center transition-all hover:scale-110 shadow-xl"
          aria-label="Next"
        >
          <ChevronRight className="w-7 h-7 text-white" />
        </button>
      </div>
    </section>
  );
};

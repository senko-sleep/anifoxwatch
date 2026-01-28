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
    <section className="relative w-full h-[80vh] min-h-[600px] overflow-hidden">
      {/* Background Image with AniList priority */}
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
            "w-full h-full object-center transition-all duration-1000 ease-in-out",
            isTransitioning ? "opacity-50 scale-105" : "opacity-100 scale-100"
          )}
          style={{ 
            objectFit: 'cover',
            objectPosition: 'center 20%'
          }}
        />
        {/* Enhanced gradient overlay for better text visibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative h-full max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 flex items-center">
        <div className={cn(
          "max-w-3xl space-y-6 transition-all duration-700 ease-out",
          isTransitioning ? "opacity-0 translate-x-8" : "opacity-100 translate-x-0"
        )}>
          {/* Title */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight">
            {currentAnime.title}
          </h1>

          {/* Meta info */}
          <div className="flex items-center gap-6 text-white/80 flex-wrap">
            {currentAnime.type && (
              <span className="flex items-center gap-2">
                <Tv className="w-4 h-4" />
                {currentAnime.type}
              </span>
            )}
            {currentAnime.year && (
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {currentAnime.year}
              </span>
            )}
            {currentAnime.rating && currentAnime.rating > 0 && (
              <span className="flex items-center gap-2">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                {currentAnime.rating.toFixed(1)}
              </span>
            )}
          </div>

          {/* Genres */}
          {currentAnime.genres && currentAnime.genres.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {currentAnime.genres.slice(0, 3).map((genre, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          <p className="text-white/90 text-lg line-clamp-3">
            {currentAnime.description || "Discover this amazing anime and start watching now!"}
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-4 pt-4">
            <Button
              size="lg"
              onClick={() => navigate(`/watch/${currentAnime.id}`)}
              className="bg-white hover:bg-gray-100 text-black font-semibold px-8 py-3 rounded-lg gap-2"
            >
              <Play className="w-5 h-5" />
              Watch Now
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate(`/anime/${currentAnime.id}`)}
              className="border-white/30 text-white hover:bg-white/10 px-8 py-3 rounded-lg gap-2"
            >
              <Info className="w-5 h-5" />
              More Info
            </Button>
          </div>
        </div>
      </div>

      {/* Custom Slider Navigation */}
      <div className="absolute bottom-8 right-8 flex items-center gap-4">
        <button
          onClick={handlePrev}
          className="w-12 h-12 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm border border-white/20 flex items-center justify-center transition-all hover:scale-110"
          aria-label="Previous"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>

        {/* Custom Progress Indicators */}
        <div className="flex items-center gap-3 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-full">
          {featuredAnime.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goToSlide(idx)}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                idx === currentIndex
                  ? 'w-8 bg-white shadow-lg shadow-white/50'
                  : 'w-2 bg-white/40 hover:bg-white/60 hover:w-4'
              )}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          className="w-12 h-12 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm border border-white/20 flex items-center justify-center transition-all hover:scale-110"
          aria-label="Next"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      </div>
    </section>
  );
};

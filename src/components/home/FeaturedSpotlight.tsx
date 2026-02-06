import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Play, Star, Clock, Film, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatRating } from '@/lib/utils';

interface SpotlightAnime {
  id: string;
  title: string;
  image: string;
  cover?: string;
  description?: string;
  rating?: number;
  type?: string;
  status?: string;
  episodes?: number;
  genres?: string[];
}

interface FeaturedSpotlightProps {
  anime: SpotlightAnime[];
}

export const FeaturedSpotlight = ({ anime }: FeaturedSpotlightProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (anime.length <= 1) return;
    
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % anime.length);
        setIsTransitioning(false);
      }, 300);
    }, 6000);

    return () => clearInterval(interval);
  }, [anime.length]);

  const goTo = (index: number) => {
    if (index === activeIndex) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveIndex(index);
      setIsTransitioning(false);
    }, 300);
  };

  if (!anime || anime.length === 0) return null;

  const current = anime[activeIndex];

  return (
    <div className="relative h-[500px] lg:h-[600px] rounded-3xl overflow-hidden bg-fox-dark">
      {/* Background */}
      <div 
        className={cn(
          "absolute inset-0 transition-all duration-500",
          isTransitioning ? "opacity-0 scale-105" : "opacity-100 scale-100"
        )}
        style={{
          backgroundImage: `url(${current.cover || current.image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
        }}
      />

      {/* Overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-black/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/50" />

      {/* Content */}
      <div className="relative h-full flex items-center">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            {/* Info Side */}
            <div className={cn(
              "space-y-6 transition-all duration-500",
              isTransitioning ? "opacity-0 -translate-x-8" : "opacity-100 translate-x-0"
            )}>
              {/* Badges */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="px-4 py-1.5 rounded-full bg-fox-orange text-white text-sm font-semibold">
                  Featured
                </span>
                {current.rating && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-500/20 text-yellow-400 text-sm font-medium">
                    <Star className="w-4 h-4 fill-yellow-400" />
                    {formatRating(current.rating)}
                  </span>
                )}
                {current.type && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-sm">
                    <Film className="w-4 h-4" />
                    {current.type}
                  </span>
                )}
              </div>

              {/* Title */}
              <h1 className="text-4xl lg:text-6xl font-bold text-white leading-tight">
                {current.title}
              </h1>

              {/* Genres */}
              {current.genres && current.genres.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {current.genres.slice(0, 4).map((genre) => (
                    <span 
                      key={genre}
                      className="px-3 py-1 rounded-lg bg-white/5 text-white/70 text-sm border border-white/10"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              {current.description && (
                <p className="text-white/70 text-base lg:text-lg line-clamp-3 max-w-xl">
                  {current.description.replace(/<[^>]*>/g, '').slice(0, 250)}...
                </p>
              )}

              {/* Meta */}
              <div className="flex items-center gap-6 text-white/60 text-sm">
                {current.episodes && (
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {current.episodes} Episodes
                  </span>
                )}
                {current.status && (
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium",
                    current.status === 'Ongoing' 
                      ? "bg-green-500/20 text-green-400" 
                      : "bg-blue-500/20 text-blue-400"
                  )}>
                    {current.status}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-4 pt-4">
                <Link to={`/watch?id=${encodeURIComponent(current.id)}`} state={{ from: location.pathname }}>
                  <Button size="lg" className="bg-fox-orange hover:bg-fox-orange/90 text-white gap-2 h-14 px-8 rounded-xl text-lg shadow-xl shadow-fox-orange/30">
                    <Play className="w-6 h-6 fill-white" />
                    Watch Now
                  </Button>
                </Link>
              </div>
            </div>

            {/* Poster Side */}
            <div className="hidden lg:flex justify-center">
              <Link 
                to={`/watch?id=${encodeURIComponent(current.id)}`}
                state={{ from: location.pathname }}
                className={cn(
                  "relative transition-all duration-500",
                  isTransitioning ? "opacity-0 translate-x-8 scale-95" : "opacity-100 translate-x-0 scale-100"
                )}
              >
                <div className="w-72 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white/10 hover:ring-fox-orange transition-all hover:scale-105">
                  <img 
                    src={current.image} 
                    alt={current.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Glow Effect */}
                <div className="absolute -inset-4 bg-fox-orange/20 blur-3xl rounded-full -z-10" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Dots */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2">
        {anime.slice(0, 6).map((_, index) => (
          <button
            key={index}
            onClick={() => goTo(index)}
            className={cn(
              "transition-all duration-300 rounded-full",
              index === activeIndex 
                ? "w-8 h-2 bg-fox-orange" 
                : "w-2 h-2 bg-white/30 hover:bg-white/50"
            )}
          />
        ))}
      </div>

      {/* Arrow Navigation */}
      <button
        onClick={() => goTo((activeIndex - 1 + anime.length) % anime.length)}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 transition-colors"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      <button
        onClick={() => goTo((activeIndex + 1) % anime.length)}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 transition-colors"
      >
        <ChevronRight className="w-6 h-6" />
      </button>
    </div>
  );
};

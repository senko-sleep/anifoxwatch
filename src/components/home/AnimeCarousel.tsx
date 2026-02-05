import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Play, Star, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface CarouselAnime {
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

interface AnimeCarouselProps {
  anime: CarouselAnime[];
  title?: string;
  autoPlay?: boolean;
  showDetails?: boolean;
}

export const AnimeCarousel = ({ anime, title, autoPlay = false, showDetails = true }: AnimeCarouselProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Auto-play functionality
  useEffect(() => {
    if (!autoPlay || isHovered || anime.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % anime.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [autoPlay, isHovered, anime.length]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + anime.length) % anime.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % anime.length);
  };

  if (!anime || anime.length === 0) return null;

  const currentAnime = anime[currentIndex];

  return (
    <div 
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      ref={containerRef}
    >
      {/* Main Display */}
      <div className="relative aspect-[21/9] rounded-2xl overflow-hidden bg-fox-dark">
        {/* Background Image with Parallax Effect */}
        <div 
          className="absolute inset-0 transition-transform duration-700 ease-out"
          style={{
            backgroundImage: `url(${currentAnime.cover || currentAnime.image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            transform: isHovered ? 'scale(1.05)' : 'scale(1)',
          }}
        />
        
        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

        {/* Content */}
        <div className="absolute inset-0 flex items-end p-8 lg:p-12">
          <div className="flex gap-6 items-end max-w-4xl">
            {/* Poster */}
            <Link 
              to={`/watch?id=${encodeURIComponent(currentAnime.id)}`}
              state={{ from: location.pathname }}
              className="hidden md:block shrink-0 group/poster"
            >
              <div className="w-40 lg:w-48 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl ring-2 ring-white/10 transform transition-all duration-300 group-hover/poster:ring-fox-orange group-hover/poster:scale-105">
                <img 
                  src={currentAnime.image} 
                  alt={currentAnime.title}
                  className="w-full h-full object-cover"
                />
              </div>
            </Link>

            {/* Info */}
            {showDetails && (
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {currentAnime.rating && (
                    <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-sm font-medium">
                      <Star className="w-4 h-4 fill-yellow-400" />
                      {(currentAnime.rating > 10 ? currentAnime.rating / 10 : currentAnime.rating).toFixed(1)}
                    </span>
                  )}
                  {currentAnime.type && (
                    <span className="px-3 py-1 rounded-full bg-white/10 text-white/80 text-sm">
                      {currentAnime.type}
                    </span>
                  )}
                  {currentAnime.status && (
                    <span className={cn(
                      "px-3 py-1 rounded-full text-sm",
                      currentAnime.status === 'Ongoing' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                    )}>
                      {currentAnime.status}
                    </span>
                  )}
                </div>

                <h2 className="text-2xl lg:text-4xl font-bold text-white line-clamp-2 drop-shadow-lg">
                  {currentAnime.title}
                </h2>

                {currentAnime.description && (
                  <p className="text-white/70 text-sm lg:text-base line-clamp-2 max-w-2xl">
                    {currentAnime.description.replace(/<[^>]*>/g, '').slice(0, 200)}...
                  </p>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <Link to={`/watch?id=${encodeURIComponent(currentAnime.id)}`} state={{ from: location.pathname }}>
                    <Button className="bg-fox-orange hover:bg-fox-orange/90 text-white gap-2 h-11 px-6 rounded-xl shadow-lg shadow-fox-orange/25">
                      <Play className="w-5 h-5 fill-white" />
                      Watch Now
                    </Button>
                  </Link>
                  <Link to={`/watch?id=${encodeURIComponent(currentAnime.id)}`} state={{ from: location.pathname }}>
                    <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 gap-2 h-11 px-6 rounded-xl">
                      <Info className="w-5 h-5" />
                      Details
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Arrows */}
        <button
          onClick={goToPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-black/70 hover:scale-110"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          onClick={goToNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-black/70 hover:scale-110"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Thumbnail Navigation */}
      <div className="flex justify-center gap-2 mt-4">
        {anime.slice(0, 8).map((item, index) => (
          <button
            key={item.id}
            onClick={() => goToSlide(index)}
            className={cn(
              "relative w-16 h-10 rounded-lg overflow-hidden transition-all duration-300",
              index === currentIndex 
                ? "ring-2 ring-fox-orange scale-110 z-10" 
                : "opacity-50 hover:opacity-80 hover:scale-105"
            )}
          >
            <img 
              src={item.image} 
              alt=""
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
};

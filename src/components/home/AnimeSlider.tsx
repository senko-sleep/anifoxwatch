import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Play, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnimeItem {
  id: string;
  title: string;
  image: string;
  cover?: string;
  rating?: number;
  type?: string;
  status?: string;
  episodes?: number;
  year?: number;
  description?: string;
}

interface AnimeSliderProps {
  anime: AnimeItem[];
  cardSize?: 'sm' | 'md' | 'lg';
  showRank?: boolean;
  minimal?: boolean;
}

export const AnimeSlider = ({ anime, cardSize = 'md', showRank = false, minimal = false }: AnimeSliderProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const location = useLocation();

  const cardWidths = {
    sm: 'w-32',
    md: 'w-44',
    lg: 'w-56'
  };

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
    setTimeout(checkScroll, 300);
  };

  if (!anime || anime.length === 0) return null;

  return (
    <div className="relative group/slider">
      {/* Scroll Buttons */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-fox-orange/90 backdrop-blur-sm flex items-center justify-center text-white shadow-lg opacity-0 group-hover/slider:opacity-100 transition-all hover:bg-fox-orange hover:scale-110 -translate-x-1/2"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-fox-orange/90 backdrop-blur-sm flex items-center justify-center text-white shadow-lg opacity-0 group-hover/slider:opacity-100 transition-all hover:bg-fox-orange hover:scale-110 translate-x-1/2"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-4 -mb-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {anime.map((item, index) => (
          <Link
            key={item.id}
            to={`/watch?id=${encodeURIComponent(item.id)}`}
            state={{ from: location.pathname + location.search }}
            className={cn("shrink-0 group/card", cardWidths[cardSize])}
          >
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-fox-surface shadow-lg">
              {/* Image */}
              <img
                src={item.image}
                alt={item.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                loading="lazy"
              />

              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover/card:opacity-100 transition-all duration-300">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-fox-orange/90 flex items-center justify-center transform scale-0 group-hover/card:scale-100 transition-transform duration-300 shadow-xl">
                    <Play className="w-7 h-7 text-white fill-white ml-1" />
                  </div>
                </div>
              </div>

              {/* Rank Badge */}
              {showRank && !minimal && (
                <div className="absolute -left-2 -top-2 w-10 h-10 rounded-full bg-gradient-to-br from-fox-orange to-orange-600 flex items-center justify-center font-bold text-white text-lg shadow-lg border-2 border-background">
                  {index + 1}
                </div>
              )}

              {/* Rating Badge */}
              {!minimal && item.rating && (
                <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm text-xs font-medium">
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                  <span className="text-white">{(item.rating > 10 ? item.rating / 10 : item.rating).toFixed(1)}</span>
                </div>
              )}

              {/* Status Badge */}
              {!minimal && item.status === 'Ongoing' && (
                <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-green-500/80 backdrop-blur-sm text-xs font-medium text-white">
                  Airing
                </div>
              )}

              {/* Episode Count */}
              {!minimal && item.episodes && item.episodes > 0 && (
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm text-xs text-white">
                  {item.episodes} EP
                </div>
              )}
            </div>

            {/* Title */}
            <div className="mt-3 space-y-1">
              <h3 className="font-medium text-sm line-clamp-2 group-hover/card:text-fox-orange transition-colors">
                {item.title}
              </h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {item.type && <span>{item.type}</span>}
                {item.year && (
                  <>
                    <span>•</span>
                    <span>{item.year}</span>
                  </>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

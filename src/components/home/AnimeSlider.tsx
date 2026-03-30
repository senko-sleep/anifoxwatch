import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { cn, normalizeRating, isValidAnimeYear, isValidEpisodeCount } from '@/lib/utils';
import { WatchHistory } from '@/lib/watch-history';

interface AnimeItem {
  id: string;
  title: string;
  image: string;
  cover?: string;
  rating?: number;
  type?: string;
  status?: string;
  episodes?: number;
  duration?: string;
  year?: number;
  description?: string;
}

interface AnimeSliderProps {
  anime: AnimeItem[];
  cardSize?: 'sm' | 'md' | 'lg';
}

const TYPE_BADGE: Record<string, string> = {
  Movie:   'bg-violet-600',
  OVA:     'bg-amber-500',
  ONA:     'bg-emerald-600',
  Special: 'bg-rose-500',
  TV:      'bg-sky-600',
};

export const AnimeSlider = ({ anime, cardSize = 'md' }: AnimeSliderProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const location = useLocation();

  // Read history once for the whole slider
  const history = WatchHistory.get();

  const cardWidths = {
    sm: 'w-28 sm:w-32',
    md: 'w-36 sm:w-44',
    lg: 'w-44 sm:w-56',
  };

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 8);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 8);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -(scrollRef.current.clientWidth * 0.75) : scrollRef.current.clientWidth * 0.75,
      behavior: 'smooth',
    });
    setTimeout(checkScroll, 350);
  };

  if (!anime || anime.length === 0) return null;

  return (
    <div className="relative group/slider">
      {canScrollLeft && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 bottom-4 w-16 z-10 bg-gradient-to-r from-background to-transparent" />
          <button
            onClick={() => scroll('left')}
            className="absolute left-2 top-[38%] -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/60 border border-white/10 backdrop-blur-md flex items-center justify-center text-white/80 shadow-md
              opacity-0 group-hover/slider:opacity-100 hover:bg-black/80 hover:text-white transition-all duration-200"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </>
      )}
      {canScrollRight && (
        <>
          <div className="pointer-events-none absolute right-0 top-0 bottom-4 w-16 z-10 bg-gradient-to-l from-background to-transparent" />
          <button
            onClick={() => scroll('right')}
            className="absolute right-2 top-[38%] -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/60 border border-white/10 backdrop-blur-md flex items-center justify-center text-white/80 shadow-md
              opacity-0 group-hover/slider:opacity-100 hover:bg-black/80 hover:text-white transition-all duration-200"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}

      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-4 -mb-4 -mx-1 px-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {anime.map((item) => {
          const historyItem = history.find(h => h.animeId === item.id);
          const rating      = normalizeRating(item.rating);
          const typeColor   = TYPE_BADGE[item.type ?? ''] ?? 'bg-sky-600';

          const metaParts = [
            isValidAnimeYear(item.year) ? String(item.year) : null,
            item.type === 'Movie'
              ? 'Film'
              : isValidEpisodeCount(item.episodes)
                ? `${item.episodes} eps`
                : null,
          ].filter(Boolean);

          return (
            <Link
              key={item.id}
              to={`/watch?id=${encodeURIComponent(item.id)}`}
              state={{ from: location.pathname + location.search }}
              className={cn('shrink-0 group/card touch-manipulation flex flex-col', cardWidths[cardSize])}
            >
              {/* ── Poster ──────────────────────────────────────── */}
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/[0.04] ring-1 ring-white/[0.06] group-hover/card:ring-white/[0.12] transition-all duration-300 group-hover/card:shadow-xl group-hover/card:shadow-black/70">

                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.07]"
                  loading="lazy"
                />

                {/* ── Always-visible top badges ─────────────────── */}
                <div className="absolute top-0 inset-x-0 flex items-start justify-between px-2 pt-2 pointer-events-none z-10">
                  {item.type && (
                    <span className={cn(
                      'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white shadow-md',
                      typeColor
                    )}>
                      {item.type}
                    </span>
                  )}

                  {item.status === 'Ongoing' && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-sm text-[9px] font-semibold text-emerald-400 shadow ml-auto">
                      <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                      Airing
                    </span>
                  )}
                </div>

                {/* ── Hover info panel ──────────────────────────── */}
                <div
                  className="absolute inset-x-0 bottom-0 z-20 pointer-events-none
                             translate-y-2 opacity-0
                             group-hover/card:translate-y-0 group-hover/card:opacity-100
                             transition-all duration-300 ease-out"
                >
                  {/* Gradient backdrop */}
                  <div className="absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-black via-black/90 to-transparent" />

                  {/* Info content */}
                  <div className="relative flex flex-col gap-1.5 px-2.5 pb-3 pt-10">

                    {/* Title */}
                    <p className="font-display font-bold text-[11px] sm:text-xs text-white leading-snug line-clamp-2">
                      {item.title}
                    </p>

                    {/* Meta: year · eps · rating */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {metaParts.length > 0 && (
                        <span className="text-[10px] text-zinc-400 leading-none">
                          {metaParts.join(' · ')}
                        </span>
                      )}
                      {rating !== null && (
                        <>
                          {metaParts.length > 0 && <span className="text-zinc-700 text-[10px]">·</span>}
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400 font-semibold leading-none">
                            <Star className="w-2.5 h-2.5 fill-amber-400 flex-shrink-0" />
                            {rating.toFixed(1)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Continue or description */}
                    {historyItem ? (
                      <span className="text-[10px] font-semibold text-fox-orange leading-none">
                        Continue · Ep {historyItem.episodeNumber}
                      </span>
                    ) : item.description ? (
                      <p className="text-[9px] text-zinc-500 line-clamp-1 leading-snug">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* ── Title below card ────────────────────────────── */}
              <div className="mt-2 px-0.5">
                <p className="font-medium text-xs sm:text-[13px] text-zinc-400 group-hover/card:text-white transition-colors duration-200 line-clamp-1 leading-snug">
                  {item.title}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

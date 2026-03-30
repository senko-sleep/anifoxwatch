import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star, Mic, Subtitles, Play } from 'lucide-react';
import { cn, normalizeRating, isValidAnimeYear, isValidEpisodeCount, stripSourcePrefix } from '@/lib/utils';
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
  subCount?: number;
  dubCount?: number;
}

interface AnimeSliderProps {
  anime: AnimeItem[];
  cardSize?: 'sm' | 'md' | 'lg';
}

const TYPE_BADGE: Record<string, string> = {
  Movie:   'bg-violet-600/90',
  OVA:     'bg-amber-600/90',
  ONA:     'bg-emerald-600/90',
  Special: 'bg-rose-600/90',
  TV:      'bg-sky-600/90',
};

export const AnimeSlider = ({ anime, cardSize = 'md' }: AnimeSliderProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const location = useLocation();

  const history = WatchHistory.get();

  const cardWidths = {
    sm: 'w-32 sm:w-36',
    md: 'w-[10rem] sm:w-[11.5rem]',
    lg: 'w-48 sm:w-60',
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
          <div className="pointer-events-none absolute left-0 top-0 bottom-8 w-16 z-10 bg-gradient-to-r from-background to-transparent" />
          <button
            onClick={() => scroll('left')}
            className="absolute left-1 top-[36%] -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/70 border border-white/10 backdrop-blur-md flex items-center justify-center text-white/80 shadow-lg
              opacity-0 group-hover/slider:opacity-100 hover:bg-black/90 hover:text-white hover:scale-105 transition-all duration-200"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </>
      )}
      {canScrollRight && (
        <>
          <div className="pointer-events-none absolute right-0 top-0 bottom-8 w-16 z-10 bg-gradient-to-l from-background to-transparent" />
          <button
            onClick={() => scroll('right')}
            className="absolute right-1 top-[36%] -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/70 border border-white/10 backdrop-blur-md flex items-center justify-center text-white/80 shadow-lg
              opacity-0 group-hover/slider:opacity-100 hover:bg-black/90 hover:text-white hover:scale-105 transition-all duration-200"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5" />
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
          const typeColor   = TYPE_BADGE[item.type ?? ''] ?? 'bg-sky-600/90';
          const hasSub = (item.subCount ?? 0) > 0;
          const hasDub = (item.dubCount ?? 0) > 0;

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
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900/90 ring-1 ring-white/[0.05] transition-all duration-300 group-hover/card:ring-white/15 group-hover/card:shadow-lg group-hover/card:shadow-black/40">

                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-105"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />

                {/* Top-left: type badge */}
                {item.type && (
                  <div className="absolute top-1.5 left-1.5 z-10">
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-[3px] rounded-md text-white backdrop-blur-sm',
                      typeColor
                    )}>
                      {item.type}
                    </span>
                  </div>
                )}

                {/* Top-right: rating */}
                {rating !== null && (
                  <div className="absolute top-1.5 right-1.5 z-10">
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-white bg-black/60 backdrop-blur-sm px-1.5 py-[3px] rounded-md">
                      <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                      {rating.toFixed(1)}
                    </span>
                  </div>
                )}

                {/* Bottom-left: SUB / DUB badges */}
                {(hasSub || hasDub) && (
                  <div className="absolute bottom-1.5 left-1.5 z-10 flex gap-1">
                    {hasSub && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-sky-300 bg-sky-950/80 backdrop-blur-sm px-1.5 py-[2px] rounded">
                        <Subtitles className="w-2.5 h-2.5" />
                        {item.subCount}
                      </span>
                    )}
                    {hasDub && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-green-300 bg-green-950/80 backdrop-blur-sm px-1.5 py-[2px] rounded">
                        <Mic className="w-2.5 h-2.5" />
                        {item.dubCount}
                      </span>
                    )}
                  </div>
                )}

                {/* Bottom-right: duration & airing */}
                <div className="absolute bottom-1.5 right-1.5 z-10 flex flex-col items-end gap-1">
                  {item.duration && (
                    <span className="px-1.5 py-[2px] rounded bg-black/70 backdrop-blur-md text-[9px] font-bold text-zinc-200 shadow-sm border border-white/5">
                      {item.duration}
                    </span>
                  )}
                  {item.status === 'Ongoing' && (
                    <span className="flex items-center gap-1 px-1.5 py-[2px] rounded bg-black/70 backdrop-blur-md text-[9px] font-bold text-emerald-400 shadow-sm border border-white/5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Airing
                    </span>
                  )}
                </div>

                {/* Hover info (Clean Play Icon) */}
                <div
                  className="absolute inset-x-0 bottom-0 z-20 pointer-events-none
                             translate-y-2 opacity-0
                             group-hover/card:translate-y-0 group-hover/card:opacity-100
                             transition-all duration-300 ease-out flex flex-col items-center justify-end h-full"
                >
                  <div className="absolute inset-x-0 bottom-0 h-[65%] bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />
                  <div className="absolute inset-0 bg-black/20" /> {/* Slight dark overlay on image */}

                  {/* Play Button center */}
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center scale-90 group-hover/card:scale-100 transition-transform duration-300">
                    <div className="w-10 h-10 rounded-full bg-fox-orange text-white flex items-center justify-center pl-1 shadow-lg shadow-fox-orange/30">
                      <Play className="w-5 h-5 fill-white" />
                    </div>
                  </div>

                  <div className="relative flex flex-col gap-0.5 px-2.5 pb-3 w-full text-center">
                    {historyItem ? (
                      <span className="text-[10px] font-bold text-fox-orange leading-none drop-shadow-md">
                        Continue &middot; Ep {historyItem.episodeNumber}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Title + meta below card */}
              <div className="mt-2.5 px-0.5 flex flex-col gap-1">
                <p className="font-bold text-xs sm:text-[13px] text-zinc-200 group-hover/card:text-fox-orange transition-colors duration-200 line-clamp-2 leading-[1.15] tracking-tight">
                  {item.title}
                </p>
                {metaParts.length > 0 && (
                  <p className="text-[10.5px] font-medium text-zinc-500 leading-none">
                    {metaParts.join(' \u00b7 ')}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

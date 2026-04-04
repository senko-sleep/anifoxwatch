import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star, Mic, Subtitles, Play, Clock, CalendarDays } from 'lucide-react';
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
  subCount?: number;
  dubCount?: number;
}

interface AnimeSliderProps {
  anime: AnimeItem[];
  cardSize?: 'sm' | 'md' | 'lg';
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Movie:   { bg: 'bg-violet-600/85',  text: 'text-white', border: 'border-violet-400/30' },
  OVA:     { bg: 'bg-amber-600/85',   text: 'text-white', border: 'border-amber-400/30' },
  ONA:     { bg: 'bg-emerald-600/85', text: 'text-white', border: 'border-emerald-400/30' },
  Special: { bg: 'bg-rose-600/85',    text: 'text-white', border: 'border-rose-400/30' },
  TV:      { bg: 'bg-sky-600/85',     text: 'text-white', border: 'border-sky-400/30' },
};

export const AnimeSlider = ({ anime, cardSize = 'md' }: AnimeSliderProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const location = useLocation();
  const history = WatchHistory.get();

  const cardWidths = {
    sm: 'w-[8.5rem] sm:w-[9.5rem]',
    md: 'w-[10rem] sm:w-[11.5rem]',
    lg: 'w-[12rem] sm:w-[14rem]',
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
      {/* Left fade + arrow */}
      {canScrollLeft && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 bottom-8 w-20 z-10 bg-gradient-to-r from-background to-transparent" />
          <button
            onClick={() => scroll('left')}
            className="absolute left-1 top-[38%] -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#0e1018]/90 border border-white/[0.1] backdrop-blur-md flex items-center justify-center text-white/70 shadow-xl
              opacity-0 group-hover/slider:opacity-100 hover:bg-[#161820] hover:text-white hover:border-white/20 hover:scale-105 transition-all duration-200"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </>
      )}
      {canScrollRight && (
        <>
          <div className="pointer-events-none absolute right-0 top-0 bottom-8 w-20 z-10 bg-gradient-to-l from-background to-transparent" />
          <button
            onClick={() => scroll('right')}
            className="absolute right-1 top-[38%] -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#0e1018]/90 border border-white/[0.1] backdrop-blur-md flex items-center justify-center text-white/70 shadow-xl
              opacity-0 group-hover/slider:opacity-100 hover:bg-[#161820] hover:text-white hover:border-white/20 hover:scale-105 transition-all duration-200"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}

      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex gap-3 sm:gap-3.5 overflow-x-auto scrollbar-hide scroll-smooth pb-4 -mb-4 -mx-1 px-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {anime.map((item) => {
          const historyItem = history.find(h => h.animeId === item.id);
          const rating      = normalizeRating(item.rating);
          const typeStyle   = TYPE_COLORS[item.type ?? ''] ?? TYPE_COLORS['TV'];
          const hasSub = (item.subCount ?? 0) > 0;
          const hasDub = (item.dubCount ?? 0) > 0;
          const isOngoing = item.status === 'Ongoing';

          const metaParts = [
            isValidAnimeYear(item.year) ? String(item.year) : null,
            item.type === 'Movie'
              ? 'Film'
              : isValidEpisodeCount(item.episodes)
                ? `${item.episodes} eps`
                : null,
          ].filter(Boolean);

          // Progress for continue watching
          const progressPct = historyItem
            ? Math.round(((historyItem.episodeNumber - 1) / Math.max(item.episodes || historyItem.episodeNumber, 1)) * 100)
            : null;

          return (
            <Link
              key={item.id}
              to={`/watch?id=${encodeURIComponent(item.id)}`}
              state={{ from: location.pathname + location.search }}
              className={cn('shrink-0 group/card touch-manipulation flex flex-col', cardWidths[cardSize])}
            >
              {/* ── Poster ───────────────────────────────────────── */}
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900/90 ring-1 ring-white/[0.05] transition-all duration-300 group-hover/card:ring-white/[0.14] group-hover/card:shadow-xl group-hover/card:shadow-black/50 group-hover/card:-translate-y-0.5">

                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.06]"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />

                {/* Type badge — top left */}
                {item.type && (
                  <div className="absolute top-1.5 left-1.5 z-10">
                    <span className={cn(
                      'text-[9px] font-bold px-1.5 py-[3px] rounded-md backdrop-blur-sm border',
                      typeStyle.bg, typeStyle.text, typeStyle.border
                    )}>
                      {item.type}
                    </span>
                  </div>
                )}

                {/* Rating — top right */}
                {rating !== null && (
                  <div className="absolute top-1.5 right-1.5 z-10">
                    <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold text-amber-300 bg-black/65 backdrop-blur-sm px-1.5 py-[3px] rounded-md border border-amber-500/20">
                      <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                      {rating.toFixed(1)}
                    </span>
                  </div>
                )}

                {/* Airing / new badge — bottom left */}
                <div className="absolute bottom-1.5 left-1.5 z-10 flex gap-1">
                  {isOngoing && (
                    <span className="flex items-center gap-1 px-1.5 py-[2px] rounded-md bg-black/70 backdrop-blur-sm text-[9px] font-bold text-emerald-400 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Airing
                    </span>
                  )}
                  {hasSub && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-sky-300 bg-sky-950/80 backdrop-blur-sm px-1.5 py-[2px] rounded-md border border-sky-500/20">
                      <Subtitles className="w-2.5 h-2.5" />
                      {item.subCount}
                    </span>
                  )}
                  {hasDub && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-green-300 bg-green-950/80 backdrop-blur-sm px-1.5 py-[2px] rounded-md border border-green-500/20">
                      <Mic className="w-2.5 h-2.5" />
                      {item.dubCount}
                    </span>
                  )}
                </div>

                {/* Duration — bottom right */}
                {item.duration && (
                  <div className="absolute bottom-1.5 right-1.5 z-10">
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded-md bg-black/70 backdrop-blur-sm text-[9px] font-bold text-zinc-300 border border-white/[0.07]">
                      <Clock className="w-2.5 h-2.5 opacity-60" />
                      {item.duration}
                    </span>
                  </div>
                )}

                {/* ── Hover reveal panel ───────────────────────────────── */}
                <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none translate-y-1 opacity-0 group-hover/card:translate-y-0 group-hover/card:opacity-100 transition-all duration-300 ease-out">
                  {/* Gradient base */}
                  <div className="absolute inset-x-0 bottom-0 h-[75%] bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent" />

                  {/* Content */}
                  <div className="relative flex flex-col gap-1.5 px-2.5 pb-3 pt-10">
                    {/* Play button */}
                    <div className="flex justify-center mb-1">
                      <div className="w-9 h-9 rounded-full bg-fox-orange flex items-center justify-center pl-0.5 shadow-lg shadow-fox-orange/40 ring-2 ring-fox-orange/30">
                        <Play className="w-4 h-4 fill-white text-white" />
                      </div>
                    </div>

                    {/* Continue watching label */}
                    {historyItem && (
                      <span className="text-[9.5px] font-bold text-fox-orange text-center leading-none drop-shadow">
                        Continue · Ep {historyItem.episodeNumber}
                      </span>
                    )}

                    {/* Description snippet */}
                    {item.description && (
                      <p className="text-[9px] text-zinc-400 line-clamp-2 leading-snug text-center">
                        {item.description.replace(/<[^>]*>/g, '').slice(0, 80)}
                      </p>
                    )}

                    {/* Genre chips */}
                    {item.type && (
                      <div className="flex flex-wrap justify-center gap-1">
                        {item.type && (
                          <span className={cn('text-[8.5px] font-semibold px-1.5 py-[2px] rounded border', typeStyle.bg, typeStyle.text, typeStyle.border)}>
                            {item.type}
                          </span>
                        )}
                        {isValidAnimeYear(item.year) && (
                          <span className="inline-flex items-center gap-0.5 text-[8.5px] font-medium text-zinc-400 bg-white/[0.06] border border-white/[0.07] px-1.5 py-[2px] rounded">
                            <CalendarDays className="w-2 h-2" />
                            {item.year}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Watch progress bar */}
                {progressPct !== null && progressPct > 0 && (
                  <div className="absolute inset-x-0 bottom-0 z-30 h-[3px] bg-black/40">
                    <div
                      className="h-full bg-fox-orange rounded-r-full transition-all duration-300"
                      style={{ width: `${Math.min(progressPct, 100)}%` }}
                    />
                  </div>
                )}
              </div>

              {/* ── Title + meta below card ──────────────────────── */}
              <div className="mt-2.5 px-0.5 flex flex-col gap-0.5">
                <p className="font-semibold text-xs sm:text-[13px] text-zinc-200 group-hover/card:text-fox-orange transition-colors duration-200 line-clamp-2 leading-[1.2] tracking-tight">
                  {item.title}
                </p>
                {metaParts.length > 0 && (
                  <p className="text-[10px] font-medium text-zinc-600 leading-none mt-0.5">
                    {metaParts.join(' · ')}
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

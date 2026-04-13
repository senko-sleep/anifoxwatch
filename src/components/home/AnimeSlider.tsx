import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star, Mic, Subtitles, Play, Clock, CalendarDays } from 'lucide-react';
import { cn, normalizeRating, isValidAnimeYear, isValidEpisodeCount, ensureHttps } from '@/lib/utils';
import { apiUrl } from '@/lib/api-config';
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
  season?: string;
  description?: string;
  genres?: string[];
  studios?: string[];
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

/** Image with proxy fallback — fixes images disappearing on back-navigation */
const SliderImage = ({ src, alt }: { src: string; alt: string }) => {
  const [imgSrc, setImgSrc] = useState(src);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // Reset state when src changes (e.g. data re-enriched after navigation)
  const prevSrc = useRef(src);
  if (prevSrc.current !== src) {
    prevSrc.current = src;
    setImgSrc(src);
    setLoaded(false);
    setErrored(false);
  }

  return (
    <>
      {!loaded && !errored && (
        <div className="absolute inset-0 bg-zinc-800/60 animate-pulse" />
      )}
      <img
        src={imgSrc}
        alt={alt}
        className={cn(
          'w-full h-full object-cover transition-all duration-500 ease-out group-hover/card:scale-[1.06]',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!errored && src) {
            setErrored(true);
            setImgSrc(`${apiUrl('/api/image-proxy')}?url=${encodeURIComponent(src)}`);
          }
        }}
      />
    </>
  );
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
              opacity-60 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/slider:opacity-100 hover:bg-[#161820] hover:text-white hover:border-white/20 hover:scale-105 transition-all duration-200 touch-manipulation"
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
              opacity-60 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/slider:opacity-100 hover:bg-[#161820] hover:text-white hover:border-white/20 hover:scale-105 transition-all duration-200 touch-manipulation"
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

                <SliderImage src={ensureHttps(item.image)} alt={item.title} />

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
                <div className="absolute inset-0 z-20 pointer-events-none opacity-0 translate-y-1 group-hover/card:opacity-100 group-hover/card:translate-y-0 transition-all duration-300 ease-out">
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-zinc-950/35" />

                  <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end px-2.5 pb-2.5 pt-8 gap-1.5 max-h-[92%] overflow-hidden">
                    {/* Title */}
                    <p className="text-[11px] font-bold text-white leading-tight line-clamp-2 drop-shadow-sm">
                      {item.title}
                    </p>

                    {/* Rating + year + episodes + duration */}
                    <div className="flex flex-wrap items-center gap-1">
                      {rating !== null && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-200 bg-black/50 px-1.5 py-0.5 rounded border border-amber-500/20">
                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400 shrink-0" />
                          {rating.toFixed(1)}
                        </span>
                      )}
                      {isValidAnimeYear(item.year) && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-zinc-300 bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
                          <CalendarDays className="w-2.5 h-2.5 shrink-0 opacity-80" />
                          {item.year}
                        </span>
                      )}
                      {isValidEpisodeCount(item.episodes) && (
                        <span className="text-[9px] text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
                          {item.episodes} eps
                        </span>
                      )}
                      {item.duration && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-zinc-400">
                          <Clock className="w-2 h-2 shrink-0" />
                          {item.duration}
                        </span>
                      )}
                    </div>

                    {/* Genre chips */}
                    {item.genres && item.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.genres.slice(0, 4).map((g) => (
                          <span
                            key={g}
                            className="text-[8px] font-medium text-zinc-200 bg-white/10 px-1.5 py-0.5 rounded-md border border-white/5"
                          >
                            {g}
                          </span>
                        ))}
                        {item.genres.length > 4 && (
                          <span className="text-[8px] text-zinc-500">+{item.genres.length - 4}</span>
                        )}
                      </div>
                    )}

                    {/* Sub / Dub + Watch CTA */}
                    <div className="flex items-center justify-between gap-1 pt-0.5 border-t border-white/10 mt-0.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white">
                        <Play className="w-3 h-3 fill-fox-orange text-fox-orange shrink-0" />
                        {historyItem ? `Continue Ep ${historyItem.episodeNumber}` : 'Watch now'}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {hasSub && (
                          <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-sky-300 bg-sky-950/80 px-1 py-0.5 rounded border border-sky-500/20">
                            <Subtitles className="w-2 h-2" />
                            Sub
                          </span>
                        )}
                        {hasDub && (
                          <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-green-300 bg-green-950/80 px-1 py-0.5 rounded border border-green-500/20">
                            <Mic className="w-2 h-2" />
                            Dub
                          </span>
                        )}
                      </div>
                    </div>
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

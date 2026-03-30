import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Film, Star } from 'lucide-react';
import { Anime } from '@/types/anime';
import { cn, normalizeRating, isValidAnimeYear, isValidEpisodeCount } from '@/lib/utils';
import { WatchHistory } from '@/lib/watch-history';

interface AnimeCardProps {
  anime: Anime;
  className?: string;
  style?: React.CSSProperties;
  onMouseEnter?: () => void;
}

const TYPE_BADGE: Record<string, string> = {
  Movie:   'bg-violet-600',
  OVA:     'bg-amber-500',
  ONA:     'bg-emerald-600',
  Special: 'bg-rose-500',
  TV:      'bg-sky-600',
};

export const AnimeCard = ({ anime, className, style, onMouseEnter }: AnimeCardProps) => {
  const navigateId = anime.streamingId || anime.id;
  const navigate   = useNavigate();
  const location   = useLocation();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError,  setImgError]  = useState(false);

  const historyItem = WatchHistory.get().find(h => h.animeId === anime.id);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const ep = historyItem ? `&ep=${historyItem.episodeNumber}` : '';
    navigate(`/watch?id=${encodeURIComponent(navigateId)}${ep}`, {
      state: { from: location.pathname + location.search },
    });
  };

  const rating     = normalizeRating(anime.rating);
  const typeColor  = TYPE_BADGE[anime.type] ?? 'bg-sky-600';
  const topGenres  = (anime.genres ?? []).slice(0, 2);

  const metaParts = [
    isValidAnimeYear(anime.year) ? String(anime.year) : null,
    anime.type === 'Movie'
      ? 'Film'
      : isValidEpisodeCount(anime.episodes)
        ? `${anime.episodes} eps`
        : null,
  ].filter(Boolean);

  return (
    <a
      href={`/watch?id=${encodeURIComponent(navigateId)}`}
      style={style}
      onMouseEnter={onMouseEnter}
      onClick={handleClick}
      className={cn('group relative flex flex-col cursor-pointer touch-manipulation', className)}
    >
      {/* ── Poster ───────────────────────────────────────────── */}
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06] group-hover:ring-white/[0.12] transition-all duration-300 group-hover:shadow-xl group-hover:shadow-black/70">

        {/* Skeleton pulse */}
        {!imgLoaded && !imgError && (
          <div className="absolute inset-0 bg-white/[0.03] animate-pulse" />
        )}

        {/* Error fallback */}
        {imgError && (
          <div className="absolute inset-0 bg-zinc-900 flex flex-col items-center justify-center gap-2">
            <Film className="w-8 h-8 text-zinc-700" />
            <span className="text-[10px] text-zinc-600 text-center px-3 line-clamp-2">{anime.title}</span>
          </div>
        )}

        {/* Image */}
        <img
          src={anime.image}
          alt={anime.title}
          className={cn(
            'w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.07]',
            imgLoaded ? 'opacity-100' : 'opacity-0'
          )}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
        />

        {/* ── Always-visible top badges ──────────────────────── */}
        <div className="absolute top-0 inset-x-0 flex items-start justify-between px-2 pt-2 pointer-events-none z-10">
          <span className={cn(
            'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white shadow-md',
            typeColor
          )}>
            {anime.type}
          </span>

          {anime.status === 'Ongoing' && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-sm text-[9px] font-semibold text-emerald-400 shadow">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
              Airing
            </span>
          )}
        </div>

        {/* ── Hover info panel — slides up from bottom ────────── */}
        <div
          className="absolute inset-x-0 bottom-0 z-20 pointer-events-none
                     translate-y-2 opacity-0
                     group-hover:translate-y-0 group-hover:opacity-100
                     transition-all duration-300 ease-out"
        >
          {/* Gradient backdrop */}
          <div className="absolute inset-x-0 bottom-0 h-[75%] bg-gradient-to-t from-black via-black/90 to-transparent" />

          {/* Info content */}
          <div className="relative flex flex-col gap-1.5 px-2.5 pb-3 pt-12">

            {/* Title */}
            <p className="font-display font-bold text-[11px] sm:text-xs text-white leading-snug line-clamp-2">
              {anime.title}
            </p>

            {/* Meta row: year · eps · rating */}
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

            {/* Continue pill OR genre chips */}
            {historyItem ? (
              <span className="text-[10px] font-semibold text-fox-orange leading-none">
                Continue · Ep {historyItem.episodeNumber}
              </span>
            ) : topGenres.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {topGenres.map(g => (
                  <span key={g} className="text-[9px] px-1.5 py-0.5 rounded-sm bg-white/[0.10] text-zinc-300 leading-none">
                    {g}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Title below card ──────────────────────────────────── */}
      <div className="mt-2 px-0.5">
        <p className="font-display font-medium text-xs sm:text-[13px] text-zinc-400 group-hover:text-white transition-colors duration-200 line-clamp-1 leading-snug">
          {anime.title}
        </p>
      </div>
    </a>
  );
};

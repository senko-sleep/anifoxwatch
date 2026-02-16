import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Star, Film, Tv, Calendar } from 'lucide-react';
import { Anime } from '@/types/anime';
import { cn, normalizeRating } from '@/lib/utils';
import { WatchHistory } from '@/lib/watch-history';
import { getDisplayGenres } from '@/utils/genre-utils';

interface AnimeCardProps {
  anime: Anime;
  className?: string;
  style?: React.CSSProperties;
  onMouseEnter?: () => void;
  showRank?: number;
}

export const AnimeCard = ({ anime, className, style, onMouseEnter, showRank }: AnimeCardProps) => {
  const navigateId = anime.streamingId || anime.id;
  const navigate = useNavigate();
  const location = useLocation();
  const displayRating = normalizeRating(anime.rating);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const history = WatchHistory.get();
    const historyItem = history.find(item => item.animeId === anime.id);
    const episodeParam = historyItem ? `&ep=${historyItem.episodeNumber}` : '';
    navigate(`/watch?id=${encodeURIComponent(navigateId)}${episodeParam}`, {
      state: { from: location.pathname + location.search }
    });
  };

  return (
    <a
      href={`/watch?id=${encodeURIComponent(navigateId)}`}
      style={style}
      onMouseEnter={onMouseEnter}
      onClick={handleClick}
      className={cn(
        'group relative flex flex-col cursor-pointer',
        className
      )}
    >
      {/* Image Container */}
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-white/[0.03] shadow-xl ring-1 ring-white/[0.08] group-hover:ring-fox-orange/40 transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-fox-orange/20 group-hover:-translate-y-1">
        {/* Loading skeleton */}
        {!imgLoaded && !imgError && (
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-white/[0.02] animate-pulse" />
        )}

        {/* Broken image fallback */}
        {imgError && (
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-white/[0.02] flex flex-col items-center justify-center gap-3">
            <Film className="w-10 h-10 text-zinc-700" />
            <span className="text-[11px] text-zinc-500 text-center px-3 line-clamp-2 font-medium">{anime.title}</span>
          </div>
        )}

        {/* Image */}
        <img
          src={anime.image}
          alt={anime.title}
          className={cn(
            "w-full h-full object-cover transition-all duration-700 group-hover:scale-105",
            imgLoaded ? "opacity-100" : "opacity-0"
          )}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
        />

        {/* Cinematic Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-500" />
        
        {/* Subtle vignette effect */}
        <div className="absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,0.4)] pointer-events-none" />

        {/* Hover Info Overlay */}
        <div className="absolute inset-x-0 bottom-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
          {/* Meta info row */}
          <div className="flex items-center gap-2 mb-2 text-[10px] text-white/80">
            {anime.type && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 backdrop-blur-sm">
                <Tv className="w-3 h-3" />
                {anime.type}
              </span>
            )}
            {anime.episodes && anime.episodes > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-white/10 backdrop-blur-sm">
                {anime.episodes} EP
              </span>
            )}
            {anime.year && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 backdrop-blur-sm">
                <Calendar className="w-3 h-3" />
                {anime.year}
              </span>
            )}
          </div>
          
          {/* Genres */}
          <div className="flex flex-wrap gap-1">
            {getDisplayGenres(anime, { maxGenres: 3, includeDefaults: true }).slice(0, 3).map((genre) => (
              <span 
                key={genre}
                className="text-[9px] text-white/70 bg-white/[0.08] backdrop-blur-sm px-2 py-0.5 rounded-full"
              >
                {genre}
              </span>
            ))}
          </div>
        </div>

        {/* Play Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="w-14 h-14 rounded-full bg-fox-orange backdrop-blur-md flex items-center justify-center transform scale-50 group-hover:scale-100 transition-all duration-300 shadow-xl shadow-fox-orange/50 ring-4 ring-white/20">
            <Play className="w-6 h-6 text-white fill-white ml-0.5" />
          </div>
        </div>

        {/* Rank Badge */}
        {showRank && (
          <div className="absolute top-2.5 left-2.5 min-w-[28px] h-7 px-1.5 rounded-lg bg-gradient-to-br from-fox-orange via-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-fox-orange/30">
            <span className="text-xs font-black text-white">#{showRank}</span>
          </div>
        )}

        {/* Rating Badge */}
        {displayRating && displayRating >= 1 && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-xl border border-white/[0.1]">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span className="text-xs font-bold text-white">
              {displayRating.toFixed(1)}
            </span>
          </div>
        )}

        {/* Status indicator */}
        {anime.status === 'Ongoing' && (
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/20 backdrop-blur-xl border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-semibold text-emerald-400">AIRING</span>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="mt-3 px-0.5">
        <h3 className="font-semibold text-sm text-zinc-300 group-hover:text-white transition-colors duration-300 line-clamp-2 leading-snug">
          {anime.title}
        </h3>
        {anime.year && !anime.status && (
          <p className="text-xs text-zinc-600 mt-0.5">{anime.year}</p>
        )}
      </div>
    </a>
  );
};

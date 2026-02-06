import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Star, Film } from 'lucide-react';
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
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-fox-surface shadow-lg ring-1 ring-white/5 group-hover:ring-fox-orange/50 transition-all duration-500 group-hover:shadow-xl group-hover:shadow-fox-orange/10">
        {/* Loading skeleton */}
        {!imgLoaded && !imgError && (
          <div className="absolute inset-0 bg-fox-surface animate-pulse" />
        )}

        {/* Broken image fallback */}
        {imgError && (
          <div className="absolute inset-0 bg-fox-surface flex flex-col items-center justify-center gap-2">
            <Film className="w-8 h-8 text-zinc-600" />
            <span className="text-[10px] text-zinc-500 text-center px-2 line-clamp-2">{anime.title}</span>
          </div>
        )}

        {/* Image */}
        <img
          src={anime.image}
          alt={anime.title}
          className={cn(
            "w-full h-full object-cover transition-all duration-700 group-hover:scale-110",
            imgLoaded ? "opacity-100" : "opacity-0"
          )}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
        />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-70 group-hover:opacity-95 transition-opacity duration-300" />

        {/* Hover Info Overlay - Shows on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
          {/* Status badges */}
          <div className="flex items-center gap-2 mb-2">
            {anime.status && (
              <span className="text-[10px] font-medium text-white uppercase tracking-wider">
                {anime.status}
              </span>
            )}
            {anime.episodes && anime.episodes > 0 && (
              <span className="text-[10px] text-white/80">
                {anime.episodes} EP
              </span>
            )}
            {anime.duration && (
              <span className="text-[10px] text-white/80">
                · {anime.duration}
              </span>
            )}
          </div>
          
          {/* Genres */}
          <div className="flex flex-wrap gap-1">
            {getDisplayGenres(anime, { maxGenres: 4, includeDefaults: true }).slice(0, 4).map((genre) => (
              <span 
                key={genre}
                className="text-[9px] text-white/70 border border-white/20 px-1.5 py-0.5 rounded"
              >
                {genre}
              </span>
            ))}
          </div>
        </div>

        {/* Play Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="w-14 h-14 rounded-full bg-fox-orange/90 backdrop-blur-md flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform duration-300 shadow-lg shadow-fox-orange/40">
            <Play className="w-6 h-6 text-white fill-white ml-1" />
          </div>
        </div>

        {/* Rank Badge */}
        {showRank && (
          <div className="absolute top-2 left-2 w-8 h-8 rounded-lg bg-gradient-to-br from-fox-orange to-orange-600 flex items-center justify-center shadow-lg">
            <span className="text-sm font-black text-white">#{showRank}</span>
          </div>
        )}

        {/* Rating Badge */}
        {displayRating && displayRating >= 1 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span className="text-xs font-bold text-white">
              {displayRating.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="mt-2.5">
        <h3 className="font-semibold text-sm text-zinc-200 group-hover:text-white transition-colors duration-200 line-clamp-2 leading-tight">
          {anime.title}
        </h3>
      </div>
    </a>
  );
};

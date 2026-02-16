import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Star, Film } from 'lucide-react';
import { Anime } from '@/types/anime';
import { cn, normalizeRating } from '@/lib/utils';
import { WatchHistory } from '@/lib/watch-history';

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
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] group-hover:ring-white/[0.15] transition-all duration-300 group-hover:-translate-y-0.5">
        {/* Loading skeleton */}
        {!imgLoaded && !imgError && (
          <div className="absolute inset-0 bg-white/[0.03] animate-pulse" />
        )}

        {/* Broken image fallback */}
        {imgError && (
          <div className="absolute inset-0 bg-white/[0.03] flex flex-col items-center justify-center gap-2">
            <Film className="w-8 h-8 text-zinc-700" />
            <span className="text-[10px] text-zinc-600 text-center px-3 line-clamp-2">{anime.title}</span>
          </div>
        )}

        {/* Image */}
        <img
          src={anime.image}
          alt={anime.title}
          className={cn(
            "w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]",
            imgLoaded ? "opacity-100" : "opacity-0"
          )}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
        />

        {/* Bottom gradient */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Play icon on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-10 h-10 rounded-full bg-white/[0.15] backdrop-blur-sm flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>

        {/* Rank Badge */}
        {showRank && (
          <div className="absolute top-2 left-2 min-w-[24px] h-6 px-1.5 rounded-md bg-fox-orange flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">#{showRank}</span>
          </div>
        )}

        {/* Rating Badge */}
        {displayRating && displayRating >= 1 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm">
            <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
            <span className="text-[10px] font-semibold text-white">
              {displayRating.toFixed(1)}
            </span>
          </div>
        )}

        {/* Status indicator */}
        {anime.status === 'Ongoing' && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm">
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
            <span className="text-[9px] font-medium text-emerald-400 uppercase tracking-wide">Airing</span>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="mt-2 px-0.5">
        <h3 className="font-medium text-[13px] text-zinc-300 group-hover:text-white transition-colors duration-200 line-clamp-2 leading-snug">
          {anime.title}
        </h3>
      </div>
    </a>
  );
};

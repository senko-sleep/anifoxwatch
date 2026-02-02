import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Star, Tv, Calendar } from 'lucide-react';
import { Anime } from '@/types/anime';
import { cn } from '@/lib/utils';

interface AnimeCardProps {
  anime: Anime;
  className?: string;
  style?: React.CSSProperties;
  onMouseEnter?: () => void;
  showRank?: number;
}

export const AnimeCard = ({ anime, className, style, onMouseEnter, showRank }: AnimeCardProps) => {
  // Use streamingId if available (for AniList results), otherwise use id
  const navigateId = anime.streamingId || anime.id;
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Navigate to watch page with current location as state for preserving browse state
    navigate(`/watch?id=${encodeURIComponent(navigateId)}`, {
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
        {/* Image */}
        <img
          src={anime.image}
          alt={anime.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          loading="lazy"
        />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300" />

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
        {anime.rating && anime.rating > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span className="text-xs font-bold text-white">{anime.rating.toFixed(1)}</span>
          </div>
        )}

        {/* Bottom Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <div className="flex items-center gap-2 text-[10px] text-white/80">
            {anime.type && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-sm">
                <Tv className="w-2.5 h-2.5" />
                {anime.type}
              </span>
            )}
            {anime.episodes && (
              <span className="px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-sm">
                {anime.episodes} EP
              </span>
            )}
            {anime.year && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-sm">
                <Calendar className="w-2.5 h-2.5" />
                {anime.year}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Title & Info */}
      <div className="mt-3 px-1 space-y-1">
        <h3 className="font-semibold text-sm text-zinc-200 group-hover:text-white transition-colors duration-200 line-clamp-2 leading-tight">
          {anime.title}
        </h3>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          {anime.status && (
            <span className={cn(
              "px-1.5 py-0.5 rounded font-medium uppercase tracking-wider",
              anime.status === 'Ongoing' && "bg-green-500/20 text-green-400",
              anime.status === 'Completed' && "bg-blue-500/20 text-blue-400",
              anime.status === 'Upcoming' && "bg-purple-500/20 text-purple-400"
            )}>
              {anime.status}
            </span>
          )}
          {anime.genres && anime.genres.length > 0 && (
            <span className="text-zinc-600 truncate">
              {anime.genres.slice(0, 2).join(' • ')}
            </span>
          )}
        </div>
      </div>
    </a>
  );
};

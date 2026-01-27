import { Link } from 'react-router-dom';
import { Play, Star } from 'lucide-react';
import { Anime } from '@/types/anime';
import { cn } from '@/lib/utils';

interface AnimeCardProps {
  anime: Anime;
  className?: string;
  style?: React.CSSProperties;
  onMouseEnter?: () => void;
}

export const AnimeCard = ({ anime, className, style, onMouseEnter }: AnimeCardProps) => {
  return (
    <Link
      to={`/watch/${anime.id}`}
      style={style}
      onMouseEnter={onMouseEnter}
      className={cn(
        'group relative flex flex-col hover:scale-[1.02] transition-all duration-300',
        className
      )}
    >
      {/* Image Container - Extremely Clean */}
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-zinc-900 shadow-md ring-1 ring-white/5 group-hover:ring-white/20 transition-all duration-300">
        <img
          src={anime.image}
          alt={anime.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          loading="lazy"
        />

        {/* Subtle Play Icon on Hover */}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>

        {/* Minimal Badges */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          {anime.rating && anime.rating > 0 && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10">
              <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
              <span className="text-[10px] font-bold text-white">{anime.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Info - Only Title Visible */}
      <div className="mt-3 px-1">
        <h3 className="font-medium text-sm text-zinc-200 group-hover:text-white transition-colors duration-200 line-clamp-1">
          {anime.title}
        </h3>
        <div className="flex items-center gap-2 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            {anime.type}
          </span>
          {anime.episodes && (
            <span className="text-[10px] text-zinc-600 font-medium">
              {anime.episodes} episodes
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};
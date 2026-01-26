import { Link } from 'react-router-dom';
import { Play, Captions, Mic } from 'lucide-react';
import { Anime } from '@/types/anime';
import { cn } from '@/lib/utils';

interface AnimeCardProps {
  anime: Anime;
  className?: string;
  style?: React.CSSProperties;
}

export const AnimeCard = ({ anime, className, style }: AnimeCardProps) => {
  return (
    <Link
      to={`/anime/${anime.id}`}
      style={style}
      className={cn(
        'group relative flex flex-col rounded-lg overflow-hidden bg-card card-hover',
        className
      )}
    >
      {/* Image Container */}
      <div className="relative aspect-[3/4] overflow-hidden">
        <img
          src={anime.image}
          alt={anime.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          loading="lazy"
        />
        
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-fox-orange/90 flex items-center justify-center transform scale-0 group-hover:scale-100 transition-transform duration-300 delay-100">
              <Play className="w-6 h-6 text-white fill-white ml-1" />
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {anime.isMature && (
            <span className="px-2 py-0.5 text-xs font-bold rounded bg-badge-mature text-white">
              18+
            </span>
          )}
        </div>

        {/* Episode badges */}
        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          {anime.subCount !== undefined && anime.subCount > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-black/70 backdrop-blur-sm">
              <Captions className="w-3 h-3 text-badge-sub" />
              <span className="text-xs font-medium">{anime.subCount}</span>
            </div>
          )}
          {anime.dubCount !== undefined && anime.dubCount > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-black/70 backdrop-blur-sm">
              <Mic className="w-3 h-3 text-badge-dub" />
              <span className="text-xs font-medium">{anime.dubCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <h3 className="font-medium text-sm line-clamp-2 group-hover:text-fox-orange transition-colors">
          {anime.title}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-auto">
          <span>{anime.type}</span>
          <span>•</span>
          <span>{anime.duration}</span>
        </div>
      </div>
    </Link>
  );
};

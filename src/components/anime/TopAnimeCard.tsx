import { Link } from 'react-router-dom';
import { Captions, Mic } from 'lucide-react';
import { TopAnime } from '@/types/anime';
import { cn } from '@/lib/utils';

interface TopAnimeCardProps {
  item: TopAnime;
  className?: string;
  style?: React.CSSProperties;
}

export const TopAnimeCard = ({ item, className, style }: TopAnimeCardProps) => {
  const { rank, anime } = item;

  return (
    <Link
      to={`/anime/${anime.id}`}
      style={style}
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg hover:bg-fox-surface transition-colors group',
        className
      )}
    >
      {/* Rank */}
      <div className="flex-shrink-0 w-8 text-center">
        <span className={cn(
          'text-xl font-bold',
          rank <= 3 ? 'text-fox-orange' : 'text-muted-foreground'
        )}>
          {rank.toString().padStart(2, '0')}
        </span>
      </div>

      {/* Image */}
      <div className="flex-shrink-0 w-14 h-20 rounded overflow-hidden">
        <img
          src={anime.image}
          alt={anime.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm line-clamp-2 group-hover:text-fox-orange transition-colors">
          {anime.title}
        </h4>
        <div className="flex items-center gap-2 mt-1">
          {anime.subCount !== undefined && anime.subCount > 0 && (
            <div className="flex items-center gap-1">
              <Captions className="w-3 h-3 text-badge-sub" />
              <span className="text-xs text-muted-foreground">{anime.subCount}</span>
            </div>
          )}
          {anime.dubCount !== undefined && anime.dubCount > 0 && (
            <div className="flex items-center gap-1">
              <Mic className="w-3 h-3 text-badge-dub" />
              <span className="text-xs text-muted-foreground">{anime.dubCount}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

import { Link } from 'react-router-dom';
import { Captions, Mic, Play } from 'lucide-react';
import { TopAnime } from '@/types/anime';
import { cn } from '@/lib/utils';

interface TopAnimeCardProps {
  item: TopAnime;
  className?: string;
  style?: React.CSSProperties;
}

export const TopAnimeCard = ({ item, className, style }: TopAnimeCardProps) => {
  const { rank, anime } = item;

  // Rank colors for top 3
  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30';
    if (rank === 2) return 'bg-gradient-to-br from-zinc-300 to-zinc-500 text-white shadow-lg shadow-zinc-400/30';
    if (rank === 3) return 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/30';
    return 'bg-fox-surface text-muted-foreground';
  };

  return (
    <Link
      to={`/watch?id=${encodeURIComponent(anime.id)}`}
      style={style}
      className={cn(
        'flex items-center gap-3 p-2.5 rounded-xl hover:bg-fox-surface/80 transition-all duration-200 group',
        className
      )}
    >
      {/* Rank Badge */}
      <div className={cn(
        'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-transform group-hover:scale-110',
        getRankStyle(rank)
      )}>
        {rank}
      </div>

      {/* Image */}
      <div className="relative flex-shrink-0 w-12 h-16 rounded-lg overflow-hidden ring-1 ring-white/10 group-hover:ring-fox-orange/50 transition-all">
        <img
          src={anime.image}
          alt={anime.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          loading="lazy"
        />
        {/* Play overlay on hover */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Play className="w-4 h-4 text-white fill-white" />
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm line-clamp-1 group-hover:text-fox-orange transition-colors">
          {anime.title}
        </h4>
        <div className="flex items-center gap-3 mt-1">
          {anime.subCount !== undefined && anime.subCount > 0 && (
            <div className="flex items-center gap-1">
              <Captions className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] text-muted-foreground font-medium">{anime.subCount}</span>
            </div>
          )}
          {anime.dubCount !== undefined && anime.dubCount > 0 && (
            <div className="flex items-center gap-1">
              <Mic className="w-3 h-3 text-green-400" />
              <span className="text-[10px] text-muted-foreground font-medium">{anime.dubCount}</span>
            </div>
          )}
          {anime.type && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {anime.type}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};

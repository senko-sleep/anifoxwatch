import { Link, useLocation } from 'react-router-dom';
import { Captions, Mic, Play } from 'lucide-react';
import { TopAnime } from '@/types/anime';
import { cn, stripSourcePrefix, pickAnimePoster } from '@/lib/utils';

interface TopAnimeCardProps {
  item: TopAnime;
  className?: string;
  style?: React.CSSProperties;
}

export const TopAnimeCard = ({ item, className, style }: TopAnimeCardProps) => {
  const { rank, anime } = item;
  const location = useLocation();

  // Rank colors for top 3
  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-br from-amber-500/90 to-amber-700/90 text-white shadow-sm';
    if (rank === 2) return 'bg-gradient-to-br from-zinc-400 to-zinc-600 text-white shadow-sm';
    if (rank === 3) return 'bg-gradient-to-br from-orange-500/80 to-orange-700/80 text-white shadow-sm';
    return 'bg-zinc-800/80 text-zinc-400 border border-white/[0.06]';
  };

  return (
    <Link
      to={`/watch?id=${encodeURIComponent(anime.id)}`}
      style={style}
      state={{ from: location.pathname + location.search }}
      className={cn(
        'flex items-center gap-3 p-2.5 rounded-xl border border-transparent hover:border-white/[0.06] hover:bg-white/[0.03] transition-all duration-200 group',
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
          src={posterSrc || undefined}
          alt={anime.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        {/* Play overlay on hover */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Play className="w-4 h-4 text-white fill-white" />
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm text-zinc-100 line-clamp-1 group-hover:text-white transition-colors">
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
          {anime.type && anime.type !== 'TV' && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {anime.type}
            </span>
          )}
          {(anime as any).episodes > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {(anime as any).episodes} eps
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};

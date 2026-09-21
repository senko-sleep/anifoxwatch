import { useMemo } from 'react';
import type { Anime } from '@/types/anime';
import { PosterCard } from './PosterCard';
import { WatchHistory } from '@/lib/watch-history';

interface AnimeCardProps {
  anime: Anime;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
  onMouseEnter?: (e: React.MouseEvent) => void;
}

/**
 * Grid card. All presentation lives in PosterCard — this only adds the
 * viewer's own history, so a half-watched show says so wherever it appears.
 */
export const AnimeCard = ({ anime, className, style, priority, onMouseEnter }: AnimeCardProps) => {
  const entry = useMemo(
    () => WatchHistory.get().find((h) => h.animeId === anime.id),
    [anime.id]
  );

  return (
    <PosterCard
      anime={anime}
      className={className}
      style={style}
      priority={priority}
      onMouseEnter={onMouseEnter}
      progress={entry?.progress}
      resumeEpisode={entry?.episodeNumber}
    />
  );
};

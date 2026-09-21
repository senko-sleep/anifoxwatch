import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { WatchHistory } from '@/lib/watch-history';
import { PosterCard, PosterCardSkeleton, type PosterCardItem } from '@/components/anime/PosterCard';

interface AnimeSliderProps {
  anime: PosterCardItem[];
  cardSize?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

/**
 * A horizontal shelf of posters. Scroll-snapped so a flick always lands on a
 * card edge. No overlays on the ends — the artwork is shown raw.
 */
const CARD_WIDTH: Record<NonNullable<AnimeSliderProps['cardSize']>, string> = {
  sm: 'w-[7.5rem] sm:w-[8.5rem] lg:w-[9.5rem]',
  md: 'w-[8.75rem] sm:w-[10rem] lg:w-[11.5rem]',
  lg: 'w-[10.5rem] sm:w-[12.5rem] lg:w-[14rem]',
};

export const AnimeSlider = ({ anime, cardSize = 'md', loading = false }: AnimeSliderProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const history = WatchHistory.get();

  if (loading) {
    return (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <PosterCardSkeleton key={i} className={cn('shrink-0', CARD_WIDTH[cardSize])} />
        ))}
      </div>
    );
  }

  if (!anime?.length) return null;

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="scrollbar-hide -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 sm:gap-5"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {anime.map((item, i) => {
          const entry = history.find((h) => h.animeId === item.id);
          return (
            <PosterCard
              key={`${item.id}-${i}`}
              anime={item}
              priority={i < 5}
              progress={entry?.progress}
              resumeEpisode={entry?.episodeNumber}
              className={cn('shrink-0 snap-start', CARD_WIDTH[cardSize])}
            />
          );
        })}
      </div>
    </div>
  );
};


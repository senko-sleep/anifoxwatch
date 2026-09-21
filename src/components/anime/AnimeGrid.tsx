import type { Anime } from '@/types/anime';
import { AnimeCard } from './AnimeCard';
import { PosterCardSkeleton } from './PosterCard';
import { cn } from '@/lib/utils';
import { usePrefetchAnime } from '@/hooks/useAnime';

interface AnimeGridProps {
  anime: Anime[];
  title?: string;
  className?: string;
  columns?: 'auto' | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  /** Renders placeholder cards instead of content, at the same density. */
  loading?: boolean;
  loadingCount?: number;
}

/**
 * The catalogue grid. Column counts step with the viewport rather than
 * squeezing posters, so artwork keeps its proportions at every width.
 */
const COLUMN_CLASSES: Record<Exclude<AnimeGridProps['columns'], undefined>, string> = {
  auto: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
  7: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7',
  8: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8',
  9: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-9',
  10: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10',
};

export const AnimeGrid = ({
  anime,
  title,
  className,
  columns = 'auto',
  loading = false,
  loadingCount = 18,
}: AnimeGridProps) => {
  const prefetchAnime = usePrefetchAnime();
  const cols = COLUMN_CLASSES[columns];

  return (
    <section className={cn('w-full', className)}>
      {title && <h2 className="section-title mb-5 text-xl sm:text-2xl">{title}</h2>}

      <div className={cn('grid gap-x-4 gap-y-7 sm:gap-x-5 sm:gap-y-8', cols)}>
        {loading
          ? Array.from({ length: loadingCount }).map((_, i) => <PosterCardSkeleton key={i} />)
          : anime.map((item, i) => (
              <AnimeCard
                key={`${item.id}-${i}`}
                anime={item}
                priority={i < 6}
                onMouseEnter={() => prefetchAnime(item.id)}
              />
            ))}
      </div>
    </section>
  );
};

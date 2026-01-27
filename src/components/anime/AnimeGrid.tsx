import { Anime } from '@/types/anime';
import { AnimeCard } from './AnimeCard';
import { cn } from '@/lib/utils';
import { usePrefetchAnime } from '@/hooks/useAnime';

interface AnimeGridProps {
  anime: Anime[];
  title?: string;
  className?: string;
  columns?: 'auto' | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
}

export const AnimeGrid = ({ anime, title, className, columns = 'auto' }: AnimeGridProps) => {
  const prefetchAnime = usePrefetchAnime();

  const gridCols = columns === 'auto'
    ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
    : {
      2: 'grid-cols-2',
      3: 'grid-cols-2 sm:grid-cols-3',
      4: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
      5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
      6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
      7: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7',
      8: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8',
      9: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9',
      10: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10'
    }[columns];

  return (
    <section className={cn('w-full', className)}>
      {title && (
        <h2 className="text-xl font-bold mb-6 bg-gradient-to-r from-fox-orange to-orange-400 bg-clip-text text-transparent">
          {title}
        </h2>
      )}
      <div className={cn('grid gap-4 sm:gap-5', gridCols)}>
        {anime.map((item, index) => (
          <AnimeCard
            key={item.id}
            anime={item}
            className="animate-fade-in"
            style={{ animationDelay: `${Math.min(index * 30, 300)}ms` } as React.CSSProperties}
            onMouseEnter={() => prefetchAnime(item.id)}
          />
        ))}
      </div>
    </section>
  );
};

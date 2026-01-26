import { Anime } from '@/types/anime';
import { AnimeCard } from './AnimeCard';
import { cn } from '@/lib/utils';

interface AnimeGridProps {
  anime: Anime[];
  title?: string;
  className?: string;
}

export const AnimeGrid = ({ anime, title, className }: AnimeGridProps) => {
  return (
    <section className={cn('w-full', className)}>
      {title && (
        <h2 className="text-xl font-bold mb-4 text-fox-orange">{title}</h2>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {anime.map((item, index) => (
          <AnimeCard 
            key={item.id} 
            anime={item} 
            className="animate-fade-in"
            style={{ animationDelay: `${index * 50}ms` } as React.CSSProperties}
          />
        ))}
      </div>
    </section>
  );
};

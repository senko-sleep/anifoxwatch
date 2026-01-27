import { useState } from 'react';
import { TopAnime } from '@/types/anime';
import { TopAnimeCard } from './TopAnimeCard';
import { cn } from '@/lib/utils';

interface TopAnimeListProps {
  items: TopAnime[];
  className?: string;
}

type TimeFilter = 'today' | 'week' | 'month';

export const TopAnimeList = ({ items, className }: TopAnimeListProps) => {
  const [activeFilter, setActiveFilter] = useState<TimeFilter>('today');

  const filters: { key: TimeFilter; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ];

  return (
    <aside className={cn('w-full', className)}>
      {/* Time Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-background/50 rounded-xl mb-4">
        {filters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setActiveFilter(filter.key)}
            className={cn(
              'flex-1 px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200',
              activeFilter === filter.key
                ? 'bg-fox-orange text-white shadow-md shadow-fox-orange/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-1">
        {items.slice(0, 10).map((item, index) => (
          <TopAnimeCard
            key={item.anime.id}
            item={item}
            className="animate-fade-in"
            style={{ animationDelay: `${index * 50}ms` } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Empty State */}
      {items.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No rankings available
        </div>
      )}
    </aside>
  );
};

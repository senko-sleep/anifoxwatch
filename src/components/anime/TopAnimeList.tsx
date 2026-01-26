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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-fox-orange">Top 10</h2>
        <div className="flex items-center gap-1 bg-fox-surface rounded-lg p-1">
          {filters.map((filter) => (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                activeFilter === filter.key
                  ? 'bg-fox-orange text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
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
    </aside>
  );
};

import { Link, useLocation } from 'react-router-dom';
import { Star, TrendingUp } from 'lucide-react';
import { Anime } from '@/types/anime';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface WeeklyLeaderboardProps {
    anime: Anime[];
    isLoading?: boolean;
}

export const WeeklyLeaderboard = ({ anime, isLoading }: WeeklyLeaderboardProps) => {
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-4 p-3 rounded-xl bg-fox-surface/30 animate-pulse">
                        <div className="w-8 h-8 rounded-full bg-fox-surface/50" />
                        <div className="w-12 h-16 rounded-lg bg-fox-surface/50" />
                        <div className="flex-1 py-1 space-y-2">
                            <div className="h-4 w-3/4 rounded bg-fox-surface/50" />
                            <div className="h-3 w-1/4 rounded bg-fox-surface/50" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (!anime || anime.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground bg-fox-surface/10 rounded-xl">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No leaderboard data available.</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {anime.map((item, index) => {
                const rank = index + 1;

                return (
                    <div
                        key={item.id}
                        className="group flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5"
                    >
                        {/* Rank */}
                        <div className="w-8 flex flex-col items-center justify-center gap-1">
                            <span className={cn(
                                "font-black text-lg",
                                rank === 1 ? "text-yellow-500" :
                                    rank === 2 ? "text-zinc-300" :
                                        rank === 3 ? "text-amber-700" : "text-muted-foreground"
                            )}>
                                {rank}
                            </span>
                        </div>

                        {/* Image */}
                        <Link
                            to={`/watch?id=${encodeURIComponent(item.id)}`}
                            state={{ from: location.pathname + location.search }}
                            className="shrink-0 relative w-12 h-16 rounded-lg overflow-hidden"
                        >
                            <img
                                src={item.image}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            />
                        </Link>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <Link
                                to={`/watch?id=${encodeURIComponent(item.id)}`}
                                state={{ from: location.pathname + location.search }}
                            >
                                <h4 className="font-medium text-sm text-zinc-200 group-hover:text-fox-orange transition-colors truncate">
                                    {item.title}
                                </h4>
                            </Link>

                            <div className="flex items-center gap-3 mt-1 text-xs">
                                {item.rating && (
                                    <div className="flex items-center gap-1 text-amber-400">
                                        <Star className="w-3 h-3 fill-amber-400" />
                                        <span className="font-bold">
                                            {(item.rating > 10 ? item.rating / 10 : item.rating).toFixed(1)}
                                        </span>
                                    </div>
                                )}
                                <span className="text-muted-foreground">Rank: {rank}</span>
                            </div>
                        </div>
                    </div>
                );
            })}

            <Link to="/search?sort=trending" className="block mt-4">
                <Button variant="outline" size="sm" className="w-full text-xs border-white/10 hover:bg-white/5">
                    View Full Leaderboard
                </Button>
            </Link>
        </div>
    );
};

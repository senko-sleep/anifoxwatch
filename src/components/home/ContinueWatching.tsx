import { Link, useLocation } from 'react-router-dom';
import { Play, X, Clock } from 'lucide-react';
import { WatchHistoryItem } from '@/lib/watch-history';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface ContinueWatchingProps {
    items: WatchHistoryItem[];
    onRemove: (id: string) => void;
}

export const ContinueWatching = ({ items, onRemove }: ContinueWatchingProps) => {
    const location = useLocation();

    if (!items || items.length === 0) return null;

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {items.map((item) => (
                    <div key={item.animeId} className="group relative flex gap-4 p-3 rounded-xl bg-fox-surface/40 hover:bg-fox-surface/60 transition-colors border border-white/5">
                        {/* Image */}
                        <Link
                            to={`/watch?id=${encodeURIComponent(item.animeId)}&ep=${item.episodeNumber}`}
                            state={{ from: location.pathname + location.search }}
                            className="shrink-0 relative w-20 h-28 rounded-lg overflow-hidden block"
                        >
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors z-10" />
                            <img
                                src={item.animeImage}
                                alt={item.animeTitle}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                                <div
                                    className="h-full bg-fox-orange"
                                    style={{ width: `${Math.min(100, item.progress * 100)}%` }}
                                />
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                <div className="bg-fox-orange/90 rounded-full p-1.5 shadow-lg">
                                    <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                                </div>
                            </div>
                        </Link>

                        {/* Info */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <Link
                                to={`/watch?id=${encodeURIComponent(item.animeId)}&ep=${item.episodeNumber}`}
                                state={{ from: location.pathname + location.search }}
                            >
                                <h4 className="font-semibold text-sm text-zinc-200 group-hover:text-fox-orange transition-colors line-clamp-2 leading-tight mb-1">
                                    {item.animeTitle}
                                </h4>
                            </Link>

                            <div className="text-xs text-muted-foreground mb-2">
                                <span className="text-fox-orange font-medium">Episode {item.episodeNumber}</span>
                                {item.animeSeason && (
                                    <>
                                        <span className="mx-1">•</span>
                                        <span className="capitalize">{item.animeSeason}</span>
                                    </>
                                )}
                                <span className="mx-1">•</span>
                                <span>{Math.floor((item.duration - item.timestamp) / 60)}m left</span>
                            </div>

                            {/* Remove Button */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 hover:text-red-400"
                                onClick={(e) => {
                                    e.preventDefault();
                                    onRemove(item.animeId);
                                }}
                                title="Remove from history"
                            >
                                <X className="w-3 h-3" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

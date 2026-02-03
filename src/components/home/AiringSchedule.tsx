import { Link, useLocation } from 'react-router-dom';
import { Clock, Calendar } from 'lucide-react';
import { ScheduleItem } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface AiringScheduleProps {
    schedule: ScheduleItem[];
    isLoading?: boolean;
}

export const AiringSchedule = ({ schedule, isLoading }: AiringScheduleProps) => {
    const location = useLocation();
    // Filter only for today (if needed, but usually the API returns relevant sorted data)
    // For this component we'll take the first 4-5 items or just list what's passed

    const formatTime = (timestamp: number) => {
        return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatTimeUntil = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-4 p-3 rounded-xl bg-fox-surface/30 animate-pulse">
                        <div className="w-16 h-24 rounded-lg bg-fox-surface/50" />
                        <div className="flex-1 py-1 space-y-2">
                            <div className="h-4 w-3/4 rounded bg-fox-surface/50" />
                            <div className="h-3 w-1/2 rounded bg-fox-surface/50" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (!schedule || schedule.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground bg-fox-surface/10 rounded-xl">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No anime airing right now.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {schedule.map((item) => (
                <div
                    key={item.id}
                    className="group relative flex gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5"
                >
                    {/* Image */}
                    <Link
                        to={`/watch?id=${encodeURIComponent(item.id)}`}
                        state={{ from: location.pathname + location.search }}
                        className="shrink-0 relative w-16 h-20 rounded-lg overflow-hidden"
                    >
                        <img
                            src={item.media?.thumbnail}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                    </Link>

                    {/* Info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                        <Link
                            to={`/watch?id=${encodeURIComponent(item.id)}`}
                            state={{ from: location.pathname + location.search }}
                        >
                            <h4 className="font-medium text-sm text-zinc-200 group-hover:text-fox-orange transition-colors truncate">
                                {item.title}
                            </h4>
                        </Link>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1 text-fox-orange bg-fox-orange/10 px-1.5 py-0.5 rounded">
                                EP {item.episode}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTime(item.airingAt)}
                            </span>
                        </div>

                        <p className="text-xs text-zinc-500 mt-0.5">
                            Airing in <span className="text-zinc-300 font-medium">{formatTimeUntil(item.timeUntilAiring)}</span>
                        </p>
                    </div>

                    {/* Quick Action */}
                    <div className="flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                            to={`/watch?id=${encodeURIComponent(item.id)}`}
                            state={{ from: location.pathname + location.search }}
                        >
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full hover:bg-fox-orange hover:text-white">
                                <Clock className="w-4 h-4" />
                            </Button>
                        </Link>
                    </div>
                </div>
            ))}

            <Link to="/schedule" className="block mt-4">
                <Button variant="outline" className="w-full text-xs h-9">
                    View Full Schedule
                </Button>
            </Link>
        </div>
    );
};

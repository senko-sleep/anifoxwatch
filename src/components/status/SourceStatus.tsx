import { useSourceHealth, useRefreshSourceHealth } from '@/hooks/useAnime';
import { RefreshCw, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const SourceStatus = () => {
    const { data: sources, isLoading } = useSourceHealth();
    const refreshMutation = useRefreshSourceHealth();

    if (isLoading || !sources) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                Checking sources...
            </div>
        );
    }

    const onlineCount = sources.filter(s => s.status === 'online').length;
    const totalCount = sources.length;
    const allOnline = onlineCount === totalCount;
    const allOffline = onlineCount === 0;

    return (
        <div className="flex items-center gap-4">
            {/* Status Indicator */}
            <div className="flex items-center gap-2">
                {allOnline ? (
                    <Wifi className="w-4 h-4 text-green-500" />
                ) : allOffline ? (
                    <WifiOff className="w-4 h-4 text-red-500" />
                ) : (
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                )}
                <span className={cn(
                    "text-sm font-medium",
                    allOnline ? "text-green-500" : allOffline ? "text-red-500" : "text-yellow-500"
                )}>
                    {onlineCount}/{totalCount} Online
                </span>
            </div>

            {/* Source Pills */}
            <div className="hidden sm:flex items-center gap-1.5">
                {sources.map(source => (
                    <div
                        key={source.name}
                        className={cn(
                            "px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
                            source.status === 'online'
                                ? "bg-green-500/20 text-green-500"
                                : source.status === 'degraded'
                                    ? "bg-yellow-500/20 text-yellow-500"
                                    : "bg-red-500/20 text-red-500"
                        )}
                        title={`${source.name}: ${source.latency ? `${source.latency}ms` : 'N/A'}`}
                    >
                        {source.name}
                    </div>
                ))}
            </div>

            {/* Refresh Button */}
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
            >
                <RefreshCw className={cn(
                    "w-3.5 h-3.5 text-muted-foreground",
                    refreshMutation.isPending && "animate-spin"
                )} />
            </Button>
        </div>
    );
};

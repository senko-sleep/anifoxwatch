import { useSourceHealth, useRefreshSourceHealth } from '@/hooks/useAnime';
import { RefreshCw, Wifi, WifiOff, AlertCircle, Server, Activity, Zap, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface SourceHealth {
    name: string;
    status: 'online' | 'offline' | 'degraded';
    latency?: number;
    lastCheck?: string | Date;
}

export const SourceStatusPanel = () => {
    const { data: sources, isLoading } = useSourceHealth();
    const refreshMutation = useRefreshSourceHealth();
    const [showAll, setShowAll] = useState(false);

    if (isLoading || !sources) {
        return (
            <div className="bg-gradient-to-br from-fox-surface/40 to-fox-surface/20 rounded-2xl p-6 border border-white/5 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-fox-orange/20 flex items-center justify-center">
                        <Server className="w-5 h-5 text-fox-orange animate-pulse" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">Streaming Sources</h3>
                        <p className="text-sm text-muted-foreground">Checking availability...</p>
                    </div>
                </div>
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-8 bg-fox-surface/50 rounded-lg animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    const onlineSources = sources.filter((s: SourceHealth) => s.status === 'online');
    const offlineSources = sources.filter((s: SourceHealth) => s.status === 'offline');
    const degradedSources = sources.filter((s: SourceHealth) => s.status === 'degraded');
    
    const displaySources = showAll ? sources : sources.slice(0, 12);
    const healthPercentage = Math.round((onlineSources.length / sources.length) * 100);

    return (
        <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/60 rounded-2xl p-6 border border-slate-700/50 backdrop-blur-xl shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Server className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-white">Streaming Sources</h3>
                        <p className="text-sm text-slate-400">
                            {onlineSources.length} of {sources.length} available
                        </p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl hover:bg-slate-700/50 text-slate-400 hover:text-white"
                    onClick={() => refreshMutation.mutate()}
                    disabled={refreshMutation.isPending}
                >
                    <RefreshCw className={cn(
                        "w-4 h-4",
                        refreshMutation.isPending && "animate-spin text-indigo-400"
                    )} />
                </Button>
            </div>

            {/* Health Bar */}
            <div className="mb-6">
                <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-400">System Health</span>
                    <span className={cn(
                        "font-semibold",
                        healthPercentage >= 70 ? "text-emerald-400" : 
                        healthPercentage >= 40 ? "text-amber-400" : "text-rose-400"
                    )}>
                        {healthPercentage}%
                    </span>
                </div>
                <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <div 
                        className={cn(
                            "h-full rounded-full transition-all duration-500",
                            healthPercentage >= 70 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : 
                            healthPercentage >= 40 ? "bg-gradient-to-r from-amber-500 to-amber-400" : 
                            "bg-gradient-to-r from-rose-500 to-rose-400"
                        )}
                        style={{ width: `${healthPercentage}%` }}
                    />
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-emerald-500/10 rounded-xl p-3 text-center border border-emerald-500/20">
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-lg font-bold text-emerald-400">{onlineSources.length}</span>
                    </div>
                    <span className="text-xs text-emerald-400/80">Online</span>
                </div>
                <div className="bg-amber-500/10 rounded-xl p-3 text-center border border-amber-500/20">
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <Activity className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-lg font-bold text-amber-400">{degradedSources.length}</span>
                    </div>
                    <span className="text-xs text-amber-400/80">Degraded</span>
                </div>
                <div className="bg-rose-500/10 rounded-xl p-3 text-center border border-rose-500/20">
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                        <span className="text-lg font-bold text-rose-400">{offlineSources.length}</span>
                    </div>
                    <span className="text-xs text-rose-400/80">Offline</span>
                </div>
            </div>

            {/* Source List */}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                {displaySources.map((source: SourceHealth, index: number) => (
                    <div
                        key={source.name}
                        className={cn(
                            "flex items-center justify-between p-3 rounded-xl transition-all duration-200",
                            source.status === 'online' 
                                ? "bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10" 
                                : source.status === 'degraded'
                                    ? "bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/10"
                                    : "bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10"
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-2 h-2 rounded-full",
                                source.status === 'online' ? "bg-emerald-400 shadow-lg shadow-emerald-400/50" :
                                source.status === 'degraded' ? "bg-amber-400 shadow-lg shadow-amber-400/50" :
                                "bg-rose-400 shadow-lg shadow-rose-400/50"
                            )} />
                            <div>
                                <span className="text-sm font-medium text-white">{source.name}</span>
                                {index === 0 && source.status === 'online' && (
                                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                                        Primary
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {source.latency && source.status === 'online' && (
                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <Zap className="w-3 h-3" />
                                    {source.latency}ms
                                </span>
                            )}
                            {source.status === 'online' ? (
                                <Wifi className="w-4 h-4 text-emerald-400" />
                            ) : source.status === 'degraded' ? (
                                <AlertCircle className="w-4 h-4 text-amber-400" />
                            ) : (
                                <WifiOff className="w-4 h-4 text-rose-400" />
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Show More/Less Button */}
            {sources.length > 12 && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-4 text-xs text-slate-400 hover:text-white hover:bg-slate-700/50"
                    onClick={() => setShowAll(!showAll)}
                >
                    {showAll ? `Show Less` : `Show All ${sources.length} Sources`}
                </Button>
            )}

            {/* Footer Info */}
            <div className="mt-4 pt-4 border-t border-slate-700/50">
                <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        <span>Multi-source aggregation</span>
                    </div>
                    <span>Auto-failover enabled</span>
                </div>
            </div>
        </div>
    );
};

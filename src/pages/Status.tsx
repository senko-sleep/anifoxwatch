import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { useSourceHealth, useRefreshSourceHealth } from '@/hooks/useAnime';
import { Server, Activity, CheckCircle, XCircle, AlertTriangle, RefreshCw, Wifi, Clock, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const Status = () => {
  useDocumentTitle('System Status');
  const { data: healthData, isLoading, refetch } = useSourceHealth();
  const refreshMutation = useRefreshSourceHealth();

  const handleRefresh = async () => {
    await refreshMutation.mutateAsync();
    refetch();
  };

  const onlineSources = healthData?.filter(s => s.status === 'online') || [];
  const offlineSources = healthData?.filter(s => s.status === 'offline') || [];
  const degradedSources = healthData?.filter(s => s.status === 'degraded') || [];

  const totalSources = healthData?.length || 0;
  const healthPercentage = totalSources > 0 ? Math.round((onlineSources.length / totalSources) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fox-orange to-orange-600 flex items-center justify-center">
              <Server className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">System Status</h1>
              <p className="text-muted-foreground">Monitor streaming source health and availability</p>
            </div>
          </div>
          <Button 
            onClick={handleRefresh}
            disabled={refreshMutation.isPending || isLoading}
            className="gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", (refreshMutation.isPending || isLoading) && "animate-spin")} />
            Refresh Status
          </Button>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-fox-surface/30 rounded-2xl p-6 border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <span className="text-muted-foreground">Online</span>
            </div>
            <p className="text-3xl font-bold text-green-500">{onlineSources.length}</p>
          </div>

          <div className="bg-fox-surface/30 rounded-2xl p-6 border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              </div>
              <span className="text-muted-foreground">Degraded</span>
            </div>
            <p className="text-3xl font-bold text-yellow-500">{degradedSources.length}</p>
          </div>

          <div className="bg-fox-surface/30 rounded-2xl p-6 border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <span className="text-muted-foreground">Offline</span>
            </div>
            <p className="text-3xl font-bold text-red-500">{offlineSources.length}</p>
          </div>

          <div className="bg-fox-surface/30 rounded-2xl p-6 border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-fox-orange/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-fox-orange" />
              </div>
              <span className="text-muted-foreground">Health</span>
            </div>
            <p className="text-3xl font-bold text-fox-orange">{healthPercentage}%</p>
          </div>
        </div>

        {/* Health Bar */}
        <div className="bg-fox-surface/30 rounded-2xl p-6 border border-white/5 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Overall System Health</h2>
            <span className={cn(
              "px-3 py-1 rounded-full text-sm font-medium",
              healthPercentage >= 80 ? "bg-green-500/20 text-green-400" :
              healthPercentage >= 50 ? "bg-yellow-500/20 text-yellow-400" :
              "bg-red-500/20 text-red-400"
            )}>
              {healthPercentage >= 80 ? "Healthy" : healthPercentage >= 50 ? "Degraded" : "Critical"}
            </span>
          </div>
          <div className="h-4 bg-fox-dark rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all duration-500 rounded-full",
                healthPercentage >= 80 ? "bg-gradient-to-r from-green-500 to-emerald-500" :
                healthPercentage >= 50 ? "bg-gradient-to-r from-yellow-500 to-amber-500" :
                "bg-gradient-to-r from-red-500 to-rose-500"
              )}
              style={{ width: `${healthPercentage}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            {onlineSources.length} of {totalSources} streaming sources are currently available
          </p>
        </div>

        {/* Source List */}
        <div className="bg-fox-surface/30 rounded-2xl border border-white/5 overflow-hidden">
          <div className="p-6 border-b border-white/5">
            <h2 className="text-lg font-semibold">All Streaming Sources</h2>
            <p className="text-sm text-muted-foreground">Detailed status of each streaming provider</p>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Loading source status...</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {healthData?.map((source) => (
                <div key={source.name} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      source.status === 'online' ? "bg-green-500" :
                      source.status === 'degraded' ? "bg-yellow-500" :
                      "bg-red-500"
                    )} />
                    <div>
                      <p className="font-medium">{source.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{source.status}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    {source.latency && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Zap className="w-4 h-4" />
                        <span>{source.latency}ms</span>
                      </div>
                    )}
                    {source.lastCheck && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>{new Date(source.lastCheck).toLocaleTimeString()}</span>
                      </div>
                    )}
                    <span className={cn(
                      "px-2 py-1 rounded text-xs font-medium",
                      source.status === 'online' ? "bg-green-500/20 text-green-400" :
                      source.status === 'degraded' ? "bg-yellow-500/20 text-yellow-400" :
                      "bg-red-500/20 text-red-400"
                    )}>
                      {source.status === 'online' ? 'Available' : source.status === 'degraded' ? 'Slow' : 'Unavailable'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-8 p-6 bg-blue-500/10 rounded-2xl border border-blue-500/20">
          <div className="flex items-start gap-4">
            <Wifi className="w-6 h-6 text-blue-400 shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-blue-400 mb-2">About Source Health</h3>
              <p className="text-sm text-muted-foreground">
                This page shows the real-time status of all streaming sources. Sources are checked periodically 
                and marked as online, degraded, or offline based on their response times and availability. 
                If a source is offline, the system will automatically try alternative sources when streaming.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Status;

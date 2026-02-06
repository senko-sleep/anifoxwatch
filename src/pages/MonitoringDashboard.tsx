/**
 * Monitoring Dashboard
 * Displays stream health status, genre completion rates, and search analytics
 */

import { useState, useEffect } from 'react';
import { 
    Activity, Wifi, WifiOff, Clock, TrendingUp, Search, 
    Server, AlertTriangle, CheckCircle, RefreshCw, Download
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface StreamHealthData {
    name: string;
    status: 'online' | 'offline' | 'degraded';
    latency?: number;
    lastCheck: string;
    successRate?: number;
    capabilities?: {
        supportsDub: boolean;
        supportsSub: boolean;
        hasScheduleData: boolean;
        hasGenreFiltering: boolean;
        quality: 'high' | 'medium' | 'low';
    };
}

interface GenreCompletionData {
    totalAnime: number;
    withGenres: number;
    withoutGenres: number;
    completionRate: number;
    topGenres: { genre: string; count: number }[];
}

interface SearchAnalytics {
    totalSearches: number;
    popularQueries: { query: string; count: number }[];
    avgResponseTime: number;
    failedSearches: number;
}

interface VerificationResult {
    source: string;
    status: 'pass' | 'fail' | 'warning';
    responseTime: number;
    error?: string;
    details: {
        searchWorks: boolean;
        animeInfoWorks: boolean;
        episodesWorks: boolean;
        streamingWorks: boolean;
    };
}

export const MonitoringDashboard = () => {
    const [streamHealth, setStreamHealth] = useState<StreamHealthData[]>([]);
    const [genreData, setGenreData] = useState<GenreCompletionData | null>(null);
    const [searchAnalytics, setSearchAnalytics] = useState<SearchAnalytics | null>(null);
    const [verificationResults, setVerificationResults] = useState<VerificationResult[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isVerifying, setIsVerifying] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [activeTab, setActiveTab] = useState<'health' | 'genres' | 'verification' | 'analytics'>('health');

    // Fetch monitoring data
    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Fetch stream health
            const health = await apiClient.getSourceHealthEnhanced();
            const typedHealth: StreamHealthData[] = health.map(h => ({
                name: h.name,
                status: h.status as 'online' | 'offline' | 'degraded',
                latency: h.avgLatency,
                lastCheck: h.lastCheck,
                successRate: h.successRate,
                capabilities: h.capabilities
            }));
            setStreamHealth(typedHealth);

            // Fetch verification results
            const verification = await fetchVerificationResults();
            setVerificationResults(verification);

            // Mock genre data (would come from API in production)
            setGenreData({
                totalAnime: 1250,
                withGenres: 1180,
                withoutGenres: 70,
                completionRate: 94.4,
                topGenres: [
                    { genre: 'Action', count: 450 },
                    { genre: 'Comedy', count: 380 },
                    { genre: 'Adventure', count: 320 },
                    { genre: 'Fantasy', count: 280 },
                    { genre: 'Romance', count: 220 },
                    { genre: 'Sci-Fi', count: 180 },
                    { genre: 'Drama', count: 150 },
                    { genre: 'Horror', count: 90 },
                    { genre: 'Mystery', count: 75 },
                    { genre: 'Sports', count: 60 }
                ]
            });

            // Mock search analytics (would come from API in production)
            setSearchAnalytics({
                totalSearches: 15847,
                popularQueries: [
                    { query: 'Naruto', count: 2341 },
                    { query: 'One Piece', count: 1892 },
                    { query: 'Dragon Ball', count: 1654 },
                    { query: 'Attack on Titan', count: 1423 },
                    { query: 'Demon Slayer', count: 1287 },
                    { query: 'My Hero Academia', count: 987 },
                    { query: 'Fullmetal Alchemist', count: 876 },
                    { query: 'Death Note', count: 765 },
                    { query: 'Tokyo Revengers', count: 654 },
                    { query: 'Jujutsu Kaisen', count: 543 }
                ],
                avgResponseTime: 245,
                failedSearches: 234
            });

            setLastUpdate(new Date());
        } catch (error) {
            console.error('Failed to fetch monitoring data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch verification results from API
    const fetchVerificationResults = async (): Promise<VerificationResult[]> => {
        try {
            const response = await fetch('/api/monitoring/verification');
            if (response.ok) {
                return await response.json();
            }
        } catch {
            console.error('Failed to fetch verification results');
        }
        return [];
    };

    // Run source verification
    const runVerification = async () => {
        setIsVerifying(true);
        try {
            const response = await fetch('/api/monitoring/verify', { method: 'POST' });
            if (response.ok) {
                const results = await response.json();
                setVerificationResults(results);
            }
        } catch (error) {
            console.error('Verification failed:', error);
        } finally {
            setIsVerifying(false);
        }
    };

    // Initial data fetch
    useEffect(() => {
        fetchData();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    // Get health color
    const getHealthColor = (status: string) => {
        switch (status) {
            case 'online': return 'text-green-500';
            case 'degraded': return 'text-yellow-500';
            case 'offline': return 'text-red-500';
            default: return 'text-gray-500';
        }
    };

    // Get health icon
    const getHealthIcon = (status: string) => {
        switch (status) {
            case 'online': return <Wifi className="w-4 h-4 text-green-500" />;
            case 'degraded': return <Activity className="w-4 h-4 text-yellow-500" />;
            case 'offline': return <WifiOff className="w-4 h-4 text-red-500" />;
            default: return <Activity className="w-4 h-4 text-gray-500" />;
        }
    };

    // Calculate stats
    const onlineCount = streamHealth.filter(s => s.status === 'online').length;
    const degradedCount = streamHealth.filter(s => s.status === 'degraded').length;
    const offlineCount = streamHealth.filter(s => s.status === 'offline').length;
    const totalCount = streamHealth.length || 1;
    const healthPercentage = Math.round(((onlineCount + degradedCount * 0.5) / totalCount) * 100);

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Monitoring Dashboard</h1>
                        <p className="text-muted-foreground">Stream health, genre completion, and search analytics</p>
                    </div>
                    <div className="flex items-center gap-4">
                        {lastUpdate && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Clock className="w-4 h-4" />
                                Last update: {lastUpdate.toLocaleTimeString()}
                            </div>
                        )}
                        <button
                            onClick={fetchData}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-fox-surface border border-border rounded-lg text-sm hover:bg-white/5 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Stream Health Summary */}
                    <div className="bg-fox-surface border border-border rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-medium text-muted-foreground">Stream Health</h3>
                            <Activity className="w-5 h-5 text-fox-orange" />
                        </div>
                        <div className="text-2xl font-bold text-foreground">{healthPercentage}%</div>
                        <div className="flex items-center gap-2 mt-2 text-xs">
                            <span className="flex items-center gap-1 text-green-500">
                                <CheckCircle className="w-3 h-3" /> {onlineCount}
                            </span>
                            <span className="flex items-center gap-1 text-yellow-500">
                                <AlertTriangle className="w-3 h-3" /> {degradedCount}
                            </span>
                            <span className="flex items-center gap-1 text-red-500">
                                <WifiOff className="w-3 h-3" /> {offlineCount}
                            </span>
                        </div>
                    </div>

                    {/* Genre Completion */}
                    <div className="bg-fox-surface border border-border rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-medium text-muted-foreground">Genre Completion</h3>
                            <TrendingUp className="w-5 h-5 text-green-500" />
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                            {genreData?.completionRate.toFixed(1) || 0}%
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                            {genreData?.withGenres || 0} / {genreData?.totalAnime || 0} anime have genres
                        </div>
                    </div>

                    {/* Total Searches */}
                    <div className="bg-fox-surface border border-border rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-medium text-muted-foreground">Total Searches</h3>
                            <Search className="w-5 h-5 text-blue-500" />
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                            {(searchAnalytics?.totalSearches || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                            Avg response: {searchAnalytics?.avgResponseTime || 0}ms
                        </div>
                    </div>

                    {/* Verification Status */}
                    <div className="bg-fox-surface border border-border rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-medium text-muted-foreground">Verification</h3>
                            <Server className="w-5 h-5 text-purple-500" />
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                            {verificationResults.filter(r => r.status === 'pass').length}/{verificationResults.length || '—'}
                        </div>
                        <button
                            onClick={runVerification}
                            disabled={isVerifying}
                            className="text-xs text-fox-orange hover:text-fox-orange/80 mt-2 disabled:opacity-50"
                        >
                            {isVerifying ? 'Verifying...' : 'Run verification'}
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 border-b border-border">
                    {(['health', 'genres', 'verification', 'analytics'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                "px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
                                activeTab === tab
                                    ? "text-fox-orange border-fox-orange"
                                    : "text-muted-foreground border-transparent hover:text-foreground"
                            )}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <>
                        {/* Stream Health Tab */}
                        {activeTab === 'health' && (
                            <div className="bg-fox-surface border border-border rounded-xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-border bg-black/20">
                                                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Source</th>
                                                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Status</th>
                                                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Latency</th>
                                                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Success Rate</th>
                                                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Quality</th>
                                                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Last Check</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {streamHealth.map((source) => (
                                                <tr key={source.name} className="border-b border-border/50 hover:bg-white/5">
                                                    <td className="py-3 px-4 font-medium text-foreground">{source.name}</td>
                                                    <td className="py-3 px-4">
                                                        <div className={cn("flex items-center gap-2", getHealthColor(source.status))}>
                                                            {getHealthIcon(source.status)}
                                                            <span className="capitalize">{source.status}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-muted-foreground">
                                                        {source.latency ? `${Math.round(source.latency)}ms` : '—'}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-16 h-2 bg-zinc-700 rounded-full overflow-hidden">
                                                                <div
                                                                    className={cn(
                                                                        "h-full rounded-full transition-all",
                                                                        (source.successRate || 0) >= 80 ? "bg-green-500" :
                                                                        (source.successRate || 0) >= 50 ? "bg-yellow-500" : "bg-red-500"
                                                                    )}
                                                                    style={{ width: `${source.successRate || 0}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-xs text-muted-foreground">{source.successRate || 0}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-muted-foreground capitalize">
                                                        {source.capabilities?.quality || '—'}
                                                    </td>
                                                    <td className="py-3 px-4 text-muted-foreground text-sm">
                                                        {new Date(source.lastCheck).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Genre Completion Tab */}
                        {activeTab === 'genres' && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Completion Rate */}
                                <div className="bg-fox-surface border border-border rounded-xl p-6">
                                    <h3 className="text-lg font-semibold text-foreground mb-4">Genre Data Completion</h3>
                                    <div className="flex items-center justify-center mb-6">
                                        <div className="relative w-40 h-40">
                                            <svg className="w-full h-full transform -rotate-90">
                                                <circle
                                                    cx="80"
                                                    cy="80"
                                                    r="70"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="12"
                                                    className="text-zinc-700"
                                                />
                                                <circle
                                                    cx="80"
                                                    cy="80"
                                                    r="70"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="12"
                                                    strokeDasharray={`${(genreData?.completionRate || 0) * 4.4} 440`}
                                                    className="text-green-500"
                                                    strokeLinecap="round"
                                                />
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="text-center">
                                                    <div className="text-3xl font-bold text-foreground">{genreData?.completionRate.toFixed(1)}%</div>
                                                    <div className="text-xs text-muted-foreground">Complete</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">With Genres</span>
                                            <span className="text-foreground">{genreData?.withGenres || 0}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Missing Genres</span>
                                            <span className="text-yellow-500">{genreData?.withoutGenres || 0}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Total Anime</span>
                                            <span className="text-foreground">{genreData?.totalAnime || 0}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Top Genres */}
                                <div className="bg-fox-surface border border-border rounded-xl p-6">
                                    <h3 className="text-lg font-semibold text-foreground mb-4">Top Genres</h3>
                                    <div className="space-y-3">
                                        {(genreData?.topGenres || []).slice(0, 8).map((genre, index) => {
                                            const maxCount = genreData?.topGenres[0]?.count || 1;
                                            const percentage = (genre.count / maxCount) * 100;
                                            return (
                                                <div key={genre.genre}>
                                                    <div className="flex justify-between text-sm mb-1">
                                                        <span className="text-foreground">{genre.genre}</span>
                                                        <span className="text-muted-foreground">{genre.count}</span>
                                                    </div>
                                                    <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-fox-orange to-orange-500 rounded-full"
                                                            style={{ width: `${percentage}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Verification Tab */}
                        {activeTab === 'verification' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-foreground">Source Verification Results</h3>
                                    <button
                                        onClick={runVerification}
                                        disabled={isVerifying}
                                        className="flex items-center gap-2 px-4 py-2 bg-fox-orange text-white rounded-lg text-sm hover:bg-fox-orange/80 transition-colors disabled:opacity-50"
                                    >
                                        {isVerifying ? (
                                            <>
                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                                Verifying...
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw className="w-4 h-4" />
                                                Run Verification
                                            </>
                                        )}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {verificationResults.map((result) => (
                                        <div
                                            key={result.source}
                                            className={cn(
                                                "bg-fox-surface border rounded-xl p-4",
                                                result.status === 'pass' && "border-green-500/30",
                                                result.status === 'warning' && "border-yellow-500/30",
                                                result.status === 'fail' && "border-red-500/30"
                                            )}
                                        >
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="font-medium text-foreground">{result.source}</h4>
                                                <span className={cn(
                                                    "px-2 py-1 rounded text-xs font-medium capitalize",
                                                    result.status === 'pass' && "bg-green-500/10 text-green-400",
                                                    result.status === 'warning' && "bg-yellow-500/10 text-yellow-400",
                                                    result.status === 'fail' && "bg-red-500/10 text-red-400"
                                                )}>
                                                    {result.status}
                                                </span>
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                Response time: {result.responseTime}ms
                                            </div>
                                            {result.error && (
                                                <div className="text-xs text-red-400 mt-2">{result.error}</div>
                                            )}
                                            <div className="flex gap-3 mt-3 text-xs">
                                                <span className={cn(result.details.searchWorks ? "text-green-400" : "text-red-400")}>
                                                    Search: {result.details.searchWorks ? '✓' : '✗'}
                                                </span>
                                                <span className={cn(result.details.animeInfoWorks ? "text-green-400" : "text-red-400")}>
                                                    Info: {result.details.animeInfoWorks ? '✓' : '✗'}
                                                </span>
                                                <span className={cn(result.details.episodesWorks ? "text-green-400" : "text-red-400")}>
                                                    Episodes: {result.details.episodesWorks ? '✓' : '✗'}
                                                </span>
                                                <span className={cn(result.details.streamingWorks ? "text-green-400" : "text-red-400")}>
                                                    Stream: {result.details.streamingWorks ? '✓' : '✗'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Analytics Tab */}
                        {activeTab === 'analytics' && (
                            <div className="space-y-6">
                                {/* Popular Searches */}
                                <div className="bg-fox-surface border border-border rounded-xl p-6">
                                    <h3 className="text-lg font-semibold text-foreground mb-4">Popular Search Queries</h3>
                                    <div className="space-y-3">
                                        {(searchAnalytics?.popularQueries || []).slice(0, 10).map((query, index) => (
                                            <div key={query.query} className="flex items-center gap-4">
                                                <span className="text-lg font-bold text-muted-foreground w-8">#{index + 1}</span>
                                                <div className="flex-1">
                                                    <div className="flex justify-between text-sm mb-1">
                                                        <span className="text-foreground">{query.query}</span>
                                                        <span className="text-muted-foreground">{query.count.toLocaleString()}</span>
                                                    </div>
                                                    <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-blue-500 rounded-full"
                                                            style={{ width: `${(query.count / (searchAnalytics?.popularQueries[0]?.count || 1)) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Analytics Summary */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-fox-surface border border-border rounded-xl p-4">
                                        <h4 className="text-sm font-medium text-muted-foreground mb-2">Total Searches</h4>
                                        <div className="text-2xl font-bold text-foreground">
                                            {(searchAnalytics?.totalSearches || 0).toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="bg-fox-surface border border-border rounded-xl p-4">
                                        <h4 className="text-sm font-medium text-muted-foreground mb-2">Avg Response Time</h4>
                                        <div className="text-2xl font-bold text-foreground">
                                            {searchAnalytics?.avgResponseTime || 0}ms
                                        </div>
                                    </div>
                                    <div className="bg-fox-surface border border-border rounded-xl p-4">
                                        <h4 className="text-sm font-medium text-muted-foreground mb-2">Failed Searches</h4>
                                        <div className="text-2xl font-bold text-red-400">
                                            {searchAnalytics?.failedSearches || 0}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            {searchAnalytics?.totalSearches 
                                                ? ((searchAnalytics.failedSearches / searchAnalytics.totalSearches) * 100).toFixed(2)
                                                : 0}% failure rate
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default MonitoringDashboard;

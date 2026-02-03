import { useState, useEffect } from 'react';
import { WatchHistory, WatchHistoryItem } from '@/lib/watch-history';

export const useWatchHistory = () => {
    const [history, setHistory] = useState<WatchHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    const refreshHistory = () => {
        const data = WatchHistory.get();
        setHistory(data);
        setLoading(false);
    };

    useEffect(() => {
        refreshHistory();

        // Listen for storage events (cross-tab sync)
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'anistream_watch_history') {
                refreshHistory();
            }
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    return {
        history,
        loading,
        refreshHistory,
        removeFromHistory: (animeId: string) => {
            WatchHistory.remove(animeId);
            refreshHistory();
        }
    };
};

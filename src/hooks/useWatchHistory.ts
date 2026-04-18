import { useState, useEffect } from 'react';
import { WatchHistory, WatchHistoryItem } from '@/lib/watch-history';
import { applyCachedCoversToHistoryItems, enrichWatchHistoryImages } from '@/lib/watch-history-covers';

export const useWatchHistory = () => {
    const [history, setHistory] = useState<WatchHistoryItem[]>(() =>
        applyCachedCoversToHistoryItems(WatchHistory.get())
    );
    const [loading, setLoading] = useState(true);

    const refreshHistory = () => {
        const raw = WatchHistory.get();
        setHistory(applyCachedCoversToHistoryItems(raw));
        setLoading(false);
        enrichWatchHistoryImages(raw)
            .then(setHistory)
            .catch(() => setHistory(applyCachedCoversToHistoryItems(WatchHistory.get())));
    };

    useEffect(() => {
        refreshHistory();

        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'anistream_watch_history') {
                refreshHistory();
            }
        };

        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            const raw = WatchHistory.get();
            enrichWatchHistoryImages(raw)
                .then(setHistory)
                .catch(() => setHistory(applyCachedCoversToHistoryItems(WatchHistory.get())));
        };

        window.addEventListener('storage', handleStorage);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener('storage', handleStorage);
            document.removeEventListener('visibilitychange', onVisible);
        };
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

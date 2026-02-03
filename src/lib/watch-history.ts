import { Anime } from "@/types/anime";

export interface WatchHistoryItem {
    animeId: string;
    animeTitle: string;
    animeImage: string;
    episodeId: string;
    episodeNumber: number;
    timestamp: number;
    duration: number;
    lastWatched: number; // Date.now()
    progress: number; // 0 to 1
}

const HISTORY_KEY = 'anistream_watch_history';
const MAX_HISTORY_ITEMS = 20;

export const WatchHistory = {
    save: (
        anime: Anime,
        episodeId: string,
        episodeNumber: number,
        timestamp: number,
        duration: number
    ) => {
        try {
            const historyJSON = localStorage.getItem(HISTORY_KEY);
            let history: WatchHistoryItem[] = historyJSON ? JSON.parse(historyJSON) : [];

            // Remove existing entry for this anime
            history = history.filter(item => item.animeId !== anime.id);

            // Create new entry
            const newItem: WatchHistoryItem = {
                animeId: anime.id,
                animeTitle: anime.title,
                animeImage: anime.image,
                episodeId,
                episodeNumber,
                timestamp,
                duration,
                lastWatched: Date.now(),
                progress: duration > 0 ? timestamp / duration : 0
            };

            // Add to beginning
            history.unshift(newItem);

            // Limit size
            if (history.length > MAX_HISTORY_ITEMS) {
                history = history.slice(0, MAX_HISTORY_ITEMS);
            }

            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch (e) {
            console.error('Failed to save watch history:', e);
        }
    },

    get: (): WatchHistoryItem[] => {
        try {
            const historyJSON = localStorage.getItem(HISTORY_KEY);
            return historyJSON ? JSON.parse(historyJSON) : [];
        } catch (e) {
            console.error('Failed to get watch history:', e);
            return [];
        }
    },

    remove: (animeId: string) => {
        try {
            const historyJSON = localStorage.getItem(HISTORY_KEY);
            if (!historyJSON) return;

            let history: WatchHistoryItem[] = JSON.parse(historyJSON);
            history = history.filter(item => item.animeId !== animeId);

            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch (e) {
            console.error('Failed to remove from watch history:', e);
        }
    },

    clear: () => {
        localStorage.removeItem(HISTORY_KEY);
    }
};

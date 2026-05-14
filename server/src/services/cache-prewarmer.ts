
import { sourceManager } from './source-manager.js';
import { resolverQueue } from './resolver-queue.js';
import { logger } from '../utils/logger.js';

export class CachePrewarmer {
    private interval: ReturnType<typeof setInterval> | null = null;

    start(intervalMs: number = 30 * 60 * 1000) { // Every 30 mins
        console.log(`🔥 [Prewarmer] Started (Interval: ${intervalMs/1000/60}m)`);
        this.run();
        this.interval = setInterval(() => this.run(), intervalMs);
    }

    async run() {
        console.log('🔥 [Prewarmer] Running background cache warm-up...');
        try {
            // 1. Get trending anime
            const trending = await sourceManager.getTrending(1);
            const top5 = trending.slice(0, 5);

            for (const anime of top5) {
                console.log(`🔥 [Prewarmer] Warming up: ${anime.title}`);
                
                // 2. Get episodes
                const episodes = await sourceManager.getEpisodes(anime.id);
                if (episodes.length > 0) {
                    const latestEp = episodes[episodes.length - 1];
                    
                    // 3. Queue resolver task for sub and dub of the latest episode
                    // This will populate Redis in the background
                    if (resolverQueue) {
                        await resolverQueue.add(sourceManager.getAvailableSource()?.name || 'Gogoanime', {
                            episodeId: latestEp.id,
                            category: 'sub',
                            episodeNum: latestEp.number
                        }, {
                            jobId: `warm-sub-${latestEp.id}`,
                            removeOnComplete: true
                        });

                        if (latestEp.hasDub) {
                            await resolverQueue.add(sourceManager.getAvailableSource()?.name || 'Gogoanime', {
                                episodeId: latestEp.id,
                                category: 'dub',
                                episodeNum: latestEp.number
                            }, {
                                jobId: `warm-dub-${latestEp.id}`,
                                removeOnComplete: true
                            });
                        }
                    } else {
                        console.log(`🔥 [Prewarmer] resolverQueue not available, skipping background resolve for ${latestEp.id}`);
                    }
                }
            }
            console.log('🔥 [Prewarmer] Warm-up task queued successfully');
        } catch (err: any) {
            console.error(`❌ [Prewarmer] Failed: ${err.message}`);
        }
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
    }
}

export const cachePrewarmer = new CachePrewarmer();


import { Queue, Worker, Job } from 'bullmq';
import { sourceManager } from './source-manager.js';
import { StreamingData } from '../types/streaming.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Resolver Queue for heavy extractions
export let resolverQueue: Queue | null = null;
if (process.env.REDIS_URL) {
    resolverQueue = new Queue('resolver-tasks', {
        connection: { url: REDIS_URL }
    });
}

// Worker to handle extraction jobs
export let resolverWorker: Worker | null = null;
if (process.env.REDIS_URL) {
    resolverWorker = new Worker('resolver-tasks', async (job: Job) => {
        const { episodeId, server, category, options } = job.data;
        
        console.log(`👷 [Worker] Resolving stream for: ${episodeId}`);
        
        try {
            // Find the specific source requested
            const source = (sourceManager as any).sources.get(job.name);
            if (!source || !source.getStreamingLinks) {
                throw new Error(`Source ${job.name} not found or doesn't support streaming`);
            }

            const data = await source.getStreamingLinks(episodeId, server, category, options);
            return data;
        } catch (err: any) {
            console.error(`❌ [Worker] Failed to resolve ${episodeId} on ${job.name}: ${err.message}`);
            throw err;
        }
    }, {
        connection: { url: REDIS_URL },
        concurrency: 5 // Process 5 extractions in parallel per worker
    });
}

if (resolverWorker) {
    resolverWorker.on('completed', (job) => {
        console.log(`✅ [Worker] Job ${job.id} completed for ${job.name}`);
    });

    resolverWorker.on('failed', (job, err) => {
        console.error(`❌ [Worker] Job ${job?.id} failed: ${err.message}`);
    });
}

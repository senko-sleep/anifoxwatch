import type { AnimeSource, SourceRequestOptions } from '../sources/base-source.js';
import type { StreamingData } from '../types/streaming.js';
import { playableStreams } from './playable-stream.js';

export type StreamProvider = AnimeSource & {
    acceptsAniListId?: boolean;
    getStreamingLinks?(id: string, server?: string, category?: 'sub' | 'dub', options?: SourceRequestOptions): Promise<StreamingData>;
};

const normalizeTitle = (title: string) => title.toLowerCase().replace(/[×✕]/g, 'x')
    .replace(/\b(?:dub|dubbed)\b/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function sameTitle(a: string, b: string): boolean {
    const left = normalizeTitle(a), right = normalizeTitle(b);
    // Never drop season numbers or pick the first loosely related search result.
    return left === right || left.replace(/\s/g, '') === right.replace(/\s/g, '');
}

export async function resolveProviders(providers: StreamProvider[], request: {
    episodeId: string; episodeNum: number; nativeProvider?: string; anilistId?: number;
    titles: string[]; category: 'sub' | 'dub'; server?: string; bypassCache?: boolean;
    timeoutMs?: number; excludedProviders?: string[];
}): Promise<StreamingData> {
    const attempts: NonNullable<StreamingData['attempts']> = [];
    const eligibleProviders = providers.filter(provider => provider.getStreamingLinks &&
        !request.excludedProviders?.includes(provider.name));
    const orderedProviders = [...eligibleProviders].sort((a, b) =>
        Number(b.name === 'ReAnime') - Number(a.name === 'ReAnime'));
    // ReAnime returns a FlixCloud player with a native English audio selector.
    // Prefer that iframe for dub requests when we have an exact AniList identity,
    // but keep the native catalog provider as the immediate fallback.
    const dubEmbedBatch = request.category === 'dub' && request.anilistId
        ? orderedProviders.filter(provider => provider.name === 'ReAnime')
        : [];
    const nativeBatch = request.nativeProvider
        ? orderedProviders.filter(provider =>
            provider.name === request.nativeProvider && !dubEmbedBatch.includes(provider))
        : [];
    const prioritized = new Set([...dubEmbedBatch, ...nativeBatch]);
    const remainingProviders = orderedProviders.filter(provider => !prioritized.has(provider));
    const batches = [
        dubEmbedBatch,
        nativeBatch,
        remainingProviders.filter(provider => !['Aniwaves', 'Anichi'].includes(provider.name)),
        remainingProviders.filter(provider => ['Aniwaves', 'Anichi'].includes(provider.name)),
    ].filter(batch => batch.length > 0);
    const tasksFor = (batch: StreamProvider[], batchSignal: AbortSignal) => batch.map(async provider => {
        await Promise.resolve();
        const attempt: typeof attempts[number] = { provider: provider.name, status: 'pending' };
        attempts.push(attempt);
        const controller = new AbortController();
        const cancelWithBatch = () => controller.abort();
        if (batchSignal.aborted) controller.abort();
        else batchSignal.addEventListener('abort', cancelWithBatch, { once: true });
        let timeout: ReturnType<typeof setTimeout>;
        const providerTimeout = provider.name === 'ReAnime' && request.category === 'dub'
            ? Math.min(request.timeoutMs || 38000, 10_000)
            : provider.name === request.nativeProvider
                ? request.timeoutMs || 38000
                : Math.min(request.timeoutMs || 20_000, 20_000);
        const options: SourceRequestOptions = {
            signal: controller.signal, timeout: providerTimeout,
            episodeNum: request.episodeNum, anilistId: request.anilistId, bypassCache: request.bypassCache,
        };
        const work = async () => {
            let id: string | undefined;
            if (provider.name === request.nativeProvider) id = request.episodeId;
            else if (provider.acceptsAniListId && request.anilistId) id = `anilist-${request.anilistId}`;
            else {
                for (const title of request.titles) {
                    controller.signal.throwIfAborted();
                    const result = await provider.search(title, 1, undefined, options);
                    const match = result.results.find(anime => request.titles.some(t => sameTitle(t, anime.title)));
                    if (!match) continue;
                    const episodes = await provider.getEpisodes(match.id, options);
                    id = episodes.find(episode => Number(episode.number) === request.episodeNum)?.id;
                    if (id) break;
                }
            }
            if (!id) throw new Error(`Cannot map episode ${request.episodeNum}`);
            attempt.episodeId = id;
            console.log(`[StreamResolver] ${provider.name}: ${id}, episode ${request.episodeNum}`);
            controller.signal.throwIfAborted();
            // Host/server labels only have meaning to the provider that supplied them.
            const server = provider.name === request.nativeProvider ? request.server : undefined;
            let data = await provider.getStreamingLinks!(id, server, request.category, options);
            controller.signal.throwIfAborted();
            let valid = await playableStreams({ ...data, source: provider.name,
                sources: data.sources.filter(source => !source.category || source.category === request.category) }, controller.signal, request.bypassCache);
            if (!valid.sources.length && !request.bypassCache && !controller.signal.aborted) {
                // A signed URL can expire before its provider's metadata cache does.
                data = await provider.getStreamingLinks!(id, server, request.category, { ...options, bypassCache: true });
                valid = await playableStreams({ ...data, source: provider.name,
                    sources: data.sources.filter(source => !source.category || source.category === request.category) }, controller.signal, true);
            }
            if (!valid.sources.length) throw new Error('No valid playable sources');
            attempt.status = 'playable';
            return valid;
        };
        try {
            return await Promise.race([work(), new Promise<never>((_, reject) => {
                timeout = setTimeout(() => { controller.abort(); reject(new Error('Provider timeout')); }, options.timeout);
            })]);
        } catch (error) {
            attempt.status = controller.signal.aborted ? 'timeout' : 'failed';
            attempt.error = (error as Error).message;
            console.warn(`[StreamResolver] ${provider.name}: ${attempt.status}: ${attempt.error}`);
            throw error;
        } finally {
            clearTimeout(timeout!);
            batchSignal.removeEventListener('abort', cancelWithBatch);
        }
    });
    for (const batch of batches) {
        const batchController = new AbortController();
        try {
            // If the episode ID identifies its provider, try that exact native route first.
            // Only fall through to cross-provider search if the native provider cannot play it.
            const winner = await Promise.any(tasksFor(batch, batchController.signal));
            console.log(`[StreamResolver] Selected ${winner.source}`);
            return { ...winner, attempts: attempts.map(attempt => ({ ...attempt })) };
        } catch { /* Continue to the next provider group. */ }
        finally {
            // A provider race is over as soon as it has a winner (or every provider failed).
            // Abort losers so their fetches and Chromium pages cannot starve the next request.
            batchController.abort();
        }
    }
    return { sources: [], subtitles: [], attempts };
}

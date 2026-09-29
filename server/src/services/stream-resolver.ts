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
    const tasks = orderedProviders.map(async provider => {
        await Promise.resolve();
        const attempt: typeof attempts[number] = { provider: provider.name, status: 'pending' };
        attempts.push(attempt);
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout>;
        const options: SourceRequestOptions = {
            signal: controller.signal, timeout: request.timeoutMs || 38000,
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
        } finally { clearTimeout(timeout!); }
    });
    try {
        // Each promise only fulfills after mapping, extraction AND media validation.
        const winner = await Promise.any(tasks);
        console.log(`[StreamResolver] Selected ${winner.source}`);
        return { ...winner, attempts: attempts.map(attempt => ({ ...attempt })) };
    } catch {
        return { sources: [], subtitles: [], attempts };
    }
}

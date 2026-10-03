import type { AnimeSource, SourceRequestOptions } from '../sources/base-source.js';
import type { StreamingData } from '../types/streaming.js';
import { playableStreams } from './playable-stream.js';

export type StreamProvider = AnimeSource & {
    acceptsAniListId?: boolean;
    getStreamingLinks?(id: string, server?: string, category?: 'sub' | 'dub', options?: SourceRequestOptions): Promise<StreamingData>;
};

const normalizeTitle = (title: string) => title.toLowerCase().replace(/[×✕]/g, 'x')
    .replace(/\b(?:dub|dubbed)\b/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const providerHealth = new Map<string, { failures: number; openUntil: number; halfOpen: boolean }>();

export function sameTitle(a: string, b: string): boolean {
    const left = normalizeTitle(a), right = normalizeTitle(b);
    // Never drop season numbers or pick the first loosely related search result.
    return left === right || left.replace(/\s/g, '') === right.replace(/\s/g, '');
}

export async function resolveProviders(providers: StreamProvider[], request: {
    episodeId: string; episodeNum: number; nativeProvider?: string; anilistId?: number;
    titles: string[]; category: 'sub' | 'dub'; server?: string; bypassCache?: boolean;
    timeoutMs?: number; excludedProviders?: string[]; signal?: AbortSignal;
}): Promise<StreamingData> {
    const requestStarted = Date.now();
    // Aniwaves' native extractor has a hard 17s three-server budget. Allow that
    // full bounded native attempt, then preserve bounded direct/browser fallbacks.
    const totalBudgetMs = Math.min(request.timeoutMs || 38_000, 38_000);
    const requestController = new AbortController();
    const abortFromCaller = () => requestController.abort(request.signal?.reason);
    if (request.signal?.aborted) abortFromCaller();
    else request.signal?.addEventListener('abort', abortFromCaller, { once: true });
    let signalDeadline!: () => void;
    const deadlineReached = new Promise<void>(resolve => { signalDeadline = resolve; });
    const totalTimer = setTimeout(() => {
        requestController.abort(new Error('Resolver deadline exceeded'));
        signalDeadline();
    }, totalBudgetMs);
    console.log(JSON.stringify({ type: 'stream_resolver_request', status: 'start', startedAt: new Date(requestStarted).toISOString(),
        episodeId: request.episodeId, episodeNum: request.episodeNum, nativeProvider: request.nativeProvider,
        excludedProviders: request.excludedProviders }));
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
    const browserBacked = new Set(['Aniwaves', 'Anichi', 'ReAnime']);
    const batches = [
        dubEmbedBatch,
        nativeBatch,
        remainingProviders.filter(provider => !browserBacked.has(provider.name)),
        remainingProviders.filter(provider => browserBacked.has(provider.name)),
    ].filter(batch => batch.length > 0);
    const tasksFor = (batch: StreamProvider[], batchSignal: AbortSignal) => batch.map(async provider => {
        const providerStarted = Date.now();
        const attempt: typeof attempts[number] = { provider: provider.name, status: 'pending', startedAt: new Date(providerStarted).toISOString() };
        attempts.push(attempt);
        console.log(JSON.stringify({ type: 'stream_provider_attempt', provider: provider.name, status: 'start',
            startedAt: new Date(providerStarted).toISOString(), requestElapsedMs: providerStarted - requestStarted }));
        const health = providerHealth.get(provider.name) || { failures: 0, openUntil: 0, halfOpen: false };
        providerHealth.set(provider.name, health);
        if (health.openUntil > Date.now()) {
            attempt.status = 'circuit_open';
            attempt.error = `Provider circuit open for ${health.openUntil - Date.now()}ms`;
            attempt.endedAt = new Date().toISOString();
            attempt.durationMs = Date.now() - providerStarted;
            console.log(JSON.stringify({ type: 'stream_provider_circuit', provider: provider.name, status: 'open', remainingMs: health.openUntil - Date.now() }));
            console.log(JSON.stringify({ type: 'stream_provider_attempt', provider: provider.name, status: 'circuit_open',
                startedAt: new Date(providerStarted).toISOString(), endedAt: new Date().toISOString(), durationMs: Date.now() - providerStarted,
                reason: attempt.error }));
            throw new Error(attempt.error);
        }
        if (health.openUntil && health.openUntil <= Date.now()) {
            if (health.halfOpen) {
                attempt.status = 'circuit_open';
                attempt.error = 'Provider half-open probe already in flight';
                throw new Error(attempt.error);
            }
            health.halfOpen = true;
            console.log(JSON.stringify({ type: 'stream_provider_circuit', provider: provider.name, status: 'half_open' }));
        }
        await Promise.resolve();
        const controller = new AbortController();
        const cancelWithBatch = () => controller.abort();
        if (batchSignal.aborted) controller.abort();
        else batchSignal.addEventListener('abort', cancelWithBatch, { once: true });
        let timeout: ReturnType<typeof setTimeout>;
        const providerBudget = provider.name === 'ReAnime' && request.category === 'dub' ? 9_000
            : provider.name === request.nativeProvider ? 18_000 : 9_000;
        const providerTimeout = Math.max(1, Math.min(providerBudget, totalBudgetMs - 25,
            totalBudgetMs - (Date.now() - requestStarted) - 25));
        const options: SourceRequestOptions = {
            signal: controller.signal, timeout: providerTimeout,
            episodeNum: request.episodeNum, anilistId: request.anilistId, bypassCache: request.bypassCache,
        };
        let stage = 'identity';
        let stageStarted = Date.now();
        const beginStage = (name: string) => { stage = name; stageStarted = Date.now(); };
        const logStage = (name: string, status: string, error?: unknown) => console.log(JSON.stringify({
            type: 'stream_resolver_stage', provider: provider.name, stage: name, status,
            startedAt: new Date(stageStarted).toISOString(), endedAt: new Date().toISOString(),
            durationMs: Date.now() - stageStarted, requestElapsedMs: Date.now() - requestStarted,
            episodeNum: request.episodeNum, episodeId: attempt.episodeId,
            detail: error instanceof Error ? error.message : error ? String(error) : undefined,
        }));
        const work = async () => {
            let id: string | undefined;
            if (provider.name === request.nativeProvider) id = request.episodeId;
            else if (provider.acceptsAniListId && request.anilistId) id = `anilist-${request.anilistId}`;
            else {
                for (const title of request.titles) {
                    controller.signal.throwIfAborted();
                    beginStage('crossProviderSearch');
                    const result = await provider.search(title, 1, undefined, options);
                    const match = result.results.find(anime => request.titles.some(t => sameTitle(t, anime.title)));
                    logStage('crossProviderSearch', match ? 'match' : 'no_match');
                    if (!match) continue;
                    beginStage('episodeMapping');
                    const episodes = await provider.getEpisodes(match.id, options);
                    id = episodes.find(episode => Number(episode.number) === request.episodeNum)?.id;
                    logStage('episodeMapping', id ? 'mapped' : 'episode_missing', `episodeCount=${episodes.length}`);
                    if (id) break;
                }
            }
            if (!id) throw new Error(`Cannot map episode ${request.episodeNum}`);
            attempt.episodeId = id;
            logStage('identity', 'ok');
            console.log(`[StreamResolver] ${provider.name}: ${id}, episode ${request.episodeNum}`);
            controller.signal.throwIfAborted();
            // Host/server labels only have meaning to the provider that supplied them.
            const server = provider.name === request.nativeProvider ? request.server : undefined;
            beginStage('getStreamingLinks');
            let data = await provider.getStreamingLinks!(id, server, request.category, options);
            logStage(stage, 'ok', `sources=${data.sources?.length || 0}`);
            controller.signal.throwIfAborted();
            beginStage('validateSource');
            let valid = await playableStreams({ ...data, source: provider.name,
                sources: data.sources.filter(source => !source.category || source.category === request.category) }, controller.signal, request.bypassCache);
            logStage(stage, valid.sources.length ? 'playable' : 'invalid', `sources=${valid.sources.length}`);
            if (!valid.sources.length && !request.bypassCache && !controller.signal.aborted) {
                // A signed URL can expire before its provider's metadata cache does.
                beginStage('retryFreshSource');
                data = await provider.getStreamingLinks!(id, server, request.category, { ...options, bypassCache: true });
                logStage(stage, 'ok', `sources=${data.sources?.length || 0}`);
                beginStage('validateFreshSource');
                valid = await playableStreams({ ...data, source: provider.name,
                    sources: data.sources.filter(source => !source.category || source.category === request.category) }, controller.signal, true);
                logStage(stage, valid.sources.length ? 'playable' : 'invalid', `sources=${valid.sources.length}`);
            }
            if (!valid.sources.length) throw new Error('No valid playable sources');
            attempt.status = 'playable';
            attempt.endedAt = new Date().toISOString();
            attempt.durationMs = Date.now() - providerStarted;
            health.failures = 0;
            health.openUntil = 0;
            health.halfOpen = false;
            console.log(JSON.stringify({ type: 'stream_provider_circuit', provider: provider.name, status: 'closed' }));
            console.log(JSON.stringify({ type: 'stream_provider_attempt', provider: provider.name, status: 'playable',
                startedAt: new Date(providerStarted).toISOString(), endedAt: new Date().toISOString(), durationMs: Date.now() - providerStarted }));
            return valid;
        };
        try {
            return await Promise.race([work(), new Promise<never>((_, reject) => {
                timeout = setTimeout(() => { controller.abort(new Error('Provider timeout')); reject(new Error('Provider timeout')); }, options.timeout);
            })]);
        } catch (error) {
            attempt.status = controller.signal.aborted && !batchSignal.aborted && !requestController.signal.aborted ? 'timeout'
                : batchSignal.aborted || requestController.signal.aborted ? 'cancelled' : 'failed';
            attempt.error = (error as Error).message;
            attempt.endedAt = new Date().toISOString();
            attempt.durationMs = Date.now() - providerStarted;
            if (attempt.status === 'timeout' || (attempt.status === 'failed' && !attempt.error.includes('Cannot map episode'))) {
                health.failures++;
                if (health.failures >= 3) {
                    health.openUntil = Date.now() + 60_000;
                    console.log(JSON.stringify({ type: 'stream_provider_circuit', provider: provider.name, status: 'open', failures: health.failures, cooldownMs: 60_000 }));
                }
            }
            health.halfOpen = false;
            logStage(stage, attempt.status, error);
            console.log(JSON.stringify({ type: 'stream_provider_attempt', provider: provider.name, status: attempt.status,
                startedAt: new Date(providerStarted).toISOString(), endedAt: new Date().toISOString(),
                durationMs: Date.now() - providerStarted, reason: attempt.error }));
            console.warn(`[StreamResolver] ${provider.name}: ${attempt.status}: ${attempt.error}`);
            throw error;
        } finally {
            clearTimeout(timeout!);
            batchSignal.removeEventListener('abort', cancelWithBatch);
        }
    });
    try {
      for (const batch of batches) {
        if (requestController.signal.aborted) break;
        const batchController = new AbortController();
        const abortBatch = () => batchController.abort(requestController.signal.reason);
        requestController.signal.addEventListener('abort', abortBatch, { once: true });
        try {
            // If the episode ID identifies its provider, try that exact native route first.
            // Only fall through to cross-provider search if the native provider cannot play it.
            const batchResult = await Promise.race([
                Promise.any(tasksFor(batch, batchController.signal))
                    .then(winner => ({ winner }), () => ({ winner: null })),
                deadlineReached.then(() => ({ winner: null, deadline: true as const })),
            ]);
            if ('deadline' in batchResult) break;
            if (batchResult.winner) {
                const winner = batchResult.winner;
                console.log(JSON.stringify({ type: 'stream_resolver_result', source: winner.source, status: 'playable',
                    startedAt: new Date(requestStarted).toISOString(), endedAt: new Date().toISOString(),
                    durationMs: Date.now() - requestStarted, providersAttempted: attempts.map(a => a.provider) }));
                return { ...winner, attempts: attempts.map(attempt => ({ ...attempt })) };
            }
        }
        finally {
            // A provider race is over as soon as it has a winner (or every provider failed).
            // Abort losers so their fetches and Chromium pages cannot starve the next request.
            batchController.abort();
            requestController.signal.removeEventListener('abort', abortBatch);
        }
      }
      console.log(JSON.stringify({ type: 'stream_resolver_result', status: 'failed',
          startedAt: new Date(requestStarted).toISOString(), endedAt: new Date().toISOString(),
          durationMs: Date.now() - requestStarted, providersAttempted: attempts.map(a => a.provider),
          deadlineExceeded: requestController.signal.aborted }));
      return { sources: [], subtitles: [], attempts };
    } finally {
      clearTimeout(totalTimer);
      request.signal?.removeEventListener('abort', abortFromCaller);
    }
}

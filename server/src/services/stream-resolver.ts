import type { AnimeSource, SourceRequestOptions } from '../sources/base-source.js';
import type { StreamingData } from '../types/streaming.js';
import { playableStreams } from './playable-stream.js';

export type StreamProvider = AnimeSource & {
    acceptsAniListId?: boolean;
    /** Builds this provider's episode id straight from a MAL id, skipping title search. */
    idForMal?(malId: number, episodeNum: number): string;
    /** Per-attempt budget for a provider whose upstream is known to answer slowly when cold. */
    streamBudgetMs?: number;
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
    episodeId: string; episodeNum: number; nativeProvider?: string; anilistId?: number; malId?: number;
    titles: string[]; category: 'sub' | 'dub'; server?: string; bypassCache?: boolean;
    timeoutMs?: number; excludedProviders?: string[]; signal?: AbortSignal;
}): Promise<StreamingData> {
    const requestStarted = Date.now();
    // Aniwaves' native extractor has a hard 17s three-server budget. Allow that
    // full bounded native attempt, then preserve bounded direct/browser fallbacks.
    const totalBudgetMs = Math.min(request.timeoutMs || 38_000, 38_000);
    const requestController = new AbortController();
    let signalDeadline!: () => void;
    const deadlineReached = new Promise<void>(resolve => { signalDeadline = resolve; });
    const abortFromCaller = () => { requestController.abort(request.signal?.reason); signalDeadline(); };
    if (request.signal?.aborted) abortFromCaller();
    else request.signal?.addEventListener('abort', abortFromCaller, { once: true });
    const totalTimer = setTimeout(() => {
        requestController.abort(new Error('Resolver deadline exceeded'));
        signalDeadline();
    }, totalBudgetMs);
    console.log(JSON.stringify({ type: 'stream_resolver_request', status: 'start', startedAt: new Date(requestStarted).toISOString(),
        episodeId: request.episodeId, episodeNum: request.episodeNum, nativeProvider: request.nativeProvider,
        excludedProviders: request.excludedProviders }));
    const attempts: NonNullable<StreamingData['attempts']> = [];
    let unverifiedFallback: StreamingData | undefined;
    const eligibleProviders = providers.filter(provider => provider.getStreamingLinks &&
        !request.excludedProviders?.includes(provider.name));
    // A playback failure excludes a provider from the normal race, but a
    // transient CDN error must not permanently strand episodes with one source.
    // Freshly revalidate it once, after all independent alternatives fail.
    const recoveryProviders = providers.filter(provider => provider.getStreamingLinks &&
        request.excludedProviders?.includes(provider.name));
    const recoveryNames = new Set(recoveryProviders.map(provider => provider.name));
    const orderedProviders = [...eligibleProviders];
    const browserBacked = new Set(['Aniwaves', 'Anichi', 'ReAnime']);
    // A native browser extractor can exhaust a small production instance
    // before a direct HLS provider gets a chance. Preserve native priority
    // only when that provider does not need Chromium.
    const nativeBatch = request.nativeProvider && !browserBacked.has(request.nativeProvider)
        ? orderedProviders.filter(provider =>
            provider.name === request.nativeProvider)
        : [];
    const prioritized = new Set(nativeBatch);
    const remainingProviders = orderedProviders.filter(provider => !prioritized.has(provider));
    const batches = [
        nativeBatch,
        remainingProviders.filter(provider => !browserBacked.has(provider.name)),
        remainingProviders.filter(provider => browserBacked.has(provider.name) && provider.name !== 'ReAnime'),
        remainingProviders.filter(provider => provider.name === 'ReAnime'),
        recoveryProviders,
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
        const cancelWithBatch = () => {
            controller.abort(batchSignal.reason);
            if (attempt.status === 'pending') {
                attempt.status = 'cancelled';
                attempt.endedAt = new Date().toISOString();
                attempt.durationMs = Date.now() - providerStarted;
            }
        };
        if (batchSignal.aborted) controller.abort();
        else batchSignal.addEventListener('abort', cancelWithBatch, { once: true });
        let timeout: ReturnType<typeof setTimeout>;
        let rejectCancellation: () => void = () => {};
        const providerBudget = provider.streamBudgetMs ? provider.streamBudgetMs
            : provider.name === 'ReAnime' && request.category === 'dub' ? 9_000
            : provider.name === request.nativeProvider ? 18_000 : 9_000;
        const providerTimeout = Math.max(1, Math.min(providerBudget, totalBudgetMs - 25,
            totalBudgetMs - (Date.now() - requestStarted) - 25));
        const options: SourceRequestOptions = {
            signal: controller.signal, timeout: providerTimeout,
            episodeNum: request.episodeNum, anilistId: request.anilistId,
            bypassCache: request.bypassCache || recoveryNames.has(provider.name),
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
            else if (provider.idForMal && request.malId) id = provider.idForMal(request.malId, request.episodeNum);
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
                sources: data.sources.filter(source => !source.category || source.category === request.category) }, controller.signal, options.bypassCache);
            logStage(stage, valid.sources.length ? 'playable' : 'invalid', `sources=${valid.sources.length}`);
            if (!valid.sources.length && !options.bypassCache && !controller.signal.aborted) {
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
            const verified = valid.sources.some(source => source.probeVerified === true);
            attempt.status = verified ? 'playable' : 'unverified';
            attempt.endedAt = new Date().toISOString();
            attempt.durationMs = Date.now() - providerStarted;
            health.halfOpen = false;
            if (verified) {
                health.failures = 0;
                health.openUntil = 0;
                console.log(JSON.stringify({ type: 'stream_provider_circuit', provider: provider.name, status: 'closed' }));
            }
            console.log(JSON.stringify({ type: 'stream_provider_attempt', provider: provider.name, status: attempt.status,
                startedAt: new Date(providerStarted).toISOString(), endedAt: new Date().toISOString(), durationMs: Date.now() - providerStarted }));
            if (!verified) {
                // An iframe or skipped probe is a candidate for the client, not proof of media.
                // Keep searching independent providers before handing it to the player.
                unverifiedFallback ||= valid;
                throw Object.assign(new Error('Unverified stream candidate'), { unverifiedCandidate: true });
            }
            return { ...valid, sources: valid.sources.filter(source => source.probeVerified === true) };
        };
        try {
            const cancelled = new Promise<never>((_, reject) => {
                rejectCancellation = () => reject(controller.signal.reason || new Error('Provider cancelled'));
                if (controller.signal.aborted) rejectCancellation();
                else controller.signal.addEventListener('abort', rejectCancellation, { once: true });
            });
            return await Promise.race([work(), cancelled, new Promise<never>((_, reject) => {
                timeout = setTimeout(() => { controller.abort(new Error('Provider timeout')); reject(new Error('Provider timeout')); }, options.timeout);
            })]);
        } catch (error) {
            if ((error as { unverifiedCandidate?: boolean }).unverifiedCandidate) throw error;
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
            controller.signal.removeEventListener('abort', rejectCancellation);
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
                batchController.abort(new Error('Another provider won'));
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
      if (unverifiedFallback) {
          console.log(JSON.stringify({ type: 'stream_resolver_result', source: unverifiedFallback.source,
              status: 'unverified', durationMs: Date.now() - requestStarted,
              providersAttempted: attempts.map(a => a.provider) }));
          return { ...unverifiedFallback, attempts: attempts.map(attempt => ({ ...attempt })) };
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

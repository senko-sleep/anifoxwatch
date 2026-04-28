import type { StreamingData, VideoSource, VideoSubtitle } from '../types/streaming.js';
import {
    buildHianimeRestServersToTry,
    fetchHianimeRestEpisodeServerIds,
    HIANIME_REST_FETCH_HEADERS,
} from '../utils/hianime-rest-episode-discovery.js';
import { fetchConsumetHianimeEpisodeSourcesEnvelope } from '../utils/hianime-consumet-local.js';
import {
    fetchLocalAniwatchEpisodeSourcesJson,
    fetchLocalAniwatchEpisodeServerIds,
} from '../utils/hianime-local-aniwatch.js';
import { normalizeAnimeEpisodeIdForHianimeRest } from '../utils/hianime-rest-servers.js';

type SourcesPayload = {
    sources?: Array<{
        url: string;
        isM3U8?: boolean;
        quality?: string;
        type?: string;
    }>;
    subtitles?: Array<{ url: string; lang: string }>;
    headers?: { Referer?: string; referer?: string };
};

function mapPayloadToStreaming(data: SourcesPayload | undefined): StreamingData | null {
    if (!data?.sources?.length) return null;

    const hdr = data.headers;
    const referer =
        (typeof hdr?.Referer === 'string' && hdr.Referer) ||
        (typeof hdr?.referer === 'string' && hdr.referer) ||
        'https://hianime.to/';

    const sources: VideoSource[] = data.sources.map((s) => ({
        url: s.url,
        quality: (s.quality || s.type || 'default') as VideoSource['quality'],
        isM3U8: Boolean(s.isM3U8),
        originalUrl: s.url,
    }));
    const subtitles: VideoSubtitle[] = (data.subtitles || []).map((t) => ({
        url: t.url,
        lang: t.lang,
    }));

    return {
        sources,
        subtitles,
        headers: { Referer: referer },
        source: 'hianime-rest',
    };
}

async function tryRemoteEpisodeSources(
    base: string,
    restEpisodeId: string,
    server: string,
    category: string,
    perAttemptTimeoutMs: number
): Promise<SourcesPayload | null> {
    const qs = new URLSearchParams({
        animeEpisodeId: restEpisodeId,
        server,
        category,
    });
    const url = `${base}/api/v2/hianime/episode/sources?${qs}`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), perAttemptTimeoutMs);
    try {
        const resp = await fetch(url, {
            signal: controller.signal,
            headers: { ...HIANIME_REST_FETCH_HEADERS },
        });
        clearTimeout(tid);
        const body = (await resp.json()) as {
            status?: number;
            message?: string;
            data?: SourcesPayload;
        };
        if (body?.status !== undefined && body.status !== 200) return null;
        return body?.data?.sources?.length ? body.data : null;
    } catch {
        clearTimeout(tid);
        return null;
    }
}

/**
 * When full SourceManager extraction returns nothing (common on serverless), try the same
 * aniwatch-api path the REST proxy uses, then **in-process** `aniwatch` if remote is down or errors.
 */
export async function tryFetchHianimeRestStreamingData(opts: {
    episodeId: string;
    category: 'sub' | 'dub';
    explicitServer?: string;
    perAttemptTimeoutMs?: number;
    /** Hard cap for the whole HiAnime REST discovery loop (multiple servers + fallbacks). */
    totalBudgetMs?: number;
    /**
     * When `?ep=` is a non-numeric embed token, Consumet/remote may still resolve `?ep=<catalogEp>`
     * (matches catalog episode N from `slug$ep=N$token=...` sent as `ep_num` on `/api/stream/watch`).
     */
    catalogEpisodeFallback?: number;
}): Promise<StreamingData | null> {
    const base = process.env.HIANIME_REST_URL?.replace(/\/$/, '');
    const { episodeId, category, explicitServer, perAttemptTimeoutMs = 14_000, totalBudgetMs = 12_000, catalogEpisodeFallback } = opts;
    const restEpisodeId = normalizeAnimeEpisodeIdForHianimeRest(episodeId);
    const startedAt = Date.now();
    const budget = Math.max(2500, totalBudgetMs);

    let discovered: string[] | null = null;
    {
        const discoveryBudget = Math.min(6000, Math.max(1500, Math.floor(budget * 0.35)));
        const elapsed0 = Date.now() - startedAt;
        if (elapsed0 < budget && base) {
            discovered = await fetchHianimeRestEpisodeServerIds(base, restEpisodeId, category, discoveryBudget);
        }
        const elapsed1 = Date.now() - startedAt;
        if (elapsed1 < budget && !discovered?.length) {
            discovered = await fetchLocalAniwatchEpisodeServerIds(
                restEpisodeId,
                category,
                Math.min(discoveryBudget, Math.max(800, budget - elapsed1)),
            );
        }
    }

    const servers = buildHianimeRestServersToTry({
        explicitServer,
        discoveredIds: discovered,
    });

    for (const server of servers) {
        const elapsed = Date.now() - startedAt;
        if (elapsed >= budget) break;

        const remaining = Math.max(800, budget - elapsed);
        // Keep each attempt bounded; we may try multiple servers within the total budget.
        const attemptTimeout = Math.min(perAttemptTimeoutMs, Math.max(1500, Math.floor(remaining / 2)));

        let payload: SourcesPayload | null | undefined;

        const timeLeft = () => Math.max(250, budget - (Date.now() - startedAt));

        if (base) {
            payload = await tryRemoteEpisodeSources(base, restEpisodeId, server, category, Math.min(attemptTimeout, timeLeft()));
        }
        if (!payload?.sources?.length) {
            const cc = await fetchConsumetHianimeEpisodeSourcesEnvelope({
                animeEpisodeId: restEpisodeId,
                server,
                category,
                timeoutMs: Math.min(attemptTimeout, timeLeft()),
            });
            const d = cc?.data as SourcesPayload | undefined;
            if (d?.sources?.length) payload = d;
        }
        if (!payload?.sources?.length) {
            const localJson = await fetchLocalAniwatchEpisodeSourcesJson({
                animeEpisodeId: restEpisodeId,
                server,
                category,
                timeoutMs: Math.min(attemptTimeout, timeLeft()),
            });
            const d = localJson?.data as SourcesPayload | undefined;
            if (d?.sources?.length) payload = d;
        }

        const mapped = mapPayloadToStreaming(payload ?? undefined);
        if (mapped) return mapped;
    }

    const epSeg =
        restEpisodeId.includes('?ep=') ? restEpisodeId.split('?ep=')[1]?.split('&')[0]?.split('#')[0] ?? '' : '';
    if (
        catalogEpisodeFallback != null &&
        catalogEpisodeFallback > 0 &&
        epSeg &&
        !/^\d+$/.test(epSeg)
    ) {
        const slug = restEpisodeId.split('?')[0];
        const alt = `${slug}?ep=${catalogEpisodeFallback}`;
        if (alt !== restEpisodeId) {
            const spent = Date.now() - startedAt;
            const remain = Math.max(1500, budget - spent);
            if (remain >= 1500) {
                return tryFetchHianimeRestStreamingData({
                    episodeId: alt,
                    category,
                    explicitServer,
                    perAttemptTimeoutMs: Math.min(perAttemptTimeoutMs, 8000),
                    totalBudgetMs: remain,
                });
            }
        }
    }
    return null;
}

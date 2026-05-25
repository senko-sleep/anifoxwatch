import { sourceManager } from '../src/services/source-manager.js';
import { anilistService } from '../src/services/anilist-service.js';

const anilistId = Number(process.env.ANILIST_ID || 7748);

async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ label: string; ms: number; value: T }> {
    const started = Date.now();
    const value = await fn();
    return { label, ms: Date.now() - started, value };
}

function summarizeSourceUrl(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname.slice(0, 48)}${parsed.pathname.length > 48 ? '...' : ''}`;
    } catch {
        return url.slice(0, 80);
    }
}

async function main() {
    console.log(`[adult-anilist-stream] Testing anilist-${anilistId}`);

    const metadata = await timed('anilist metadata', () => anilistService.getAnimeById(anilistId));
    console.log(`[adult-anilist-stream] ${metadata.label}: ${metadata.ms}ms`, {
        title: metadata.value?.title,
        type: metadata.value?.type,
        genres: metadata.value?.genres,
        episodes: metadata.value?.episodes,
    });

    const resolved = await timed('resolve anilist id', () => sourceManager.resolveAniListToStreamingId(anilistId));
    console.log(`[adult-anilist-stream] ${resolved.label}: ${resolved.ms}ms`, {
        streamingId: resolved.value,
    });

    const animeId = resolved.value || `anilist-${anilistId}`;
    const anime = await timed('source metadata', () => sourceManager.getAnime(animeId));
    console.log(`[adult-anilist-stream] ${anime.label}: ${anime.ms}ms`, {
        id: anime.value?.id,
        title: anime.value?.title,
        source: anime.value?.source,
    });

    const episodes = await timed('episodes', () => sourceManager.getEpisodes(animeId));
    console.log(`[adult-anilist-stream] ${episodes.label}: ${episodes.ms}ms`, {
        count: episodes.value.length,
        first: episodes.value[0],
    });

    const firstEpisode = episodes.value[0];
    if (!firstEpisode) {
        throw new Error(`No episodes found for ${animeId}`);
    }

    const servers = await timed('servers', () => sourceManager.getEpisodeServers(firstEpisode.id));
    console.log(`[adult-anilist-stream] ${servers.label}: ${servers.ms}ms`, {
        count: servers.value.length,
        names: servers.value.map((s) => `${s.name}:${s.type}`),
    });

    const stream = await timed('stream', () =>
        sourceManager.getStreamingLinks(firstEpisode.id, servers.value[0]?.name, 'sub', firstEpisode.number, anilistId, anime.value?.title || metadata.value?.title)
    );
    console.log(`[adult-anilist-stream] ${stream.label}: ${stream.ms}ms`, {
        source: stream.value.source,
        sources: stream.value.sources.map((s) => ({
            quality: s.quality,
            isM3U8: s.isM3U8,
            isEmbed: s.isEmbed,
            url: summarizeSourceUrl(s.url),
        })),
        subtitles: stream.value.subtitles.length,
    });

    if (!stream.value.sources.length) {
        throw new Error(`No stream sources found for ${firstEpisode.id}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('[adult-anilist-stream] failed:', error);
        process.exit(1);
    });

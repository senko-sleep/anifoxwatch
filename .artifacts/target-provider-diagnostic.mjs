import { readFile } from 'node:fs/promises';
process.env.BROWSER_EXTRACTOR = 'off';
for (const episode of [1, 13]) {
    const html = await readFile(new URL(`target-miruro-ep${episode}.html`, import.meta.url), 'utf8');
    const endpoints = [...html.matchAll(/value:\s*'([A-Za-z0-9+/=]+)'/g)]
        .map(match => Buffer.from(match[1], 'base64').toString('utf8').match(/src="([^"]+)"/)?.[1])
        .filter(url => url?.includes('megavid.buzz'));
    console.log(JSON.stringify({ type: 'native_episode_mapping', episode, endpoints }));
}
const { MiruroSource } = await import('../server/dist/sources/miruro-source.js');
const { probeMedia, mediaHeaders } = await import('../server/dist/services/playable-stream.js');
const provider = new MiruroSource();
const started = Date.now();
const before = process.memoryUsage();
const signal = AbortSignal.timeout(15_000);
try {
    const result = await provider.getStreamingLinks('miruro-seihantai-na-kimi-to-boku-2nd-season-episode-1', undefined, 'sub', {
        signal, timeout: 15_000, bypassCache: true, episodeNum: 1, anilistId: 210031,
    });
    const extractionMs = Date.now() - started;
    for (const source of result.sources) {
        await probeMedia(source.url, mediaHeaders(result, source), signal);
    }
    console.log(JSON.stringify({ type: 'http_media_diagnostic', environment: 'local_windows', episode: 1,
        sources: result.sources.map(source => ({ host: new URL(source.url).hostname, server: source.server })),
        extractionMs, durationMs: Date.now() - started, before, after: process.memoryUsage(),
        mediaBytesVerified: result.sources.length > 0, decodedPlaybackVerified: false }));
} catch (error) {
    console.log(JSON.stringify({ type: 'http_media_diagnostic', error: error.message, durationMs: Date.now() - started }));
    process.exitCode = 1;
}

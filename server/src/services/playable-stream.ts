import axios from 'axios';
import type { StreamingData, VideoSource } from '../types/streaming.js';
import { streamExtractor } from './stream-extractor.js';

export const mediaHeaders = (data: StreamingData, source: VideoSource): Record<string, string> =>
    Object.fromEntries(Object.entries({ 'user-agent': 'Mozilla/5.0', ...data.headers, ...source.headers })
        .map(([key, value]) => [key.toLowerCase(), value]));

/** Read a bounded prefix, including when an upstream ignores Range. Never download an episode. */
async function readMedia(url: string, headers: Record<string, string>, signal: AbortSignal, limit: number, range = false): Promise<Buffer> {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid media protocol');
    const response = await axios.get(url, {
        headers: { ...headers, ...(range ? { Range: `bytes=0-${limit - 1}` } : {}) },
        signal, timeout: 8000, responseType: 'stream', maxRedirects: 5,
    });
    const chunks: Buffer[] = [];
    let size = 0;
    try {
        for await (const chunk of response.data) {
            const bytes = Buffer.from(chunk);
            chunks.push(bytes.subarray(0, limit - size));
            size += bytes.length;
            if (size >= limit) break;
        }
    } finally { response.data.destroy(); }
    const body = Buffer.concat(chunks);
    if (!body.length) throw new Error('Empty media response');
    return body;
}

export function isMedia(bytes: Buffer): boolean {
    // MPEG-TS, ISO BMFF (MP4/fMP4), or WebM. HTML/JSON error bodies cannot pass.
    return (bytes.length > 188 && bytes[0] === 0x47 && bytes[188] === 0x47) ||
        (bytes.length > 12 && /^(ftyp|styp|moof|sidx|moov)$/.test(bytes.toString('ascii', 4, 8))) ||
        (bytes.length > 4 && bytes.readUInt32BE(0) === 0x1a45dfa3);
}

export async function probeMedia(url: string, headers: Record<string, string>, signal: AbortSignal, depth = 0): Promise<void> {
    if (depth > 3) throw new Error('Manifest nesting limit');
    const bytes = await readMedia(url, headers, signal, 256 * 1024, !/\.m3u8(?:\?|$)/i.test(url));
    const text = bytes.toString('utf8').trim();
    if (!text.startsWith('#EXTM3U')) {
        if (!isMedia(bytes)) throw new Error('Response is not playable media');
        return;
    }
    const lines = text.split(/\r?\n/).map(line => line.trim());
    const uris = lines.filter(line => line && !line.startsWith('#'));
    if (!uris.length) throw new Error('Manifest has no media');
    if (lines.some(line => line.startsWith('#EXT-X-STREAM-INF'))) {
        // A broken rendition must not hide another healthy rendition.
        for (const uri of uris) {
            try { await probeMedia(new URL(uri, url).href, headers, signal, depth + 1); return; }
            catch (error) { if (signal.aborted) throw error; }
        }
        throw new Error('All HLS renditions failed');
    }
    const key = lines.find(line => line.startsWith('#EXT-X-KEY:') && !line.includes('METHOD=NONE'));
    if (key) {
        if (!key.includes('METHOD=AES-128')) throw new Error('Unsupported HLS encryption');
        const keyUri = key.match(/URI="([^"]+)"/)?.[1];
        if (!keyUri || (await readMedia(new URL(keyUri, url).href, headers, signal, 64)).length !== 16)
            throw new Error('Invalid HLS key');
    }
    const init = lines.find(line => line.startsWith('#EXT-X-MAP:'))?.match(/URI="([^"]+)"/)?.[1];
    if (init && !isMedia(await readMedia(new URL(init, url).href, headers, signal, 4096, true)))
        throw new Error('Invalid HLS initialization segment');
    const segment = await readMedia(new URL(uris[0], url).href, headers, signal, 4096, true);
    if (!key && !isMedia(segment)) throw new Error('Invalid HLS media segment');
}

/** Embeds are extraction inputs, never proof that playback works. */
export async function playableStreams(data: StreamingData, signal: AbortSignal, bypassCache = false): Promise<StreamingData> {
    const results = await Promise.all((data.sources || []).map(async source => {
        try {
            let candidates = [source];
            let verifiedEmbed = false;
            if (source.isEmbed) {
                if (process.env.DISABLE_BROWSER_SOURCES === 'true') return [];
                const extracted = await streamExtractor.extractFromEmbed(source.url, 18000, true, bypassCache);
                verifiedEmbed = extracted.playbackVerified === true;
                candidates = extracted.streams.map(stream => ({
                    ...source, url: stream.url, originalUrl: stream.url, isEmbed: false,
                    isM3U8: stream.type === 'hls', headers: stream.headers || { Referer: new URL(source.url).origin + '/' },
                }));
            }
            const valid: VideoSource[] = [];
            for (const candidate of candidates) {
                try {
                    const headers = mediaHeaders(data, candidate);
                    await probeMedia(candidate.originalUrl || candidate.url, headers, signal);
                    valid.push({ ...candidate, headers });
                } catch (error) { console.warn(`[StreamValidation] ${data.source}: ${(error as Error).message}`); }
            }
            // Custom loaders (e.g. encrypted manifests) must stay in their own player.
            // Only accept that player after observing real decoded playback above.
            return valid.length ? valid : verifiedEmbed ? [source] : [];
        } catch (error) {
            console.warn(`[StreamValidation] ${data.source}: ${(error as Error).message}`);
            return [];
        }
    }));
    return { ...data, sources: results.flat() };
}

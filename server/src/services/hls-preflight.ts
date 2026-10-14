import axios from 'axios';
import { probeMedia } from './playable-stream.js';

/** Reject backends whose first fragment hides broken later fragments or renditions. */
export async function preflightHls(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<void> {
    const read = async (href: string) => {
        const response = await axios.get<string>(href, {
            signal, timeout: 2500, responseType: 'text', headers, maxContentLength: 256 * 1024,
        });
        if (typeof response.data !== 'string' || !response.data.trimStart().startsWith('#EXTM3U'))
            throw new Error('Invalid HLS manifest');
        return response.data.split(/\r?\n/).map(line => line.trim());
    };
    const master = await read(url);
    const uris = (lines: string[]) => lines.filter(line => line && !line.startsWith('#'));
    const playlists = master.some(line => line.startsWith('#EXT-X-STREAM-INF'))
        ? uris(master).map(uri => new URL(uri, url).href) : [url];
    for (const line of master.filter(line => line.startsWith('#EXT-X-MEDIA:') && line.includes('TYPE=AUDIO'))) {
        const uri = line.match(/URI="([^"]+)"/)?.[1];
        if (uri) playlists.push(new URL(uri, url).href);
    }
    if (!playlists.length || playlists.length > 8) throw new Error('Invalid HLS rendition count');
    // The player may select any rendition. Validate every exposed video/audio
    // playlist with two small media prefix reads at a time, never entire fragments.
    for (const playlist of new Set(playlists)) {
        signal.throwIfAborted();
        const lines = playlist === url ? master : await read(playlist);
        const segments = uris(lines);
        if (!segments.length) throw new Error('HLS rendition has no segments');
        const sample = [...new Set([0, 12, 36, 90].map(index => Math.min(index, segments.length - 1)))];
        for (let index = 0; index < sample.length; index += 2) {
            await Promise.all(sample.slice(index, index + 2).map(fragment =>
                probeMedia(new URL(segments[fragment], playlist).href, headers, signal)));
        }
    }
}

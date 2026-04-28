/**
 * In-process HiAnime scraping via `aniwatch` (same stack as Miruro / aniwatch-api).
 * Used when `HIANIME_REST_URL` is missing or returns non-200 / cheerio errors.
 */
import { HiAnime } from 'aniwatch';
import { mapEpisodeServerLabelToApiParam } from './hianime-rest-episode-discovery.js';
let scraper = null;
function getScraper() {
    if (!scraper)
        scraper = new HiAnime.Scraper();
    return scraper;
}
function extractIdsForCategory(data, category) {
    if (!data)
        return [];
    const rows = category === 'dub' ? data.dub : data.sub;
    if (!Array.isArray(rows))
        return [];
    const seen = new Set();
    const out = [];
    for (const row of rows) {
        const name = row?.serverName;
        if (typeof name !== 'string' || !name.trim())
            continue;
        const id = mapEpisodeServerLabelToApiParam(name);
        if (!seen.has(id)) {
            seen.add(id);
            out.push(id);
        }
    }
    return out;
}
export async function fetchLocalAniwatchEpisodeServerIds(animeEpisodeId, category, timeoutMs = 14_000) {
    try {
        const data = await Promise.race([
            getScraper().getEpisodeServers(animeEpisodeId),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
        ]);
        const ids = extractIdsForCategory(data, category);
        return ids.length > 0 ? ids : null;
    }
    catch {
        return null;
    }
}
/** Map REST `server` query (hd-1, megacloud, …) to aniwatch embed id. */
export function restServerQueryToAniwatchServer(server) {
    const s = server.trim().toLowerCase();
    const allowed = new Set(['hd-1', 'hd-2', 'megacloud', 'streamsb', 'streamtape', 'vidsrc', 't-cloud']);
    if (allowed.has(s))
        return s;
    if (s.includes('mega'))
        return 'megacloud';
    if (s.includes('tape'))
        return 'streamtape';
    if (s.includes('sb'))
        return 'streamsb';
    if (s.includes('vid') && s.includes('cloud'))
        return 'hd-2';
    return 'hd-1';
}
export async function fetchLocalEpisodeServersEnvelope(animeEpisodeId, timeoutMs = 14_000) {
    try {
        const data = await Promise.race([
            getScraper().getEpisodeServers(animeEpisodeId),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
        ]);
        return { status: 200, data };
    }
    catch {
        return null;
    }
}
export async function fetchLocalAniwatchEpisodeSourcesJson(opts) {
    const { animeEpisodeId, server, category, timeoutMs = 16_000 } = opts;
    const cat = category === 'dub' ? 'dub' : category === 'raw' ? 'raw' : 'sub';
    const srv = restServerQueryToAniwatchServer(server || 'hd-1');
    try {
        const data = await Promise.race([
            getScraper().getEpisodeSources(animeEpisodeId, srv, cat),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
        ]);
        return { status: 200, data };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=hianime-local-aniwatch.js.map
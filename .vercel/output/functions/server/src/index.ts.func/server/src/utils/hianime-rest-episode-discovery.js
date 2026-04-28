/**
 * Discover which `server` query values an episode actually exposes on HiAnime (via aniwatch-api
 * `/episode/servers`), then merge with explicit preference + static fallback — same idea as Miruro
 * trying hd-1 / hd-2 / megacloud when one embed is missing for dub/sub.
 */
import { HIANIME_REST_SERVER_ORDER, mapUiServerToHianimeRestQuery, } from './hianime-rest-servers.js';
export const HIANIME_REST_FETCH_HEADERS = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};
/** Map HiAnime "server name" labels from /episode/servers to aniwatch-api `server` query ids. */
export function mapEpisodeServerLabelToApiParam(label) {
    const s = label.replace(/\s+/g, '').toLowerCase();
    if (s.includes('vidstreaming') || s === 'hd-1' || s === 'hd1')
        return 'hd-1';
    if (s.includes('vidcloud') || s === 'hd-2' || s === 'hd2')
        return 'hd-2';
    if (s.includes('megacloud') || s.includes('mega'))
        return 'megacloud';
    if (s.includes('streamsb') || (s.length <= 4 && s.includes('sb')))
        return 'streamsb';
    if (s.includes('streamtape') || s.includes('tape'))
        return 'streamtape';
    if (s.includes('vidsrc'))
        return 'vidsrc';
    if (s.includes('t-cloud') || s.includes('tcloud'))
        return 't-cloud';
    return s.replace(/[^a-z0-9-]/g, '') || 'hd-1';
}
function extractIdsForCategory(data, category) {
    if (!data)
        return [];
    const key = category === 'dub' ? 'dub' : 'sub';
    const rows = data[key];
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
/** GET `${base}/api/v2/hianime/episode/servers` — returns server ids for sub/dub from payload, or null on failure. */
export async function fetchHianimeRestEpisodeServerIds(baseUrl, episodeId, category, timeoutMs = 12_000) {
    const qs = new URLSearchParams({ animeEpisodeId: episodeId });
    const url = `${baseUrl.replace(/\/$/, '')}/api/v2/hianime/episode/servers?${qs}`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, {
            signal: controller.signal,
            headers: { ...HIANIME_REST_FETCH_HEADERS },
        });
        clearTimeout(tid);
        if (!resp.ok)
            return null;
        const body = (await resp.json());
        if (body?.status !== undefined && body.status !== 200)
            return null;
        const ids = extractIdsForCategory(body?.data, category);
        return ids.length > 0 ? ids : null;
    }
    catch {
        clearTimeout(tid);
        return null;
    }
}
/**
 * Build try order: explicit UI preference first, then servers HiAnime lists for this episode,
 * then static {@link HIANIME_REST_SERVER_ORDER} for anything still missing.
 */
export function buildHianimeRestServersToTry(opts) {
    const { explicitServer, discoveredIds } = opts;
    const rawPref = explicitServer?.trim();
    const pref = rawPref !== undefined && rawPref !== '' ? mapUiServerToHianimeRestQuery(rawPref) : undefined;
    const discovered = discoveredIds?.filter(Boolean) ?? [];
    const fallback = [...HIANIME_REST_SERVER_ORDER];
    const seen = new Set();
    const out = [];
    const add = (s) => {
        if (!s || seen.has(s))
            return;
        seen.add(s);
        out.push(s);
    };
    if (pref)
        add(pref);
    for (const s of discovered)
        add(s);
    for (const s of fallback)
        add(s);
    return out.length > 0 ? out : [...fallback];
}
//# sourceMappingURL=hianime-rest-episode-discovery.js.map
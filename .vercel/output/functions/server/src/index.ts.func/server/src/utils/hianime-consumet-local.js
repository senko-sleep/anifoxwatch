/**
 * When `aniwatch` fails with cheerio/CF on serverless, Consumet's Hianime provider often still works.
 * Mirrors MiruroSource.tryConsumetHianime (episode id + server rotation).
 */
let consumetMod = null;
async function getMod() {
    if (!consumetMod)
        consumetMod = await import('@consumet/extensions');
    return consumetMod;
}
async function getHianimeProvider() {
    const mod = await getMod();
    const p = new mod.ANIME.Hianime();
    // hianime.to often returns a shutdown page; active HiAnime mirrors use aniwatchtv.to (same as Miruro).
    p.baseUrl = 'https://aniwatchtv.to';
    return p;
}
/** `slug?ep=KEY` → `slug$episode$KEY` (Consumet Hianime). */
export function normalizedAnimeEpisodeIdToConsumet(animeEpisodeId) {
    const idx = animeEpisodeId.indexOf('?ep=');
    if (idx < 1)
        return animeEpisodeId.replace(/\?ep=/i, '$episode$');
    const slug = animeEpisodeId.slice(0, idx);
    const key = animeEpisodeId.slice(idx + 4).trim();
    return `${slug}$episode$${key}`;
}
/**
 * Consumet HiAnime `fetchEpisodeSources` only switches VidCloud, VidStreaming, StreamSB, StreamTape
 * (see `hianime.js`) — there is no MegaCloud branch for the `$episode$` id path.
 * Map megacloud / UI "HD-1" style labels to VidStreaming (server index 4 on hianime.to).
 */
function mapStreamServerToConsumet(server, mod) {
    const s = server.toLowerCase();
    if (s.includes('vid') && s.includes('stream'))
        return mod.StreamingServers.VidStreaming;
    if (s.includes('tape'))
        return mod.StreamingServers.StreamTape;
    if (s.includes('sb'))
        return mod.StreamingServers.StreamSB;
    if (s.includes('hd-2') || (s.includes('vid') && s.includes('cloud')))
        return mod.StreamingServers.VidCloud;
    if (s.includes('mega'))
        return mod.StreamingServers.VidStreaming;
    return mod.StreamingServers.VidStreaming;
}
function mapToApiShape(data) {
    return {
        sources: data.sources || [],
        subtitles: (data.subtitles || []).filter((t) => t.lang !== 'Thumbnails' && t.lang !== 'thumbnails'),
        headers: data.headers || { Referer: 'https://megacloud.blog/' },
    };
}
/** Same JSON envelope as aniwatch-api: `{ status: 200, data: { sources, subtitles, headers } }`. */
export async function fetchConsumetHianimeEpisodeSourcesEnvelope(opts) {
    const { animeEpisodeId, server, category, timeoutMs = 18_000 } = opts;
    const consumetId = normalizedAnimeEpisodeIdToConsumet(animeEpisodeId);
    const cat = category === 'dub' ? 'dub' : 'sub';
    try {
        const mod = await getMod();
        const subOrDub = cat === 'dub' ? mod.SubOrSub.DUB : mod.SubOrSub.SUB;
        const p = await getHianimeProvider();
        // One embed only: multiple attempts each hit axios + cheerio and ignore our timeout (Promise.race
        // does not cancel in-flight HTTP). Extra retries caused 40s+ on serverless and 502s.
        const srv = mapStreamServerToConsumet(server, mod) ?? mod.StreamingServers.VidStreaming;
        try {
            const data = await Promise.race([
                p.fetchEpisodeSources(consumetId, srv, subOrDub),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), Math.min(timeoutMs, 14_000))),
            ]);
            if (data?.sources?.length) {
                return { status: 200, data: mapToApiShape(data) };
            }
        }
        catch {
            return null;
        }
    }
    catch {
        return null;
    }
    return null;
}
//# sourceMappingURL=hianime-consumet-local.js.map
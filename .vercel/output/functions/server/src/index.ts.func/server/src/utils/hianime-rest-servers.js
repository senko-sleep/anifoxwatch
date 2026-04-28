/**
 * HiAnime / aniwatch-api `server` query values. Newer site embeds use megacloud, vidsrc, t-cloud;
 * older tests still use hd-1 / hd-2 / streamsb / streamtape.
 */
export const HIANIME_REST_SERVER_ORDER = [
    'megacloud',
    'vidsrc',
    't-cloud',
    'hd-1',
    'hd-2',
    'streamsb',
    'streamtape',
];
/**
 * Convert Miruro embed / episode list keys to aniwatch-api `animeEpisodeId` (`slug?ep=INTERNAL`).
 * Mirrors Miruro `toAniwatchEpisodeQuery`: `slug$ep=N$token=KEY` → `slug?ep=KEY`.
 */
export function normalizeAnimeEpisodeIdForHianimeRest(raw) {
    let s = raw.replace(/^miruro-/i, '').replace(/^kaido-/i, '');
    const tokenForm = /^(.+)\$ep=\d+\$token=(.+)$/i.exec(s);
    if (tokenForm)
        return `${tokenForm[1]}?ep=${tokenForm[2]}`;
    const dollarEp = /^(.+)\$ep=(\d+)$/i.exec(s);
    if (dollarEp)
        return `${dollarEp[1]}?ep=${dollarEp[2]}`;
    if (s.includes('?ep='))
        return s;
    if (s.includes('$episode$'))
        return s.replace('$episode$', '?ep=');
    return s;
}
/** True if this id can be resolved via HiAnime REST (`aniwatch-api`) after normalization. */
export function isHianimeStyleEpisodeId(episodeId) {
    const n = normalizeAnimeEpisodeIdForHianimeRest(episodeId);
    return /^[^/?#]+\?ep=[^&?#]+$/i.test(n);
}
/** Map UI / legacy labels to aniwatch-api `server` values (do not collapse megacloud → hd-1). */
export function mapUiServerToHianimeRestQuery(raw) {
    if (!raw)
        return undefined;
    const lower = raw.trim().toLowerCase();
    if (lower === 'vidstreaming')
        return 'megacloud';
    if (lower === 'hd-3')
        return 'hd-2';
    return lower;
}
/** Preferred server first, then the rest without duplicates. */
export function buildHianimeRestServerTryList(explicit) {
    const preferred = mapUiServerToHianimeRestQuery(explicit);
    const order = [...HIANIME_REST_SERVER_ORDER];
    if (preferred) {
        const known = order.includes(preferred);
        if (known) {
            return [preferred, ...order.filter((s) => s !== preferred)];
        }
        return [preferred, ...order];
    }
    return order;
}
//# sourceMappingURL=hianime-rest-servers.js.map
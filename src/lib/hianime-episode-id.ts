/**
 * Keep in sync with `server/src/utils/hianime-rest-servers.ts` (normalize + HiAnime REST detection).
 */

export function normalizeAnimeEpisodeIdForHianimeRest(raw: string): string {
    let s = raw.replace(/^miruro-/i, '').replace(/^kaido-/i, '');
    const tokenForm = /^(.+)\$ep=\d+\$token=(.+)$/i.exec(s);
    if (tokenForm) return `${tokenForm[1]}?ep=${tokenForm[2]}`;
    const dollarEp = /^(.+)\$ep=(\d+)$/i.exec(s);
    if (dollarEp) return `${dollarEp[1]}?ep=${dollarEp[2]}`;
    if (s.includes('?ep=')) return s;
    if (s.includes('$episode$')) return s.replace('$episode$', '?ep=');
    return s;
}

export function isHianimeStyleEpisodeId(episodeId: string): boolean {
    const n = normalizeAnimeEpisodeIdForHianimeRest(episodeId);
    return /^[^/?#]+\?ep=[^&?#]+$/i.test(n);
}

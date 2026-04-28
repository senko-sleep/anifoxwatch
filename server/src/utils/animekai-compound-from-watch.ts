/**
 * Rebuild Consumet AnimeKai episode key `slug$ep=N$token=KEY` from a HiAnime-style watch URL
 * plus catalog episode N (from `ep_num` query). Used when the path is `slug?ep=<token>` after
 * normalizing list ids — Miruro/aniwatch may be down (521) while AnimeKai still resolves the compound id.
 * Also handles direct AnimeKai compound IDs in format `slug$ep=N$token=KEY`.
 */
export function reconstructAnimeKaiCompoundFromWatchUrl(
    watchEpisodeId: string,
    catalogEpisode: number
): string | null {
    const trimmed = watchEpisodeId.trim();
    
    // Handle direct AnimeKai compound ID format: slug$ep=N$token=KEY
    const compoundMatch = /^([^$]+)\$ep=(\d+)\$token=([^$]+)$/i.exec(trimmed);
    if (compoundMatch) {
        // Already in correct format, return as-is
        return trimmed;
    }
    
    // Handle HiAnime-style format: slug?ep=token
    const m = /^([^/?#]+)\?ep=([^&?#]+)$/i.exec(trimmed);
    if (!m) return null;
    if (!Number.isFinite(catalogEpisode) || catalogEpisode < 1) return null;
    const epKey = m[2];
    if (/^\d+$/.test(epKey)) return null;
    return `${m[1]}$ep=${catalogEpisode}$token=${epKey}`;
}

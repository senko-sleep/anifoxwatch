/**
 * Resolve HiAnime site slug IDs (e.g. frieren-beyond-journeys-end-18542) via optional REST
 * or the in-worker aniwatch scraper — CloudflareConsumet cannot map these IDs.
 */

import { HiAnime } from 'aniwatch';
import { getHianimeRestBase, fetchHianimeRestData } from '../routes-worker/hianime-rest.js';
import type { AnimeBase, Episode } from '../types/anime.js';

const hianime = new HiAnime.Scraper();

type HianimeAboutPayload = { anime?: { info?: Record<string, unknown>; moreInfo?: Record<string, unknown> } };

/** Minimal shape to read sub/dub counts from getInfo / REST about payload */
type HianimeAboutForDub = { anime?: { info?: { stats?: { episodes?: { sub?: number; dub?: number } } } } };

function mapAboutPayloadToAnimeBase(payload: HianimeAboutPayload, fallbackId: string): AnimeBase | null {
    const info = payload?.anime?.info as Record<string, unknown> | undefined;
    if (!info) return null;
    const name = info.name as string | undefined;
    const sid = info.id as string | undefined;
    if (!name && !sid) return null;

    const more = (payload?.anime?.moreInfo || {}) as Record<string, unknown>;
    const stats = (info.stats || {}) as Record<string, unknown>;
    const epStats = (stats.episodes || {}) as { sub?: number; dub?: number };
    const sub = typeof epStats.sub === 'number' ? epStats.sub : 0;
    const dub = typeof epStats.dub === 'number' ? epStats.dub : 0;
    const episodes = Math.max(sub, dub, 0);

    const statusStr = String(more.status || '').toLowerCase();
    let status: AnimeBase['status'] = 'Ongoing';
    if (statusStr.includes('finished') || statusStr.includes('completed')) status = 'Completed';
    else if (statusStr.includes('not yet') || statusStr.includes('upcoming')) status = 'Upcoming';

    const typeRaw = String(stats.type || info.type || 'TV').toUpperCase();
    const type: AnimeBase['type'] =
        typeRaw.includes('MOVIE') ? 'Movie' :
        typeRaw.includes('OVA') ? 'OVA' :
        typeRaw.includes('ONA') ? 'ONA' :
        typeRaw.includes('SPECIAL') ? 'Special' : 'TV';

    const malRaw = more.malscore ?? stats.rating;
    const malscore = typeof malRaw === 'number' ? malRaw : parseFloat(String(malRaw || ''));
    const rating = !isNaN(malscore) && malscore > 0 ? malscore : undefined;

    const genres = Array.isArray(more.genres) ? (more.genres as string[]) : [];

    let studios: string[] | undefined;
    if (more.studios !== undefined) {
        studios = Array.isArray(more.studios)
            ? (more.studios as string[])
            : String(more.studios).split(',').map((s) => s.trim()).filter(Boolean);
    }

    return {
        id: sid || fallbackId,
        title: name || fallbackId,
        titleJapanese: typeof more.japanese === 'string' ? more.japanese : undefined,
        image: String(info.poster || ''),
        description: String(info.description || ''),
        type,
        status,
        rating,
        episodes,
        duration: typeof stats.duration === 'string' ? stats.duration : typeof more.duration === 'string' ? more.duration : undefined,
        genres,
        studios,
        source: 'hianime',
        subCount: sub,
        dubCount: dub,
    };
}

function mapEpisodesPayload(data: { episodes?: Array<Record<string, unknown>> }, hasDub: boolean): Episode[] {
    const eps = data?.episodes;
    if (!Array.isArray(eps)) return [];
    return eps.map((ep) => ({
        id: String(ep.episodeId || ''),
        number: typeof ep.number === 'number' ? ep.number : parseInt(String(ep.number || '1'), 10) || 1,
        title: String(ep.title || `Episode ${ep.number || ''}`),
        isFiller: Boolean(ep.isFiller),
        hasSub: true,
        hasDub: hasDub,
    })).filter((e) => e.id.length > 0);
}

/** Anime details for a HiAnime slug id (REST first, then scraper). */
export async function loadHianimeAnimeDetails(env: unknown, id: string): Promise<AnimeBase | null> {
    const base = getHianimeRestBase(env);
    if (base) {
        const raw = await fetchHianimeRestData<HianimeAboutPayload>(
            base,
            `/api/v2/hianime/anime/${encodeURIComponent(id)}`
        );
        if (raw) {
            const mapped = mapAboutPayloadToAnimeBase(raw, id);
            if (mapped) return mapped;
        }
    }
    try {
        const raw = (await hianime.getInfo(id)) as HianimeAboutPayload;
        return mapAboutPayloadToAnimeBase(raw, id);
    } catch {
        return null;
    }
}

/** Episode list for a HiAnime anime id (REST first, then scraper). */
export async function loadHianimeEpisodeList(env: unknown, animeId: string, hasDubHint?: boolean): Promise<Episode[]> {
    let hasDub = hasDubHint ?? false;
    const base = getHianimeRestBase(env);
    if (base) {
        const about = await fetchHianimeRestData<HianimeAboutForDub>(
            base,
            `/api/v2/hianime/anime/${encodeURIComponent(animeId)}`
        );
        const epStats = about?.anime?.info?.stats?.episodes;
        if (epStats && typeof epStats.dub === 'number') hasDub = epStats.dub > 0;

        const raw = await fetchHianimeRestData<{ episodes?: Array<Record<string, unknown>> }>(
            base,
            `/api/v2/hianime/anime/${encodeURIComponent(animeId)}/episodes`
        );
        if (raw) {
            const mapped = mapEpisodesPayload(raw, hasDub);
            if (mapped.length > 0) return mapped;
        }
    }
    try {
        const raw = await hianime.getEpisodes(animeId) as { episodes?: Array<Record<string, unknown>>; totalEpisodes?: number };
        if (!hasDub) {
            try {
                const info = (await hianime.getInfo(animeId)) as HianimeAboutForDub;
                const d = info?.anime?.info?.stats?.episodes?.dub;
                hasDub = typeof d === 'number' && d > 0;
            } catch { /* ignore */ }
        }
        return mapEpisodesPayload(raw, hasDub);
    } catch {
        return [];
    }
}

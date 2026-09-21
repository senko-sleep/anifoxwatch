 /**
 * The adult catalog's metadata: AniList's adult listing (thousands of titles with
 * posters, synopses, scores, tags and synonyms). It exists independently of any
 * streaming site, so browsing and search cover the whole field, not only what one
 * scraped site happens to list. Playback is a separate question, answered by the
 * hentai index (services/hentai-index).
 *
 * Safety: every query excludes titles tagged `Primarily Child Cast`. AniList has no
 * explicit tag for material sexualising children; this is the closest signal it
 * publishes, so it is applied at the API level (never a client-side afterthought).
 * It is a proxy, not a guarantee.
 */

import type { AnimeBase } from '../types/anime.js';
import { logger } from '../utils/logger.js';
import { anilistSlot, anilistThrottled, anilistOk } from '../lib/anilist-pace.js';

const ENDPOINT = 'https://graphql.anilist.co';
export const EXCLUDED_TAGS = ['Primarily Child Cast'];

const MEDIA_FIELDS = `
  id idMal isAdult
  title { romaji english native }
  synonyms
  coverImage { extraLarge large color }
  bannerImage
  description(asHtml: false)
  genres
  tags { name rank }
  averageScore popularity
  seasonYear startDate { year }
  episodes duration format status
  studios(isMain: true) { nodes { name } }
`;

export interface AdultMedia {
    id: number;
    isAdult: boolean;
    title: { romaji: string | null; english: string | null; native: string | null };
    synonyms: string[];
    coverImage: { extraLarge: string | null; large: string | null; color: string | null };
    bannerImage: string | null;
    description: string | null;
    genres: string[];
    tags: { name: string; rank: number }[];
    averageScore: number | null;
    popularity: number | null;
    seasonYear: number | null;
    startDate: { year: number | null } | null;
    episodes: number | null;
    duration: number | null;
    format: string | null;
    status: string | null;
    studios: { nodes: { name: string }[] };
}

export type AdultSort = 'popular' | 'trending' | 'rating' | 'newest' | 'title';
const SORTS: Record<AdultSort, string> = {
    popular: 'POPULARITY_DESC',
    trending: 'TRENDING_DESC',
    rating: 'SCORE_DESC',
    newest: 'START_DATE_DESC',
    title: 'TITLE_ROMAJI',
};

// ── Transport: one paced queue in front of AniList ───────────────────────────
//
// AniList allows a limited number of requests per minute and answers 429 beyond it.
// A page here can want a dozen queries at once (a search is one listing plus several
// title lookups), and several visitors can want them at the same moment, so without
// a shared pace the limit is hit constantly — and because whichever requests happen
// to get through varies with timing, the same search returns different results each
// time. Everything therefore goes through this one queue:
//
//   · request starts are spaced by the shared pace in lib/anilist-pace;
//   · identical requests already in flight share a single answer;
//   · answers are cached, so a repeat is free;
//   · a 429 widens the gap and is retried, instead of failing the page.

const cache = new Map<string, { at: number; value: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
const TTL = 30 * 60 * 1000;

async function request<T>(query: string, variables: Record<string, unknown>, key: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        await anilistSlot();

        let res: Response;
        try {
            res = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ query, variables }),
                signal: AbortSignal.timeout(20000),
            });
        } catch (e) {
            if (attempt >= 3) throw e;
            continue;
        }

        if (res.status === 429 || res.status >= 500) {
            const retryAfter = parseInt(res.headers.get('retry-after') ?? '', 10);
            anilistThrottled(Number.isFinite(retryAfter) ? retryAfter : undefined);
            if (attempt >= 4) throw new Error(`AniList ${res.status}`);
            const wait = Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 15000) : Math.min(1000 * 2 ** attempt, 8000);
            await new Promise((r) => setTimeout(r, wait));
            continue;
        }
        if (!res.ok) throw new Error(`AniList ${res.status}`);

        const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
        if (json.errors?.length || !json.data) throw new Error(`AniList: ${json.errors?.[0]?.message ?? 'no data'}`);
        anilistOk();
        cache.set(key, { at: Date.now(), value: json.data });
        return json.data;
    }
}

function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const key = JSON.stringify([query, variables]);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.value as T);

    const flying = inFlight.get(key);
    if (flying) return flying as Promise<T>;

    const run = request<T>(query, variables, key).finally(() => inFlight.delete(key));
    inFlight.set(key, run);
    return run;
}

// ── Queries ──────────────────────────────────────────────────────────────────

export interface BrowseOpts {
    page?: number;
    perPage?: number;
    sort?: AdultSort;
    /** A genre name (Comedy…) or an adult tag (Harem…) — resolved against AniList's own lists. */
    genre?: string;
    search?: string;
}

export interface BrowsePage {
    items: AdultMedia[];
    currentPage: number;
    lastPage: number;
    hasNextPage: boolean;
}

/** AniList refuses to page past 5,000 entries; asking anyway is a 400, not an empty page. */
const MAX_DEPTH = 5000;

export async function browseAdult(opts: BrowseOpts = {}): Promise<BrowsePage> {
    const page = Math.max(1, opts.page ?? 1);
    const perPage = Math.min(opts.perPage ?? 30, 50);
    if (page * perPage > MAX_DEPTH) return { items: [], currentPage: page, lastPage: Math.floor(MAX_DEPTH / perPage), hasNextPage: false };

    const { genres, tags } = await getFacets();

    const genre = opts.genre?.trim();
    const asGenre = genre && genres.find((g) => g.toLowerCase() === genre.toLowerCase());
    const asTag = genre && !asGenre ? tags.find((t) => t.toLowerCase() === genre.toLowerCase()) : undefined;

    // A filter we don't recognise matches nothing — silently dropping it would return everything.
    if (genre && !asGenre && !asTag) return { items: [], currentPage: page, lastPage: 0, hasNextPage: false };

    const sort = opts.search ? 'SEARCH_MATCH' : SORTS[opts.sort ?? 'popular'];

    const data = await gql<{ Page: { pageInfo: { currentPage: number; lastPage: number; hasNextPage: boolean }; media: AdultMedia[] } }>(
        `query ($page: Int, $perPage: Int, $sort: [MediaSort], $excluded: [String], $genre: String, $tag: String, $search: String) {
          Page(page: $page, perPage: $perPage) {
            pageInfo { currentPage lastPage hasNextPage }
            media(type: ANIME, isAdult: true, tag_not_in: $excluded, sort: $sort,
                  genre: $genre, tag: $tag, search: $search) { ${MEDIA_FIELDS} }
          }
        }`,
        {
            page,
            perPage,
            sort: [sort],
            excluded: EXCLUDED_TAGS,
            genre: asGenre || undefined,
            tag: asTag || undefined,
            search: opts.search || undefined,
        }
    );

    const p = data.Page;
    return {
        items: p.media.filter(isAllowed),
        currentPage: p.pageInfo.currentPage,
        lastPage: p.pageInfo.lastPage,
        hasNextPage: p.pageInfo.hasNextPage,
    };
}

/**
 * Candidate catalog entries for many titles at once — one request per few titles, using
 * aliases — so a whole shelf of site titles can be checked against the catalog cheaply.
 * Candidates only: the caller decides what counts as the same show.
 */
const titleHits = new Map<string, { at: number; value: AdultMedia[] }>();

export async function findByTitles(titles: string[]): Promise<AdultMedia[][]> {
    const out: AdultMedia[][] = titles.map(() => []);

    // Cached per title, not per batch: the same site titles come back on every shelf and
    // most searches, and a title that has already been looked up shouldn't cost a request
    // again just because it landed in a differently-grouped batch this time.
    const missing: number[] = [];
    titles.forEach((t, i) => {
        const hit = titleHits.get(t);
        if (hit && Date.now() - hit.at < TTL) out[i] = hit.value;
        else missing.push(i);
    });
    if (!missing.length) return out;

    const BATCH = 6;
    const starts = Array.from({ length: Math.ceil(missing.length / BATCH) }, (_, i) => i * BATCH);
    await Promise.all(starts.map(async (start) => {
        const idxs = missing.slice(start, start + BATCH);
        const chunk = idxs.map((i) => titles[i]);
        const vars: Record<string, unknown> = { excluded: EXCLUDED_TAGS };
        const decls = chunk.map((_, i) => `$s${i}: String`).join(', ');
        const aliases = chunk
            .map((t, i) => {
                vars[`s${i}`] = t;
                return `a${i}: Page(perPage: 4) { media(type: ANIME, isAdult: true, search: $s${i}, tag_not_in: $excluded) { ${MEDIA_FIELDS} } }`;
            })
            .join('\n');

        try {
            const data = await gql<Record<string, { media: AdultMedia[] }>>(
                `query ($excluded: [String], ${decls}) { ${aliases} }`,
                vars
            );
            idxs.forEach((target, i) => {
                const found = (data[`a${i}`]?.media ?? []).filter(isAllowed);
                out[target] = found;
                titleHits.set(titles[target], { at: Date.now(), value: found });
            });
        } catch (e) {
            logger.warn(`[anilist-adult] batch lookup failed: ${(e as Error).message}`);
        }
    }));
    return out;
}

export async function getAdult(id: number): Promise<AdultMedia | null> {
    try {
        const data = await gql<{ Media: AdultMedia | null }>(
            `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} } }`,
            { id }
        );
        const m = data.Media;
        // Only the adult catalog, and never an excluded title — even by direct link.
        return m && m.isAdult && isAllowed(m) ? m : null;
    } catch (e) {
        logger.warn(`[anilist-adult] getAdult(${id}) failed: ${(e as Error).message}`);
        return null;
    }
}

/**
 * Every excluded title with its synonyms, so the streaming sites' libraries can be checked
 * against the same list (the catalog filters its own listing; a site can carry the same
 * title under the same name).
 */
export async function getExcludedTitles(): Promise<string[]> {
    const out: string[] = [];
    for (let page = 1; page <= 5; page++) {
        const data = await gql<{ Page: { pageInfo: { hasNextPage: boolean }; media: AdultMedia[] } }>(
            `query ($page: Int, $tags: [String]) {
              Page(page: $page, perPage: 50) {
                pageInfo { hasNextPage }
                media(type: ANIME, isAdult: true, tag_in: $tags) { ${MEDIA_FIELDS} }
              }
            }`,
            { page, tags: EXCLUDED_TAGS }
        );
        data.Page.media.forEach((m) => out.push(...allTitles(m)));
        if (!data.Page.pageInfo.hasNextPage) break;
    }
    return out;
}

/** Second line of defence behind the query filter (direct lookups don't go through it). */
function isAllowed(m: AdultMedia): boolean {
    return !m.tags.some((t) => EXCLUDED_TAGS.includes(t.name));
}

/** Genres and adult tags AniList knows, for filter chips (cached a day). */
let facets: { at: number; genres: string[]; tags: string[]; chips: string[] } | null = null;

/** Everyday tags worth a chip alongside the adult ones (they are not adult-flagged on AniList). */
const COMMON_TAGS = ['Female Harem', 'Male Harem', 'School', 'Maids', 'Office Lady', 'Teacher', 'Monster Girl', 'Magic', 'Vampire', 'Succubus'];

/**
 * `genres` + `tags` are everything a filter may name; `chips` is the shorter list shown in the UI.
 */
export async function getFacets(): Promise<{ genres: string[]; tags: string[]; chips: string[] }> {
    if (facets && Date.now() - facets.at < 24 * 60 * 60 * 1000) return facets;
    const data = await gql<{ GenreCollection: string[]; MediaTagCollection: { name: string; isAdult: boolean }[] }>(
        `{ GenreCollection MediaTagCollection { name isAdult } }`,
        {}
    );
    // "Hentai" is every title here, so it isn't a useful filter.
    const genres = data.GenreCollection.filter((g) => g !== 'Hentai');
    const allowed = data.MediaTagCollection.filter((t) => !EXCLUDED_TAGS.includes(t.name));
    const adult = allowed.filter((t) => t.isAdult).map((t) => t.name);
    const common = COMMON_TAGS.filter((c) => allowed.some((t) => t.name === c));
    facets = {
        at: Date.now(),
        genres,
        tags: allowed.map((t) => t.name),
        chips: [...new Set([...genres, ...common, ...adult])],
    };
    return facets;
}

// ── Mapping ──────────────────────────────────────────────────────────────────

const FORMAT: Record<string, AnimeBase['type']> = { TV: 'TV', TV_SHORT: 'TV', MOVIE: 'Movie', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Special' };
const STATUS: Record<string, AnimeBase['status']> = {
    RELEASING: 'Ongoing',
    FINISHED: 'Completed',
    NOT_YET_RELEASED: 'Upcoming',
    CANCELLED: 'Completed',
    HIATUS: 'Ongoing',
};

/** Every name we can match a site's title against. */
export const allTitles = (m: AdultMedia): string[] =>
    [m.title.english, m.title.romaji, ...m.synonyms].filter((t): t is string => Boolean(t && t.trim()));

export const yearOf = (m: AdultMedia): number | undefined => m.seasonYear ?? m.startDate?.year ?? undefined;

/** AniList descriptions carry line breaks and a trailing "(Source: …)" — keep the story. */
const tidyDescription = (d: string | null): string =>
    (d ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\(Source:[^)]*\)\s*$/i, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

export function toAnimeBase(m: AdultMedia): AnimeBase {
    const title = m.title.english || m.title.romaji || m.title.native || 'Unknown';
    const topTags = [...m.tags].sort((a, b) => b.rank - a.rank).filter((t) => t.rank >= 50).slice(0, 8).map((t) => t.name);
    return {
        id: `hentai-${m.id}`,
        title,
        titleEnglish: m.title.english ?? undefined,
        titleRomaji: m.title.romaji ?? undefined,
        titleJapanese: m.title.native ?? undefined,
        image: m.coverImage.extraLarge || m.coverImage.large || '',
        cover: m.coverImage.large ?? undefined,
        banner: m.bannerImage ?? undefined,
        description: tidyDescription(m.description),
        type: FORMAT[m.format ?? ''] ?? 'OVA',
        status: STATUS[m.status ?? ''] ?? 'Completed',
        rating: m.averageScore ? m.averageScore / 10 : undefined,
        episodes: m.episodes ?? 0,
        genres: [...new Set([...m.genres.filter((g) => g !== 'Hentai'), ...topTags])],
        studios: m.studios.nodes.map((s) => s.name),
        year: yearOf(m),
        isMature: true,
        source: 'AniList',
        accentColor: m.coverImage.color ?? undefined,
    };
}

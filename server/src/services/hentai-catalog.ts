/**
 * The adult catalog, as its own thing.
 *
 * Two layers, deliberately separate:
 *
 *   catalog   — AniList's adult listing. Thousands of titles with real posters,
 *               synopses, scores and tags, independent of any streaming site. This is
 *               what browse and search cover, so nothing is missing just because a
 *               scraped site doesn't list it.
 *   playback  — the hentai index: everything WatchHentai and HentaiMama carry. A catalog
 *               title is matched to the sites that have it (strictly — see hentai-index),
 *               which decides where its episodes and video come from. Titles no site
 *               carries stay listed, marked unavailable.
 *
 * Titles that exist on a site but not in the catalog are still found: they're added to
 * search results from the index.
 */

import { hentaiMamaSource } from '../sources/hentaimama-source.js';
import { hentaiHavenSource } from '../sources/hentaihaven-source.js';
import { watchHentaiSource } from '../sources/watchhentai-source.js';
import { isBlockedGenre } from '../sources/watchhentai-parse.js';
import {
    allTitles,
    browseAdult,
    findByTitles,
    getAdult,
    getExcludedTitles,
    getFacets,
    toAnimeBase,
    yearOf,
    type AdultMedia,
    type AdultSort,
} from './anilist-adult.js';
import {
    findEntry,
    groupEntries,
    isBlockedEntry,
    matchTitle,
    newest,
    normalizeTitle,
    relevance,
    searchEntries,
    setBlocked,
    siblings,
    stats as indexStats,
    titleSimilarity,
    whenUsable,
    type IndexEntry,
    type SourceName,
} from './hentai-index.js';
import type { AnimeBase, AnimeSearchResult, Episode } from '../types/anime.js';

export interface HentaiSection {
    key: string;
    title: string;
    subtitle?: string;
    /** Genre/tag name when the section is a shelf for one — lets the UI link to "see all". */
    genre?: string;
    items: AnimeBase[];
}

export interface HentaiHome {
    featured: AnimeBase[];
    sections: HentaiSection[];
    genres: { slug: string; name: string }[];
}

export interface HentaiTitle {
    anime: AnimeBase;
    episodes: Episode[];
}

// ── Slugs ────────────────────────────────────────────────────────────────────
//   /hentai/<title>-al<anilistId>   a catalog title
//   /hentai/<slug>                  a WatchHentai title the catalog doesn't have
//   /hentai/hm--<slug>              a HentaiMama title the catalog doesn't have
//   /hentai/hh--<slug>              a HentaiHaven title the catalog doesn't have

export type Target = { kind: 'anilist'; id: number } | { kind: 'source'; source: SourceName; slug: string };

export function parseSlug(raw: string): Target {
    const s = decodeURIComponent(raw).replace(/^series-/i, '');
    const al = s.match(/-al(\d{1,9})$/);
    if (al) return { kind: 'anilist', id: parseInt(al[1], 10) };
    if (s.startsWith('hm--')) return { kind: 'source', source: 'HentaiMama', slug: s.slice(4) };
    if (s.startsWith('hh--')) return { kind: 'source', source: 'HentaiHaven', slug: s.slice(4) };
    return { kind: 'source', source: 'WatchHentai', slug: s };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY: Record<SourceName, number> = { WatchHentai: 0, HentaiMama: 1, HentaiHaven: 2 };

/** Best source first. A title the site only has an announcement for goes last. */
const byPreference = (a: IndexEntry, b: IndexEntry) =>
    Number(!!a.upcoming) - Number(!!b.upcoming) || PRIORITY[a.source] - PRIORITY[b.source];

const matchesFor = (m: AdultMedia): IndexEntry[] => matchTitle(allTitles(m), yearOf(m)).sort(byPreference);

const annotate = (m: AdultMedia, matches: IndexEntry[] = matchesFor(m)): AnimeBase => ({
    ...toAnimeBase(m),
    watchableOn: matches.map((e) => e.source),
});

function entryToBase(e: IndexEntry): AnimeBase {
    return {
        id: e.id,
        title: e.title,
        image: e.image,
        description: '',
        type: 'OVA',
        status: e.upcoming ? 'Upcoming' : 'Completed',
        episodes: 0,
        genres: [],
        year: e.year,
        rating: e.rating,
        uncensored: e.uncensored,
        isMature: true,
        source: e.source,
        watchableOn: [e.source],
    };
}

/** The same show on several sites is one card: playable on all of them, opening on the preferred one. */
function groupToBase(group: IndexEntry[]): AnimeBase {
    const sorted = [...group].sort(byPreference);
    const base = entryToBase(sorted[0]);
    base.watchableOn = sorted.map((e) => e.source);
    // HentaiMama's posters (~500px) are sharper than WatchHentai's (268px): prefer them.
    // HentaiHaven's listing thumbnails are small too, and some titles have none at all.
    base.image = (sorted.find((e) => e.image && e.source === 'HentaiMama') ?? sorted.find((e) => e.image))?.image ?? base.image;
    base.year = sorted.find((e) => e.year)?.year ?? base.year;
    return base;
}

/**
 * A card built from a site's own listing has that site's thumbnail (WatchHentai's are 268px —
 * soft on any modern screen) and almost no details. When the catalog knows the same show
 * (identical name, compatible year) the card becomes the catalog's: sharp cover, year, score,
 * episode count, and a link to the catalog page that merges every site carrying it.
 * Unmatched cards are left exactly as they were, and the result stays positionally aligned
 * with `items` (same length, same order) so a caller can pair it back up by index.
 */
async function upgradeCards(items: AnimeBase[]): Promise<AnimeBase[]> {
    const todo = items.filter((i) => i.source !== 'AniList');
    if (!todo.length) return items;

    const candidates = await findByTitles(todo.map((i) => i.title)).catch(() => null);
    if (!candidates) return items;

    const swap = new Map<AnimeBase, AnimeBase>();
    todo.forEach((item, idx) => {
        const want = normalizeTitle(item.title);
        const hit = candidates[idx]?.find((m) => {
            const y = yearOf(m);
            return (
                allTitles(m).some((t) => titleSimilarity(want, normalizeTitle(t)) === 1) &&
                (!item.year || !y || Math.abs(item.year - y) <= 1)
            );
        });
        if (hit) swap.set(item, annotate(hit));
    });

    return items.map((i) => swap.get(i) ?? i);
}

/**
 * Two site cards can resolve to one catalog title — keep the first. Separate from upgradeCards
 * because that one stays positionally aligned with what it was given: a caller pairing the result
 * back up with its own rows by index gets the wrong card (or none) if entries disappear.
 */
function dedupeCards(items: AnimeBase[]): AnimeBase[] {
    const seen = new Set<string>();
    return items.filter((i) => !seen.has(i.id) && seen.add(i.id));
}

/**
 * Before answering: the sites' index is usable, and the exclusion list has been applied to it.
 * (Without the list, a site-only title the catalog excludes could still surface.)
 */
let exclusionReady: Promise<void> | null = null;
async function prepare(): Promise<void> {
    await whenUsable();
    exclusionReady ??= getExcludedTitles()
        .then((titles) => setBlocked(titles))
        .catch(() => {
            exclusionReady = null; // try again on the next request
        });
    await exclusionReady;
}

/** A page of results. `source` (a single site's name on the anime side) doesn't apply to a merged catalog. */
export type CatalogPage = Omit<AnimeSearchResult, 'source'>;

const emptyPage = (page: number): CatalogPage => ({ results: [], totalPages: 0, currentPage: page, hasNextPage: false });

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const genreEntry = (name: string) => ({ slug: slugify(name), name });

export async function getGenres(): Promise<{ slug: string; name: string }[]> {
    const { chips } = await getFacets();
    const seen = new Set<string>();
    return chips
        .filter((n) => !isBlockedGenre(n) && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()))
        .sort((a, b) => a.localeCompare(b))
        .map(genreEntry);
}

// ── Default screen ───────────────────────────────────────────────────────────

const HOME_TTL = 5 * 60 * 1000;
const SHELF = 20;
let homeCache: { at: number; value: HentaiHome } | null = null;

const SHELVES_BY_GENRE: { genre: string; title: string; subtitle: string }[] = [
    { genre: 'Female Harem', title: 'Harem', subtitle: 'One lead, many admirers' },
    { genre: 'Romance', title: 'Romance', subtitle: 'Slow burns and love stories' },
    { genre: 'Comedy', title: 'Comedy', subtitle: 'Lighter takes' },
    { genre: 'Fantasy', title: 'Fantasy', subtitle: 'Other worlds' },
];

let homeRefresh: Promise<HentaiHome> | null = null;

/**
 * The default screen. Building it takes a handful of AniList requests, so it's built at boot and
 * refreshed in the background: a visitor always gets the last good copy at once, and only the very
 * first request after a cold start ever waits.
 */
export async function getHome(): Promise<HentaiHome> {
    if (homeCache) {
        if (Date.now() - homeCache.at >= HOME_TTL && !homeRefresh) {
            homeRefresh = buildHome().finally(() => (homeRefresh = null));
            homeRefresh.catch(() => undefined);
        }
        return homeCache.value;
    }
    return (homeRefresh ??= buildHome().finally(() => (homeRefresh = null)));
}

async function buildHome(): Promise<HentaiHome> {
    await prepare();

    const [trending, popular, top, genres, ...byGenre] = await Promise.all([
        browseAdult({ sort: 'trending', perPage: 30 }).catch(() => null),
        browseAdult({ sort: 'popular', perPage: SHELF }).catch(() => null),
        browseAdult({ sort: 'rating', perPage: SHELF }).catch(() => null),
        getGenres().catch(() => []),
        ...SHELVES_BY_GENRE.map((s) => browseAdult({ genre: s.genre, sort: 'popular', perPage: SHELF }).catch(() => null)),
    ]);

    // Featured: what's trending, preferring titles that have a synopsis and can actually be played.
    const candidates = (trending?.items ?? []).map((m) => annotate(m));
    const featured = [
        ...candidates.filter((a) => a.description && a.watchableOn?.length),
        ...candidates.filter((a) => a.description && !a.watchableOn?.length),
    ].slice(0, 6);

    const sections: HentaiSection[] = [];

    const recent = dedupeCards(await upgradeCards(groupEntries(newest(SHELF * 3, { released: true })).slice(0, SHELF).map(groupToBase)));
    if (recent.length) sections.push({ key: 'new', title: 'Just landed', subtitle: 'Newest on the sites — all playable', items: recent });

    const upcoming = dedupeCards(await upgradeCards(groupEntries(newest(3000).filter((e) => e.upcoming)).slice(0, 12).map(groupToBase)));
    if (upcoming.length) sections.push({ key: 'upcoming', title: 'Coming soon', subtitle: 'Announced — only previews so far', items: upcoming });

    const shelf = (key: string, title: string, subtitle: string, page: typeof trending, genre?: string) => {
        const items = (page?.items ?? []).slice(0, SHELF).map((m) => annotate(m));
        if (items.length) sections.push({ key, title, subtitle, genre, items });
    };
    shelf('trending', 'Trending', 'What people are watching now', trending);
    shelf('popular', 'Popular', 'Most-followed of all time', popular);
    shelf('top', 'Top rated', 'Highest scored', top);
    SHELVES_BY_GENRE.forEach((s, i) => shelf(s.genre.toLowerCase(), s.title, s.subtitle, byGenre[i], s.genre));

    const value: HentaiHome = { featured, sections, genres };
    if (sections.length) homeCache = { at: Date.now(), value };
    return value;
}

// ── Browse & search ──────────────────────────────────────────────────────────

const PER_PAGE = 30;

export async function browse(opts: { genre?: string; sort?: AdultSort; page?: number; watchable?: boolean }): Promise<CatalogPage> {
    const page = Math.max(1, opts.page ?? 1);
    if (opts.genre && isBlockedGenre(opts.genre)) return emptyPage(page);
    await prepare();

    // "Watchable only": straight from the sites' own libraries, one card per show.
    if (opts.watchable) {
        const all = groupEntries(newest(100000));
        const start = (page - 1) * PER_PAGE;
        return {
            results: await upgradeCards(all.slice(start, start + PER_PAGE).map(groupToBase)),
            totalPages: Math.ceil(all.length / PER_PAGE),
            currentPage: page,
            hasNextPage: start + PER_PAGE < all.length,
            totalResults: all.length,
        };
    }

    const res = await browseAdult({ genre: opts.genre, sort: opts.sort, page, perPage: PER_PAGE });
    return {
        results: res.items.map((m) => annotate(m)),
        totalPages: res.lastPage,
        currentPage: res.currentPage,
        hasNextPage: res.hasNextPage,
    };
}

/**
 * Search the whole field: the catalog (AniList — synonyms included) plus every title the
 * sites carry that the catalog doesn't know by that name. Results are ranked by how well
 * the *query* fits a title, so what shows first is what was typed, and loose fuzzy matches
 * are left out once real ones exist. A show on both sites is one card.
 */
export async function search(query: string, page = 1): Promise<CatalogPage> {
    const q = query.trim();
    await prepare();

    const catalog = await browseAdult({ search: q, page, perPage: PER_PAGE }).catch(() => null);
    const claimed = new Set<string>();

    const ranked: { item: AnimeBase; rel: number; playable: boolean }[] = [];
    for (const m of catalog?.items ?? []) {
        const matches = matchesFor(m);
        matches.forEach((e) => claimed.add(e.id));
        ranked.push({ item: annotate(m, matches), rel: relevance(q, allTitles(m)), playable: matches.length > 0 });
    }

    // Site titles come with the first page (they're not paged by the catalog's cursor).
    if (page === 1 || !catalog) {
        const groups = groupEntries(searchEntries(q).filter((e) => !claimed.has(e.id)));
        for (const g of groups.slice(0, 150)) {
            ranked.push({ item: groupToBase(g), rel: relevance(q, [g[0].title]), playable: true });
        }
    }

    // Site-only hits: upgrade the best-fitting few to their catalog versions. Kept to one
    // batch of lookups — these are a nicety (a sharper cover, a year), and making a search
    // wait on five more round-trips to AniList costs far more than it returns.
    const head = ranked.filter((r) => r.item.source !== 'AniList').slice(0, 6);
    if (head.length) {
        const upgraded = await upgradeCards(head.map((r) => r.item));
        const claimedIds = new Set(ranked.filter((r) => r.item.source === 'AniList').map((r) => r.item.id));
        head.forEach((r, i) => {
            const next = upgraded[i];
            if (!next || next === r.item) return;
            if (claimedIds.has(next.id)) r.rel = 99; // already listed via the catalog → drop below
            else {
                claimedIds.add(next.id);
                r.item = next;
            }
        });
    }
    const unique = ranked.filter((r) => r.rel !== 99);
    ranked.length = 0;
    ranked.push(...unique);

    // Best fit first; among equals, what can be played. Array.sort is stable, so ties keep source order.
    ranked.sort((a, b) => a.rel - b.rel || Number(b.playable) - Number(a.playable));

    // AniList's fuzzy search returns loosely related titles ("My Sexual Harassment" for "boku no").
    // Keep them only if there is little else.
    const solid = ranked.filter((r) => r.rel < 3);
    const results = (solid.length >= 3 ? solid : ranked).map((r) => r.item);

    if (!catalog) {
        const start = (page - 1) * PER_PAGE;
        return {
            results: results.slice(start, start + PER_PAGE),
            totalPages: Math.ceil(results.length / PER_PAGE),
            currentPage: page,
            hasNextPage: start + PER_PAGE < results.length,
        };
    }

    return {
        results,
        totalPages: catalog.lastPage,
        currentPage: catalog.currentPage,
        hasNextPage: catalog.hasNextPage,
        totalResults: results.length,
    };
}

// ── One title ────────────────────────────────────────────────────────────────

type Detail = Awaited<ReturnType<typeof sourceDetail>>;

async function sourceDetail(e: { source: SourceName; slug: string }) {
    if (e.source === 'WatchHentai') return watchHentaiSource.getSeriesDetail(e.slug);
    if (e.source === 'HentaiHaven') return hentaiHavenSource.getSeriesDetail(e.slug);
    return hentaiMamaSource.getSeriesDetail(e.slug);
}

/** One episode list: the preferred site's episode wins per number; other sites fill gaps and lend stills. */
function mergeEpisodes(details: Detail[]): Episode[] {
    const byNumber = new Map<number, Episode>();
    for (const d of details) {
        for (const ep of d?.episodes ?? []) {
            const have = byNumber.get(ep.number);
            if (!have) byNumber.set(ep.number, { ...ep });
            else if (!have.thumbnail && ep.thumbnail) have.thumbnail = ep.thumbnail;
        }
    }
    return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

/**
 * A title that exists on a site but wasn't reached through the catalog gets the catalog's
 * richer record when it's unmistakably the same show (identical name, compatible year):
 * synopsis, score, tags, banner, studio. One lookup; failure just means a plainer page.
 */
async function enrichFromCatalog(anime: AnimeBase): Promise<AnimeBase> {
    try {
        const { items } = await browseAdult({ search: anime.title, perPage: 8 });
        const want = normalizeTitle(anime.title);
        const hit = items.find((m) => {
            const same = allTitles(m).some((t) => titleSimilarity(want, normalizeTitle(t)) === 1);
            const y = yearOf(m);
            return same && (!anime.year || !y || Math.abs(anime.year - y) <= 1);
        });
        if (!hit) return anime;
        const rich = toAnimeBase(hit);
        return {
            ...anime,
            description: anime.description || rich.description,
            rating: anime.rating ?? rich.rating,
            genres: [...new Set([...anime.genres, ...rich.genres])],
            studios: anime.studios?.length ? anime.studios : rich.studios,
            banner: anime.banner ?? rich.banner,
            titleJapanese: anime.titleJapanese ?? rich.titleJapanese,
            accentColor: anime.accentColor ?? rich.accentColor,
        };
    } catch {
        return anime;
    }
}

/** Details and episodes in one call. Null when the title doesn't exist (or isn't served). */
export async function getTitle(rawSlug: string): Promise<HentaiTitle | null> {
    const target = parseSlug(rawSlug);
    await prepare();

    if (target.kind === 'source') {
        const entry = findEntry(target.source, target.slug);
        // In the index and blocked → findEntry hides it. Not in the index at all → still try the site.
        if (!entry && isKnownBlocked(target)) return null;

        const all = [{ source: target.source, slug: target.slug }, ...(entry ? siblings(entry) : [])];
        const details = await Promise.all(all.map(async (e) => ({ e, d: await sourceDetail(e) })));
        const main = details.find(({ d }) => d)?.d;
        if (!main) return null;

        const live = details.filter(({ d }) => d);
        const anime = await enrichFromCatalog({ ...main.anime, watchableOn: live.map(({ e }) => e.source) });
        return { anime, episodes: mergeEpisodes(live.map(({ d }) => d)) };
    }

    const media = await getAdult(target.id);
    if (!media) return null;

    const matches = matchesFor(media);
    const details = await Promise.all(matches.map(async (e) => ({ e, d: await sourceDetail(e) })));
    const episodes = mergeEpisodes(details.map(({ d }) => d));

    const anime = annotate(media, matches);
    if (!anime.description) anime.description = details.find(({ d }) => d?.anime.description)?.d?.anime.description ?? '';
    if (!anime.episodes) anime.episodes = episodes.length;
    // The site's own release label is the reliable "not out yet".
    if (matches.length && matches.every((e) => e.upcoming)) anime.status = 'Upcoming';

    return { anime, episodes };
}

/** A direct link to a site title that the exclusion list covers (the index hides it from findEntry). */
function isKnownBlocked(t: { source: SourceName; slug: string }): boolean {
    return isBlockedEntry(t.source, t.slug);
}

/** Load the exclusion list at boot, so it applies to the first stream request as well as the first search. */
export const warm = (): void => void prepare().then(() => getHome()).catch(() => undefined);

export const indexInfo = indexStats;

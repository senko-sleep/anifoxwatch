/**
 * The playback index: everything WatchHentai, HentaiMama and HentaiHaven actually carry.
 *
 * Neither site lets you enumerate its library through search (one is paginated
 * but incomplete for broad queries, the other is JavaScript-only), so the index
 * walks each site's full listing in the background, keeps the result on disk so a
 * restart is instant, and serves two jobs:
 *
 *   • matching — "does any site carry *this* title?", used to mark catalog entries
 *     watchable and to find their episodes;
 *   • searching — titles that exist on a site but not in the catalog.
 *
 * Matching is deliberately strict. A wrong match plays the wrong show, which is worse
 * than "not available": sequels, seasons and numbered entries must agree exactly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { watchHentaiSource } from '../sources/watchhentai-source.js';
import { hentaiMamaSource } from '../sources/hentaimama-source.js';
import { hentaiHavenSource } from '../sources/hentaihaven-source.js';
import { logger } from '../utils/logger.js';
import type { AnimeSearchResult } from '../types/anime.js';

export type SourceName = 'WatchHentai' | 'HentaiMama' | 'HentaiHaven';

export interface IndexEntry {
    source: SourceName;
    /** The source's own id, e.g. `watchhentai-series/foo`, `hentaimama-tvshows/foo` or `hentaihaven-watch/foo`. */
    id: string;
    slug: string;
    title: string;
    norm: string;
    image: string;
    year?: number;
    upcoming?: boolean;
    uncensored?: boolean;
    rating?: number;
    /** Same title as one the catalog excludes (see setBlocked). Never listed, matched or served. */
    blocked?: boolean;
}

const CACHE_FILE = path.resolve(process.cwd(), '.cache', 'hentai-index.json');
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REFRESH_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 4;

// ── Title normalisation & matching ───────────────────────────────────────────

/** Filler that differs between sites but never identifies a different show. */
const FILLER = /\b(watch hentai|the animation|the motion anime|the original animation|uncensored|hd)\b/g;

export function normalizeTitle(title: string): string {
    return title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[×✕⨯]/g, ' x ')
        .replace(/&/g, ' and ')
        .replace(FILLER, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const ROMAN = new Set(['ii', 'iii', 'iv', 'v', 'vi']);
/** Words that mark a different entry of a franchise — they must agree between two titles. */
const ENTRY_WORDS = new Set(['season', 'part', 'ova', 'ona', 'special', 'specials', 'movie', 'final', 'kanketsuhen', 'zenpen', 'kouhen']);

const split = (norm: string) => norm.split(' ').filter(Boolean);
const isNumberish = (t: string) => /^\d+$/.test(t) || ROMAN.has(t) || ENTRY_WORDS.has(t);

/** 0..1. Exact normalised equality is 1; otherwise word overlap, but only when entry markers agree. */
export function titleSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;

    const ta = split(a);
    const tb = split(b);
    const markersA = ta.filter(isNumberish).sort().join(' ');
    const markersB = tb.filter(isNumberish).sort().join(' ');
    if (markersA !== markersB) return 0; // "Foo" ≠ "Foo 2" ≠ "Foo Part 2"

    const wa = ta.filter((t) => !isNumberish(t));
    const wb = tb.filter((t) => !isNumberish(t));
    if (!wa.length || !wb.length) return 0;

    const setB = new Set(wb);
    const overlap = wa.filter((t) => setB.has(t)).length;
    return (2 * overlap) / (wa.length + wb.length);
}

const MATCH_THRESHOLD = 0.88;

// ── State ────────────────────────────────────────────────────────────────────

const entries = new Map<string, IndexEntry>();
let updatedAt = 0;
let crawling: Promise<void> | null = null;
let started = false;

const keyOf = (e: Pick<IndexEntry, 'source' | 'slug'>) => `${e.source}:${e.slug}`;

function ingest(source: SourceName, res: AnimeSearchResult): void {
    for (const a of res.results ?? []) {
        const slug = a.id.split('/').slice(1).join('/');
        if (!slug || !a.title) continue;
        const entry: IndexEntry = {
            source,
            id: a.id,
            slug,
            title: a.title,
            norm: normalizeTitle(a.title),
            image: a.image,
            year: a.year,
            upcoming: a.status === 'Upcoming' || undefined,
            uncensored: a.uncensored,
            rating: a.rating,
        };
        if (isBlockedNorm(entry.norm)) entry.blocked = true;
        entries.set(keyOf(entry), entry);
    }
}

/** Walk a site's listing: page 1 tells us how many there are, the rest run a few at a time. */
async function crawlSource(source: SourceName, list: (page: number) => Promise<AnimeSearchResult>): Promise<number> {
    const first = await list(1);
    ingest(source, first);
    const total = Math.min(Math.max(first.totalPages || 1, 1), 300);

    let next = 2;
    const worker = async () => {
        while (next <= total) {
            const page = next++;
            let res = await list(page);
            if (!res.results?.length) res = await list(page); // one retry: sites throttle
            ingest(source, res);
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return total;
}

function persist(): void {
    try {
        fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ updatedAt, entries: [...entries.values()] }));
    } catch (e) {
        logger.warn(`[hentai-index] could not persist: ${(e as Error).message}`);
    }
}

function loadFromDisk(): boolean {
    try {
        const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as { updatedAt: number; entries: IndexEntry[] };
        if (!raw.entries?.length) return false;
        raw.entries.forEach((e) => entries.set(keyOf(e), e));
        setBlocked([]); // recomputed as soon as the catalog's exclusion list arrives
        updatedAt = raw.updatedAt;
        return true;
    } catch {
        return false;
    }
}

export function refresh(): Promise<void> {
    if (crawling) return crawling;
    crawling = (async () => {
        const t0 = Date.now();
        try {
            const [wh, hm, hh] = await Promise.all([
                crawlSource('WatchHentai', (p) => watchHentaiSource.listSeries(p)).catch((e) => {
                    logger.warn(`[hentai-index] WatchHentai crawl failed: ${(e as Error).message}`);
                    return 0;
                }),
                crawlSource('HentaiMama', (p) => hentaiMamaSource.listSeries(p)).catch((e) => {
                    logger.warn(`[hentai-index] HentaiMama crawl failed: ${(e as Error).message}`);
                    return 0;
                }),
                crawlSource('HentaiHaven', (p) => hentaiHavenSource.listSeries(p)).catch((e) => {
                    logger.warn(`[hentai-index] HentaiHaven crawl failed: ${(e as Error).message}`);
                    return 0;
                }),
            ]);
            if (entries.size) {
                updatedAt = Date.now();
                persist();
            }
            logger.info(`[hentai-index] crawled ${wh}+${hm}+${hh} pages → ${entries.size} titles in ${Math.round((Date.now() - t0) / 1000)}s`);
        } finally {
            crawling = null;
        }
    })();
    return crawling;
}

/** Load the saved index and keep it fresh. Safe to call from anywhere, any number of times. */
export function start(): void {
    if (started) return;
    started = true;
    const fresh = loadFromDisk() && Date.now() - updatedAt < MAX_AGE_MS;
    if (!fresh) void refresh();
    setInterval(() => void refresh(), REFRESH_MS).unref();
}

export function stats() {
    const bySource: Record<string, number> = {};
    entries.forEach((e) => (bySource[e.source] = (bySource[e.source] ?? 0) + 1));
    const blocked = [...entries.values()].filter((e) => e.blocked).map((e) => `${e.source}:${e.slug}`);
    return { total: entries.size, bySource, updatedAt, crawling: Boolean(crawling), blockedCount: blocked.length, blocked };
}

/** Wait for a first usable index on a cold start (bounded — never blocks a request for long). */
export async function whenUsable(maxMs = 20000): Promise<void> {
    start();
    const deadline = Date.now() + maxMs;
    while (entries.size < 50 && crawling && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 400));
    }
}

// ── Exclusions ───────────────────────────────────────────────────────────────

let blockedNorms: string[] = [];

/** Near-exact only: blocking must never sweep up an unrelated title with a similar name. */
const isBlockedNorm = (norm: string): boolean => blockedNorms.some((b) => titleSimilarity(b, norm) >= 0.95);

/**
 * Titles the catalog excludes (with their synonyms). The catalog filters its own listing,
 * but a site can carry the same title under the same name — so the sites' entries are
 * checked against the same list, and blocked ones drop out of every query below.
 */
export function setBlocked(titles: string[]): void {
    blockedNorms = [...new Set(titles.map(normalizeTitle).filter((n) => n.length >= 3))];
    for (const e of entries.values()) e.blocked = isBlockedNorm(e.norm) || undefined;
}

export const isBlockedEntry = (source: SourceName, slug: string): boolean => Boolean(entries.get(`${source}:${slug}`)?.blocked);

/**
 * An episode id (`hentaimama-episodes/tiny-evil-episode-1`, `hentaihaven-episodes/x-episode-1`, `watchhentai-videos/x-episode-2-id-01`)
 * names its show only by slug, so check the show's name against the exclusion list.
 */
export function isBlockedEpisodeId(episodeId: string): boolean {
    if (!blockedNorms.length || !/^(watchhentai|hentaimama|hentaihaven)-/i.test(episodeId)) return false;
    const slug = episodeId.replace(/^[a-z]+-(?:videos|episodes|series|tvshows)\//i, '').replace(/-episode-\d+.*$/i, '').replace(/-id-\d+$/i, '');
    const norm = normalizeTitle(slug.replace(/-/g, ' '));
    return norm.length >= 3 && isBlockedNorm(norm);
}

// ── Same show, several sites ─────────────────────────────────────────────────

const yearsCompatible = (a?: number, b?: number) => !a || !b || Math.abs(a - b) <= 1;

/** Entries that are the same title on different sites (equal names, compatible years). */
export function groupEntries(list: IndexEntry[]): IndexEntry[][] {
    const groups: IndexEntry[][] = [];
    const byNorm = new Map<string, IndexEntry[][]>();
    for (const e of list) {
        const candidates = byNorm.get(e.norm) ?? [];
        const home = candidates.find((g) => g.every((x) => x.source !== e.source) && yearsCompatible(g[0].year, e.year));
        if (home) home.push(e);
        else {
            const g = [e];
            candidates.push(g);
            byNorm.set(e.norm, candidates);
            groups.push(g);
        }
    }
    return groups;
}

/** The other sites' copies of this entry. */
export function siblings(entry: IndexEntry): IndexEntry[] {
    const out: IndexEntry[] = [];
    for (const e of entries.values()) {
        if (e.source !== entry.source && !e.blocked && e.norm === entry.norm && yearsCompatible(e.year, entry.year)) out.push(e);
    }
    return out;
}

/** How well a query fits a title (any of its names): 0 exact, 1 starts with, 2 every word present, 3 loose. */
export function relevance(query: string, titles: string[]): 0 | 1 | 2 | 3 {
    const words = split(normalizeTitle(query));
    if (!words.length) return 3;
    const q = words.join(' ');
    let best: 0 | 1 | 2 | 3 = 3;
    for (const t of titles) {
        const n = normalizeTitle(t);
        if (n === q) return 0;
        if (n.startsWith(q)) best = Math.min(best, 1) as 0 | 1 | 2 | 3;
        else {
            const tokens = split(n);
            if (words.every((w) => tokens.some((tk) => tk.startsWith(w)))) best = Math.min(best, 2) as 0 | 1 | 2 | 3;
        }
    }
    return best;
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Every site entry that is this title, best per site. `titles` are all the names the
 * catalog knows (romaji, English, synonyms); `year` guards against same-name remakes.
 */
export function matchTitle(titles: string[], year?: number | null): IndexEntry[] {
    const wanted = [...new Set(titles.map(normalizeTitle).filter(Boolean))];
    if (!wanted.length) return [];

    const best = new Map<SourceName, { entry: IndexEntry; score: number }>();
    for (const entry of entries.values()) {
        if (entry.blocked) continue;
        let score = 0;
        for (const w of wanted) score = Math.max(score, titleSimilarity(w, entry.norm));
        if (score < MATCH_THRESHOLD) continue;

        // Same name, different production year → a remake or a different show.
        if (year && entry.year && Math.abs(year - entry.year) > 1 && score < 1) continue;
        if (year && entry.year && Math.abs(year - entry.year) > 2) continue;

        const cur = best.get(entry.source);
        if (!cur || score > cur.score) best.set(entry.source, { entry, score });
    }
    return [...best.values()].map((b) => b.entry);
}

/** Title search across everything the sites carry: every query word must appear (prefix ok). */
export function searchEntries(query: string): IndexEntry[] {
    const words = split(normalizeTitle(query));
    if (!words.length) return [];
    const q = words.join(' ');

    const hits: { e: IndexEntry; rank: number }[] = [];
    for (const e of entries.values()) {
        if (e.blocked) continue;
        const tokens = split(e.norm);
        const ok = words.every((w) => tokens.some((t) => t.startsWith(w)));
        if (!ok) continue;
        // exact title first, then titles that start with the query, then the rest by brevity
        const rank = e.norm === q ? 0 : e.norm.startsWith(q) ? 1 : 2 + tokens.length / 100;
        hits.push({ e, rank });
    }
    return hits.sort((a, b) => a.rank - b.rank || (b.e.year ?? 0) - (a.e.year ?? 0)).map((h) => h.e);
}

/** Newest first — what "just landed" looks like across both sites. */
export function newest(limit: number, opts: { released?: boolean } = {}): IndexEntry[] {
    return [...entries.values()]
        .filter((e) => !e.blocked && (opts.released ? !e.upcoming : true))
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
        .slice(0, limit);
}

export const findEntry = (source: SourceName, slug: string): IndexEntry | undefined => {
    const e = entries.get(`${source}:${slug}`);
    return e && !e.blocked ? e : undefined;
};

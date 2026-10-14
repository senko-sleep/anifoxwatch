import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import { BaseAnimeSource, type SourceRequestOptions } from './base-source.js';
import type { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import type { EpisodeServer, StreamingData, VideoSource, VideoSubtitle } from '../types/streaming.js';
import { preflightHls } from '../services/hls-preflight.js';
import { hedged } from '../lib/hedged.js';
import { isPublicHttpUrl } from '../lib/public-url.js';

type CacheEntry<T> = { value: T; expires: number };
type MiruroServer = { name: string; category: 'sub' | 'dub'; url: string };
type MegaVideoPayload = {
    status?: string;
    source?: string;
    type?: string;
    tracks?: Array<{ file?: string; label?: string; kind?: string }>;
};

/**
 * Miruro publishes episode links and server choices in server-rendered HTML.
 * Its ANI buttons lead to MegaVid's JSON source endpoint, which supplies a
 * direct HLS manifest. This source never starts a browser or returns the
 * intermediary HTML player as proof of a working stream.
 */
export class MiruroSource extends BaseAnimeSource {
    name = 'Miruro';
    baseUrl = 'https://miruro.ro';
    // MegaVid builds Loli's source on the first request for an episode (seen at 4-8s) and caches
    // it after; a 9s attempt cut that off and failed cold episodes that played fine a moment later.
    readonly streamBudgetMs = 15_000;
    private readonly client: AxiosInstance;
    private readonly cache = new Map<string, CacheEntry<unknown>>();
    private readonly cacheLimit = 80;

    constructor() {
        super();
        this.client = axios.create({
            timeout: 5_000,
            httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 6, timeout: 8_000 }),
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
                Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
            },
        });
    }

    private cached<T>(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        if (entry.expires <= Date.now()) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.value as T;
    }

    private remember<T>(key: string, value: T, ttlMs: number): T {
        // Map insertion order is sufficient here: entries are small, and the cap
        // prevents title searches/episode pages from growing without bound.
        this.cache.delete(key);
        this.cache.set(key, { value, expires: Date.now() + ttlMs });
        while (this.cache.size > this.cacheLimit) this.cache.delete(this.cache.keys().next().value!);
        return value;
    }

    private async html(url: string, options?: SourceRequestOptions): Promise<string> {
        const parsed = new URL(url, this.baseUrl);
        if (parsed.origin !== this.baseUrl) throw new Error('Invalid Miruro URL');
        const response = await this.client.get<string>(parsed.href, {
            signal: options?.signal,
            timeout: Math.max(1, Math.min(options?.timeout || 5_000, 5_000)),
            responseType: 'text',
            headers: { Referer: `${this.baseUrl}/` },
        });
        if (typeof response.data !== 'string' || !response.data.includes('<html')) throw new Error('Invalid Miruro HTML');
        return response.data;
    }

    private slug(id: string): string {
        const slug = id.replace(/^miruro-/i, '').replace(/^\/+|\/+$/g, '');
        if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) throw new Error('Invalid Miruro ID');
        return slug;
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try { return (await this.html(this.baseUrl, options)).includes('miruro'); }
        catch { return false; }
    }

    async search(query: string, page = 1, _filters?: unknown, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const empty = (): AnimeSearchResult => ({ results: [], totalPages: 1, currentPage: page, hasNextPage: false, source: this.name });
        if (page !== 1 || !query.trim()) return empty();
        const cacheKey = `search:${query.toLowerCase().trim()}`;
        if (!options?.bypassCache) {
            const cached = this.cached<AnimeSearchResult>(cacheKey);
            if (cached) return cached;
        }
        // WordPress matches literal punctuation: "Re:ZERO -Starting" yields no
        // results, while "Re:ZERO Starting" does. Try a broad two-word query
        // only when the cleaned full title has no results.
        const cleaned = query.replace(/(^|\s)-(?=\p{L})/gu, '$1').replace(/-(?=\s|$)/g, ' ')
            .replace(/\s+/g, ' ').trim();
        const words = cleaned.split(' ');
        const queries = [cleaned, words.slice(0, 2).join(' ')].filter((q, i, a) => q && a.indexOf(q) === i);
        try {
            for (const candidate of queries) {
                const $ = cheerio.load(await this.html(`/?s=${encodeURIComponent(candidate)}`, options));
                const results: AnimeBase[] = [];
                $('article.bs a[href*="/series/"]').each((_, element) => {
                    const link = $(element);
                    const href = link.attr('href');
                    if (!href) return;
                    let slug: string;
                    try {
                        const url = new URL(href, this.baseUrl);
                        if (url.origin !== this.baseUrl) return;
                        slug = this.slug(url.pathname.replace(/^\/series\//, ''));
                    } catch { return; }
                    const title = link.attr('title')?.trim();
                    if (!title || results.some(item => item.id === `miruro-${slug}`)) return;
                    results.push({
                        id: `miruro-${slug}`, title,
                        image: link.find('img').attr('src') || '',
                        type: 'TV', status: /completed/i.test(link.text()) ? 'Completed' : 'Ongoing',
                        episodes: 0, genres: [], source: this.name,
                    });
                });
                if (results.length) {
                    const answer: AnimeSearchResult = { results, totalPages: 1, currentPage: 1,
                        hasNextPage: false, totalResults: results.length, source: this.name };
                    this.handleSuccess();
                    return this.remember(cacheKey, answer, 5 * 60_000);
                }
            }
            return this.remember(cacheKey, empty(), 60_000);
        } catch (error) {
            this.handleError(error, 'search');
            return empty();
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        try {
            const slug = this.slug(id);
            const $ = cheerio.load(await this.html(`/series/${slug}/`, options));
            const title = $('h1').first().text().trim();
            if (!title) return null;
            const episodes = await this.getEpisodes(id, options);
            return { id: `miruro-${slug}`, title, image: $('meta[property="og:image"]').attr('content') || '',
                type: 'TV', status: 'Ongoing', episodes: episodes.length, genres: [], source: this.name };
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        try {
            const slug = this.slug(animeId);
            const cacheKey = `episodes:${slug}`;
            if (!options?.bypassCache) {
                const cached = this.cached<Episode[]>(cacheKey);
                if (cached) return cached;
            }
            const $ = cheerio.load(await this.html(`/series/${slug}/`, options));
            const episodes: Episode[] = [];
            $('.epl-num').each((_, element) => {
                const link = $(element).closest('a');
                const number = Number($(element).text().trim());
                if (!Number.isInteger(number) || number < 1) return;
                const href = link.attr('href');
                if (!href) return;
                try {
                    const url = new URL(href, this.baseUrl);
                    if (url.origin !== this.baseUrl) return;
                    const episodeSlug = this.slug(url.pathname);
                    episodes.push({ id: `miruro-${episodeSlug}`, number,
                        title: link.find('.epl-title').text().trim() || `Episode ${number}`,
                        hasSub: true, hasDub: true });
                } catch { /* Ignore malformed links. */ }
            });
            episodes.sort((a, b) => a.number - b.number);
            if (episodes.length) this.handleSuccess();
            return this.remember(cacheKey, episodes, 5 * 60_000);
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getTrending(): Promise<AnimeBase[]> { return []; }
    async getLatest(): Promise<AnimeBase[]> { return []; }
    async getTopRated(): Promise<TopAnime[]> { return []; }

    private async servers(episodeId: string, options?: SourceRequestOptions): Promise<MiruroServer[]> {
        const slug = this.slug(episodeId);
        const $ = cheerio.load(await this.html(`/${slug}/`, options));
        const servers: MiruroServer[] = [];
        $('.server-group').each((_, group) => {
            const label = $(group).find('label').first().text().toLowerCase();
            const category = label.includes('dub') ? 'dub' : label.includes('sub') ? 'sub' : null;
            if (!category) return;
            $(group).find('button.server-button').each((_, button) => {
                const name = $(button).text().trim();
                const encoded = $(button).attr('onclick')?.match(/value:\s*'([A-Za-z0-9+/=]+)'/)?.[1];
                if (!encoded) return;
                try {
                    const iframe = cheerio.load(Buffer.from(encoded, 'base64').toString('utf8'));
                    const url = iframe('iframe').attr('src');
                    if (!url || !/^https:\/\/(?:megavid\.buzz|miruro\.ro)\//i.test(url)) return;
                    servers.push({ name, category, url });
                } catch { /* Ignore malformed server markup. */ }
            });
        });
        return servers;
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        try {
            const servers = /^miruro-mal-/i.test(episodeId)
                ? [...await this.megavidServers(episodeId, 'sub'), ...await this.megavidServers(episodeId, 'dub')]
                : (await this.servers(episodeId, options)).filter(server => new URL(server.url).hostname === 'megavid.buzz');
            return servers.map(server => ({
                name: `${server.name} (${server.category.toUpperCase()})`, url: server.url, type: server.category,
            }));
        } catch { return []; }
    }

    /** MegaVid keys episodes by MAL id; with one known, none of Miruro's HTML pages are needed. */
    idForMal(malId: number, episodeNum: number): string {
        return `miruro-mal-${malId}-${episodeNum}`;
    }

    private async megavidServers(episodeId: string, category: 'sub' | 'dub', options?: SourceRequestOptions): Promise<MiruroServer[]> {
        const mal = episodeId.match(/^miruro-mal-(\d+)-(\d+)$/i);
        // The same two MegaVid routes Miruro's episode page embeds; both front the same backends.
        if (mal) return ['mal', 'aniwave/mal'].map((route, index) => ({
            name: `MegaVid ${index + 1}`, category, url: `https://megavid.buzz/${route}/${mal[1]}/${mal[2]}/${category}`,
        }));
        return (await this.servers(episodeId, options))
            .filter(item => item.category === category && new URL(item.url).hostname === 'megavid.buzz')
            .slice(0, 2);
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const empty = (): StreamingData => ({ sources: [], subtitles: [], source: this.name, category });
        const cacheKey = `stream:${episodeId}:${category}:${server || ''}`;
        if (!options?.bypassCache) {
            const cached = this.cached<StreamingData>(cacheKey);
            if (cached) return cached;
        }
        const signal = AbortSignal.any([
            ...(options?.signal ? [options.signal] : []),
            AbortSignal.timeout(Math.max(1, Math.min(options?.timeout || this.streamBudgetMs, this.streamBudgetMs))),
        ]);
        options = { ...options, signal };
        try {
            const available = await this.megavidServers(episodeId, category, options);
            const selectedName = server?.toLowerCase().replace(/\s*\(.*/, '');
            const candidates = selectedName && available.some(item => item.name.toLowerCase() === selectedName)
                ? available.filter(item => item.name.toLowerCase() === selectedName) : available;
            if (!candidates.length) return empty();
            const ordered = [...candidates].sort((a, b) => Number(b.name.toUpperCase() === 'ANI 2') - Number(a.name.toUpperCase() === 'ANI 2'));
            // One small JSON request per (server, backend), shared by verification and the subtitle lookup.
            const payloads = new Map<string, Promise<MegaVideoPayload>>();
            const payload = (candidate: MiruroServer, backend: Backend): Promise<MegaVideoPayload> => {
                const key = `${candidate.url}|${backend}`;
                let pending = payloads.get(key);
                if (!pending) {
                    // Loli's answer may finish after another backend wins: MegaVid caches it, so the next
                    // resolution (refresh-ahead, a reload, the next viewer) gets Loli at once.
                    pending = this.client.get<MegaVideoPayload>(`${candidate.url.replace(/\/$/, '')}/source?axsv=${backend}`, {
                        signal: backend === 'loli' ? AbortSignal.timeout(10_000) : signal,
                        timeout: backend === 'loli' ? 10_000 : 3_500, headers: { Referer: candidate.url, Accept: 'application/json' },
                    }).then(response => response.data);
                    pending.catch(() => { /* observed by whichever caller awaits it */ });
                    payloads.set(key, pending);
                }
                return pending;
            };
            const verify = async (candidate: MiruroServer, backend: Backend, taskSignal: AbortSignal) => {
                const data = await payload(candidate, backend);
                if (data.status !== 'ok' || !data.source) throw new Error('MegaVid returned no source');
                const media = new URL(data.source);
                // CDN hosts rotate (echovideo.to → dpopdrop89.store); the preflight is what proves media.
                if (!isPublicHttpUrl(media, true)) throw new Error('Invalid MegaVid media URL');
                await preflightHls(media.href, MEGAVID_HEADERS, AbortSignal.any([taskSignal, AbortSignal.timeout(4000)]));
                return { candidate, backend, media, data };
            };
            // Soft subtitle tracks live on Yuki/Sora even when Loli carries the video; ask early, it is tiny.
            if (category === 'sub') payload(ordered[0], 'yuki');
            // Loli's independent CDN passed later-fragment probes while Yuki returned 403 after a
            // playable start, so it goes first; the others are hedges, not a sequential timeout chain.
            const tasks = ordered.flatMap((candidate, index) => BACKENDS.map(backend => async (taskSignal: AbortSignal) => {
                if (index > 0) {
                    // Both routes front the same backends. Any HTTP answer on the first route
                    // (including 429/502) speaks for this backend; asking again only feeds a rate
                    // limit. Only an unreachable first route is worth a second one.
                    const first = await payload(ordered[0], backend).then(() => null, (error: { response?: unknown }) => error);
                    if (!first || first.response) throw new Error(`MegaVid ${backend} already answered on the primary route`);
                }
                try {
                    const result = await verify(candidate, backend, taskSignal);
                    console.log(JSON.stringify({ type: 'miruro_backend', backend, status: 'validated', episodeId, host: result.media.hostname }));
                    return result;
                } catch (error) {
                    if (!taskSignal.aborted || signal.aborted) console.warn(JSON.stringify({ type: 'miruro_backend', backend, status: 'rejected', episodeId,
                        reason: (error as Error).message }));
                    throw error;
                }
            }));
            const winner = await hedged(tasks, 2_500, signal).catch(() => undefined);
            if (!winner) return empty();
            let subtitles = tracksOf(winner.data);
            if (!subtitles.length && category === 'sub' && !signal.aborted) {
                // Optional tracks must not discard verified video or extend the budget much.
                let timer: ReturnType<typeof setTimeout> | undefined;
                const extra = await Promise.race([
                    payload(ordered[0], 'yuki').catch(() => null),
                    new Promise<null>(resolve => { timer = setTimeout(resolve, 800, null); }),
                ]);
                clearTimeout(timer);
                subtitles = tracksOf(extra);
            }
            const source: VideoSource = { url: winner.media.href, originalUrl: winner.media.href, headers: { ...MEGAVID_HEADERS },
                quality: 'auto', isM3U8: winner.data.type === 'hls' || /\.m3u8(?:\?|$)/i.test(winner.media.href),
                category, server: `Miruro ${winner.candidate.name} ${winner.backend}`, verifiedAt: Date.now() };
            const data: StreamingData = { sources: [source], subtitles, source: this.name, category };
            this.handleSuccess();
            // Source URLs can be signed; keep this much shorter than episode metadata.
            return this.remember(cacheKey, data, 90_000);
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return empty();
        }
    }
}

type Backend = 'loli' | 'sora' | 'yuki';
const BACKENDS: readonly Backend[] = ['loli', 'sora', 'yuki'];
const MEGAVID_HEADERS = { Referer: 'https://megavid.buzz/', Origin: 'https://megavid.buzz' };

function tracksOf(data?: MegaVideoPayload | null): VideoSubtitle[] {
    return (data?.tracks || []).filter(track => track.file && track.kind === 'captions').flatMap(track => {
        try {
            const url = new URL(track.file!);
            return url.protocol === 'https:' ? [{ url: url.href, lang: track.label || 'Unknown', label: track.label }] : [];
        } catch { return []; }
    });
}

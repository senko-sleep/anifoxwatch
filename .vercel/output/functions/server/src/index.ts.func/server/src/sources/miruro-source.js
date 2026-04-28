/**
 * MiruroSource — scrapes miruro.in for episode metadata, then resolves streams
 * via the official `aniwatch` scraper (aniwatchtv / hianime embeds) and @consumet/extensions Hianime as fallback.
 * (Consumet v1.8+ removed ANIME.Zoro — use Hianime + aniwatch package instead.)
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { HiAnime } from 'aniwatch';
import { BaseAnimeSource } from './base-source.js';
import { logger } from '../utils/logger.js';
import { streamExtractor } from '../services/stream-extractor.js';
let CONSUMET_MOD = null;
async function getConsumetMod() {
    if (!CONSUMET_MOD)
        CONSUMET_MOD = await import('@consumet/extensions');
    return CONSUMET_MOD;
}
let aniwatchScraper = null;
function getAniwatchScraper() {
    if (!aniwatchScraper)
        aniwatchScraper = new HiAnime.Scraper();
    return aniwatchScraper;
}
export class MiruroSource extends BaseAnimeSource {
    name = 'Miruro';
    baseUrl = 'https://www.miruro.in';
    consumetProvider = null;
    /**
     * Timestamp until which we skip the aniwatch scraper and puppeteer because
     * aniwatchtv.to is returning a Cloudflare challenge page (non-HTML) for all
     * server-side requests. Set when we see "cheerio.load() expects a string".
     */
    aniwatchSiteBlockedUntil = 0;
    SITE_BLOCK_TTL_MS = 5 * 60 * 1000;
    async getConsumetProvider() {
        if (!this.consumetProvider) {
            const mod = await getConsumetMod();
            this.consumetProvider = new mod.ANIME.Hianime();
            this.consumetProvider.baseUrl = 'https://aniwatchtv.to';
        }
        return this.consumetProvider;
    }
    stripPrefix(id) {
        return id.replace(/^miruro-/i, '').replace(/^kaido-/i, '');
    }
    /** `aniwatch` package expects `slug?ep=EPISODE_KEY` (same as the watch URL). */
    toAniwatchEpisodeQuery(id) {
        let s = this.stripPrefix(id);
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
    /** Consumet Hianime expects `slug$episode$KEY` with literal `$episode$`. */
    toConsumetEpId(id) {
        let s = this.stripPrefix(id);
        const tokenForm = /^(.+)\$ep=\d+\$token=(.+)$/i.exec(s);
        if (tokenForm)
            return `${tokenForm[1]}$episode$${tokenForm[2]}`;
        const dollarEp = /^(.+)\$ep=(\d+)$/i.exec(s);
        if (dollarEp)
            return `${dollarEp[1]}$episode$${dollarEp[2]}`;
        return s.replace('?ep=', '$episode$');
    }
    /**
     * For `slug$ep=N$token=KEY` embeds, sites sometimes resolve streams with either the token or the display ep#.
     * Try both so at least one matches the upstream episode table.
     */
    episodeIdVariantsForStreaming(id) {
        const raw = this.stripPrefix(id);
        const tok = /^(.+)\$ep=(\d+)\$token=(.+)$/i.exec(raw);
        if (tok) {
            const slug = tok[1];
            const epNum = tok[2];
            const tokenKey = tok[3];
            const aw = [`${slug}?ep=${tokenKey}`, `${slug}?ep=${epNum}`];
            const cc = [`${slug}$episode$${tokenKey}`, `${slug}$episode$${epNum}`];
            return {
                aniwatch: [...new Set(aw)],
                consumet: [...new Set(cc)],
            };
        }
        return {
            aniwatch: [this.toAniwatchEpisodeQuery(id)],
            consumet: [this.toConsumetEpId(id)],
        };
    }
    /** `HiAnime.Scraper().getEpisodeSources` expects `slug?ep=INTERNAL_ID` (watch page shape). Skip malformed IDs. */
    isValidAniwatchEpQuery(q) {
        const idx = q.indexOf('?ep=');
        if (idx < 1)
            return false;
        const slug = q.slice(0, idx).trim();
        const epVal = q.slice(idx + 4).trim();
        return slug.length >= 3 && epVal.length >= 1 && !slug.includes('/');
    }
    /**
     * Watch URLs use `?ep=<internal id>`. Users often pass `?ep=1` for episode 1.
     * Only values in 1…MAX are treated as display episode numbers; HiAnime internal keys are usually
     * much larger (e.g. 94388) and must not trigger a full episode-list fetch before every stream.
     */
    static DISPLAY_EPISODE_RESOLVE_MAX = 3000;
    static PUPPETEER_ENABLED = process.env.ENABLE_MIRO_PUPPETEER === '1';
    async resolveDisplayEpisodeIfNeeded(id) {
        if (!MiruroSource.PUPPETEER_ENABLED)
            return id;
        if (Date.now() < this.aniwatchSiteBlockedUntil)
            return id;
        const aw = this.toAniwatchEpisodeQuery(id);
        const m = /^([^?]+)\?ep=(\d+)$/.exec(aw);
        if (!m)
            return id;
        const slug = m[1];
        const epNum = parseInt(m[2], 10);
        const max = MiruroSource.DISPLAY_EPISODE_RESOLVE_MAX;
        if (!Number.isFinite(epNum) || epNum < 1 || epNum > max)
            return id;
        try {
            const scraper = getAniwatchScraper();
            const list = await Promise.race([
                scraper.getEpisodes(slug),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12_000)),
            ]);
            const hit = list.episodes?.find((e) => e.number === epNum);
            if (!hit?.episodeId?.includes('?ep='))
                return id;
            const internal = hit.episodeId;
            logger.info(`[Miruro] resolved display episode ${epNum} → ${internal.split('?ep=')[1]} (HiAnime internal ?ep=)`, undefined, this.name);
            if (/^miruro-/i.test(id))
                return `miruro-${internal}`;
            if (/^kaido-/i.test(id))
                return `kaido-${internal}`;
            return internal;
        }
        catch {
            return id;
        }
    }
    normalizeAniwatchServer(server) {
        const s = (server || 'hd-1').toLowerCase();
        if (s.includes('hd-2') || s.includes('vidcloud'))
            return 'hd-2';
        if (s.includes('mega'))
            return 'megacloud';
        if (s.includes('sb'))
            return 'streamsb';
        if (s.includes('tape'))
            return 'streamtape';
        return 'hd-1';
    }
    async healthCheck(options) {
        try {
            const res = await axios.get(this.baseUrl, {
                timeout: options?.timeout || 6000,
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0' },
            });
            this.isAvailable = res.status === 200;
            return this.isAvailable;
        }
        catch {
            this.isAvailable = true;
            return true;
        }
    }
    mapAnime(data) {
        return {
            id: `miruro-${data.id || ''}`,
            title: data.title || data.name || '',
            image: data.image || data.poster || '',
            cover: data.cover || data.image || '',
            description: data.description || '',
            type: (data.type || 'TV'),
            status: (data.status || 'Ongoing'),
            rating: data.rating || 0,
            episodes: data.totalEpisodes || data.episodes || 0,
            episodesAired: data.totalEpisodes || 0,
            genres: data.genres || [],
            studios: [],
            year: data.releaseDate ? parseInt(data.releaseDate, 10) : 0,
            subCount: data.sub || data.totalEpisodes || 0,
            dubCount: data.dub || 0,
            source: this.name,
            isMature: false,
        };
    }
    async search(query, page = 1, _filters, options) {
        try {
            const p = await this.getConsumetProvider();
            const res = await Promise.race([
                p.search(query, page),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
            ]);
            const results = (res.results || []).map((r) => this.mapAnime(r));
            this.handleSuccess();
            return {
                results,
                totalPages: res.totalPages || (res.hasNextPage ? page + 1 : page),
                currentPage: page,
                hasNextPage: !!res.hasNextPage,
                source: this.name,
            };
        }
        catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }
    async getAnime(id, options) {
        const slug = this.stripPrefix(id);
        try {
            const res = await axios.get(`${this.baseUrl}/details/${slug}`, {
                timeout: options?.timeout || 12000,
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0', Referer: `${this.baseUrl}/` },
            });
            const $ = cheerio.load(res.data);
            const title = $('h2').first().text().trim() ||
                $('meta[property="og:title"]').attr('content')?.replace(/\| Miruro$/, '').trim() ||
                slug;
            const image = $('meta[property="og:image"]').attr('content') || '';
            const description = $('meta[property="og:description"]').attr('content') || '';
            const genres = [];
            $('a[href*="/genre/"]').each((_i, el) => {
                const g = $(el).text().trim();
                if (g)
                    genres.push(g);
            });
            this.handleSuccess();
            return {
                id,
                title,
                image,
                cover: image,
                description,
                type: 'TV',
                status: 'Ongoing',
                rating: 0,
                episodes: 0,
                episodesAired: 0,
                genres,
                studios: [],
                year: 0,
                subCount: 0,
                dubCount: 0,
                source: this.name,
                isMature: false,
            };
        }
        catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }
    async getEpisodes(animeId, options) {
        const slug = this.stripPrefix(animeId);
        try {
            const episodes = await this.scrapeEpisodesFromMiruro(slug, options);
            if (episodes.length > 0) {
                this.handleSuccess();
                return episodes;
            }
        }
        catch (e) {
            logger.warn(`[Miruro] HTML scrape failed: ${e.message?.substring(0, 80)}`, undefined, this.name);
        }
        try {
            const p = await this.getConsumetProvider();
            const info = await Promise.race([
                p.fetchAnimeInfo(slug),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
            ]);
            const episodes = (info.episodes || []).map((ep, i) => ({
                id: ep.id ? String(ep.id).replace('$episode$', '?ep=') : `${slug}?ep=${i + 1}`,
                number: ep.number || i + 1,
                title: ep.title || `Episode ${ep.number || i + 1}`,
                isFiller: !!ep.isFiller,
                hasSub: ep.isSubbed !== false,
                hasDub: !!ep.isDubbed,
                thumbnail: ep.image || '',
            }));
            this.handleSuccess();
            return episodes;
        }
        catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }
    async scrapeEpisodesFromMiruro(slug, options) {
        const res = await axios.get(`${this.baseUrl}/watch/${slug}`, {
            signal: options?.signal,
            timeout: options?.timeout || 12000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Referer: `${this.baseUrl}/`,
            },
            maxRedirects: 5,
        });
        const $ = cheerio.load(res.data);
        const episodes = [];
        $(`a[href*="/watch/${slug}/ep-"]`).each((_i, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().trim();
            const epMatch = href.match(/\/ep-(\d+)$/);
            if (!epMatch)
                return;
            const numMatch = text.match(/^(\d+)/);
            const epNum = numMatch ? parseInt(numMatch[1], 10) : _i + 1;
            episodes.push({
                id: `${slug}?ep=${epMatch[1]}`,
                number: epNum,
                title: text.replace(/^\d+\s*/, '').trim() || `Episode ${epNum}`,
                isFiller: false,
                hasSub: true,
                hasDub: true,
                thumbnail: '',
            });
        });
        return episodes;
    }
    async getEpisodeServers(_episodeId, _options) {
        return [
            { name: 'HD-1', url: 'hd-1', type: 'sub' },
            { name: 'HD-2', url: 'hd-2', type: 'sub' },
            { name: 'HD-1', url: 'hd-1', type: 'dub' },
            { name: 'HD-2', url: 'hd-2', type: 'dub' },
        ];
    }
    async getStreamingLinks(episodeId, server, category = 'sub', options) {
        const resolvedEpisodeId = await this.resolveDisplayEpisodeIfNeeded(episodeId);
        let data = await this.runMiruroStack(resolvedEpisodeId, server, category, options);
        if (data.sources.length > 0)
            return data;
        if (category === 'dub') {
            logger.info(`[Miruro] no dub sources, trying sub for same episode`, undefined, this.name);
            data = await this.runMiruroStack(resolvedEpisodeId, server, 'sub', options);
        }
        return data;
    }
    async runMiruroStack(resolvedEpisodeId, server, category, options) {
        const fromAniwatch = await this.tryAniwatchPackage(resolvedEpisodeId, server, category, options);
        if (fromAniwatch.sources.length > 0)
            return fromAniwatch;
        const fromConsumet = await this.tryConsumetHianime(resolvedEpisodeId, server, category, options);
        if (fromConsumet.sources.length > 0)
            return fromConsumet;
        return this.tryPuppeteerAniwatchTv(resolvedEpisodeId, category, options);
    }
    /**
     * When `aniwatch` npm + in-process Consumet fail (TLS / decoder / API quirks), load the real
     * watch page on aniwatchtv.to and capture HLS the same way Kaido does for 9animetv.
     */
    async tryPuppeteerAniwatchTv(episodeId, category, options) {
        // Puppeteer extraction can run long and — worse — keep running after upstream timeouts,
        // delaying Express responses. Only use it when we still have budget on the caller signal.
        if (options?.signal?.aborted)
            return { sources: [], subtitles: [] };
        // Default OFF: headless extraction is CPU-heavy and is not safely cancellable from Node.
        // It can block the event loop long enough that clients see "no bytes" timeouts even when
        // the rest of the stack has already given up. Enable explicitly when you want this path.
        if (process.env.ENABLE_MIRO_PUPPETEER !== '1') {
            logger.warn(`[Miruro/puppeteer] disabled (set ENABLE_MIRO_PUPPETEER=1 to enable)`, undefined, this.name);
            return { sources: [], subtitles: [] };
        }
        if (Date.now() < this.aniwatchSiteBlockedUntil) {
            logger.warn(`[Miruro/puppeteer] skipping — aniwatchtv.to Cloudflare-blocked`, undefined, this.name);
            return { sources: [], subtitles: [] };
        }
        const raw = this.stripPrefix(episodeId);
        const m = /^([^?]+)\?ep=(.+)$/.exec(raw);
        if (!m)
            return { sources: [], subtitles: [] };
        const slug = m[1];
        const epKey = m[2].trim();
        if (!slug || !epKey)
            return { sources: [], subtitles: [] };
        try {
            logger.info(`[Miruro/puppeteer] ${category} aniwatchtv.to/${slug}?ep=${epKey}`, undefined, this.name);
            const result = await streamExtractor.extractFrom9Anime(slug, epKey, 'https://aniwatchtv.to');
            if (!result.success || result.streams.length === 0) {
                return { sources: [], subtitles: [] };
            }
            this.handleSuccess();
            return {
                sources: result.streams.map((s) => ({
                    url: s.url,
                    quality: s.quality || 'auto',
                    isM3U8: s.type === 'hls',
                })),
                subtitles: result.subtitles.map((t) => ({
                    url: t.url,
                    lang: t.lang,
                    label: t.lang,
                })),
                headers: { Referer: 'https://aniwatchtv.to/' },
                source: this.name,
            };
        }
        catch (e) {
            logger.warn(`[Miruro/puppeteer] ${e.message?.slice(0, 120)}`, undefined, this.name);
            return { sources: [], subtitles: [] };
        }
    }
    async fetchWithPuppeteer(slug, category, options) {
        if (!MiruroSource.PUPPETEER_ENABLED) {
            logger.warn(`[Miruro/puppeteer] disabled (set ENABLE_MIRO_PUPPETEER=1 to enable)`, undefined, this.name);
            return { sources: [], subtitles: [] };
        }
        try {
            logger.info(`[Miruro/puppeteer] attempting to fetch with Puppeteer`, undefined, this.name);
            // Import puppeteer dynamically
            const puppeteer = await import('puppeteer');
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            // Set user agent to avoid detection
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
            const url = `${this.baseUrl}/watch/${slug}`;
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            // Wait for video player to load
            await page.waitForSelector('video, iframe', { timeout: 10000 }).catch(() => { });
            // Extract video sources from page
            const sources = await page.evaluate(() => {
                const results = [];
                // Check for video tags
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    const src = video.getAttribute('src');
                    if (src)
                        results.push({ url: src, quality: 'auto' });
                });
                // Check for iframes
                const iframes = document.querySelectorAll('iframe');
                iframes.forEach(iframe => {
                    const src = iframe.getAttribute('src');
                    if (src && src.includes('http'))
                        results.push({ url: src, quality: 'embed' });
                });
                return results;
            });
            await browser.close();
            if (sources.length > 0) {
                logger.info(`[Miruro/puppeteer] Found ${sources.length} sources`, undefined, this.name);
                return {
                    sources: sources.map(s => ({
                        url: s.url,
                        quality: s.quality,
                        isM3U8: s.url.includes('.m3u8')
                    })),
                    subtitles: []
                };
            }
            logger.warn(`[Miruro/puppeteer] No sources found`, undefined, this.name);
            return { sources: [], subtitles: [] };
        }
        catch (error) {
            logger.error(`[Miruro/puppeteer] Error: ${error.message}`, error, undefined, this.name);
            return { sources: [], subtitles: [] };
        }
    }
    /** Primary: `aniwatch` npm (maintained for aniwatchtv.to / hianime-style IDs). */
    async tryAniwatchPackage(episodeId, server, category, options) {
        if (Date.now() < this.aniwatchSiteBlockedUntil) {
            logger.warn(`[Miruro/aniwatch] skipping — site blocked until cache expires`, undefined, this.name);
            return { sources: [], subtitles: [] };
        }
        const { aniwatch: epQueries } = this.episodeIdVariantsForStreaming(episodeId);
        const cat = category === 'dub' ? 'dub' : 'sub';
        const prefer = this.normalizeAniwatchServer(server);
        /** Prefer requested embed, then same rotation as REST discovery when one id is missing for dub/sub. */
        const defaultRotation = ['hd-1', 'hd-2', 'megacloud', 'streamsb', 'streamtape'];
        const serversToTry = server
            ? [prefer, ...defaultRotation.filter((s) => s !== prefer)]
            : [...defaultRotation];
        for (const epQuery of epQueries) {
            if (!this.isValidAniwatchEpQuery(epQuery)) {
                logger.warn(`[Miruro/aniwatch] skip invalid episode query shape`, { epQuery }, this.name);
                continue;
            }
            for (const srv of serversToTry) {
                try {
                    logger.info(`[Miruro/aniwatch] ${category} ${epQuery} → ${srv}`, undefined, this.name);
                    const scraper = getAniwatchScraper();
                    const data = await Promise.race([
                        scraper.getEpisodeSources(epQuery, srv, cat),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 14_000)),
                    ]);
                    if (data.sources?.length) {
                        const sd = this.mapAniwatchToStreaming(data);
                        logger.info(`[Miruro/aniwatch] ✅ ${sd.sources.length} ${category} sources (${srv})`, undefined, this.name);
                        this.handleSuccess();
                        return sd;
                    }
                }
                catch (err) {
                    const msg = err.message || '';
                    // "cheerio.load() expects a string" means aniwatchtv.to returned a non-HTML
                    // Cloudflare challenge page. Puppeteer (headless Chrome) is also blocked, so
                    // skip both for the next 5 minutes.
                    if (msg.includes('cheerio.load() expects a string')) {
                        this.aniwatchSiteBlockedUntil = Date.now() + this.SITE_BLOCK_TTL_MS;
                        logger.warn(`[Miruro/aniwatch] Cloudflare block detected — suppressing puppeteer for ${this.SITE_BLOCK_TTL_MS / 60000} min`, undefined, this.name);
                        return { sources: [], subtitles: [] };
                    }
                    logger.warn(`[Miruro/aniwatch] ${srv} fail: ${msg.substring(0, 100)}`, undefined, this.name);
                }
            }
        }
        return { sources: [], subtitles: [] };
    }
    mapAniwatchToStreaming(data) {
        const sources = data.sources || [];
        const subtitles = data.subtitles || [];
        return {
            sources: sources.map((s) => ({
                url: s.url,
                quality: s.quality || 'auto',
                isM3U8: !!(s.isM3U8 || s.url?.includes?.('.m3u8')),
            })),
            subtitles: subtitles.map((t) => ({
                url: t.url,
                lang: t.lang || 'Unknown',
                label: t.lang || 'Unknown',
            })),
            headers: data.headers || { Referer: 'https://aniwatchtv.to/' },
            intro: data.intro,
            source: this.name,
        };
    }
    /** Fallback: @consumet/extensions Hianime (same site family; useful if aniwatch pkg hits extractor edge cases). */
    async tryConsumetHianime(episodeId, server, category = 'sub', _options) {
        try {
            const mod = await getConsumetMod();
            const subOrDub = category === 'dub' ? mod.SubOrSub.DUB : mod.SubOrSub.SUB;
            const { consumet: consumetIds } = this.episodeIdVariantsForStreaming(episodeId);
            const serversToTry = server
                ? [this.mapStreamServerToConsumet(server, mod)]
                : [mod.StreamingServers.MegaCloud, mod.StreamingServers.VidCloud, mod.StreamingServers.VidStreaming];
            for (const consumetId of consumetIds) {
                for (const srv of serversToTry) {
                    if (srv === undefined)
                        continue;
                    try {
                        logger.info(`[Miruro/consumet] ${category} ${consumetId} → ${srv}`, undefined, this.name);
                        const p = await this.getConsumetProvider();
                        const data = await Promise.race([
                            p.fetchEpisodeSources(consumetId, srv, subOrDub),
                            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 11_000)),
                        ]);
                        if (data.sources?.length > 0) {
                            const sd = this.mapStreamingData(data);
                            logger.info(`[Miruro/consumet] ✅ ${sd.sources.length} ${category} sources via ${srv}`, undefined, this.name);
                            this.handleSuccess();
                            return sd;
                        }
                    }
                    catch (err) {
                        logger.warn(`[Miruro/consumet] ${srv} fail: ${err.message?.substring(0, 80)}`, undefined, this.name);
                    }
                }
            }
        }
        catch (err) {
            logger.warn(`[Miruro/consumet] init fail: ${err.message?.substring(0, 60)}`, undefined, this.name);
        }
        return { sources: [], subtitles: [] };
    }
    mapStreamServerToConsumet(server, mod) {
        const s = server.toLowerCase();
        if (s.includes('vid') && s.includes('stream'))
            return mod.StreamingServers.VidStreaming;
        if (s.includes('vid') || s.includes('hd-2'))
            return mod.StreamingServers.VidCloud;
        if (s.includes('mega'))
            return mod.StreamingServers.MegaCloud;
        return mod.StreamingServers.VidCloud;
    }
    mapStreamingData(data) {
        const sources = data.sources || [];
        const subtitles = data.subtitles || [];
        return {
            sources: sources.map((s) => ({
                url: s.url,
                quality: s.quality || 'auto',
                isM3U8: !!(s.isM3U8 || s.url?.includes('.m3u8')),
            })),
            subtitles: subtitles
                .filter((t) => t.lang !== 'Thumbnails' && t.lang !== 'thumbnails')
                .map((sub) => ({
                url: sub.url,
                lang: sub.lang || 'Unknown',
                label: sub.label || sub.lang || 'Unknown',
            })),
            headers: data.headers || { Referer: 'https://megacloud.blog/' },
            intro: data.intro,
            outro: data.outro,
            source: this.name,
        };
    }
    async getTrending(page = 1, options) {
        try {
            const p = await this.getConsumetProvider();
            const res = await Promise.race([
                p.fetchMostPopular(page),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
            ]);
            this.handleSuccess();
            return (res.results || []).map((r) => this.mapAnime(r));
        }
        catch (error) {
            this.handleError(error, 'getTrending');
            return [];
        }
    }
    async getLatest(page = 1, options) {
        try {
            const p = await this.getConsumetProvider();
            const res = await Promise.race([
                p.fetchRecentlyUpdated(page),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
            ]);
            this.handleSuccess();
            return (res.results || []).map((r) => this.mapAnime(r));
        }
        catch (error) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }
    async getTopRated(page = 1, limit = 10, options) {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, i) => ({
            rank: (page - 1) * limit + i + 1,
            anime,
        }));
    }
}
//# sourceMappingURL=miruro-source.js.map
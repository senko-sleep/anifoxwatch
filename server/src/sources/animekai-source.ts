/**
 * AnimeKai Source - Uses @consumet/extensions AnimeKai provider
 * Reliable backup streaming provider
 */

import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { ANIME as ConsumetAnime } from '@consumet/extensions';
import { logger } from '../utils/logger.js';

// Custom axios instance with headers to bypass Cloudflare
const customAxios = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
    },
    timeout: 15000,
});

function axiosConfigFullUrl(cfg: AxiosError['config']): string {
    if (!cfg) return '';
    const u = cfg.url || '';
    if (u.startsWith('http')) return u;
    const base = (cfg.baseURL || '').replace(/\/$/, '');
    const path = u.startsWith('/') ? u : `/${u}`;
    return `${base}${path}`;
}

/** Consumet AnimeKai → MegaUp posts to enc-dec.app/api/dec-mega; often 400 "please do not deploy at scale" or "queue full". */
function isConsumetEmbedDecoderRejected(err: unknown): boolean {
    const bodyContainsDeploy = (raw: unknown): boolean => {
        const bodyStr =
            typeof raw === 'string'
                ? raw
                : raw && typeof raw === 'object'
                  ? JSON.stringify(raw) +
                    ('error' in (raw as object) ? String((raw as { error?: string }).error || '') : '')
                  : '';
        return /please do not deploy at scale|queue full|decrypt failure/i.test(bodyStr);
    };

    const inspect = (e: unknown): boolean => {
        if (axios.isAxiosError(e)) {
            const status = e.response?.status;
            const fullUrl = axiosConfigFullUrl(e.config);
            const raw = e.response?.data;
            if (bodyContainsDeploy(raw)) return true;
            if (status === 400 && /enc-dec\.app|\/dec-mega\b/i.test(fullUrl)) return true;
            if (status === 400 && /\/dec-mega\b/i.test(String(e.config?.url || ''))) return true;
        }
        // Some builds lose `axios.isAxiosError` identity — duck-type 400 + dec endpoint
        if (e && typeof e === 'object' && 'response' in e && 'config' in e) {
            const ex = e as { response?: { status?: number; data?: unknown }; config?: AxiosError['config'] };
            if (ex.response?.status === 400) {
                const fullUrl = axiosConfigFullUrl(ex.config);
                if (/enc-dec\.app|\/dec-mega\b/i.test(fullUrl)) return true;
                if (bodyContainsDeploy(ex.response.data)) return true;
            }
        }
        const msg = e instanceof Error ? e.message : String(e);
        if (/please do not deploy at scale|queue full|decrypt failure/i.test(msg)) return true;
        return false;
    };
    if (inspect(err)) return true;
    const cause = err && typeof err === 'object' && 'cause' in err ? (err as { cause?: unknown }).cause : undefined;
    if (cause !== undefined) return isConsumetEmbedDecoderRejected(cause);
    return false;
}

let ANIME: any = null;
async function getConsumet() {
    if (!ANIME) {
        const mod = await import('@consumet/extensions');
        ANIME = mod.ANIME;
    }
    return ANIME;
}

export class AnimeKaiSource extends BaseAnimeSource {
    name = 'AnimeKai';
    baseUrl = 'https://animekai.to';
    private provider: any = null;
    private cache = new Map<string, { data: any; expires: number }>();

    private async getProvider() {
        if (!this.provider) {
            const anime = await getConsumet();
            this.provider = new ConsumetAnime.AnimeKai();
        }
        return this.provider;
    }

    private getCached<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) return entry.data as T;
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, data: any, ttl: number): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

     async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
         try {
             const p = await this.getProvider();
             const res = await Promise.race([
                 p.search('naruto'),
                 new Promise<any>((_, r) => setTimeout(() => r(new Error('timeout')), 15000)) // Increased from 8000 to 15000
             ]);
             this.isAvailable = (res.results?.length || 0) > 0;
             return this.isAvailable;
         } catch {
             this.isAvailable = true;
             return true;
         }
     }

    private cleanDescription(raw?: string): string {
        if (!raw) return 'No description available.';
        let desc = raw.replace(/<[^>]*>/g, '');
        // Strip metadata that leaks into AnimeKai descriptions
        desc = desc.replace(/Country:\s*.*/i, '').trim();
        desc = desc.replace(/Genres?:\s*.*/i, '').trim();
        desc = desc.replace(/Premiered:\s*.*/i, '').trim();
        desc = desc.replace(/Date aired:\s*.*/i, '').trim();
        desc = desc.replace(/Broadcast:\s*.*/i, '').trim();
        desc = desc.replace(/Episodes:\s*\d+.*/i, '').trim();
        desc = desc.replace(/Duration:\s*.*/i, '').trim();
        desc = desc.replace(/\s{2,}/g, ' ').trim();
        return desc || 'No description available.';
    }

    private mapAnime(data: any): AnimeBase {
        return {
            id: data.id,
            title: data.title || 'Unknown',
            titleJapanese: data.japaneseTitle,
            image: data.image || '',
            cover: data.cover || data.image,
            description: this.cleanDescription(data.description),
            type: this.mapType(data.type),
            status: this.mapStatus(data.status),
            rating: data.rating ? parseFloat(data.rating) / 10 : undefined,
            episodes: data.totalEpisodes || 0,
            episodesAired: data.totalEpisodes || 0,
            genres: data.genres || [],
            studios: [],
            year: data.releaseDate ? parseInt(data.releaseDate) : undefined,
            subCount: data.totalEpisodes || 0,
            dubCount: data.hasDub ? data.totalEpisodes : 0,
            isMature: false,
            source: this.name
        };
    }

    private mapType(type?: string): 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special' {
        const t = (type || '').toUpperCase();
        if (t.includes('MOVIE')) return 'Movie';
        if (t.includes('OVA')) return 'OVA';
        if (t.includes('ONA')) return 'ONA';
        if (t.includes('SPECIAL')) return 'Special';
        return 'TV';
    }

    private mapStatus(status?: string): 'Ongoing' | 'Completed' | 'Upcoming' {
        const s = (status || '').toLowerCase();
        if (s.includes('ongoing') || s.includes('airing')) return 'Ongoing';
        if (s.includes('upcoming') || s.includes('not yet')) return 'Upcoming';
        return 'Completed';
    }

    async search(query: string, page: number = 1, _filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `kai:search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const p = await this.getProvider();
            const res = await Promise.race([
                p.search(query, page),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 12000))
            ]);

            const result: AnimeSearchResult = {
                results: (res.results || []).map((a: any) => this.mapAnime(a)),
                totalPages: res.totalPages || 1,
                currentPage: res.currentPage || page,
                hasNextPage: res.hasNextPage || false,
                source: this.name
            };

            this.setCache(cacheKey, result, 3 * 60 * 1000);
            return result;
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        try {
            const rawId = id.replace('animekai-', '');
            const p = await this.getProvider();
            const info = await Promise.race([
                p.fetchAnimeInfo(rawId),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 12000))
            ]);
            return this.mapAnime(info);
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cacheKey = `kai:eps:${animeId}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached) return cached;

        try {
            const rawId = animeId.replace('animekai-', '');
            const p = await this.getProvider();
            const info = await Promise.race([
                p.fetchAnimeInfo(rawId),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 12000))
            ]);

            const episodes: Episode[] = (info.episodes || []).map((ep: any) => ({
                id: ep.id,
                number: ep.number || 1,
                title: ep.title || `Episode ${ep.number || 1}`,
                isFiller: false,
                hasSub: true,
                hasDub: info.hasDub || false,
                thumbnail: ep.image
            }));

            this.setCache(cacheKey, episodes, 10 * 60 * 1000);
            return episodes;
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const servers: EpisodeServer[] = [
            { name: 'default', url: '', type: 'sub' },
        ];
        // Only advertise dub servers if the anime actually has dub content
        try {
            const rawId = episodeId.replace(/^animekai-/i, '').split('?')[0].split('$')[0];
            const p = await this.getProvider();
            const info = await Promise.race([
                p.fetchAnimeInfo(rawId),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 8000))
            ]);
            if (info?.hasDub) {
                servers.push({ name: 'default', url: '', type: 'dub' });
            }
        } catch {
            // On error, optimistically include dub — the stream fetch will verify
            servers.push({ name: 'default', url: '', type: 'dub' });
        }
        return servers;
    }

    /**
     * Extract streams directly from AnimeKai, bypassing the broken Consumet extraction path.
     *
     * Consumet AnimeKai v1.8.8 is broken because:
     *  1. anikai.to now wraps embeds in /iframe/TOKEN (HTML page) instead of serving megaup URLs
     *     directly — Consumet tries to call /media/ on the wrapper and gets HTML back.
     *  2. The User-Agent sent to /media/ must exactly match the one sent to enc-dec.app/dec-mega;
     *     Consumet uses mismatched values.
     *
     * Correct chain:
     *  fetchEpisodeServers → https://anikai.to/iframe/TOKEN (HTML)
     *    → parse <iframe src="https://megaup.nl/e/ID">
     *    → GET megaup.nl/media/ID  (X-Requested-With: XMLHttpRequest, same UA)
     *    → POST enc-dec.app/api/dec-mega { text, agent: sameUA }
     *    → sources[].file
     */
    private async extractMegaupStream(
        serverUrl: string,
        timeoutMs: number
    ): Promise<VideoSource[]> {
        const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

        // Step 1: fetch anikai.to/iframe/TOKEN  →  parse <iframe src>
        const iframeResp = await axios.get(serverUrl, {
            headers: { 'User-Agent': UA },
            timeout: Math.min(timeoutMs, 10_000),
        });
        const $ = cheerio.load(iframeResp.data as string);
        const megaupEmbedUrl = $('iframe').attr('src') || '';
        const isMegaupEmbed = /megaup\.(nl|cc|live|to)\//i.test(megaupEmbedUrl);

        // If no iframe src, return empty
        if (!megaupEmbedUrl) {
            logger.warn(`AnimeKai: no iframe src found`, undefined, this.name);
            return [];
        }
        
        // If not megaup CDN (e.g. Streamtape, Doodstream, etc.), extract as embed instead
        if (!isMegaupEmbed) {
            logger.info(`AnimeKai: extracting non-megaup embed: ${megaupEmbedUrl.slice(0, 60)}...`, undefined, this.name);
            return this.extractEmbedStream(megaupEmbedUrl);
        }

        // Step 2: GET megaup /media/ endpoint (returns JSON { status, result: encryptedText })
        // Vercel/cloud datacenter IPs are blocked by megaup.nl with 403. When direct fetch fails,
        // fall back to the Cloudflare Worker proxy which has a residential-adjacent IP.
        const REMOTE_PROXY = process.env.DEFAULT_REMOTE_STREAM_PROXY ||
            'https://anifoxwatch.vercel.app/api/stream/proxy';
        const MEGAUP_MIRRORS = ['megaup.nl', 'megaup.cc', 'megaup.live', 'megaup.to'];
        const embedBase = new URL(megaupEmbedUrl).hostname;
        const mirrorOrder = [
            embedBase,
            ...MEGAUP_MIRRORS.filter(m => m !== embedBase),
        ];

        let encText: string | undefined;

        const fetchMedia = async (mediaUrl: string, referer: string): Promise<string | undefined> => {
            try {
                const r = await axios.get(mediaUrl, {
                    headers: { 'User-Agent': UA, 'Referer': referer, 'X-Requested-With': 'XMLHttpRequest' },
                    timeout: Math.min(timeoutMs, 10_000),
                });
                return r.data?.result;
            } catch {
                return undefined;
            }
        };

        for (const mirror of mirrorOrder) {
            const mirrorEmbedUrl = megaupEmbedUrl.replace(embedBase, mirror);
            const mirrorMediaUrl = mirrorEmbedUrl.replace('/e/', '/media/');

            // Try direct first
            encText = await fetchMedia(mirrorMediaUrl, mirrorEmbedUrl);
            if (encText) break;

            // 403 from datacenter IP — retry via CF Worker proxy
            try {
                const proxied = `${REMOTE_PROXY}?url=${encodeURIComponent(mirrorMediaUrl)}&referer=${encodeURIComponent(mirrorEmbedUrl)}`;
                const rp = await axios.get(proxied, { timeout: Math.min(timeoutMs, 12_000) });
                if (rp.data?.result) { encText = rp.data.result; break; }
            } catch (e: unknown) {
                const code = axios.isAxiosError(e) ? e.response?.status : 0;
                logger.warn(`AnimeKai: ${mirror}/media/ proxy failed (${code})`, undefined, this.name);
            }
        }

        if (!encText) {
            // All megaup mirrors + proxy failed (datacenter IP block).
            // Return empty sources so other sources can be tried instead of blocked iframe.
            logger.warn(`AnimeKai: no encrypted result — returning empty sources for ${serverUrl}`, undefined, this.name);
            return [];
        }

        // Step 3: decrypt via enc-dec.app — User-Agent MUST match the one used for /media/
        const decResp = await axios.post(
            'https://enc-dec.app/api/dec-mega',
            { text: encText, agent: UA },
            { headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, timeout: 12_000 }
        );
        const decrypted = decResp.data?.result;
        if (!decrypted?.sources?.length) return [];

        return (decrypted.sources as Array<{ file?: string; type?: string }>).map((s): VideoSource => {
            let url = s.file ?? '';
            // Fix dead Megaup CDN domains returned by the API
            url = url.replace(/(web|lab|code|net|pro|tech|hub|shop|burnt|zone|cdn|site|app|data|media|rrr|xm8|rrr\d+)\d*(code|core|wave|lab|zone|hub|link|pro|burst|data|link|media|host|cdn|file|store|link)\.(site|store|click|buzz|online|top|xyz|shop|cc|nl|live)/gi, 'megaup.cc');
            
            return {
                url,
                quality: 'auto',
                isM3U8: url.includes('.m3u8') || s.type === 'hls',
                isDASH: url.includes('.mpd'),
                server: 'Megaup',
            };
        }).filter(s => s.url);
    }

    /**
     * Extract embed streams from non-megaup CDNs (Streamtape, Doodstream, etc.)
     * These return as embed URLs that need to be handled by the player's embed support
     */
    private extractEmbedStream(embedUrl: string): VideoSource[] {
        // Determine server name from URL
        const urlLower = embedUrl.toLowerCase();
        let serverName = 'Embed';
        if (urlLower.includes('streamtape')) serverName = 'Streamtape';
        else if (urlLower.includes('dood')) serverName = 'Doodstream';
        else if (urlLower.includes('vidcloud')) serverName = 'VidCloud';
        else if (urlLower.includes('rapid-cloud')) serverName = 'RapidCloud';
        else if (urlLower.includes('megacloud')) serverName = 'MegaCloud';
        
        // Check if this is likely an IP-locked source
        const isIpLocked = urlLower.includes('streamtape') || 
                          (urlLower.includes('get_video') && urlLower.includes('streamtape'));
        
        return [{
            url: embedUrl,
            quality: 'auto',
            isM3U8: false,
            isEmbed: true,
            server: serverName,
            ipLocked: isIpLocked,
        }];
    }

    /**
     * Scrape server URLs directly from animekai.to website when consumet fails
     */
    private async scrapeServersFromWebsite(
        episodeId: string,
        category: 'sub' | 'dub',
        timeoutMs: number
    ): Promise<Array<{ name: string; url: string }>> {
        const servers: Array<{ name: string; url: string }> = [];
        const watchUrl = `https://animekai.to/watch/${episodeId}`;
        
        try {
            const resp = await axios.get(watchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': 'https://animekai.to/',
                },
                timeout: Math.min(timeoutMs, 10_000),
            });
            
            const $ = cheerio.load(resp.data as string);
            
            // Look for server buttons/links with data-server or onclick attributes
            // Filter by category: check data-dub and data-sub attributes
            $('[data-server], .server-item, .server').each((i, el) => {
                const serverUrl = $(el).attr('data-server') || $(el).attr('data-link') || '';
                const serverName = $(el).text().trim() || $(el).attr('title') || `Server ${i + 1}`;
                
                // Check if this server is for dub or sub
                const isDubServer = $(el).attr('data-dub') === 'true' || 
                                   $(el).hasClass('dub') || 
                                   $(el).closest('[class*="dub"]').length > 0;
                const isSubServer = $(el).attr('data-sub') === 'true' || 
                                   $(el).hasClass('sub') || 
                                   $(el).closest('[class*="sub"]').length > 0;
                
                // Skip if server type doesn't match requested category
                if (category === 'dub' && !isDubServer) return;
                if (category === 'sub' && isDubServer) return; // Skip dub servers when requesting sub
                
                if (serverUrl && serverUrl.includes('/iframe/')) {
                    servers.push({ name: serverName + (isDubServer ? ' (Dub)' : ''), url: serverUrl.startsWith('http') ? serverUrl : `https://animekai.to${serverUrl}` });
                }
            });
            
            // Also look for iframe elements
            $('iframe').each((i, el) => {
                const src = $(el).attr('src') || '';
                if (src && (src.includes('/iframe/') || src.includes('megaup') || src.includes('streamtape'))) {
                    const fullUrl = src.startsWith('http') ? src : `https://animekai.to${src}`;
                    // Avoid duplicates
                    if (!servers.some(s => s.url === fullUrl)) {
                        servers.push({ name: `Server ${servers.length + 1}`, url: fullUrl });
                    }
                }
            });
            
            // Look for links with /iframe/ in href (fallback - these might not have category indicators)
            // Only use these if we haven't found any category-specific servers yet
            if (servers.length === 0) {
                $('a[href*="/iframe/"]').each((i, el) => {
                    const href = $(el).attr('href') || '';
                    const linkText = $(el).text().trim() || '';
                    // Try to detect dub from link text (e.g., "Megaup DUB" or "Server 1 (Dub)")
                    const isDubLink = linkText.toLowerCase().includes('dub') || 
                                     linkText.toLowerCase().includes('(dub)');
                    const isSubLink = linkText.toLowerCase().includes('sub') || 
                                       linkText.toLowerCase().includes('(sub)');
                    
                    // Skip if category doesn't match
                    if (category === 'dub' && !isDubLink && isSubLink) return;
                    if (category === 'sub' && isDubLink) return;
                    
                    if (href) {
                        const fullUrl = href.startsWith('http') ? href : `https://animekai.to${href}`;
                        if (!servers.some(s => s.url === fullUrl)) {
                            servers.push({ name: linkText || `Server ${servers.length + 1}`, url: fullUrl });
                        }
                    }
                });
            }
            
            logger.info(`AnimeKai: scraped ${servers.length} ${category} servers from website`, undefined, this.name);
            for (const sv of servers) {
                logger.info(`  - ${sv.name}: ${sv.url.substring(0, 80)}...`, undefined, this.name);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`AnimeKai: failed to scrape servers from website — ${msg}`, undefined, this.name);
        }
        
        return servers;
    }

    async getStreamingLinks(episodeId: string, _server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `kai:stream:${episodeId}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached && cached.sources.length > 0) return cached;

        let rawEpisodeId = episodeId.replace(/^animekai-/i, '');
        const originalRawEpisodeId = rawEpisodeId;
        const isConsumetEpisodeId = /\$ep=\d+/i.test(originalRawEpisodeId);
        const isWatchEpisodeId = /\?ep=/i.test(originalRawEpisodeId);

        // Native AnimeKai/Consumet episode IDs already include the episode number
        // and token (`slug$ep=N$token=...`). Send those straight to the server
        // lookup; stripping them back to the slug forced a slow dub info lookup.
        if (isWatchEpisodeId && !isConsumetEpisodeId) {
            rawEpisodeId = originalRawEpisodeId.split('?ep=')[0];
        }

        try {
            const p = await this.getProvider();
            const mod = await import('@consumet/extensions');
            const subOrDub = category === 'dub' ? mod.SubOrSub.DUB : mod.SubOrSub.SUB;

            // Resolve bare anime slug → correct episode ID using episodeNum when available.
            // If the request is for DUB but we have a Consumet episode ID (which contains a token),
            // the token might be specifically for the SUB stream. We MUST re-resolve the episode
            // to get the correct DUB token, otherwise it will just serve the SUB stream.
            if ((!isConsumetEpisodeId && !isWatchEpisodeId) || (category === 'dub' && isConsumetEpisodeId)) {
                // If it's a consumet ID, extract the base slug
                const searchSlug = isConsumetEpisodeId ? rawEpisodeId.split('$ep=')[0] : rawEpisodeId;
                try {
                    const infoTimeoutMs = options?.timeout ?? 25_000;
                    const info = await Promise.race([
                        p.fetchAnimeInfo(searchSlug, subOrDub),
                        new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), infoTimeoutMs))
                    ]);
                    if (info?.episodes?.length > 0) {
                        const epNum = options?.episodeNum;
                        let targetEp = info.episodes[0];
                        if (epNum != null && epNum >= 1) {
                            // Try to find the episode by number in the list (episodes may be 0-indexed or 1-indexed)
                            const byNumber = info.episodes.find((e: { number?: number; id: string }) => e.number === epNum);
                            if (byNumber) {
                                targetEp = byNumber;
                            } else if (epNum <= info.episodes.length) {
                                targetEp = info.episodes[epNum - 1];
                            }
                        }
                        rawEpisodeId = targetEp.id;
                        logger.info(`AnimeKai: resolved bare slug "${episodeId}" → ep${epNum ?? 1} "${rawEpisodeId}"`, undefined, this.name);
                    }
                } catch { /* ignore */ }
            }

            logger.info(`Fetching ${category} stream from AnimeKai for ${rawEpisodeId}`, undefined, this.name);

            // Get the list of embed server URLs (anikai.to/iframe/TOKEN entries)
            const serversTimeoutMs = options?.timeout ?? 25_000;
            let servers: any[] = await Promise.race([
                p.fetchEpisodeServers(rawEpisodeId, subOrDub),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), serversTimeoutMs))
            ]);

            const timeoutMs = options?.timeout ?? 25_000;

            // Fallback: directly scrape animekai.to for server URLs if consumet returns empty
            if (!servers?.length) {
                logger.warn(`AnimeKai: consumet returned 0 servers, trying direct scrape for ${rawEpisodeId}`, undefined, this.name);
                servers = await this.scrapeServersFromWebsite(rawEpisodeId, category, timeoutMs);
            }

            if (!servers?.length) {
                logger.warn(`AnimeKai: no servers found for ${rawEpisodeId}`, undefined, this.name);
                return { sources: [], subtitles: [] };
            }



            // Try each server in order until one yields sources
            for (const sv of servers) {
                if (!sv?.url) continue;
                try {
                    const sources = await this.extractMegaupStream(sv.url, timeoutMs);
                    if (sources.length > 0) {
                        const streamData: StreamingData = { 
                            sources, 
                            subtitles: [], 
                            source: this.name, 
                            category,
                            headers: {
                                'Referer': 'https://megaup.nl/'
                            }
                        };
                        logger.info(`AnimeKai: ${sources.length} source(s) via ${sv.name} for ${rawEpisodeId} (${category})`, undefined, this.name);
                        // Cache for 5 minutes (300s) - megaup URLs expire quickly
                        this.setCache(cacheKey, streamData, 5 * 60 * 1000);
                        return streamData;
                    }
                } catch (svErr: unknown) {
                    const msg = svErr instanceof Error ? svErr.message : String(svErr);
                    if (isConsumetEmbedDecoderRejected(svErr)) {
                        logger.warn(`AnimeKai: enc-dec.app rate-limited for server ${sv.name}`, undefined, this.name);
                    } else {
                        logger.warn(`AnimeKai: server ${sv.name} failed — ${msg}`, undefined, this.name);
                    }
                }
            }

            return { sources: [], subtitles: [] };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (/server .* not found/i.test(err.message)) {
                logger.warn(`AnimeKai: CDN server unavailable for ${episodeId} — ${err.message}`, undefined, this.name);
                return { sources: [], subtitles: [] };
            }
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const result = await this.search('', page, undefined, options);
            return result.results;
        } catch {
            return [];
        }
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return this.getTrending(page, options);
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, i) => ({
            rank: (page - 1) * limit + i + 1,
            anime
        }));
    }
}

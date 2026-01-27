/**
 * Full 9anime Scraper Test
 * 
 * Strategy:
 * 1. Scrape 9animetv.to for anime metadata (search, info, episodes)
 * 2. Use local aniwatch-api for streaming (since both use rapid-cloud)
 * 3. Map 9anime IDs to HiAnime IDs for streaming
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer, { Browser, Page } from 'puppeteer';

const NINEANIME_URL = 'https://9animetv.to';
const HIANIME_API = 'http://localhost:4000/api/v2/hianime';

interface AnimeResult {
    id: string;
    title: string;
    image: string;
    type: string;
    episodes: { sub: number; dub: number };
}

interface EpisodeResult {
    id: string;
    number: number;
    title: string;
}

interface StreamResult {
    url: string;
    quality: string;
    subtitles: { lang: string; url: string }[];
    intro?: { start: number; end: number };
}

class NineAnimeFullScraper {
    private browser: Browser | null = null;

    async init(): Promise<void> {
        this.browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
        }
    }

    /**
     * Search 9anime
     */
    async search9Anime(query: string): Promise<AnimeResult[]> {
        console.log(`\n🔍 Searching 9anime for: "${query}"`);
        const results: AnimeResult[] = [];
        
        try {
            const response = await axios.get(`${NINEANIME_URL}/search`, {
                params: { keyword: query },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
                    'Accept': 'text/html'
                },
                timeout: 15000
            });
            
            const $ = cheerio.load(response.data);
            
            $('.flw-item').each((i, el) => {
                const $el = $(el);
                const title = $el.find('.film-name a').text().trim();
                const url = $el.find('.film-name a').attr('href') || '';
                const image = $el.find('img').attr('data-src') || $el.find('img').attr('src') || '';
                const id = url.split('/watch/')[1]?.split('?')[0] || '';
                const type = $el.find('.fdi-item').first().text().trim() || 'TV';
                
                // Extract episode counts
                const subText = $el.find('.tick-sub').text().trim();
                const dubText = $el.find('.tick-dub').text().trim();
                
                if (title && id) {
                    results.push({
                        id,
                        title,
                        image,
                        type,
                        episodes: {
                            sub: parseInt(subText) || 0,
                            dub: parseInt(dubText) || 0
                        }
                    });
                }
            });
            
            console.log(`✅ Found ${results.length} results on 9anime`);
            return results;
        } catch (error: any) {
            console.error('❌ 9anime search failed:', error.message);
            return [];
        }
    }

    /**
     * Get episodes from 9anime
     */
    async get9AnimeEpisodes(animeSlug: string): Promise<EpisodeResult[]> {
        console.log(`\n📋 Getting episodes for: ${animeSlug}`);
        const episodes: EpisodeResult[] = [];
        
        try {
            // Extract anime ID from slug
            const animeId = animeSlug.match(/-(\d+)$/)?.[1] || '';
            if (!animeId) {
                throw new Error('Could not extract anime ID from slug');
            }
            
            const response = await axios.get(`${NINEANIME_URL}/ajax/episode/list/${animeId}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${NINEANIME_URL}/watch/${animeSlug}`
                },
                timeout: 15000
            });
            
            if (response.data?.html) {
                const $ = cheerio.load(response.data.html);
                
                $('.ep-item').each((i, el) => {
                    const $el = $(el);
                    const epId = $el.attr('data-id') || '';
                    const epNumber = parseInt($el.attr('data-number') || '0');
                    const epTitle = $el.attr('title') || `Episode ${epNumber}`;
                    
                    if (epId && epNumber > 0) {
                        episodes.push({
                            id: epId,
                            number: epNumber,
                            title: epTitle
                        });
                    }
                });
            }
            
            console.log(`✅ Found ${episodes.length} episodes`);
            return episodes;
        } catch (error: any) {
            console.error('❌ Failed to get episodes:', error.message);
            return [];
        }
    }

    /**
     * Get servers from 9anime
     */
    async get9AnimeServers(episodeId: string): Promise<{ id: string; name: string; type: string }[]> {
        console.log(`\n📡 Getting servers for episode: ${episodeId}`);
        const servers: { id: string; name: string; type: string }[] = [];
        
        try {
            const response = await axios.get(`${NINEANIME_URL}/ajax/episode/servers`, {
                params: { episodeId },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': NINEANIME_URL
                },
                timeout: 15000
            });
            
            if (response.data?.html) {
                const $ = cheerio.load(response.data.html);
                
                $('.servers-sub .server-item').each((i, el) => {
                    const serverId = $(el).attr('data-id') || '';
                    const serverName = $(el).text().trim();
                    if (serverId) {
                        servers.push({ id: serverId, name: serverName, type: 'sub' });
                    }
                });
                
                $('.servers-dub .server-item').each((i, el) => {
                    const serverId = $(el).attr('data-id') || '';
                    const serverName = $(el).text().trim();
                    if (serverId) {
                        servers.push({ id: serverId, name: serverName, type: 'dub' });
                    }
                });
            }
            
            console.log(`✅ Found ${servers.length} servers`);
            return servers;
        } catch (error: any) {
            console.error('❌ Failed to get servers:', error.message);
            return [];
        }
    }

    /**
     * Search HiAnime for the same anime to get streaming
     */
    async searchHiAnime(query: string): Promise<{ id: string; name: string }[]> {
        console.log(`\n🔍 Searching HiAnime for: "${query}"`);
        
        try {
            const response = await axios.get(`${HIANIME_API}/search`, {
                params: { q: query },
                timeout: 15000
            });
            
            const data = response.data?.data || response.data;
            const results = (data.animes || []).map((a: any) => ({
                id: a.id,
                name: a.name
            }));
            
            console.log(`✅ Found ${results.length} results on HiAnime`);
            return results;
        } catch (error: any) {
            console.error('❌ HiAnime search failed:', error.message);
            return [];
        }
    }

    /**
     * Get episodes from HiAnime
     */
    async getHiAnimeEpisodes(animeId: string): Promise<{ episodeId: string; number: number }[]> {
        try {
            const response = await axios.get(`${HIANIME_API}/anime/${animeId}/episodes`, { timeout: 15000 });
            const data = response.data?.data || response.data;
            return (data.episodes || []).map((ep: any) => ({
                episodeId: ep.episodeId,
                number: ep.number
            }));
        } catch (error: any) {
            console.error('❌ Failed to get HiAnime episodes:', error.message);
            return [];
        }
    }

    /**
     * Get streaming from HiAnime API
     */
    async getHiAnimeStream(episodeId: string, server: string = 'hd-1', category: string = 'sub'): Promise<StreamResult | null> {
        console.log(`\n📺 Getting stream from HiAnime API`);
        console.log(`   Episode: ${episodeId}, Server: ${server}, Category: ${category}`);
        
        try {
            const response = await axios.get(`${HIANIME_API}/episode/sources`, {
                params: {
                    animeEpisodeId: episodeId,
                    server,
                    category
                },
                timeout: 60000
            });
            
            const data = response.data?.data || response.data;
            
            if (data?.sources && data.sources.length > 0) {
                return {
                    url: data.sources[0].url,
                    quality: data.sources[0].quality || 'auto',
                    subtitles: (data.subtitles || []).map((s: any) => ({
                        lang: s.lang,
                        url: s.url
                    })),
                    intro: data.intro
                };
            }
            
            return null;
        } catch (error: any) {
            console.error('❌ Failed to get stream:', error.message);
            return null;
        }
    }

    /**
     * Full flow: Search anime on 9anime, then get stream via HiAnime API
     */
    async fullFlow(query: string, episodeNumber: number = 1): Promise<void> {
        console.log('\n' + '='.repeat(60));
        console.log(`FULL FLOW TEST: "${query}" Episode ${episodeNumber}`);
        console.log('='.repeat(60));
        
        // Step 1: Search on 9anime
        const nineAnimeResults = await this.search9Anime(query);
        if (nineAnimeResults.length === 0) {
            console.log('❌ No results on 9anime');
            return;
        }
        
        const selectedAnime = nineAnimeResults[0];
        console.log(`\n📌 Selected: ${selectedAnime.title} (${selectedAnime.id})`);
        
        // Step 2: Get episodes from 9anime
        const nineAnimeEpisodes = await this.get9AnimeEpisodes(selectedAnime.id);
        if (nineAnimeEpisodes.length === 0) {
            console.log('❌ No episodes found on 9anime');
            return;
        }
        
        // Step 3: Get servers for selected episode
        const targetEpisode = nineAnimeEpisodes.find(ep => ep.number === episodeNumber) || nineAnimeEpisodes[0];
        console.log(`\n📌 Selected Episode: ${targetEpisode.number} (ID: ${targetEpisode.id})`);
        
        const servers = await this.get9AnimeServers(targetEpisode.id);
        console.log(`   Servers available: ${servers.map(s => `${s.name}(${s.type})`).join(', ')}`);
        
        // Step 4: Search the same anime on HiAnime
        const hiAnimeResults = await this.searchHiAnime(query);
        if (hiAnimeResults.length === 0) {
            console.log('❌ Could not find matching anime on HiAnime');
            return;
        }
        
        const matchingHiAnime = hiAnimeResults[0];
        console.log(`\n📌 Matched HiAnime: ${matchingHiAnime.name} (${matchingHiAnime.id})`);
        
        // Step 5: Get episodes from HiAnime
        const hiAnimeEpisodes = await this.getHiAnimeEpisodes(matchingHiAnime.id);
        if (hiAnimeEpisodes.length === 0) {
            console.log('❌ No episodes found on HiAnime');
            return;
        }
        
        const matchingEpisode = hiAnimeEpisodes.find(ep => ep.number === episodeNumber) || hiAnimeEpisodes[0];
        console.log(`\n📌 HiAnime Episode ID: ${matchingEpisode.episodeId}`);
        
        // Step 6: Get streaming URL from HiAnime API
        const stream = await this.getHiAnimeStream(matchingEpisode.episodeId, 'hd-1', 'sub');
        
        if (stream) {
            console.log('\n' + '*'.repeat(60));
            console.log('🎉 STREAM FOUND!');
            console.log('*'.repeat(60));
            console.log(`\n📺 Stream URL: ${stream.url.substring(0, 100)}...`);
            console.log(`   Quality: ${stream.quality}`);
            console.log(`   Subtitles: ${stream.subtitles.length} available`);
            if (stream.intro) {
                console.log(`   Intro skip: ${stream.intro.start}s - ${stream.intro.end}s`);
            }
        } else {
            console.log('\n❌ Could not get stream');
        }
    }
}

async function main() {
    console.log('🎬 FULL 9ANIME SCRAPER TEST');
    console.log('='.repeat(60));
    console.log('Strategy: Scrape 9anime metadata + Use HiAnime API for streams');
    console.log('='.repeat(60));
    
    const scraper = new NineAnimeFullScraper();
    
    try {
        await scraper.init();
        
        // Test with popular anime
        await scraper.fullFlow('one piece', 1);
        
        // Test with another anime
        await scraper.fullFlow('demon slayer', 1);
        
    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        await scraper.close();
    }
}

main();

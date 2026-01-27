import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';

const BASE_URL = 'https://9animetv.to';

interface StreamSource {
    url: string;
    quality: string;
    type: string;
    server: string;
}

interface ScrapedResult {
    animeId: string;
    animeTitle: string;
    episodeId: string;
    episodeNumber: number;
    servers: { id: string; name: string; type: string }[];
    embedUrls: { server: string; url: string }[];
    streams: StreamSource[];
}

class NineAnimeScraper {
    private browser: Browser | null = null;

    async init(): Promise<void> {
        console.log('🚀 Launching browser...');
        this.browser = await puppeteer.launch({
            headless: false, // Use headed mode to avoid detection
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--window-size=1920,1080'
            ]
        });
        console.log('✅ Browser launched');
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 Browser closed');
        }
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getPage(): Promise<Page> {
        if (!this.browser) throw new Error('Browser not initialized');
        const page = await this.browser.newPage();
        
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Set extra headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });
        
        return page;
    }

    /**
     * Full flow: Get stream URLs from an episode
     */
    async getStreamForEpisode(animeSlug: string, episodeId: string): Promise<ScrapedResult> {
        console.log(`\n🎬 Getting stream for: ${animeSlug}, Episode ID: ${episodeId}`);
        const page = await this.getPage();
        
        const result: ScrapedResult = {
            animeId: animeSlug,
            animeTitle: '',
            episodeId,
            episodeNumber: 0,
            servers: [],
            embedUrls: [],
            streams: []
        };
        
        try {
            // Step 1: Navigate to episode page
            const episodeUrl = `${BASE_URL}/watch/${animeSlug}?ep=${episodeId}`;
            console.log(`📍 Step 1: Navigate to ${episodeUrl}`);
            
            await page.goto(episodeUrl, { 
                waitUntil: 'networkidle2',
                timeout: 45000 
            });
            
            // Get anime title
            const html = await page.content();
            const $ = cheerio.load(html);
            result.animeTitle = $('h2.film-name, .anime-title').first().text().trim();
            console.log(`📺 Anime: ${result.animeTitle}`);
            
            // Wait for player iframe
            await page.waitForSelector('#iframe-embed, iframe', { timeout: 15000 });
            await this.delay(2000);
            
            // Step 2: Get servers via AJAX API
            console.log('\n📍 Step 2: Fetching servers...');
            
            // Get cookies for authenticated requests
            const cookies = await page.cookies();
            const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            
            const serversUrl = `${BASE_URL}/ajax/episode/servers?episodeId=${episodeId}`;
            const serversResponse = await axios.get(serversUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': episodeUrl,
                    'Cookie': cookieString
                }
            });
            
            if (serversResponse.data?.html) {
                const $s = cheerio.load(serversResponse.data.html);
                
                $s('.servers-sub .server-item, .servers-dub .server-item').each((i, el) => {
                    const serverId = $s(el).attr('data-id') || '';
                    const serverName = $s(el).text().trim();
                    const type = $s(el).closest('.servers-dub').length > 0 ? 'dub' : 'sub';
                    result.servers.push({ id: serverId, name: serverName, type });
                });
                
                console.log(`✅ Found ${result.servers.length} servers:`, result.servers);
            }
            
            // Step 3: Get embed URL for each server
            console.log('\n📍 Step 3: Fetching embed URLs...');
            
            for (const server of result.servers) {
                const sourcesUrl = `${BASE_URL}/ajax/episode/sources?id=${server.id}`;
                try {
                    const sourcesResponse = await axios.get(sourcesUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
                            'X-Requested-With': 'XMLHttpRequest',
                            'Referer': episodeUrl,
                            'Cookie': cookieString
                        }
                    });
                    
                    if (sourcesResponse.data?.link) {
                        result.embedUrls.push({
                            server: server.name,
                            url: sourcesResponse.data.link
                        });
                        console.log(`  ✅ ${server.name}: ${sourcesResponse.data.link}`);
                    }
                } catch (e: any) {
                    console.log(`  ⚠️ ${server.name}: Failed - ${e.message}`);
                }
            }
            
            // Step 4: Extract actual stream from embeds
            console.log('\n📍 Step 4: Extracting streams from embeds...');
            
            // Try the first working embed
            for (const embed of result.embedUrls.slice(0, 2)) {
                console.log(`\n🔍 Trying ${embed.server}: ${embed.url}`);
                
                const streams = await this.extractStreamFromEmbed(page, embed.url, episodeUrl);
                streams.forEach(s => {
                    result.streams.push({ ...s, server: embed.server });
                });
                
                if (result.streams.length > 0) {
                    console.log(`✅ Found ${streams.length} streams from ${embed.server}`);
                    break; // Found streams, stop trying
                }
            }
            
        } catch (error) {
            console.error('❌ Error:', error);
        } finally {
            await page.close();
        }
        
        return result;
    }

    /**
     * Extract stream URLs from embed page
     */
    async extractStreamFromEmbed(page: Page, embedUrl: string, referer: string): Promise<Omit<StreamSource, 'server'>[]> {
        const sources: Omit<StreamSource, 'server'>[] = [];
        const newPage = await this.getPage();
        
        try {
            // Intercept network requests
            await newPage.setRequestInterception(true);
            
            const capturedM3U8s: string[] = [];
            const capturedAPIResponses: any[] = [];
            
            newPage.on('request', (req) => {
                const url = req.url();
                
                // Capture m3u8 requests
                if (url.includes('.m3u8') && !url.includes('subtitles')) {
                    console.log(`  🎯 M3U8 request: ${url.substring(0, 100)}...`);
                    capturedM3U8s.push(url);
                }
                
                req.continue();
            });
            
            newPage.on('response', async (response) => {
                const url = response.url();
                
                // Capture getSources API
                if (url.includes('getSources') || url.includes('source')) {
                    try {
                        const text = await response.text();
                        console.log(`  📦 Sources API: ${url.split('?')[0]}`);
                        console.log(`      Preview: ${text.substring(0, 200)}...`);
                        
                        try {
                            const data = JSON.parse(text);
                            capturedAPIResponses.push(data);
                        } catch {}
                    } catch {}
                }
            });
            
            // Navigate to embed with referer
            await newPage.setExtraHTTPHeaders({
                'Referer': referer
            });
            
            await newPage.goto(embedUrl, {
                waitUntil: 'networkidle0',
                timeout: 45000
            });
            
            // Wait for player to initialize
            await this.delay(8000);
            
            // Try to click play if there's a play button
            try {
                await newPage.click('.play-btn, .vjs-big-play-button, [class*="play"]').catch(() => {});
                await this.delay(5000);
            } catch {}
            
            // Check video element
            const videoSrc = await newPage.evaluate(() => {
                const video = document.querySelector('video');
                return video?.src || video?.currentSrc || null;
            });
            
            if (videoSrc && videoSrc.includes('.m3u8')) {
                capturedM3U8s.push(videoSrc);
            }
            
            // Check HTML for m3u8 URLs
            const html = await newPage.content();
            const m3u8Regex = /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g;
            const matches = html.match(m3u8Regex);
            if (matches) {
                matches.forEach(url => {
                    if (!url.includes('subtitles')) {
                        capturedM3U8s.push(url);
                    }
                });
            }
            
            // Extract from API responses
            for (const data of capturedAPIResponses) {
                if (data.sources && Array.isArray(data.sources)) {
                    data.sources.forEach((s: any) => {
                        const url = s.file || s.url || s.src;
                        if (url) capturedM3U8s.push(url);
                    });
                }
            }
            
            // Dedupe and format
            const uniqueUrls = [...new Set(capturedM3U8s)];
            uniqueUrls.forEach(url => {
                sources.push({
                    url,
                    quality: 'auto',
                    type: url.includes('.m3u8') ? 'hls' : 'mp4'
                });
            });
            
        } catch (error) {
            console.log(`  ⚠️ Embed extraction error: ${error}`);
        } finally {
            await newPage.close();
        }
        
        return sources;
    }

    /**
     * Search anime
     */
    async search(query: string): Promise<{ id: string; title: string; url: string; image: string }[]> {
        console.log(`\n🔍 Searching for: ${query}`);
        const results: { id: string; title: string; url: string; image: string }[] = [];
        
        try {
            const searchUrl = `${BASE_URL}/search?keyword=${encodeURIComponent(query)}`;
            const response = await axios.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            
            const $ = cheerio.load(response.data);
            
            $('.flw-item').each((i, el) => {
                const $el = $(el);
                const title = $el.find('.film-name a').text().trim();
                const url = $el.find('.film-name a').attr('href') || '';
                const image = $el.find('img').attr('data-src') || $el.find('img').attr('src') || '';
                const id = url.split('/watch/')[1]?.split('?')[0] || '';
                
                if (title && id) {
                    results.push({ id, title, url: `${BASE_URL}${url}`, image });
                }
            });
            
            console.log(`✅ Found ${results.length} results`);
        } catch (error: any) {
            console.error('❌ Search failed:', error.message);
        }
        
        return results;
    }

    /**
     * Get episodes for an anime
     */
    async getEpisodes(animeSlug: string): Promise<{ id: string; number: number; title: string }[]> {
        console.log(`\n📋 Getting episodes for: ${animeSlug}`);
        const episodes: { id: string; number: number; title: string }[] = [];
        
        try {
            // Extract anime ID from slug (e.g., "koupen-chan-19647" -> "19647")
            const animeId = animeSlug.match(/-(\d+)$/)?.[1] || '';
            
            const episodesUrl = `${BASE_URL}/ajax/episode/list/${animeId}`;
            const response = await axios.get(episodesUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${BASE_URL}/watch/${animeSlug}`
                }
            });
            
            if (response.data?.html) {
                const $ = cheerio.load(response.data.html);
                
                $('.ep-item').each((i, el) => {
                    const $el = $(el);
                    const epId = $el.attr('data-id') || '';
                    const epNumber = parseInt($el.attr('data-number') || '0');
                    const epTitle = $el.attr('title') || `Episode ${epNumber}`;
                    
                    if (epId && epNumber > 0) {
                        episodes.push({ id: epId, number: epNumber, title: epTitle });
                    }
                });
            }
            
            console.log(`✅ Found ${episodes.length} episodes`);
        } catch (error: any) {
            console.error('❌ Failed to get episodes:', error.message);
        }
        
        return episodes;
    }
}

// Main test
async function main() {
    const scraper = new NineAnimeScraper();
    
    try {
        await scraper.init();
        
        // Test search
        const searchResults = await scraper.search('naruto');
        if (searchResults.length > 0) {
            console.log('\n📋 Search results sample:', searchResults.slice(0, 3));
        }
        
        // Test getting episodes
        const episodes = await scraper.getEpisodes('koupen-chan-19647');
        console.log('\n📋 Episodes sample:', episodes.slice(0, 3));
        
        // Test full stream extraction
        if (episodes.length > 0) {
            const result = await scraper.getStreamForEpisode('koupen-chan-19647', episodes[0].id);
            
            console.log('\n' + '='.repeat(60));
            console.log('📺 FINAL RESULT');
            console.log('='.repeat(60));
            console.log('Anime:', result.animeTitle);
            console.log('Episode:', result.episodeNumber);
            console.log('Servers:', result.servers.length);
            console.log('Embed URLs:', result.embedUrls.length);
            console.log('Stream URLs:', result.streams.length);
            
            if (result.streams.length > 0) {
                console.log('\n🎬 STREAMS:');
                result.streams.forEach((s, i) => {
                    console.log(`  ${i + 1}. [${s.server}] ${s.type}: ${s.url}`);
                });
            } else {
                console.log('\n⚠️ No streams extracted - embed may be using encryption');
            }
        }
        
    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        await scraper.close();
    }
}

main();

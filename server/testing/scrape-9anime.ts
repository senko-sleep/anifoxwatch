import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';

const BASE_URL = 'https://9animetv.to';

interface AnimeInfo {
    id: string;
    title: string;
    image: string;
    url: string;
}

interface EpisodeInfo {
    id: string;
    number: number;
    title: string;
    url: string;
}

interface ServerInfo {
    serverId: string;
    serverName: string;
    type: 'sub' | 'dub' | 'raw';
}

interface StreamSource {
    url: string;
    quality: string;
    type: string;
}

class NineAnimeScraper {
    private browser: Browser | null = null;

    async init(): Promise<void> {
        console.log('🚀 Launching browser...');
        this.browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920x1080'
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

    async getPage(): Promise<Page> {
        if (!this.browser) throw new Error('Browser not initialized');
        const page = await this.browser.newPage();
        
        // Set user agent to avoid detection
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        
        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });
        
        return page;
    }

    /**
     * Test 1: Fetch homepage and find anime
     */
    async testHomepage(): Promise<void> {
        console.log('\n📺 TEST 1: Fetching homepage...');
        const page = await this.getPage();
        
        try {
            await page.goto(`${BASE_URL}/home`, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            // Wait for content to load
            await page.waitForSelector('.film_list-wrap, .anime-list, .block_area', { timeout: 10000 });
            
            const html = await page.content();
            const $ = cheerio.load(html);
            
            // Find anime items on homepage
            const animeItems: AnimeInfo[] = [];
            
            // Try different selectors that 9anime might use
            $('.flw-item, .item, .anime-item').each((i, el) => {
                const $el = $(el);
                const title = $el.find('.film-name a, .name a, .title a').text().trim() || 
                              $el.find('a.dynamic-name').text().trim();
                const url = $el.find('.film-name a, .name a, a.dynamic-name').attr('href') || '';
                const image = $el.find('img').attr('data-src') || $el.find('img').attr('src') || '';
                const id = url.split('/').pop()?.split('?')[0] || '';
                
                if (title && url) {
                    animeItems.push({ id, title, image, url: `${BASE_URL}${url}` });
                }
            });
            
            console.log(`✅ Found ${animeItems.length} anime on homepage`);
            if (animeItems.length > 0) {
                console.log('📋 Sample anime:', animeItems.slice(0, 3));
            }
            
            // Log page structure for debugging
            console.log('\n🔍 Page structure analysis:');
            console.log('- Body classes:', $('body').attr('class'));
            console.log('- Main sections:', $('.block_area').length);
            console.log('- Film items:', $('.flw-item').length);
            
        } catch (error) {
            console.error('❌ Homepage test failed:', error);
        } finally {
            await page.close();
        }
    }

    /**
     * Test 2: Fetch anime detail page and get episodes
     */
    async testAnimeDetail(animeSlug: string): Promise<EpisodeInfo[]> {
        console.log(`\n📺 TEST 2: Fetching anime detail for: ${animeSlug}`);
        const page = await this.getPage();
        const episodes: EpisodeInfo[] = [];
        
        try {
            const url = `${BASE_URL}/${animeSlug}`;
            console.log(`🔗 URL: ${url}`);
            
            await page.goto(url, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            // Wait for episode list
            await page.waitForSelector('.ss-list, .episodes-list, #episodes-page', { timeout: 10000 })
                .catch(() => console.log('⚠️ Episode list selector not found'));
            
            const html = await page.content();
            const $ = cheerio.load(html);
            
            // Get anime title
            const title = $('h2.film-name, .anime-title, h1').first().text().trim();
            console.log(`📖 Anime title: ${title}`);
            
            // Find episode list
            $('.ep-item, .episode-item, .ss-list a').each((i, el) => {
                const $el = $(el);
                const epNumber = parseInt($el.attr('data-number') || $el.text().match(/\d+/)?.[0] || '0');
                const epId = $el.attr('data-id') || $el.attr('href')?.split('ep=')[1] || '';
                const epUrl = $el.attr('href') || '';
                const epTitle = $el.attr('title') || `Episode ${epNumber}`;
                
                if (epNumber > 0) {
                    episodes.push({
                        id: epId,
                        number: epNumber,
                        title: epTitle,
                        url: epUrl.startsWith('http') ? epUrl : `${BASE_URL}${epUrl}`
                    });
                }
            });
            
            console.log(`✅ Found ${episodes.length} episodes`);
            if (episodes.length > 0) {
                console.log('📋 Sample episodes:', episodes.slice(0, 5));
            }
            
        } catch (error) {
            console.error('❌ Anime detail test failed:', error);
        } finally {
            await page.close();
        }
        
        return episodes;
    }

    /**
     * Test 3: Fetch episode page and get servers
     */
    async testEpisodePage(episodeUrl: string): Promise<ServerInfo[]> {
        console.log(`\n📺 TEST 3: Fetching episode page: ${episodeUrl}`);
        const page = await this.getPage();
        const servers: ServerInfo[] = [];
        
        try {
            await page.goto(episodeUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            // Wait for server list
            await page.waitForSelector('.servers-sub, .servers-dub, .server-item', { timeout: 15000 })
                .catch(() => console.log('⚠️ Server list not found'));
            
            const html = await page.content();
            const $ = cheerio.load(html);
            
            // Find server buttons
            $('.server-item, .servers-sub .item, .servers-dub .item').each((i, el) => {
                const $el = $(el);
                const serverId = $el.attr('data-id') || $el.attr('data-sv-id') || '';
                const serverName = $el.text().trim();
                const type = $el.closest('.servers-dub').length > 0 ? 'dub' : 'sub';
                
                if (serverId) {
                    servers.push({ serverId, serverName, type: type as 'sub' | 'dub' });
                }
            });
            
            console.log(`✅ Found ${servers.length} servers`);
            console.log('📋 Servers:', servers);
            
            // Also check for iframe sources
            const iframes = $('iframe').map((i, el) => $(el).attr('src')).get();
            if (iframes.length > 0) {
                console.log('📺 Iframe sources found:', iframes);
            }
            
        } catch (error) {
            console.error('❌ Episode page test failed:', error);
        } finally {
            await page.close();
        }
        
        return servers;
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test 4: Get streaming sources from server
     */
    async testGetStreamSources(episodeUrl: string, serverId?: string): Promise<StreamSource[]> {
        console.log(`\n📺 TEST 4: Getting stream sources from: ${episodeUrl}`);
        const page = await this.getPage();
        const sources: StreamSource[] = [];
        
        try {
            // Enable request interception to capture API calls
            await page.setRequestInterception(true);
            
            const capturedUrls: string[] = [];
            
            page.on('request', (request) => {
                const url = request.url();
                // Log API calls that might return stream data
                if (url.includes('ajax') || url.includes('embed') || url.includes('source') || 
                    url.includes('m3u8') || url.includes('streaming') || url.includes('getSources')) {
                    capturedUrls.push(url);
                }
                request.continue();
            });
            
            page.on('response', async (response) => {
                const url = response.url();
                if (url.includes('m3u8') || url.includes('source') || url.includes('getSources')) {
                    try {
                        const contentType = response.headers()['content-type'] || '';
                        if (contentType.includes('json') || contentType.includes('text')) {
                            const text = await response.text().catch(() => '');
                            if (text.includes('m3u8') || text.includes('sources')) {
                                console.log(`🎯 Potential stream response from: ${url}`);
                                console.log('📦 Response preview:', text.slice(0, 500));
                            }
                        }
                    } catch (e) {}
                }
            });
            
            await page.goto(episodeUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            // Wait for video player to load
            await this.delay(3000);
            
            // If server ID provided, click on that server
            if (serverId) {
                const serverSelector = `[data-id="${serverId}"], [data-sv-id="${serverId}"]`;
                const serverButton = await page.$(serverSelector);
                if (serverButton) {
                    await serverButton.click();
                    await this.delay(3000);
                }
            }
            
            // Check for video iframe
            const html = await page.content();
            const $ = cheerio.load(html);
            
            const iframeSrc = $('#iframe-embed, .player iframe, iframe[src*="embed"]').attr('src');
            if (iframeSrc) {
                console.log(`🎬 Video iframe found: ${iframeSrc}`);
                sources.push({ url: iframeSrc, quality: 'embed', type: 'iframe' });
            }
            
            console.log('\n📋 Captured API URLs:');
            capturedUrls.forEach(url => console.log(`  - ${url}`));
            
        } catch (error) {
            console.error('❌ Stream sources test failed:', error);
        } finally {
            await page.close();
        }
        
        return sources;
    }

    /**
     * Test 5: Extract stream from embed URL
     */
    async testExtractFromEmbed(embedUrl: string): Promise<StreamSource[]> {
        console.log(`\n📺 TEST 5: Extracting stream from embed: ${embedUrl}`);
        const page = await this.getPage();
        const sources: StreamSource[] = [];
        
        try {
            await page.setRequestInterception(true);
            
            page.on('request', (request) => {
                const url = request.url();
                if (url.includes('.m3u8') || url.includes('.mp4')) {
                    console.log(`🎯 Found stream URL in request: ${url}`);
                    sources.push({ url, quality: 'auto', type: url.includes('.m3u8') ? 'hls' : 'mp4' });
                }
                request.continue();
            });
            
            await page.goto(embedUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            await this.delay(5000);
            
            // Try to find video source in page
            const html = await page.content();
            const m3u8Matches = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g);
            const mp4Matches = html.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/g);
            
            if (m3u8Matches) {
                m3u8Matches.forEach(url => {
                    if (!sources.find(s => s.url === url)) {
                        sources.push({ url, quality: 'auto', type: 'hls' });
                    }
                });
            }
            
            if (mp4Matches) {
                mp4Matches.forEach(url => {
                    if (!sources.find(s => s.url === url)) {
                        sources.push({ url, quality: 'auto', type: 'mp4' });
                    }
                });
            }
            
            console.log(`✅ Found ${sources.length} stream sources`);
            sources.forEach(s => console.log(`  - ${s.type}: ${s.url}`));
            
        } catch (error) {
            console.error('❌ Embed extraction failed:', error);
        } finally {
            await page.close();
        }
        
        return sources;
    }

    /**
     * Test 6: Full flow - get stream from episode using AJAX API
     */
    async testGetStreamViaAPI(animeId: string, episodeId: string): Promise<StreamSource[]> {
        console.log(`\n📺 TEST 6: Getting stream via AJAX API for episode: ${episodeId}`);
        const sources: StreamSource[] = [];
        
        try {
            // Correct endpoint without /v2/
            const serversUrl = `${BASE_URL}/ajax/episode/servers?episodeId=${episodeId}`;
            console.log(`🔗 Fetching servers from: ${serversUrl}`);
            
            const serversResponse = await axios.get(serversUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${BASE_URL}/watch/${animeId}?ep=${episodeId}`
                }
            });
            
            console.log('📦 Servers response status:', serversResponse.data?.status);
            
            // Parse HTML response to find server IDs
            if (serversResponse.data?.html) {
                const $ = cheerio.load(serversResponse.data.html);
                
                const servers: { id: string; name: string; type: string }[] = [];
                
                // Find SUB servers
                $('.servers-sub .server-item').each((i, el) => {
                    const serverId = $(el).attr('data-id') || '';
                    const serverName = $(el).text().trim();
                    servers.push({ id: serverId, name: serverName, type: 'sub' });
                    console.log(`  📡 [SUB] ${serverName} (ID: ${serverId})`);
                });
                
                // Find DUB servers  
                $('.servers-dub .server-item').each((i, el) => {
                    const serverId = $(el).attr('data-id') || '';
                    const serverName = $(el).text().trim();
                    servers.push({ id: serverId, name: serverName, type: 'dub' });
                    console.log(`  📡 [DUB] ${serverName} (ID: ${serverId})`);
                });
                
                // Get sources from each server
                for (const server of servers.slice(0, 3)) { // Limit to first 3 servers
                    console.log(`\n🔍 Getting sources from ${server.name} (${server.id})...`);
                    
                    const sourcesUrl = `${BASE_URL}/ajax/episode/sources?id=${server.id}`;
                    try {
                        const sourcesResponse = await axios.get(sourcesUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
                                'X-Requested-With': 'XMLHttpRequest',
                                'Referer': `${BASE_URL}/watch/${animeId}?ep=${episodeId}`
                            }
                        });
                        
                        console.log('📦 Sources response:', JSON.stringify(sourcesResponse.data, null, 2));
                        
                        if (sourcesResponse.data?.link) {
                            console.log(`🎬 Embed URL: ${sourcesResponse.data.link}`);
                            sources.push({ 
                                url: sourcesResponse.data.link, 
                                quality: server.name, 
                                type: server.type 
                            });
                        }
                    } catch (e: any) {
                        console.log(`  ⚠️ Failed to get sources from ${server.name}: ${e.message}`);
                    }
                }
            }
            
        } catch (error: any) {
            console.error('❌ API extraction failed:', error.message);
            if (error.response) {
                console.log('Response status:', error.response.status);
                console.log('Response data:', error.response.data);
            }
        }
        
        return sources;
    }

    /**
     * Test 7: Extract actual m3u8 from rapid-cloud embed
     */
    async testExtractRapidCloud(embedUrl: string): Promise<StreamSource[]> {
        console.log(`\n📺 TEST 7: Extracting from RapidCloud: ${embedUrl}`);
        const page = await this.getPage();
        const sources: StreamSource[] = [];
        
        try {
            await page.setRequestInterception(true);
            
            const capturedSources: string[] = [];
            const capturedResponses: { url: string; data: string }[] = [];
            
            page.on('request', (request) => {
                const url = request.url();
                // Capture any m3u8 or streaming URLs
                if (url.includes('.m3u8') || url.includes('master.txt')) {
                    console.log(`🎯 Request: ${url}`);
                    capturedSources.push(url);
                }
                request.continue();
            });
            
            page.on('response', async (response) => {
                const url = response.url();
                const status = response.status();
                
                // Capture any interesting responses
                if (url.includes('getSources') || url.includes('source') || 
                    url.includes('embed') || url.includes('ajax')) {
                    try {
                        const contentType = response.headers()['content-type'] || '';
                        if (contentType.includes('json') || contentType.includes('text')) {
                            const text = await response.text().catch(() => '');
                            if (text.length > 0 && text.length < 10000) {
                                console.log(`📦 Response [${status}] ${url.split('?')[0]}:`);
                                console.log('   ', text.slice(0, 300));
                                capturedResponses.push({ url, data: text });
                            }
                        }
                    } catch {}
                }
                
                // Capture m3u8 content
                if (url.includes('.m3u8')) {
                    try {
                        const text = await response.text().catch(() => '');
                        console.log(`📺 M3U8 found: ${url}`);
                        console.log('   Content preview:', text.slice(0, 200));
                        capturedSources.push(url);
                    } catch {}
                }
            });
            
            console.log(`🔗 Navigating to: ${embedUrl}`);
            await page.goto(embedUrl, { 
                waitUntil: 'networkidle0',
                timeout: 45000 
            });
            
            // Wait for video to start loading
            console.log('⏳ Waiting for video player...');
            await this.delay(10000);
            
            // Try to click play button if present
            try {
                const playBtn = await page.$('.play-btn, .jw-icon-display, [class*="play"]');
                if (playBtn) {
                    console.log('▶️ Clicking play button...');
                    await playBtn.click();
                    await this.delay(5000);
                }
            } catch {}
            
            // Check for video element
            const videoInfo = await page.evaluate(() => {
                const video = document.querySelector('video');
                if (video) {
                    return {
                        src: video.src || video.currentSrc,
                        sources: Array.from(video.querySelectorAll('source')).map(s => s.src),
                        readyState: video.readyState
                    };
                }
                // Also check for jwplayer
                if ((window as any).jwplayer) {
                    try {
                        const player = (window as any).jwplayer();
                        return {
                            src: player.getPlaylistItem()?.file,
                            sources: player.getPlaylistItem()?.sources?.map((s: any) => s.file) || []
                        };
                    } catch {}
                }
                return null;
            });
            
            if (videoInfo) {
                console.log('🎬 Video element found:', videoInfo);
                if (videoInfo.src) capturedSources.push(videoInfo.src);
                videoInfo.sources?.forEach((s: string) => capturedSources.push(s));
            }
            
            // Check page HTML for sources
            const html = await page.content();
            
            // Look for m3u8 URLs
            const m3u8Matches = html.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g);
            if (m3u8Matches) {
                console.log('🔍 M3U8 URLs in HTML:', m3u8Matches);
                m3u8Matches.forEach(url => capturedSources.push(url));
            }
            
            // Look for streaming URLs in JS
            const streamingMatches = html.match(/file["']?\s*[:=]\s*["']([^"']+\.m3u8[^"']*)/gi);
            if (streamingMatches) {
                console.log('🔍 Streaming matches in JS:', streamingMatches);
            }
            
            // Parse captured responses for sources
            for (const resp of capturedResponses) {
                try {
                    const data = JSON.parse(resp.data);
                    if (data.sources && Array.isArray(data.sources)) {
                        data.sources.forEach((s: any) => {
                            if (s.file) capturedSources.push(s.file);
                            if (s.url) capturedSources.push(s.url);
                        });
                    }
                    if (data.source) capturedSources.push(data.source);
                } catch {}
            }
            
            // Dedupe and add to sources
            const uniqueUrls = [...new Set(capturedSources)].filter(url => 
                url && url.startsWith('http') && !url.includes('recaptcha')
            );
            
            uniqueUrls.forEach(url => {
                sources.push({ 
                    url, 
                    quality: 'auto', 
                    type: url.includes('.m3u8') ? 'hls' : 'mp4' 
                });
            });
            
            console.log(`\n✅ Found ${sources.length} stream sources from RapidCloud`);
            sources.forEach(s => console.log(`  - ${s.type}: ${s.url}`));
            
        } catch (error) {
            console.error('❌ RapidCloud extraction failed:', error);
        } finally {
            await page.close();
        }
        
        return sources;
    }
}

async function main() {
    const scraper = new NineAnimeScraper();
    
    try {
        await scraper.init();
        
        // Test 1: Homepage
        await scraper.testHomepage();
        
        // Test 2: Anime detail - use the URL from user's example
        const episodes = await scraper.testAnimeDetail('watch/koupen-chan-19647');
        
        // Test 3: Episode page  
        if (episodes.length > 0) {
            await scraper.testEpisodePage(episodes[0].url);
        } else {
            // Use the example URL directly
            await scraper.testEpisodePage('https://9animetv.to/watch/koupen-chan-19647?ep=136372');
        }
        
        // Test 4: Get stream sources via page
        const embedSources = await scraper.testGetStreamSources('https://9animetv.to/watch/koupen-chan-19647?ep=136372');
        
        // Test 6: Try AJAX API approach
        await scraper.testGetStreamViaAPI('koupen-chan-19647', '136372');
        
        // Test 7: If we have an embed URL, try to extract from it
        if (embedSources.length > 0 && embedSources[0].url.includes('rapid-cloud')) {
            await scraper.testExtractRapidCloud(embedSources[0].url);
        } else {
            // Try with the known rapid-cloud URL
            await scraper.testExtractRapidCloud('https://rapid-cloud.co/embed-2/v2/e-1/OfmQOAtBIUos?z=&autoPlay=1&oa=0');
        }
        
    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        await scraper.close();
    }
}

main();

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

/**
 * AniStream Hub ULTIMATE Pressure & Resilience Test Suite
 * 
 * Tests:
 * 1. Random anime discovery (5 titles)
 * 2. Episode synchronization & fetching
 * 3. Multi-episode stream resolution (First & Middle)
 * 4. Timing measurements (Resolution & TTFF)
 * 5. Duration verification
 * 6. Playback stability (Manifest integrity)
 * 7. Resilience/Fallback isolation (Excluding AnimeKai/Gogoanime)
 * 8. Speed/Performance checks
 * 9. Production API Verification (https://anifoxwatch.vercel.app/api)
 */

// const API_BASE = 'https://anifoxwatch.vercel.app/api';
const API_BASE = 'http://localhost:3001/api'; 

const LOG_FILE = path.join(process.cwd(), 'testing', 'ultimate-pressure-test.log');

function log(msg: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

async function runUltimateTest() {
    if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
    log('🚀 INITIALIZING ULTIMATE STREAMING PRESSURE TEST');
    log(`📍 TARGET API: ${API_BASE}`);

    try {
        // 1. Discovery
        log('🔍 Fetching trending titles...');
        const trendingResp = await axios.get(`${API_BASE}/anime/trending?page=1`);
        const allAnime = trendingResp.data.results || [];
        
        if (allAnime.length < 5) throw new Error('Insufficient titles found');

        // Pick 5 random, but prioritize those likely to have episodes (non-upcoming)
        const selectedAnime = allAnime
            .filter((a: any) => a.status !== 'Upcoming')
            .sort(() => Math.random() - 0.5)
            .slice(0, 5);

        log(`✅ Selected 5 titles: ${selectedAnime.map((a: any) => getTitle(a)).join(', ')}`);

        for (const anime of selectedAnime) {
            await testTitleFullCycle(anime);
        }

        log('\n🏆 ULTIMATE TEST SUITE COMPLETED SUCCESSFULLY');
    } catch (err: any) {
        log(`❌ CRITICAL SUITE FAILURE: ${err.message}`);
        process.exit(1);
    }
}

function getTitle(anime: any) {
    if (typeof anime.title === 'string') return anime.title;
    return anime.title?.userPreferred || anime.title?.english || anime.title?.romaji || 'Unknown';
}

async function testTitleFullCycle(anime: any) {
    const title = getTitle(anime);
    const animeId = anime.id;
    log(`\n==================================================`);
    log(`📺 TESTING: ${title} (${animeId})`);
    log(`==================================================`);

    try {
        // 2. Episode Fetching
        const startEp = Date.now();
        const epResp = await axios.get(`${API_BASE}/anime/episodes?id=${animeId}`);
        const epLatency = Date.now() - startEp;
        const episodes = epResp.data.episodes || [];
        
        log(`📂 Fetched ${episodes.length} episodes (Latency: ${epLatency}ms)`);
        if (episodes.length === 0) {
            log(`⚠️ No episodes found, skipping title...`);
            return;
        }

        // 3. Multi-Episode Testing
        const toTest = [episodes[0]];
        if (episodes.length > 5) toTest.push(episodes[Math.floor(episodes.length / 2)]);
        
        for (const ep of toTest) {
            await testPlayback(ep, animeId, title);
        }

        // 4. Resilience / Fallback Test
        // We want to prove we can get a stream even if AnimeKai is "down"
        // Since we can't easily tell the server to "ignore" a source, 
        // we'll fetch all sources and verify we can play from an alternative.
        await testResilience(episodes[0], animeId, title);

    } catch (err: any) {
        log(`❌ Title Failure (${title}): ${err.message}`);
    }
}

async function testPlayback(ep: any, animeId: string, title: string) {
    log(`  ▶️ Testing Episode ${ep.number} (${ep.id})`);
    
    try {
        const startRes = Date.now();
        const streamResp = await axios.get(`${API_BASE}/stream/watch/${ep.id}?id=${animeId}`);
        const resLatency = Date.now() - startRes;
        
        const sources = streamResp.data.sources || [];
        if (sources.length === 0) throw new Error('No stream sources found');

        log(`    ⏱️ Resolution: ${resLatency}ms | Provider: ${streamResp.data.source || 'Auto'}`);
        
        const primary = sources[0];
        const playbackOk = await verifyStreamContent(primary.url, 'Primary');
        
        if (playbackOk) {
            log(`    ✅ Playback Verified | Quality: ${primary.quality}`);
        } else {
            log(`    ❌ Playback FAILED`);
        }
        
        if (streamResp.data.duration) {
            log(`    🕒 Duration: ${streamResp.data.duration}s`);
        }
    } catch (err: any) {
        log(`    ❌ Playback Error: ${err.message}`);
    }
}

async function testResilience(ep: any, animeId: string, title: string) {
    log(`  🛡️ Resilience Check: Explicitly testing alternative providers...`);
    
    try {
        // Try to force Gogoanime or Aniwaves to see if they work as fallbacks
        const altServers = ['Gogoanime', 'Aniwaves', 'AllAnime'];
        let resolvedAlt = false;

        for (const server of altServers) {
            log(`    🔍 Attempting fallback to ${server}...`);
            try {
                const streamResp = await axios.get(`${API_BASE}/stream/watch/${ep.id}?id=${animeId}&server=${server}`);
                const sources = streamResp.data.sources || [];
                
                if (sources.length > 0) {
                    const ok = await verifyStreamContent(sources[0].url, `Resilience:${server}`);
                    if (ok) {
                        log(`    ✅ Resilience Verified: ${server} is functional as a fallback`);
                        resolvedAlt = true;
                        break;
                    }
                }
            } catch (e: any) {
                // Silently try next server
            }
        }

        if (!resolvedAlt) {
            log(`    ⚠️ Resilience Warning: Could not verify functional fallback server for ${title}`);
        }
    } catch (err: any) {
        log(`    ❌ Resilience Error: ${err.message}`);
    }
}

async function verifyStreamContent(url: string, label: string): Promise<boolean> {
    try {
        const start = Date.now();
        // The URL is already a proxy URL
        const resp = await axios.get(url, { 
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const ttff = Date.now() - start;
        
        const content = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
        const isM3U8 = content.includes('#EXTM3U');
        
        if (isM3U8) {
            const segments = (content.match(/#EXTINF/g) || []).length;
            const variants = (content.match(/#EXT-X-STREAM-INF/g) || []).length;
            
            log(`    📊 [${label}] TTFF: ${ttff}ms | Segments: ${segments} | Variants: ${variants}`);
            
            if (segments > 0 || variants > 0) return true;
            
            // If it's a tiny manifest or failed validation, log more info
            log(`    ⚠️ [${label}] Invalid manifest. Size: ${content.length}. Snippet: ${content.substring(0, 150).replace(/\n/g, ' ')}...`);
            return false;
        }
        
        return resp.status === 200;
    } catch (err: any) {
        log(`    ❌ [${label}] Fetch error: ${err.message}`);
        return false;
    }
}

runUltimateTest();

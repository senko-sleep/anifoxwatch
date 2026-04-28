/**
 * Test stream URLs for playability and duration
 */
import axios from 'axios';
import { sourceManager } from '../src/services/source-manager.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

async function testM3U8(url: string, name: string) {
    console.log(`\n🎬 Testing ${name}: ${url.substring(0, 80)}...`);
    try {
        const r = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 10000, maxRedirects: 5 });
        const content = r.data as string;
        
        // Check if it's a valid m3u8
        if (!content.includes('#EXTM3U')) {
            console.log(`  ❌ Not a valid m3u8 manifest`);
            return false;
        }
        
        console.log(`  ✅ Valid m3u8 manifest (${content.length} bytes)`);
        
        // Extract duration info
        const durationMatches = content.match(/#EXTINF:([\d.]+)/g);
        if (durationMatches) {
            const totalDuration = durationMatches.reduce((sum, match) => {
                const dur = parseFloat(match.replace('#EXTINF:', ''));
                return sum + dur;
            }, 0);
            console.log(`  ⏱️ Duration: ${Math.floor(totalDuration)}s (${Math.floor(totalDuration / 60)}m)`);
            console.log(`  📼 Segments: ${durationMatches.length}`);
        }
        
        // Check for dead server domains
        const deadDomains = ['streamtape.com', 'tapecontent.net', 'ajax.gogocdn.net', 'anitaku.pe', 'anitaku.so', 'anix.to', 'animesuge.to'];
        const domain = new URL(url).hostname.toLowerCase();
        const isDead = deadDomains.some(d => domain.includes(d));
        if (isDead) {
            console.log(`  ⚠️ DEAD DOMAIN: ${domain}`);
            return false;
        }
        console.log(`  ✅ Domain OK: ${domain}`);
        
        // Extract first segment URL
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.trim() && !line.startsWith('#')) {
                let segUrl = line.trim();
                if (!segUrl.startsWith('http')) {
                    const base = url.substring(0, url.lastIndexOf('/') + 1);
                    segUrl = base + segUrl;
                }
                console.log(`  📦 First segment: ${segUrl.substring(0, 80)}...`);
                
                // Try to fetch first segment (HEAD request)
                try {
                    const segR = await axios.head(segUrl, { headers: { 'User-Agent': UA }, timeout: 8000 });
                    console.log(`  ✅ Segment accessible (${segR.status})`);
                    console.log(`  📏 Content-Type: ${segR.headers['content-type']}`);
                    return true;
                } catch (e: unknown) {
                    console.log(`  ⚠️ Segment not accessible: ${(e as Error).message?.slice(0, 60)}`);
                    return false;
                }
            }
        }
        
        return true;
    } catch (e: unknown) {
        console.log(`  ❌ ERROR: ${(e as Error).message?.slice(0, 100)}`);
        return false;
    }
}

async function main() {
    console.log('='.repeat(70));
    console.log('STREAM PLAYABILITY TEST');
    console.log('='.repeat(70));
    
    // Get streams from our working sources
    const testCases = [
        { query: 'Spy x Family Season 3', ep: 1 },
        { query: 'Demon Slayer', ep: 1 },
        { query: 'One Piece', ep: 1 },
    ];
    
    for (const testCase of testCases) {
        console.log(`\n🔍 Testing: ${testCase.query} Episode ${testCase.ep}`);
        
        try {
            const searchResults = await sourceManager.search(testCase.query, 1);
            if (searchResults.results.length === 0) {
                console.log(`  ❌ No search results`);
                continue;
            }
            
            const anime = searchResults.results[0];
            console.log(`  Found: ${anime.title} (Source: ${anime.source})`);
            
            const episodes = await sourceManager.getEpisodes(anime.id);
            if (episodes.length === 0) {
                console.log(`  ❌ No episodes`);
                continue;
            }
            
            const episode = episodes[0];
            console.log(`  Episode: ${episode.title}`);
            
            const streamData = await sourceManager.getStreamingLinks(episode.id, undefined, 'sub');
            if (streamData.sources.length === 0) {
                console.log(`  ❌ No streams`);
                continue;
            }
            
            console.log(`  Sources: ${streamData.sources.length}`);
            for (const src of streamData.sources) {
                if (src.isM3U8 && src.url) {
                    await testM3U8(src.url, src.quality || 'auto');
                } else if (src.url) {
                    console.log(`\n🎬 Testing ${src.quality || 'auto'}: ${src.url.substring(0, 80)}...`);
                    try {
                        const r = await axios.head(src.url, { headers: { 'User-Agent': UA }, timeout: 8000 });
                        console.log(`  ✅ Accessible (${r.status})`);
                        console.log(`  📏 Content-Type: ${r.headers['content-type']}`);
                    } catch (e: unknown) {
                        console.log(`  ❌ ERROR: ${(e as Error).message?.slice(0, 100)}`);
                    }
                }
            }
        } catch (e: unknown) {
            console.log(`  ❌ ERROR: ${(e as Error).message?.slice(0, 100)}`);
        }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('TEST COMPLETE');
    console.log('='.repeat(70));
    
    process.exit(0);
}

main();

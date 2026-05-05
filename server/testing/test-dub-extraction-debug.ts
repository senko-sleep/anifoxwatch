import axios from 'axios';
import * as cheerio from 'cheerio';

async function debugDubExtraction() {
    console.log('=== Debug Dub Page Extraction ===\n');
    
    const baseUrl = 'https://anitaku.to';
    
    // Test sub page
    console.log('1. Fetching SUB page: naruto-episode-1');
    try {
        const subResp = await axios.get(`${baseUrl}/naruto-episode-1`, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        console.log(`   Status: ${subResp.status}`);
        
        const $sub = cheerio.load(subResp.data);
        const subEmbeds: string[] = [];
        $sub('.anime_muti_link ul li a').each((_, el) => {
            const dataVideo = $sub(el).attr('data-video');
            if (dataVideo) subEmbeds.push(dataVideo);
        });
        console.log(`   Embed URLs found: ${subEmbeds.length}`);
        subEmbeds.forEach((url, i) => console.log(`     [${i}] ${url.substring(0, 100)}`));
    } catch (e) {
        console.log(`   Error: ${(e as Error).message}`);
    }
    
    // Test dub page
    console.log('\n2. Fetching DUB page: naruto-dub-episode-1');
    try {
        const dubResp = await axios.get(`${baseUrl}/naruto-dub-episode-1`, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        console.log(`   Status: ${dubResp.status}`);
        
        const $dub = cheerio.load(dubResp.data);
        const dubEmbeds: string[] = [];
        $dub('.anime_muti_link ul li a').each((_, el) => {
            const dataVideo = $dub(el).attr('data-video');
            if (dataVideo) dubEmbeds.push(dataVideo);
        });
        console.log(`   Embed URLs found: ${dubEmbeds.length}`);
        dubEmbeds.forEach((url, i) => console.log(`     [${i}] ${url.substring(0, 100)}`));
        
        // Try extracting m3u8 from first embed
        if (dubEmbeds.length > 0) {
            console.log('\n3. Extracting m3u8 from first dub embed...');
            const embedUrl = dubEmbeds[0].startsWith('http') ? dubEmbeds[0] : `https:${dubEmbeds[0]}`;
            try {
                const embedResp = await axios.get(embedUrl, {
                    timeout: 10000,
                    headers: { 
                        'User-Agent': 'Mozilla/5.0',
                        'Referer': baseUrl
                    },
                });
                const html = embedResp.data;
                const m3u8Matches = [...html.matchAll(/["']([^"']*\.m3u8[^"']*?)["']/g)]
                    .map(m => m[1])
                    .filter(u => u.startsWith('http'));
                console.log(`   m3u8 URLs found: ${m3u8Matches.length}`);
                m3u8Matches.forEach((url, i) => console.log(`     [${i}] ${url.substring(0, 100)}`));
            } catch (e) {
                console.log(`   Error: ${(e as Error).message}`);
            }
        }
    } catch (e) {
        console.log(`   Error: ${(e as Error).message}`);
    }
    
    console.log('\n=== Done ===');
}

debugDubExtraction()
    .then(() => process.exit(0))
    .catch(e => {
        console.error('Error:', e);
        process.exit(1);
    });

import { AllAnimeSource } from '../src/sources/allanime-source.js';
import axios from 'axios';

async function main() {
    const s = new AllAnimeSource();
    
    // Search for a popular long-running show
    const sr = await s.search('one piece');
    console.log('Search results:', sr.results.length);
    for (const r of sr.results.slice(0, 5)) {
        console.log(`  - ${r.id}: "${r.title}" (${r.episodes} eps)`);
    }
    
    // Pick the one with most episodes
    const best = sr.results.sort((a, b) => (b.episodes || 0) - (a.episodes || 0))[0];
    console.log('\nUsing:', best.id, best.title, '(' + best.episodes + ' eps)');
    
    const eps = await s.getEpisodes(best.id);
    console.log('Episodes fetched:', eps.length);
    if (eps.length === 0) { console.log('No episodes!'); process.exit(1); }
    
    // Try episode 1
    const ep1 = eps.find(e => e.number === 1) || eps[0];
    console.log('\nTesting episode:', ep1.id, 'number:', ep1.number);
    
    const stream = await s.getStreamingLinks(ep1.id);
    console.log('Stream sources:', stream.sources.length);
    for (const src of stream.sources) {
        console.log('  URL:', src.url?.slice(0, 120));
        console.log('  isM3U8:', src.isM3U8, 'quality:', src.quality);
    }
    
    if (stream.sources.length === 0) {
        // Debug the raw GQL response
        const withoutPrefix = ep1.id.replace(/^allanime-/, '');
        const lastDash = withoutPrefix.lastIndexOf('-');
        const showId = withoutPrefix.slice(0, lastDash);
        const epNum = withoutPrefix.slice(lastDash + 1);
        console.log('\n--- Debug GQL ---');
        console.log('showId:', showId, 'epNum:', epNum);
        
        const query = `{episode(showId:"${showId}",translationType:sub,episodeString:"${epNum}"){sourceUrls}}`;
        const resp = await axios.post('https://api.allanime.day/api', { query }, {
            headers: {
                'Content-Type': 'application/json',
                'Referer': 'https://allmanga.to/',
                'Origin': 'https://allmanga.to',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
            },
            timeout: 15000,
        });
        const data = resp.data?.data;
        console.log('Response keys:', Object.keys(data || {}));
        if (data?.tobeparsed) {
            console.log('Encrypted! tobeparsed length:', data.tobeparsed.length, '_m:', data._m);
        }
        if (data?.episode?.sourceUrls) {
            console.log('sourceUrls count:', data.episode.sourceUrls.length);
            for (const su of data.episode.sourceUrls.slice(0, 5)) {
                console.log('  sourceName:', su.sourceName, 'type:', su.type);
                const rawUrl = su.sourceUrl?.startsWith('--') 
                    ? decodeHex(su.sourceUrl.slice(2)) 
                    : su.sourceUrl;
                console.log('  url:', rawUrl?.slice(0, 100));
            }
        }
    }
    
    process.exit(0);
}

function decodeHex(hex: string): string {
    let result = '';
    for (let i = 0; i < hex.length - 1; i += 2) {
        result += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ 56);
    }
    return result;
}

main().catch(e => { console.error(e); process.exit(1); });

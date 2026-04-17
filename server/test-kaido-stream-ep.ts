import { KaidoSource } from './src/sources/kaido-source.js';

const src = new KaidoSource();

async function test() {
    const animeId = 'kaido-spy-x-family-part-2-18152';
    
    console.log('Getting episodes for:', animeId);
    const eps = await src.getEpisodes(animeId);
    console.log('Episodes:', eps.length);
    
    // Find episodes around 1-5
    const testEps = eps.filter(e => e.number >= 1 && e.number <= 5);
    console.log('Testing episodes:', testEps.map(e => e.number).join(', '));
    
    for (const ep of testEps) {
        console.log(`\n--- Episode ${ep.number} (${ep.id}) ---`);
        
        // Try streaming
        try {
            const stream = await src.getStreamingLinks(ep.id, 'hd-1', 'sub');
            console.log('Sources:', stream.sources?.length);
            if (stream.sources?.[0]) {
                console.log('First source:', stream.sources[0].url.substring(0, 80));
            }
        } catch (e) {
            console.log('Stream error:', e.message);
        }
    }
}

test().catch(e => console.error('Error:', e.message));

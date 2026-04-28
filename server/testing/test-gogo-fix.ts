import { GogoanimeSource } from '../src/sources/gogoanime-source.js';

async function main() {
    const s = new GogoanimeSource();
    
    console.log('1. Health check...');
    const health = await s.healthCheck();
    console.log('   Health:', health);
    
    console.log('\n2. Search "one piece"...');
    const sr = await s.search('one piece');
    console.log('   Results:', sr.results.length);
    if (sr.results.length > 0) {
        console.log('   First:', sr.results[0].id, sr.results[0].title);
    }
    
    console.log('\n3. Get episodes...');
    if (sr.results.length > 0) {
        const eps = await s.getEpisodes(sr.results[0].id);
        console.log('   Episodes:', eps.length);
        if (eps.length > 0) {
            console.log('   First ep:', eps[0].id, eps[0].number);
            
            console.log('\n4. Get streaming links...');
            const stream = await s.getStreamingLinks(eps[0].id);
            console.log('   Sources:', stream.sources.length);
            for (const src of stream.sources) {
                console.log('   URL:', src.url?.slice(0, 120));
                console.log('   isM3U8:', src.isM3U8, 'quality:', src.quality);
            }
            if (stream.subtitles?.length) {
                console.log('   Subtitles:', stream.subtitles.length);
            }
        }
    }
    
    // Also try a direct ep URL for "naruto-episode-1"
    console.log('\n5. Direct stream test "naruto-episode-1"...');
    const directStream = await s.getStreamingLinks('naruto-episode-1');
    console.log('   Sources:', directStream.sources.length);
    for (const src of directStream.sources) {
        console.log('   URL:', src.url?.slice(0, 120));
        console.log('   isM3U8:', src.isM3U8);
    }
    
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

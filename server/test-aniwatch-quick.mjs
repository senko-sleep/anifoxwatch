import { HiAnime } from 'aniwatch';

const scraper = new HiAnime.Scraper();

try {
    console.log('Testing getEpisodeServers...');
    const servers = await scraper.getEpisodeServers('spy-x-family-season-3-19931?ep=145526');
    console.log('SERVERS:', JSON.stringify(servers));
    
    console.log('\nTesting hd-1/sub...');
    const src = await scraper.getEpisodeSources('spy-x-family-season-3-19931?ep=145526', 'hd-1', 'sub');
    console.log('SOURCES:', src.sources?.length, 'urls');
    if (src.sources?.length) console.log('FIRST URL:', src.sources[0].url);
} catch(e) {
    console.error('FAILED:', e.message);
}
process.exit(0);

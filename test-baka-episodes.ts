import { AnimeKaiSource } from './server/src/sources/animekai-source.js';

async function main() {
    console.log('Testing episodes for animekai-baka-to-test-to-shoukanjuu-q5nq');
    const source = new AnimeKaiSource();
    
    // First we must test if it returns dub
    const eps = await source.getEpisodes('animekai-baka-to-test-to-shoukanjuu-q5nq');
    console.log(`Found ${eps.length} episodes.`);
    if (eps.length > 0) {
        console.log('Sample ep 4:', eps.find(e => e.number === 4));
        
        console.log('Testing streaming links for episode 4...');
        try {
            const ep4Id = eps.find(e => e.number === 4)?.id;
            if (ep4Id) {
                const dubLinks = await source.getStreamingLinks(ep4Id, undefined, 'dub');
                console.log('Dub links success:', !!dubLinks);
            }
        } catch (e) {
            console.error('Error fetching dub links:', e);
        }
    }
}

main().catch(console.error);

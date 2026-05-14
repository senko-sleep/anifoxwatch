import { AllAnimeSource } from '../server/src/sources/allanime-source.js';

async function run() {
    const src = new AllAnimeSource();
    
    console.log('Searching AllAnime for Re:Zero 4th season...');
    try {
        const results = await src.search('Re:Zero 4th season');
        console.log(JSON.stringify(results, null, 2));
    } catch (e: any) {
        console.log('Error:', e.message);
    }
}

run();

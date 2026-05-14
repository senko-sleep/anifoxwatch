import { sourceManager } from '../src/services/source-manager.js';

async function debugGetAnime() {
    const id = 'anilist-269';
    console.log(`--- Debugging getAnime for "${id}" ---`);
    try {
        const anime = await sourceManager.getAnime(id);
        if (anime) {
            console.log(`Title: ${anime.title}`);
            console.log(`Streaming ID: ${anime.streamingId || 'None'}`);
            console.log(`Episodes: ${anime.episodes?.length || 0}`);
        } else {
            console.log('Anime not found');
        }
    } catch (err: any) {
        console.error(`getAnime error: ${err.message}`);
    }
}

debugGetAnime();

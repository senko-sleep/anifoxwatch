import { sourceManager } from '../src/services/source-manager.js';

async function run() {
    const id = 'animekai-baka-to-test-to-shoukanjuu-q5nq';
    console.log(`Getting anime for ${id}...`);
    const anime = await sourceManager.getAnime(id);
    console.log(`Result:`, anime ? anime.title : 'null');
}
run();


import { anilistService } from '../server/src/services/anilist-service.js';

async function test() {
    const id = 189046;
    const data = await anilistService.getAnimeById(id);
    console.log(`Title English: ${data.titleEnglish}`);
    console.log(`Title Romaji: ${data.titleRomaji}`);
    console.log(`Type: ${data.type}`);
    console.log(`Episodes: ${data.episodes}`);
}

test().catch(console.error);

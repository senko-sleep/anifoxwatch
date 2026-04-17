/** Run: npx tsx testing/quick-aniwatch-npm.ts */
import { HiAnime } from 'aniwatch';

async function main() {
    const scraper = new HiAnime.Scraper();
    const q = 'dandadan-season-2-3?ep=362742';
    console.log('trying', q);
    try {
        const data = await scraper.getEpisodeSources(q, 'hd-1', 'sub');
        console.log('sources', data.sources?.length, data.sources?.[0]);
    } catch (e: any) {
        console.log('fail', e.message);
    }
}

main();

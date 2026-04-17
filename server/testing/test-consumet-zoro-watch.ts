/** Consumet public API — zoro watch with encoded aniwatch id. Run: npx tsx testing/test-consumet-zoro-watch.ts */
import axios from 'axios';

const base = 'https://api.consumet.org/anime/zoro';
/** Episode 1 on HiAnime (?ep= is internal id from episode list, not "1"). */
const ep = 'spy-x-family-season-3-19931?ep=145526';

async function main() {
    const url = `${base}/watch/${encodeURIComponent(ep)}`;
    console.log('GET', url);
    const res = await axios.get(url, { timeout: 20000, validateStatus: () => true });
    console.log('status', res.status);
    const src = res.data?.sources?.[0];
    console.log('first source', src?.url?.slice(0, 100), src?.quality);
}

main().catch((e) => console.error(e));

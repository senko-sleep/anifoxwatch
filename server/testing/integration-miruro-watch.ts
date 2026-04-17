/**
 * End-to-end Miruro streaming (aniwatch + consumet + optional Puppeteer).
 * Run: npx tsx testing/integration-miruro-watch.ts
 * Default uses HiAnime episode 1 (?ep= is the site’s internal id, not the display number).
 */
import { MiruroSource } from '../src/sources/miruro-source.js';

async function main() {
    const src = new MiruroSource();
    const id = process.argv[2] || 'spy-x-family-season-3-19931?ep=145526';
    console.log('episodeId:', id);
    const t0 = Date.now();
    const data = await src.getStreamingLinks(id, undefined, 'sub');
    console.log('ms:', Date.now() - t0);
    console.log('sources:', data.sources?.length, data.sources?.[0]?.url?.slice(0, 100));
    process.exit(data.sources?.length ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

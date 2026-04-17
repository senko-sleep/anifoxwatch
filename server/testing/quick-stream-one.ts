/**
 * Minimal consumet smoke test (no SourceManager queue / Puppeteer).
 * Run: npx tsx testing/quick-stream-one.ts
 */
import { ANIME } from '@consumet/extensions';

async function main() {
    const gogo = new ANIME.Gogoanime();
    console.log('Gogo search naruto...');
    const search = await gogo.search('one piece', 1);
    console.log('first:', search.results?.[0]?.id, search.results?.[0]?.title);
    if (!search.results?.[0]?.id) throw new Error('no search');
    const eps = await gogo.fetchAnimeInfo(search.results[0].id);
    const epId = eps.episodes?.[0]?.id;
    console.log('first ep id:', epId);
    if (!epId) throw new Error('no ep');
    const mod = await import('@consumet/extensions');
    const data = await gogo.fetchEpisodeSources(epId, mod.StreamingServers.GogoCDN, mod.SubOrSub.SUB);
    console.log('sources:', data.sources?.length, data.sources?.[0]?.url?.slice(0, 80));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

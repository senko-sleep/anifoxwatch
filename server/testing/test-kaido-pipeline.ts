/**
 * End-to-end: search -> episodes -> streaming (all servers + fallbacks).
 * Run: npx tsx server/testing/test-kaido-pipeline.ts
 */
import { sourceManager } from '../src/services/source-manager.js';

const QUERY = 'solo leveling';

async function main() {
    const totalStart = Date.now();

    console.log('1) Search:', QUERY);
    const search = await sourceManager.search(QUERY, 1);
    if (!search.results?.length) {
        console.error('FAIL: no search results');
        process.exit(1);
    }

    const candidates = search.results.slice(0, 5);
    for (const anime of candidates) {
        console.log(`\n2) Try anime: ${anime.title} (${anime.id})`);
        const eps = await sourceManager.getEpisodes(anime.id);
        if (!eps.length) {
            console.log('   (no episodes, skip)');
            continue;
        }

        const ep = eps[0];
        console.log(`   Episode: ${ep.id}`);

        for (const server of ['hd-1', 'hd-2']) {
            const start = Date.now();
            console.log(`\n3) Trying server: ${server}`);
            try {
                const stream = await sourceManager.getStreamingLinks(ep.id, server, 'sub');
                const elapsed = Date.now() - start;
                if (stream.sources?.length) {
                    console.log(`\n   === STREAM FOUND (${server}) in ${elapsed}ms ===`);
                    console.log(`   Sources: ${stream.sources.length}`);
                    for (const src of stream.sources) {
                        console.log(`     URL: ${src.url.substring(0, 100)}...`);
                        console.log(`     Quality: ${src.quality}, M3U8: ${src.isM3U8}`);
                    }
                    console.log(`   Subtitles: ${stream.subtitles?.length || 0}`);
                    console.log(`   Source provider: ${stream.source || 'unknown'}`);
                    console.log(`   Total time: ${Date.now() - totalStart}ms`);
                    process.exit(0);
                }
                console.log(`   No sources from ${server} (${elapsed}ms)`);
            } catch (e) {
                console.log(`   Error on ${server}: ${(e as Error).message?.substring(0, 100)}`);
            }
        }

        // Try with default (no server specified -- lets Kaido try all servers)
        const start = Date.now();
        console.log('\n4) Trying default (multi-server fallback)');
        try {
            const stream = await sourceManager.getStreamingLinks(ep.id, undefined, 'sub');
            const elapsed = Date.now() - start;
            if (stream.sources?.length) {
                console.log(`\n   === STREAM FOUND (default) in ${elapsed}ms ===`);
                console.log(`   Sources: ${stream.sources.length}`);
                for (const src of stream.sources) {
                    console.log(`     URL: ${src.url.substring(0, 100)}...`);
                    console.log(`     Quality: ${src.quality}, M3U8: ${src.isM3U8}`);
                }
                console.log(`   Subtitles: ${stream.subtitles?.length || 0}`);
                console.log(`   Source provider: ${stream.source || 'unknown'}`);
                console.log(`   Total time: ${Date.now() - totalStart}ms`);
                process.exit(0);
            }
            console.log(`   No sources from default (${elapsed}ms)`);
        } catch (e) {
            console.log(`   Error: ${(e as Error).message?.substring(0, 100)}`);
        }
    }

    console.error(`\nFAIL: no stream URLs after trying ${candidates.length} titles`);
    console.log(`Total time: ${Date.now() - totalStart}ms`);
    process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

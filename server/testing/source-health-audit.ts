/**
 * Source Health Audit — tests every registered source for:
 *   1. healthCheck()
 *   2. search("naruto")
 *   3. getStreamingLinks() with a real episode (if search succeeds)
 *
 * Run:  cd server && npx tsx testing/source-health-audit.ts
 */

import {
    AnimeFLVSource,
    AnimeKaiSource,
    AnimePaheDirectSource,
    NineAnimeSource,
    ConsumetSource,
    GogoanimeSource,
    AllAnimeSource,
    MiruroSource,
    KaidoSource,
    ZoroSource,
    AniwaveSource,
    AnixSource,
    DirectDownloadSource,
    KickassAnimeSource,
    YugenAnimeSource,
    AnimeSugeSource,
} from '../src/sources/index.js';

const TIMEOUT = 12_000;

interface SourceResult {
    name: string;
    health: boolean | 'timeout' | 'error';
    healthMs: number;
    searchCount: number | 'timeout' | 'error';
    searchMs: number;
    streamSources: number | 'skip' | 'timeout' | 'error';
    streamMs: number;
    streamUrl?: string;
    errors: string[];
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)),
    ]);
}

async function testSource(source: any): Promise<SourceResult> {
    const result: SourceResult = {
        name: source.name,
        health: false,
        healthMs: 0,
        searchCount: 0,
        searchMs: 0,
        streamSources: 'skip',
        streamMs: 0,
        errors: [],
    };

    // 1. Health check
    const t0 = Date.now();
    try {
        result.health = await withTimeout(source.healthCheck(), TIMEOUT, 'healthCheck');
        result.healthMs = Date.now() - t0;
    } catch (e: any) {
        result.healthMs = Date.now() - t0;
        result.health = e.message?.includes('timeout') ? 'timeout' : 'error';
        result.errors.push(`health: ${e.message?.slice(0, 100)}`);
    }

    // 2. Search
    const t1 = Date.now();
    let episodes: any[] = [];
    let animeId = '';
    try {
        const searchResult = await withTimeout(source.search('naruto', 1), TIMEOUT, 'search');
        result.searchMs = Date.now() - t1;
        result.searchCount = searchResult?.results?.length ?? 0;

        if (searchResult?.results?.length > 0) {
            animeId = searchResult.results[0].id;
            // Try to get episodes for streaming test
            if (source.getEpisodes) {
                try {
                    episodes = await withTimeout(source.getEpisodes(animeId), TIMEOUT, 'getEpisodes');
                } catch { /* ignore */ }
            }
        }
    } catch (e: any) {
        result.searchMs = Date.now() - t1;
        result.searchCount = e.message?.includes('timeout') ? 'timeout' : 'error';
        result.errors.push(`search: ${e.message?.slice(0, 100)}`);
    }

    // 3. Streaming (only if we found episodes and source supports it)
    if (source.getStreamingLinks && episodes.length > 0) {
        const ep = episodes[0];
        const t2 = Date.now();
        try {
            const streamData = await withTimeout(
                source.getStreamingLinks(ep.id, undefined, 'sub'),
                TIMEOUT,
                'getStreamingLinks'
            );
            result.streamMs = Date.now() - t2;
            result.streamSources = streamData?.sources?.length ?? 0;
            if (streamData?.sources?.[0]?.url) {
                result.streamUrl = streamData.sources[0].url.slice(0, 80);
            }
        } catch (e: any) {
            result.streamMs = Date.now() - t2;
            result.streamSources = e.message?.includes('timeout') ? 'timeout' : 'error';
            result.errors.push(`stream: ${e.message?.slice(0, 100)}`);
        }
    }

    return result;
}

async function main() {
    console.log('=== Source Health Audit ===\n');

    const sources = [
        new AnimeFLVSource(),
        new AnimeKaiSource(),
        new AnimePaheDirectSource(),
        new NineAnimeSource(),
        new ConsumetSource(process.env.CONSUMET_API_URL || 'https://api.consumet.org', 'gogoanime'),
        new GogoanimeSource(),
        new AllAnimeSource(),
        new MiruroSource(),
        new KaidoSource(),
        new ZoroSource(),
        new AniwaveSource(),
        new AnixSource(),
        new DirectDownloadSource(),
        new KickassAnimeSource(),
        new YugenAnimeSource(),
        new AnimeSugeSource(),
    ];

    const results: SourceResult[] = [];

    for (const source of sources) {
        process.stdout.write(`Testing ${source.name}... `);
        const r = await testSource(source);
        results.push(r);

        const healthIcon = r.health === true ? '✅' : r.health === 'timeout' ? '⏱️' : '❌';
        const searchIcon = typeof r.searchCount === 'number' && r.searchCount > 0 ? '✅' : '❌';
        const streamIcon = typeof r.streamSources === 'number' && r.streamSources > 0 ? '✅' :
            r.streamSources === 'skip' ? '⏭️' : '❌';

        console.log(`${healthIcon} health(${r.healthMs}ms) ${searchIcon} search(${r.searchCount}, ${r.searchMs}ms) ${streamIcon} stream(${r.streamSources}, ${r.streamMs}ms)`);
        if (r.errors.length) {
            for (const err of r.errors) console.log(`   ⚠️  ${err}`);
        }
        if (r.streamUrl) console.log(`   🔗 ${r.streamUrl}`);
    }

    console.log('\n=== SUMMARY ===\n');

    const working = results.filter(r =>
        r.health === true &&
        (typeof r.searchCount === 'number' && r.searchCount > 0)
    );
    const streaming = results.filter(r =>
        typeof r.streamSources === 'number' && r.streamSources > 0
    );
    const dead = results.filter(r =>
        r.health !== true ||
        (typeof r.searchCount !== 'number' || r.searchCount === 0)
    );

    console.log(`Working (health+search): ${working.map(r => r.name).join(', ') || 'NONE'}`);
    console.log(`Streaming confirmed:     ${streaming.map(r => r.name).join(', ') || 'NONE'}`);
    console.log(`Dead/broken:             ${dead.map(r => r.name).join(', ') || 'NONE'}`);
    console.log(`\nTotal: ${results.length} sources, ${working.length} working, ${streaming.length} streaming, ${dead.length} dead`);

    // Output JSON for programmatic use
    const jsonPath = new URL('./source-health-results.json', import.meta.url).pathname;
    const fs = await import('fs');
    fs.writeFileSync(
        jsonPath.startsWith('/') && process.platform === 'win32' ? jsonPath.slice(1) : jsonPath,
        JSON.stringify(results, null, 2)
    );
    console.log(`\nResults saved to ${jsonPath}`);

    process.exit(0);
}

main().catch((e) => {
    console.error('Audit failed:', e);
    process.exit(1);
});

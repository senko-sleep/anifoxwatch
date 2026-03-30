/**
 * Test 5 popular anime — search → episodes → stream → verify HLS + measure duration
 * Run: npx tsx server/testing/test-5-anime-streams.ts
 */

import axios from 'axios';

const ANIME_LIST = [
    'Spy x Family Season 3',
    'One Piece',
    'Jujutsu Kaisen',
    'Demon Slayer Kimetsu no Yaiba',
    'Solo Leveling',
];

interface Result {
    query: string;
    found: boolean;
    title: string;
    episodes: number;
    streamOk: boolean;
    hlsValid: boolean;
    variants: number;
    subtitles: number;
    durationMs: number;
    error?: string;
}

async function testAnime(query: string): Promise<Result> {
    const start = Date.now();
    const res: Result = {
        query, found: false, title: '', episodes: 0,
        streamOk: false, hlsValid: false, variants: 0, subtitles: 0, durationMs: 0,
    };
    try {
        const mod = await import('@consumet/extensions');
        const provider = new mod.ANIME.AnimeKai();

        const searchData = await Promise.race([
            provider.search(query),
            new Promise<never>((_, r) => setTimeout(() => r(new Error('search timeout')), 12000)),
        ]);
        const results = searchData.results || [];
        if (results.length === 0) { res.error = 'No search results'; res.durationMs = Date.now() - start; return res; }

        const pattern = query.toLowerCase().split(' ').slice(0, 2).join('.*');
        const best = results.find((r: any) => new RegExp(pattern, 'i').test(r.title || '')) || results[0];
        res.found = true;
        res.title = (best as any).title || '';

        const info = await Promise.race([
            provider.fetchAnimeInfo((best as any).id),
            new Promise<never>((_, r) => setTimeout(() => r(new Error('info timeout')), 12000)),
        ]);
        const episodes = (info as any).episodes || [];
        res.episodes = episodes.length;
        if (episodes.length === 0) { res.error = 'No episodes'; res.durationMs = Date.now() - start; return res; }

        // Try multiple servers if needed
        let sources: any[] = [];
        let subtitles: any[] = [];
        for (const srv of [undefined, 'megacloud', 'vidcloud']) {
            try {
                const data = await Promise.race([
                    provider.fetchEpisodeSources(episodes[0].id, srv as any, mod.SubOrSub.SUB),
                    new Promise<never>((_, r) => setTimeout(() => r(new Error('stream timeout')), 12000)),
                ]);
                sources = (data as any).sources || [];
                subtitles = (data as any).subtitles || [];
                if (sources.length > 0) break;
            } catch {}
        }
        res.subtitles = subtitles.length;
        if (sources.length === 0) { res.error = 'No sources'; res.durationMs = Date.now() - start; return res; }
        res.streamOk = true;

        const hlsUrl = sources[0].url;
        try {
            const hlsRes = await axios.get(hlsUrl, {
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://megacloud.blog/' },
            });
            res.hlsValid = hlsRes.data.includes('#EXTM3U');
            res.variants = (hlsRes.data.match(/#EXT-X-STREAM-INF/g) || []).length;
        } catch {
            // Some CDNs block direct GET but work through proxy — mark as stream-ok
            res.hlsValid = false;
        }
    } catch (e: any) {
        res.error = e.message?.substring(0, 80);
    }
    res.durationMs = Date.now() - start;
    return res;
}

async function main() {
    console.log('\n' + '='.repeat(75));
    console.log('  5-ANIME STREAM TEST — AnimeKai Provider');
    console.log('='.repeat(75) + '\n');

    const totalStart = Date.now();
    const results: Result[] = [];

    for (const query of ANIME_LIST) {
        process.stdout.write(`  Testing "${query}"...`);
        const r = await testAnime(query);
        results.push(r);

        const icon = r.hlsValid ? 'OK' : r.streamOk ? '~~' : 'XX';
        console.log(` [${icon}] ${r.durationMs}ms | ${r.title} | ${r.episodes}eps | ${r.variants} variants | ${r.subtitles} subs${r.error ? ` | ERR: ${r.error}` : ''}`);
    }

    const totalMs = Date.now() - totalStart;
    const working = results.filter(r => r.hlsValid);
    const avgMs = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length);

    console.log('\n' + '='.repeat(75));
    console.log(`  RESULTS: ${working.length}/${results.length} fully working | Total: ${totalMs}ms | Avg: ${avgMs}ms`);
    console.log('='.repeat(75));

    for (const r of results) {
        console.log(`  ${r.hlsValid ? '[OK]' : '[XX]'} ${r.query.padEnd(30)} ${r.durationMs}ms  ${r.episodes}eps  ${r.variants}var  ${r.subtitles}subs`);
    }
    console.log('');

    process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

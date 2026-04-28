/**
 * Test which @consumet/extensions providers actually work
 */
import { ANIME } from '@consumet/extensions';

async function testProvider(name: string, provider: any) {
    process.stdout.write(`Testing ${name}... `);
    try {
        const results = await Promise.race([
            provider.search('naruto'),
            new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
        ]);
        const count = results?.results?.length || 0;
        if (count > 0) {
            const first = results.results[0];
            console.log(`✅ search: ${count} results (first: "${first.title}" id: ${first.id})`);
            
            // Try getting episodes
            try {
                const eps = await Promise.race([
                    provider.fetchAnimeInfo(first.id),
                    new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
                ]);
                const epCount = eps?.episodes?.length || 0;
                console.log(`   Episodes: ${epCount}`);
                
                if (epCount > 0) {
                    // Try streaming
                    const ep = eps.episodes[0];
                    try {
                        const stream = await Promise.race([
                            provider.fetchEpisodeSources(ep.id),
                            new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 15000)),
                        ]);
                        const srcCount = stream?.sources?.length || 0;
                        if (srcCount > 0) {
                            console.log(`   ✅ STREAMING: ${srcCount} sources! URL: ${stream.sources[0].url?.slice(0, 80)}`);
                        } else {
                            console.log(`   ❌ STREAMING: 0 sources`);
                        }
                    } catch (e: any) {
                        console.log(`   ❌ STREAMING error: ${e.message?.slice(0, 80)}`);
                    }
                }
            } catch (e: any) {
                console.log(`   ❌ Episodes error: ${e.message?.slice(0, 80)}`);
            }
        } else {
            console.log(`❌ search: 0 results`);
        }
    } catch (e: any) {
        console.log(`❌ error: ${e.message?.slice(0, 100)}`);
    }
}

async function main() {
    console.log('=== Consumet Provider Audit ===\n');
    
    // Test all available ANIME providers
    const providers: [string, any][] = [];
    
    try { providers.push(['Gogoanime', new ANIME.Gogoanime()]); } catch {}
    try { providers.push(['AnimePahe', new ANIME.AnimePahe()]); } catch {}
    try { 
        const h = new ANIME.Hianime();
        (h as any).baseUrl = 'https://aniwatchtv.to';
        providers.push(['Hianime', h]); 
    } catch {}
    try { providers.push(['NineAnime', new (ANIME as any).NineAnime()]); } catch {}
    try { providers.push(['Zoro', new (ANIME as any).Zoro()]); } catch {}
    try { providers.push(['AnimeFox', new (ANIME as any).AnimeFox()]); } catch {}
    try { providers.push(['AnimeSaturn', new (ANIME as any).AnimeSaturn()]); } catch {}
    try { providers.push(['Anify', new (ANIME as any).Anify()]); } catch {}
    try { providers.push(['Bilibili', new (ANIME as any).Bilibili()]); } catch {}
    try { providers.push(['Crunchyroll', new (ANIME as any).Crunchyroll()]); } catch {}
    try { providers.push(['Marin', new (ANIME as any).Marin()]); } catch {}
    try { providers.push(['AnimeKai', new ANIME.AnimeKai()]); } catch {}
    
    console.log(`Found ${providers.length} providers: ${providers.map(p => p[0]).join(', ')}\n`);
    
    for (const [name, provider] of providers) {
        await testProvider(name, provider);
        console.log();
    }
    
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

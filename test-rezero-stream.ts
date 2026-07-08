import { AniwavesSource } from './server/src/sources/aniwaves-source.js';

// Add timeout helper
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error(`${message} (timeout after ${ms}ms)`)), ms)
        )
    ]);
}

async function test() {
    const src = new AniwavesSource();
    
    // Test both potential matches - race them to see which loads first
    const candidates = [
        { name: 'Re:Zero Season 4 (correct)', id: 'aniwaves-re-zero-kara-hajimeru-isekai-seikatsu-4th-season-82570' },
        { name: 'Re:Zero Break Time Season 4', id: 'aniwaves-re-zero-kara-hajimeru-break-time-4th-season-82625' },
    ];
    
    console.log('Testing both Re:Zero Season 4 candidates (racing)...');
    
    const results = await Promise.allSettled(
        candidates.map(async (candidate) => {
            const start = Date.now();
            try {
                const episodes = await withTimeout(
                    src.getEpisodes(candidate.id),
                    15000,
                    `getEpisodes timeout for ${candidate.name}`
                );
                
                if (!episodes?.length) {
                    return { candidate, error: 'No episodes found', duration: Date.now() - start };
                }
                
                const ep11 = episodes.find(e => e.number === 11);
                if (!ep11) {
                    return { candidate, error: 'Episode 11 not found', duration: Date.now() - start, availableEpisodes: episodes.map(e => e.number) };
                }
                
                const streamData = await withTimeout(
                    src.getStreamingLinks(ep11.id),
                    20000,
                    `getStreamingLinks timeout for ${candidate.name}`
                );
                
                return { 
                    candidate, 
                    success: true, 
                    duration: Date.now() - start,
                    sources: streamData.sources.length,
                    firstSource: streamData.sources[0] || null
                };
            } catch (e: any) {
                return { candidate, error: e.message, duration: Date.now() - start };
            }
        })
    );
    
    console.log('\n=== RESULTS ===');
    results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
            const r = result.value;
            console.log(`\n${r.candidate.name} (${r.duration}ms):`);
            if (r.success) {
                console.log(`  ✅ SUCCESS - ${r.sources} sources`);
                if (r.firstSource) {
                    console.log(`  First: ${r.firstSource.quality} - ${r.firstSource.url.substring(0, 60)}...`);
                }
            } else {
                console.log(`  ❌ FAILED - ${r.error}`);
                if (r.availableEpisodes) {
                    console.log(`  Available episodes: ${r.availableEpisodes.join(', ')}`);
                }
            }
        }
    });
    
    // Find winner
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
    if (successful.length > 0) {
        const winner = successful.sort((a, b) => a.value.duration - b.value.duration)[0];
        console.log(`\n🏆 WINNER: ${winner.value.candidate.name} (${winner.value.duration}ms)`);
    }
}

test();

/**
 * Test Multiple Anime Streaming
 * Verifies streaming works across different anime
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

interface AnimeTest {
    name: string;
    animeId: string;
    episodeFound: boolean;
    subWorks: boolean;
    dubWorks: boolean;
    error?: string;
}

async function testAnime(name: string, searchQuery: string): Promise<AnimeTest> {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Testing: ${name}`);
    console.log('='.repeat(70));

    const result: AnimeTest = {
        name,
        animeId: '',
        episodeFound: false,
        subWorks: false,
        dubWorks: false
    };

    try {
        // Search for anime
        console.log(`\n📍 Searching for "${searchQuery}"...`);
        const searchRes = await axios.get(`${API_BASE}/anime/search`, {
            params: { q: searchQuery },
            timeout: 15000
        });

        const animes = searchRes.data?.results || [];
        if (animes.length === 0) {
            result.error = 'Anime not found';
            console.log('   ❌ No anime found');
            return result;
        }

        const anime = animes[0];
        result.animeId = anime.id;
        console.log(`   ✅ Found: ${anime.title} (${anime.id})`);

        // Get episodes
        console.log(`\n📍 Getting episodes...`);
        const episodesRes = await axios.get(`${API_BASE}/anime/${anime.id}/episodes`, {
            timeout: 15000
        });

        const episodes = episodesRes.data?.episodes || [];
        if (episodes.length === 0) {
            result.error = 'No episodes found';
            console.log('   ❌ No episodes');
            return result;
        }

        result.episodeFound = true;
        const episode = episodes[0];
        console.log(`   ✅ Found ${episodes.length} episodes, testing: ${episode.id}`);

        // Test SUB
        console.log(`\n📍 Testing SUB...`);
        try {
            const subRes = await axios.get(`${API_BASE}/stream/watch/${encodeURIComponent(episode.id)}`, {
                params: { category: 'sub' },
                timeout: 60000
            });

            if (subRes.data?.sources?.length > 0) {
                // Test proxy
                const proxyRes = await axios.get(subRes.data.sources[0].url, {
                    timeout: 15000,
                    validateStatus: () => true
                });

                result.subWorks = proxyRes.status === 200 && 
                                 typeof proxyRes.data === 'string' && 
                                 proxyRes.data.includes('#EXTM3U');
                
                console.log(`   ${result.subWorks ? '✅' : '❌'} SUB: ${result.subWorks ? 'Working' : 'Failed'}`);
            } else {
                console.log('   ❌ SUB: No sources');
            }
        } catch (e: any) {
            console.log(`   ❌ SUB Error: ${e.message}`);
        }

        // Test DUB
        console.log(`\n📍 Testing DUB...`);
        try {
            const dubRes = await axios.get(`${API_BASE}/stream/watch/${encodeURIComponent(episode.id)}`, {
                params: { category: 'dub' },
                timeout: 60000
            });

            if (dubRes.data?.sources?.length > 0) {
                // Test proxy
                const proxyRes = await axios.get(dubRes.data.sources[0].url, {
                    timeout: 15000,
                    validateStatus: () => true
                });

                result.dubWorks = proxyRes.status === 200 && 
                                 typeof proxyRes.data === 'string' && 
                                 proxyRes.data.includes('#EXTM3U');
                
                console.log(`   ${result.dubWorks ? '✅' : '❌'} DUB: ${result.dubWorks ? 'Working' : 'Failed'}`);
            } else {
                console.log('   ❌ DUB: No sources');
            }
        } catch (e: any) {
            console.log(`   ❌ DUB Error: ${e.message}`);
        }

    } catch (error: any) {
        result.error = error.message;
        console.log(`   ❌ Error: ${error.message}`);
    }

    return result;
}

async function main() {
    console.log('🎬 MULTIPLE ANIME STREAMING TEST');
    console.log('Testing various popular anime to ensure broad compatibility');

    const testCases = [
        { name: 'Spy x Family Part 2', query: 'spy family part 2' },
        { name: 'One Piece', query: 'one piece' },
        { name: 'Jujutsu Kaisen', query: 'jujutsu kaisen' },
    ];

    const results: AnimeTest[] = [];

    for (const test of testCases) {
        const result = await testAnime(test.name, test.query);
        results.push(result);
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(70));

    console.log('\n┌─────────────────────────────┬──────────┬───────┬───────┐');
    console.log('│ Anime                       │ Episodes │  SUB  │  DUB  │');
    console.log('├─────────────────────────────┼──────────┼───────┼───────┤');

    for (const r of results) {
        const name = r.name.padEnd(27).substring(0, 27);
        const eps = r.episodeFound ? '   ✅   ' : '   ❌   ';
        const sub = r.subWorks ? '  ✅  ' : '  ❌  ';
        const dub = r.dubWorks ? '  ✅  ' : '  ❌  ';
        console.log(`│ ${name} │${eps}│${sub}│${dub}│`);
    }

    console.log('└─────────────────────────────┴──────────┴───────┴───────┘');

    const subWorking = results.filter(r => r.subWorks).length;
    const dubWorking = results.filter(r => r.dubWorks).length;
    const total = results.length;

    console.log(`\n📊 Results: SUB ${subWorking}/${total} | DUB ${dubWorking}/${total}`);

    if (subWorking === total && dubWorking === total) {
        console.log('\n🎉 ALL TESTS PASSED!');
    } else if (subWorking === total) {
        console.log('\n✅ All SUB streams working, some DUB may not be available');
    }
}

main().catch(console.error);

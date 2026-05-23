import axios from 'axios';

/**
 * Debug test to understand the actual episode ID formats being used
 * and why certain episodes fail to fetch streaming links
 */

const API_BASE = 'http://localhost:3001';

async function debugEpisodeIds(animeId: string) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Debugging Episode IDs for: ${animeId}`);
    console.log('='.repeat(80));

    try {
        // Fetch episodes
        console.log('\n[1] Fetching episodes...');
        const resp = await axios.get(`${API_BASE}/api/episodes/${encodeURIComponent(animeId)}`);
        const episodes = resp.data.episodes || [];

        console.log(`Found ${episodes.length} episodes\n`);
        console.log('Episode ID Analysis:');
        console.log('-'.repeat(80));

        // Show episode ID format for first, middle, and last episodes
        const samples = [
            episodes[0],
            episodes[Math.floor(episodes.length / 2)],
            episodes[episodes.length - 1],
        ].filter(Boolean);

        for (const ep of samples) {
            console.log(`Episode ${ep.number}:`);
            console.log(`  ID: ${ep.id}`);
            console.log(`  ID length: ${ep.id.length}`);
            console.log(`  ID type: ${typeof ep.id}`);
            console.log(`  Has dub: ${ep.hasDub || 'false'}`);
            console.log(`  Title: ${ep.title || 'N/A'}`);
            console.log('');
        }

        // Now test streaming for each of these episodes
        console.log('-'.repeat(80));
        console.log('Testing Streaming Link Fetches:');
        console.log('-'.repeat(80));

        for (const ep of samples) {
            console.log(`\nEpisode ${ep.number}:`);
            console.log(`  Episode ID: ${ep.id}`);

            const encodedId = encodeURIComponent(ep.id);
            console.log(`  Encoded ID: ${encodedId}`);

            try {
                // Test without any query params
                console.log(`  [Test 1] Basic request...`);
                const resp1 = await axios.get(
                    `${API_BASE}/api/stream/watch/${encodedId}`,
                    { timeout: 10000 }
                );
                console.log(`    ✅ Success - ${resp1.data.sources?.length || 0} source(s)`);
            } catch (error: any) {
                console.log(`    ❌ Failed - ${error.response?.status || error.code}`);
                if (error.response?.data?.error) {
                    console.log(`       Error: ${error.response.data.error}`);
                }
            }

            try {
                // Test with category param
                console.log(`  [Test 2] With category=sub...`);
                const resp2 = await axios.get(
                    `${API_BASE}/api/stream/watch/${encodedId}`,
                    { params: { category: 'sub' }, timeout: 10000 }
                );
                console.log(`    ✅ Success - ${resp2.data.sources?.length || 0} source(s)`);
            } catch (error: any) {
                console.log(`    ❌ Failed - ${error.response?.status || error.code}`);
            }

            try {
                // Test with episode number
                console.log(`  [Test 3] With ep_num=${ep.number}...`);
                const resp3 = await axios.get(
                    `${API_BASE}/api/stream/watch/${encodedId}`,
                    { params: { category: 'sub', ep_num: ep.number }, timeout: 10000 }
                );
                console.log(`    ✅ Success - ${resp3.data.sources?.length || 0} source(s)`);
            } catch (error: any) {
                console.log(`    ❌ Failed - ${error.response?.status || error.code}`);
            }
        }

        // Compare episode ID patterns
        console.log('\n' + '-'.repeat(80));
        console.log('Episode ID Pattern Analysis:');
        console.log('-'.repeat(80));

        const idPatterns = new Map<string, number>();
        for (const ep of episodes) {
            const prefix = ep.id.split('-')[0];
            idPatterns.set(prefix, (idPatterns.get(prefix) || 0) + 1);
        }

        console.log('Episode ID Prefixes:');
        for (const [prefix, count] of idPatterns) {
            console.log(`  ${prefix}: ${count} episodes`);
        }

        // Check if all episodes have unique IDs
        const uniqueIds = new Set(episodes.map((e: any) => e.id));
        console.log(`\nUnique episode IDs: ${uniqueIds.size}/${episodes.length}`);

        if (uniqueIds.size !== episodes.length) {
            console.log('⚠️  WARNING: Duplicate episode IDs found!');
            const seen = new Set<string>();
            for (const ep of episodes) {
                if (seen.has(ep.id)) {
                    console.log(`   Duplicate: ${ep.id} (Episode ${ep.number})`);
                }
                seen.add(ep.id);
            }
        }

    } catch (error: any) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

async function main() {
    console.log('🔍 Episode ID Debug Test Suite');
    console.log(`API Base: ${API_BASE}\n`);

    // Test the problematic anime IDs
    await debugEpisodeIds('anilist-189046');
    await debugEpisodeIds('anilist-182205');

    console.log(`\n${'='.repeat(80)}`);
    console.log('Debug test complete!');
    console.log('='.repeat(80));
}

main().catch(console.error);

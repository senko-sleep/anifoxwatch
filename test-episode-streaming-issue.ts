import axios from 'axios';

/**
 * Test file to reproduce the episode streaming issue:
 * - Episode 1 works: https://anifoxwatch.web.app/watch?id=anilist-189046&ep=1
 * - Episode 4 doesn't work: https://anifoxwatch.web.app/watch?id=anilist-189046&ep=4
 * - Different anime doesn't work: https://anifoxwatch.web.app/watch?id=anilist-182205
 */

const API_BASE = 'http://localhost:3001';  // Change to your API base URL

interface Episode {
    id: string;
    number: number;
    title?: string;
    hasDub?: boolean;
}

interface StreamingData {
    sources: Array<{ url: string; quality: string }>;
    subtitles?: Array<{ url: string; lang: string }>;
    error?: string;
}

async function testAnimeEpisodes(animeId: string, title: string) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing Anime: ${title} (ID: ${animeId})`);
    console.log('='.repeat(80));

    try {
        // Step 1: Fetch anime details
        console.log(`\n[1] Fetching anime details...`);
        const animeResp = await axios.get(`${API_BASE}/api/anime/${encodeURIComponent(animeId)}`);
        const anime = animeResp.data;
        console.log(`✅ Title: ${anime.title}`);
        console.log(`   Episodes: ${anime.episodeCount || 'Unknown'}`);
        console.log(`   Dub Count: ${anime.dubCount || 0}`);

        // Step 2: Fetch episodes
        console.log(`\n[2] Fetching episodes...`);
        const episodesResp = await axios.get(`${API_BASE}/api/episodes/${encodeURIComponent(animeId)}`);
        const episodes: Episode[] = episodesResp.data.episodes || [];
        console.log(`✅ Found ${episodes.length} episodes`);

        if (episodes.length === 0) {
            console.log('⚠️  No episodes found!');
            return;
        }

        // Show first few and last few episodes
        const toTest = [
            episodes[0],
            episodes[Math.min(1, episodes.length - 1)],
            episodes[Math.min(3, episodes.length - 1)],
            episodes[episodes.length - 1],
        ].filter((v, i, a) => a.indexOf(v) === i);

        // Step 3: Test streaming for each episode
        console.log(`\n[3] Testing streaming links for selected episodes...`);
        for (const episode of toTest) {
            console.log(`\n   Episode ${episode.number} (ID: ${episode.id})`);

            // Test with sub
            try {
                const streamResp = await axios.get(
                    `${API_BASE}/api/stream/watch/${encodeURIComponent(episode.id)}`,
                    { params: { category: 'sub', ep_num: episode.number } }
                );
                const streamData: StreamingData = streamResp.data;
                if (streamData.sources && streamData.sources.length > 0) {
                    console.log(`   ✅ SUB: ${streamData.sources.length} source(s) found`);
                    console.log(`      First source quality: ${streamData.sources[0].quality}`);
                    console.log(`      Source provider: ${streamData.source || 'unknown'}`);
                } else {
                    console.log(`   ❌ SUB: No sources found`);
                    console.log(`      Error: ${streamData.error || 'Unknown error'}`);
                }
            } catch (error: any) {
                console.log(`   ❌ SUB: Request failed - ${error.response?.status || error.message}`);
                if (error.response?.data?.error) {
                    console.log(`      ${error.response.data.error}`);
                }
            }

            // Test with dub
            try {
                const streamResp = await axios.get(
                    `${API_BASE}/api/stream/watch/${encodeURIComponent(episode.id)}`,
                    { params: { category: 'dub', ep_num: episode.number } }
                );
                const streamData: StreamingData = streamResp.data;
                if (streamData.sources && streamData.sources.length > 0) {
                    console.log(`   ✅ DUB: ${streamData.sources.length} source(s) found`);
                } else {
                    console.log(`   ⚠️  DUB: No sources found`);
                }
            } catch (error: any) {
                console.log(`   ⚠️  DUB: Request failed - ${error.response?.status || error.message}`);
            }
        }
    } catch (error: any) {
        console.error(`❌ Test failed:`, error.response?.data || error.message);
    }
}

async function main() {
    console.log('🎬 Episode Streaming Issue Test Suite');
    console.log(`API Base: ${API_BASE}`);

    // Test cases from user report
    await testAnimeEpisodes('anilist-189046', 'Anime 189046 (Works on ep=1)');
    await testAnimeEpisodes('anilist-182205', 'Anime 182205 (Doesn\'t work)');

    console.log(`\n${'='.repeat(80)}`);
    console.log('Test complete!');
    console.log('='.repeat(80));
}

main().catch(console.error);

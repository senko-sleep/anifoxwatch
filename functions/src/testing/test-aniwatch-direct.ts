/**
 * Direct test of the aniwatch package for deep scraping
 * This bypasses external APIs and scrapes directly from the source
 */

import { HiAnime } from 'aniwatch';

const scraper = new HiAnime.Scraper();

async function testDirectScraping() {
    console.log('='.repeat(60));
    console.log('DIRECT ANIWATCH PACKAGE TEST');
    console.log('='.repeat(60));

    // Test 1: Search for anime
    console.log('\n📍 Test 1: Search for "Naruto"');
    try {
        const searchResults = await scraper.search('Naruto', 1);
        console.log(`   Found ${searchResults.animes?.length || 0} results`);
        if (searchResults.animes && searchResults.animes.length > 0) {
            const first = searchResults.animes[0];
            console.log(`   First result: ${first.name} (ID: ${first.id})`);
            console.log(`   Episodes: Sub=${first.episodes?.sub}, Dub=${first.episodes?.dub}`);
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 2: Get home page data
    console.log('\n📍 Test 2: Get Home Page');
    try {
        const home = await scraper.getHomePage();
        console.log(`   Trending: ${home.trendingAnimes?.length || 0}`);
        console.log(`   Spotlight: ${home.spotlightAnimes?.length || 0}`);
        console.log(`   Latest: ${home.latestEpisodeAnimes?.length || 0}`);
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 3: Get anime info
    console.log('\n📍 Test 3: Get Anime Info for "one-piece-100"');
    try {
        const info = await scraper.getInfo('one-piece-100');
        console.log(`   Title: ${info.anime?.info?.name}`);
        console.log(`   Episodes: Sub=${info.anime?.info?.stats?.episodes?.sub}, Dub=${info.anime?.info?.stats?.episodes?.dub}`);
        console.log(`   Status: ${info.anime?.moreInfo?.status}`);
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 4: Get episodes
    console.log('\n📍 Test 4: Get Episodes for "one-piece-100"');
    try {
        const episodes = await scraper.getEpisodes('one-piece-100');
        console.log(`   Total episodes: ${episodes.episodes?.length || 0}`);
        if (episodes.episodes && episodes.episodes.length > 0) {
            const firstEp = episodes.episodes[0];
            console.log(`   First episode: ${firstEp.title} (ID: ${firstEp.episodeId})`);
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 5: Get episode servers
    console.log('\n📍 Test 5: Get Episode Servers');
    try {
        // First get episodes to get a valid episode ID
        const episodes = await scraper.getEpisodes('one-piece-100');
        if (episodes.episodes && episodes.episodes.length > 0) {
            const episodeId = episodes.episodes[0].episodeId!;
            console.log(`   Using episode ID: ${episodeId}`);

            const servers = await scraper.getEpisodeServers(episodeId!);
            console.log(`   Sub servers: ${servers.sub?.length || 0}`);
            console.log(`   Dub servers: ${servers.dub?.length || 0}`);

            if (servers.sub && servers.sub.length > 0) {
                console.log(`   Sub servers available:`);
                servers.sub.forEach(s => {
                    console.log(`     - ${s.serverName}`);
                });
            }
            if (servers.dub && servers.dub.length > 0) {
                console.log(`   Dub servers available:`);
                servers.dub.forEach(s => {
                    console.log(`     - ${s.serverName}`);
                });
            }
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 6: Get streaming sources (THE CRITICAL TEST)
    console.log('\n📍 Test 6: Get Streaming Sources (CRITICAL)');
    try {
        const episodes = await scraper.getEpisodes('one-piece-100');
        if (episodes.episodes && episodes.episodes.length > 0) {
            const episodeId = episodes.episodes[0].episodeId;
            console.log(`   Getting sources for: ${episodeId}`);

            // Try different servers
            const servers = ['hd-1', 'hd-2', 'megacloud', 'streamsb', 'streamtape'] as const;

            for (const server of servers) {
                console.log(`\n   Trying server: ${server}`);
                try {
                    const sources = await scraper.getEpisodeSources(episodeId!, server as any, 'sub');
                    console.log(`   ✅ Sources found: ${sources.sources?.length || 0}`);
                    console.log(`   Subtitles: ${sources.subtitles?.length || 0}`);

                    if (sources.sources && sources.sources.length > 0) {
                        console.log(`   First source:`);
                        console.log(`     URL: ${sources.sources[0].url?.substring(0, 80)}...`);
                        console.log(`     Type: ${sources.sources[0].type}`);

                        // SUCCESS! We found working streams
                        console.log('\n   🎉 SUCCESS! Found working streaming URL!');
                        return { success: true, server, sources };
                    }
                } catch (serverError: any) {
                    console.log(`   ❌ Server ${server} failed: ${serverError.message}`);
                }
            }
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('TEST COMPLETED');
    console.log('='.repeat(60));
}

testDirectScraping().catch(console.error);

/**
 * Comprehensive Streaming Test for All 28 Sources
 * Tests actual video stream extraction and playback URLs
 */

import axios from 'axios';

const API_BASE = process.env.API_URL || 'http://localhost:3001';
const TIMEOUT = 30000;

// All 28 sources
const ALL_SOURCES = [
  'HiAnimeDirect', 'HiAnime', 'Zoro', 'AnimePahe', 'AnimeSuge', 'Kaido', 'Anix',
  'Gogoanime', '9Anime', 'Aniwave', 'Aniwatch', 'KickassAnime', 'YugenAnime',
  'AniMixPlay', 'AnimeFox', 'AnimeDAO', 'AnimeFLV', 'AnimeSaturn', 'Crunchyroll',
  'AnimeOnsen', 'Marin', 'AnimeHeaven', 'AnimeKisa', 'AnimeOwl', 'AnimeLand',
  'AnimeFreak', 'Consumet', 'WatchHentai'
];

const TEST_ANIME = 'naruto';

interface StreamTestResult {
  source: string;
  success: boolean;
  hasSearchResults: boolean;
  hasEpisodes: boolean;
  hasServers: boolean;
  hasStreamingLinks: boolean;
  streamDetails?: {
    sourcesCount: number;
    hasM3U8: boolean;
    hasMp4: boolean;
    qualities: string[];
    subtitlesCount: number;
  };
  errors: string[];
  duration: number;
}

async function testSourceStreaming(source: string): Promise<StreamTestResult> {
  const result: StreamTestResult = {
    source,
    success: false,
    hasSearchResults: false,
    hasEpisodes: false,
    hasServers: false,
    hasStreamingLinks: false,
    errors: [],
    duration: 0
  };

  const startTime = Date.now();

  try {
    console.log(`\n🔍 Testing ${source}...`);

    // Step 1: Search for anime
    console.log(`  1️⃣ Searching for "${TEST_ANIME}"...`);
    const searchResponse = await axios.get(`${API_BASE}/api/anime/search`, {
      params: { q: TEST_ANIME, source, page: 1 },
      timeout: TIMEOUT
    });

    const searchResults = searchResponse.data?.results || [];
    result.hasSearchResults = searchResults.length > 0;

    if (!result.hasSearchResults) {
      result.errors.push('No search results');
      console.log(`  ❌ No search results`);
      result.duration = Date.now() - startTime;
      return result;
    }

    const firstAnime = searchResults[0];
    console.log(`  ✅ Found: ${firstAnime.title} (${firstAnime.id})`);

    // Step 2: Get episodes
    console.log(`  2️⃣ Fetching episodes...`);
    const episodesResponse = await axios.get(`${API_BASE}/api/anime/${firstAnime.id}/episodes`, {
      timeout: TIMEOUT
    });

    const episodes = episodesResponse.data || [];
    result.hasEpisodes = episodes.length > 0;

    if (!result.hasEpisodes) {
      result.errors.push('No episodes found');
      console.log(`  ❌ No episodes`);
      result.duration = Date.now() - startTime;
      return result;
    }

    const firstEpisode = episodes[0];
    console.log(`  ✅ Found ${episodes.length} episodes, testing Episode ${firstEpisode.number}`);

    // Step 3: Get servers
    console.log(`  3️⃣ Fetching servers...`);
    const serversResponse = await axios.get(`${API_BASE}/api/stream/servers/${firstEpisode.id}`, {
      timeout: TIMEOUT
    });

    const servers = serversResponse.data?.servers || [];
    result.hasServers = servers.length > 0;

    if (!result.hasServers) {
      result.errors.push('No servers available');
      console.log(`  ⚠️ No servers, trying direct stream...`);
    } else {
      console.log(`  ✅ Found ${servers.length} servers: ${servers.map((s: { name: string }) => s.name).join(', ')}`);
    }

    // Step 4: Get streaming links
    console.log(`  4️⃣ Extracting streaming links...`);
    const streamParams: Record<string, string> = { episodeId: firstEpisode.id };
    if (servers.length > 0) {
      streamParams.server = servers[0].name;
    }

    const streamResponse = await axios.get(`${API_BASE}/api/stream/watch/${firstEpisode.id}`, {
      params: streamParams,
      timeout: TIMEOUT
    });

    const streamData = streamResponse.data;
    const sources = streamData?.sources || [];
    const subtitles = streamData?.subtitles || [];

    result.hasStreamingLinks = sources.length > 0;

    if (!result.hasStreamingLinks) {
      result.errors.push('No streaming links extracted');
      console.log(`  ❌ No streaming links`);
      result.duration = Date.now() - startTime;
      return result;
    }

    // Analyze stream details
    const hasM3U8 = sources.some((s: { isM3U8: boolean }) => s.isM3U8);
    const hasMp4 = sources.some((s: { isM3U8: boolean }) => !s.isM3U8);
    const qualities = [...new Set(sources.map((s: { quality: string }) => s.quality))];

    result.streamDetails = {
      sourcesCount: sources.length,
      hasM3U8,
      hasMp4,
      qualities,
      subtitlesCount: subtitles.length
    };

    console.log(`  ✅ Stream extracted successfully!`);
    console.log(`     • Sources: ${sources.length} (${hasM3U8 ? 'M3U8' : ''}${hasM3U8 && hasMp4 ? ', ' : ''}${hasMp4 ? 'MP4' : ''})`);
    console.log(`     • Qualities: ${qualities.join(', ')}`);
    console.log(`     • Subtitles: ${subtitles.length}`);
    console.log(`     • Sample URL: ${sources[0].url.substring(0, 60)}...`);

    // Verify URL is accessible
    try {
      const headResponse = await axios.head(sources[0].url, { 
        timeout: 5000,
        validateStatus: () => true 
      });
      if (headResponse.status < 400) {
        console.log(`     • URL verified: ${headResponse.status} ${headResponse.statusText}`);
      } else {
        console.log(`     • URL check: ${headResponse.status} (may need referer)`);
      }
    } catch {
      console.log(`     • URL check: Requires special headers/referer`);
    }

    result.success = true;

  } catch (error) {
    const err = error as { message?: string; response?: { status: number; data: unknown } };
    if (err.response) {
      result.errors.push(`API Error ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    } else {
      result.errors.push(err.message || 'Unknown error');
    }
    console.log(`  ❌ Error: ${result.errors[result.errors.length - 1]}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

async function runStreamingTests(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     COMPREHENSIVE STREAMING TEST - ALL 28 SOURCES            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nAPI: ${API_BASE}`);
  console.log(`Test Anime: "${TEST_ANIME}"`);
  console.log(`Total Sources: ${ALL_SOURCES.length}`);
  console.log('\nStarting tests...\n');

  const results: StreamTestResult[] = [];

  for (const source of ALL_SOURCES) {
    const result = await testSourceStreaming(source);
    results.push(result);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Generate Report
  console.log('\n' + '═'.repeat(70));
  console.log('📊 STREAMING TEST RESULTS');
  console.log('═'.repeat(70));

  const fullyWorking = results.filter(r => r.success && r.hasStreamingLinks);
  const partiallyWorking = results.filter(r => r.hasSearchResults && !r.hasStreamingLinks);
  const notWorking = results.filter(r => !r.hasSearchResults);

  console.log(`\n✅ Fully Working (${fullyWorking.length}/${ALL_SOURCES.length}):`);
  fullyWorking.forEach(r => {
    const streamInfo = r.streamDetails;
    console.log(`   • ${r.source.padEnd(20)} - ${streamInfo?.sourcesCount} sources, ${streamInfo?.qualities.join('/')} (${r.duration}ms)`);
  });

  console.log(`\n⚠️ Partial (Search works, streaming failed) (${partiallyWorking.length}):`);
  partiallyWorking.forEach(r => {
    console.log(`   • ${r.source.padEnd(20)} - ${r.errors.join(', ')}`);
  });

  console.log(`\n❌ Not Working (${notWorking.length}):`);
  notWorking.forEach(r => {
    console.log(`   • ${r.source.padEnd(20)} - ${r.errors.join(', ')}`);
  });

  // Statistics
  console.log('\n' + '═'.repeat(70));
  console.log('📈 STATISTICS');
  console.log('═'.repeat(70));
  console.log(`Total Sources Tested: ${ALL_SOURCES.length}`);
  console.log(`Fully Working: ${fullyWorking.length} (${Math.round(fullyWorking.length / ALL_SOURCES.length * 100)}%)`);
  console.log(`Partially Working: ${partiallyWorking.length} (${Math.round(partiallyWorking.length / ALL_SOURCES.length * 100)}%)`);
  console.log(`Not Working: ${notWorking.length} (${Math.round(notWorking.length / ALL_SOURCES.length * 100)}%)`);

  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  console.log(`Average Test Duration: ${Math.round(avgDuration)}ms`);

  // Stream format analysis
  const m3u8Count = results.filter(r => r.streamDetails?.hasM3U8).length;
  const mp4Count = results.filter(r => r.streamDetails?.hasMp4).length;
  console.log(`\nStream Formats:`);
  console.log(`  • M3U8 (HLS): ${m3u8Count} sources`);
  console.log(`  • MP4 (Direct): ${mp4Count} sources`);

  // Save detailed results
  const fs = await import('fs');
  const reportPath = './streaming-test-results.json';
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    apiBase: API_BASE,
    testAnime: TEST_ANIME,
    summary: {
      total: ALL_SOURCES.length,
      fullyWorking: fullyWorking.length,
      partiallyWorking: partiallyWorking.length,
      notWorking: notWorking.length,
      successRate: Math.round(fullyWorking.length / ALL_SOURCES.length * 100)
    },
    results
  }, null, 2));

  console.log(`\n📁 Detailed results saved to: ${reportPath}`);
  console.log('\n' + '═'.repeat(70));
}

runStreamingTests().catch(console.error);

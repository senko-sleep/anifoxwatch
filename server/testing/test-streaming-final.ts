/**
 * Final Streaming Test - Validates that streaming URLs are working
 * This test verifies the complete flow from search to playable stream
 */

import axios from 'axios';
import { AnimeKaiSource } from '../src/sources/animekai-source.js';

interface TestResult {
    anime: string;
    episodeId: string;
    server: string;
    success: boolean;
    streamUrl?: string;
    streamValid?: boolean;
    subtitles?: number;
    error?: string;
}

async function validateStreamUrl(url: string, headers?: Record<string, string>): Promise<boolean> {
    try {
        const response = await axios.head(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                ...headers
            },
            timeout: 10000,
            maxRedirects: 5
        });
        return response.status === 200;
    } catch (error: any) {
        // Try GET request if HEAD fails
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    ...headers
                },
                timeout: 10000,
                maxRedirects: 5,
                responseType: 'stream'
            });
            response.data.destroy(); // Close the stream
            return response.status === 200;
        } catch {
            return false;
        }
    }
}

async function testAnimeStreaming(source: AnimeKaiSource, animeId: string, animeName: string): Promise<TestResult> {
    const result: TestResult = {
        anime: animeName,
        episodeId: '',
        server: 'hd-2',
        success: false
    };

    try {
        // Get episodes
        const episodes = await source.getEpisodes(animeId);
        if (episodes.length === 0) {
            result.error = 'No episodes found';
            return result;
        }

        result.episodeId = episodes[0].id || '';

        // Get streaming links
        const streamData = await source.getStreamingLinks(result.episodeId, undefined, 'sub');

        if (streamData.sources.length === 0) {
            result.error = 'No streaming sources found';
            return result;
        }

        result.streamUrl = streamData.sources[0].url;
        result.subtitles = streamData.subtitles?.length || 0;

        // Validate the stream URL is accessible
        console.log(`   Validating stream URL...`);
        result.streamValid = await validateStreamUrl(result.streamUrl, streamData.headers);

        result.success = result.streamValid;
        return result;

    } catch (error: any) {
        result.error = error.message;
        return result;
    }
}

async function main() {
    console.log('='.repeat(70));
    console.log('FINAL STREAMING VALIDATION TEST');
    console.log('='.repeat(70));
    console.log('\nThis test validates that streaming URLs are actually accessible.\n');

    const source = new AnimeKaiSource();

    // Health check first
    console.log('📍 Health Check...');
    const healthy = await source.healthCheck();
    console.log(`   Status: ${healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}\n`);

    if (!healthy) {
        console.log('❌ Source is not healthy. Cannot proceed with tests.');
        return;
    }

    // Test multiple anime
    const testCases = [
        { id: '', q: 'one piece', name: 'One Piece' },
        { id: '', q: 'naruto', name: 'Naruto' },
    ];

    const results: TestResult[] = [];

    for (const testCase of testCases) {
        console.log(`\n📍 Testing: ${testCase.name}`);
        const sr = await source.search(testCase.q, 1);
        const aid = sr.results[0]?.id;
        if (!aid) {
            results.push({
                anime: testCase.name,
                episodeId: '',
                server: 'hd-2',
                success: false,
                error: 'No search result',
            });
            continue;
        }
        console.log(`   Anime ID: ${aid}`);

        const result = await testAnimeStreaming(source, aid, testCase.name);
        results.push(result);

        if (result.success) {
            console.log(`   ✅ SUCCESS`);
            console.log(`   Episode: ${result.episodeId}`);
            console.log(`   Stream URL: ${result.streamUrl?.substring(0, 60)}...`);
            console.log(`   Stream Valid: ${result.streamValid ? 'Yes' : 'No'}`);
            console.log(`   Subtitles: ${result.subtitles}`);
        } else {
            console.log(`   ❌ FAILED: ${result.error}`);
        }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('TEST SUMMARY');
    console.log('='.repeat(70));

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\n   Total Tests: ${results.length}`);
    console.log(`   ✅ Successful: ${successful}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   Success Rate: ${((successful / results.length) * 100).toFixed(1)}%`);

    if (successful > 0) {
        console.log('\n   🎉 STREAMING IS WORKING!');
        console.log('   The deep scraping implementation successfully extracts playable stream URLs.');
    } else {
        console.log('\n   ⚠️ All tests failed. Check the error messages above.');
    }

    // Print failed tests
    if (failed > 0) {
        console.log('\n   Failed Tests:');
        results.filter(r => !r.success).forEach(r => {
            console.log(`     - ${r.anime}: ${r.error}`);
        });
    }

    console.log('\n' + '='.repeat(70));
}

main().catch(console.error);

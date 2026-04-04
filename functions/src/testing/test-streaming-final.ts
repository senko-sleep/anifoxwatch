/**
 * Final Streaming Test - AnimeKai
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
            headers: { 'User-Agent': 'Mozilla/5.0', ...headers },
            timeout: 10000,
            maxRedirects: 5,
        });
        return response.status === 200;
    } catch {
        try {
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0', ...headers },
                timeout: 10000,
                maxRedirects: 5,
                responseType: 'stream',
            });
            response.data.destroy();
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
        server: 'default',
        success: false,
    };

    try {
        const episodes = await source.getEpisodes(animeId);
        if (episodes.length === 0) {
            result.error = 'No episodes found';
            return result;
        }

        result.episodeId = episodes[0].id || '';
        const streamData = await source.getStreamingLinks(result.episodeId, undefined, 'sub');

        if (streamData.sources.length === 0) {
            result.error = 'No streaming sources found';
            return result;
        }

        result.streamUrl = streamData.sources[0].url;
        result.subtitles = streamData.subtitles?.length || 0;
        result.streamValid = await validateStreamUrl(result.streamUrl, streamData.headers);
        result.success = result.streamValid;
        return result;
    } catch (error: unknown) {
        result.error = error instanceof Error ? error.message : String(error);
        return result;
    }
}

async function main() {
    const source = new AnimeKaiSource();
    const testCases = [
        { q: 'one piece', name: 'One Piece' },
        { q: 'naruto', name: 'Naruto' },
    ];

    for (const tc of testCases) {
        console.log(`\n📍 ${tc.name}`);
        const sr = await source.search(tc.q, 1);
        const aid = sr.results[0]?.id;
        if (!aid) {
            console.log('   no search');
            continue;
        }
        const r = await testAnimeStreaming(source, aid, tc.name);
        console.log(r.success ? '   ✅' : `   ❌ ${r.error}`);
    }
}

main().catch(console.error);

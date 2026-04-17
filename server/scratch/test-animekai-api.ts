// Test what AnimeKai's actual API endpoints look like
async function test(label: string, url: string) {
    try {
        const r = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://animekai.to/',
            },
            signal: AbortSignal.timeout(8000)
        });
        const text = await r.text();
        let preview = text.substring(0, 200);
        console.log(`[${r.status}] ${label}: ${preview}\n`);
    } catch (e: any) {
        console.log(`[ERR] ${label}: ${e.message}\n`);
    }
}

// Test episode ID from logs: spy-x-family-season-3-v2q8$ep=1$token=c9m5qvHjvRW7mn4ey5SA
const epId = 'spy-x-family-season-3-v2q8$ep=1$token=c9m5qvHjvRW7mn4ey5SA';
const slug = 'spy-x-family-season-3-v2q8';

await test('Search', `https://animekai.to/browser?keyword=spy+x+family`);
await test('API Search', `https://animekai.to/api/search?keyword=spy+x+family`);
await test('Anime page', `https://animekai.to/watch/${slug}`);
await test('Anime API', `https://animekai.to/api/anime/${slug}`);
await test('Episode sources raw', `https://animekai.to/api/episode/sources?id=${encodeURIComponent(epId)}`);
await test('Episode list', `https://animekai.to/api/episodes?aid=${slug}`);
